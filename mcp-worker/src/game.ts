/**
 * Partida compartida → los mismos cálculos que ve la app.
 *
 * Reutiliza sin cambios src/sync/model.ts (applyRemote, tooNew) y src/core (worldPlan, islandEconomy…),
 * repitiendo los pasos de src/ui/App.tsx para que las cifras coincidan con la interfaz.
 */
import { applyRemote, DATA_VERSION, tooNew, type Remote, type SharedIsland, type SharedMeta } from "../../src/sync/model";
import { islandSchema, stateSchema, type Island, type State } from "../../src/core/state";
import { worldPlan, type IslandPlan, type WorldPlan, type Mods } from "../../src/core/plan";
import { islandEconomy, statusOf, type IslandProduct } from "../../src/core/economy";
import { modsFor } from "../../src/core/boosts";
import { residentsOf, workforceOf } from "../../src/core/population";
import {
  buildings, chainById, consumptionLevels, dlcNeedsOff, isKnownRegion, levels, migrateIds, productName, source,
  type Lang,
} from "../../src/data/catalog";
import type { Doc } from "./firebase";

export type Loaded = {
  remote: Remote;
  state: State;
  /** Hora de la última modificación de cada documento (sirve para saber si los datos son recientes). */
  updated: { game: string; islands: Record<string, string> };
  /** Islas que no se han podido leer (datos dañados o de un formato que esta versión no entiende). */
  skipped: string[];
  hidden: string[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Documentos de Firestore → estado de la app (mismos valores por defecto que la app). */
export function load(game: Doc, islandDocs: Doc[], lang: Lang = "es"): Loaded {
  const meta: SharedMeta = { techs: [], consumption: "Low", mode: "coop", players: {}, ...((game.data.meta as Partial<SharedMeta>) ?? {}) };
  const islands: Record<string, SharedIsland> = {};
  const skipped: string[] = [];
  for (const d of islandDocs) {
    const parsed = islandSchema.safeParse(migrateIds({ ...d.data, id: d.data.id ?? d.id } as Island));
    if (parsed.success) islands[d.id] = { ...(parsed.data as Island), owner: d.data.owner as string | undefined, order: d.data.order as number | undefined };
    else skipped.push(String(d.data.name ?? d.id));
  }
  const remote: Remote = { meta, islands };
  const list = Object.values(islands);
  const base = stateSchema.parse({
    v: 2, lang, motion: "auto",
    current: list[0]?.id ?? "none",
    islands: list.length ? list.map(({ order: _o, ...i }) => i) : [{ id: "none", name: "-", region: "Latium", goals: {}, built: {} }],
  });
  const state = list.length ? applyRemote(base, remote) : base;
  return {
    remote, state, skipped,
    hidden: state.islands.filter((i) => !isKnownRegion(i.region)).map((i) => i.name),
    updated: { game: game.updateTime, islands: Object.fromEntries(islandDocs.map((d) => [d.id, d.updateTime])) },
  };
}

export type Computed = { world: WorldPlan; econ: IslandProduct[]; mods: Record<string, Mods>; factor: number; dlcOff: string[] };

/** Lo mismo que calcula src/ui/App.tsx. */
export function compute(state: State): Computed {
  const known = state.islands.filter((i) => isKnownRegion(i.region));
  const factor = consumptionLevels.find((c) => c.id === state.consumption)?.factor ?? 1;
  const mods = Object.fromEntries(known.map((i) => [i.id, modsFor(i.region, { techs: state.techs, patron: i.patron, events: i.events, manual: i.productivity, producers: i.producers, nile: i.nile })]));
  const dlcOff = dlcNeedsOff(state.dlcs);
  const world = worldPlan(known.map((i) => ({ ...i, needsOff: dlcOff.length ? [...i.needsOff, ...dlcOff] : i.needsOff, mods: mods[i.id] })), factor, { countBuilt: state.countBuilt });
  const econIslands = known.map((i) => ({ id: i.id, name: i.name, region: i.region, built: i.built, mods: mods[i.id] }));
  return { world, econ: islandEconomy(econIslands, world), mods, factor, dlcOff };
}

const nameOfIsland = (state: State, id: string) => state.islands.find((i) => i.id === id)?.name ?? id;
const bName = (id: string, lang: Lang) => buildings[id]?.name[lang] ?? id;

/** Resumen de la partida (sin el código ni identificadores de jugadores). */
export function gameSummary(l: Loaded, lang: Lang) {
  const { state, remote } = l;
  return {
    players: Object.values(remote.meta.players ?? {}),
    mode: state.mode,
    consumption: consumptionLevels.find((c) => c.id === state.consumption)?.name[lang] ?? state.consumption,
    dlcs: state.dlcs,
    researchCount: state.techs.length,
    dataVersion: remote.meta.dataVersion ?? 1,
    newerThanServer: tooNew(remote),
    serverDataVersion: DATA_VERSION,
    lastUpdated: [l.updated.game, ...Object.values(l.updated.islands)].sort().pop(),
    islands: state.islands.filter((i) => isKnownRegion(i.region)).map((i) => ({
      id: i.id, name: i.name, region: i.region, owner: i.owner ?? null,
      houses: Object.values(i.houses ?? {}).reduce((a, b) => a + b, 0),
      buildingsBuilt: Object.values(i.built ?? {}).reduce((a, b) => a + b, 0),
      lastUpdated: l.updated.islands[i.id] ?? null,
    })),
    hiddenIslands: l.hidden,
    unreadableIslands: l.skipped,
    catalog: { source: source.repo, sha: source.sha },
  };
}

/** Busca islas por nombre (sin mayúsculas ni acentos). */
export function findIslands(state: State, query: string) {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const q = norm(query);
  const all = state.islands.filter((i) => isKnownRegion(i.region));
  const exact = all.filter((i) => norm(i.name) === q);
  const partial = all.filter((i) => !exact.includes(i) && norm(i.name).includes(q));
  return [...exact, ...partial].map((i) => ({ id: i.id, name: i.name, region: i.region, owner: i.owner ?? null }));
}

/** Datos completos de una isla, cada valor marcado como registrado, calculado o estimado. */
export function islandDetail(l: Loaded, c: Computed, islandId: string, lang: Lang) {
  const { state } = l;
  const island = state.islands.find((i) => i.id === islandId && isKnownRegion(i.region));
  if (!island) return null;
  const plan: IslandPlan = c.world.plans[island.id];
  const off = [...island.needsOff, ...c.dlcOff];

  const population = levels.filter((lv) => lv.region === island.region).map((lv) => {
    const houses = island.houses[lv.id] ?? 0;
    const real = houses > 0 && (island.popReal?.[lv.id] ?? 0) > 0;
    // Igual que src/ui/HousesScreen.tsx.
    const residents = real ? Math.round((island.popReal[lv.id] / 1000) * houses) : residentsOf(lv, houses, off);
    return {
      level: lv.name[lang], levelId: lv.id, residence: lv.residence[lang],
      houses, housesSource: "registrado",
      residents, residentsSource: houses === 0 ? "registrado" : real ? "registrado (copiado del juego)" : "estimado",
      workforce: workforceOf(lv, residents),
    };
  }).filter((p) => p.houses > 0);

  const buildingsRows = plan.rows.map((r) => ({
    id: r.id, name: bName(r.id, lang),
    built: r.built, recommended: r.recommended, missing: r.missing, extra: r.extra, exact: r2(r.exact),
  })).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

  const chains = plan.chains.map((s) => ({
    chainId: s.chainId,
    product: chainById[s.chainId]?.product[lang] ?? s.chainId,
    goalSource: "registrado", goal: s.goal,
    fromHouses: r2(s.fromHouses), fromTrade: r2(s.fromTrade),
    finalsNeeded: s.finals, finalsBuilt: s.builtFinals, running: r2(s.running),
    bottleneck: s.bottleneck ? bName(s.bottleneck, lang) : null,
    surplusPerMinute: r2(s.surplus),
  }));

  const economy = c.econ.filter((e) => e.island === island.id && (Math.abs(e.produce) + Math.abs(e.consume) + e.inflow + e.outflow + e.unsourced) > 1e-6).map((e) => ({
    product: productName(e.product)[lang], productId: e.product,
    produce: r2(e.produce), consume: r2(e.consume), inflow: r2(e.inflow), outflow: r2(e.outflow), unsourced: r2(e.unsourced),
    balance: r2(e.saldo), status: statusOf(e.saldo),
    from: e.from.map((f) => ({ island: nameOfIsland(state, f.island), perMinute: r2(f.rate) })),
    to: e.to.map((f) => ({ island: nameOfIsland(state, f.island), perMinute: r2(f.rate) })),
  })).sort((a, b) => a.balance - b.balance);

  return {
    island: { id: island.id, name: island.name, region: island.region, owner: island.owner ?? null, nileSeason: island.nile ?? null, lastUpdated: l.updated.islands[island.id] ?? null },
    units: "Producción y consumo en unidades por minuto. Edificios en números enteros (redondeo único por tipo de edificio, como la app).",
    population,
    toBuild: plan.toBuild.map((b) => ({ id: b.id, name: bName(b.id, lang), count: b.count })),
    complete: plan.complete,
    buildings: buildingsRows,
    chains,
    economy,
    importsWithoutSource: (c.world.imports[island.id] ?? []).map((i) => ({ product: productName(i.product)[lang], perMinute: r2(i.perMinute) })),
    requestedButNotProducible: Object.entries(plan.unsupplied).map(([p, rate]) => ({ product: productName(p)[lang], perMinute: r2(rate) })),
    boosts: {
      manualProductivity: Object.entries(island.productivity ?? {}).map(([id, pct]) => ({ building: bName(id, lang), percent: pct })),
      patron: island.patron,
      events: island.events,
      researchCount: state.techs.length,
      alternativeProducers: Object.entries(island.producers ?? {}).map(([p, b]) => ({ product: productName(p)[lang], building: bName(b, lang) })),
    },
    notes: [
      "registrado = introducido por los jugadores en Praefectus; calculado = motor de Praefectus; estimado = aproximación sin datos del juego.",
      population.some((p) => p.residentsSource === "estimado") ? "Algunos residentes son estimados: no se han copiado los residentes reales del juego para ese nivel." : null,
      tooNew(l.remote) ? `La partida usa una versión de datos (${l.remote.meta.dataVersion}) más nueva que la de este servidor (${DATA_VERSION}): los cálculos pueden estar incompletos.` : null,
    ].filter(Boolean),
  };
}

/** Texto breve para el modelo (los datos completos van en structuredContent). */
export function islandText(d: NonNullable<ReturnType<typeof islandDetail>>) {
  const pending = d.toBuild.length ? d.toBuild.map((b) => `${b.count} × ${b.name}`).join(", ") : "nada";
  const deficits = d.economy.filter((e) => e.status === "deficit").slice(0, 8).map((e) => `${e.product} ${e.balance}/min`).join(", ") || "ninguno";
  const pop = d.population.map((p) => `${p.level}: ${p.houses} casas, ${p.residents} residentes (${p.residentsSource})`).join("; ") || "sin casas registradas";
  return `${d.island.name} (${d.island.region}). Población: ${pop}. Pendiente de construir: ${pending}. Déficits: ${deficits}.`;
}
