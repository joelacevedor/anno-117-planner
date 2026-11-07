/**
 * Fase 0 (compatibilidad): partidas guardadas, partidas compartidas con versiones antiguas,
 * islas de regiones que esta versión no conoce, DLC, versión de datos y copias automáticas.
 */
import { describe, it, expect } from "vitest";
import { SyncController, type SyncBackend, type SyncStatus } from "../src/sync/controller";
import { applyOps, applyRemote, DATA_VERSION, diff, toRemote, type Remote } from "../src/sync/model";
import {
  autoBackup, DEFAULT_DLCS, hiddenIslands, importState, initialState, listBackups, loadState, newIsland, parse,
  removesIslands, saveState, withHidden, KEY, type State,
} from "../src/core/state";
import { buildings, chains } from "../src/data/catalog";
import * as legacyState from "./legacy/state-0.22.2";
import { SyncController as LegacyController } from "./legacy/controller-0.22.2";

const tick = () => new Promise((r) => setTimeout(r, 5));

/** Servidor simulado que cuenta las escrituras. */
function fakeServer() {
  const games = new Map<string, Remote>();
  const subs = new Map<string, Set<(r: Remote) => void>>();
  const writes: string[] = [];
  let n = 0;
  const notify = (code: string) => queueMicrotask(() => subs.get(code)?.forEach((f) => f(structuredClone(games.get(code)!))));
  const backend = (): SyncBackend => {
    const id = `u${++n}`;
    return {
      uid: async () => id,
      exists: async (c) => games.has(c),
      create: async (c, r) => { games.set(c, structuredClone(r)); notify(c); },
      subscribe: (c, on) => { const f = (r: Remote) => on(r, false); (subs.get(c) ?? subs.set(c, new Set()).get(c)!).add(f); if (games.has(c)) queueMicrotask(() => f(structuredClone(games.get(c)!))); return () => subs.get(c)!.delete(f); },
      apply: async (c, ops) => { writes.push(id); games.set(c, applyOps(games.get(c)!, ops)); notify(c); },
    };
  };
  return { backend, games, writes };
}

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const latiumBuilding = Object.keys(buildings).find((k) => buildings[k].region === "Latium")!;

/** Una isla tal y como la guardaría una versión futura (región, edificios y campos que esta versión no conoce). */
function egyptIsland() {
  return {
    ...newIsland("Menfis", "Latium"),
    region: "Futurus",
    built: { b990001: 4, b990002: 12 },
    houses: { "990010": 40 },
    tide: "high",
  } as unknown as State["islands"][number];
}

/** Partida compartida de una versión futura: una isla de Latium, una de Egipto y versión de datos 2. */
function futureGame(): { code: string; remote: Remote; egyptId: string; latiumId: string } {
  const s = initialState("es");
  const latium = { ...newIsland("Roma", "Latium"), built: { [latiumBuilding]: 2 } };
  const egypt = egyptIsland();
  const state: State = { ...s, islands: [latium, egypt], current: latium.id };
  const remote = toRemote(state, { u0: "Futuro" });
  for (const i of Object.values(remote.islands)) i.owner = "Futuro"; // como al crear una partida
  remote.meta.dataVersion = DATA_VERSION + 1;
  remote.meta.dlcs = ["ash", "delta", "hippodrome"];
  return { code: "ABCDEFGHJK", remote, egyptId: egypt.id, latiumId: latium.id };
}

describe("partidas guardadas de la versión publicada (0.22.2)", () => {
  it("se abren sin perder nada; los DLC quedan como antes", () => {
    const old = legacyState.initialState("es");
    const isl = old.islands[0];
    isl.built = { [Object.keys(buildings).find((k) => buildings[k].region === "Albion")!]: 3 };
    isl.goals = { [chains.find((c) => c.region === "Albion")!.id]: 2 };
    isl.houses = { "1503": 25 };
    isl.supplies = {};
    old.ships = { capacity: 300, times: { "a|b": 12 }, loads: { "a|b|a|2063": 50 }, boats: {}, caps: {}, counts: {} };
    const raw = JSON.stringify(old);
    const s = parse(raw);
    expect(s.islands[0]).toEqual(legacyState.parse(raw).islands[0]);
    expect(s.ships).toEqual(old.ships);
    expect(s.dlcs).toEqual([...DEFAULT_DLCS]);
  });
});

describe("islas de regiones que esta versión no conoce", () => {
  it("se guardan, se cargan y se exportan sin tocarlas (con sus campos nuevos)", () => {
    const s0 = initialState("es");
    const egypt = egyptIsland();
    const s: State = { ...s0, islands: [...s0.islands, egypt] };
    const store = memStore();
    expect(saveState(s, store)).toBe(true);
    const back = loadState(store);
    expect(back.islands[1]).toEqual(egypt);
    expect(hiddenIslands(back).map((i) => i.id)).toEqual([egypt.id]);
    // exportar e importar
    const imported = importState(JSON.stringify(back), back, store);
    expect(imported.islands[1]).toEqual(egypt);
  });

  it("las islas visibles conservan campos que añada una versión nueva", () => {
    const s0 = initialState("es");
    const isl = { ...s0.islands[0], tide: "low", futureMap: { x: 1 } } as State["islands"][number];
    const back = parse(JSON.stringify({ ...s0, islands: [isl] }));
    expect(back.islands[0]).toMatchObject({ tide: "low", futureMap: { x: 1 } });
  });

  it("editar, borrar o reordenar islas visibles no mueve ni borra las ocultas", () => {
    const s0 = initialState("es");
    const a = newIsland("A", "Latium"), b = newIsland("B", "Albion"), e = egyptIsland();
    const raw: State = { ...s0, islands: [a, e, b], current: a.id };
    const view: State = { ...raw, islands: [a, b] };
    // borrar A
    expect(withHidden(raw, { ...view, islands: [b], current: b.id }).islands.map((i) => i.name)).toEqual(["B", "Menfis"]);
    // reordenar
    expect(withHidden(raw, { ...view, islands: [b, a] }).islands.map((i) => i.name)).toEqual(["B", "Menfis", "A"]);
    // editar
    const edited = withHidden(raw, { ...view, islands: [{ ...a, built: { x: 1 } }, b] });
    expect(edited.islands[1]).toBe(e);
    expect(edited.islands[0].built).toEqual({ x: 1 });
  });
});

describe("partida compartida con una app antigua (0.22.2, sin la fase 0)", () => {
  it("al unirse y editar una isla de Latium no toca la isla de Egipto ni la versión de datos", async () => {
    const srv = fakeServer();
    const g = futureGame();
    srv.games.set(g.code, structuredClone(g.remote));
    let local = legacyState.initialState("es") as State;
    const c = new LegacyController(srv.backend(), g.code, "Antiguo", (s: unknown) => (local = s as State), () => {}, 0);
    await c.join(local as never);
    await tick();
    local = { ...local, islands: local.islands.map((i: State["islands"][number]) => (i.id === g.latiumId ? { ...i, built: { [latiumBuilding]: 5 } } : i)) };
    c.push(local as never);
    await tick(); await tick();
    const after = srv.games.get(g.code)!;
    expect(after.islands[g.egyptId]).toEqual(g.remote.islands[g.egyptId]);
    expect(after.islands[g.latiumId].built).toEqual({ [latiumBuilding]: 5 });
    expect(after.meta.dataVersion).toBe(DATA_VERSION + 1);
    expect(after.meta.dlcs).toEqual(["ash", "delta", "hippodrome"]);
    c.stop();
  });

  it("aunque al recargar descarte la isla de Egipto de su copia local, al reconectar no la borra", async () => {
    const srv = fakeServer();
    const g = futureGame();
    srv.games.set(g.code, structuredClone(g.remote));
    // La app antigua guardó la partida con la isla de Egipto y al recargar no pasa su validación.
    const store = memStore();
    const saved = { ...applyRemote(initialState("es"), g.remote), session: { code: g.code, player: "Antiguo" } };
    store.setItem(KEY, JSON.stringify(saved));
    let local = legacyState.loadState(store) as State;
    expect(local.islands.some((i: State["islands"][number]) => i.id === g.egyptId)).toBe(false);
    const c = new LegacyController(srv.backend(), g.code, "Antiguo", (s: unknown) => (local = s as State), () => {}, 0);
    await c.join(local as never);
    await tick();
    c.push({ ...local, consumption: "High" } as never);
    await tick(); await tick();
    expect(srv.games.get(g.code)!.islands[g.egyptId]).toEqual(g.remote.islands[g.egyptId]);
    c.stop();
  });
});

describe("partida compartida con la fase 0", () => {
  it("si la partida es de una versión más nueva, la muestra y no escribe nada", async () => {
    const srv = fakeServer();
    const g = futureGame();
    srv.games.set(g.code, structuredClone(g.remote));
    let local = initialState("es");
    let status: SyncStatus | "" = "";
    const c = new SyncController(srv.backend(), g.code, "Nuevo", (s) => (local = s), (st) => (status = st), 0);
    await c.join(local as never);
    await tick();
    expect(status).toBe("outdated");
    expect(local.islands.map((i) => i.id)).toEqual([g.latiumId, g.egyptId]);
    c.push({ ...local, consumption: "High" } as never);
    await c.removePlayer("u0");
    await tick(); await tick();
    expect(srv.writes).toEqual([]);
    expect(srv.games.get(g.code)).toEqual(g.remote);
    c.stop();
    await tick();
    expect(srv.writes).toEqual([]);
  });

  it("una partida más nueva con valores que esta versión no conoce se puede guardar en el dispositivo", async () => {
    const srv = fakeServer();
    const g = futureGame();
    (g.remote.meta as { consumption: string }).consumption = "VeryHigh";
    (g.remote.meta as { mode: string }).mode = "teams";
    srv.games.set(g.code, structuredClone(g.remote));
    let local = initialState("es");
    const c = new SyncController(srv.backend(), g.code, "Nuevo", (s) => (local = s), () => {}, 0);
    await c.join(local as never);
    await tick();
    const store = memStore();
    expect(saveState(local, store)).toBe(true);
    expect(loadState(store).consumption).toBe("VeryHigh");
    expect(srv.writes).toEqual([]);
    c.stop();
  });

  it("con versión de datos 1 escribe normal, sin tocar islas ocultas y sin bajar la versión", async () => {
    const srv = fakeServer();
    const g = futureGame();
    g.remote.meta.dataVersion = undefined;
    srv.games.set(g.code, structuredClone(g.remote));
    let raw = initialState("es");
    const c = new SyncController(srv.backend(), g.code, "Nuevo", (s) => (raw = s), () => {}, 0);
    await c.join(raw);
    await tick();
    // La interfaz solo ve Roma; borra Roma y añade una isla nueva.
    const view: State = { ...raw, islands: raw.islands.filter((i) => i.region === "Latium") };
    const nueva = newIsland("Nueva", "Albion");
    raw = withHidden(raw, { ...view, islands: [nueva], current: nueva.id });
    c.push(raw);
    await tick(); await tick();
    const after = srv.games.get(g.code)!;
    expect(Object.keys(after.islands).sort()).toEqual([g.egyptId, nueva.id].sort());
    expect(after.islands[g.egyptId]).toEqual(g.remote.islands[g.egyptId]);
    c.stop();
  });

  it("DLC: una partida sin el ajuste se lee con los valores de antes y no provoca escrituras", () => {
    const s = initialState("es");
    const remote = toRemote(s);
    delete remote.meta.dlcs;
    const local = applyRemote(s, remote);
    expect(local.dlcs).toEqual([...DEFAULT_DLCS]);
    expect(diff(remote, toRemote(local))).toEqual([]);
    const on = toRemote({ ...local, dlcs: [...local.dlcs, "delta"] });
    // Activar Dawn of the Delta sube la versión de datos: las apps con la fase 0 pasan a solo mirar.
    expect(diff(remote, on)).toEqual([{ kind: "update", fields: { dlcs: ["ash", "delta", "hippodrome"], dataVersion: 2 } }]);
  });

  it("la versión de datos nunca baja", () => {
    const s = initialState("es");
    const prev = toRemote(s); prev.meta.dataVersion = DATA_VERSION + 1;
    const next = toRemote(s); // esta app pide 1
    expect(diff(prev, next).some((op) => op.kind === "update" && "dataVersion" in op.fields)).toBe(false);
  });
});

describe("copias automáticas", () => {
  it("una cada 6 horas, como mucho 5, sin repetir la misma", () => {
    const store = memStore();
    const s = initialState("es");
    const t0 = 1_800_000_000_000;
    expect(autoBackup(s, { now: t0 }, store)).toBe(true);
    expect(autoBackup({ ...s, consumption: "High" }, { now: t0 + 1000 }, store)).toBe(false); // demasiado pronto
    for (let k = 1; k <= 6; k++) autoBackup({ ...s, techs: [`t${k}`] }, { now: t0 + k * 7 * 3600_000 }, store);
    const list = listBackups(store);
    expect(list).toHaveLength(5);
    expect(list[0].at).toBeGreaterThan(list[4].at);
    expect(autoBackup({ ...s, techs: ["t6"] }, { force: true }, store)).toBe(false); // igual a la última
  });

  it("antes de que la partida quite islas se guarda una copia que se puede restaurar entera", () => {
    const store = memStore();
    const s0 = initialState("es");
    const prev: State = { ...s0, islands: [...s0.islands, egyptIsland()] };
    const next: State = { ...prev, islands: prev.islands.slice(0, 1) };
    expect(removesIslands(prev, next)).toBe(true);
    expect(removesIslands(prev, prev)).toBe(false);
    autoBackup(prev, { force: true, reason: "before-remote-removal" }, store);
    const [b] = listBackups(store);
    expect(b.reason).toBe("before-remote-removal");
    const restored = importState(b.data, next, store);
    expect(restored.islands).toEqual(prev.islands);
  });

  it("si no cabe, guarda menos copias en vez de fallar", () => {
    let full = false;
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { if (full && v.length > 20_000) throw new Error("quota"); m.set(k, v); } };
    const big = { ...initialState("es"), techs: Array.from({ length: 40 }, (_, i) => "x".repeat(15) + i) };
    for (let k = 0; k < 5; k++) autoBackup({ ...big, consumption: k % 2 ? "High" : "Low", mode: k % 3 ? "coop" : "versus" }, { force: true, now: k }, store);
    full = true;
    expect(autoBackup({ ...big, countBuilt: false }, { force: true, now: 99 }, store)).toBe(true);
    expect(listBackups(store).length).toBeGreaterThanOrEqual(1);
  });
});

describe("versión de prueba (canal de vista previa)", () => {
  it("no lee ni escribe en una partida real; sí en una de prueba", async () => {
    const srv = fakeServer();
    const g = futureGame();
    g.remote.meta.dataVersion = undefined;
    srv.games.set(g.code, structuredClone(g.remote));
    let seen: State | null = null;
    let status = "";
    const c = new SyncController(srv.backend(), g.code, "Prueba", (s) => (seen = s), (st) => (status = st), 0, true);
    expect(await c.join(initialState("es"))).toBe(true);
    await tick();
    expect(status).toBe("blocked");
    expect(seen).toBeNull();
    c.push({ ...initialState("es"), consumption: "High" });
    c.stop();
    await tick();
    expect(srv.writes).toEqual([]);
    expect(srv.games.get(g.code)).toEqual(g.remote);

    // Una partida creada en la versión de prueba queda marcada y se usa con normalidad.
    const p = new SyncController(srv.backend(), "PRUEBA2345", "Prueba", () => {}, (st) => (status = st), 0, true);
    await p.create(initialState("es"));
    await tick();
    expect(srv.games.get("PRUEBA2345")!.meta.preview).toBe(true);
    expect(status).toBe("live");
    p.stop();
  });
});
