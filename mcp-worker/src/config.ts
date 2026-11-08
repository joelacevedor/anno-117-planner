import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { FirebaseEnv } from "./firebase";

export type Env = FirebaseEnv & {
  OAUTH_PROVIDER: OAuthHelpers;
  /** Origen público del Worker, p. ej. https://praefectus-mcp-test.<cuenta>.workers.dev */
  PUBLIC_ORIGIN: string;
  /** "preview": solo partidas de la versión de prueba · "real": solo partidas reales · "any": solo pruebas locales. */
  GAME_SCOPE: "preview" | "real" | "any";
  /** Hosts a los que se puede devolver el permiso (por defecto, solo chatgpt.com). */
  ALLOWED_REDIRECT_HOSTS?: string;
  /** Secreto (32+ caracteres) para derivar el identificador interno de cada partida. */
  GRANT_SECRET: string;
};

/** Lo que se guarda (cifrado) en cada permiso. El código nunca sale del Worker. */
export type Props = { code: string; label: string; grantedAt: number };

/** ¿Se puede conectar esta partida con este servidor? */
export function scopeAllows(env: Pick<Env, "GAME_SCOPE">, preview: boolean) {
  if (env.GAME_SCOPE === "any") return true;
  if (env.GAME_SCOPE === "real") return !preview;
  return preview; // "preview" y cualquier valor desconocido: lo más restrictivo para datos reales
}

export const SCOPE_READ = "praefectus.read";
