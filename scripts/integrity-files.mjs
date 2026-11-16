/**
 * Archivos que deciden cómo se leen, guardan, migran y sincronizan los datos de la partida.
 * Si cambia cualquiera de ellos, hay que volver a pasar la suite de integridad con la copia de
 * referencia (`pnpm integrity`) antes de publicar. Las pruebas de CI lo comprueban con el candado.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const DATA_FILES = [
  "src/core/state.ts",
  "src/core/integrity.ts",
  "src/core/supply.ts",
  "src/data/catalog.ts",
  "src/data/game.json",
  "src/sync/model.ts",
  "src/sync/controller.ts",
  "src/sync/firebase.ts",
  "src/sync/useSync.ts",
  "tests/integrity/game.integrity.ts",
  "tests/integrity/reference.ts",
  "tests/integrity/setup.ts",
  "vitest.integrity.config.ts",
];

export const LOCK = "integrity.lock.json";

/** Huella de los archivos de datos (los saltos de línea de Windows no cuentan). */
export function dataHash(root = ".") {
  const h = createHash("sha256");
  for (const f of DATA_FILES) {
    h.update(f + "\0");
    h.update(readFileSync(`${root}/${f}`, "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}
