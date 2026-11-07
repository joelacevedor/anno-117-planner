/**
 * Regiones e Imperio: balances por producto y recomendaciones (escenarios del brief).
 * Prensa de aceitunas (b4831, Latium): 90 s, 1 t → 2/3 t/min. Destilería (b5570, Albion): 1 t/min.
 */
import { describe, it, expect } from "vitest";
import { empireEconomy, islandEconomy, proposeParts, regionEconomy, routeTransport, type EconIsland, type ShipsState } from "../src/core/economy";
import type { WorldPlan, IslandPlan } from "../src/core/plan";
import { tradeRoutes } from "../src/core/routes";

const OIL = "2149", BEER = "2154", PRESS = "b4831", DIST = "b5570";
const plan = (rows: [string, number][]): IslandPlan =>
  ({ rows: rows.map(([id, exact]) => ({ id, exact, recommended: Math.ceil(exact), built: 0, missing: 0, extra: 0, spare: 0, byChain: {} })), byId: {}, chains: [], toBuild: [], complete: false, external: {}, unsupplied: {} });
const isl = (id: string, region: EconIsland["region"], built: Record<string, number> = {}): EconIsland => ({ id, name: id, region, built });
const noShips: ShipsState = { capacity: 0, times: {}, loads: {}, boats: {}, caps: {}, counts: {} };

describe("Región: balance por producto", () => {
  it("dos islas con excedente y déficit compensables; lo enviado cuenta una sola vez", () => {
    // Hispania necesita 4 prensas (2,67 t/min) y tiene 2; Plantatium necesita 1 y tiene 5 y le envía 1 t/min.
    const islands = [isl("hisp", "Latium", { [PRESS]: 2 }), isl("plan", "Latium", { [PRESS]: 5 })];
    const world: WorldPlan = { plans: { hisp: plan([[PRESS, 2.5]]), plan: plan([[PRESS, 1 + 1.5]]) }, imports: {}, flows: [{ from: "plan", to: "hisp", product: OIL, rate: 1 }] };
    const econ = islandEconomy(islands, world);
    const h = econ.find((x) => x.island === "hisp")!, p = econ.find((x) => x.island === "plan")!;
    expect(h.consume).toBeCloseTo(2.5 * 2 / 3 + 1, 6);
    expect(h.saldo).toBeCloseTo(4 / 3 + 1 - h.consume, 6);
    expect(p.saldo).toBeCloseTo(5 * 2 / 3 - 2.5 * 2 / 3, 6);
    const r = regionEconomy("Latium", islands, econ);
    const oil = r.products.find((x) => x.product === OIL)!;
    expect(oil.net).toBeCloseTo(h.saldo + p.saldo, 6);
    expect(oil.importIn).toBe(0); // el envío interno no es una importación
    // Plantatium cubre el déficit de Hispania: el reparto lo propone
    const emp = empireEconomy(islands, world, econ, noShips);
    const rec = emp.recommendations.find((x) => x.product === OIL && x.to === "hisp")!;
    expect(rec.from).toBe("plan");
    expect(rec.state).toBe("assign"); // ya hay ruta entre las dos islas
  });

  it("el balance regional cuadra: producción − consumo + llegadas de otras regiones − salidas", () => {
    // Celtium (Albion) envía 2 t/min de cerveza a Hispania (Latium); Hispania envía 1 t/min de aceite a Celtium.
    const islands = [isl("hisp", "Latium", { [PRESS]: 4 }), isl("celt", "Albion", { [DIST]: 3 })];
    const world: WorldPlan = {
      plans: { hisp: plan([[PRESS, 3]]), celt: plan([[DIST, 2.5]]) }, imports: { hisp: [{ product: BEER, perMinute: 0.5 }] },
      flows: [{ from: "celt", to: "hisp", product: BEER, rate: 2 }, { from: "hisp", to: "celt", product: OIL, rate: 1 }],
    };
    const econ = islandEconomy(islands, world);
    for (const region of ["Latium", "Albion"] as const) {
      const r = regionEconomy(region, islands, econ);
      expect(r.net).toBeCloseTo(r.produce - r.consume + r.importIn - r.exportOut, 9);
    }
    const lat = regionEconomy("Latium", islands, econ);
    expect(lat.importIn).toBeCloseTo(2, 9);
    expect(lat.exportOut).toBeCloseTo(1, 9);
  });

  it("una isla sin edificios apuntados no da un déficit falso: se marca como estimada", () => {
    const islands = [isl("ost", "Latium")];
    const world: WorldPlan = { plans: { ost: plan([[PRESS, 3]]) }, imports: {}, flows: [] };
    const econ = islandEconomy(islands, world);
    expect(econ[0].saldo).toBeCloseTo(0, 9);
    const r = regionEconomy("Latium", islands, econ);
    expect(r.estimated).toBe(1);
    expect(r.deficit).toBe(0);
  });
});

describe("Imperio: reparto sin dobles asignaciones", () => {
  it("varias islas compiten por el mismo excedente: nunca se reparte dos veces", () => {
    // Celtium tiene 3 t/min de cerveza libres; Hispania y Roma piden 2 cada una (sin origen).
    const islands = [isl("celt", "Albion", { [DIST]: 5 }), isl("hisp", "Latium"), isl("roma", "Latium")];
    const world: WorldPlan = {
      plans: { celt: plan([[DIST, 2]]), hisp: plan([]), roma: plan([]) },
      imports: { hisp: [{ product: BEER, perMinute: 2 }], roma: [{ product: BEER, perMinute: 2 }] }, flows: [],
    };
    const emp = empireEconomy(islands, world, islandEconomy(islands, world), noShips);
    const fromCelt = emp.recommendations.filter((r) => r.from === "celt" && r.state === "no-route");
    expect(fromCelt.reduce((s, r) => s + r.rate, 0)).toBeCloseTo(3, 6);
    // Lo que falta (1 t/min) se propone construir en Celtium (Albion fabrica cerveza)
    const build = emp.recommendations.find((r) => r.state === "build")!;
    expect(build.build).toMatchObject({ island: "celt", building: DIST, count: 1 });
    expect(build.rate).toBeCloseTo(1, 6);
    // determinista: el mismo resultado otra vez
    expect(empireEconomy(islands, world, islandEconomy(islands, world), noShips).recommendations).toEqual(emp.recommendations);
  });

  it("una región que necesita un producto de otra y nadie lo tiene libre: proveedor que tiene que construir", () => {
    const islands = [isl("celt", "Albion"), isl("hisp", "Latium")];
    const world: WorldPlan = { plans: { celt: plan([]), hisp: plan([]) }, imports: { hisp: [{ product: BEER, perMinute: 2.5 }] }, flows: [] };
    const emp = empireEconomy(islands, world, islandEconomy(islands, world), noShips);
    expect(emp.recommendations).toHaveLength(1);
    expect(emp.recommendations[0]).toMatchObject({ state: "build", from: "celt", build: { building: DIST, count: 3 } });
  });

  it("sin ninguna región que lo fabrique: sin proveedor", () => {
    const islands = [isl("hisp", "Latium"), isl("roma", "Latium")];
    const world: WorldPlan = { plans: { hisp: plan([]), roma: plan([]) }, imports: { hisp: [{ product: BEER, perMinute: 1 }] }, flows: [] };
    expect(empireEconomy(islands, world, islandEconomy(islands, world), noShips).recommendations[0].state).toBe("no-provider");
  });
});

describe("Transporte de una ruta", () => {
  const flows = [{ from: "celt", to: "hisp", product: BEER, rate: 10 }];
  const route = tradeRoutes(flows)[0];
  it("sin tiempo de ida y vuelta: sin comprobar (nunca se da por bueno)", () => {
    expect(routeTransport(route, noShips).status).toBe("unchecked");
  });
  it("con tiempo: suficiente o corta según los barcos", () => {
    // 200 t / 10 t/min = 20 min; ida y vuelta 50 min → 3 barcos
    const base = { ...noShips, capacity: 200, times: { [`${route.a}|${route.b}`]: 50 } };
    expect(routeTransport(route, base)).toEqual({ status: "short", missing: 2 });
    expect(routeTransport(route, { ...base, counts: { [`${route.a}|${route.b}#1`]: 3 } }).status).toBe("ok");
  });
  it("una ruta corta aparece en Imperio como pendiente aunque el proveedor esté asignado", () => {
    const islands = [isl("celt", "Albion", { [DIST]: 20 }), isl("hisp", "Latium")];
    const world: WorldPlan = { plans: { celt: plan([[DIST, 10]]), hisp: plan([]) }, imports: {}, flows };
    const ships = { ...noShips, capacity: 200, times: { [`${route.a}|${route.b}`]: 50 } };
    const emp = empireEconomy(islands, world, islandEconomy(islands, world), ships);
    expect(emp.recommendations[0]).toMatchObject({ state: "short", route: { missing: 2 } });
    expect(emp.covered).toEqual([]);
    expect(emp.pairs[0]).toMatchObject({ from: "Albion", to: "Latium", rate: 10 });
  });
});

describe("Reparto en partes al confirmar un proveedor", () => {
  it("sin orígenes: todo de la isla nueva", () => {
    expect(proposeParts({}, "b", 3, 3)).toEqual({ parts: { b: 1 }, actual: 3 });
  });
  it("añadir una isla a lo que ya llega conserva la proporción y dice lo que llegará", () => {
    const r = proposeParts({ a: 1 }, "b", 3, 9); // un tercio de la isla nueva
    expect(r.parts.a / r.parts.b).toBeCloseTo(2, 6);
    expect(r.actual).toBeCloseTo(3, 6);
  });
});
