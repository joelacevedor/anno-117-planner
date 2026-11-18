/**
 * Circuitos comerciales con varias paradas (rutas de ANNO 117 con más de dos islas).
 *
 * Lo que se sabe del juego (fuentes de la comunidad y blogs de desarrollo, nov. 2026):
 *  - Una ruta visita varias islas en el orden que se elige; en cada parada se cargan o descargan bienes.
 *  - Cada barco hace el recorrido completo por su cuenta: varios barcos no juntan su carga,
 *    pero entregan más a menudo (uno cada `minutos / barcos`).
 *  - La carga va en bodegas: cada bien ocupa al menos una bodega y una bodega lleva un solo bien.
 *    50 t por bodega es lo que publica la comunidad (sin confirmar oficialmente): se puede cambiar.
 *  - El juego no muestra la duración del recorrido: los minutos de la vuelta completa los mide el jugador.
 *
 * Se descarga antes de cargar en cada parada. El barco repite la vuelta: lo que se carga en las últimas
 * paradas se descarga en las primeras de la vuelta siguiente. Lo que se carga y nunca se descarga se avisa
 * (se iría acumulando en el barco).
 */
import type { Flow } from "./plan";

export const SLOT_TONS = 50;

export type CircuitCargo = { product: string; op: "load" | "unload"; tons: number };
export type CircuitStop = { island: string; cargo: CircuitCargo[] };
export type Circuit = {
  id: string;
  name: string;
  /** Barcos que hacen el recorrido. */
  ships: number;
  /** Bodegas de carga por barco (las que quedan libres tras los módulos). */
  slots: number;
  /** Toneladas por bodega. */
  slotTons: number;
  /** Minutos de una vuelta completa (0 = sin medir). */
  minutes: number;
  stops: CircuitStop[];
};

export type Leg = {
  from: string;
  to: string;
  /** producto → toneladas a bordo en este tramo. */
  cargo: Record<string, number>;
  tons: number;
  slotsUsed: number;
  over: boolean;
};
export type Delivery = { from: string; to: string; product: string; tons: number; rate: number };
export type CircuitIssue =
  | { kind: "overSlots"; leg: number; used: number; slots: number }
  | { kind: "unloadMore"; stop: number; product: string; missing: number }
  | { kind: "leftOnBoard"; product: string; tons: number }
  | { kind: "noTime" }
  | { kind: "fewStops" };
export type CircuitPlan = {
  legs: Leg[];
  deliveries: Delivery[];
  issues: CircuitIssue[];
  /** Mayor número de bodegas usadas en un tramo. */
  peakSlots: number;
  /** Cada cuántos minutos pasa un barco por cada parada. */
  every: number;
};

const EPS = 1e-9;
const slotsFor = (cargo: Record<string, number>, slotTons: number) =>
  Object.values(cargo).reduce((a, t) => a + (t > EPS ? Math.ceil(t / Math.max(1, slotTons) - 1e-9) : 0), 0);

/**
 * Carga a bordo en cada tramo, entregas (de qué isla a cuál) y problemas.
 * El barco da vueltas sin parar: se calcula la vuelta en régimen, es decir, con lo que ya lleva a bordo
 * al llegar de nuevo a la primera parada (lo cargado al final se descarga al principio de la siguiente vuelta).
 */
export function planCircuit(c: Circuit): CircuitPlan {
  const ships = Math.max(1, c.ships);
  const perMin = (tons: number) => (c.minutes > 0 ? (tons * ships) / c.minutes : 0);
  const n = c.stops.length;
  type Hold = Record<string, { from: string; tons: number }[]>;
  const total = (h: Hold, p: string) => (h[p] ?? []).reduce((a, y) => a + y.tons, 0);
  /** Una vuelta completa partiendo de `start`; devuelve lo que queda a bordo al final. */
  const loop = (start: Hold, out?: { legs: Leg[]; delivered: Map<string, Delivery>; issues: CircuitIssue[] }) => {
    const hold: Hold = Object.fromEntries(Object.entries(start).map(([p, q]) => [p, q.map((y) => ({ ...y }))]));
    for (let i = 0; i < n; i++) {
      const s = c.stops[i];
      for (const x of s.cargo) {
        if (x.op !== "unload" || !(x.tons > EPS)) continue;
        let left = x.tons;
        const q = hold[x.product] ?? [];
        while (left > EPS && q.length) {
          const take = Math.min(left, q[0].tons);
          q[0].tons -= take; left -= take;
          if (out && q[0].from !== s.island) {
            const k = `${q[0].from}|${s.island}|${x.product}`;
            const d = out.delivered.get(k) ?? { from: q[0].from, to: s.island, product: x.product, tons: 0, rate: 0 };
            d.tons += take; d.rate = perMin(d.tons); out.delivered.set(k, d);
          }
          if (q[0].tons <= EPS) q.shift();
        }
        if (out && left > EPS) out.issues.push({ kind: "unloadMore", stop: i, product: x.product, missing: left });
      }
      for (const x of s.cargo) if (x.op === "load" && x.tons > EPS) (hold[x.product] ??= []).push({ from: s.island, tons: x.tons });
      if (out && n >= 2) {
        const cargo = Object.fromEntries(Object.keys(hold).map((p) => [p, total(hold, p)]).filter(([, t]) => (t as number) > EPS)) as Record<string, number>;
        const used = slotsFor(cargo, c.slotTons);
        const over = used > c.slots;
        out.legs.push({ from: s.island, to: c.stops[(i + 1) % n].island, cargo, tons: Object.values(cargo).reduce((a, t) => a + t, 0), slotsUsed: used, over });
        if (over) out.issues.push({ kind: "overSlots", leg: i, used, slots: c.slots });
      }
    }
    return hold;
  };
  const issues: CircuitIssue[] = [];
  if (n < 2) issues.push({ kind: "fewStops" });
  const first = loop({});
  const out = { legs: [] as Leg[], delivered: new Map<string, Delivery>(), issues };
  const second = loop(first, out);
  // Lo que se carga y nunca se descarga se acumula vuelta a vuelta.
  for (const p of new Set([...Object.keys(first), ...Object.keys(second)])) {
    const grow = total(second, p) - total(first, p);
    if (grow > EPS) issues.push({ kind: "leftOnBoard", product: p, tons: grow });
  }
  if (!(c.minutes > 0)) issues.push({ kind: "noTime" });
  const legs = out.legs;
  return {
    legs, deliveries: [...out.delivered.values()], issues,
    peakSlots: legs.reduce((m, l) => Math.max(m, l.slotsUsed), 0),
    every: c.minutes > 0 ? c.minutes / ships : 0,
  };
}

export type CoverStatus = "ok" | "short" | "unchecked";
/** Lo que los circuitos cubren de los envíos que pide el plan: "origen|destino|producto". */
export type Cover = Map<string, { rate: number; need: number; status: CoverStatus; circuits: string[] }>;

/** Envíos del plan que algún circuito lleva, y si llega lo que se pide. */
export function circuitCover(circuits: Circuit[], flows: Flow[]): Cover {
  const need = new Map<string, number>();
  for (const f of flows) if (f.rate > EPS && f.from !== f.to) need.set(`${f.from}|${f.to}|${f.product}`, (need.get(`${f.from}|${f.to}|${f.product}`) ?? 0) + f.rate);
  const out: Cover = new Map();
  for (const c of circuits) {
    const p = planCircuit(c);
    const broken = p.issues.some((x) => x.kind === "overSlots");
    for (const d of p.deliveries) {
      const k = `${d.from}|${d.to}|${d.product}`;
      const e = out.get(k) ?? { rate: 0, need: need.get(k) ?? 0, status: "ok" as CoverStatus, circuits: [] };
      e.rate += d.rate;
      e.circuits.push(c.id);
      if (!(c.minutes > 0)) e.status = e.status === "short" ? "short" : "unchecked";
      if (broken) e.status = "short";
      out.set(k, e);
    }
  }
  for (const e of out.values()) if (e.status === "ok" && e.need > 0 && e.rate < e.need * 0.98) e.status = "short";
  return out;
}

/** Recomendaciones para un circuito frente a lo que pide el plan. */
export type CircuitAdvice =
  | { kind: "raise"; from: string; to: string; product: string; tons: number; now: number }
  | { kind: "ships"; ships: number }
  | { kind: "slots"; slots: number };

export function circuitAdvice(c: Circuit, flows: Flow[]): CircuitAdvice[] {
  const out: CircuitAdvice[] = [];
  const p = planCircuit(c);
  if (c.minutes > 0) {
    const ships = Math.max(1, c.ships);
    for (const d of p.deliveries) {
      const need = flows.filter((f) => f.from === d.from && f.to === d.to && f.product === d.product).reduce((a, f) => a + f.rate, 0);
      if (need > 0 && d.rate < need * 0.98) out.push({ kind: "raise", from: d.from, to: d.to, product: d.product, tons: Math.ceil((need * c.minutes) / ships), now: d.tons });
    }
  }
  // Si no cabe: cuántas bodegas harían falta, o cuántos barcos repartiendo la carga.
  if (p.peakSlots > c.slots && c.slots > 0) {
    out.push({ kind: "slots", slots: p.peakSlots });
    out.push({ kind: "ships", ships: Math.ceil((Math.max(1, c.ships) * p.peakSlots) / c.slots) });
  }
  return out;
}

export function newCircuit(id: string, name: string, islands: string[]): Circuit {
  return { id, name, ships: 1, slots: 3, slotTons: SLOT_TONS, minutes: 0, stops: islands.map((island) => ({ island, cargo: [] })) };
}

/** Mueve la parada `i` a la posición `j`. */
export function moveStop(c: Circuit, i: number, j: number): Circuit {
  const stops = [...c.stops];
  const [s] = stops.splice(i, 1);
  stops.splice(Math.max(0, Math.min(stops.length, j)), 0, s);
  return { ...c, stops };
}
