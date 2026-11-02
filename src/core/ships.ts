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

/**
 * Varias rutas (barcos) entre las mismas dos islas. Cada producto de la conexión va en una ruta:
 *  - `boats`: "par|origen|producto" → número de ruta (sin entrada = ruta 1)
 *  - `caps`:  "par#n" → toneladas que lleva esa ruta (sin entrada = la capacidad general)
 */
export type Fleet = { boats: Record<string, number>; caps: Record<string, number> };

export const boatOf = (boats: Record<string, number>, key: string) => boats[key] ?? 1;

/** Rutas en uso entre las claves de la conexión, en orden. */
export const boatsIn = (boats: Record<string, number>, keys: string[]) =>
  [...new Set(keys.map((k) => boatOf(boats, k)))].sort((a, b) => a - b);

/** Mueve un producto a otra ruta y deja las rutas numeradas 1, 2, 3… sin huecos. */
export function assignBoat(fleet: Fleet, pair: string, keys: string[], key: string, boat: number): Fleet {
  const boats = { ...fleet.boats, [key]: Math.max(1, Math.round(boat)) };
  const used = boatsIn(boats, keys);
  const map = new Map(used.map((n, i) => [n, i + 1]));
  for (const k of keys) {
    const n = map.get(boatOf(boats, k)) ?? 1;
    if (n === 1) delete boats[k]; else boats[k] = n;
  }
  const caps: Record<string, number> = {};
  for (const [k, v] of Object.entries(fleet.caps)) {
    if (!k.startsWith(`${pair}#`)) { caps[k] = v; continue; }
    const n = map.get(Number(k.slice(pair.length + 1)));
    if (n) caps[`${pair}#${n}`] = v;
  }
  return { boats, caps };
}
