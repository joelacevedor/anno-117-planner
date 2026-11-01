import { describe, it, expect } from "vitest";
import { perFinal, cleanRatio, islandPlan, perText, populationDemand, stages, worldPlan, type WorldIsland } from "../src/core/plan";
import { buildings, chains, chainById, levels, type Region } from "../src/data/catalog";

const b = (region: Region, en: string) => {
  const x = Object.values(buildings).find((y) => y.region === region && y.name.en === en);
  if (!x) throw new Error(`No building ${en} in ${region}`);
  return x.id;
};
const chain = (region: Region, en: string) => "c" + b(region, en).slice(1);
const rec = (p: ReturnType<typeof islandPlan>, id: string) => p.byId[id]?.recommended ?? 0;

describe("catálogo importado", () => {
  it("todas las cadenas resuelven, sin ciclos y dentro de su región", () => {
    expect(chains.length).toBeGreaterThan(80);
    for (const c of chains) for (const id of Object.keys(perFinal(c))) expect(buildings[id].region).toBe(c.region);
  });
  it("nombres oficiales en español", () => {
    expect(buildings[b("Albion", "Labourer's Yard")].name.es).toBe("Patio de obreros");
    expect(chainById[chain("Albion", "Labourer's Yard")].product.es).toBe("Zarzo y argamasa");
  });
  it("hay casas de las dos regiones con sus necesidades", () => {
    expect(levels.filter((l) => l.region === "Latium").map((l) => l.name.es)).toEqual(["Libertos", "Plebeyos", "Équites", "Patricios"]);
    expect(levels.filter((l) => l.region === "Albion")).toHaveLength(5);
  });
});

describe("coincide con los ratios publicados (Prima Games)", () => {
  it("Zarzo y argamasa: 6 patios → 6 recolectorías y 9 secaderos (AC-M01)", () => {
    const p = islandPlan({ [chain("Albion", "Labourer's Yard")]: 6 });
    expect([rec(p, b("Albion", "Reed Gatherer")), rec(p, b("Albion", "Mud Drier"))]).toEqual([6, 9]);
  });
  it("Tejas (Latium): 2 tejerías → 1 terrero de arcilla, 1 quemadero de carbón", () => {
    const p = islandPlan({ [chain("Latium", "Tiler")]: 2 });
    expect([rec(p, b("Latium", "Clay Pit")), rec(p, b("Latium", "Charcoal Burner"))]).toEqual([1, 1]);
  });
  it("Ánforas (Albion): 2 vasijerías → 3 secaderos, 2 exprimideros, 1 quemadero", () => {
    const p = islandPlan({ [chain("Albion", "Potter")]: 2 });
    expect([rec(p, b("Albion", "Mud Drier")), rec(p, b("Albion", "Resin Tapper")), rec(p, b("Albion", "Charcoal Burner"))]).toEqual([3, 2, 1]);
  });
  it("Zapatos de junco: 2 hilanderías → 1 recolectoría", () => {
    const p = islandPlan({ [chain("Albion", "Shoe Weaver")]: 2 });
    expect(rec(p, b("Albion", "Reed Gatherer"))).toBe(1);
  });
  it("Armas (Latium): 3 forjerías → 1 mina de hierro, 2 hornos altos, 2 quemaderos", () => {
    const p = islandPlan({ [chain("Latium", "Weaponsmith")]: 3 });
    expect([rec(p, b("Latium", "Iron Mine")), rec(p, b("Latium", "Furnace")), rec(p, b("Latium", "Charcoal Burner"))]).toEqual([1, 2, 2]);
  });
});

describe("cálculo", () => {
  it("1 patio → 2 secaderos con medio libre; proporción sin desperdicio", () => {
    const c = chain("Albion", "Labourer's Yard");
    const p = islandPlan({ [c]: 1 });
    expect(rec(p, b("Albion", "Mud Drier"))).toBe(2);
    expect(p.byId[b("Albion", "Mud Drier")].spare).toBeCloseTo(0.5);
    expect(cleanRatio(chainById[c])!.finals).toBe(2);
    expect(perText(1.5)).toEqual([3, 2]);
  });
  it("AC-M02/M04: proveedores compartidos se suman antes de redondear", () => {
    const p = islandPlan({ [chain("Albion", "Labourer's Yard")]: 1, [chain("Albion", "Tiler")]: 1 });
    expect(rec(p, b("Albion", "Mud Drier"))).toBe(3); // 1,5 + 1,5, no 2 + 2
  });
  it("cadenas de varios niveles tienen etapas", () => {
    const s = stages(chainById[chain("Latium", "Weaponsmith")]);
    expect(s[b("Latium", "Weaponsmith")]).toBe(0);
    expect(s[b("Latium", "Iron Mine")]).toBe(2);
  });
  it("lo que falta y el cuello de botella", () => {
    const c = chain("Albion", "Labourer's Yard");
    const p = islandPlan({ [c]: 6 }, { [b("Albion", "Labourer's Yard")]: 6, [b("Albion", "Reed Gatherer")]: 6, [b("Albion", "Mud Drier")]: 6 });
    expect(p.toBuild).toEqual([{ id: b("Albion", "Mud Drier"), count: 3 }]);
    expect(p.chains[0]).toMatchObject({ running: 4, bottleneck: b("Albion", "Mud Drier") });
  });
  it("detecta ciclos", () => {
    const reg = structuredClone(buildings);
    const yard = b("Albion", "Labourer's Yard");
    reg[b("Albion", "Reed Gatherer")].inputs = { [yard]: 1 };
    expect(() => perFinal(chainById["c" + yard.slice(1)], reg)).toThrow(/Cycle/);
  });
});

describe("población", () => {
  const liberti = levels.find((l) => l.name.en === "Liberti")!;
  it("56 casas libertas comen ~1 sardina/min → 1 caseta de pesca", () => {
    const d = populationDemand({ region: "Latium", houses: { [liberti.id]: 56 }, needsOff: [], factor: 1 });
    const fishing = chain("Latium", "Fishing Hut");
    expect(d.finals[fishing]).toBeCloseTo(0.9996, 3);
    const p = islandPlan({}, {}, d.finals);
    expect(rec(p, b("Latium", "Fishing Hut"))).toBe(1);
  });
  it("una necesidad desactivada no cuenta; el consumo alto multiplica", () => {
    const fishing = chain("Latium", "Fishing Hut");
    const sardines = buildings[b("Latium", "Fishing Hut")].productId;
    const off = populationDemand({ region: "Latium", houses: { [liberti.id]: 56 }, needsOff: [`${liberti.id}:${sardines}`], factor: 1 });
    expect(off.finals[fishing]).toBeUndefined();
    const high = populationDemand({ region: "Latium", houses: { [liberti.id]: 56 }, needsOff: [], factor: 1.5 });
    expect(high.finals[fishing]).toBeCloseTo(1.4994, 3);
  });
  it("objetivo manual y casas se suman y redondean una vez", () => {
    const fishing = chain("Latium", "Fishing Hut");
    const p = islandPlan({ [fishing]: 1 }, {}, { [fishing]: 0.4 });
    expect(rec(p, b("Latium", "Fishing Hut"))).toBe(2);
    expect(p.chains[0]).toMatchObject({ goal: 1, finals: 2 });
  });
  it("las casas de otra región se ignoran", () => {
    const d = populationDemand({ region: "Albion", houses: { [liberti.id]: 50 }, needsOff: [], factor: 1 });
    expect(d.finals).toEqual({});
  });
});

describe("comercio entre islas", () => {
  const isl = (id: string, region: Region, extra: Partial<WorldIsland> = {}): WorldIsland =>
    ({ id, region, goals: {}, built: {}, houses: {}, needsOff: [], supplies: {}, ...extra });
  const mud = buildings[b("Albion", "Mud Drier")].productId;

  it("el barro que B trae de A se construye en A, no en B", () => {
    const w = worldPlan([
      isl("A", "Albion"),
      isl("B", "Albion", { goals: { [chain("Albion", "Labourer's Yard")]: 6 }, supplies: { [mud]: "A" } }),
    ], 1);
    expect(rec(w.plans.B, b("Albion", "Mud Drier"))).toBe(0);
    expect(rec(w.plans.B, b("Albion", "Reed Gatherer"))).toBe(6);
    expect(rec(w.plans.A, b("Albion", "Mud Drier"))).toBe(9);
    expect(w.flows).toEqual([{ from: "A", to: "B", product: mud, rate: 6 }]);
    expect(w.plans.A.chains[0].fromTrade).toBeCloseTo(9);
  });

  it("la cerveza que piden las casas de Latium se puede traer de Albion", () => {
    const liberti = levels.find((l) => l.name.en === "Liberti")!;
    const beer = buildings[b("Albion", "Brewery")].productId;
    const alone = worldPlan([isl("R", "Latium", { houses: { [liberti.id]: 60 } })], 1);
    expect(alone.imports.R.map((x) => x.product)).toContain(beer);
    const w = worldPlan([
      isl("R", "Latium", { houses: { [liberti.id]: 60 }, supplies: { [beer]: "N" } }),
      isl("N", "Albion"),
    ], 1);
    expect(w.imports.R.map((x) => x.product)).not.toContain(beer);
    expect(rec(w.plans.N, b("Albion", "Brewery"))).toBeGreaterThan(0);
  });

  it("se propaga en cadena: C trae tejas de B, B trae barro de A", () => {
    const tiles = buildings[b("Albion", "Tiler")].productId;
    const w = worldPlan([
      isl("A", "Albion"),
      isl("B", "Albion", { supplies: { [mud]: "A" } }),
      isl("C", "Albion", { goals: { [chain("Albion", "Tiler")]: 2 }, supplies: { [tiles]: "B" } }),
    ], 1);
    // C quiere 2 tejerías de tejas y las trae hechas de B: se construyen en B, no en C.
    expect(rec(w.plans.C, b("Albion", "Tiler"))).toBe(0);
    expect(rec(w.plans.B, b("Albion", "Tiler"))).toBe(2);
    const w2 = worldPlan([
      isl("A", "Albion"),
      isl("B", "Albion", { supplies: { [mud]: "A" } }),
      isl("C", "Albion", { goals: { [chain("Albion", "Labourer's Yard")]: 2 }, supplies: { [mud]: "B" } }),
    ], 1);
    expect(rec(w2.plans.B, b("Albion", "Mud Drier"))).toBe(3); // B produce lo que le piden aunque traiga barro para sí
    expect(rec(w2.plans.C, b("Albion", "Mud Drier"))).toBe(0);
  });

  it("si la región de origen no lo produce, queda sin abastecer", () => {
    const beer = buildings[b("Albion", "Brewery")].productId;
    const w = worldPlan([
      isl("R1", "Latium"),
      isl("R2", "Latium", { houses: { [levels.find((l) => l.name.en === "Liberti")!.id]: 60 }, supplies: { [beer]: "R1" } }),
    ], 1);
    expect(Object.keys(w.plans.R1.unsupplied)).toContain(beer);
  });
});

import { modsFor } from "../src/core/boosts";
import { techs, patrons } from "../src/data/catalog";
describe("mejoras de productividad", () => {
  const none = { techs: [], patron: null, events: [], manual: {} };
  it("+50 % a mano en secaderos: 6 patios → 6 secaderos en vez de 9", () => {
    const mud = b("Albion", "Mud Drier");
    const mods = modsFor("Albion", { ...none, manual: { [mud]: 50 } });
    const p = islandPlan({ [chain("Albion", "Labourer's Yard")]: 6 }, {}, {}, { mods });
    expect(rec(p, mud)).toBe(6);
    expect(rec(p, b("Albion", "Reed Gatherer"))).toBe(6);
  });
  it("productividad en el edificio final: menos edificios, mismo insumo por unidad", () => {
    const tiler = b("Latium", "Tiler");
    const mods = modsFor("Latium", { ...none, manual: { [tiler]: 100 } });
    const base = islandPlan({ [chain("Latium", "Tiler")]: 4 });
    const fast = islandPlan({}, {}, {}, { region: "Latium", mods, tradeIn: { [buildings[tiler].productId]: 4 } });
    expect(rec(fast, tiler)).toBe(2);
    expect(fast.byId[b("Latium", "Clay Pit")].exact).toBeCloseTo(base.byId[b("Latium", "Clay Pit")].exact);
    // El carbón se gasta por tiempo: a doble velocidad, la mitad por teja.
    expect(fast.byId[b("Latium", "Charcoal Burner")].exact).toBeCloseTo(base.byId[b("Latium", "Charcoal Burner")].exact / 2);
  });
  it("Fuelles mejores (+20 % duración) reduce el carbón", () => {
    const bellows = techs.find((t) => t.name.en === "Better Bellows")!;
    const mods = modsFor("Latium", { ...none, techs: [bellows.id] });
    const p = islandPlan({ [chain("Latium", "Tiler")]: 12 }, {}, {}, { mods });
    expect(p.byId[b("Latium", "Charcoal Burner")].exact).toBeCloseTo(3 / 1.2);
  });
  it("dios patrón al 50 % de devoción da +50 % a sus edificios", () => {
    const mars = patrons.find((p) => p.name.en === "Mars")!;
    const m = modsFor("Latium", { ...none, patron: { id: mars.id, scaling: 50 } });
    const target = mars.effects[0].targets.find((t) => buildings[t].region === "Latium")!;
    expect(m.boost![target]).toBeCloseTo(1.5);
    expect(modsFor("Albion", { ...none, patron: { id: mars.id, scaling: 50 } }).boost![target]).toBeUndefined();
  });
});

describe("productores alternativos", () => {
  it("la mena de oro puede salir de la mina o del lavadero", () => {
    const mine = b("Latium", "Gold Mine"), washer = b("Latium", "Gold Washer");
    const jeweller = chain("Latium", "Jeweller");
    const def = islandPlan({ [jeweller]: 6 });
    // Por defecto, el lavadero (como en Prima: 6 joyerías → 16 lavaderos).
    expect(def.byId[washer].recommended).toBe(16);
    const alt = islandPlan({ [jeweller]: 6 }, {}, {}, { mods: { provider: { [buildings[mine].productId]: mine } } });
    expect(alt.byId[washer]).toBeUndefined();
    // La mina tarda 150 s frente a 240 s del lavadero: hacen falta menos.
    expect(alt.byId[mine].exact).toBeCloseTo((def.byId[washer].exact * 150) / 240);
  });
});

describe("excedente", () => {
  it("lo que sobra del producto final al redondear o construir de más", () => {
    const fishing = chain("Latium", "Fishing Hut");
    const hut = b("Latium", "Fishing Hut");
    const rate = (60 / buildings[hut].cycleSeconds) * buildings[hut].output;
    const p = islandPlan({}, {}, { [fishing]: 0.4 });
    expect(p.chains[0].surplus).toBeCloseTo(0.6 * rate);
    const built = islandPlan({}, { [hut]: 3 }, { [fishing]: 0.4 });
    expect(built.chains[0].surplus).toBeCloseTo(2.6 * rate);
    expect(islandPlan({ [fishing]: 2 }).chains[0].surplus).toBeCloseTo(0);
  });
});
