import { describe, expect, test } from "vitest";
import { cleanRatio, perFinal } from "../src/core/plan";
import { buildings, chains } from "../src/data/catalog";

/** Proporción base: recetas y tiempos al 100 %, sin bonificaciones. */
const ratio = (region: string, product: string) => {
  const c = chains.find((c) => c.region === region && c.product.es === product)!;
  expect(c).toBeTruthy();
  const r = cleanRatio(c)!;
  return Object.fromEntries(Object.entries(r.counts).map(([id, n]) => [buildings[id].good.es, n]));
};

describe("proporción base de las cadenas", () => {
  test("Hormigón = 2 Caliza : 3 Sílice : 6 Hormigón en todas las regiones", () => {
    for (const region of ["Latium", "Albion", "Aegyptus"])
      expect(ratio(region, "Hormigón")).toEqual({ Caliza: 2, "Sílice": 3, "Hormigón": 6 });
  });
  test("Ganado sanga → Queso = 1 : 2", () => {
    expect(ratio("Aegyptus", "Queso")).toEqual({ "Ganado sanga": 1, Queso: 2 });
  });
  test("todas las cadenas de todas las regiones tienen una proporción entera que equilibra la producción", () => {
    for (const c of chains) {
      const r = cleanRatio(c);
      expect(r, `${c.region} ${c.product.es}`).not.toBeNull();
      const per = perFinal(c);
      for (const [id, n] of Object.entries(r!.counts)) {
        expect(n).toBeGreaterThan(0);
        expect(Math.abs(n - per[id] * r!.finals)).toBeLessThan(1e-6);
      }
      // Lo que producen los proveedores cubre exactamente lo que consumen sus clientes.
      for (const [id, n] of Object.entries(r!.counts)) {
        const b = buildings[id];
        for (const [inp, qty] of Object.entries(b.inputs)) {
          const need = (n * 60 / b.cycleSeconds) * qty;
          const prov = buildings[inp];
          const made = (r!.counts[inp] ?? 0) * 60 / prov.cycleSeconds * prov.output;
          if (r!.counts[inp]) expect(made).toBeGreaterThanOrEqual(need - 1e-6);
        }
      }
    }
  });
});
