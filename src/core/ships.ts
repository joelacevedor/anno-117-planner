/** Carga de un barco en una ruta: cuánto llevar de cada producto y cada cuánto tiene que volver. */
export type Leg = { product: string; rate: number }[];
export type LegLoad = { product: string; rate: number; load: number; minutes: number; fixed: boolean };

export const DEFAULT_CAPACITY = 300;

/**
 * Reparte la capacidad del barco entre los productos de un sentido. Lo que el jugador fija se respeta;
 * el resto se reparte según lo que se gasta de cada uno, para que todos se acaben a la vez.
 */
export function planLeg(leg: Leg, capacity: number, fixed: Record<string, number> = {}) {
  const set = leg.filter((x) => fixed[x.product] > 0);
  const free = leg.filter((x) => !(fixed[x.product] > 0));
  const left = Math.max(0, capacity - set.reduce((s, x) => s + fixed[x.product], 0));
  const freeRate = free.reduce((s, x) => s + x.rate, 0);
  const loads: LegLoad[] = leg.map((x) => {
    const isFixed = fixed[x.product] > 0;
    const load = isFixed ? fixed[x.product] : freeRate > 0 ? (left * x.rate) / freeRate : 0;
    return { product: x.product, rate: x.rate, load, minutes: x.rate > 0 ? load / x.rate : Infinity, fixed: isFixed };
  });
  const total = loads.reduce((s, x) => s + x.load, 0);
  const deadline = loads.reduce((m, x) => Math.min(m, x.minutes), Infinity);
  return { loads, total, deadline, over: total > capacity + 1e-6 };
}

/** Barcos necesarios si la ida y vuelta dura `trip` minutos y el barco tiene que volver cada `deadline`. */
export const shipsNeeded = (trip: number, deadline: number) =>
  trip > 0 && Number.isFinite(deadline) && deadline > 0 ? Math.max(1, Math.ceil(trip / deadline - 1e-9)) : 0;
