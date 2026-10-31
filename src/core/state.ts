import { z } from "zod";
import { buildings, chainById, levelById, patronById, events } from "../data/catalog";
import { normalizeSources, sourcesOf, type SupplyValue } from "./supply";

const count = z.number().int().min(0).max(999);
const counts = z.record(z.string().max(40), count);

export const islandSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(40),
    region: z.enum(["Albion", "Latium"]),
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
    /** Jugador dueño de la isla en una partida compartida */
    owner: z.string().max(40).optional(),
  })
  .strict();

export const stateSchema = z
  .object({
    v: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
    lang: z.enum(["es", "en"]),
    motion: z.enum(["auto", "reduce"]),
    consumption: z.enum(["Low", "Medium", "High"]).default("Low"),
    techs: z.array(z.string().max(16)).max(50).default([]),
    /** Partida compartida activa en este dispositivo (no se comparte). */
    session: z.object({ code: z.string().regex(/^[A-Z2-9]{10}$/), player: z.string().trim().min(1).max(40) }).nullable().default(null),
    current: z.string(),
    islands: z.array(islandSchema).min(1).max(50),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = new Set(s.islands.map((i) => i.id));
    if (ids.size !== s.islands.length) ctx.addIssue({ code: "custom", message: "Duplicate islands" });
    if (!ids.has(s.current)) ctx.addIssue({ code: "custom", message: "Unknown current island" });
  });

export type State = z.output<typeof stateSchema>;
export type Island = State["islands"][number];

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newIsland(name: string, region: Island["region"]): Island {
  return { id: uid(), name: name.trim(), region, goals: {}, built: {}, houses: {}, needsOff: [], supplies: {}, patron: null, events: [], productivity: {}, producers: {} };
}

export function initialState(lang: State["lang"] = "es"): State {
  const first = newIsland(lang === "es" ? "Mi isla de Albion" : "My Albion island", "Albion");
  return { v: 2, lang, motion: "auto", consumption: "Low", techs: [], session: null, current: first.id, islands: [first] };
}

/** Quita ids que el catálogo ya no conoce (actualizaciones futuras) sin romper la partida. */
export function sanitize(s: State): State {
  const ids = new Set(s.islands.map((i) => i.id));
  return {
    ...s,
    islands: s.islands.map((i) => ({
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

export function loadState(s: Store | null = store()): State {
  try {
    const raw = s?.getItem(KEY);
    if (raw) return parse(raw);
  } catch {
    /* datos dañados: se conservan como copia y se empieza limpio */
    try { const raw = s?.getItem(KEY); if (raw) s?.setItem(KEY + ":damaged", raw); } catch { /* sin almacenamiento */ }
  }
  const lang = typeof navigator !== "undefined" && navigator.language?.startsWith("es") === false ? "en" : "es";
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
