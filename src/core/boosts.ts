/**
 * Mejoras activas → multiplicadores por edificio.
 *
 * Regla del juego (la misma que la calculadora de la comunidad, js/params.js):
 *   productividad = (100 + Σ base %) × (100 + Σ productividad %) / 10000
 * Dentro de cada grupo los porcentajes se suman; los dos grupos se multiplican. Ningún efecto cuenta dos veces:
 * cada uno se aplica una sola vez por edificio, salvo los que el juego acumula (investigación repetible ×
 * repeticiones, «Suelo fértil» × nivel del volcán).
 *
 * Alcance de cada efecto:
 *  - Investigaciones y maravillas (p. ej. Arado de Vervactor): todo el imperio.
 *  - Efectos de región (volcán, pociones): todas las islas de esa región.
 *  - Deidad y festivales: la isla.
 *  - Ajuste a mano: el edificio en esa isla (especialistas, graneros, acueductos…).
 *  - Productividad observada (calculadora): la cifra final que muestra el juego; sustituye a todo lo anterior.
 * El combustible dura más con los fuelles: duración × (1 + %/100) (no es productividad: se aplica siempre).
 */
import { buildings, eventById, events, patronById, techs, type Boost, type Region } from "../data/catalog";
import type { Counts, Mods } from "./plan";
import { nileFactor, type NileSeason } from "./nile";

export type BoostSettings = {
  techs: string[];
  /** Repeticiones de las investigaciones repetibles (falta = 1 si está investigada). */
  techLevels?: Record<string, number>;
  /** Efectos de todo el imperio activos (maravillas). */
  globalFx?: string[];
  /** Efectos de la región de esta isla → nivel (0 = apagado). */
  regionFx?: Record<string, number>;
  patron: { id: string; scaling: number } | null;
  /** Efectos de la isla (festivales). Los de imperio o región que lleguen aquí (datos antiguos) se tratan según su alcance. */
  events: string[];
  /** % extra a mano por edificio (especialistas, objetos, módulos…). */
  manual: Counts;
  /** Productividad total observada en el juego (%) por edificio: sustituye a los modificadores automáticos. */
  observed?: Counts;
  /** producto → edificio alternativo elegido */
  producers?: Record<string, string>;
  /** Temporada del Nilo con la que se planifica (solo islas de Egipto). */
  nile?: NileSeason;
};

export type BoostPart = { id: string; name: Boost["name"]; kind: "tech" | "patron" | "event"; prod: number; base: number; fuel: number };
/** `nile`: multiplicador de la temporada del Nilo (1 = no le afecta). `observed`: % total visto en el juego. */
export type BoostDetail = { prod: number; base: number; fuel: number; manual: number; nile?: number; observed?: number; parts?: BoostPart[] };

const blank = (): BoostDetail => ({ prod: 0, base: 0, fuel: 0, manual: 0, parts: [] });
/** Productividad automática (sin la observada), como factor. */
const autoFactor = (d: BoostDetail) => ((100 + d.base) * (100 + d.prod + d.manual)) / 10000 * (d.nile ?? 1);

export function modsFor(region: Region, s: BoostSettings): Mods & { detail: Record<string, BoostDetail> } {
  const detail: Record<string, BoostDetail> = {};
  const add = (src: Boost, kind: BoostPart["kind"], times: number) => {
    if (!(times > 0)) return;
    const prod = src.prod * times, base = src.base * times, fuel = src.fuel * times;
    for (const id of src.targets) {
      if (buildings[id]?.region !== region) continue;
      const d = (detail[id] ??= blank());
      d.prod += prod; d.base += base; d.fuel += fuel;
      d.parts!.push({ id: src.id, name: src.name, kind, prod, base, fuel });
    }
  };
  // Investigaciones (imperio). Las repetibles cuentan tantas veces como se han investigado.
  for (const t of techs) if (s.techs.includes(t.id)) add(t, "tech", t.repeatable ? Math.max(1, Math.round(s.techLevels?.[t.id] ?? 1)) : 1);
  // Efectos según su alcance; cada uno una sola vez aunque esté marcado en varios sitios.
  const levels = new Map<string, number>();
  for (const id of s.events) {
    const e = eventById[id];
    if (!e) continue;
    if ((e.scope ?? "island") === "session" && s.regionFx && id in s.regionFx) continue; // manda el ajuste de región
    levels.set(id, Math.max(levels.get(id) ?? 0, 1));
  }
  for (const id of s.globalFx ?? []) if (eventById[id]) levels.set(id, Math.max(levels.get(id) ?? 0, 1));
  for (const [id, n] of Object.entries(s.regionFx ?? {})) if (eventById[id]) levels.set(id, Math.max(0, Math.min(eventById[id].maxLevel ?? 1, Math.round(n))));
  for (const e of events) add(e, "event", levels.get(e.id) ?? 0);
  const patron = s.patron && patronById[s.patron.id];
  if (patron && s.patron!.scaling > 0) for (const e of patron.effects) add({ ...e, id: patron.id, name: patron.name }, "patron", s.patron!.scaling);
  for (const [id, pct] of Object.entries(s.manual)) {
    if (buildings[id]?.region !== region || !pct) continue;
    (detail[id] ??= blank()).manual += pct;
  }
  // Edificios de ribera: la temporada del Nilo multiplica su producción.
  if (region === "Aegyptus")
    for (const b of Object.values(buildings)) {
      if (b.region !== region || !b.nile) continue;
      (detail[b.id] ??= blank()).nile = nileFactor(s.nile ?? "media", b.output);
    }
  for (const [id, pct] of Object.entries(s.observed ?? {})) {
    if (buildings[id]?.region !== region || !(pct > 0)) continue;
    (detail[id] ??= blank()).observed = pct;
  }
  const boost: Counts = {};
  const fuel: Counts = {};
  for (const [id, d] of Object.entries(detail)) {
    const b = d.observed ? d.observed / 100 : autoFactor(d);
    if (Math.abs(b - 1) > 1e-9) boost[id] = Math.max(0.01, b);
    if (d.fuel) fuel[id] = 1 + d.fuel / 100;
  }
  return { boost, fuel, detail, provider: s.producers ?? {} };
}

/** Productividad total en % (100 = sin mejoras). Con la observada, esa cifra tal cual. */
export const totalPct = (d?: BoostDetail) =>
  !d ? 100 : d.observed ? d.observed : Math.round(((100 + d.base) * (100 + d.prod + d.manual)) / 100);
/** Productividad que darían los modificadores automáticos (aunque haya una observada). */
export const autoPct = (d?: BoostDetail) => (d ? Math.round(((100 + d.base) * (100 + d.prod + d.manual)) / 100) : 100);

/** Media ponderada por número de edificios: Σ(n × %) / Σ n. Grupos sin edificios no cuentan. */
export function weightedPct(groups: { n: number; pct: number }[]): number | null {
  const ok = groups.filter((g) => g.n > 0 && Number.isFinite(g.pct));
  const n = ok.reduce((a, g) => a + g.n, 0);
  return n > 0 ? ok.reduce((a, g) => a + g.n * g.pct, 0) / n : null;
}

/** Ajustes de una isla con los de la partida (investigación, maravillas, efectos de región). */
type StateLike = { techs: string[]; techLevels?: Record<string, number>; wonders?: string[]; regionFx?: Record<string, Record<string, number>>; islands: { region: string; events: string[] }[] };
type IslandLike = { region: Region; patron: BoostSettings["patron"]; events: string[]; productivity: Counts; prodObserved?: Counts; producers?: Record<string, string>; nile?: NileSeason };
export function islandBoosts(state: StateLike, i: IslandLike): BoostSettings {
  return {
    techs: state.techs,
    techLevels: state.techLevels,
    globalFx: globalEffects(state),
    regionFx: state.regionFx?.[i.region],
    patron: i.patron, events: i.events, manual: i.productivity, observed: i.prodObserved, producers: i.producers, nile: i.nile,
  };
}

/** Efectos de imperio activos: los marcados en la partida y los que datos antiguos guardaban en alguna isla. */
export function globalEffects(state: Pick<StateLike, "wonders" | "islands">): string[] {
  const out = new Set(state.wonders ?? []);
  for (const i of state.islands) for (const id of i.events) if (eventById[id]?.scope === "meta") out.add(id);
  return [...out];
}

/** Nivel de un efecto de región para una isla (el de la región; si aún no se ha fijado, el que tenía la isla). */
export function regionLevel(state: Pick<StateLike, "regionFx">, i: { region: string; events: string[] }, id: string): number {
  const r = state.regionFx?.[i.region];
  return r && id in r ? r[id] : i.events.includes(id) ? 1 : 0;
}
