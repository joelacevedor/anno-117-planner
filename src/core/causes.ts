/**
 * Por qué falta (o puede faltar) producción en una cadena. Lógica pura: no inventa mecánicas, solo
 * reúne lo que la app ya calcula — edificios que faltan, el insumo que frena, productividad por debajo
 * del 100 %, islas de origen con déficit y rutas sin barcos suficientes.
 */
import { buildings, chainForProduct, type Chain, type Region } from "../data/catalog";
import { perFinal, type Flow, type Mods, type WorldPlan } from "./plan";
import { chainRates, type ChainRate } from "./chainRates";
import { routeTransport, type ShipsState } from "./economy";
import { tradeRoutes } from "./routes";
import type { BoostDetail } from "./boosts";
import { totalPct } from "./boosts";

export type Cause =
  /** Edificios de la cadena que faltan aquí. */
  | { kind: "build"; id: string; n: number }
  /** Insumo que no da abasto y frena la producción. */
  | { kind: "input"; id: string }
  /** Edificio de la cadena por debajo del 100 % (temporada del Nilo, ajuste a mano…). */
  | { kind: "productivity"; id: string; pct: number }
  /** La isla de origen de un producto tiene déficit de ese producto. */
  | { kind: "source"; product: string; from: string }
  /** La ruta que trae un producto no tiene barcos suficientes o va sobrecargada. */
  | { kind: "route"; from: string; product: string; missing: number };

export type CauseInput = {
  island: { id: string; region: Region };
  chain: Chain;
  rate: ChainRate;
  boosts: Record<string, BoostDetail>;
  world: WorldPlan;
  /** Islas de la partida (para calcular el estado de las de origen). */
  islands: { id: string; region: Region; built: Record<string, number>; accepted?: string[] }[];
  modsByIsland: Record<string, Mods>;
  ships: ShipsState;
  countBuilt?: boolean;
};

/** Productos de una cadena completa (final e insumos), aunque parte llegue de fuera. */
const productsOf = (c: Chain) => new Set(Object.keys(perFinal(c)).map((id) => buildings[id].productId));

export function chainCauses(x: CauseInput): Cause[] {
  const out: Cause[] = [];
  for (const b of x.rate.buildings) if (b.missing > 0) out.push({ kind: "build", id: b.id, n: b.missing });
  if (x.rate.limitedBy && x.rate.deficit > 0 && !out.some((c) => c.kind === "build" && c.id === x.rate.limitedBy))
    out.push({ kind: "input", id: x.rate.limitedBy });
  for (const b of x.rate.buildings) {
    const pct = totalPct(x.boosts[b.id]);
    if (pct < 100) out.push({ kind: "productivity", id: b.id, pct });
  }
  // Lo que llega de otras islas: ¿lo producen allí y llega en barco?
  const products = productsOf(x.chain);
  const inbound = x.world.flows.filter((f: Flow) => f.to === x.island.id && products.has(f.product) && f.rate > 1e-9);
  const ratesOf = new Map<string, ChainRate[]>();
  const routes = tradeRoutes(x.world.flows);
  for (const f of inbound) {
    const src = x.islands.find((i) => i.id === f.from);
    const plan = x.world.plans[f.from];
    if (src && plan) {
      if (!ratesOf.has(src.id)) ratesOf.set(src.id, chainRates(plan, src.built, x.modsByIsland[src.id], [], x.countBuilt));
      const c = chainForProduct(src.region, f.product);
      const r = c && ratesOf.get(src.id)!.find((y) => y.chainId === c.id);
      if (r && r.state === "short" && !(src.accepted ?? []).includes(r.chainId)) out.push({ kind: "source", product: f.product, from: f.from });
    }
    const route = routes.find((r) => (r.a === f.from && r.b === f.to) || (r.b === f.from && r.a === f.to));
    if (route) {
      const tr = routeTransport(route, x.ships);
      if (tr.status === "short") out.push({ kind: "route", from: f.from, product: f.product, missing: tr.missing });
    }
  }
  return out;
}
