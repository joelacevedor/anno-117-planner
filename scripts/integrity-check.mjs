#!/usr/bin/env node
/**
 * Comprueba (sin copia de referencia) que la suite de integridad se pasó con el código actual de los
 * datos. Lo ejecutan las pruebas de CI y la publicación: si los archivos de datos cambiaron desde la
 * última validación, se detiene.
 */
import { existsSync, readFileSync } from "node:fs";
import { DATA_FILES, LOCK, dataHash } from "./integrity-files.mjs";

if (!existsSync(LOCK)) {
  console.error(`::error::Falta ${LOCK}. Pasa la suite de integridad en local: pnpm integrity`);
  process.exit(1);
}
const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const now = dataHash();
if (lock.dataHash !== now) {
  console.error("::error::Han cambiado archivos que afectan a los datos de la partida y no se ha pasado la suite de integridad con la copia de referencia.");
  console.error(`Archivos vigilados: ${DATA_FILES.join(", ")}`);
  console.error("En local, con la copia de referencia: pnpm integrity (actualiza integrity.lock.json) y súbelo.");
  process.exit(1);
}
console.log(`Integridad validada el ${lock.checkedAt} (${lock.tests} pruebas, copia ${lock.reference}).`);
