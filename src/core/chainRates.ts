/**
 * Cifras de cada cadena de una isla en t/min: demanda, producción, cobertura y lo que falta construir.
 * Lo usan Cadenas (lista con cobertura) y Obra. Lógica pura sobre el plan de la isla (core/plan.ts).
 *
 *  - Demanda: lo que piden aquí objetivos, casas y otras islas (sin la parte que llega hecha de fuera).
 *  - Producción: lo que hacen los edificios finales construidos, con todos los modificadores.
 *    Si un insumo no llega, `limitedBy` dice cuál (la producción real puede ser menor).
 *  - Producir de más es válido: la cobertura puede pasar del 100 % y el excedente se muestra aparte.
 */
import { buildings as defaultBuildings, chainById, type Chain } from "../data/catalog";
import { perFinalCut, perMinute, pick, type IslandPlan, type Mods } from "./plan";

/** Margen para no marcar como déficit un redondeo (t/min). */
export const RATE_TOLERANCE = 0.05;

export type ChainRate = {
  chainId: string;
  /** t/min pedidas en esta isla. */
  demand: number;
  /** t/min que pueden hacer los edificios finales construidos. */
  production: number;
  /** production / demand (1 = cubierta). Sin demanda: 1 si produce algo, 0 si no. */
  coverage: number;
  /** t/min que faltan (0 si cubierta). */
  deficit: number;
  /** t/min de más (excedente deliberado; no es stock). */
  surplus: number;
  /** Edificio que no da abasto con lo construido (insumo que falta), si lo hay. */
  limitedBy: string | null;
  /** Edificios de la cadena que faltan por construir. */
  toBuild: number;
  /** Edificios de la cadena (tipos) y cuántos hay construidos / recomendados. */
  buildings: { id: string; built: number; recommended: number; missing: number }[];
  state: "short" | "ok" | "spare";
};

export function chainRates(plan: IslandPlan, built: Record<string, number>, mods?: Mods, chainsOf?: Chain[]): ChainRate[] {
  const out: ChainRate[] = [];
  const seen = new Set<string>();
  const finalOf = (c: Chain) => pick(defaultBuildings, mods, c.root);
  for (const s of plan.chains) {
    const c = chainById[s.chainId];
    if (!c) continue;
    seen.add(c.id);
    const root = finalOf(c);
    const rate = perMinute(defaultBuildings[root], mods);
    const demand = s.exact * rate;
    const production = (plan.byId[root]?.built ?? built[root] ?? 0) * rate;
    const ids = Object.keys(perFinalCut(c, new Set(), defaultBuildings, mods)).filter((id) => plan.byId[id]);
    const bs = ids.map((id) => ({ id, built: plan.byId[id].built, recommended: plan.byId[id].recommended, missing: plan.byId[id].missing }));
    const toBuild = bs.reduce((n, b) => n + b.missing, 0);
    const deficit = Math.max(0, demand - production);
    const short = deficit > RATE_TOLERANCE || toBuild > 0 || !!s.bottleneck;
    out.push({
      chainId: c.id, demand, production,
      coverage: demand > 1e-9 ? production / demand : production > 0 ? 1 : 0,
      deficit: deficit > RATE_TOLERANCE ? deficit : 0,
      surplus: Math.max(0, production - demand),
      limitedBy: s.bottleneck, toBuild, buildings: bs,
      state: short ? "short" : "ok",
    });
  }
  // Cadenas sin demanda pero con edificios finales construidos: producen todo como excedente.
  for (const c of chainsOf ?? []) {
    if (seen.has(c.id)) continue;
    const root = finalOf(c);
    const n = built[root] ?? 0;
    if (!(n > 0)) continue;
    const production = n * perMinute(defaultBuildings[root], mods);
    out.push({ chainId: c.id, demand: 0, production, coverage: 1, deficit: 0, surplus: production, limitedBy: null, toBuild: 0, buildings: [{ id: root, built: n, recommended: 0, missing: 0 }], state: "spare" });
  }
  return out;
}

/** Redondeo para mostrar t/min: una cifra decimal, sin «-0». */
export const r1 = (x: number) => { const v = Math.round(x * 10) / 10; return Object.is(v, -0) ? 0 : v; };
