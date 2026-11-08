/**
 * Acceso de solo lectura a Firestore como un jugador más.
 *
 * El Worker abre su propia sesión anónima de Firebase (igual que la app al pulsar «Jugar con un amigo»)
 * y lee por la API REST con las reglas de seguridad de siempre. No hay cuenta de servicio ni
 * credenciales de administrador: el Worker no puede hacer nada que no pueda hacer un jugador.
 *
 * Este módulo solo LEE. No existe ninguna función de escritura.
 */

export type FirebaseEnv = {
  FIREBASE_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Si la clave web está restringida por dominio, la web de la app (p. ej. https://anno117-cadenas.web.app/). */
  FIREBASE_REFERER?: string;
  /** Solo pruebas: emuladores o servidores simulados. */
  AUTH_BASE?: string;
  TOKEN_BASE?: string;
  FIRESTORE_BASE?: string;
  OAUTH_KV: KVNamespace;
};

/** Mismo alfabeto que src/sync/model.ts: 10 caracteres sin 0, 1, I ni O. */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

type Session = { idToken: string; refreshToken: string; exp: number };
let memory: Session | null = null;
const SESSION_KEY = "praefectus:firebase-session";

const authBase = (env: FirebaseEnv) => env.AUTH_BASE ?? "https://identitytoolkit.googleapis.com";
const tokenBase = (env: FirebaseEnv) => env.TOKEN_BASE ?? "https://securetoken.googleapis.com";
const firestoreBase = (env: FirebaseEnv) => env.FIRESTORE_BASE ?? "https://firestore.googleapis.com";

function headers(env: FirebaseEnv, extra: Record<string, string> = {}) {
  const h: Record<string, string> = { ...extra };
  if (env.FIREBASE_REFERER) h.Referer = env.FIREBASE_REFERER;
  return h;
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function signUp(env: FirebaseEnv): Promise<Session> {
  const r = await fetch(`${authBase(env)}/v1/accounts:signUp?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: headers(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new UpstreamError(`Firebase signUp ${r.status}`, r.status);
  const j = (await r.json()) as { idToken: string; refreshToken: string; expiresIn: string };
  return { idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + Number(j.expiresIn) * 1000 };
}

async function refresh(env: FirebaseEnv, refreshToken: string): Promise<Session | null> {
  const r = await fetch(`${tokenBase(env)}/v1/token?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: headers(env, { "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { id_token: string; refresh_token: string; expires_in: string };
  return { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + Number(j.expires_in) * 1000 };
}

/**
 * Token de la sesión anónima del Worker. Se reutiliza la misma sesión (guardada en KV) para no crear
 * un usuario anónimo nuevo en Firebase cada vez que arranca el Worker.
 */
export async function idToken(env: FirebaseEnv): Promise<string> {
  const fresh = (s: Session | null) => !!s && s.exp - Date.now() > 5 * 60_000;
  if (fresh(memory)) return memory!.idToken;
  let s: Session | null = null;
  const stored = memory?.refreshToken ?? (await env.OAUTH_KV.get(SESSION_KEY));
  if (stored) s = await refresh(env, stored);
  if (!s) s = await signUp(env);
  memory = s;
  if (s.refreshToken !== stored) await env.OAUTH_KV.put(SESSION_KEY, s.refreshToken);
  return s.idToken;
}

/** Solo pruebas. */
export const resetSessionCache = () => { memory = null; };

// ── Valores de Firestore (REST) → JSON ────────────────────────────────────

type FsValue = Record<string, unknown>;
export function decodeValue(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
}
export const decodeFields = (fields: Record<string, FsValue>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export type Doc = { id: string; data: Record<string, unknown>; updateTime: string };

async function get(env: FirebaseEnv, path: string): Promise<Response> {
  const token = await idToken(env);
  return fetch(`${firestoreBase(env)}/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${path}`, {
    headers: headers(env, { Authorization: `Bearer ${token}` }),
  });
}

const toDoc = (d: { name: string; fields?: Record<string, FsValue>; updateTime: string }): Doc => ({
  id: d.name.split("/").pop()!,
  data: decodeFields(d.fields ?? {}),
  updateTime: d.updateTime,
});

/** Documento de la partida, o null si no existe. El código se valida antes de construir la ruta. */
export async function readGame(env: FirebaseEnv, code: string): Promise<{ game: Doc; islands: Doc[] } | null> {
  if (!CODE_RE.test(code)) return null;
  const r = await get(env, `games/${code}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new UpstreamError(`Firestore game ${r.status}`, r.status);
  const game = toDoc(await r.json());
  const islands: Doc[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const ri = await get(env, `games/${code}/islands?${q}`);
    if (!ri.ok) throw new UpstreamError(`Firestore islands ${ri.status}`, ri.status);
    const j = (await ri.json()) as { documents?: { name: string; fields?: Record<string, FsValue>; updateTime: string }[]; nextPageToken?: string };
    for (const d of j.documents ?? []) islands.push(toDoc(d));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return { game, islands };
}
