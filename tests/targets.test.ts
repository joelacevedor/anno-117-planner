import { describe, expect, it } from "vitest";
import { chainRates, isShort } from "../src/core/chainRates";
import { chainCauses } from "../src/core/causes";
import { modsFor } from "../src/core/boosts";
import { islandPlan, perFinal, perMinute, worldPlan } from "../src/core/plan";
import { initialState, newIsland, parse, type State } from "../src/core/state";
import { buildings, chains } from "../src/data/catalog";
import { applyRemote, diff, toRemote } from "../src/sync/model";

const chain = chains.find((c) => c.region === "Latium" && c.category === "Food" && Object.keys(perFinal(c)).length > 1)!;
const rate = perMinute(buildings[chain.root]);

describe("objetivos en t/min (fuente única)", () => {
  it("la demanda de un objetivo en t/min es exactamente ese ritmo", () => {
    const plan = islandPlan({}, {}, {}, { region: "Latium", targets: { [chain.id]: 2.5 } });
    const [x] = chainRates(plan, {});
    expect(x.demand).toBeCloseTo(2.5);
    expect(plan.byId[chain.root].recommended).toBe(Math.ceil(2.5 / rate - 1e-9));
  });

  it("con más productividad hacen falta menos edificios para el mismo t/min", () => {
    const mods = modsFor("Latium", { techs: [], patron: null, events: [], manual: { [chain.root]: 100 } });
    const a = islandPlan({}, {}, {}, { region: "Latium", targets: { [chain.id]: 6 } });
    const b = islandPlan({}, {}, {}, { region: "Latium", targets: { [chain.id]: 6 }, mods });
    expect(chainRates(b, {}, mods)[0].demand).toBeCloseTo(6);
    expect(b.byId[chain.root].exact).toBeCloseTo(a.byId[chain.root].exact / 2);
  });

  it("una cadena tiene un solo objetivo: al cargar, el de t/min sustituye al de edificios", () => {
    const s0 = initialState("es");
    const isl = { ...newIsland("Roma", "Latium"), goals: { [chain.id]: 3 }, targets: { [chain.id]: 4, nope: 1 } };
    const s = parse(JSON.stringify({ ...s0, islands: [isl], current: isl.id }));
    expect(s.islands[0].targets).toEqual({ [chain.id]: 4 });
    expect(s.islands[0].goals[chain.id]).toBeUndefined();
  });

  it("una partida sin objetivos en t/min ni aceptados carga igual y no añade campos", () => {
    const s0 = initialState("es");
    const s = parse(JSON.stringify(s0));
    expect("targets" in s.islands[0]).toBe(false);
    expect("accepted" in s.islands[0]).toBe(false);
  });

  it("los objetivos en t/min y los déficits aceptados se comparten", () => {
    const s0 = initialState("es");
    const isl = { ...newIsland("Roma", "Latium"), targets: { [chain.id]: 4 }, accepted: [chain.id] };
    const s: State = { ...s0, islands: [isl], current: isl.id };
    const back = applyRemote(s0, toRemote(s));
    expect(back.islands[0].targets).toEqual({ [chain.id]: 4 });
    expect(back.islands[0].accepted).toEqual([chain.id]);
    const ops = diff(toRemote(s), toRemote({ ...s, islands: [{ ...isl, targets: { [chain.id]: 5 } }] }));
    expect(ops).toEqual([{ kind: "update", island: isl.id, fields: { [`targets.${chain.id}`]: 5 } }]);
  });
});

describe("déficits aceptados y causas", () => {
  it("un déficit aceptado no cuenta como «Con déficit»", () => {
    const plan = islandPlan({ [chain.id]: 2 }, {}, {}, { region: "Latium" });
    const [x] = chainRates(plan, {});
    expect(isShort(x)).toBe(true);
    expect(isShort({ ...x, accepted: true })).toBe(false);
  });

  it("las causas dicen qué edificios faltan, qué insumo frena y la productividad baja", () => {
    const supplier = Object.keys(perFinal(chain)).find((id) => id !== chain.root)!;
    const built = { [chain.root]: 2 };
    const mods = modsFor("Latium", { techs: [], patron: null, events: [], manual: { [chain.root]: -50 } });
    const isl = { ...newIsland("Roma", "Latium"), goals: { [chain.id]: 2 }, built };
    const world = worldPlan([{ ...isl, mods }], 1);
    const [r] = chainRates(world.plans[isl.id], built, mods);
    const causes = chainCauses({ island: isl, chain, rate: r, boosts: mods.detail, world, islands: [isl], modsByIsland: { [isl.id]: mods }, ships: initialState().ships });
    expect(causes).toContainEqual(expect.objectContaining({ kind: "build", id: supplier }));
    expect(causes).toContainEqual({ kind: "productivity", id: chain.root, pct: 50 });
  });

  it("si la isla de origen tiene déficit de lo que envía, se dice", () => {
    const final = buildings[chain.root].productId;
    const a = { ...newIsland("A", "Latium"), goals: { [chain.id]: 2 }, supplies: { [final]: "b" } };
    const b = { ...newIsland("B", "Latium"), id: "b" };
    const world = worldPlan([a, b], 1);
    const [r] = chainRates(world.plans[a.id], {});
    const causes = chainCauses({ island: a, chain, rate: r, boosts: {}, world, islands: [a, b], modsByIsland: {}, ships: initialState().ships });
    expect(causes).toContainEqual({ kind: "source", product: final, from: "b" });
    // Si en B lo aceptan, ya no se señala como causa.
    const causes2 = chainCauses({ island: a, chain, rate: r, boosts: {}, world, islands: [a, { ...b, accepted: [chain.id] }], modsByIsland: {}, ships: initialState().ships });
    expect(causes2.some((c) => c.kind === "source")).toBe(false);
  });
});
