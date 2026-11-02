/**
 * Catálogo de Anno 117 generado desde el dataset de anno-mods/anno-117-calculator
 * (ver scripts/import-params.mjs y docs/ATTRIBUTION.md). Nombres oficiales ES/EN.
 * Nombres y valores del juego © Ubisoft. Sin mejoras (investigación, dioses, especialistas).
 */
import game from "./game.json";

export type Lang = "es" | "en";
export type Text = Record<Lang, string>;
export type Region = "Albion" | "Latium";
export type Glyph =
  | "field" | "animal" | "flower" | "fish" | "tree" | "mine" | "clay" | "reeds"
  | "flask" | "anvil" | "mill" | "hammer" | "brick" | "shield" | "bowl" | "tunic"
  | "amphora" | "lyre" | "fire" | "house" | "ship";

export type Building = {
  id: string;
  region: Region;
  name: Text;
  plural: Text;
  good: Text;
  productId: string;
  glyph: Glyph;
  cycleSeconds: number;
  output: number;
  /** Insumo por ciclo, indexado por el edificio proveedor (misma región). */
  inputs: Record<string, number>;
  /** Proveedor de combustible, si lo usa, y cuánto gasta por ciclo sin mejoras. */
  fuelFrom?: string;
  fuelQty?: number;
  workers?: { level: number; amount: number };
  fertility?: Text;
  /** Insumos sin edificio que los produzca (subproductos, p. ej. obsidiana): producto → cantidad por ciclo. */
  loose?: Record<string, number>;
};

export type Category = "Food" | "Fashion" | "Household" | "Culture" | "Construction" | "Intermediate" | "Raw";

export type Chain = {
  id: string;
  region: Region;
  root: string;
  product: Text;
  category: Category;
};

export type Level = {
  id: string;
  region: Region;
  name: Text;
  residence: Text;
  needs: { product: string; rate: number; pop: number }[];
  /** Servicios públicos y monumentos que piden (no se producen). */
  services: { id: string; name: Text; wonder: boolean; pop: number }[];
  /** Residentes por casa con todo cubierto, y parte que trabaja. */
  residents: number;
  workforce: number;
};

type Raw = typeof game;
type RawBuilding = {
  region: string; name: Text; kind: string; cycle: number; inputs: Record<string, number>;
  fuel: boolean; output: number; outAmount: number;
  workers?: { level: number; amount: number }; fertility?: Text;
};

export const source = game.source;
export const fuel = game.fuel;
export const consumptionLevels = game.consumption as { id: "Low" | "Medium" | "High"; factor: number; name: Text }[];

const KIND_GLYPH: Record<string, Glyph> = {
  Field: "field", Pasture: "animal", Meadow: "flower", Coast: "fish", Forest: "tree",
  Mountain: "mine", River: "clay", Marsh: "reeds", Chemical: "flask", Heavy: "anvil",
  Ingredient: "mill", Crafts: "hammer", Craft: "hammer", Construction: "brick",
  Military: "shield", Food: "bowl", Fashion: "tunic", Household: "amphora", Culture: "lyre",
};

// ── Plurales (los datos solo traen singular) ─────────────────────────────
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function pluralWordEs(w: string) {
  if (/^[a-záéíóúü]/i.test(w) === false) return w;
  const last = w.slice(-1).toLowerCase();
  if ("aeo".includes(last) || "áéó".includes(last)) return w + "s";
  if ("iu".includes(last)) return w + "s";
  if (last === "z") return w.slice(0, -1) + "ces";
  if (/[áéíóú][ns]$/i.test(w)) return w.slice(0, -2) + strip(w.slice(-2, -1)) + w.slice(-1) + "es";
  if (/[sx]$/i.test(w)) return w;
  return w + "es";
}
export function pluralEs(name: string) {
  const i = name.indexOf(" de ");
  const head = i < 0 ? name : name.slice(0, i);
  const tail = i < 0 ? "" : name.slice(i);
  return head.split(" ").map(pluralWordEs).join(" ") + tail;
}
function pluralWordEn(w: string) {
  if (/[^s]s$/i.test(w)) return w; // Ponds, Works, Greenhands, Tabulus
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(w)) return w + "es";
  return w + "s";
}
export function pluralEn(name: string) {
  const i = name.indexOf(" of ");
  if (i >= 0) {
    const head = name.slice(0, i).split(" ");
    head[head.length - 1] = pluralWordEn(head[head.length - 1]);
    return head.join(" ") + name.slice(i);
  }
  const parts = name.split(" ");
  parts[parts.length - 1] = pluralWordEn(parts[parts.length - 1]);
  return parts.join(" ");
}

/** Edificios añadidos a mano que ahora trae el juego: cambia sus ids viejos por los del juego. */
const REPLACED = Object.entries((game as { replaced?: Record<string, number> }).replaced ?? {});
export function migrateIds<T>(x: T): T {
  if (!REPLACED.length) return x;
  let s = JSON.stringify(x);
  for (const [old, now] of REPLACED) s = s.replaceAll(`"b${old}"`, `"b${now}"`).replaceAll(`"c${old}"`, `"c${now}"`);
  return JSON.parse(s) as T;
}

// ── Edificios ─────────────────────────────────────────────────────────────
const raw = game.buildings as unknown as Record<string, RawBuilding>;
const products = game.products as unknown as Record<string, { name: Text; construction?: boolean; need?: string }>;
export const productName = (id: string | number): Text => products[id]?.name ?? { es: String(id), en: String(id) };

/** Proveedor de un producto en una región (el primero que define el juego). */
const providers: Record<string, Record<string, string[]>> = {};
for (const [guid, b] of Object.entries(raw)) ((providers[b.region] ??= {})[b.output] ??= []).push("b" + guid);
export const providerOf = (region: Region, productId: string | number) => providers[region]?.[String(productId)]?.[0];
export const alternativesOf = (region: Region, productId: string | number) => providers[region]?.[String(productId)] ?? [];

export const buildings: Record<string, Building> = {};
for (const [guid, b] of Object.entries(raw)) {
  const region = b.region as Region;
  const id = "b" + guid;
  const inputs: Record<string, number> = {};
  const loose: Record<string, number> = {};
  for (const [prod, amount] of Object.entries(b.inputs)) {
    const from = providerOf(region, prod);
    if (from) inputs[from] = (inputs[from] ?? 0) + amount;
    else loose[prod] = amount;
  }
  let fuelFrom: string | undefined;
  if (b.fuel) {
    fuelFrom = providerOf(region, fuel.product);
    if (fuelFrom) inputs[fuelFrom] = (inputs[fuelFrom] ?? 0) + b.cycle / fuel.seconds;
  }
  buildings[id] = {
    id, region,
    name: b.name,
    plural: { es: pluralEs(b.name.es), en: pluralEn(b.name.en) },
    good: productName(b.output),
    productId: String(b.output),
    glyph: String(b.output) === String(fuel.product) ? "fire" : KIND_GLYPH[b.kind] ?? "hammer",
    cycleSeconds: b.cycle,
    output: b.outAmount,
    inputs,
    ...(fuelFrom ? { fuelFrom, fuelQty: b.cycle / fuel.seconds } : {}),
    ...(b.workers ? { workers: b.workers } : {}),
    ...(b.fertility ? { fertility: b.fertility } : {}),
    ...(Object.keys(loose).length ? { loose } : {}),
  };
}

// ── Cadenas: bienes que piden las casas, materiales de construcción y productos intermedios ──
export const chains: Chain[] = Object.values(buildings)
  .filter((b) => providerOf(b.region, b.productId) === b.id)
  .map((b) => {
    const p = products[b.productId];
    const category: Category = p?.need && p.need in { Food: 1, Fashion: 1, Household: 1, Culture: 1 }
      ? (p.need as Category)
      : p?.construction ? "Construction"
      : Object.keys(b.inputs).length > 0 ? "Intermediate" : "Raw";
    return { id: "c" + b.id.slice(1), region: b.region, root: b.id, product: b.good, category };
  })
  .sort((a, b) => a.product.es.localeCompare(b.product.es, "es"));

export const chainById: Record<string, Chain> = Object.fromEntries(chains.map((c) => [c.id, c]));
export const chainForProduct = (region: Region, productId: string) => {
  const b = providerOf(region, productId);
  return b ? chainById["c" + b.slice(1)] : undefined;
};

export const categoryName: Record<Category, Text> = {
  ...(Object.fromEntries(Object.entries(game.categories).filter(([k]) => ["Food", "Fashion", "Household", "Culture"].includes(k))) as Record<"Food" | "Fashion" | "Household" | "Culture", Text>),
  Construction: { es: "Construcción", en: "Construction" },
  Intermediate: { es: "Productos intermedios", en: "Intermediate goods" },
  Raw: { es: "Materias primas", en: "Raw materials" },
};
export const categoryOrder: Category[] = ["Food", "Fashion", "Household", "Culture", "Construction", "Intermediate", "Raw"];

// ── Población ─────────────────────────────────────────────────────────────
const LEVEL_ORDER = [1499, 1496, 1497, 1498, 1500, 1501, 1502, 1503, 1504];
export const levels: Level[] = (game.levels as Raw["levels"])
  .map((l) => ({
    id: "p" + l.id, region: l.region as Region, name: l.name, residence: l.residence,
    needs: l.needs.map((n) => ({ product: String(n.product), rate: n.rate, pop: n.pop })),
    services: l.services.map((x) => ({ id: String(x.id), name: x.name, wonder: x.wonder, pop: x.pop })),
    residents: l.residents, workforce: l.workforce,
  }))
  .sort((a, b) => LEVEL_ORDER.indexOf(+a.id.slice(1)) - LEVEL_ORDER.indexOf(+b.id.slice(1)));
export const levelById: Record<string, Level> = Object.fromEntries(levels.map((l) => [l.id, l]));
export const levelOfWorkforce = (guid: number) => levelById["p" + guid];

// ── Mejoras ───────────────────────────────────────────────────────────────
type RawBoost = { id: string; name: Text; prod: number; base: number; fuel: number; targets: number[] };
export type Boost = { id: string; name: Text; prod: number; base: number; fuel: number; targets: string[]; source?: string };
export type Patron = { id: string; name: Text; effects: (Boost & { milestones: { devotion: number; scaling: number }[] })[] };
const toBoost = (x: RawBoost & { source?: string }): Boost => ({ ...x, targets: x.targets.map((t) => "b" + t) });
const rawBoosts = game.boosts as unknown as { techs: RawBoost[]; patrons: { id: string; name: Text; effects: (RawBoost & { milestones: { devotion: number; scaling: number }[] })[] }[]; events: (RawBoost & { source: string })[] };
export const techs: Boost[] = rawBoosts.techs.map(toBoost);
export const patrons: Patron[] = rawBoosts.patrons.map((p) => ({ ...p, effects: p.effects.map((e) => ({ ...toBoost(e), milestones: e.milestones })) }));
export const events: Boost[] = rawBoosts.events.map(toBoost);
export const patronById = Object.fromEntries(patrons.map((p) => [p.id, p]));
/** ¿Afecta esta mejora a algún edificio de la región? */
export const touchesRegion = (b: { targets: string[] }, region: Region) => b.targets.some((t) => buildings[t]?.region === region);
