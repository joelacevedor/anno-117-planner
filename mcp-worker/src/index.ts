/**
 * Praefectus · servidor MCP remoto de SOLO LECTURA para ChatGPT (Cloudflare Worker).
 *
 *  /mcp                     herramientas MCP (Streamable HTTP, sin estado) — requiere token OAuth
 *  /authorize               conexión: código de la partida → confirmar → permiso de solo lectura
 *  /oauth/token, /register  OAuth 2.1 (PKCE S256, registro dinámico) — los sirve la librería
 *  /.well-known/*           metadatos OAuth (RFC 8414 / RFC 9728)
 *  /disconnect              retirar todos los permisos de una partida
 *
 * Seguridad:
 *  - El código de la partida solo vive en el Worker: va cifrado dentro del permiso (props) y nunca
 *    se devuelve a ChatGPT ni se escribe en los registros.
 *  - El acceso a Firestore es el de un jugador (sesión anónima + reglas actuales); no hay credenciales
 *    de administrador y el Worker no tiene ninguna función de escritura.
 *  - GAME_SCOPE limita qué partidas se pueden conectar: "preview" (solo partidas de la versión de prueba),
 *    "real" (solo partidas reales) o "any" (solo para pruebas locales).
 */
import OAuthProvider, {
  AuthorizationError, CimdFetchError, insufficientScope, type OAuthResourceAuth,
} from "@cloudflare/workers-oauth-provider";
import { parseCode } from "../../src/sync/model";
import { readGame, UpstreamError } from "./firebase";
import { createMcpServer } from "./mcp";
import { SCOPE_READ, scopeAllows, type Env, type Props } from "./config";
import { codeForm, confirmForm, disconnectForm, home, message, SECURITY_HEADERS, type ConsentInfo } from "./pages";

export type { Env, Props };

// ── Utilidades ───────────────────────────────────────────────────────────

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identificador interno de una partida para los permisos: no revela el código. */
export async function gameUserId(env: Env, code: string) {
  if (!env.GRANT_SECRET || env.GRANT_SECRET.length < 32) throw new Error("GRANT_SECRET missing or too short");
  return "g" + (await hmacHex(env.GRANT_SECRET, `game:${code}`)).slice(0, 40);
}

/** Límite de intentos por IP y propósito (frena que alguien pruebe códigos). */
async function limited(env: Env, request: Request, purpose: string, max: number) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const key = `rl:${purpose}:${await hmacHex(env.GRANT_SECRET, ip)}`;
  const n = Number((await env.OAUTH_KV.get(key)) ?? "0");
  if (n >= max) return true;
  await env.OAUTH_KV.put(key, String(n + 1), { expirationTtl: 600 });
  return false;
}

const scopeLabel = (env: Env) =>
  env.GAME_SCOPE === "real" ? undefined
  : env.GAME_SCOPE === "any" ? "Servidor de pruebas local."
  : "Servidor de pruebas: solo acepta partidas creadas en la versión de prueba de Praefectus.";

const html = (body: string, status = 200, extra?: Headers) => {
  const h = new Headers(SECURITY_HEADERS);
  extra?.forEach((v, k) => { if (k.toLowerCase() !== "content-type") h.set(k, v); });
  return new Response(body, { status, headers: h });
};

type GameCheck = { ok: true; players: string[]; islands: { name: string; region: string }[]; preview: boolean } | { ok: false; error: string };

async function checkGame(env: Env, code: string): Promise<GameCheck> {
  let read;
  try {
    read = await readGame(env, code);
  } catch (e) {
    console.error(JSON.stringify({ ev: "firestore_error", status: e instanceof UpstreamError ? e.status : 0 }));
    return { ok: false, error: "No se ha podido leer la partida ahora mismo. Inténtalo de nuevo en unos minutos." };
  }
  if (!read) return { ok: false, error: "No existe ninguna partida con ese código." };
  const meta = (read.game.data.meta ?? {}) as { players?: Record<string, string>; preview?: boolean };
  const preview = meta.preview === true;
  if (!scopeAllows(env, preview))
    return { ok: false, error: preview ? "Este servidor solo acepta partidas reales." : "Este servidor de pruebas solo acepta partidas creadas en la versión de prueba de Praefectus." };
  const islands = read.islands
    .map((d) => ({ name: String(d.data.name ?? d.id), region: String(d.data.region ?? ""), order: Number(d.data.order ?? 0) }))
    .sort((a, b) => a.order - b.order);
  return { ok: true, players: Object.values(meta.players ?? {}).map(String), islands, preview };
}

// ── /authorize ───────────────────────────────────────────────────────────

const consentKey = async (handle: string) => `consent-info:${await hmacHex("consent", handle)}`;

async function authorize(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === "GET") {
      const req = await oauth.parseAuthRequest(request);
      const d = await oauth.describeConsent(req);
      const consent = await oauth.beginConsent(req);
      const info: ConsentInfo = { clientName: d.clientName, clientDomain: d.clientDomain, redirectHost: d.redirectHost, redirectIsLoopback: d.redirectIsLoopback, scope: [SCOPE_READ] };
      await env.OAUTH_KV.put(await consentKey(consent.handle), JSON.stringify(info), { expirationTtl: 900 });
      return html(codeForm(info, consent.handle, undefined, scopeLabel(env)), 200, consent.headers);
    }
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const form = await request.formData();
    const handle = String(form.get("handle") ?? "");
    const decision = String(form.get("decision") ?? "");
    const step = String(form.get("step") ?? "");
    const stored = await env.OAUTH_KV.get(await consentKey(handle));
    if (!handle || !stored) return html(message("Conexión caducada", "La página ha caducado. Vuelve a ChatGPT e inicia la conexión de nuevo."), 400);
    const info = JSON.parse(stored) as ConsentInfo;

    if (decision === "deny") {
      const denied = await oauth.denyConsent(request, handle);
      await env.OAUTH_KV.delete(await consentKey(handle));
      return new Response(null, { status: 302, headers: denied.headers });
    }

    if (await limited(env, request, "code", 12))
      return html(codeForm(info, handle, "Demasiados intentos. Espera 10 minutos.", scopeLabel(env)), 429);
    const code = parseCode(String(form.get("code") ?? ""));
    if (!code) return html(codeForm(info, handle, "El código tiene 10 letras y números (por ejemplo KQ7XA-M3TZP).", scopeLabel(env)), 400);
    const game = await checkGame(env, code);
    if (!game.ok) return html(codeForm(info, handle, game.error, scopeLabel(env)), 400);

    if (step !== "approve" || decision !== "approve")
      return html(confirmForm(info, handle, code, game.players, game.islands, game.preview));

    // Aprobado: solo lectura, sea cual sea lo que pidiera el cliente.
    const approved = await oauth.approveConsent(request, handle, { scope: [SCOPE_READ] });
    const label = `${game.players.join(", ") || "partida"} · ${game.islands.length} islas`;
    const props: Props = { code, label, grantedAt: Date.now() };
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: await gameUserId(env, code),
      metadata: { label, preview: game.preview },
      scope: [SCOPE_READ],
      props,
    });
    await env.OAUTH_KV.delete(await consentKey(handle));
    console.log(JSON.stringify({ ev: "grant", game: (await gameUserId(env, code)).slice(0, 9), preview: game.preview }));
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError) return html(message("No se puede conectar", error.description), 400);
    if (error instanceof CimdFetchError) return html(message("No se puede conectar", "No se ha podido verificar la aplicación."), 400);
    throw error;
  }
}

// ── /disconnect ──────────────────────────────────────────────────────────

/** Revoca todos los permisos concedidos para una partida. Devuelve cuántos había. */
export async function revokeGame(env: Env, code: string) {
  const userId = await gameUserId(env, code);
  let n = 0;
  let cursor: string | undefined;
  do {
    const list = await env.OAUTH_PROVIDER.listUserGrants(userId, { cursor });
    for (const g of list.items) { await env.OAUTH_PROVIDER.revokeGrant(g.id, userId); n++; }
    cursor = list.cursor;
  } while (cursor);
  return n;
}

async function disconnect(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return html(disconnectForm());
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (await limited(env, request, "disconnect", 12)) return html(disconnectForm({ ok: false, text: "Demasiados intentos. Espera 10 minutos." }), 429);
  const form = await request.formData();
  const code = parseCode(String(form.get("code") ?? ""));
  if (!code) return html(disconnectForm({ ok: false, text: "El código no es válido." }), 400);
  const n = await revokeGame(env, code);
  console.log(JSON.stringify({ ev: "disconnect", grants: n }));
  return html(disconnectForm({ ok: true, text: n ? `Listo: se han retirado ${n} permiso(s). ChatGPT ya no puede leer esta partida.` : "No había ningún permiso activo para esa partida." }));
}

// ── /mcp ─────────────────────────────────────────────────────────────────

type ApiCtx = ExecutionContext & { props: Props; auth: OAuthResourceAuth };

export const mcpHandler = {
  async fetch(request: Request, env: Env, ctx: ApiCtx): Promise<Response> {
    if (!ctx.auth.scope.includes(SCOPE_READ)) return insufficientScope(ctx.auth, [SCOPE_READ]);
    // Sin estado: no hay canal SSE de servidor a cliente (GET) ni sesiones que cerrar (DELETE).
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const server = createMcpServer(env, ctx.props);
    const { WebStandardStreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/authorize") return authorize(request, env);
    if (pathname === "/disconnect") return disconnect(request, env);
    if (pathname === "/" && request.method === "GET") return html(home(env.PUBLIC_ORIGIN));
    return new Response("Not Found", { status: 404 });
  },
};

// El proveedor necesita el origen público al construirse; se crea una vez por origen.
const providers = new Map<string, OAuthProvider<Env>>();
export function providerFor(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpHandler as never,
      defaultHandler: defaultHandler as never,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/register",
      scopesSupported: [SCOPE_READ],
      requiredScopes: [SCOPE_READ],
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin], resource_name: "Praefectus (solo lectura)" },
      accessTokenTTL: 3600,
      refreshTokenTTL: 30 * 24 * 3600,
    });
    providers.set(origin, p);
  }
  return p;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!env.PUBLIC_ORIGIN) return new Response("PUBLIC_ORIGIN not configured", { status: 500 });
    const origin = env.PUBLIC_ORIGIN.replace(/\/$/, "");
    if (new URL(request.url).origin !== origin) return new Response("Wrong host", { status: 421 });
    return providerFor(origin).fetch(request, env, ctx);
  },
};
