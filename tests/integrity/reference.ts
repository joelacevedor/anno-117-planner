/**
 * Copia de referencia de la partida para la suite de integridad.
 *
 *  - Vive fuera del repositorio: $PRAEFECTUS_REF o ~/.praefectus/referencia.json.
 *  - Se prepara con `pnpm integrity:prepare <copia-exportada.json>`, que quita el código de la
 *    partida compartida. Si la copia aún tiene código, la suite se niega a usarla.
 *  - Nunca se imprime: los mensajes de error solo dicen la ruta del dato.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const REF_PATH = process.env.PRAEFECTUS_REF || join(homedir(), ".praefectus", "referencia.json");

export type RefCheck = { ok: true; raw: string } | { ok: false; reason: string };

export function checkReference(path = REF_PATH): RefCheck {
  if (!existsSync(path)) return { ok: false, reason: `No está la copia de referencia (${path}). Prepárala con: pnpm integrity:prepare <copia-exportada.json>` };
  const raw = readFileSync(path, "utf8");
  let o: { session?: { code?: unknown } | null; islands?: unknown };
  try { o = JSON.parse(raw); } catch { return { ok: false, reason: "La copia de referencia no es JSON válido." }; }
  if (o?.session && (o.session as { code?: unknown }).code) return { ok: false, reason: "La copia de referencia lleva el código de la partida compartida. Vuelve a prepararla con pnpm integrity:prepare." };
  if (!Array.isArray(o?.islands) || !o.islands.length) return { ok: false, reason: "La copia de referencia no tiene islas." };
  return { ok: true, raw };
}

export function loadReference(): string {
  const r = checkReference();
  if (!r.ok) throw new Error(r.reason);
  return r.raw;
}
