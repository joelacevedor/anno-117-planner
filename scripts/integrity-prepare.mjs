#!/usr/bin/env node
/**
 * `pnpm integrity:prepare <copia-exportada.json>`: prepara la copia de referencia para la suite
 * de integridad, fuera del repositorio ($PRAEFECTUS_REF o ~/.praefectus/referencia.json).
 * Quita el código de la partida compartida (y el jugador) antes de guardarla. No imprime datos.
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const src = process.argv[2];
if (!src) { console.error("Uso: pnpm integrity:prepare <copia-exportada.json>"); process.exit(1); }
const dest = resolve(process.env.PRAEFECTUS_REF || join(homedir(), ".praefectus", "referencia.json"));
if (dest.startsWith(resolve(".") + "/")) { console.error("La copia de referencia no puede guardarse dentro del repositorio."); process.exit(1); }
const s = JSON.parse(readFileSync(src, "utf8"));
if (!Array.isArray(s?.islands) || !s.islands.length) { console.error("Ese archivo no parece una partida exportada."); process.exit(1); }
s.session = null;
mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
writeFileSync(dest, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
chmodSync(dest, 0o600);
console.log(`Copia de referencia preparada sin código de partida: ${dest} (${s.islands.length} islas).`);
