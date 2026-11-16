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

  it("r1 redondea a un decimal sin -0", () => {
    expect(r1(1.26)).toBe(1.3);
    expect(Object.is(r1(-0.01), 0)).toBe(true);
  });
});
