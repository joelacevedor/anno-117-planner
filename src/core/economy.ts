/**
 * Economía de la partida por producto: islas, regiones e imperio.
 * Todo sale del plan mundial que ya calcula la app (worldPlan): no hay otro motor.
 *
 * Por isla y producto (t/min):
 *  - planned:   lo que la isla tiene que producir según el plan (lo suyo + lo que envía).
 *  - available: lo que producen los edificios apuntados como construidos, con sus mejoras.
 *  - inflow / outflow: envíos configurados con «Llega de…» (compromisos).
 *  - unsourced: lo que piden las casas, la región no fabrica y nadie envía.
 *  - consume = planned − outflow + inflow + unsourced.
 *  - produce: available si hay edificios apuntados; si no, la producción planificada (estimada).
 *  - saldo = produce + inflow − outflow − consume.
 * Lo que va de una isla a otra cuenta una sola vez: sale del saldo del origen y entra en el del destino.
 */
import { buildings, chainForProduct, levels, productName, providerOf, type Region } from "../data/catalog";
import { perMinute, type Flow, type Mods, type WorldPlan } from "./plan";
import { tradeRoutes, type Route } from "./routes";
import { boatOf, boatsIn, DEFAULT_CAPACITY, planLeg, shipsNeeded } from "./ships";

const EPS = 1e-6;
/** Un producto está equilibrado si su saldo queda dentro de ±0,1 t/min. */
export const BALANCE_TOLERANCE = 0.1;

export type EconIsland = { id: string; name: string; region: Region; built: Record<string, number>; mods?: Mods };

export type IslandProduct = {
  island: string;
  product: string;
  planned: number;
  available: number;
  /** Hay edificios de este producto apuntados como construidos en la isla. */
  hasBuilt: boolean;
  produce: number;
  consume: number;
  inflow: number;
  outflow: number;
  unsourced: number;
  saldo: number;
  /** Envíos que entran y salen, por isla. */
  from: { island: string; rate: number }[];
  to: { island: string; rate: number }[];
};

export type Status = "deficit" | "surplus" | "balanced";
export const statusOf = (saldo: number): Status =>
  saldo < -BALANCE_TOLERANCE ? "deficit" : saldo > BALANCE_TOLERANCE ? "surplus" : "balanced";

/** Saldo por isla y producto. */
export function islandEconomy(islands: EconIsland[], world: WorldPlan): IslandProduct[] {
  const out = new Map<string, IslandProduct>();
  const get = (island: string, product: string) => {
    const k = `${island}|${product}`;
    let x = out.get(k);
    if (!x) out.set(k, (x = { island, product, planned: 0, available: 0, hasBuilt: false, produce: 0, consume: 0, inflow: 0, outflow: 0, unsourced: 0, saldo: 0, from: [], to: [] }));
    return x;
  };
  for (const i of islands) {
    const plan = world.plans[i.id];
    if (plan) for (const r of plan.rows) {
      const b = buildings[r.id];
      if (b && r.exact > EPS) get(i.id, b.productId).planned += r.exact * perMinute(b, i.mods);
    }
    for (const [id, n] of Object.entries(i.built)) {
      const b = buildings[id];
      if (!b || b.region !== i.region || !(n > 0)) continue;
      const x = get(i.id, b.productId);
      x.available += n * perMinute(b, i.mods);
      x.hasBuilt = true;
    }
    for (const u of world.imports[i.id] ?? []) if (u.perMinute > EPS) get(i.id, u.product).unsourced += u.perMinute;
  }
  const ids = new Set(islands.map((i) => i.id));
  for (const f of world.flows) {
    if (!(f.rate > EPS) || f.from === f.to || !ids.has(f.from) || !ids.has(f.to)) continue;
    const a = get(f.from, f.product); a.outflow += f.rate; a.to.push({ island: f.to, rate: f.rate });
    const b = get(f.to, f.product); b.inflow += f.rate; b.from.push({ island: f.from, rate: f.rate });
  }
  for (const x of out.values()) {
    x.consume = Math.max(0, x.planned - x.outflow + x.inflow + x.unsourced);
    x.produce = x.hasBuilt ? x.available : x.planned;
    x.saldo = x.produce + x.inflow - x.outflow - x.consume;
  }
  return [...out.values()].filter((x) => x.consume > EPS || x.produce > EPS || x.inflow > EPS || x.outflow > EPS)
    .sort((a, b) => a.island.localeCompare(b.island) || a.product.localeCompare(b.product));
}

export type RegionProduct = {
  product: string;
  produce: number;
  consume: number;
  /** Lo que llega de otras regiones y lo que sale hacia ellas. */
  importIn: number;
  exportOut: number;
  net: number;
  status: Status;
  /** Hay islas que lo necesitan sin edificios apuntados (su producción es una estimación). */
  estimated: boolean;
  /** Lo piden las casas y ninguna isla lo envía ni la región lo fabrica. */
  unsourced: number;
  islands: IslandProduct[];
};

export type RegionSummary = {
  region: Region;
  islands: string[];
  products: RegionProduct[];
  deficit: number;
  surplus: number;
  estimated: number;
  produce: number;
  consume: number;
  /** Lo que llega de otras regiones y lo que sale hacia ellas (t/min, todos los productos). */
  importIn: number;
  exportOut: number;
  /** net = produce − consume + importIn − exportOut */
  net: number;
};

/** Balance de una región por producto (los envíos entre sus islas se compensan). */
export function regionEconomy(region: Region, islands: EconIsland[], econ: IslandProduct[]): RegionSummary {
  const mine = islands.filter((i) => i.region === region).map((i) => i.id);
  const inRegion = new Set(mine);
  const by = new Map<string, RegionProduct>();
  for (const x of econ) {
    if (!inRegion.has(x.island)) continue;
    let r = by.get(x.product);
    if (!r) by.set(x.product, (r = { product: x.product, produce: 0, consume: 0, importIn: 0, exportOut: 0, net: 0, status: "balanced", estimated: false, unsourced: 0, islands: [] }));
    r.produce += x.produce; r.consume += x.consume; r.unsourced += x.unsourced;
    r.importIn += x.from.filter((f) => !inRegion.has(f.island)).reduce((s, f) => s + f.rate, 0);
    r.exportOut += x.to.filter((f) => !inRegion.has(f.island)).reduce((s, f) => s + f.rate, 0);
    r.net += x.saldo;
    if (!x.hasBuilt && x.planned > EPS) r.estimated = true;
    r.islands.push(x);
  }
  const products = [...by.values()].map((r) => ({ ...r, status: statusOf(r.net) }))
    .sort((a, b) => a.net - b.net || productName(a.product).es.localeCompare(productName(b.product).es, "es"));
  return {
    region, islands: mine, products,
    deficit: products.filter((p) => p.status === "deficit").length,
    surplus: products.filter((p) => p.status === "surplus").length,
    estimated: products.filter((p) => p.estimated).length,
    produce: products.reduce((s, p) => s + p.produce, 0),
    consume: products.reduce((s, p) => s + p.consume, 0),
    importIn: products.reduce((s, p) => s + p.importIn, 0),
    exportOut: products.reduce((s, p) => s + p.exportOut, 0),
    net: products.reduce((s, p) => s + p.net, 0),
  };
}

// ── Transporte ────────────────────────────────────────────────────────────

export type ShipsState = { capacity: number; times: Record<string, number>; loads: Record<string, number>; boats: Record<string, number>; caps: Record<string, number>; counts: Record<string, number> };
export type Transport = "unchecked" | "short" | "ok";

/** ¿Llegan los barcos de una ruta (pareja de islas)? Mismo cálculo que la pantalla de Rutas. */
export function routeTransport(r: Route, ships: ShipsState): { status: Transport; missing: number } {
  const key = `${r.a}|${r.b}`;
  const T = ships.times[key] ?? 0;
  const cap = ships.capacity || DEFAULT_CAPACITY;
  const loadKey = (from: string, p: string) => `${key}|${from}|${p}`;
  const fixedFor = (from: string) =>
    Object.fromEntries(Object.entries(ships.loads).filter(([k]) => k.startsWith(`${key}|${from}|`)).map(([k, v]) => [k.split("|").pop()!, v]));
  const keys = [...r.ab.map((x) => loadKey(r.a, x.product)), ...r.ba.map((x) => loadKey(r.b, x.product))];
  let over = false, missing = 0;
  for (const n of boatsIn(ships.boats, keys)) {
    const inBoat = (from: string) => (x: { product: string }) => boatOf(ships.boats, loadKey(from, x.product)) === n;
    const c = ships.caps[`${key}#${n}`] || cap;
    const ab = planLeg(r.ab.filter(inBoat(r.a)), c, fixedFor(r.a));
    const ba = planLeg(r.ba.filter(inBoat(r.b)), c, fixedFor(r.b));
    over ||= ab.over || ba.over;
    if (T > 0) missing += Math.max(0, shipsNeeded(T, Math.min(ab.deadline, ba.deadline)) - (ships.counts[`${key}#${n}`] ?? 1));
  }
  if (over || missing > 0) return { status: "short", missing };
  return { status: T > 0 ? "ok" : "unchecked", missing: 0 };
}

// ── Imperio: recomendaciones ──────────────────────────────────────────────

export type RecState = "no-route" | "assign" | "short" | "unchecked" | "build" | "no-provider";

export type Recommendation = {
  key: string;
  state: RecState;
  product: string;
  /** Isla que lo necesita (o, en transporte, la ruta: a → b). */
  to: string;
  from?: string;
  rate: number;
  /** Excedente del proveedor antes de esta recomendación. */
  offer?: number;
  /** Para «hay que construir»: isla, edificio y cuántos más. */
  build?: { island: string; building: string; count: number };
  /** Para transporte: la ruta afectada. */
  route?: { a: string; b: string; missing: number };
  houses: boolean;
};

export type Empire = {
  regions: Region[];
  recommendations: Recommendation[];
  covered: { a: string; b: string; products: string[]; rate: number }[];
  surplusProducts: number;
  shortRoutes: number;
  pairs: RegionPair[];
};

export type RegionPair = { from: Region; to: Region; rate: number; products: string[]; missing?: { product: string; rate: number } };

/** Productos que piden las casas (sus necesidades van primero). */
const NEED_PRODUCTS = new Set(levels.flatMap((l) => l.needs.map((n) => n.product)));
const isHouseNeed = (product: string) => NEED_PRODUCTS.has(product);

/**
 * Recomendaciones del imperio. Reparto determinista (mismo resultado en todos los dispositivos):
 *  1. Necesidades: primero lo que piden las casas, de mayor a menor cantidad (empates por isla y producto).
 *  2. Proveedor: misma región antes que otra, luego una ruta ya existente entre las dos islas, luego el mayor excedente.
 *  3. Lo asignado se descuenta en el acto: ningún excedente se reparte dos veces.
 *  4. Lo que nadie cubre: construir en la propia isla si su región lo fabrica; si no, en la isla de una región
 *     que lo fabrique (la que ya más produce); si no hay ninguna, «sin proveedor».
 * No modifica nada: solo propone.
 */
export function empireEconomy(islands: EconIsland[], world: WorldPlan, econ: IslandProduct[], ships: ShipsState): Empire {
  const byId = Object.fromEntries(islands.map((i) => [i.id, i]));
  const routes = tradeRoutes(world.flows);
  const linked = new Set(routes.map((r) => `${r.a}|${r.b}`));
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const regionOf = (id: string) => byId[id]?.region;

  // Ofertas: excedente con edificios apuntados (ya descontados los envíos).
  const offers = econ.filter((x) => x.hasBuilt && x.saldo > BALANCE_TOLERANCE).map((x) => ({ island: x.island, product: x.product, left: x.saldo }));
  // Necesidades: déficit real (con edificios apuntados) o lo que nadie envía.
  const needs = econ
    .map((x) => ({ x, rate: x.unsourced > EPS ? x.unsourced + (x.hasBuilt ? Math.max(0, -(x.saldo + x.unsourced)) : 0) : x.hasBuilt ? Math.max(0, -x.saldo) : 0 }))
    .filter((n) => n.rate > BALANCE_TOLERANCE)
    .map((n) => ({ island: n.x.island, product: n.x.product, rate: n.rate, houses: isHouseNeed(n.x.product) }))
    .sort((a, b) => Number(b.houses) - Number(a.houses) || b.rate - a.rate || a.island.localeCompare(b.island) || a.product.localeCompare(b.product));

  const recs: Recommendation[] = [];
  for (const need of needs) {
    let rem = need.rate;
    const cands = offers.filter((o) => o.product === need.product && o.island !== need.island && o.left > EPS)
      .sort((a, b) =>
        Number(regionOf(b.island) === regionOf(need.island)) - Number(regionOf(a.island) === regionOf(need.island)) ||
        Number(linked.has(pairKey(b.island, need.island))) - Number(linked.has(pairKey(a.island, need.island))) ||
        b.left - a.left || a.island.localeCompare(b.island));
    for (const o of cands) {
      if (rem <= EPS) break;
      const take = Math.min(rem, o.left);
      recs.push({
        key: `${o.island}>${need.island}|${need.product}`, state: linked.has(pairKey(o.island, need.island)) ? "assign" : "no-route",
        product: need.product, to: need.island, from: o.island, rate: take, offer: o.left, houses: need.houses,
      });
      o.left -= take;
      rem -= take;
    }
    if (rem > BALANCE_TOLERANCE) {
      const self = byId[need.island];
      const maker = self && providerOf(self.region, need.product) ? self
        : islands.filter((i) => providerOf(i.region, need.product))
          .sort((a, b) => (econ.find((x) => x.island === b.id && x.product === need.product)?.produce ?? 0) - (econ.find((x) => x.island === a.id && x.product === need.product)?.produce ?? 0) || a.id.localeCompare(b.id))[0];
      if (maker) {
        const bid = chainForProduct(maker.region, need.product)?.root ?? providerOf(maker.region, need.product)!;
        const per = perMinute(buildings[bid], maker.mods);
        recs.push({ key: `build|${maker.id}|${need.island}|${need.product}`, state: "build", product: need.product, to: need.island, from: maker.id, rate: rem, houses: need.houses, build: { island: maker.id, building: bid, count: Math.ceil(rem / per - 1e-9) } });
      } else {
        recs.push({ key: `none|${need.island}|${need.product}`, state: "no-provider", product: need.product, to: need.island, rate: rem, houses: need.houses });
      }
    }
  }

  // Transporte de las rutas configuradas.
  const covered: Empire["covered"] = [];
  let shortRoutes = 0;
  for (const r of routes) {
    const tr = routeTransport(r, ships);
    const products = [...r.ab, ...r.ba].map((x) => x.product);
    if (tr.status === "ok") { covered.push({ a: r.a, b: r.b, products, rate: r.total }); continue; }
    if (tr.status === "short") shortRoutes++;
    recs.push({ key: `route|${r.a}|${r.b}`, state: tr.status, product: (r.ab[0] ?? r.ba[0]).product, to: r.b, from: r.a, rate: r.total, houses: false, route: { a: r.a, b: r.b, missing: tr.missing } });
  }

  const ORDER: Record<RecState, number> = { short: 0, "no-provider": 1, build: 2, "no-route": 3, assign: 4, unchecked: 5 };
  recs.sort((a, b) => ORDER[a.state] - ORDER[b.state] || Number(b.houses) - Number(a.houses) || b.rate - a.rate || a.key.localeCompare(b.key));

  // Parejas de regiones: lo que se envía y lo que falta.
  const pairs = new Map<string, RegionPair>();
  const pair = (from: Region, to: Region) => {
    const k = `${from}>${to}`;
    let p = pairs.get(k);
    if (!p) pairs.set(k, (p = { from, to, rate: 0, products: [] }));
    return p;
  };
  for (const f of world.flows as Flow[]) {
    const a = regionOf(f.from), b = regionOf(f.to);
    if (!a || !b || a === b || !(f.rate > EPS)) continue;
    const p = pair(a, b); p.rate += f.rate; if (!p.products.includes(f.product)) p.products.push(f.product);
  }
  for (const rec of recs) {
    if (rec.state === "short" || rec.state === "unchecked" || !rec.from) continue;
    const a = regionOf(rec.from), b = regionOf(rec.to);
    if (!a || !b || a === b) continue;
    const p = pair(a, b);
    if (!p.missing || rec.rate > p.missing.rate) p.missing = { product: rec.product, rate: rec.rate };
  }

  const regions = [...new Set(islands.map((i) => i.region))];
  return {
    regions, recommendations: recs, covered, shortRoutes,
    surplusProducts: new Set(offers.map((o) => o.product)).size,
    pairs: [...pairs.values()].sort((a, b) => Number(!!b.missing) - Number(!!a.missing) || b.rate - a.rate),
  };
}

/**
 * Reparto en partes (1–9) para añadir una isla de origen con `rate` t/min a un producto que la isla
 * consume a `total` t/min, conservando la proporción de los orígenes que ya tiene.
 * Devuelve el reparto y lo que llegaría realmente de la isla nueva.
 */
export function proposeParts(current: Record<string, number>, from: string, rate: number, total: number): { parts: Record<string, number>; actual: number } {
  const curTotal = Object.values(current).reduce((s, n) => s + n, 0);
  const share = Math.min(1, Math.max(0, total > EPS ? rate / total : 1));
  if (!curTotal || share >= 1 - 1e-6) return { parts: { [from]: 1 }, actual: total || rate };
  const target: Record<string, number> = {};
  for (const [id, n] of Object.entries(current)) target[id] = (target[id] ?? 0) + (n / curTotal) * (1 - share);
  target[from] = (target[from] ?? 0) + share;
  let best: { parts: Record<string, number>; err: number } | null = null;
  for (let T = 2; T <= 18; T++) {
    const parts = Object.fromEntries(Object.entries(target).map(([id, f]) => [id, Math.max(1, Math.min(9, Math.round(f * T)))]));
    const sum = Object.values(parts).reduce((s, n) => s + n, 0);
    const err = Object.entries(target).reduce((s, [id, f]) => s + Math.abs(parts[id] / sum - f), 0);
    if (!best || err < best.err - 1e-9) best = { parts, err };
  }
  const sum = Object.values(best!.parts).reduce((s, n) => s + n, 0);
  return { parts: best!.parts, actual: (best!.parts[from] / sum) * total };
}
