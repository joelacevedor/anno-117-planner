import { describe, it, expect } from "vitest";
import { externalShares, normalizeSources, sourcesOf, splitExternal } from "../src/core/supply";
import { parse } from "../src/core/state";

describe("origen de los productos", () => {
  it("lee el formato antiguo y el nuevo", () => {
    expect(sourcesOf("me", {}, "1")).toEqual({ me: 1 });
    expect(sourcesOf("me", { 1: "a" }, "1")).toEqual({ a: 1 });
    expect(sourcesOf("me", { 1: { a: 2, me: 1 } }, "1")).toEqual({ a: 2, me: 1 });
  });
  it("guarda lo más simple posible", () => {
    expect(normalizeSources("me", { me: 1 })).toBeNull();
    expect(normalizeSources("me", {})).toBeNull();
    expect(normalizeSources("me", { a: 3 })).toBe("a");
    expect(normalizeSources("me", { a: 1, b: 12 })).toEqual({ a: 1, b: 9 });
    expect(normalizeSources("me", { a: 1, gone: 1 }, (id) => id === "a")).toBe("a");
  });
  it("calcula la parte de fuera y el reparto", () => {
    const sup = { 1: "a", 2: { a: 1, b: 3 }, 3: { me: 1, a: 1 } };
    expect(externalShares("me", sup)).toEqual({ 1: 1, 2: 1, 3: 0.5 });
    expect(splitExternal("me", sup, "2")).toEqual([{ from: "a", share: 0.25 }, { from: "b", share: 0.75 }]);
    expect(splitExternal("me", sup, "3")).toEqual([{ from: "a", share: 1 }]);
  });
  it("una partida guardada con varias islas de origen se carga y limpia", () => {
    const isl = (id: string, supplies = {}) => ({ id, name: id, region: "Albion", goals: {}, built: {}, supplies });
    const s = parse(JSON.stringify({ v: 2, lang: "es", motion: "auto", current: "a", islands: [isl("a", { 1: { b: 2, x: 1 }, 2: { a: 1 }, 3: "b" }), isl("b")] }));
    expect(s.islands[0].supplies).toEqual({ 1: "b", 3: "b" });
  });
});
