import { describe, expect, test } from "vitest";
import { perMinute, recipeGroups } from "../src/core/plan";
import { buildings, chains } from "../src/data/catalog";

/** Recetario base: recetas y tiempos al 100 %, sin bonificaciones ni nada de la isla. */
const groups = (region: string, product: string) => {
  const c = chains.find((c) => c.region === region && c.product.es === product);
  expect(c, `${region} ${product}`).toBeTruthy();
  return recipeGroups(c!).map((g) => ({
    out: [g.count, buildings[g.id].good.es],
    in: g.inputs.map((i) => [i.count, buildings[i.id].good.es]),
    ...(g.fuel ? { fuel: [buildings[g.fuel.id].good.es, g.fuel.perOne] } : {}),
  }));
};

describe("recetario base de las cadenas", () => {
  test("Hormigón: 2 Caliza + 3 Sílice → 6 Hormigón, igual en todas las regiones", () => {
    for (const region of ["Latium", "Albion", "Aegyptus"])
      expect(groups(region, "Hormigón")).toEqual([{ out: [6, "Hormigón"], in: [[2, "Caliza"], [3, "Sílice"]] }]);
  });
  test("Ganado sanga → Queso = 1 : 2", () => {
    expect(groups("Aegyptus", "Queso")).toEqual([{ out: [2, "Queso"], in: [[1, "Ganado sanga"]] }]);
  });
  test("Liras de pie se separa en pasos pequeños, sin multiplicar ramas", () => {
    expect(groups("Latium", "Liras de pie")).toEqual([
      { out: [2, "Liras de pie"], in: [[2, "Madera decorada"], [3, "Hilo"]] },
      { out: [2, "Madera decorada"], in: [[3, "Madera de sandáraca"], [2, "Oro"]] },
      { out: [3, "Hilo"], in: [[1, "Ovejas"]] },
      { out: [1, "Oro"], in: [[4, "Mena de oro"]], fuel: ["Carbón", 0.25] },
    ]);
  });
  test("todas las cadenas de todas las regiones: cada paso es entero y equilibra producción y consumo", () => {
    for (const c of chains) {
      const gs = recipeGroups(c);
      const ids = new Set(gs.map((g) => g.id));
      expect(ids.size, `${c.region} ${c.product.es}: pasos repetidos`).toBe(gs.length);
      for (const g of gs) {
        const b = buildings[g.id];
        expect(Number.isInteger(g.count), `${c.region} ${c.product.es}`).toBe(true);
        for (const i of g.inputs) {
          expect(Number.isInteger(i.count), `${c.region} ${c.product.es} ← ${buildings[i.id].good.es}`).toBe(true);
          const need = (g.count * 60) / b.cycleSeconds * i.perCycle;
          expect(Math.abs(i.count * perMinute(buildings[i.id]) - need)).toBeLessThan(1e-6);
        }
        if (g.fuel) {
          const need = 60 / b.cycleSeconds * g.fuel.perCycle;
          expect(Math.abs(g.fuel.perOne * perMinute(buildings[g.fuel.id]) - need)).toBeLessThan(1e-6);
          expect(g.fuel.id).toBe(b.fuelFrom);
        }
        expect(Math.max(g.count, ...g.inputs.map((i) => i.count)), `${c.region} ${c.product.es} ${b.name.es}`).toBeLessThanOrEqual(12);
      }
    }
  });
});
