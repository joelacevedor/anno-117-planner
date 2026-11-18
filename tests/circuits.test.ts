import { describe, expect, it } from "vitest";
import { circuitAdvice, circuitCover, moveStop, newCircuit, planCircuit, type Circuit } from "../src/core/circuits";
import { routeTransport } from "../src/core/economy";
import { tradeRoutes } from "../src/core/routes";
import { applyRemote, diff, toRemote } from "../src/sync/model";
import { initialState } from "../src/core/state";

const base = (): Circuit => ({
  id: "c1", name: "Carbón", ships: 2, slots: 3, slotTons: 50, minutes: 20,
  stops: [
    { island: "A", cargo: [{ product: "coal", op: "load", tons: 100 }] },
    { island: "B", cargo: [{ product: "coal", op: "unload", tons: 50 }, { product: "wine", op: "load", tons: 40 }] },
    { island: "C", cargo: [{ product: "coal", op: "unload", tons: 50 }, { product: "wine", op: "unload", tons: 40 }] },
  ],
});

describe("circuitos con varias paradas", () => {
  it("carga a bordo en cada tramo y bodegas usadas", () => {
    const p = planCircuit(base());
    expect(p.legs.map((l) => [l.from, l.to, l.tons, l.slotsUsed])).toEqual([["A", "B", 100, 2], ["B", "C", 90, 2], ["C", "A", 0, 0]]);
    expect(p.issues).toEqual([]);
    expect(p.every).toBe(10);
  });
  it("entregas por origen y destino en t/min (cada barco hace la vuelta entera)", () => {
    const d = planCircuit(base()).deliveries;
    const by = (k: string) => d.find((x) => `${x.from}|${x.to}|${x.product}` === k)!;
    expect(by("A|B|coal").rate).toBeCloseTo((50 * 2) / 20);
    expect(by("A|C|coal").tons).toBe(50);
    expect(by("B|C|wine").rate).toBeCloseTo((40 * 2) / 20);
  });
  it("detecta falta de bodegas, descargas sin carga y carga que se queda a bordo", () => {
    const c = base();
    c.slots = 1;
    c.stops[2].cargo = [{ product: "coal", op: "unload", tons: 80 }];
    const p = planCircuit(c);
    const kinds = p.issues.map((x) => x.kind).sort();
    expect(kinds).toContain("overSlots");
    expect(kinds).toContain("unloadMore");
    expect(kinds).toContain("leftOnBoard");
    expect(circuitAdvice(c, []).map((a) => a.kind)).toContain("slots");
  });
  it("cada bien ocupa su bodega: 10 t de dos bienes son 2 bodegas", () => {
    const c = base();
    c.stops[0].cargo = [{ product: "x", op: "load", tons: 10 }, { product: "y", op: "load", tons: 10 }];
    c.stops[1].cargo = []; c.stops[2].cargo = [];
    expect(planCircuit(c).legs[0].slotsUsed).toBe(2);
  });
  it("cubre los envíos del plan y recomienda subir la carga si no llega", () => {
    const flows = [{ from: "A", to: "B", product: "coal", rate: 8 }];
    const cover = circuitCover([base()], flows);
    expect(cover.get("A|B|coal")!.status).toBe("short");
    const adv = circuitAdvice(base(), flows);
    expect(adv[0]).toMatchObject({ kind: "raise", product: "coal", tons: 80 });
    expect(circuitCover([base()], [{ from: "A", to: "B", product: "coal", rate: 5 }]).get("A|B|coal")!.status).toBe("ok");
  });
  it("sin tiempo medido queda pendiente de comprobar", () => {
    const c = { ...base(), minutes: 0 };
    expect(circuitCover([c], [{ from: "A", to: "B", product: "coal", rate: 1 }]).get("A|B|coal")!.status).toBe("unchecked");
  });
  it("reordenar paradas", () => {
    const c = moveStop(newCircuit("x", "x", ["A", "B", "C"]), 2, 0);
    expect(c.stops.map((s) => s.island)).toEqual(["C", "A", "B"]);
  });
});

describe("rutas de dos islas y circuitos juntos", () => {
  const ships = { capacity: 300, times: { "A|B": 10 }, loads: {}, boats: {}, caps: {}, counts: {} };
  const flows = [{ from: "A", to: "B", product: "coal", rate: 4 }, { from: "A", to: "B", product: "bread", rate: 1 }];
  it("la ruta de dos islas sigue igual sin circuitos", () => {
    const [r] = tradeRoutes(flows);
    expect(routeTransport(r, ships).status).toBe("ok");
  });
  it("lo que lleva el circuito sale de la ruta; si el circuito no da abasto, la ruta queda corta", () => {
    const [r] = tradeRoutes(flows);
    const short = { ...base(), minutes: 60, ships: 1 }; // 50 t/60 min < 4 t/min
    expect(routeTransport(r, { ...ships, circuits: [short] }).status).toBe("short");
    expect(routeTransport(r, { ...ships, circuits: [base()] }).status).toBe("ok");
  });
});

describe("sincronización de circuitos", () => {
  it("se envían aparte y vuelven igual; una partida sin circuitos no cambia", () => {
    const s = initialState();
    const none = toRemote(s);
    expect(none.meta.shipCircuits).toBeUndefined();
    const withC = { ...s, ships: { ...s.ships, circuits: [base()] } };
    const r = toRemote(withC);
    expect(diff(none, r)).toEqual([{ kind: "update", fields: { shipCircuits: [base()] } }]);
    expect(applyRemote(s, r).ships.circuits).toEqual([base()]);
    // Borrar todos los circuitos se envía como lista vacía.
    expect(diff(r, none)).toEqual([{ kind: "update", fields: { shipCircuits: [] } }]);
  });
});

describe("vuelta en régimen", () => {
  it("lo cargado en la última parada se descarga en la primera de la vuelta siguiente", () => {
    const c: Circuit = { id: "x", name: "x", ships: 1, slots: 3, slotTons: 50, minutes: 10,
      stops: [{ island: "A", cargo: [{ product: "p", op: "unload", tons: 30 }] }, { island: "B", cargo: [{ product: "p", op: "load", tons: 30 }] }] };
    const r = planCircuit(c);
    expect(r.issues).toEqual([]);
    expect(r.deliveries).toEqual([{ from: "B", to: "A", product: "p", tons: 30, rate: 3 }]);
    expect(r.legs.map((l) => l.tons)).toEqual([0, 30]);
  });
  it("cargar más de lo que se descarga se acumula y se avisa", () => {
    const c: Circuit = { id: "x", name: "x", ships: 1, slots: 3, slotTons: 50, minutes: 10,
      stops: [{ island: "A", cargo: [{ product: "p", op: "load", tons: 30 }] }, { island: "B", cargo: [{ product: "p", op: "unload", tons: 20 }] }] };
    expect(planCircuit(c).issues).toContainEqual({ kind: "leftOnBoard", product: "p", tons: 10 });
  });
});
