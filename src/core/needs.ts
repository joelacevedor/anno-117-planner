/**
 * Necesidades de las casas de una isla: si están en el plan, cuánto piden (t/min) y si están cubiertas.
 * Lógica pura; la usa la pantalla de Casas.
 *
 *  - Fuera del plan: desactivada a mano (needsOff). No cuenta para nada.
 *  - Cubierta: la cadena que la produce aquí no tiene déficit, o llega de otra isla.
 *  - Con déficit: la cadena de aquí produce menos de lo que se pide o le faltan edificios.
 *  - Sin origen: la región no la produce y ninguna isla la envía.
 */
import { chainForProduct, hasDlc, levels, type Level, type Region } from "../data/catalog";
import type { ChainRate } from "./chainRates";
import type { IslandProduct } from "./economy";

const EPS = 1e-6;

export type NeedStatus = "off" | "covered" | "short" | "imported" | "unsourced";

export type NeedRow = {
  level: string;
  product: string;
  /** Clave en needsOff («nivel:producto»). */
  key: string;
  on: boolean;
  /** t/min que piden las casas de este nivel (0 si está fuera del plan). */
  perMinute: number;
  status: NeedStatus;
  /** Cadena que la produce en esta región, si la hay. */
  chainId: string | null;
};

export type NeedsInput = {
  region: Region;
  houses: Record<string, number>;
  needsOff: string[];
  /** Nivel de consumo de la partida (Bajos 1, Medios 1,25, Altos 1,5). */
  factor: number;
  dlcs: readonly string[];
  rates: ChainRate[];
  /** Saldo por producto de esta isla (core/economy). */
  econ: IslandProduct[];
};

/** Necesidades de los niveles con casas, en el orden del juego. */
export function islandNeeds(input: NeedsInput): NeedRow[] {
  const out: NeedRow[] = [];
  const rateOf = new Map(input.rates.map((r) => [r.chainId, r]));
  const econOf = new Map(input.econ.map((x) => [x.product, x]));
  for (const l of levels) {
    const houses = input.houses[l.id] ?? 0;
    if (l.region !== input.region || !(houses > 0) || !hasDlc(l, input.dlcs)) continue;
    for (const n of l.needs) {
      if (!hasDlc(n, input.dlcs)) continue;
      const key = `${l.id}:${n.product}`;
      const on = !input.needsOff.includes(key);
      const chain = chainForProduct(input.region, n.product);
      let status: NeedStatus = "off";
      if (on) {
        const r = chain && rateOf.get(chain.id);
        const x = econOf.get(n.product);
        if (r) status = r.state === "short" ? "short" : "covered";
        else if (x && x.unsourced > EPS) status = "unsourced";
        else if (x && x.inflow > EPS) status = "imported";
        else status = chain ? "covered" : "unsourced";
      }
      out.push({ level: l.id, product: n.product, key, on, perMinute: on ? houses * n.rate * input.factor : 0, status, chainId: chain?.id ?? null });
    }
  }
  return out;
}

/** Necesidades en el plan y cuántas están cubiertas (las que llegan de fuera cuentan como cubiertas). */
export function needsCovered(rows: NeedRow[]) {
  const on = rows.filter((r) => r.on);
  return { covered: on.filter((r) => r.status === "covered" || r.status === "imported").length, total: on.length };
}

/** Lo que consume un nivel, producto a producto (t/min), de mayor a menor. */
export function levelConsumption(rows: NeedRow[], level: Level["id"]) {
  return rows.filter((r) => r.level === level).sort((a, b) => b.perMinute - a.perMinute);
}
