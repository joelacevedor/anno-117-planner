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

/** Lo que llega de otra isla: conjunto (todo de fuera) o producto → parte de fuera (0–1). */
export type Cut = Set<string> | Record<string, number>;
const shareOf = (cut: Cut | undefined) => (p: string): number =>
  !cut ? 0 : cut instanceof Set ? (cut.has(p) ? 1 : 0) : Math.max(0, Math.min(1, cut[p] ?? 0));
const cutSize = (cut: Cut | undefined) => (!cut ? 0 : cut instanceof Set ? cut.size : Object.values(cut).filter((x) => x > 0).length);

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
    const goal = goals[c.id] ?? 0;
    if (!Number.isInteger(goal) || goal < 0) throw new Error("Goals must be non-negative integers");
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
  // Lo construido de más también trabaja y gasta: sus insumos se suman (hacia atrás, hasta estabilizar).
  if (opts.countBuilt) {
    const done: Counts = {};
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
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
      if (!changed) break;
    }
  }

  for (const [id, n] of Object.entries(built))
    if (n > 0 && !(id in exact) && reg[id]) { order.push(id); exact[id] = 0; }

  const rows: Row[] = order.map((id) => {
    const e = exact[id];
    const recommended = Math.ceil(e - 1e-6);
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
    if (!byId[root]) return { chainId: c.id, goal, fromHouses: houses, fromTrade: trade, finals, running: 0, builtFinals: 0, bottleneck: null, imported, exact: n, surplus: 0 };
    const builtFinals = Math.min(byId[root].built, finals);
    let running = builtFinals;
    let bottleneck: string | null = null;
    for (const id of Object.keys(perFinalCut(c, cut, reg, mods))) {
      if (id === root) continue;
      const r = byId[id];
      const share = r.exact > 0 ? Math.min(1, r.built / r.exact) : 1;
      const can = Math.min(finals, Math.floor(share * n + EPS));
      if (can < running) { running = can; bottleneck = id; }
    }
    // Por tipo de edificio: lo que sobra después de abastecer todo lo que lo usa en la isla.
    const r = byId[root];
    const surplus = Math.max(0, (Math.max(r.built, r.recommended) - r.exact) * perMinute(reg[root], mods));
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
};

export type Flow = { from: string; to: string; product: string; rate: number };

export type WorldPlan = {
  plans: Record<string, IslandPlan>;
  /** Lo que las casas piden, la región no produce y no tiene isla asignada. */
  imports: Record<string, PopulationDemand["imports"]>;
  flows: Flow[];
};

/** Plan de todas las islas. La demanda que una isla trae de otra se suma a la de origen (hasta 8 saltos). */
export function worldPlan(islands: WorldIsland[], factor: number, opts: { countBuilt?: boolean } = {}): WorldPlan {
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
  let tradeIn: Record<string, Counts> = {};
  let result: WorldPlan = { plans: {}, imports: {}, flows: [] };
  for (let pass = 0; pass < 8; pass++) {
    const next: Record<string, Counts> = {};
    const plans: Record<string, IslandPlan> = {};
    const imports: WorldPlan["imports"] = {};
    const flows: Flow[] = [];
    for (const i of islands) {
      const sup = suppliesOf(i);
      const plan = islandPlan(i.goals, i.built, pops[i.id].finals, { region: i.region, cut: externalShares(i.id, sup), tradeIn: tradeIn[i.id], mods: i.mods, countBuilt: opts.countBuilt });
      const ext = { ...plan.external };
      imports[i.id] = [];
      for (const imp of pops[i.id].imports) {
        // Aquí no se puede producir: todo llega de las islas de origen, sea cual sea la parte "local".
        if (splitExternal(i.id, sup, imp.product).length) ext[imp.product] = (ext[imp.product] ?? 0) + imp.perMinute;
        else imports[i.id].push(imp);
      }
      for (const [product, rate] of Object.entries(ext)) {
        for (const { from, share } of splitExternal(i.id, sup, product)) {
          const r = rate * share;
          (next[from] ??= {})[product] = (next[from][product] ?? 0) + r;
          flows.push({ from, to: i.id, product, rate: r });
        }
      }
      plan.external = ext;
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
