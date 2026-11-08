// Prueba de extremo a extremo contra `wrangler dev` (runtime real de Cloudflare) y un Firebase simulado.
// Uso: ver mcp-worker/README.md («Probar en local»). Hace lo mismo que ChatGPT y usa el cliente MCP oficial.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const O = process.env.ORIGIN ?? "http://localhost:8787", RED = "https://chatgpt.com/connector_platform_oauth_redirect";
const CODE = process.env.CODE ?? "KQ7XA-M3TZP";
const b64 = (b) => Buffer.from(b).toString("base64url");
const check = (ok, msg) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) process.exitCode = 1; };

const unauth = await fetch(`${O}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check(unauth.status === 401 && unauth.headers.get("www-authenticate")?.includes("resource_metadata"), "401 + resource_metadata sin token");
const reg = await (await fetch(`${O}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [RED], token_endpoint_auth_method: "client_secret_post", grant_types: ["authorization_code", "refresh_token"] }) })).json();
check(!!reg.client_id && !!reg.client_secret, "registro dinámico (cliente confidencial)");
const ver = b64(crypto.getRandomValues(new Uint8Array(32))), ch = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ver))));
const page = await fetch(`${O}/authorize?` + new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: RED, code_challenge: ch, code_challenge_method: "S256", state: "s", scope: "praefectus.read", resource: `${O}/mcp` }));
const html = await page.text(); const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
check(page.status === 200 && !!handle, "página de conexión");
const post = (f) => fetch(`${O}/authorize`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie }, body: new URLSearchParams({ handle, ...f }) });
const conf = await (await post({ step: "lookup", code: CODE })).text();
check(conf.includes("Hispania"), "confirmación muestra las islas");
const ap = await post({ step: "approve", decision: "approve", code: conf.match(/name="code" value="([^"]+)"/)?.[1] ?? "" });
const loc = new URL(ap.headers.get("location"));
check(loc.origin + loc.pathname === RED && loc.searchParams.get("iss") === O, "redirección a ChatGPT con iss");
const tok = await (await fetch(`${O}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: loc.searchParams.get("code"), redirect_uri: RED, client_id: reg.client_id, client_secret: reg.client_secret, code_verifier: ver, resource: `${O}/mcp` }) })).json();
check(tok.token_type?.toLowerCase() === "bearer" && tok.scope === "praefectus.read", "token de solo lectura");
const client = new Client({ name: "e2e", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${O}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
check(client.getServerVersion()?.name === "praefectus", "initialize");
const tools = (await client.listTools()).tools;
check(tools.length === 3 && tools.every((t) => t.annotations?.readOnlyHint), `tools/list: ${tools.map((t) => t.name).join(", ")}`);
const r = await client.callTool({ name: "get_island", arguments: { island: "Hispania" } });
check(!r.isError && r.content[0].text.startsWith("Hispania"), `get_island → ${r.content[0].text.slice(0, 160)}…`);
await client.close();
process.exit();
