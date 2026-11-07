import { z } from "zod";
import { buildings, chainById, levelById, patronById, events, migrateIds, isKnownRegion, type Region } from "../data/catalog";
import { normalizeSources, sourcesOf, type SupplyValue } from "./supply";

const count = z.number().int().min(0).max(999);
const counts = z.record(z.string().max(40), count);

export const islandSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(40),
    /**
     * Región de la isla. Se acepta cualquier nombre para no perder islas de regiones que esta versión
     * aún no conoce (p. ej. de una versión más nueva en una partida compartida): esas islas se guardan
     * y se sincronizan tal cual, pero no se muestran ni se calculan (ver isKnownRegion).
     */
    region: z.string().min(1).max(24) as unknown as z.ZodType<Region>,
    goals: counts,
    built: counts,
    houses: z.record(z.string().max(16), z.number().int().min(0).max(9999)).default({}),
    needsOff: z.array(z.string().max(40)).max(500).default([]),
    /** producto → isla de la que se trae, o varias islas por partes (ver core/supply.ts) */
    supplies: z.record(z.string().max(16), z.union([z.string().max(64), z.record(z.string().max(64), z.number().int().min(0).max(9))])).default({}),
    patron: z.object({ id: z.string().max(16), scaling: z.number().min(0).max(100) }).nullable().default(null),
    events: z.array(z.string().max(16)).max(50).default([]),
    /** % extra a mano por edificio */
    productivity: z.record(z.string().max(16), z.number().int().min(-90).max(500)).default({}),
    /** producto → edificio alternativo elegido */
    producers: z.record(z.string().max(16), z.string().max(16)).default({}),
    /** Residentes reales por nivel copiados del juego (sustituyen a la estimación). */
    popReal: z.record(z.string().max(16), z.number().int().min(0).max(10000000)).default({}),
    /** Temporada del Nilo con la que se planifica (islas de Egipto; falta = media). */
    nile: z.enum(["media", "shemu", "ajet"]).optional(),
    /** Jugador dueño de la isla en una partida compartida */
    owner: z.string().max(40).optional(),
  })
  // Campos que añada una versión más nueva: se conservan tal cual (no se borran al guardar ni al sincronizar).
  .catchall(z.unknown());

export const stateSchema = z
  .object({
    v: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
    lang: z.enum(["es", "en"]),
    motion: z.enum(["auto", "reduce"]),
    /** Nivel de consumo. Se acepta cualquier nombre corto para no fallar con niveles de una versión más nueva (p. ej. "VeryHigh"). */
    consumption: (z.string().min(1).max(16) as unknown as z.ZodType<"Low" | "Medium" | "High" | "VeryHigh">).default("Low"),
    /** Partida compartida: cooperativa (todas las islas son de todos) o cada uno con las suyas. */
    mode: (z.string().min(1).max(16) as unknown as z.ZodType<"coop" | "versus">).default("coop"),
    /** Contar lo que gastan los edificios construidos de más (aunque no se sepa a dónde va lo que hacen). */
    countBuilt: z.boolean().default(true),
    /** Barcos: toneladas que lleva un barco y minutos de ida y vuelta de cada ruta ("islaA|islaB"). */
    ships: z.object({
      capacity: z.number().int().min(0).max(100000).default(0),
      times: z.record(z.string().max(140), z.number().min(0).max(600)).default({}),
      /** Carga fijada a mano: "ruta|islaOrigen|producto" → toneladas. */
      loads: z.record(z.string().max(200), z.number().min(0).max(100000)).default({}),
      /** Varias rutas entre dos islas: "ruta|islaOrigen|producto" → número de ruta (falta = 1). */
      boats: z.record(z.string().max(200), z.number().int().min(1).max(20)).default({}),
      /** Toneladas de cada ruta: "islaA|islaB#n" → t (falta = la capacidad general). */
      caps: z.record(z.string().max(160), z.number().int().min(0).max(100000)).default({}),
      /** Barcos que hacen cada ruta: "islaA|islaB#n" → barcos (falta = 1). */
      counts: z.record(z.string().max(160), z.number().int().min(1).max(50)).default({}),
    }).default({ capacity: 0, times: {}, loads: {}, boats: {}, caps: {}, counts: {} }),
    techs: z.array(z.string().max(16)).max(50).default([]),
    /**
     * DLC que tenéis (se comparte con la partida). Por defecto, lo que la app ya calculaba antes de este ajuste:
     * Prophecies of Ash y The Hippodrome. Dawn of the Delta ("delta") se activa a mano.
     */
    dlcs: z.array(z.string().max(32)).max(16).default(["ash", "hippodrome"]),
    /** Partida compartida activa en este dispositivo (no se comparte). */
    session: z.object({ code: z.string().regex(/^[A-Z2-9]{10}$/), player: z.string().trim().min(1).max(40) }).nullable().default(null),
    current: z.string(),
    islands: z.array(islandSchema).min(1).max(50),
  })
  .catchall(z.unknown())
  .superRefine((s, ctx) => {
    const ids = new Set(s.islands.map((i) => i.id));
    if (ids.size !== s.islands.length) ctx.addIssue({ code: "custom", message: "Duplicate islands" });
    if (!ids.has(s.current)) ctx.addIssue({ code: "custom", message: "Unknown current island" });
  });

export type State = z.output<typeof stateSchema>;
export type Island = State["islands"][number];

export const DEFAULT_DLCS = ["ash", "hippodrome"] as const;

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newIsland(name: string, region: Island["region"]): Island {
  return { id: uid(), name: name.trim(), region, goals: {}, built: {}, houses: {}, needsOff: [], supplies: {}, patron: null, events: [], productivity: {}, producers: {}, popReal: {} };
}

export function initialState(lang: State["lang"] = "es"): State {
  const first = newIsland(lang === "es" ? "Mi isla de Albion" : "My Albion island", "Albion");
  return { v: 2, lang, motion: "auto", consumption: "Low", mode: "coop", countBuilt: true, ships: { capacity: 0, times: {}, loads: {}, boats: {}, caps: {}, counts: {} }, techs: [], dlcs: [...DEFAULT_DLCS], session: null, current: first.id, islands: [first] };
}

/** Quita ids que el catálogo ya no conoce (actualizaciones futuras) sin romper la partida. */
export function sanitize(s0: State): State {
  const s = { ...s0, islands: s0.islands.map(migrateIds) };
  const ids = new Set(s.islands.map((i) => i.id));
  return {
    ...s,
    islands: s.islands.map((i) => !isKnownRegion(i.region) ? i : ({
      ...i,
      goals: Object.fromEntries(Object.entries(i.goals).filter(([k, n]) => chainById[k]?.region === i.region && n > 0)),
      built: Object.fromEntries(Object.entries(i.built).filter(([k, n]) => buildings[k]?.region === i.region && n > 0)),
      houses: Object.fromEntries(Object.entries(i.houses).filter(([k, n]) => levelById[k]?.region === i.region && n > 0)),
      supplies: Object.fromEntries(
        Object.keys(i.supplies)
          .map((p) => [p, normalizeSources(i.id, sourcesOf(i.id, i.supplies, p), (id) => ids.has(id))] as const)
          .filter((e): e is readonly [string, SupplyValue] => e[1] !== null),
      ),
      patron: i.patron && patronById[i.patron.id] ? i.patron : null,
      events: i.events.filter((e) => events.some((x) => x.id === e)),
      productivity: Object.fromEntries(Object.entries(i.productivity).filter(([k, n]) => buildings[k]?.region === i.region && n !== 0)),
      producers: Object.fromEntries(Object.entries(i.producers).filter(([prod, b]) => buildings[b]?.region === i.region && buildings[b].productId === prod)),
    })),
  };
}

export const KEY = "anno117-planner";
export const MAX_IMPORT_BYTES = 200_000;

export function parse(raw: string): State {
  if (raw.length > MAX_IMPORT_BYTES) throw new Error("too-large");
  return sanitize(stateSchema.parse(JSON.parse(raw)));
}

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | null => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/**
 * Si la partida guardada no pasa la validación (p. ej. tras una actualización), se rescata lo que se pueda:
 * las islas válidas, los ajustes válidos y, sobre todo, la partida compartida, para no tener que volver a
 * escribir el código (al reconectar, las islas llegan del servidor).
 */
export function repair(raw: string, lang: State["lang"]): State | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const islands = (Array.isArray(o.islands) ? o.islands : [])
    .map((x) => islandSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data);
  const base = initialState(lang);
  const list = islands.length ? islands : base.islands;
  const current = list.some((i) => i.id === o.current) ? (o.current as string) : list[0].id;
  const keys = ["lang", "motion", "consumption", "mode", "countBuilt", "ships", "techs", "dlcs", "session"] as const;
  const pick = (k: (typeof keys)[number]) => {
    const r = stateSchema.safeParse({ ...base, islands: list, current, [k]: o[k] });
    return r.success ? { [k]: r.data[k] } : {};
  };
  const fixed = Object.assign({}, ...keys.map(pick)) as Partial<State>;
  const r = stateSchema.safeParse({ ...base, ...fixed, v: 2, islands: list, current });
  return r.success ? sanitize(r.data) : null;
}

export function loadState(s: Store | null = store()): State {
  const lang = typeof navigator !== "undefined" && navigator.language?.startsWith("es") === false ? "en" : "es";
  let raw: string | null | undefined = null;
  try {
    raw = s?.getItem(KEY);
    if (raw) return parse(raw);
  } catch {
    /* datos dañados: se guarda una copia y se rescata lo que se pueda */
    try { if (raw) s?.setItem(KEY + ":damaged", raw); } catch { /* sin almacenamiento */ }
    const fixed = raw ? repair(raw, lang) : null;
    if (fixed) return fixed;
  }
  return initialState(lang);
}

export function saveState(state: State, s: Store | null = store()): boolean {
  try {
    s?.setItem(KEY, JSON.stringify(stateSchema.parse(state)));
    return !!s;
  } catch {
    return false;
  }
}

/** Antes de importar se guarda la partida actual para poder deshacer. */
export function importState(raw: string, current: State, s: Store | null = store()): State {
  const next = parse(raw);
  try { s?.setItem(KEY + ":before-import", JSON.stringify(current)); } catch { /* opcional */ }
  return next;
}

export function undoImport(s: Store | null = store()): State | null {
  try {
    const raw = s?.getItem(KEY + ":before-import");
    return raw ? parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Copias automáticas ─────────────────────────────────────────────────────
// Se guardan en este dispositivo: una cada 6 horas como mucho, y siempre antes de que llegue de la
// partida compartida un cambio que quita islas. Se conservan las 5 últimas.

export type AutoBackup = { at: number; reason: "periodic" | "before-remote-removal"; islands: number; data: string };
export const BACKUPS_KEY = KEY + ":auto";
const MAX_BACKUPS = 5;
const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;

export function listBackups(s: Store | null = store()): AutoBackup[] {
  try {
    const raw = s?.getItem(BACKUPS_KEY);
    const list = raw ? (JSON.parse(raw) as AutoBackup[]) : [];
    return Array.isArray(list) ? list.filter((b) => b && typeof b.data === "string" && typeof b.at === "number") : [];
  } catch {
    return [];
  }
}

/** Guarda una copia si toca (o siempre, si `force`). Devuelve true si la ha guardado. */
export function autoBackup(state: State, opts: { force?: boolean; reason?: AutoBackup["reason"]; now?: number } = {}, s: Store | null = store()): boolean {
  const now = opts.now ?? Date.now();
  const list = listBackups(s);
  if (!opts.force && list.length && now - list[0].at < BACKUP_EVERY_MS) return false;
  const data = JSON.stringify(state);
  if (list.length && list[0].data === data) return false;
  const next = [{ at: now, reason: opts.reason ?? "periodic", islands: state.islands.length, data }, ...list].slice(0, MAX_BACKUPS);
  // Si no cabe, se quitan las más antiguas hasta que quepa.
  for (let n = next.length; n > 0; n--) {
    try { s?.setItem(BACKUPS_KEY, JSON.stringify(next.slice(0, n))); return true; } catch { /* sin espacio */ }
  }
  return false;
}

/** Islas que esta versión no sabe calcular (de una región más nueva). Se conservan pero no se muestran. */
export const hiddenIslands = (s: State) => s.islands.filter((i) => !isKnownRegion(i.region));

/**
 * Junta lo que devuelve la interfaz (que solo ve las islas conocidas) con las islas ocultas, en su sitio:
 * así una versión antigua nunca borra ni mueve una isla que no sabe mostrar.
 */
export function withHidden(raw: State, next: State): State {
  const hidden = hiddenIslands(raw);
  if (!hidden.length) return next;
  // Las visibles, en el orden que trae la interfaz; las ocultas, de vuelta en su posición original.
  const merged = next.islands.filter((i) => isKnownRegion(i.region));
  raw.islands.forEach((i, idx) => { if (!isKnownRegion(i.region)) merged.splice(Math.min(idx, merged.length), 0, i); });
  return { ...next, islands: merged, current: next.current };
}

/** ¿Pasar de `prev` a `next` quita alguna isla? (antes de aplicarlo se guarda una copia) */
export const removesIslands = (prev: State, next: State) => prev.islands.some((i) => !next.islands.some((n) => n.id === i.id));
