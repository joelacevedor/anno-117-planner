// Genera src/data/game.json a partir de js/params.js (incluye los DLC) de anno-mods/anno-117-calculator.
// Uso: node scripts/import-params.mjs <ruta/params.js> <sha-de-la-revisión>
// Solo extrae nombres ES/EN, tiempos, insumos, combustible, mano de obra, fertilidad y consumo
// por casa. No copia iconos ni código.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const [file, sha] = process.argv.slice(2);
if (!file || !sha) throw new Error("Uso: node scripts/import-params.mjs <params-base.js> <sha>");
const ctx = { window: {} };
vm.runInNewContext(readFileSync(file, "utf8"), ctx);
const p = ctx.window.params;
// Las necesidades que solo aparecen con un especialista (requiresItem) no cuentan.
for (const r of p.residenceBuildings) r.needsList = r.needsList.filter((n) => !n.requiresItem);

const REGION = { Roman: "Latium", Celtic: "Albion", Egyptian: "Aegyptus" };
// DLC de cada cosa (el dataset marca con dlcUnlocks lo que añade cada expansión).
const DLC = { 67902: "ash", 67903: "hippodrome", 67904: "delta" };
const dlcOf = (x) => (x?.dlcUnlocks ?? []).map((d) => DLC[d]).find(Boolean);
// Toda la región de Egipto llega con Dawn of the Delta, aunque algún edificio no lo marque.
const REGION_DLC = { Aegyptus: "delta" };
// Crecida del Nilo: el efecto de temporada marca qué edificios dependen del río.
const NILE_EFFECT = 155616;
const nileTargets = new Set(p.effects.find((e) => e.guid === NILE_EFFECT)?.targets ?? []);
const names = (o) => ({ es: o.locaText.spanish.trim(), en: o.locaText.english.trim() });
const prodById = new Map(p.products.map((x) => [x.guid, x]));
const needById = new Map(p.needs.map((x) => [x.guid, x]));
const workforceToLevel = new Map(p.populationLevels.map((l) => [l.connectedWorkforce, l.guid]));
const fertility = new Map(p.fertilities.map((f) => [f.guid, f]));

// Productos que alguna casa consume, con su categoría de necesidad.
const needCategory = new Map();
for (const r of p.residenceBuildings)
  for (const n of r.needsList) {
    const need = needById.get(n.need);
    if (n.needConsumptionRate && need) needCategory.set(need.needProduct, need.needCategory);
  }

const buildings = {};
for (const f of p.factories) {
  if (f.outputs.length !== 1) throw new Error(`Salida múltiple sin soporte: ${f.name}`);
  const region = REGION[f.associatedRegions[0]];
  if (!region) continue;
  const wf = f.maintenances.find((m) => workforceToLevel.has(m.product));
  buildings[f.guid] = {
    region,
    name: names(f),
    kind: f.name.split(" ")[1], // Field, Forest, Food, Construction…
    cycle: f.cycleTime,
    inputs: Object.fromEntries(f.inputs.map((i) => [i.product, i.amount])),
    fuel: !!f.needsFuelInput,
    output: f.outputs[0].product,
    outAmount: f.outputs[0].amount,
    ...(wf ? { workers: { level: workforceToLevel.get(wf.product), amount: wf.amount } } : {}),
    ...(f.neededFertility && fertility.get(f.neededFertility) ? { fertility: names(fertility.get(f.neededFertility)) } : {}),
    ...(dlcOf(f) || REGION_DLC[region] ? { dlc: dlcOf(f) ?? REGION_DLC[region] } : {}),
    ...(nileTargets.has(f.guid) ? { nile: true } : {}),
  };
}

// Edificios del juego que el dataset aún no trae (ver scripts/extra-buildings.json).
const extra = JSON.parse(readFileSync(new URL("./extra-buildings.json", import.meta.url), "utf8"));
// Si el dataset ya lo trae (misma región y producto), se usa el del dataset.
const replaced = {};
for (const [guid, b] of Object.entries(extra.buildings)) {
  if (buildings[guid]) throw new Error(`Guid ${guid} ya existe en el dataset`);
  const real = Object.entries(buildings).find(([, x]) => x.region === b.region && x.output === b.output && x.name.en === b.name.en);
  if (real) { replaced[guid] = Number(real[0]); continue; }
  const { _estimated, ...clean } = b;
  buildings[guid] = clean;
}

const usedProducts = new Set();
for (const b of Object.values(buildings)) {
  usedProducts.add(b.output);
  for (const k of Object.keys(b.inputs)) usedProducts.add(Number(k));
}
usedProducts.add(p.constants.fuelProduct);
const products = {};
for (const id of usedProducts) {
  const x = prodById.get(id);
  if (!x) throw new Error(`Producto ${id} sin definir`);
  products[id] = {
    name: names(x),
    ...(x.isConstructionMaterial ? { construction: true } : {}),
    ...(needCategory.has(id) ? { need: needCategory.get(id) } : {}),
  };
}

/**
 * DLC de una necesidad. El dataset 4.0 marca con Dawn of the Delta productos de siempre (jabón, vino)
 * porque Egipto también los fabrica. Regla: si algún edificio sin DLC lo fabrica, es del juego base;
 * si no, el DLC de quien lo fabrica (o el del producto).
 */
function needDlc(product, need) {
  const makers = Object.values(buildings).filter((b) => b.output === product);
  if (makers.some((b) => !b.dlc)) return undefined;
  return makers.map((b) => b.dlc).find(Boolean) ?? dlcOf(prodById.get(product)) ?? dlcOf(need);
}

const levels = p.residenceBuildings
  .filter((r) => REGION[r.associatedRegions[0]])
  .map((r) => {
    const level = p.populationLevels.find((l) => l.guid === r.populationLevel);
    return {
      id: level.guid,
      region: REGION[r.associatedRegions[0]],
      name: names(level),
      residence: names(r),
      needs: r.needsList
        .filter((n) => n.needConsumptionRate && needById.has(n.need))
        .map((n) => {
          const nd = needById.get(n.need);
          const dlc = needDlc(nd.needProduct, nd);
          return { product: nd.needProduct, rate: n.needConsumptionRate, pop: nd.needAttributes?.Population ?? 0, ...(dlc ? { dlc } : {}) };
        })
        .filter((n) => products[n.product]),
      // Servicios públicos y monumentos: no se producen, solo hay que tenerlos cerca.
      services: r.needsList
        .filter((n) => !n.needConsumptionRate && needById.has(n.need))
        .map((n) => {
          const nd = needById.get(n.need);
          const pr = prodById.get(nd.needProduct);
          const dlc = dlcOf(pr) ?? dlcOf(nd);
          return { id: nd.needProduct, name: pr ? names(pr) : names(nd), wonder: nd.needCategory === "Wonders", pop: nd.needAttributes?.Population ?? 0, ...(dlc ? { dlc } : {}) };
        }),
      // Residentes por casa con todas las necesidades cubiertas (suma del atributo Población).
      residents: r.needsList.reduce((a, n) => a + (needById.get(n.need)?.needAttributes?.Population ?? 0), 0),
      workforce: level.populationToWorkforceFactor,
      ...(REGION_DLC[REGION[r.associatedRegions[0]]] ? { dlc: REGION_DLC[REGION[r.associatedRegions[0]]] } : {}),
    };
  });

// Mejoras: investigación, dioses patronos y festivales/eventos con efecto de productividad o combustible.
const buffById = new Map(p.buildingBuffs.map((x) => [x.guid, x]));
const effectById = new Map(p.effects.map((x) => [x.guid, x]));
const allFactories = Object.keys(buildings).map(Number);
const effectData = (e, scale = 1) => {
  let prod = 0, base = 0, fuelPct = 0;
  for (const g of e.buffs) {
    const bf = buffById.get(g);
    if (!bf) continue;
    prod += (bf.productivityUpgrade || 0) * scale;
    base += (bf.baseProductivityUpgrade || 0) * scale;
    fuelPct += (bf.fuelDurationPercent || 0) * scale;
  }
  const targets = (e.targetsIsAllProduction ? allFactories : e.targets).filter((t) => buildings[t]);
  return { prod, base, fuel: fuelPct, targets };
};
const useful = (d) => (d.prod || d.base || d.fuel) && d.targets.length;
const techs = p.techs
  .map((t) => {
    const effs = t.effects.map((g) => effectById.get(g)).filter(Boolean).map((e) => effectData(e));
    const d = effs.reduce((a, x) => ({ prod: a.prod + x.prod, base: a.base + x.base, fuel: a.fuel + x.fuel, targets: [...new Set([...a.targets, ...x.targets])] }), { prod: 0, base: 0, fuel: 0, targets: [] });
    return { id: "t" + t.guid, name: names(t), ...d, ...(dlcOf(t) ? { dlc: dlcOf(t) } : {}) };
  })
  .filter(useful);
const patrons = p.patrons
  .map((pt) => ({
    id: "g" + pt.guid,
    name: names(pt),
    ...(dlcOf(pt) ? { dlc: dlcOf(pt) } : {}),
    effects: pt.localEffects
      .map((le) => {
        const e = effectById.get(le.effect);
        if (!e) return null;
        const d = effectData(e); // por punto de escala
        return { id: "e" + e.guid, name: names(e), ...d, milestones: le.milestones.map((m) => ({ devotion: m.devotion, scaling: m.buffScaling })) };
      })
      .filter((x) => x && useful(x)),
  }))
  .filter((pt) => pt.effects.length);
const events = p.effects
  .filter((e) => e.guid !== NILE_EFFECT) // la temporada del Nilo se calcula aparte (ver core/nile.ts)
  .filter((e) => ["festival", "session-event", "veneration-effect"].includes(e.source) || /^Esplendor|Splendour/.test(e.locaText?.english ?? "") || e.source === "island-event" && !p.patrons.some((pt) => pt.localEffects.some((le) => le.effect === e.guid)))
  .map((e) => ({ id: "e" + e.guid, name: names(e), source: e.source, ...effectData(e), ...(dlcOf(e) ? { dlc: dlcOf(e) } : {}) }))
  .filter(useful);

const out = {
  boosts: { techs, patrons, events },
  source: {
    repo: "https://github.com/anno-mods/anno-117-calculator",
    sha,
    file: "js/params.js",
    license: "MIT (código). Nombres y valores del juego © Ubisoft.",
  },
  fuel: { product: p.constants.fuelProduct, seconds: p.constants.fuelProductionTime },
  consumption: p.needConsumptions.map((c) => ({ id: c.id, factor: c.consumptionFactor, name: names(c) })),
  categories: Object.fromEntries(p.needCategories.map((c) => [c.id, names(c)])),
  products,
  buildings,
  levels,
  /** Edificios añadidos a mano que ahora trae el dataset: guid viejo → guid del juego (para migrar partidas). */
  replaced,
};
writeFileSync(new URL("../src/data/game.json", import.meta.url), JSON.stringify(out));
console.log(`game.json: ${Object.keys(buildings).length} edificios, ${Object.keys(products).length} productos, ${levels.length} niveles, ${techs.length} investigaciones, ${patrons.length} dioses, ${events.length} eventos`);
