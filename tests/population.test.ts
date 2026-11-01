import { describe, it, expect } from "vitest";
import { levels } from "../src/data/catalog";
import { residentsOf, serviceKey, workforceOf } from "../src/core/population";

const liberti = levels.find((l) => l.name.en === "Liberti")!;

describe("población aproximada", () => {
  it("casas × residentes por casa, y mano de obra según la clase", () => {
    expect(liberti.residents).toBe(6);
    expect(residentsOf(liberti, 127, [])).toBe(762);
    expect(workforceOf(liberti, 762)).toBe(381);
  });
  it("las necesidades desmarcadas restan lo que aportan", () => {
    const market = liberti.services.find((s) => s.name.en === "Market")!;
    expect(residentsOf(liberti, 10, [serviceKey(liberti.id, market.id)])).toBe(10 * (6 - market.pop));
    const good = liberti.needs.find((n) => n.pop > 0)!;
    expect(residentsOf(liberti, 10, [`${liberti.id}:${good.product}`])).toBe(10 * (6 - good.pop));
  });
  it("cada clase trae sus servicios públicos", () => {
    expect(liberti.services.map((s) => s.name.es)).toEqual(["Mercado", "Taberna"]);
  });
});
