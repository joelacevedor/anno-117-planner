// Resumen legible de lo que cambia entre dos game.json (para el aviso semanal de datos nuevos).
// Uso: node scripts/data-diff.mjs <viejo.json> <nuevo.json>
import { readFileSync } from "node:fs";
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")));
const out = [];
const name = (x) => x?.name?.es ?? "?";
const keys = (o) => new Set(Object.keys(o ?? {}));
const diffSet = (x, y) => [...keys(y)].filter((k) => !keys(x).has(k));

const nb = diffSet(a.buildings, b.buildings), gb = diffSet(b.buildings, a.buildings);
if (nb.length) out.push(`**Edificios nuevos (${nb.length}):** ` + nb.map((k) => `${name(b.buildings[k])} (${b.buildings[k].region})`).join(", "));
if (gb.length) out.push(`**Edificios que desaparecen (${gb.length}):** ` + gb.map((k) => name(a.buildings[k])).join(", "));
const ch = [...keys(a.buildings)].filter((k) => b.buildings[k] && JSON.stringify(a.buildings[k]) !== JSON.stringify(b.buildings[k]));
if (ch.length) out.push(`**Edificios con cambios (${ch.length}):** ` + ch.map((k) => name(b.buildings[k])).join(", "));
const np = diffSet(a.products, b.products);
if (np.length) out.push(`**Productos nuevos (${np.length}):** ` + np.map((k) => name(b.products[k])).join(", "));
const regions = (g) => new Set(Object.values(g.buildings).map((x) => x.region));
const nr = [...regions(b)].filter((r) => !regions(a).has(r));
if (nr.length) out.push(`**Regiones nuevas:** ${nr.join(", ")} (hace falta añadirlas en la app: colores, emblema, retratos)`);
const lv = (g) => Object.fromEntries(g.levels.map((l) => [l.id, l]));
const la = lv(a), lb = lv(b);
const nl = Object.keys(lb).filter((k) => !la[k]);
if (nl.length) out.push(`**Niveles de población nuevos:** ` + nl.map((k) => name(lb[k])).join(", "));
const cl = Object.keys(lb).filter((k) => la[k] && JSON.stringify(la[k]) !== JSON.stringify(lb[k]));
if (cl.length) out.push(`**Niveles con cambios (necesidades o consumo):** ` + cl.map((k) => name(lb[k])).join(", "));
const pa = new Set(a.boosts.patrons.map((p) => p.id));
const npt = b.boosts.patrons.filter((p) => !pa.has(p.id));
if (npt.length) out.push(`**Dioses nuevos:** ` + npt.map(name).join(", "));
const ca = a.consumption.map((c) => c.id).join(","), cb = b.consumption.map((c) => c.id).join(",");
if (ca !== cb) out.push(`**Niveles de consumo:** ${ca} → ${cb}`);
console.log(out.length ? out.join("\n\n") : "Sin cambios que afecten a la app.");
