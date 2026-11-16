/**
 * Paso 0 (protección): límites, copia forzada antes de una migración, bloqueo de escrituras si la
 * copia no se puede hacer, presupuesto de las copias y copia antes de subir la versión de datos
 * de una partida compartida. Con datos inventados; la copia real va en tests/integrity.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  autoBackup, initialState, KEY, lastLoadReport, listBackups, loadState, MAX_IMPORT_BYTES, MAX_ISLANDS, newIsland, parse,
  resetWriteHold, saveState, writesAreHeld, type State,
} from "../src/core/state";
import { preservation } from "../src/core/integrity";
import { buildings, chains } from "../src/data/catalog";
import { SyncController, type SyncBackend } from "../src/sync/controller";
import { applyOps, toRemote, type Remote } from "../src/sync/model";

const tick = () => new Promise((r) => setTimeout(r, 5));
function memStore(failOn?: (k: string, v: string) => boolean) {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { if (failOn?.(k, v)) throw new Error("quota"); m.set(k, v); }, m };
}
const latiumB = Object.keys(buildings).find((k) => buildings[k].region === "Latium")!;
const latiumC = chains.find((c) => c.region === "Latium")!.id;

function sample(): State {
  const s = initialState("es");
  const isl = { ...newIsland("Roma", "Latium"), built: { [latiumB]: 3 }, goals: { [latiumC]: 2 }, needsOff: ["p1496:2154"] };
  return { ...s, islands: [isl], current: isl.id };
}

afterEach(() => resetWriteHold());

describe("límites", () => {
  it("admite 200 islas y rechaza 201", () => {
    const s = sample();
    const many = (n: number) => ({ ...s, islands: Array.from({ length: n }, (_, k) => ({ ...s.islands[0], id: `i${k}`, name: `Isla ${k}` })), current: "i0" });
    expect(MAX_ISLANDS).toBe(200);
    expect(parse(JSON.stringify(many(200))).islands).toHaveLength(200);
    expect(() => parse(JSON.stringify(many(201)))).toThrow();
  });

  it("importa hasta 2 MB (contando bytes, no caracteres)", () => {
    expect(MAX_IMPORT_BYTES).toBe(2_000_000);
    const s = sample();
    const pad = (n: number, ch: string) => JSON.stringify({ ...s, islands: [{ ...s.islands[0], note: ch.repeat(n) }] });
    expect(() => parse(pad(1_500_000, "a"))).not.toThrow();
    expect(() => parse(pad(2_100_000, "a"))).toThrow("too-large");
    // 800 000 «ñ» son 1,6 millones de bytes en UTF-8: entra; 1,1 millones, no.
    expect(() => parse(pad(800_000, "ñ"))).not.toThrow();
    expect(() => parse(pad(1_100_000, "ñ"))).toThrow("too-large");
  });
});

describe("comparación de integridad", () => {
  it("separa valores neutros quitados de valores con contenido perdidos o cambiados", () => {
    const before = { v: 2, a: 1, b: 0, islands: [{ id: "x", built: { b1: 2, b2: 0 }, needsOff: ["p:1"], goals: {} }] };
    const ok = preservation(before, { v: 2, a: 1, islands: [{ id: "x", built: { b1: 2 }, needsOff: ["p:1"] }] });
    expect(ok.lost).toEqual([]);
    expect(ok.dropped.map((d) => d.path).sort()).toEqual(["b", "islands[x].built.b2", "islands[x].goals"]);
    const bad = preservation(before, { v: 2, a: 2, islands: [{ id: "x", built: {}, needsOff: [] }] });
    expect(bad.lost.map((l) => l.path).sort()).toEqual(["a", "islands[x].built.b1", "islands[x].needsOff"]);
  });
});

describe("copia forzada antes de una migración", () => {
  it("una partida v1 se migra a v2 guardando antes una copia exacta de lo que había", () => {
    const store = memStore();
    const raw = JSON.stringify({ ...sample(), v: 1 });
    store.setItem(KEY, raw);
    const s = loadState(store);
    expect(s.v).toBe(2);
    expect(lastLoadReport()).toMatchObject({ migratedFrom: 1, lost: [], backup: "saved" });
    const b = listBackups(store).find((x) => x.reason === "before-migration")!;
    expect(b.data).toBe(raw);
    expect(writesAreHeld()).toBe(false);
  });

  it("si al cargar se perdería un valor (id desconocido), copia antes de guardar encima", () => {
    const store = memStore();
    const s0 = sample();
    const raw = JSON.stringify({ ...s0, islands: [{ ...s0.islands[0], built: { ...s0.islands[0].built, b999999: 4 } }] });
    store.setItem(KEY, raw);
    loadState(store);
    expect(lastLoadReport().lost).toEqual([`islands[${s0.islands[0].id}].built.b999999`]);
    expect(listBackups(store).some((b) => b.reason === "before-migration" && b.data === raw)).toBe(true);
  });

  it("una carga normal no hace copia (los ceros que se quitan no cuentan)", () => {
    const store = memStore();
    const s0 = sample();
    store.setItem(KEY, JSON.stringify({ ...s0, islands: [{ ...s0.islands[0], goals: { ...s0.islands[0].goals, [latiumC + "x"]: 0 } }] }));
    loadState(store);
    expect(lastLoadReport()).toMatchObject({ migratedFrom: null, lost: [], backup: "none" });
    expect(listBackups(store)).toEqual([]);
  });

  it("si la copia no se puede escribir, la app no guarda encima de la partida", () => {
    const store = memStore((k) => k.endsWith(":auto"));
    const raw = JSON.stringify({ ...sample(), v: 1 });
    store.setItem(KEY, raw);
    const s = loadState(store);
    expect(lastLoadReport().backup).toBe("failed");
    expect(writesAreHeld()).toBe(true);
    expect(saveState(s, store)).toBe(false);
    expect(store.getItem(KEY)).toBe(raw);
  });

  it("la copia de antes de una migración no la empujan fuera las periódicas", () => {
    const store = memStore();
    store.setItem(KEY, JSON.stringify({ ...sample(), v: 1 }));
    const s = loadState(store);
    for (let k = 1; k <= 8; k++) autoBackup({ ...s, techs: [`t${k}`] }, { force: true, now: k }, store);
    expect(listBackups(store).filter((b) => b.reason === "before-migration")).toHaveLength(1);
  });
});

describe("presupuesto de las copias", () => {
  it("con partidas grandes guarda menos copias, siempre al menos la última", () => {
    const store = memStore();
    const s = sample();
    const big = (k: number) => ({ ...s, islands: [{ ...s.islands[0], note: String(k).repeat(900_000) }] }) as State;
    for (let k = 1; k <= 5; k++) autoBackup(big(k), { force: true, now: k }, store);
    const list = listBackups(store);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.reduce((n, b) => n + b.data.length, 0)).toBeLessThanOrEqual(2_500_000);
    expect(list[0].data).toBe(JSON.stringify(big(5)));
  });
});

describe("partida compartida: copia antes de subir la versión de datos", () => {
  function server(initial: Remote) {
    let game = structuredClone(initial);
    const writes: unknown[] = [];
    const subs = new Set<(r: Remote) => void>();
    const backend: SyncBackend = {
      uid: async () => "u1",
      exists: async () => true,
      create: async () => {},
      subscribe: (_c, on) => { const f = (r: Remote) => on(r, false); subs.add(f); queueMicrotask(() => f(structuredClone(game))); return () => subs.delete(f); },
      apply: async (_c, ops) => { writes.push(ops); game = applyOps(game, ops); subs.forEach((f) => queueMicrotask(() => f(structuredClone(game)))); },
    };
    return { backend, writes, get: () => game };
  }

  it("guarda la partida del servidor antes de enviar la subida; si no puede, no envía nada", async () => {
    const s = sample();
    const remote = toRemote(s, { u1: "Ana" });
    const srv = server(remote);
    const seen: State[] = [];
    const c = new SyncController(srv.backend, "ABCDEFGHJK", "Ana", () => {}, () => {}, 0, false, (cur) => { seen.push(cur); return false; });
    await c.join(s);
    await tick();
    c.push({ ...s, dlcs: [...s.dlcs, "delta"] }); // Dawn of the Delta pide versión de datos 2
    await tick(); await tick();
    expect(seen).toHaveLength(1);
    expect(seen[0].dlcs).toEqual(s.dlcs);
    expect(srv.writes).toEqual([]);
    expect(srv.get()).toEqual(remote);

    const c2 = new SyncController(srv.backend, "ABCDEFGHJK", "Ana", () => {}, () => {}, 0, false, () => true);
    await c2.join(s);
    await tick();
    c2.push({ ...s, dlcs: [...s.dlcs, "delta"] });
    await tick(); await tick();
    expect(srv.get().meta.dataVersion).toBe(2);
    c.stop(); c2.stop();
  });
});

describe("listado de partidas de prueba (solo lectura)", () => {
  it("nunca imprime el código de una partida y solo cuenta las marcadas como prueba", async () => {
    // @ts-expect-error módulo .mjs sin tipos
    const m = await import("../scripts/list-preview-games.mjs");
    const ts = (s: string) => ({ toDate: () => new Date(s) });
    const games = [
      { code: "ABCDEFGHJK", data: { meta: { preview: true, players: { a: "x", b: "y" } }, createdAt: ts("2026-10-02T09:00:00Z") }, islands: 2 },
      { code: "KQ7XAM3TZP", data: { meta: { players: { a: "x" } }, createdAt: ts("2026-01-01T00:00:00Z") }, islands: 14 },
    ];
    const s = m.summarize(games);
    expect(s).toMatchObject({ total: 2, reales: 1 });
    expect(s.preview).toEqual([{ huella: m.fingerprint("ABCDEFGHJK"), creada: "2026-10-02 09:00", islas: 2, jugadores: 2, versionDatos: 1 }]);
    const out = m.render(s);
    for (const g of games) expect(out).not.toContain(g.code);
  });
});
