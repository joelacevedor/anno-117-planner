import { describe, expect, it } from "vitest";
import type { Circuit } from "../src/core/circuits";
import { islandEconomy, regionEconomy, routeTransport, empireEconomy } from "../src/core/economy";
import { perMinute, worldPlan, type WorldIsland } from "../src/core/plan";
import { mergeFlows, routeGaps, tradeRoutes } from "../src/core/routes";
import { buildings, chainForProduct, levels, type Region } from "../src/data/catalog";

const isl = (id: string, region: Region, extra: Partial<WorldIsland> = {}): WorldIsland =>
  ({ id, region, goals: {}, built: {}, houses: {}, needsOff: [], supplies: {}, ...extra });
const hats = Object.values(buildings).find((b) => b.id === "b31770")!.productId; // Gorros de piel (Albion)
const bld = (region: Region, en: string) => Object.values(buildings).find((y) => y.region === region && y.name.en === en)!;
const ship = { capacity: 0, times: {}, loads: {}, boats: {}, caps: {}, counts: {} };
const hatCircuit = (over: Partial<Circuit> = {}): Circuit => ({
  id: "gorros", name: "Gorros de Piel Roma", ships: 1, slots: 3, slotTons: 50, minutes: 15,
  stops: [
    { island: "celtium", cargo: [{ product: hats, op: "load", tons: 150 }] },
    { island: "roma", cargo: [{ product: hats, op: "unload", tons: 150 }] },
  ],
  ...over,
});
const islands = () => [isl("celtium", "Albion"), isl("roma", "Latium")];
const econOf = (w: ReturnType<typeof worldPlan>, list: WorldIsland[]) =>
  islandEconomy(list.map((i) => ({ id: i.id, name: i.id, region: i.region, built: i.built })), w);

describe("circuitos en el comercio de la partida", () => {
  it("Celtium → Roma → Celtium: 150 t cada 15 min = 10 t/min, export de Celtium e import de Roma", () => {
    const list = islands();
    const w = worldPlan(list, 1, { circuits: [hatCircuit()] });
    const f = w.flows.filter((x) => x.product === hats);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ from: "celtium", to: "roma", circuit: "ok" });
    expect(f[0].rate).toBeCloseTo(10);
    // Roma no tiene demanda de gorros: es suministro sin demanda (almacén o eventos), no consumo inventado.
    expect(f[0].stored).toBeCloseTo(10);
    const econ = econOf(w, list);
    const roma = econ.find((x) => x.island === "roma" && x.product === hats)!;
    expect(roma.inflow).toBeCloseTo(10);
    expect(roma.stored).toBeCloseTo(10);
    expect(roma.consume).toBeCloseTo(0);
    expect(roma.saldo).toBeCloseTo(0);
    // Celtium tiene que fabricarlos: el plan le pide 10 t/min de gorros (sus granjas y talleres).
    const celt = econ.find((x) => x.island === "celtium" && x.product === hats)!;
    expect(celt.outflow).toBeCloseTo(10);
    expect(celt.planned).toBeCloseTo(10);
    const root = chainForProduct("Albion", hats)!.root;
    expect(w.plans.celtium.byId[root].exact * perMinute(buildings[root])).toBeCloseTo(10);
    // Región e imperio: Albion exporta 10 a Latium.
    const eis = list.map((i) => ({ id: i.id, name: i.id, region: i.region, built: i.built }));
    expect(regionEconomy("Latium", eis, econ).importIn).toBeCloseTo(10);
    expect(regionEconomy("Albion", eis, econ).exportOut).toBeCloseTo(10);
    const emp = empireEconomy(eis, w, econ, { ...ship, circuits: [hatCircuit()] });
    expect(emp.pairs.find((p) => p.from === "Albion" && p.to === "Latium")?.rate).toBeCloseTo(10);
    // Lo lleva el circuito: la ruta de dos islas no pide barcos aparte.
    const r = tradeRoutes(w.flows)[0];
    expect(routeTransport(r, { ...ship, circuits: [hatCircuit()] }).status).toBe("ok");
    expect(routeGaps(w)).toEqual([]);
  });

  it("si el circuito no tiene bodegas para todo, el suministro no se da por garantizado", () => {
    const w = worldPlan(islands(), 1, { circuits: [hatCircuit({ slots: 2 })] });
    expect(w.flows[0].circuit).toBe("short");
    expect(routeTransport(tradeRoutes(w.flows)[0], { ...ship, circuits: [hatCircuit({ slots: 2 })] }).status).toBe("short");
  });

  it("sin la duración de la vuelta no se estima ningún flujo", () => {
    expect(worldPlan(islands(), 1, { circuits: [hatCircuit({ minutes: 0 })] }).flows).toEqual([]);
  });

  it("lo que sigue a bordo en una escala no cuenta en esa isla, y nada se cuenta dos veces", () => {
    const c = hatCircuit({
      stops: [
        { island: "celtium", cargo: [{ product: hats, op: "load", tons: 150 }] },
        { island: "ostia", cargo: [] },
        { island: "roma", cargo: [{ product: hats, op: "unload", tons: 150 }] },
      ],
    });
    const list = [...islands(), isl("ostia", "Latium")];
    const w = worldPlan(list, 1, { circuits: [c] });
    expect(w.flows.filter((f) => f.from === "ostia" || f.to === "ostia")).toEqual([]);
    const m = mergeFlows(w.flows);
    expect(m).toHaveLength(1);
    expect(m[0].rate).toBeCloseTo(10);
  });

  it("si Roma lo pide con «Llega de…», el circuito lleva ese envío: no se suma otra vez", () => {
    const liberti = levels.find((l) => l.name.en === "Liberti")!;
    const beer = bld("Albion", "Brewery").productId;
    const need = worldPlan([isl("roma", "Latium", { houses: { [liberti.id]: 60 }, supplies: { [beer]: "celtium" } }), isl("celtium", "Albion")], 1);
    const asked = need.flows.find((f) => f.product === beer)!.rate;
    const tons = Math.ceil(asked * 15);
    const c = hatCircuit({ stops: [
      { island: "celtium", cargo: [{ product: beer, op: "load", tons }] },
      { island: "roma", cargo: [{ product: beer, op: "unload", tons }] },
    ] });
    const w = worldPlan([isl("roma", "Latium", { houses: { [liberti.id]: 60 }, supplies: { [beer]: "celtium" } }), isl("celtium", "Albion")], 1, { circuits: [c] });
    const all = w.flows.filter((f) => f.product === beer);
    const total = all.reduce((a, f) => a + f.rate, 0);
    expect(total).toBeCloseTo(tons / 15); // lo que pide el plan + el poco que sobra del redondeo a toneladas
    expect(all.filter((f) => f.circuit).reduce((a, f) => a + f.rate, 0)).toBeCloseTo(tons / 15 - asked);
  });

  it("lo que llega por circuito cubre la demanda de la isla aunque no haya «Llega de…»", () => {
    const liberti = levels.find((l) => l.name.en === "Liberti")!;
    const alone = worldPlan([isl("roma", "Latium", { houses: { [liberti.id]: 60 } }), isl("ostia", "Latium")], 1);
    const target = buildings[alone.plans.roma.chains[0].chainId.replace(/^c/, "b")].productId;
    const need = alone.plans.roma.rows.filter((r) => buildings[r.id].productId === target).reduce((a, r) => a + r.exact * perMinute(buildings[r.id]), 0);
    expect(need).toBeGreaterThan(0);
    const c = hatCircuit({ stops: [
      { island: "ostia", cargo: [{ product: target, op: "load", tons: 150 }] },
      { island: "roma", cargo: [{ product: target, op: "unload", tons: 150 }] },
    ] });
    const w = worldPlan([isl("roma", "Latium", { houses: { [liberti.id]: 60 } }), isl("ostia", "Latium")], 1, { circuits: [c] });
    const left = w.plans.roma.rows.filter((r) => buildings[r.id].productId === target).reduce((a, r) => a + r.exact * perMinute(buildings[r.id]), 0);
    expect(left).toBeCloseTo(Math.max(0, need - 10));
    const f = w.flows.find((x) => x.product === target)!;
    expect(f.stored ?? 0).toBeCloseTo(Math.max(0, 10 - need));
  });
});
