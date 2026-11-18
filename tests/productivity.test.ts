import { describe, expect, it } from "vitest";
import { autoPct, globalEffects, islandBoosts, modsFor, totalPct, weightedPct } from "../src/core/boosts";
import { islandPlan, perMinute, roundUp, RATE_TOLERANCE } from "../src/core/plan";
import { buildings, chainForProduct, eventById, patrons, techs } from "../src/data/catalog";
import { initialState, newIsland, parse, sanitize, type State } from "../src/core/state";
import { applyRemote, diff, toRemote } from "../src/sync/model";

const WHEAT = "b2693"; // Granja de trigo (Latium)
const VERVACTOR = "e43620"; // Arado de Vervactor: maravilla de Ceres, +50 % base en todo el imperio
const SOIL = "e145099"; // Suelo fértil: +10 % por nivel del volcán, en la región
const REPEAT = "t37870"; // investigación final repetible
const none = { techs: [] as string[], patron: null, events: [] as string[], manual: {} };
const ceres = patrons.find((p) => p.effects.some((e) => e.targets.includes(WHEAT)))!;
const roma = () => ({ ...newIsland("Roma", "Latium"), patron: { id: ceres.id, scaling: 90 } });
const romaTechs = ["t153957", "t153965", "t154504", "t28282", "t38706", "t38708", "t82032", "t82033"];
const state = (patch: Partial<State> = {}): State => {
  const s = { ...initialState("es"), techs: romaTechs, islands: [roma()], ...patch };
  return { ...s, current: s.islands[0].id };
};

describe("modificadores automáticos", () => {
  it("la maravilla de Ceres (+50 % base) cuenta en todo el imperio y una sola vez", () => {
    const s = state({ wonders: [VERVACTOR] });
    const a = modsFor("Latium", islandBoosts(s, s.islands[0]));
    expect(a.detail[WHEAT].base).toBe(eventById[VERVACTOR].base);
    expect(eventById[VERVACTOR].base).toBe(50);
    // Datos antiguos: además marcada en una isla → no se duplica; y vale también en otra isla sin marcar.
    const other = newIsland("Ostia", "Latium");
    const s2 = state({ wonders: [VERVACTOR], islands: [{ ...roma(), events: [VERVACTOR] }, other] });
    expect(modsFor("Latium", islandBoosts(s2, s2.islands[0])).detail[WHEAT].base).toBe(50);
    expect(modsFor("Latium", islandBoosts(s2, s2.islands[1])).detail[WHEAT].base).toBe(50);
    // Solo marcada en una isla (antes): ya cuenta para todas.
    const s3 = state({ islands: [{ ...roma(), events: [VERVACTOR] }, other] });
    expect(globalEffects(s3)).toContain(VERVACTOR);
    expect(modsFor("Latium", islandBoosts(s3, s3.islands[1])).detail[WHEAT].base).toBe(50);
  });

  it("efectos de región con nivel: Suelo fértil × nivel, y el nivel de región manda sobre la isla", () => {
    const s = state({ regionFx: { Latium: { [SOIL]: 3 } }, islands: [{ ...roma(), events: [SOIL] }] });
    const d = modsFor("Latium", islandBoosts(s, s.islands[0])).detail[WHEAT];
    const soil = d.parts!.filter((p) => p.id === SOIL);
    expect(soil).toHaveLength(1);
    expect(soil[0].prod).toBe(3 * eventById[SOIL].prod);
    // Más allá del máximo del volcán no sube.
    const s2 = state({ regionFx: { Latium: { [SOIL]: 99 } } });
    expect(modsFor("Latium", islandBoosts(s2, s2.islands[0])).detail[WHEAT].parts!.find((p) => p.id === SOIL)!.prod).toBe((eventById[SOIL].maxLevel ?? 1) * eventById[SOIL].prod);
  });

  it("investigación repetible: cuenta tantas veces como se ha investigado", () => {
    const t = techs.find((x) => x.id === REPEAT)!;
    expect(t.repeatable).toBe(true);
    const target = t.targets[0];
    const region = buildings[target].region;
    const one = modsFor(region, { ...none, techs: [REPEAT] }).detail[target];
    const three = modsFor(region, { ...none, techs: [REPEAT], techLevels: { [REPEAT]: 3 } }).detail[target];
    expect(three.prod).toBeCloseTo(one.prod * 3);
    expect(three.base).toBeCloseTo(one.base * 3);
  });

  it("deidad: el efecto se escala con el nivel de devoción (también el máximo)", () => {
    const e = ceres.effects.find((x) => x.targets.includes(WHEAT))!;
    const max = Math.max(...e.milestones.map((m) => m.scaling));
    const d = modsFor("Latium", { ...none, patron: { id: ceres.id, scaling: max } }).detail[WHEAT];
    expect(d.prod + d.base).toBeCloseTo((e.prod + e.base) * max);
  });

  it("una devoción alta (≥ 110) se puede guardar", () => {
    const s = state({ islands: [{ ...roma(), patron: { id: ceres.id, scaling: 150 } }] });
    expect(parse(JSON.stringify(s)).islands[0].patron?.scaling).toBe(150);
  });
});

describe("productividad observada y calculadora", () => {
  it("media ponderada por edificios: 4 al 250 %, 3 al 200 %, 3 al 175 % → 212,5 %", () => {
    expect(weightedPct([{ n: 4, pct: 250 }, { n: 3, pct: 200 }, { n: 3, pct: 175 }])).toBeCloseTo(212.5);
    expect(weightedPct([{ n: 0, pct: 300 }])).toBeNull();
  });

  it("la productividad observada sustituye a los modificadores (no se les vuelve a sumar)", () => {
    const s = state({ wonders: [VERVACTOR], islands: [{ ...roma(), productivity: { [WHEAT]: 30 }, prodObserved: { [WHEAT]: 212.5 } }] });
    const m = modsFor("Latium", islandBoosts(s, s.islands[0]));
    expect(m.boost![WHEAT]).toBeCloseTo(2.125);
    expect(totalPct(m.detail[WHEAT])).toBe(212.5);
    expect(autoPct(m.detail[WHEAT])).toBeGreaterThan(212.5);
    expect(perMinute(buildings[WHEAT], m)).toBeCloseTo(2.125 * perMinute(buildings[WHEAT]));
  });

  it("se guarda, se limpia y viaja por la sincronización sin perder nada", () => {
    const s = sanitize(state({
      wonders: [VERVACTOR], techLevels: { [REPEAT]: 4 }, regionFx: { Latium: { [SOIL]: 5 } },
      islands: [{ ...roma(), prodObserved: { [WHEAT]: 212.5 }, prodCalc: { [WHEAT]: { mode: "total", groups: [{ n: 4, pct: 250 }, { n: 3, pct: 200 }, { n: 3, pct: 175 }] } } }],
    }));
    const back = parse(JSON.stringify(s));
    expect(back.wonders).toEqual([VERVACTOR]);
    expect(back.techLevels).toEqual({ [REPEAT]: 4 });
    expect(back.regionFx).toEqual({ Latium: { [SOIL]: 5 } });
    expect(back.islands[0].prodObserved).toEqual({ [WHEAT]: 212.5 });
    expect(back.islands[0].prodCalc?.[WHEAT].groups).toHaveLength(3);
    const r = toRemote(back);
    const again = applyRemote(initialState("es"), r);
    expect(again.wonders).toEqual([VERVACTOR]);
    expect(again.techLevels).toEqual({ [REPEAT]: 4 });
    expect(again.regionFx).toEqual({ Latium: { [SOIL]: 5 } });
    expect(again.islands[0].prodObserved).toEqual({ [WHEAT]: 212.5 });
    // Quitar la maravilla se envía como cambio.
    const ops = diff(r, toRemote({ ...back, wonders: undefined }));
    expect(ops.length).toBeGreaterThan(0);
    // Sin datos nuevos, una partida antigua no cambia.
    const old = parse(JSON.stringify(state()));
    expect(old.wonders).toBeUndefined();
    expect(old.islands[0].prodObserved).toBeUndefined();
  });
});

describe("recomendaciones de construcción (caso de Roma: granjas de trigo)", () => {
  const chain = chainForProduct("Latium", buildings[WHEAT].productId)!;
  // Demanda de trigo de 23 t/min.
  const plan = (s: State) => {
    const i = { ...s.islands[0], targets: { [chain.id]: 23 }, built: { [WHEAT]: 10 } };
    return islandPlan({}, i.built, {}, { region: "Latium", mods: modsFor("Latium", islandBoosts(s, i)), targets: i.targets }).byId[WHEAT];
  };
  it("sin la maravilla salen 12 granjas al 200 %; con el +50 % base (300 %) bastan 8 de las 10", () => {
    const s0 = state();
    expect(totalPct(modsFor("Latium", islandBoosts(s0, s0.islands[0])).detail[WHEAT])).toBe(200);
    expect(plan(s0).recommended).toBe(12);
    const s1 = state({ wonders: [VERVACTOR] });
    expect(totalPct(modsFor("Latium", islandBoosts(s1, s1.islands[0])).detail[WHEAT])).toBe(300);
    const r = plan(s1);
    expect(r.recommended).toBe(8);
    expect(r.missing).toBe(0);
    expect(r.extra).toBe(2);
  });
  it("con la media observada (212,5 %) no se suman otra vez los modificadores", () => {
    const s = state({ wonders: [VERVACTOR], islands: [{ ...roma(), prodObserved: { [WHEAT]: 212.5 } }] });
    expect(plan(s).recommended).toBe(Math.ceil(23 / 2.125)); // 11
  });
  it("redondeo: lo que falte por debajo del margen de cobertura no pide otro edificio", () => {
    expect(roundUp(10.01, 2)).toBe(10); // 0,02 t/min < 0,05
    expect(roundUp(10.04, 2)).toBe(11); // 0,08 t/min
    expect(roundUp(10, 2)).toBe(10);
    expect(RATE_TOLERANCE).toBe(0.05);
  });
});
