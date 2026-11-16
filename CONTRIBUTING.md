# Contribuir / Contributing

ES: Lee `docs/ARCHITECTURE.md` y `docs/MOTION_SYSTEM.md`. Mantén el cálculo (`src/core`) independiente
de React y añade pruebas a cualquier cambio matemático. Los datos del juego se regeneran con
`scripts/import-params.mjs`; no los edites a mano. Usa claves ES/EN equivalentes. Antes de abrir un PR:
`pnpm test`, `pnpm build` y `pnpm test:e2e`. Si tocas cómo se leen, guardan o sincronizan los datos,
pasa también `pnpm integrity` con la copia de referencia (ver `docs/DATA_SAFETY.md`). Para probar la partida compartida necesitas tu propio
proyecto de Firebase (ver `docs/SHARED_GAME.md`).

EN: Read `docs/ARCHITECTURE.md` and `docs/MOTION_SYSTEM.md`. Keep calculations (`src/core`) independent
of React and add tests for any math change. Game data is regenerated with `scripts/import-params.mjs`;
don't edit it by hand. Keep ES/EN keys in sync. Before opening a PR: `pnpm test`, `pnpm build` and
`pnpm test:e2e`. If you change how data is loaded, saved or synced, also run `pnpm integrity` with the
reference copy (see `docs/DATA_SAFETY.md`). Shared games need your own Firebase project (see `docs/SHARED_GAME.md`).
