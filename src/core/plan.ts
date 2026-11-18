/**
 * Cálculo en edificios enteros.
 * Fracciones exactas por dentro; un único redondeo hacia arriba por tipo de
 * edificio después de sumar objetivos y casas de toda la isla.
 */
import {
  buildings as defaultBuildings, chains as defaultChains, chainForProduct, levelById,
  type Building, type Chain, type Region,
} from "../data/catalog";

import { externalShares, splitExternal, type Supplies } from "./supply";
import { planCircuit, type Circuit } from "./circuits";

const EPS = 1e-9;
type Registry = Record<string, Building>;
export type Counts = Record<string, number>;

/** Mejoras por edificio: multiplicador de productividad y de duración del combustible. */
export type Mods = { boost?: Counts; fuel?: Counts; /** producto → edificio elegido (productores alternativos) */ provider?: Record<string, string> };
const boostOf = (mods: Mods | undefined, id: string) => mods?.boost?.[id] ?? 1;
/** Edificio que realmente produce lo de `id` en esta isla (por si se eligió una alternativa). */
export const pick = (reg: Registry, mods: Mods | undefined, id: string) => {
  const alt = mods?.provider?.[reg[id]?.productId];
  return alt && reg[alt] && reg[alt].region === reg[id].region ? alt : id;
};

/**
 * Productores del mismo producto en la misma región (p. ej. quemadero y mina de carbón).
 * Se pueden tener los dos a la vez: lo construido de cada uno produce y el principal (`pick`) cubre el resto.
 */
const groupCache = new WeakMap<Registry, Record<string, string[]>>();
export function producersOf(reg: Registry, id: string): string[] {
  let m = groupCache.get(reg);
  if (!m) {
    m = {};
    for (const b of Object.values(reg)) (m[`${b.region}|${b.productId}`] ??= []).push(b.id);
    groupCache.set(reg, m);
  }
  const b = reg[id];
  return b ? m[`${b.region}|${b.productId}`] ?? [id] : [id];
}
/** t/min de un grupo de productores con unas cantidades por edificio. */
export const groupRate = (reg: Registry, mods: Mods | undefined, id: string, n: (x: string) => number) =>
  producersOf(reg, id).reduce((a, x) => a + n(x) * perMinute(reg[x], mods), 0);

/** Lo que llega de otra isla: conjunto (todo de fuera) o producto → parte de fuera (0–1). */
export type Cut = Set<string> | Record<string, number>;
const shareOf = (cut: Cut | undefined) => (p: string): number =>
  !cut ? 0 : cut instanceof Set ? (cut.has(p) ? 1 : 0) : Math.max(0, Math.min(1, cut[p] ?? 0));
const cutSize = (cut: Cut | undefined) => (!cut ? 0 : cut instanceof Set ? cut.size : Object.values(cut).filter((x) => x > 0).length);

/** Margen para no marcar como déficit un redondeo (t/min). Lo usan la cobertura y el redondeo de lo recomendado. */
export const RATE_TOLERANCE = 0.05;
/**
 * Edificios recomendados para un número exacto: se redondea hacia arriba, salvo que lo que falte sea menos de
 * RATE_TOLERANCE t/min (p. ej. 10,01 granjas → 10: la cadena ya cuenta como cubierta). Como mucho 0,1 edificio.
 */
export function roundUp(exact: number, ratePerBuilding: number): number {
  const slack = ratePerBuilding > 0 ? Math.min(0.1, RATE_TOLERANCE / ratePerBuilding) : 1e-6;
  return Math.max(0, Math.ceil(exact - Math.max(1e-6, slack)));
}
export const perMinute = (b: Building, mods?: Mods) => (60 / b.cycleSeconds) * b.output * boostOf(mods, b.id);

/** Insumo por ciclo; el combustible se gasta por tiempo, así que baja con la productividad y con mejores fuelles. */
function inputQty(b: Building, inputId: string, qty: number, mods?: Mods) {
  if (b.fuelFrom !== inputId || !b.fuelQty) return qty;
  const boost = boostOf(mods, b.id);
  const fuelMul = mods?.fuel?.[b.id] ?? 1;
  return qty - b.fuelQty + b.fuelQty / (boost * fuelMul);
}

/** Edificios teóricos de cada tipo para mantener 1 edificio final al 100 %. */
export function perFinal(chain: Chain, reg: Registry = defaultBuildings, mods?: Mods): Counts {
  const out: Counts = {};
  const path: string[] = [];
  const add = (id: string, count: number) => {
    const b = reg[id];
    if (!b) throw new Error(`Missing building: ${id}`);
    if (path.includes(id)) throw new Error(`Cycle: ${[...path, id].join(" → ")}`);
    if (!(b.cycleSeconds > 0) || !(b.output > 0)) throw new Error(`Invalid recipe: ${id}`);
    out[id] = (out[id] ?? 0) + count;
    path.push(id);
    const cyclesPerMinute = (count * 60 * boostOf(mods, id)) / b.cycleSeconds;
    for (const [inputId, qty] of Object.entries(b.inputs)) {
      if (!reg[inputId]) throw new Error(`Missing building: ${inputId}`);
      const target = pick(reg, mods, inputId);
      add(target, (cyclesPerMinute * inputQty(b, inputId, qty, mods)) / perMinute(reg[target], mods));
    }
    path.pop();
  };
  add(pick(reg, mods, chain.root), 1);
  return out;
}

/** Etapa de cada edificio: 0 = final, 1 = lo alimenta directamente, etc. (camino más largo). */
export function stages(chain: Chain, reg: Registry = defaultBuildings, cut?: Cut, mods?: Mods): Record<string, number> {
  const depth: Record<string, number> = {};
  const ext = shareOf(cut);
  const walk = (id: string, d: number) => {
    if ((depth[id] ?? -1) >= d) return;
    depth[id] = d;
    for (const input of Object.keys(reg[id].inputs)) if (ext(reg[input].productId) < 1 - EPS) walk(pick(reg, mods, input), d + 1);
  };
  walk(pick(reg, mods, chain.root), 0);
  return depth;
}

/** Menor número de edificios finales sin capacidad sobrante. */
export function cleanRatio(chain: Chain, reg: Registry = defaultBuildings, limit = 24, mods?: Mods) {
  const base = perFinal(chain, reg, mods);
  for (let k = 1; k <= limit; k++) {
    if (Object.values(base).every((n) => Math.abs(n * k - Math.round(n * k)) < 1e-6))
      return {
        finals: k,
        counts: Object.fromEntries(Object.entries(base).map(([id, n]) => [id, Math.round(n * k)])) as Counts,
      };
  }
  return null;
}

/** "1 por patio" / "3 por cada 2 patios": [edificios, finales]. */
export function perText(perOne: number): [number, number] {
  for (let k = 1; k <= 12; k++) {
    const v = perOne * k;
    if (Math.abs(v - Math.round(v)) < 1e-6) return [Math.round(v), k];
  }
  return [Math.round(perOne * 10) / 10, 1];
}

// ── Población ─────────────────────────────────────────────────────────────

export type PopulationInput = {
  region: Region;
  houses: Counts; // nivel → casas
  needsOff: string[]; // "nivel:producto"
  factor: number; // nivel de consumo de la partida (Bajos 1, Medios 1,25, Altos 1,5)
  mods?: Mods;
};

export type PopulationDemand = {
  /** Edificios finales exactos que piden las casas, por cadena. */
  finals: Counts;
  /** Bienes que tus casas piden y esta región no produce (hay que traerlos). */
  imports: { product: string; perMinute: number }[];
};

export function populationDemand(input: PopulationInput, reg: Registry = defaultBuildings): PopulationDemand {
  const rate: Counts = {};
  for (const [levelId, houses] of Object.entries(input.houses)) {
    const level = levelById[levelId];
    if (!level || level.region !== input.region || !(houses > 0)) continue;
    for (const n of level.needs) {
      if (input.needsOff.includes(`${levelId}:${n.product}`)) continue;
      rate[n.product] = (rate[n.product] ?? 0) + houses * n.rate * input.factor;
    }
  }
  const finals: Counts = {};
  const imports: PopulationDemand["imports"] = [];
  for (const [product, r] of Object.entries(rate)) {
    const chain = chainForProduct(input.region, product);
    if (chain) finals[chain.id] = (finals[chain.id] ?? 0) + r / perMinute(reg[pick(reg, input.mods, chain.root)], input.mods);
    else imports.push({ product, perMinute: r });
  }
  return { finals, imports };
}

// ── Plan de la isla ───────────────────────────────────────────────────────

export type Row = {
  id: string;
  exact: number;
  recommended: number;
  built: number;
  missing: number;
  extra: number;
  spare: number;
  /** Aporte exacto por cadena. */
  byChain: Record<string, number>;
};

export type ChainStatus = {
  chainId: string;
  /** Objetivo manual (edificios finales). */
  goal: number;
  /** Edificios finales exactos que piden las casas. */
  fromHouses: number;
  /** Edificios finales exactos que piden otras islas. */
  fromTrade: number;
  /** Edificios finales enteros a tener. */
  finals: number;
  running: number;
  builtFinals: number;
  bottleneck: string | null;
  /** Edificios finales equivalentes que llegan hechos de otra isla. */
  imported: number;
  /** Edificios finales exactos que hay que mantener aquí (lo pedido menos lo que llega hecho). */
  exact: number;
  /** Producto final que sobra (unidades/min) con los edificios previstos o construidos, si son más. */
  surplus: number;
};

export type IslandPlan = {
  rows: Row[];
  byId: Record<string, Row>;
  chains: ChainStatus[];
  toBuild: { id: string; count: number }[];
  complete: boolean;
  /** Bienes que esta isla trae de fuera (producto → unidades/min). */
  external: Counts;
  /** Lo que otras islas piden y esta región no puede producir. */
  unsupplied: Counts;
};

export type PlanOptions = {
  region?: Region;
  /** Productos que la isla trae de otra isla (todo o una parte): esa parte de la cadena no se construye aquí. */
  cut?: Cut;
  /** Demanda de otras islas (producto → unidades/min); se produce aquí. */
  tradeIn?: Counts;
  mods?: Mods;
  /** Contar lo que gastan los edificios construidos de más. */
  countBuilt?: boolean;
  /** Objetivos en t/min por cadena (se suman a `goals`, que cuenta edificios finales). */
  targets?: Counts;
};

/** perFinal sin la parte de la cadena que llega de otra isla. */
export function perFinalCut(chain: Chain, cut: Cut, reg: Registry = defaultBuildings, mods?: Mods): Counts {
  if (!cutSize(cut)) return perFinal(chain, reg, mods);
  const ext = shareOf(cut);
  const out: Counts = {};
  const add = (id: string, count: number, depth: number) => {
    if (depth > 30) throw new Error(`Cycle: ${id}`);
    out[id] = (out[id] ?? 0) + count;
    const b = reg[id];
    const cpm = (count * 60 * boostOf(mods, id)) / b.cycleSeconds;
    for (const [inputId, qty] of Object.entries(b.inputs)) {
      const local = 1 - ext(reg[inputId].productId);
      if (local <= EPS) continue;
      const target = pick(reg, mods, inputId);
      add(target, (local * cpm * inputQty(b, inputId, qty, mods)) / perMinute(reg[target], mods), depth + 1);
    }
  };
  add(pick(reg, mods, chain.root), 1, 0);
  return out;
}

export function islandPlan(
  goals: Counts,
  built: Counts = {},
  fromHouses: Counts = {},
  opts: PlanOptions = {},
  chainList: Chain[] = defaultChains,
  reg: Registry = defaultBuildings,
): IslandPlan {
  const cut = opts.cut ?? new Set<string>();
  const ext = shareOf(cut);
  const mods = opts.mods;
  const exact: Counts = {};
  const byChain: Record<string, Record<string, number>> = {};
  const order: string[] = [];
  const external: Counts = {};
  const unsupplied: Counts = {};
  const chainMap = Object.fromEntries(chainList.map((c) => [c.id, c]));

  // Demanda por cadena: objetivo + casas + otras islas.
  const tradeFinals: Counts = {};
  for (const [product, rate] of Object.entries(opts.tradeIn ?? {})) {
    if (!(rate > EPS)) continue;
    const c = opts.region && chainForProduct(opts.region, product);
    if (c && chainMap[c.id]) tradeFinals[c.id] = (tradeFinals[c.id] ?? 0) + rate / perMinute(reg[pick(reg, mods, c.root)], mods);
    else unsupplied[product] = (unsupplied[product] ?? 0) + rate;
  }

  const expand = (id: string, count: number, chainId: string, depth: number, self = true) => {
    if (depth > 30) throw new Error(`Cycle: ${id}`);
    if (self) {
      if (!(id in exact)) { order.push(id); exact[id] = 0; }
      exact[id] += count;
      (byChain[id] ??= {})[chainId] = (byChain[id][chainId] ?? 0) + count;
    }
    const b = reg[id];
    const cpm = (count * 60 * boostOf(mods, id)) / b.cycleSeconds;
    for (const [inputId, qty] of Object.entries(b.inputs)) {
      const input = reg[inputId];
      if (!input) throw new Error(`Missing building: ${inputId}`);
      const rate = cpm * inputQty(b, inputId, qty, mods);
      const f = ext(input.productId);
      if (f > EPS) external[input.productId] = (external[input.productId] ?? 0) + rate * f;
      if (f < 1 - EPS) {
        const target = pick(reg, mods, inputId);
        expand(target, (rate * (1 - f)) / perMinute(reg[target], mods), chainId, depth + 1);
      }
    }
  };

  const active: { c: Chain; goal: number; houses: number; trade: number; n: number; imported: number }[] = [];
  for (const c of chainList) {
    const g0 = goals[c.id] ?? 0;
    if (!Number.isInteger(g0) || g0 < 0) throw new Error("Goals must be non-negative integers");
    const tpm = opts.targets?.[c.id] ?? 0;
    // Objetivo en t/min → edificios finales (con todos los modificadores), en fracción.
    const goal = g0 + (tpm > 0 ? tpm / perMinute(reg[pick(reg, mods, c.root)], mods) : 0);
    let houses = fromHouses[c.id] ?? 0;
    const trade = tradeFinals[c.id] ?? 0;
    const product = reg[c.root].productId;
    // Lo que pides tú (objetivo y casas) puede llegar hecho de otra isla, todo o una parte.
    // Lo que te piden otras islas se produce aquí.
    const f = ext(product);
    let imported = 0;
    if (f > EPS && goal + houses > EPS) {
      imported = (goal + houses) * f;
      external[product] = (external[product] ?? 0) + imported * perMinute(reg[pick(reg, mods, c.root)], mods);
      houses *= 1 - f;
    }
    const n = goal * (1 - f) + houses + trade;
    if (n <= EPS && imported <= EPS) continue;
    active.push({ c, goal, houses, trade, n, imported });
    if (n > EPS) expand(pick(reg, mods, c.root), n, c.id, 0);
  }
  // Productores alternativos construidos (p. ej. minas de carbón junto a quemaderos): producen lo suyo
  // y el principal solo cubre el resto. Se reparte por cadenas según lo que pide cada una.
  const used: Counts = {};
  const moveTo = (from: string, to: string, n: number) => {
    // n edificios de `to`; se quitan los equivalentes de `from`, en la misma proporción por cadena.
    const src = n > 0 ? from : to;
    const dist = byChain[src] ?? {};
    const tot = Object.values(dist).reduce((a, x) => a + x, 0);
    const shares = tot > EPS ? Object.entries(dist).map(([c, x]) => [c, x / tot] as const) : [[Object.keys(byChain[from] ?? {})[0] ?? from, 1] as const];
    const k = perMinute(reg[to], mods) / perMinute(reg[from], mods);
    for (const [c, sh] of shares) {
      expand(to, n * sh, c, 0);
      expand(from, -n * k * sh, c, 0);
    }
  };
  const allocate = () => {
    let changed = false;
    for (const p of [...order]) {
      if (pick(reg, mods, producersOf(reg, p)[0]) !== p) continue;
      const alts = producersOf(reg, p).filter((a) => a !== p && (built[a] ?? 0) > 0 && (!opts.region || reg[a].region === opts.region));
      if (!alts.length) continue;
      const rp = perMinute(reg[p], mods);
      let left = Math.max(0, (exact[p] ?? 0) * rp + alts.reduce((a, x) => a + (used[x] ?? 0) * perMinute(reg[x], mods), 0));
      for (const a of alts) {
        const ra = perMinute(reg[a], mods);
        const want = Math.min(built[a], left / ra);
        left -= want * ra;
        const d = want - (used[a] ?? 0);
        if (Math.abs(d) > 1e-9) { moveTo(p, a, d); used[a] = want; changed = true; }
      }
    }
    return changed;
  };
  // Lo construido de más también trabaja y gasta: sus insumos se suman (hacia atrás, hasta estabilizar).
  const done: Counts = {};
  for (let pass = 0; pass < 16; pass++) {
    let changed = allocate();
    if (opts.countBuilt) {
      for (const [id, nb] of Object.entries(built)) {
        if (!reg[id] || !(nb > 0) || (opts.region && reg[id].region !== opts.region)) continue;
        const extra = Math.max(0, nb - ((exact[id] ?? 0)));
        const d = extra - (done[id] ?? 0);
        if (Math.abs(d) > 1e-9) {
          const owner = Object.keys(byChain[id] ?? {})[0] ?? (opts.region && chainForProduct(opts.region, reg[id].productId)?.id) ?? id;
          expand(id, d, owner, 0, false);
          done[id] = extra;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const [id, n] of Object.entries(built))
    if (n > 0 && !(id in exact) && reg[id]) { order.push(id); exact[id] = 0; }

  // Un productor que ya no hace falta (lo cubren otros construidos) y del que no hay ninguno no se lista.
  const rows: Row[] = order.filter((id) => exact[id] > 1e-9 || (built[id] ?? 0) > 0).map((id) => {
    const e = Math.max(0, exact[id]);
    const recommended = reg[id] ? roundUp(e, perMinute(reg[id], mods)) : Math.max(0, Math.ceil(e - 1e-6));
    const b = Math.max(0, Math.floor(built[id] ?? 0));
    const spare = recommended - e;
    return {
      id, exact: e, recommended, built: b,
      missing: Math.max(0, recommended - b),
      extra: Math.max(0, b - recommended),
      spare: spare < 1e-6 ? 0 : spare,
      byChain: byChain[id] ?? {},
    };
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  const statuses: ChainStatus[] = active.map(({ c, goal, houses, trade, n, imported }) => {
    const finals = n > EPS ? Math.ceil(n - 1e-6) : 0;
    const root = pick(reg, mods, c.root);
    if (!producersOf(reg, root).some((x) => byId[x])) return { chainId: c.id, goal, fromHouses: houses, fromTrade: trade, finals, running: 0, builtFinals: 0, bottleneck: null, imported, exact: n, surplus: 0 };
    const rr = perMinute(reg[root], mods);
    const builtFinals = Math.min(Math.floor(groupRate(reg, mods, root, (x) => byId[x]?.built ?? 0) / rr + EPS), finals);
    let running = builtFinals;
    let bottleneck: string | null = null;
    for (const id of Object.keys(perFinalCut(c, cut, reg, mods))) {
      if (id === root) continue;
      // Con varios productores del insumo cuenta lo construido de todos frente a lo que se les pide.
      const need = groupRate(reg, mods, id, (x) => byId[x]?.exact ?? 0);
      const share = need > EPS ? Math.min(1, groupRate(reg, mods, id, (x) => byId[x]?.built ?? 0) / need) : 1;
      const can = Math.min(finals, Math.floor(share * n + EPS));
      if (can < running) { running = can; bottleneck = id; }
    }
    // Por tipo de edificio: lo que sobra después de abastecer todo lo que lo usa en la isla.
    const surplus = Math.max(0, groupRate(reg, mods, root, (x) => byId[x] ? Math.max(byId[x].built, byId[x].recommended) - byId[x].exact : 0));
    return { chainId: c.id, goal, fromHouses: houses, fromTrade: trade, finals, running, builtFinals, bottleneck, imported, exact: n, surplus };
  });

  const toBuild = rows.filter((r) => r.missing > 0).map((r) => ({ id: r.id, count: r.missing }));
  return { rows, byId, chains: statuses, toBuild, complete: active.length > 0 && toBuild.length === 0, external, unsupplied };
}

// ── Varias islas con comercio ─────────────────────────────────────────────

export type WorldIsland = {
  id: string;
  region: Region;
  goals: Counts;
  built: Counts;
  houses: Counts;
  needsOff: string[];
  /** producto → isla (o islas, por partes) de la que se trae */
  supplies: Supplies;
  mods?: Mods;
  /** Objetivos en t/min por cadena. */
  targets?: Counts;
};

/**
 * Movimiento de mercancía entre dos islas (t/min).
 * `circuit`: lo lleva un circuito sin que la isla de destino lo pida con «Llega de…» (o más de lo que pide);
 * "short" si el circuito no tiene bodegas para todo (no es un suministro garantizado).
 * `stored`: parte que llega sin demanda registrada en el destino (almacén o uso manual, p. ej. eventos).
 */
export type Flow = { from: string; to: string; product: string; rate: number; circuit?: "ok" | "short"; stored?: number };

export type WorldPlan = {
  plans: Record<string, IslandPlan>;
  /** Lo que las casas piden, la región no produce y no tiene isla asignada. */
  imports: Record<string, PopulationDemand["imports"]>;
  flows: Flow[];
};

/** Plan de todas las islas. La demanda que una isla trae de otra se suma a la de origen (hasta 8 saltos). */
export function worldPlan(islands: WorldIsland[], factor: number, opts: { countBuilt?: boolean; circuits?: Circuit[] } = {}): WorldPlan {
  const reg = defaultBuildings;
  const ids = new Set(islands.map((i) => i.id));
  // Solo cuentan las islas que existen.
  const suppliesOf = (i: WorldIsland): Supplies => {
    const out: Supplies = {};
    for (const [p, v] of Object.entries(i.supplies)) {
      if (typeof v === "string") { if (v !== i.id && ids.has(v)) out[p] = v; }
      else {
        const s = Object.fromEntries(Object.entries(v).filter(([id, n]) => n > 0 && (id === i.id || ids.has(id))));
        if (Object.keys(s).some((id) => id !== i.id)) out[p] = s;
      }
    }
    return out;
  };
  const pops = Object.fromEntries(islands.map((i) => [i.id, populationDemand({ region: i.region, houses: i.houses, needsOff: i.needsOff, factor, mods: i.mods })]));
  // Entregas de los circuitos (régimen de la vuelta completa): una por origen, destino y producto.
  // Lo que se queda a bordo durante una escala no es carga ni descarga de esa isla (lo resuelve planCircuit).
  const moves = new Map<string, { from: string; to: string; product: string; rate: number; short: boolean }>();
  for (const c of opts.circuits ?? []) {
    const cp = planCircuit(c);
    const short = cp.issues.some((x) => x.kind === "overSlots");
    for (const d of cp.deliveries) {
      if (!(d.rate > EPS) || d.from === d.to || !ids.has(d.from) || !ids.has(d.to)) continue;
      const k = `${d.from}|${d.to}|${d.product}`;
      const m = moves.get(k) ?? { from: d.from, to: d.to, product: d.product, rate: 0, short: false };
      m.rate += d.rate; m.short ||= short;
      moves.set(k, m);
    }
  }
  const arrivalsTo = (id: string) => [...moves.values()].filter((m) => m.to === id);
  let tradeIn: Record<string, Counts> = {};
  let result: WorldPlan = { plans: {}, imports: {}, flows: [] };
  for (let pass = 0; pass < 8; pass++) {
    const next: Record<string, Counts> = {};
    const plans: Record<string, IslandPlan> = {};
    const imports: WorldPlan["imports"] = {};
    const flows: Flow[] = [];
    for (const i of islands) {
      const sup = suppliesOf(i);
      const baseCut = externalShares(i.id, sup);
      const run = (cut: Record<string, number>) =>
        islandPlan(i.goals, i.built, pops[i.id].finals, { region: i.region, cut, tradeIn: tradeIn[i.id], mods: i.mods, countBuilt: opts.countBuilt, targets: i.targets });
      /** Envíos pedidos con «Llega de…»; `viaCircuit`: parte de lo que llega que ya pone un circuito (no se pide a nadie). */
      const supplyFlows = (plan: IslandPlan, viaCircuit: Counts) => {
        const ext = { ...plan.external };
        const unsourced: PopulationDemand["imports"] = [];
        for (const imp of pops[i.id].imports) {
          // Aquí no se puede producir: todo llega de las islas de origen, sea cual sea la parte "local".
          if (splitExternal(i.id, sup, imp.product).length) ext[imp.product] = (ext[imp.product] ?? 0) + imp.perMinute;
          else unsourced.push({ ...imp });
        }
        const out: Flow[] = [];
        for (const [product, rate] of Object.entries(ext)) {
          const asked = Math.max(0, rate - (viaCircuit[product] ?? 0));
          for (const { from, share } of splitExternal(i.id, sup, product)) out.push({ from, to: i.id, product, rate: asked * share });
        }
        return { ext, unsourced, out };
      };
      let plan = run(baseCut);
      let sf = supplyFlows(plan, {});
      // Circuitos: lo que traen de más sobre lo pedido cubre primero lo que nadie envía, luego reduce lo que
      // hay que producir aquí; lo que sobra queda como suministro sin demanda (almacén o uso manual).
      const arrivals = arrivalsTo(i.id).map((m) => {
        const asked = sf.out.filter((f) => f.from === m.from && f.product === m.product).reduce((a, f) => a + f.rate, 0);
        return { m, extra: Math.max(0, m.rate - asked) };
      }).filter((x) => x.extra > EPS);
      const stored: Counts = {};
      if (arrivals.length) {
        const extraBy: Counts = {};
        for (const x of arrivals) extraBy[x.m.product] = (extraBy[x.m.product] ?? 0) + x.extra;
        const cut = { ...baseCut };
        const via: Counts = {};
        const coverU: Counts = {};
        let changed = false;
        for (const [product, A] of Object.entries(extraBy)) {
          const u = sf.unsourced.filter((x) => x.product === product).reduce((a, x) => a + x.perMinute, 0);
          coverU[product] = Math.min(A, u);
          const left = A - coverU[product];
          // Demanda de este producto en la isla: lo que se produce aquí más lo que ya llega pedido.
          const local = plan.rows.filter((r) => reg[r.id]?.productId === product).reduce((a, r) => a + r.exact * perMinute(reg[r.id], i.mods), 0);
          const R = local + (plan.external[product] ?? 0);
          const f = cut[product] ?? 0;
          const add = R > EPS && left > EPS ? Math.min(1 - f, left / R) : 0;
          if (add > EPS) { cut[product] = f + add; via[product] = add * R; changed = true; }
          stored[product] = Math.max(0, left - add * R);
        }
        if (changed) plan = run(cut);
        sf = supplyFlows(plan, via);
        for (const x of sf.unsourced) {
          const take = Math.min(x.perMinute, coverU[x.product] ?? 0);
          x.perMinute -= take; coverU[x.product] = (coverU[x.product] ?? 0) - take;
        }
        sf.unsourced = sf.unsourced.filter((x) => x.perMinute > EPS);
        for (const x of arrivals) {
          const part = x.extra / extraBy[x.m.product];
          const st = (stored[x.m.product] ?? 0) * part;
          flows.push({ from: x.m.from, to: i.id, product: x.m.product, rate: x.extra, circuit: x.m.short ? "short" : "ok", ...(st > EPS ? { stored: st } : {}) });
          // La isla de origen tiene que producir lo que carga.
          (next[x.m.from] ??= {})[x.m.product] = (next[x.m.from][x.m.product] ?? 0) + x.extra;
        }
      }
      imports[i.id] = sf.unsourced;
      for (const f of sf.out) {
        if (!(f.rate > EPS)) continue;
        (next[f.from] ??= {})[f.product] = (next[f.from][f.product] ?? 0) + f.rate;
        flows.push(f);
      }
      plan.external = sf.ext;
      plans[i.id] = plan;
    }
    result = { plans, imports, flows };
    const same = islands.every((i) => {
      const a = tradeIn[i.id] ?? {}, b = next[i.id] ?? {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-9);
    });
    if (same) break;
    tradeIn = next;
  }
  return result;
}
