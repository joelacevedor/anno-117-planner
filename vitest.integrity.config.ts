import { defineConfig } from "vitest/config";

/**
 * Suite de integridad con la copia de referencia de la partida (fuera del repositorio).
 * `pnpm integrity`. Si la copia no está, la validación se detiene con un error (no se salta).
 */
export default defineConfig({
  test: {
    include: ["tests/integrity/**/*.integrity.ts"],
    globalSetup: ["tests/integrity/setup.ts"],
    // Sin diferencias largas en pantalla: los fallos dicen la ruta del dato, no vuelcan la partida.
    diff: { truncateThreshold: 400 },
  },
});
