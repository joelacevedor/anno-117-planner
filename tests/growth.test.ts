import { describe, expect, it } from "vitest";
import { growthOutlook, houseDemand } from "../src/core/growth";
import { worldPlan } from "../src/core/plan";
import { residentsOf } from "../src/core/population";
import { initialState, newGrowthPlan, newIsland, parse, type State } from "../src/core/state";
import { levels } from "../src/data/catalog";
import { applyRemote, diff, toRemote } from "../src/sync/model";

const l1 = levels.find((l) => l.region === "Latium")!;
const roma = { ...newIsland("Roma", "Latium"), houses: { [l1.id]: 10 } };
const W = (houses = roma.houses) => [{ ...roma, houses }];

describe("planes de crecimiento", () => {
  it("población y demanda salen de casas por nivel (nada se escribe a mano)", () => {
    const g = growthOutlook(W(), 1, { island: roma.id, houses: { [l1.id]: 30 } })!;
    expect(g.residents.now).toBe(residentsOf(l1, 10, []));
    expect(g.residents.target).toBe(residentsOf(l1, 30, []));
    const d = houseDemand(l1, 30, [], 1);
    for (const x of g.demand) expect(x.target).toBeCloseTo(d[x.product] ?? 0);
    for (const x of g.demand) expect(x.target).toBeCloseTo(x.now * 3);
  });

  it("los edificios del objetivo coinciden con el plan de la isla con esas casas", () => {
    const g = growthOutlook(W(), 1.25, { island: roma.id, houses: { [l1.id]: 400 } })!;
    const direct = worldPlan(W({ [l1.id]: 400 }), 1.25).plans[roma.id];
    for (const b of g.build) expect(b.target).toBe(direct.byId[b.id]?.recommended ?? 0);
    expect(g.build.some((b) => b.target > b.now)).toBe(true);
  });

  it("las necesidades fuera del plan no cuentan", () => {
    const off = `${l1.id}:${l1.needs[0].product}`;
    const g = growthOutlook([{ ...roma, needsOff: [off] }], 1, { island: roma.id, houses: { [l1.id]: 20 } })!;
    expect(g.demand.find((x) => x.product === l1.needs[0].product)).toBeUndefined();
  });

  it("se guardan, se recargan y se comparten entre los dos jugadores", () => {
    const s0 = initialState("es");
    const isl = { ...s0.islands[0], houses: { [levels.find((l) => l.region === "Albion")!.id]: 5 } };
    const plan = { ...newGrowthPlan("Más casas", isl), houses: { [Object.keys(isl.houses)[0]]: 50 } };
    const s: State = { ...s0, islands: [isl], growth: [plan] };
    expect(parse(JSON.stringify(s)).growth).toEqual([plan]);
    const other = applyRemote(s0, toRemote(s));
    expect(other.growth).toEqual([plan]);
    const ops = diff(toRemote({ ...s, growth: [] }), toRemote(s));
    expect(ops).toEqual([{ kind: "update", fields: { growth: [plan] } }]);
    expect(diff(toRemote(s), toRemote(s))).toEqual([]);
  });

  it("una partida sin planes carga con la lista vacía", () => {
    const { growth: _g, ...old } = initialState("es");
    expect(parse(JSON.stringify(old)).growth).toEqual([]);
  });
});
