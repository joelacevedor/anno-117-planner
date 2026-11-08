/**
 * Banco de pruebas: KV en memoria, un Firebase simulado (Auth anónimo + Firestore REST con las mismas
 * reglas que firestore.rules) y un cliente que hace lo mismo que ChatGPT (registro, PKCE, token, MCP).
 */
import { vi } from "vitest";
import { toRemote } from "../../src/sync/model";
import type { State } from "../../src/core/state";
import worker from "../src/index";
import type { Env } from "../src/config";
import { resetSessionCache } from "../src/firebase";

export const ORIGIN = "https://praefectus-mcp-test.example.workers.dev";
export const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

// ── KV ───────────────────────────────────────────────────────────────────
export class MemoryKV {
  store = new Map<string, { value: string; exp?: number }>();
  private alive(k: string) {
    const e = this.store.get(k);
    if (!e) return null;
    if (e.exp && e.exp * 1000 <= Date.now()) { this.store.delete(k); return null; }
    return e;
  }
  async get(key: string, opts?: unknown) {
    const e = this.alive(key);
    if (!e) return null;
    const type = typeof opts === "string" ? opts : (opts as { type?: string } | undefined)?.type;
    return type === "json" ? JSON.parse(e.value) : e.value;
  }
  async put(key: string, value: string, opts?: { expiration?: number; expirationTtl?: number }) {
    const exp = opts?.expiration ?? (opts?.expirationTtl ? Math.floor(Date.now() / 1000) + opts.expirationTtl : undefined);
    this.store.set(key, { value: String(value), exp });
  }
  async delete(key: string) { this.store.delete(key); }
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.store.keys()].filter((k) => this.alive(k) && k.startsWith(opts.prefix ?? "")).sort();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const limit = opts.limit ?? 1000;
    const page = keys.slice(start, start + limit);
    const done = start + limit >= keys.length;
    return { keys: page.map((name) => ({ name, expiration: this.store.get(name)?.exp })), list_complete: done, cursor: done ? undefined : String(start + limit) };
  }
  dump() { return [...this.store.entries()].map(([k, v]) => `${k}=${v.value}`).join("\n"); }
}

// ── Firestore: JSON → valores REST ───────────────────────────────────────
export function encode(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, encode(x)])) } };
}

export type FakeGame = { meta: Record<string, unknown>; islands: Record<string, Record<string, unknown>> };

/** Firebase simulado. Reglas: solo con sesión válida y solo dentro de games/{código con formato válido}; sin listar /games. */
export class FakeFirebase {
  games = new Map<string, FakeGame>();
  tokens = new Set<string>();
  signUps = 0;
  requests: string[] = [];
  down = false;
  private n = 0;

  addGame(code: string, state: State, extraMeta: Record<string, unknown> = {}) {
    const r = toRemote(state, { u1: "Joel", u2: "Ale" });
    this.games.set(code, { meta: { ...r.meta, ...extraMeta } as Record<string, unknown>, islands: r.islands as unknown as Record<string, Record<string, unknown>> });
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    this.requests.push(url.pathname + url.search);
    if (this.down) return new Response("unavailable", { status: 503 });
    if (url.host === "identitytoolkit.googleapis.com" && url.pathname === "/v1/accounts:signUp") {
      this.signUps++;
      return Response.json({ idToken: this.issue(), refreshToken: `r${this.n}`, expiresIn: "3600" });
    }
    if (url.host === "securetoken.googleapis.com" && url.pathname === "/v1/token") {
      return Response.json({ id_token: this.issue(), refresh_token: `r${this.n}`, expires_in: "3600" });
    }
    if (url.host === "firestore.googleapis.com") {
      const auth = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
      if (!auth || !this.tokens.has(auth)) return new Response("{}", { status: 403 });
      const m = url.pathname.match(/^\/v1\/projects\/test-project\/databases\/\(default\)\/documents\/(.*)$/);
      if (!m) return new Response("{}", { status: 404 });
      const parts = m[1].split("/");
      if (parts[0] !== "games" || !parts[1] || !/^[A-Z2-9]{10}$/.test(parts[1])) return new Response("{}", { status: 403 }); // reglas
      const g = this.games.get(parts[1]);
      const name = (p: string) => `projects/test-project/databases/(default)/documents/${p}`;
      if (parts.length === 2) {
        if (!g) return new Response("{}", { status: 404 });
        return Response.json({ name: name(`games/${parts[1]}`), fields: { meta: encode(g.meta) }, updateTime: "2026-11-07T20:00:00Z" });
      }
      if (parts.length === 3 && parts[2] === "islands") {
        return Response.json({ documents: Object.entries(g?.islands ?? {}).map(([id, d]) => ({ name: name(`games/${parts[1]}/islands/${id}`), fields: (encode(d) as { mapValue: { fields: object } }).mapValue.fields, updateTime: "2026-11-07T21:00:00Z" })) });
      }
      return new Response("{}", { status: 404 });
    }
    return new Response("not mocked", { status: 599 });
  };
  private issue() { const t = `id-${++this.n}`; this.tokens.add(t); return t; }
}

// ── Entorno y cliente ────────────────────────────────────────────────────
export function makeEnv(kv: MemoryKV, scope: Env["GAME_SCOPE"] = "preview", origin = ORIGIN): Env {
  return {
    OAUTH_KV: kv as unknown as KVNamespace, OAUTH_PROVIDER: undefined as never,
    FIREBASE_API_KEY: "test-key", FIREBASE_PROJECT_ID: "test-project",
    PUBLIC_ORIGIN: origin, GAME_SCOPE: scope, GRANT_SECRET: "s".repeat(40),
  };
}

export function setup(fb: FakeFirebase) {
  resetSessionCache();
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return u.startsWith(ORIGIN) ? real(input, init) : fb.fetch(input, init);
  });
}

const ctx = () => ({ waitUntil: () => {}, passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;
export const call = (env: Env, req: Request) => worker.fetch(req, env, ctx());

const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Cookies que el navegador devolvería. */
const cookiesOf = (r: Response) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

/** Hace lo mismo que ChatGPT: registrarse, abrir /authorize, escribir el código, aprobar y canjear el token. */
export async function connect(env: Env, code: string, opts: { clientName?: string; deny?: boolean; stopAt?: "page" | "confirm" } = {}) {
  const reg = await call(env, new Request(`${ORIGIN}/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: opts.clientName ?? "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  }));
  const client = (await reg.json()) as { client_id: string };
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st4te", scope: "praefectus.read", resource: `${ORIGIN}/mcp` });
  const page = await call(env, new Request(`${ORIGIN}/authorize?${q}`));
  const pageHtml = await page.text();
  const cookie = cookiesOf(page);
  const handle = pageHtml.match(/name="handle" value="([^"]+)"/)?.[1] ?? "";
  if (opts.stopAt === "page") return { page, pageHtml, handle, cookie, client };
  const post = (fields: Record<string, string>) => call(env, new Request(`${ORIGIN}/authorize`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, "CF-Connecting-IP": "203.0.113.7" }, body: new URLSearchParams({ handle, ...fields }),
  }));
  if (opts.deny) return { denied: await post({ step: "lookup", decision: "deny" }) };
  const confirm = await post({ step: "lookup", code });
  const confirmHtml = await confirm.text();
  if (opts.stopAt === "confirm" || confirm.status !== 200 || !confirmHtml.includes('value="approve"')) return { confirm, confirmHtml };
  const approved = await post({ step: "approve", decision: "approve", code: confirmHtml.match(/name="code" value="([^"]+)"/)![1] });
  const location = new URL(approved.headers.get("Location")!);
  const tok = await call(env, new Request(`${ORIGIN}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: location.searchParams.get("code")!, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier, resource: `${ORIGIN}/mcp` }),
  }));
  const tokens = (await tok.json()) as { access_token: string; refresh_token: string; scope: string; token_type: string };
  return { confirmHtml, location, tokens, client, approved };
}

let rpcId = 0;
/** Llamada JSON-RPC a /mcp como la hace un cliente MCP (Streamable HTTP). */
export async function mcp(env: Env, token: string | null, method: string, params: unknown = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await call(env, new Request(`${ORIGIN}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) }));
  const text = await res.text();
  let body: { result?: Record<string, unknown>; error?: unknown } | null = null;
  try { body = JSON.parse(text); } catch { /* 401 sin JSON */ }
  return { res, text, body };
}

export const tool = async (env: Env, token: string, name: string, args: Record<string, unknown>) => {
  await mcp(env, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  const r = await mcp(env, token, "tools/call", { name, arguments: args });
  return { ...r, result: r.body?.result as { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean } | undefined };
};
