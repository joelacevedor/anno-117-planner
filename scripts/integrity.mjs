#!/usr/bin/env node
/**
 * `pnpm integrity`: suite de integridad con la copia de referencia de la partida.
 *  1. Si no está la copia de referencia (o lleva el código de la partida), se detiene.
 *  2. Pasa las pruebas de tests/integrity (todo en memoria: sin red ni Firebase).
 *  3. Si todo pasa, escribe integrity.lock.json con la huella de los archivos de datos.
 *     El candado no contiene datos de la partida: solo huellas y la fecha.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { LOCK, dataHash } from "./integrity-files.mjs";

const ref = process.env.PRAEFECTUS_REF || join(homedir(), ".praefectus", "referencia.json");
const stop = (msg) => { console.error(`Validación detenida: ${msg}`); process.exit(1); };
if (!existsSync(ref)) stop(`no está la copia de referencia (${ref}). Prepárala con: pnpm integrity:prepare <copia-exportada.json>`);
const raw = readFileSync(ref, "utf8");
let o;
try { o = JSON.parse(raw); } catch { stop("la copia de referencia no es JSON válido."); }
if (o?.session?.code) stop("la copia de referencia lleva el código de la partida compartida. Vuelve a prepararla con pnpm integrity:prepare.");

const before = dataHash();
const out = join(process.env.TMPDIR || "/tmp", `praefectus-integrity-${process.pid}.json`);
const run = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.integrity.config.ts", "--reporter=default", "--reporter=json", `--outputFile.json=${out}`], { stdio: "inherit", env: { ...process.env, PRAEFECTUS_REF: ref } });
if (run.status !== 0) stop("la suite de integridad ha fallado. No se actualiza el candado.");
let tests = 0;
try { tests = JSON.parse(readFileSync(out, "utf8")).numPassedTests; } catch { /* sin recuento */ }
rmSync(out, { force: true });
if (dataHash() !== before) stop("los archivos de datos cambiaron mientras se validaba. Vuelve a lanzarla.");

const lock = {
  "//": "Lo escribe `pnpm integrity` al pasar la suite con la copia de referencia. No editar a mano.",
  dataHash: before,
  reference: createHash("sha256").update(raw).digest("hex").slice(0, 12),
  tests,
  checkedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
console.log(`Integridad validada: ${tests} pruebas. ${LOCK} actualizado.`);
