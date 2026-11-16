/**
 * Integridad con la copia de referencia de nuestra partida (paso 0).
 * Obligatoria antes de migraciones o de publicar cambios que afecten a los datos: `pnpm integrity`.
 *
 * Todo en memoria: sin red, sin Firebase y sin escribir fuera de la memoria del proceso.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  autoBackup, importState, initialState, KEY, lastLoadReport, listBackups, loadState, MAX_IMPORT_BYTES, parse, repair,
  resetWriteHold, sanitize, saveState, stateSchema, undoImport, type State,
} from "../../src/core/state";
import { preservation } from "../../src/core/integrity";
import { chainById, consumptionLevels, dlcNeedsOff, isKnownRegion } from "../../src/data/catalog";
import { modsFor } from "../../src/core/boosts";
import { worldPlan } from "../../src/core/plan";
import { empireEconomy, islandEconomy } from "../../src/core/economy";
import { routeGaps } from "../../src/core/routes";
import { SyncController, type SyncBackend } from "../../src/sync/controller";
import { applyOps, applyRemote, diff, toRemote, type Remote } from "../../src/sync/model";
import { loadReference } from "./reference";

const REF = loadReference();
const refObj = () => JSON.parse(REF) as Record<string, unknown> & { islands: Record<string, unknown>[] };
/** La partida tal cual, validada pero sin normalizar (lo que tiene hoy la partida compartida). */
const unsanitized = () => stateSchema.parse(refObj()) as State;
const tick = () => new Promise((r) => setTimeout(r, 5));

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

/** Lo mismo que calcula la app (App.tsx) para todas las pantallas. */
function compute(state: State) {
  const factor = consumptionLevels.find((c) => c.id === state.consumption)?.factor ?? 1;
  const known = state.islands.filter((i) => isKnownRegion(i.region));
  const mods = Object.fromEntries(known.map((i) => [i.id, modsFor(i.region, { techs: state.techs, patron: i.patron, events: i.events, manual: i.productivity, producers: i.producers, nile: i.nile })]));
  const dlcOff = dlcNeedsOff(state.dlcs);
  const world = worldPlan(known.map((i) => ({ ...i, needsOff: dlcOff.length ? [...i.needsOff, ...dlcOff] : i.needsOff, mods: mods[i.id] })), factor, { countBuilt: state.countBuilt });
  const econIslands = known.map((i) => ({ id: i.id, name: i.name, region: i.region, built: i.built, mods: mods[i.id] }));
  const econ = islandEconomy(econIslands, world);
  const empire = empireEconomy(econIslands, world, econ, state.ships);
  // Lo que la interfaz cuenta a partir de objetivos y casas (p. ej. «N objetivos», pestaña inicial).
  const counts = state.islands.map((i) => ({
    goals: Object.values(i.goals).filter((n) => n > 0).length,
    houses: Object.values(i.houses).some((n) => n > 0),
    chainsWithGoal: Object.entries(i.goals).filter(([, n]) => n > 0).map(([k]) => k).sort(),
  }));
  return { world, econ, empire, gaps: routeGaps(world), counts };
}

/** Comparación numérica tolerante a redondeos de coma flotante, pero exacta en estructura. */
const round = (v: unknown): unknown =>
  typeof v === "number" ? Math.round(v * 1e9) / 1e9 : Array.isArray(v) ? v.map(round) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;

beforeEach(() => resetWriteHold());

describe("carga de la copia de referencia", () => {
  it("no pierde ni cambia ningún valor con contenido", () => {
    const loaded = parse(REF);
    const rep = preservation(refObj(), loaded);
    expect(rep.lost.map((l) => l.path)).toEqual([]);
  });

  it("solo quita valores a 0 de objetivos, edificios y viviendas", () => {
    const rep = preservation(refObj(), parse(REF));
    for (const d of rep.dropped) {
      expect(d.path).toMatch(/^islands\[[^\]]+\]\.(goals|built|houses)\.[^.]+$/);
      expect(d.value).toBe(0);
    }
    const by = (f: string) => rep.dropped.filter((d) => d.path.includes(`].${f}.`)).length;
    console.info(`Valores a 0 normalizados: ${rep.dropped.length} (objetivos ${by("goals")}, edificios ${by("built")}, viviendas ${by("houses")})`);
  });

  it("quitar esos ceros no cambia ningún cálculo (planes, economía, Imperio, rutas, recuentos)", () => {
    expect(round(compute(parse(REF)))).toEqual(round(compute(unsanitized())));
  });

  it("los objetivos a 0 corresponden a cadenas conocidas (son objetivos vaciados, no datos perdidos)", () => {
    for (const isl of refObj().islands as { goals: Record<string, number>; region: string }[])
      for (const [k, n] of Object.entries(isl.goals)) if (n === 0) expect(chainById[k]?.region).toBe(isl.region);
  });

  it("conserva todas las necesidades desactivadas, isla por isla y en el mismo orden", () => {
    const loaded = parse(REF);
    const before = refObj().islands as { id: string; needsOff: string[] }[];
    const total = before.reduce((n, i) => n + i.needsOff.length, 0);
    expect(total).toBeGreaterThan(0);
    for (const i of before) expect(loaded.islands.find((x) => x.id === i.id)!.needsOff).toEqual(i.needsOff);
    console.info(`Necesidades desactivadas conservadas: ${total}`);
  });

  it("conserva islas, regiones, orden, isla abierta y ajustes de partida", () => {
    const loaded = parse(REF);
    const o = refObj();
    expect(loaded.islands.map((i) => [i.id, i.name, i.region, i.owner])).toEqual(o.islands.map((i) => [i.id, i.name, i.region, i.owner]));
    expect(loaded.current).toBe(o.current);
    for (const k of ["lang", "motion", "consumption", "mode", "countBuilt", "techs", "dlcs", "ships"] as const) expect(loaded[k]).toEqual(o[k]);
  });

  it("abrirla en un dispositivo no hace copia de migración (no hay nada que migrar)", () => {
    const store = memStore();
    store.setItem(KEY, REF);
    loadState(store);
    expect(lastLoadReport()).toMatchObject({ migratedFrom: null, lost: [], backup: "none" });
  });

  it("el rescate de datos dañados (repair) recupera la partida entera", () => {
    expect(repair(REF, "es")).toEqual(parse(REF));
  });
});

describe("guardar, exportar, copias y restaurar", () => {
  it("guardar y recargar da lo mismo, también la segunda vez", () => {
    const store = memStore();
    const a = parse(REF);
    expect(saveState(a, store)).toBe(true);
    const b = loadState(store);
    expect(b).toEqual(a);
    expect(saveState(b, store)).toBe(true);
    expect(store.getItem(KEY)).toBe(JSON.stringify(a));
    expect(loadState(store)).toEqual(a);
  });

  it("exportar e importar da lo mismo; deshacer vuelve a lo de antes", () => {
    const store = memStore();
    const a = parse(REF);
    const other = initialState("es");
    const imported = importState(JSON.stringify(a), other, store);
    expect(imported).toEqual(a);
    expect(undoImport(store)).toEqual(other);
  });

  it("una copia automática se restaura entera", () => {
    const store = memStore();
    const a = parse(REF);
    expect(autoBackup(a, { force: true, reason: "before-migration" }, store)).toBe(true);
    const [b] = listBackups(store);
    expect(importState(b.data, initialState("es"), store)).toEqual(a);
  });

  it("la copia sin normalizar (con sus ceros) también se restaura sin perder nada", () => {
    const store = memStore();
    const raw = unsanitized();
    autoBackup(raw, { force: true }, store);
    const restored = importState(listBackups(store)[0].data, initialState("es"), store);
    expect(preservation(refObj(), restored).lost).toEqual([]);
  });
});

describe("límites ampliados con la partida real", () => {
  it("la partida multiplicada hasta 200 islas carga, guarda y recarga igual, y cabe en 2 MB", () => {
    const base = parse(REF);
    const islands = Array.from({ length: 200 }, (_, k) => {
      const i = base.islands[k % base.islands.length];
      return { ...i, id: k < base.islands.length ? i.id : `${i.id}-x${k}`, name: `${i.name.slice(0, 30)} ${k}` };
    });
    // Los suministros apuntan a islas que existen: siguen siendo válidos.
    const big: State = { ...base, islands };
    const raw = JSON.stringify(big);
    expect(new TextEncoder().encode(raw).length).toBeLessThan(MAX_IMPORT_BYTES);
    const loaded = parse(raw);
    expect(loaded.islands).toHaveLength(200);
    expect(preservation(JSON.parse(raw), loaded).lost).toEqual([]);
    const store = memStore();
    expect(saveState(loaded, store)).toBe(true);
    expect(loadState(store)).toEqual(loaded);
  });
});

/** Servidor en memoria con el comportamiento que importa de Firestore: devuelve los mapas con las claves en otro orden. */
function fakeServer() {
  const games = new Map<string, Remote>();
  const subs = new Map<string, Set<(r: Remote) => void>>();
  const writes: { uid: string; ops: unknown }[] = [];
  const shuffle = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(shuffle) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, shuffle(x)])) : v;
  const snap = (c: string) => shuffle(JSON.parse(JSON.stringify(games.get(c)!))) as Remote;
  const notify = (c: string) => queueMicrotask(() => subs.get(c)?.forEach((f) => f(snap(c))));
  let n = 0;
  const backend = (): SyncBackend => {
    const id = `u${++n}`;
    return {
      uid: async () => id,
      exists: async (c) => games.has(c),
      create: async (c, r) => { games.set(c, JSON.parse(JSON.stringify(r))); notify(c); },
      subscribe: (c, on) => { const f = (r: Remote) => on(r, false); (subs.get(c) ?? subs.set(c, new Set()).get(c)!).add(f); if (games.has(c)) queueMicrotask(() => f(snap(c))); return () => subs.get(c)!.delete(f); },
      apply: async (c, ops) => { writes.push({ uid: id, ops }); games.set(c, JSON.parse(JSON.stringify(applyOps(games.get(c)!, ops)))); notify(c); },
    };
  };
  return { backend, games, writes };
}

const SHARED = ["techs", "consumption", "mode", "countBuilt", "dlcs", "ships", "islands"] as const;
const shared = (s: State) => Object.fromEntries(SHARED.map((k) => [k, s[k]]));

describe("sincronización entre dos dispositivos con la partida real", () => {
  it("lo que sube un dispositivo llega igual al otro, sin escrituras de vuelta", async () => {
    const srv = fakeServer();
    const a0 = unsanitized(); // como está hoy en la partida compartida (con sus ceros)
    let a = a0, b = initialState("es");
    const A = new SyncController(srv.backend(), "ABCDEFGHJK", "Joel", (s) => (a = s), () => {}, 0);
    await A.create(a0);
    await tick();
    const B = new SyncController(srv.backend(), "ABCDEFGHJK", "Mac", (s) => (b = s), () => {}, 0);
    expect(await B.join(b)).toBe(true);
    await tick(); await tick();
    expect(shared(b)).toEqual(shared(a0));
    expect(shared(a)).toEqual(shared(a0));
    // B solo se apunta como jugador: ningún dato de islas se reescribe.
    const islandWrites = srv.writes.flatMap((w) => w.ops as { island?: string }[]).filter((op) => op.island);
    expect(islandWrites).toEqual([]);
    A.stop(); B.stop();
  });

  it("ediciones a la vez en islas distintas: los dos acaban igual y no se pierde nada más", async () => {
    const srv = fakeServer();
    const s0 = parse(REF);
    let a = s0, b = initialState("es");
    const A = new SyncController(srv.backend(), "ABCDEFGHJK", "Joel", (s) => (a = s), () => {}, 0);
    await A.create(s0);
    await tick();
    const B = new SyncController(srv.backend(), "ABCDEFGHJK", "Mac", (s) => (b = s), () => {}, 0);
    await B.join(b);
    await tick(); await tick();
    const [i1, i2] = [s0.islands[0], s0.islands[1]];
    const k1 = Object.keys(i1.built)[0], k2 = Object.keys(i2.houses)[0];
    a = { ...a, islands: a.islands.map((i) => (i.id === i1.id ? { ...i, built: { ...i.built, [k1]: i.built[k1] + 1 } } : i)) };
    b = { ...b, islands: b.islands.map((i) => (i.id === i2.id ? { ...i, houses: { ...i.houses, [k2]: i.houses[k2] + 3 } } : i)) };
    A.push(a); B.push(b);
    await tick(); await tick(); await tick();
    expect(shared(a)).toEqual(shared(b));
    const expected: State = { ...s0, islands: s0.islands.map((i) =>
      i.id === i1.id ? { ...i, built: { ...i.built, [k1]: i.built[k1] + 1 } } : i.id === i2.id ? { ...i, houses: { ...i.houses, [k2]: i.houses[k2] + 3 } } : i) };
    expect(shared(a)).toEqual(shared(expected));
    A.stop(); B.stop();
  });

  it("las claves en otro orden (como las devuelve Firestore) no generan cambios", () => {
    const s = parse(REF);
    const r = toRemote(s, { u1: "Joel" });
    const back = applyRemote(s, JSON.parse(JSON.stringify(r)));
    expect(diff(r, toRemote(back, { u1: "Joel" }))).toEqual([]);
  });

  it("cada dispositivo conserva lo suyo (idioma, animaciones, partida abierta)", () => {
    const s = parse(REF);
    const mine: State = { ...s, lang: "en", motion: "reduce", session: { code: "ABCDEFGHJK", player: "Mac" } };
    const back = applyRemote(mine, toRemote(s));
    expect([back.lang, back.motion, back.session]).toEqual(["en", "reduce", mine.session]);
  });

  it("la partida normalizada y la de hoy dan el mismo resultado al sincronizar", () => {
    // Si un dispositivo sube la versión normalizada, solo se borran ceros: los cálculos no cambian.
    const before = toRemote(unsanitized());
    const after = toRemote(sanitize(unsanitized()));
    const ops = diff(before, after);
    for (const op of ops) {
      expect(op.kind).toBe("update");
      for (const v of Object.values((op as { fields: Record<string, unknown> }).fields)) expect(v).toEqual({ __delete: true });
    }
    const merged = applyRemote(unsanitized(), applyOps(before, ops));
    expect(round(compute(merged))).toEqual(round(compute(unsanitized())));
  });
});
