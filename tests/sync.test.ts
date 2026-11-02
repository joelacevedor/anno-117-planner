import { describe, it, expect } from "vitest";
import { SyncController, type SyncBackend } from "../src/sync/controller";
import { applyOps, diff, formatCode, newCode, parseCode, toRemote, type Remote } from "../src/sync/model";
import { initialState, newIsland, type State } from "../src/core/state";
import { chains } from "../src/data/catalog";

/** Servidor simulado: guarda la partida y avisa a todos los suscriptores. */
function fakeServer() {
  const games = new Map<string, Remote>();
  const subs = new Map<string, Set<(r: Remote) => void>>();
  let n = 0;
  const notify = (code: string) => queueMicrotask(() => subs.get(code)?.forEach((f) => f(structuredClone(games.get(code)!))));
  const backend = (): SyncBackend => {
    const id = `u${++n}`;
    return {
      uid: async () => id,
      exists: async (c) => games.has(c),
      create: async (c, r) => { games.set(c, structuredClone(r)); notify(c); },
      subscribe: (c, on) => { const f = (r: Remote) => on(r, false); (subs.get(c) ?? subs.set(c, new Set()).get(c)!).add(f); if (games.has(c)) queueMicrotask(() => f(structuredClone(games.get(c)!))); return () => subs.get(c)!.delete(f); },
      apply: async (c, ops) => { games.set(c, applyOps(games.get(c)!, ops)); notify(c); },
    };
  };
  return { backend, games };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

function client(server: ReturnType<typeof fakeServer>, code: string, player: string, start: State) {
  const box = { state: start, status: "" as string, players: {} as Record<string, string> };
  const c = new SyncController(server.backend(), code, player, (s) => (box.state = s), (st, p) => { box.status = st; box.players = p; }, 0);
  const edit = (f: (s: State) => State) => { box.state = f(box.state); c.push(box.state); };
  return { box, c, edit };
}

describe("códigos de partida", () => {
  it("10 caracteres sin ambigüedades (sin 0/O/1/I); se aceptan con guion y minúsculas", () => {
    const c = newCode();
    expect(c).toMatch(/^[A-Z2-9]{10}$/);
    expect(parseCode(formatCode(c).toLowerCase())).toBe(c);
    expect(parseCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(parseCode("ABCDE-FGH0J")).toBeNull();
    expect(parseCode("corto")).toBeNull();
  });
});

describe("cambios campo a campo", () => {
  it("dos jugadores tocando campos distintos de la misma isla no se pisan", () => {
    const s = initialState();
    const base = toRemote(s);
    const id = s.islands[0].id;
    const a = structuredClone(base); a.islands[id].built = { b1: 3 };
    const b = structuredClone(base); b.islands[id].goals = { c1: 2 };
    const merged = applyOps(applyOps(base, diff(base, a)), diff(base, b));
    expect(merged.islands[id].built).toEqual({ b1: 3 });
    expect(merged.islands[id].goals).toEqual({ c1: 2 });
  });
  it("borrar una clave de un mapa se propaga", () => {
    const s = initialState(); const id = s.islands[0].id;
    const a = toRemote(s); a.islands[id].built = { b1: 3 };
    const b = structuredClone(a); b.islands[id].built = {};
    expect(applyOps(a, diff(a, b)).islands[id].built).toEqual({});
  });
});

describe("partida compartida entre dos móviles", () => {
  it("lo que pone uno aparece en el otro, y cada uno conserva su idioma e isla abierta", async () => {
    const server = fakeServer();
    const code = newCode();
    const joel = client(server, code, "Joel", initialState("es"));
    await joel.c.create(joel.box.state);
    await tick();
    const friendStart = initialState("en");
    const ana = client(server, code, "Ana", friendStart);
    expect(await ana.c.join(ana.box.state)).toBe(true);
    await tick();
    // Ana ve las islas de Joel
    expect(ana.box.state.islands.map((i) => i.name)).toEqual(["Mi isla de Albion"]);
    expect(ana.box.state.lang).toBe("en");
    expect(ana.box.players).toMatchObject({ u1: "Joel", u2: "Ana" });

    // Ana crea su isla de Latium
    const roma = { ...newIsland("Roma", "Latium"), owner: "Ana" };
    ana.edit((s) => ({ ...s, islands: [...s.islands, roma], current: roma.id }));
    await tick(); await tick();
    expect(joel.box.state.islands.map((i) => i.name)).toEqual(["Mi isla de Albion", "Roma"]);
    expect(joel.box.state.islands[1].owner).toBe("Ana");
    expect(joel.box.state.current).toBe(joel.box.state.islands[0].id); // Joel sigue en su isla

    // Joel pone un objetivo y Ana marca edificios a la vez, en la misma isla
    const wattle = chains.find((c) => c.region === "Albion")!;
    const albionId = joel.box.state.islands[0].id;
    joel.edit((s) => ({ ...s, islands: s.islands.map((i) => (i.id === albionId ? { ...i, goals: { [wattle.id]: 6 } } : i)) }));
    ana.edit((s) => ({ ...s, islands: s.islands.map((i) => (i.id === albionId ? { ...i, built: { [wattle.root]: 2 } } : i)) }));
    await tick(); await tick(); await tick();
    for (const who of [joel, ana]) {
      const isl = who.box.state.islands.find((i) => i.id === albionId)!;
      expect(isl.goals).toEqual({ [wattle.id]: 6 });
      expect(isl.built).toEqual({ [wattle.root]: 2 });
    }

    // La investigación es de la partida
    joel.edit((s) => ({ ...s, techs: ["t38708"] }));
    await tick(); await tick();
    expect(ana.box.state.techs).toEqual(["t38708"]);
  });

  it("un código que no existe no une a nadie", async () => {
    const server = fakeServer();
    const x = client(server, newCode(), "X", initialState());
    expect(await x.c.join(x.box.state)).toBe(false);
  });
});

describe("cambiar de nombre", () => {
  it("el otro jugador ve el nombre nuevo y las islas cambian de dueño", async () => {
    const server = fakeServer();
    const code = "ABCDEFGHJK";
    const a = client(server, code, "Ana", initialState());
    await a.c.create(a.box.state);
    await tick();
    const b = client(server, code, "Bea", { ...initialState(), islands: [newIsland("Otra", "Latium")] });
    b.box.state = { ...b.box.state, current: b.box.state.islands[0].id };
    await b.c.join(b.box.state);
    await tick();
    a.c.rename("Anabel");
    a.edit((s) => ({ ...s, session: { code, player: "Anabel" }, islands: s.islands.map((i) => (i.owner === "Ana" ? { ...i, owner: "Anabel" } : i)) }));
    await tick(); await tick();
    expect(Object.values(b.box.players)).toContain("Anabel");
    expect(b.box.state.islands.some((i) => i.owner === "Anabel")).toBe(true);
    expect(b.box.state.islands.some((i) => i.owner === "Ana")).toBe(false);
  });
});

describe("tipo de partida", () => {
  it("cooperativa por defecto, y el cambio llega al otro jugador", async () => {
    const server = fakeServer();
    const code = "BCDEFGHJKL";
    const a = client(server, code, "Ana", initialState());
    await a.c.create(a.box.state);
    await tick();
    const b = client(server, code, "Bea", initialState());
    await b.c.join(b.box.state);
    await tick();
    expect(b.box.state.mode).toBe("coop");
    a.edit((s) => ({ ...s, mode: "versus" }));
    await tick(); await tick();
    expect(b.box.state.mode).toBe("versus");
  });
});

describe("sin reescrituras en bucle", () => {
  it("el mismo contenido con las claves en otro orden no genera cambios", () => {
    const s = initialState(); const id = s.islands[0].id;
    const a = toRemote({ ...s, islands: [{ ...s.islands[0], supplies: { "1": { x: 1, y: 2 } } }], ships: { capacity: 300, times: { "a|b": 5, "c|d": 9 }, loads: {} } });
    const b = structuredClone(a);
    b.islands[id].supplies = { "1": { y: 2, x: 1 } };
    b.meta.ships = { times: { "c|d": 9, "a|b": 5 }, capacity: 300 };
    delete b.meta.shipLoads;
    expect(diff(a, b)).toEqual([]);
  });
});
