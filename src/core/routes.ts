import type { Flow, WorldPlan } from "./plan";

/** Una ruta = una pareja de islas, con lo que viaja en cada sentido. `a` < `b` por id. */
export type Route = {
  a: string;
  b: string;
  ab: { product: string; rate: number }[];
  ba: { product: string; rate: number }[];
  total: number;
};

/** Algo que una isla necesita y que ninguna ruta le cubre. */
export type RouteGap =
  | { kind: "noSource"; product: string; to: string; rate: number }
  | { kind: "cantMake"; product: string; to: string; from: string; rate: number };

const EPS = 1e-9;

/** Agrupa los flujos por pareja de islas; las rutas con más carga primero. */
export function tradeRoutes(flows: Flow[]): Route[] {
  const m = new Map<string, Route>();
  for (const f of flows) {
    if (!(f.rate > EPS) || f.from === f.to) continue;
    const [a, b] = f.from < f.to ? [f.from, f.to] : [f.to, f.from];
    const key = `${a}|${b}`;
    let r = m.get(key);
    if (!r) m.set(key, (r = { a, b, ab: [], ba: [], total: 0 }));
    const side = f.from === a ? r.ab : r.ba;
    const same = side.find((x) => x.product === f.product);
    if (same) same.rate += f.rate; else side.push({ product: f.product, rate: f.rate });
    r.total += f.rate;
  }
  const routes = [...m.values()];
  for (const r of routes) { r.ab.sort((x, y) => y.rate - x.rate); r.ba.sort((x, y) => y.rate - x.rate); }
  return routes.sort((x, y) => y.total - x.total || x.a.localeCompare(y.a));
}

/** Lo que falta por conectar en toda la partida. */
export function routeGaps(world: WorldPlan): RouteGap[] {
  const gaps: RouteGap[] = [];
  for (const [to, list] of Object.entries(world.imports))
    for (const x of list) if (x.perMinute > EPS) gaps.push({ kind: "noSource", product: x.product, to, rate: x.perMinute });
  for (const [from, plan] of Object.entries(world.plans))
    for (const product of Object.keys(plan.unsupplied))
      for (const f of world.flows)
        if (f.from === from && f.product === product && f.rate > EPS) gaps.push({ kind: "cantMake", product, to: f.to, from, rate: f.rate });
  return gaps.sort((x, y) => y.rate - x.rate);
}
