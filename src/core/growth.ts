/**
 * Planes de crecimiento: con un objetivo de casas por nivel en una isla, cuánta población habrá,
 * cuánto pedirán las casas (t/min) y qué edificios hará falta tener, aquí y en las islas que la abastecen.
 * Lógica pura sobre el mismo cálculo del plan del imperio (core/plan.ts).
 */
import { buildings, levels, type Level } from "../data/catalog";
import { worldPlan, type WorldIsland, type WorldPlan } from "./plan";
import { residentsOf, workforceOf } from "./population";

const EPS = 1e-6;

export type GrowthTarget = { island: string; houses: Record<string, number> };

export type GrowthOutlook = {
  levels: { id: string; housesNow: number; housesTarget: number; residentsNow: number; residentsTarget: number; workersNow: number; workersTarget: number }[];
  residents: { now: number; target: number };
  /** Lo que piden las casas, por producto (t/min), ahora y con el objetivo. */
  demand: { product: string; now: number; target: number }[];
  /** Edificios recomendados en la isla, ahora y con el objetivo, y cuántos hay construidos (solo los que cambian). */
  build: { id: string; now: number; target: number; built: number }[];
  /** Edificios de más que el objetivo pide en otras islas (por lo que les envían). */
  elsewhere: { island: string; id: string; extra: number }[];
};

export function houseDemand(level: Level, houses: number, needsOff: string[], factor: number) {
  const out: Record<string, number> = {};
  if (!(houses > 0)) return out;
  for (const n of level.needs) if (!needsOff.includes(`${level.id}:${n.product}`)) out[n.product] = (out[n.product] ?? 0) + houses * n.rate * factor;
  return out;
}

export function growthOutlook(islands: WorldIsland[], factor: number, target: GrowthTarget, opts: { countBuilt?: boolean; current?: WorldPlan } = {}): GrowthOutlook | null {
  const isl = islands.find((i) => i.id === target.island);
  if (!isl) return null;
  const mine = levels.filter((l) => l.region === isl.region);
  const lv = mine.map((l) => {
    const housesNow = isl.houses[l.id] ?? 0;
    const housesTarget = target.houses[l.id] ?? 0;
    const residentsNow = residentsOf(l, housesNow, isl.needsOff);
    const residentsTarget = residentsOf(l, housesTarget, isl.needsOff);
    return { id: l.id, housesNow, housesTarget, residentsNow, residentsTarget, workersNow: workforceOf(l, residentsNow), workersTarget: workforceOf(l, residentsTarget) };
  }).filter((x) => x.housesNow > 0 || x.housesTarget > 0);
  const sum = (k: "now" | "target") => {
    const out: Record<string, number> = {};
    for (const l of mine) for (const [p, r] of Object.entries(houseDemand(l, k === "now" ? isl.houses[l.id] ?? 0 : target.houses[l.id] ?? 0, isl.needsOff, factor))) out[p] = (out[p] ?? 0) + r;
    return out;
  };
  const dNow = sum("now"), dTarget = sum("target");
  const demand = [...new Set([...Object.keys(dNow), ...Object.keys(dTarget)])]
    .map((product) => ({ product, now: dNow[product] ?? 0, target: dTarget[product] ?? 0 }))
    .sort((a, b) => b.target - a.target);

  const now = opts.current ?? worldPlan(islands, factor, { countBuilt: opts.countBuilt });
  const next = worldPlan(islands.map((i) => (i.id === isl.id ? { ...i, houses: { ...target.houses } } : i)), factor, { countBuilt: opts.countBuilt });
  const rec = (w: WorldPlan, island: string) => Object.fromEntries((w.plans[island]?.rows ?? []).map((r) => [r.id, r.recommended]));
  const a = rec(now, isl.id), b = rec(next, isl.id);
  const build = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((id) => ({ id, now: a[id] ?? 0, target: b[id] ?? 0, built: isl.built[id] ?? 0 }))
    .filter((x) => x.now !== x.target && buildings[x.id])
    .sort((x, y) => (y.target - y.now) - (x.target - x.now));
  const elsewhere: GrowthOutlook["elsewhere"] = [];
  for (const o of islands) {
    if (o.id === isl.id) continue;
    const ra = rec(now, o.id), rb = rec(next, o.id);
    for (const [id, n] of Object.entries(rb)) if (n - (ra[id] ?? 0) > EPS) elsewhere.push({ island: o.id, id, extra: n - (ra[id] ?? 0) });
  }
  return {
    levels: lv,
    residents: { now: lv.reduce((s, x) => s + x.residentsNow, 0), target: lv.reduce((s, x) => s + x.residentsTarget, 0) },
    demand, build, elsewhere,
  };
}
