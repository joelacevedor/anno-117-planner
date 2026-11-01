import { describe, it, expect } from "vitest";
import { planLeg, shipsNeeded } from "../src/core/ships";

describe("carga del barco", () => {
  const leg = [{ product: "barro", rate: 6 }, { product: "tejas", rate: 2 }];
  it("reparte la capacidad según el consumo: todo se acaba a la vez", () => {
    const p = planLeg(leg, 300);
    expect(p.loads.map((x) => x.load)).toEqual([225, 75]);
    expect(p.deadline).toBeCloseTo(37.5);
    expect(p.over).toBe(false);
  });
  it("respeta lo fijado a mano y reparte el resto", () => {
    const p = planLeg(leg, 300, { tejas: 50 });
    expect(p.loads.find((x) => x.product === "barro")!.load).toBe(250);
    expect(p.deadline).toBeCloseTo(25); // las tejas: 50 t / 2 t/min
  });
  it("avisa si no cabe", () => {
    expect(planLeg(leg, 300, { barro: 280, tejas: 50 }).over).toBe(true);
  });
  it("barcos necesarios según lo que tarda la ida y vuelta", () => {
    expect(shipsNeeded(20, 37.5)).toBe(1);
    expect(shipsNeeded(80, 37.5)).toBe(3);
    expect(shipsNeeded(0, 37.5)).toBe(0);
  });
});
