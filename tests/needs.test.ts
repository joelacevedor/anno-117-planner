import { describe, expect, it } from "vitest";
import { islandNeeds, needsCovered } from "../src/core/needs";
import { chainRates } from "../src/core/chainRates";
import { islandPlan, populationDemand } from "../src/core/plan";
import { chainForProduct, levels } from "../src/data/catalog";

const level = levels.find((l) => l.region === "Latium" && l.needs.filter((n) => chainForProduct("Latium", n.product)).length >= 2)!;
const local = level.needs.filter((n) => chainForProduct("Latium", n.product));

function setup(needsOff: string[], built: Record<string, number> = {}) {
  const houses = { [level.id]: 10 };
  const pop = populationDemand({ region: "Latium", houses, needsOff, factor: 1 });
  const plan = islandPlan({}, built, pop.finals, { region: "Latium" });
  const rates = chainRates(plan, built);
  const econ = pop.imports.map((u) => ({ island: "x", product: u.product, planned: 0, available: 0, hasBuilt: false, produce: 0, consume: u.perMinute, inflow: 0, outflow: 0, unsourced: u.perMinute, saldo: -u.perMinute, from: [], to: [] }));
  return islandNeeds({ region: "Latium", houses, needsOff, factor: 1, dlcs: [], rates, econ });
}

describe("necesidades de las casas", () => {
  it("t/min por nivel = casas × consumo × nivel de consumo; las desactivadas quedan fuera del plan", () => {
    const off = `${level.id}:${local[0].product}`;
    const rows = setup([off]);
    const a = rows.find((r) => r.key === off)!;
    expect(a).toMatchObject({ on: false, status: "off", perMinute: 0 });
    const b = rows.find((r) => r.product === local[1].product)!;
    expect(b.on).toBe(true);
    expect(b.perMinute).toBeCloseTo(10 * local[1].rate);
  });

  it("sin edificios, las que se producen aquí tienen déficit; no cuentan como cubiertas", () => {
    const rows = setup([]);
    const mine = rows.filter((r) => r.chainId);
    expect(mine.every((r) => r.status === "short")).toBe(true);
    const c = needsCovered(rows);
    expect(c.total).toBe(rows.length);
    expect(c.covered).toBe(rows.filter((r) => r.status === "imported").length);
  });

  it("lo que la región no produce y nadie envía queda sin origen", () => {
    const rows = setup([]);
    for (const r of rows.filter((x) => !x.chainId)) expect(r.status).toBe("unsourced");
  });
});
