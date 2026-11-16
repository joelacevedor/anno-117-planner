/**
 * Comprobaciones de integridad: ¿se ha perdido o cambiado algún dato al cargar, migrar o sincronizar?
 * Lógica pura (sin almacenamiento) para usarla en la app y en las pruebas.
 *
 * Se recorre la partida «de antes» hoja a hoja y se mira que cada valor siga igual «después».
 * Los valores neutros (0, null, "", [] y {}) pueden desaparecer: no cambian el cálculo
 * (lo comprueba la suite de integridad con la copia de referencia).
 */

export type Leaf = { path: string; value: unknown };
export type PreservationReport = {
  /** Valores con contenido que han desaparecido o cambiado: nunca debería haber ninguno. */
  lost: { path: string; before: unknown; after: unknown }[];
  /** Valores neutros que se han quitado (normalización). */
  dropped: Leaf[];
};

/** Campos de la partida que no son datos del jugador o que cambian a propósito al cargar. */
const IGNORED_TOP = new Set(["v"]);

export const isNeutral = (v: unknown) =>
  v === 0 || v === null || v === undefined || v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Hojas de una partida. Las islas se nombran por su id (no por su posición) y las listas
 * (necesidades desactivadas, investigaciones, eventos) se comparan enteras.
 */
export function leaves(state: unknown): Leaf[] {
  const out: Leaf[] = [];
  const walk = (v: unknown, path: string) => {
    if (isPlainObject(v) && Object.keys(v).length) {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    } else out.push({ path, value: v });
  };
  if (!isPlainObject(state)) return out;
  for (const [k, v] of Object.entries(state)) {
    if (IGNORED_TOP.has(k)) continue;
    if (k === "islands" && Array.isArray(v)) {
      for (const isl of v) {
        const id = isPlainObject(isl) && typeof isl.id === "string" ? isl.id : "?";
        walk(isl, `islands[${id}]`);
      }
    } else walk(v, k);
  }
  return out;
}

const stable = (v: unknown): string =>
  v && typeof v === "object"
    ? Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v ?? null);

/** Lo que hay en `before` y no está igual en `after`. Lo que `after` añada (valores por defecto) no cuenta. */
export function preservation(before: unknown, after: unknown): PreservationReport {
  const now = new Map(leaves(after).map((l) => [l.path, l.value]));
  const report: PreservationReport = { lost: [], dropped: [] };
  for (const { path, value } of leaves(before)) {
    const has = now.has(path);
    const next = now.get(path);
    if (has && stable(next) === stable(value)) continue;
    if (isNeutral(value)) {
      if (!has || isNeutral(next)) report.dropped.push({ path, value });
      else report.lost.push({ path, before: value, after: next });
      continue;
    }
    report.lost.push({ path, before: value, after: has ? next : undefined });
  }
  return report;
}
