/**
 * Catálogo con Dawn of the Delta: Latium y Albion deben calcular exactamente lo mismo que la
 * versión publicada (0.22.2) mientras no se active el DLC; Egipto y el Nilo, según los datos.
 */
import { describe, it, expect } from "vitest";
import old from "./fixtures/game-0.22.2.json";
import game from "../src/data/game.json";
import { buildings, dlcNeedsOff, hasDlc, levels, regionsFor } from "../src/data/catalog";
import { DEFAULT_DLCS } from "../src/core/state";
import { residentsOf } from "../src/core/population";
import { modsFor } from "../src/core/boosts";
import { nileFactor, perCycle } from "../src/core/nile";
import { perMinute } from "../src/core/plan";

type RawLevel = { id: number; region: string; needs: { product: number; rate: number; pop: number; dlc?: string }[]; services: { id: number; pop: number; dlc?: string }[]; residents: number };
const dlcs = [...DEFAULT_DLCS];

describe("sin activar Dawn of the Delta, Latium y Albion no cambian", () => {
  const oldLevels = old.levels as unknown as RawLevel[];
  it("mismas necesidades, consumo y residentes por casa", () => {
    for (const o of oldLevels) {
      const n = levels.find((l) => l.id === "p" + o.id)!;
      const needs = n.needs.filter((x) => hasDlc(x, dlcs)).map((x) => ({ product: +x.product, rate: x.rate, pop: x.pop }));
      expect(needs, n.name.es).toEqual(o.needs.map((x) => ({ product: x.product, rate: x.rate, pop: x.pop })));
      expect(residentsOf(n, 1, dlcNeedsOff(dlcs)), n.name.es).toBe(o.residents);
    }
  });
  it("mismos edificios con los mismos ciclos, insumos y trabajadores", () => {
    const ob = old.buildings as unknown as Record<string, Record<string, unknown>>;
    const nb = game.buildings as unknown as Record<string, Record<string, unknown>>;
    for (const [id, b] of Object.entries(ob)) {
      const { dlc: _d, nile: _n, ...rest } = nb[id];
      expect(rest, String(b.name)).toEqual(b);
    }
  });
  it("Egipto solo aparece con Dawn of the Delta", () => {
    expect(regionsFor(dlcs)).toEqual(["Latium", "Albion"]);
    expect(regionsFor([...dlcs, "delta"])).toEqual(["Latium", "Albion", "Aegyptus"]);
  });
});

describe("con Dawn of the Delta", () => {
  const withDelta = [...dlcs, "delta"];
  it("los Patricios piden los productos egipcios y suben a 43 residentes por casa", () => {
    const pat = levels.find((l) => l.id === "p1498")!;
    expect(residentsOf(pat, 1, dlcNeedsOff(withDelta))).toBe(43);
    expect(residentsOf(pat, 1, dlcNeedsOff(dlcs))).toBe(40);
  });
  it("Egipto: cinco niveles, de Trilladoras a Gimnasiarcas", () => {
    expect(levels.filter((l) => l.region === "Aegyptus").map((l) => l.name.es)).toEqual(["Trilladoras", "Alfareros", "Cantoras", "Escribas", "Gimnasiarcas"]);
  });
  it("las granjas de ribera se distinguen de las normales", () => {
    expect(buildings.b155404.name.es).toBe("Granja de cebada de ribera");
    expect(buildings.b151993.name.es).toBe("Granja de cebada");
    expect(buildings.b155404.nile).toBe(true);
    expect(buildings.b151993.nile).toBeUndefined();
  });
});

describe("temporadas del Nilo", () => {
  it("Ajet: 25 % de la producción; Shemu: 1 t más por ciclo, sea cual sea la base", () => {
    expect([1, 2, 4].map((o) => perCycle("ajet", o))).toEqual([0.25, 0.5, 1]);
    expect([1, 2, 4].map((o) => perCycle("shemu", o))).toEqual([2, 3, 5]);
    expect([1, 2, 4].map((o) => perCycle("media", o))).toEqual([1.125, 1.75, 3]);
  });
  it("se aplica solo a los edificios de ribera y se combina con las demás mejoras", () => {
    const farm = buildings.b155404; // cebada de ribera, 60 s, 1 t
    const normal = buildings.b151993;
    for (const [season, rate] of [["shemu", 2], ["ajet", 0.25], ["media", 1.125]] as const) {
      const m = modsFor("Aegyptus", { techs: [], patron: null, events: [], manual: {}, nile: season });
      expect(perMinute(farm, m)).toBeCloseTo(rate, 9);
      expect(perMinute(normal, m)).toBeCloseTo(1, 9);
    }
    // +50 % a mano en Shemu: 2 t/min × 1,5
    const boosted = modsFor("Aegyptus", { techs: [], patron: null, events: [], manual: { b155404: 50 }, nile: "shemu" });
    expect(perMinute(farm, boosted)).toBeCloseTo(3, 9);
    expect(nileFactor("media", 1)).toBe(1.125);
  });
});
