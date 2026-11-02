import { describe, it, expect } from "vitest";
import { chains } from "../src/data/catalog";
import { initialState, loadState, saveState, importState, undoImport, parse, KEY, newIsland } from "../src/core/state";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("guardado local", () => {
  it("ida y vuelta conserva la partida", () => {
    const s = memory();
    const st = initialState();
    const albion = chains.find((c) => c.region === "Albion")!;
    st.islands[0].goals = { [albion.id]: 6 };
    st.islands[0].built = { [albion.root]: 3 };
    st.islands[0].houses = { p1500: 20 };
    expect(saveState(st, s)).toBe(true);
    expect(loadState(s)).toEqual(st);
  });
  it("datos dañados no bloquean: se guardan aparte y se empieza limpio", () => {
    const s = memory();
    s.setItem(KEY, "{roto");
    const st = loadState(s);
    expect(st.islands).toHaveLength(1);
    expect(s.m.get(KEY + ":damaged")).toBe("{roto");
  });
  it("importar valida, guarda copia previa y se puede deshacer", () => {
    const s = memory();
    const current = initialState();
    const other = initialState();
    other.islands.push(newIsland("Roma", "Latium"));
    const lat = chains.find((c) => c.region === "Latium")!;
    const alb = chains.find((c) => c.region === "Albion")!;
    other.islands[1].goals = { [lat.id]: 2, [alb.id]: 4, wattle: 1 }; // otra región o id antiguo → se descarta
    const imported = importState(JSON.stringify(other), current, s);
    expect(imported.islands[1].goals).toEqual({ [lat.id]: 2 });
    expect(undoImport(s)).toEqual(current);
    expect(() => importState('{"v":2}', current, s)).toThrow();
    expect(() => parse("x".repeat(300_000))).toThrow();
  });
  it("migra partidas v1 sin casas ni consumo", () => {
    const v1 = { v: 1, lang: "es", motion: "auto", current: "x", islands: [{ id: "x", name: "A", region: "Albion", goals: { wattle: 6 }, built: {} }] };
    const st = parse(JSON.stringify(v1));
    expect(st).toMatchObject({ v: 2, consumption: "Low", islands: [{ goals: {}, houses: {}, needsOff: [] }] });
  });
  it("rechaza edificios no enteros", () => {
    const st = initialState();
    (st.islands[0].built as Record<string, number>)["a-mud"] = 1.5;
    expect(() => parse(JSON.stringify(st))).toThrow();
  });
});

describe("rescatar una partida guardada que no valida", () => {
  it("conserva la partida compartida y las islas válidas", async () => {
    const { repair } = await import("../src/core/state");
    const good = { id: "a", name: "Roma", region: "Latium", goals: {}, built: {} };
    const raw = JSON.stringify({ v: 2, lang: "es", motion: "auto", current: "a", session: { code: "ABCDEFGHJK", player: "Juse" },
      islands: [good, { id: "b", name: "", region: "Mars", goals: {}, built: {} }], ships: { capacity: -5 } });
    const s = repair(raw, "es")!;
    expect(s.session).toEqual({ code: "ABCDEFGHJK", player: "Juse" });
    expect(s.islands.map((i) => i.id)).toEqual(["a"]);
    expect(s.ships.capacity).toBe(0);
  });
});

describe("migración de ids", () => {
  it("la mina de carbón añadida a mano pasa al edificio del juego", () => {
    const raw = JSON.stringify({ ...initialState("es"), islands: [{ id: "a", name: "A", region: "Latium", goals: { c900001: 2 }, built: { b900001: 3 }, producers: { "2085": "b900001" } }], current: "a" });
    const s = parse(raw);
    expect(s.islands[0].built).toEqual({ b144810: 3 });
    expect(s.islands[0].producers).toEqual({ "2085": "b144810" });
  });
});
