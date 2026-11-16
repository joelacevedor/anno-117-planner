/**
 * Cifras de cada cadena de una isla en t/min: demanda, producción, cobertura y lo que falta construir.
 * Lo usan Cadenas (lista con cobertura) y Obra. Lógica pura sobre el plan de la isla (core/plan.ts).
 *
 *  - Demanda: lo que piden aquí objetivos, casas y otras islas (sin la parte que llega hecha de fuera).
 *  - Capacidad: lo que pueden hacer los edificios finales construidos, con todos los modificadores.
 *  - Producción: la capacidad, limitada por los insumos. Cada proveedor reparte lo que hace entre todo
 *    lo que lo usa en la isla en proporción a lo que pide; si da para la mitad de lo pedido, la cadena
 *    recibe la mitad. `limitedBy` dice qué insumo la frena.
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
  /** t/min que se producen con lo construido: capacidad limitada por los insumos. */
  production: number;
  /** t/min que podrían hacer los edificios finales construidos si les llegara todo. */
  capacity: number;
  /** production / demand (1 = cubierta). Sin demanda: 1 si produce algo, 0 si no. */
  coverage: number;
  /** t/min que faltan (0 si cubierta). */
  deficit: number;
  /** t/min de más (excedente deliberado; no es stock). */
  surplus: number;
  /** Proveedor que frena la producción (insumo que no da abasto), si lo hay. */
  limitedBy: string | null;
  /** Edificios de la cadena que faltan por construir. */
  toBuild: number;
  /** Edificios de la cadena (tipos) y cuántos hay construidos / recomendados. */
  buildings: { id: string; built: number; recommended: number; missing: number }[];
  state: "short" | "ok" | "spare";
  /** Déficit aceptado por los jugadores: se sigue viendo, pero no cuenta como «Con déficit». */
  accepted?: boolean;
};

/** ¿Cuenta en «Con déficit»? Producción por debajo de la demanda y no aceptado. */
export const isShort = (r: ChainRate) => r.state === "short" && !r.accepted;

/** `countBuilt`: el plan cuenta lo que gastan los finales construidos de más (como `islandPlan`). */
export function chainRates(plan: IslandPlan, built: Record<string, number>, mods?: Mods, chainsOf?: Chain[], countBuilt = false): ChainRate[] {
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
    const capacity = (plan.byId[root]?.built ?? built[root] ?? 0) * rate;
    const ids = Object.keys(perFinalCut(c, new Set(), defaultBuildings, mods)).filter((id) => plan.byId[id]);
    // Insumos: cada proveedor cubre built / exact de lo que se le pide en la isla.
    let limit = Infinity;
    let limitedBy: string | null = null;
    for (const id of ids) {
      if (id === root) continue;
      const r = plan.byId[id];
      if (!(r.exact > 1e-9)) continue;
      // El proveedor reparte por igual entre todo lo que lo usa. Si el plan cuenta lo construido de más,
      // lo que pide el proveedor incluye esos finales: la parte que les llega es la de toda la capacidad.
      const can = (r.built / r.exact) * (countBuilt ? Math.max(demand, capacity) : demand);
      if (can < limit) { limit = can; limitedBy = id; }
    }
    const production = Math.min(capacity, limit);
    if (!(limit < capacity - RATE_TOLERANCE)) limitedBy = null;
    const bs = ids.map((id) => ({ id, built: plan.byId[id].built, recommended: plan.byId[id].recommended, missing: plan.byId[id].missing }));
    const toBuild = bs.reduce((n, b) => n + b.missing, 0);
    const deficit = Math.max(0, demand - production);
    // Déficit = producción efectiva por debajo de la demanda. Los edificios pendientes del plan se
    // muestran aparte (toBuild): una cadena que ya produce lo que se pide está cubierta.
    const short = deficit > RATE_TOLERANCE;
    out.push({
      chainId: c.id, demand, production, capacity,
      coverage: demand > 1e-9 ? production / demand : production > 0 ? 1 : 0,
      deficit: deficit > RATE_TOLERANCE ? deficit : 0,
      surplus: Math.max(0, production - demand),
      limitedBy, toBuild, buildings: bs,
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
    out.push({ chainId: c.id, demand: 0, production, capacity: production, coverage: 1, deficit: 0, surplus: production, limitedBy: null, toBuild: 0, buildings: [{ id: root, built: n, recommended: 0, missing: 0 }], state: "spare" });
  }
  return out;
}

/** Redondeo para mostrar t/min: una cifra decimal, sin «-0». */
export const r1 = (x: number) => { const v = Math.round(x * 10) / 10; return Object.is(v, -0) ? 0 : v; };
