import { describe, expect, it } from "vitest";
import { chainRates, r1 } from "../src/core/chainRates";
import { islandPlan, perFinal, perMinute } from "../src/core/plan";
import { buildings, chains } from "../src/data/catalog";

const chain = chains.find((c) => c.region === "Latium" && c.category === "Food" && Object.keys(perFinal(c)).length > 1)!;
const root = chain.root;
const rate = perMinute(buildings[root]);

describe("cifras por cadena (t/min)", () => {
  /** Todos los proveedores de la cadena con k veces lo que pide un edificio final, y `finals` finales. */
  const fed = (finals: number, k: number) => ({
    ...Object.fromEntries(Object.entries(perFinal(chain)).map(([id, n]) => [id, Math.ceil(n * k - 1e-9)])),
    [root]: finals,
  });

  it("demanda = objetivo × producción de un edificio final; producción = finales construidos", () => {
    const built = fed(2, 3);
    const plan = islandPlan({ [chain.id]: 3 }, built, {}, { region: "Latium" });
    const [x] = chainRates(plan, built);
    expect(x.chainId).toBe(chain.id);
    expect(x.demand).toBeCloseTo(3 * rate);
    expect(x.production).toBeCloseTo(2 * rate);
    expect(x.capacity).toBeCloseTo(2 * rate);
    expect(x.limitedBy).toBeNull();
    expect(x.coverage).toBeCloseTo(2 / 3);
    expect(x.deficit).toBeCloseTo(rate);
    expect(x.state).toBe("short");
    expect(x.toBuild).toBeGreaterThanOrEqual(1);
  });

  it("sin insumos no se produce: la producción la limita el proveedor que no da abasto", () => {
    const supplier = Object.keys(perFinal(chain)).find((id) => id !== root)!;
    const half = { ...fed(3, 3), [supplier]: 0 };
    const plan0 = islandPlan({ [chain.id]: 3 }, half, {}, { region: "Latium" });
    const [x0] = chainRates(plan0, half);
    expect(x0.capacity).toBeCloseTo(3 * rate);
    expect(x0.production).toBe(0);
    expect(x0.limitedBy).toBe(supplier);
    expect(x0.state).toBe("short");
    // Con parte de lo que pide el proveedor, la cadena recibe esa parte (los edificios son enteros).
    const need = plan0.byId[supplier].exact;
    const k = Math.max(1, Math.floor(need / 2));
    const some = { ...half, [supplier]: k };
    const [x1] = chainRates(islandPlan({ [chain.id]: 3 }, some, {}, { region: "Latium" }), some);
    expect(x1.production).toBeCloseTo((k / need) * 3 * rate);
    expect(x1.deficit).toBeCloseTo(3 * rate - x1.production);
  });

  it("producir de más es válido: cobertura > 100 % y excedente aparte", () => {
    const ids = perFinal(chain);
    const built = Object.fromEntries(Object.entries(ids).map(([id, n]) => [id, Math.ceil(n * 4)]));
    const plan = islandPlan({ [chain.id]: 2 }, built, {}, { region: "Latium" });
    const [x] = chainRates(plan, built);
    expect(x.coverage).toBeGreaterThan(1);
    expect(x.surplus).toBeCloseTo(x.production - x.demand);
    expect(x.deficit).toBe(0);
    expect(x.state).toBe("ok");
  });

  it("una cadena solo construida (sin demanda) aparece como excedente", () => {
    const plan = islandPlan({}, { [root]: 2 }, {}, { region: "Latium" });
    const x = chainRates(plan, { [root]: 2 }, undefined, [chain]).find((c) => c.chainId === chain.id)!;
    expect(x).toMatchObject({ state: "spare", demand: 0, coverage: 1 });
    expect(x.surplus).toBeCloseTo(2 * rate);
  });

  it("los modificadores cambian la producción", () => {
    const mods = { boost: { [root]: 1.5 } } as never;
    const built = fed(2, 4);
    const plan = islandPlan({ [chain.id]: 2 }, built, {}, { region: "Latium", mods });
    const [x] = chainRates(plan, built, mods);
    expect(x.production).toBeCloseTo(2 * perMinute(buildings[root], mods));
  });

  it("con producción suficiente la cadena está cubierta aunque el plan pida más edificios", () => {
    // 5 finales y proveedores para 3: contando lo construido, el plan pide más proveedores,
    // pero lo que llega ya da para la demanda (3): cubierta, con edificios pendientes aparte.
    const built = fed(5, 3);
    const plan = islandPlan({ [chain.id]: 3 }, built, {}, { region: "Latium", countBuilt: true });
    const [x] = chainRates(plan, built, undefined, undefined, true);
    expect(x.toBuild).toBeGreaterThan(0);
    expect(x.production).toBeGreaterThanOrEqual(x.demand - 0.05);
    expect(x.deficit).toBe(0);
    expect(x.state).toBe("ok");
  });

  it("r1 redondea a un decimal sin -0", () => {
    expect(r1(1.26)).toBe(1.3);
    expect(Object.is(r1(-0.01), 0)).toBe(true);
  });
});

describe("intermedios que usan otras cadenas", () => {
  it("su demanda es el consumo interno, no «sin demanda»", () => {
    const supplier = Object.keys(perFinal(chain)).find((id) => id !== root)!;
    const sub = chains.find((c) => c.region === "Latium" && c.root === supplier);
    if (!sub) return; // el insumo no tiene cadena propia en el catálogo
    const built = { [root]: 2, [supplier]: 1 };
    const plan = islandPlan({ [chain.id]: 2 }, built, {}, { region: "Latium" });
    const x = chainRates(plan, built, undefined, [chain, sub]).find((r) => r.chainId === sub.id)!;
    expect(x.state).not.toBe("spare");
    expect(x.demand).toBeCloseTo(plan.byId[supplier].exact * perMinute(buildings[supplier]));
  });
});

describe("varios productores del mismo producto", () => {
  const byName = (en: string) => Object.values(buildings).find((b) => b.region === "Latium" && b.name.en === en)!.id;
  const burner = byName("Charcoal Burner"), mine = byName("Coal Mine");
  const coal = chains.find((c) => c.region === "Latium" && c.root === burner)!;

  it("la producción suma quemaderos y minas construidos", () => {
    const built = { [burner]: 1, [mine]: 2 };
    const plan = islandPlan({ [coal.id]: 4 }, built, {}, { region: "Latium" });
    const [x] = chainRates(plan, built);
    const r = perMinute(buildings[burner]);
    expect(x.demand).toBeCloseTo(4 * r);
    expect(x.capacity).toBeCloseTo(r + 2 * perMinute(buildings[mine]));
    // Faltan: 4 − 2 minas equivalentes = 2 quemaderos; hay 1.
    expect(plan.byId[burner].recommended).toBe(2);
    expect(plan.byId[mine].missing).toBe(0);
    expect(x.buildings.map((b) => b.id).sort()).toEqual([burner, mine].sort());
  });

  it("un insumo con dos productores no frena la cadena si entre los dos llegan", () => {
    const user = chains.find((c) => c.region === "Latium" && Object.keys(perFinal(c)).includes(burner) && c.root !== burner)!;
    const ids = Object.keys(perFinal(user));
    const need = perFinal(user);
    // Todo construido para 1 final salvo el carbón, que sale solo de minas.
    const built: Record<string, number> = Object.fromEntries(ids.map((id) => [id, Math.ceil(need[id] - 1e-9)]));
    built[burner] = 0;
    built[mine] = Math.ceil(need[burner] * perMinute(buildings[burner]) / perMinute(buildings[mine]) - 1e-9);
    const plan = islandPlan({ [user.id]: 1 }, built, {}, { region: "Latium" });
    const x = chainRates(plan, built).find((r) => r.chainId === user.id)!;
    expect(x.limitedBy).toBeNull();
    expect(x.state).toBe("ok");
    expect(plan.byId[burner]?.missing ?? 0).toBe(0);
  });
});
