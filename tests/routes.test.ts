import { describe, it, expect } from "vitest";
import { worldPlan, type WorldIsland } from "../src/core/plan";
import { routeGaps, tradeRoutes } from "../src/core/routes";
import { buildings, levels, type Region } from "../src/data/catalog";

const b = (region: Region, en: string) => Object.values(buildings).find((y) => y.region === region && y.name.en === en)!;
const chain = (region: Region, en: string) => "c" + b(region, en).id.slice(1);
const isl = (id: string, region: Region, extra: Partial<WorldIsland> = {}): WorldIsland =>
  ({ id, region, goals: {}, built: {}, houses: {}, needsOff: [], supplies: {}, ...extra });
const liberti = levels.find((l) => l.name.en === "Liberti")!;
const beer = b("Albion", "Brewery").productId;
const mud = b("Albion", "Mud Drier").productId;

describe("rutas", () => {
  it("agrupa por pareja de islas, con cada sentido aparte y la más cargada primero", () => {
    const routes = tradeRoutes([
      { from: "A", to: "B", product: "1", rate: 2 },
      { from: "B", to: "A", product: "2", rate: 1 },
      { from: "A", to: "B", product: "3", rate: 4 },
      { from: "C", to: "A", product: "1", rate: 1 },
      { from: "A", to: "A", product: "9", rate: 5 },
    ]);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ a: "A", b: "B", total: 7 });
    expect(routes[0].ab.map((x) => x.product)).toEqual(["3", "1"]);
    expect(routes[0].ba).toEqual([{ product: "2", rate: 1 }]);
    expect(routes[1]).toMatchObject({ a: "A", b: "C", ab: [], ba: [{ product: "1", rate: 1 }] });
  });

  it("salen del plan mundial", () => {
    const w = worldPlan([isl("A", "Albion"), isl("B", "Albion", { goals: { [chain("Albion", "Labourer's Yard")]: 6 }, supplies: { [mud]: "A" } })], 1);
    expect(tradeRoutes(w.flows)).toEqual([{ a: "A", b: "B", ab: [{ product: mud, rate: 6 }], ba: [], total: 6 }]);
    expect(routeGaps(w)).toEqual([]);
  });

  it("avisa de lo que las casas piden y nadie envía", () => {
    const w = worldPlan([isl("R", "Latium", { houses: { [liberti.id]: 60 } })], 1);
    expect(routeGaps(w).some((g) => g.kind === "noSource" && g.product === beer && g.to === "R")).toBe(true);
  });

  it("avisa cuando el origen elegido no puede producirlo", () => {
    const w = worldPlan([isl("R", "Latium", { houses: { [liberti.id]: 60 }, supplies: { [beer]: "L" } }), isl("L", "Latium")], 1);
    const gap = routeGaps(w).find((g) => g.product === beer);
    expect(gap).toMatchObject({ kind: "cantMake", to: "R", from: "L" });
  });
});
