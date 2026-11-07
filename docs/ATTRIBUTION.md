# Fuentes y derechos — 07-11-2026

## Datos del juego

`src/data/game.json` se genera con `scripts/import-params.mjs` a partir de `js/params.js` (incluye los DLC: Prophecies of Ash, The Hippodrome y Dawn of the Delta, Release 4.0, revisión 520ce4e) de
https://github.com/anno-mods/anno-117-calculator, revisión `16ce9aa4e49c7baac45d8c3f75da6d2ba27ab564`
(Release 3.1). Solo se extraen nombres ES/EN, tiempos de ciclo, insumos, combustible, mano de obra,
fertilidad y consumo por casa. No se copian iconos, imágenes ni código de la calculadora.

Edificios que el juego tiene y ese dataset todavía no: `scripts/extra-buildings.json`. Si el dataset
pasa a traerlos (como las minas de carbón desde `js/params.js`), se usa el del dataset y las partidas
guardadas se migran solas (`replaced` en `game.json`).

Un aviso semanal (`.github/workflows/check-data.yml`) comprueba si la calculadora tiene datos nuevos y
abre un aviso con el resumen (`scripts/data-diff.mjs`) y una rama con los datos regenerados.

Software de la calculadora: MIT, © 2019–2024 Nico Höllerich (NiHoel). Su LICENSE aclara que nombres,
imágenes y valores de balance del juego pertenecen a Ubisoft y no están cubiertos por la MIT.
Nombres y valores del juego © Ubisoft. Este es un proyecto de fans, no oficial ni respaldado por Ubisoft.

## Iconos

- Productos (`public/icons/p/*.webp`): ilustraciones originales generadas con OpenArt (Nano Banana 2) para este
  proyecto a partir de descripciones de texto, sin usar imágenes ni iconos del juego como referencia. Las láminas
  originales están en la rama `icon-sources`.
- Retratos de cada clase (`public/icons/pop/*.webp`): ilustraciones originales generadas con OpenArt para este
  proyecto (personajes inventados).
- Glifos de mano de obra (`public/icons/wf/*.png`): siluetas originales generadas con OpenArt.
- Regiones (`src/ui/Emblems.tsx`) y glifos de edificios (`src/ui/Glyph.tsx`): dibujos propios.

Contraste independiente:
- https://anno.land/en/anno-117-buildings/ (fichas de edificio)
- https://primagames.com/tips/all-building-production-ratios-in-anno-117-pax-romana (ratios; las pruebas
  comprueban Tejas, Ánforas, Zapatos de junco y Armas)

Glifos e iconos: SVG propios. Código del proyecto: MIT (ver LICENSE).

## Ajustes propios sobre el dataset (Dawn of the Delta)

- **DLC de cada necesidad.** El dataset 4.0 marca con Dawn of the Delta productos que ya estaban en el
  juego base (jabón, vino) porque Egipto también los fabrica. La app considera que una necesidad es de un
  DLC solo si ningún edificio sin DLC la fabrica (`needDlc` en `scripts/import-params.mjs`).
- **Temporadas del Nilo.** El dataset modela Shemu como 3 unidades extra cada 10 ciclos y no recoge Ajet.
  La app usa las reglas comprobadas en el juego (7-11-2026): Ajet al 25 % y Shemu con 1 t extra por ciclo
  (`src/core/nile.ts`). La duración de cada temporada (unas 2 h) es la que publica Ubisoft.
