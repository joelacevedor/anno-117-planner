# Fuentes y derechos — 31-10-2026

## Datos del juego

`src/data/game.json` se genera con `scripts/import-params.mjs` a partir de `js/params-base.js` de
https://github.com/anno-mods/anno-117-calculator, revisión `16ce9aa4e49c7baac45d8c3f75da6d2ba27ab564`
(Release 3.1). Solo se extraen nombres ES/EN, tiempos de ciclo, insumos, combustible, mano de obra,
fertilidad y consumo por casa. No se copian iconos, imágenes ni código de la calculadora.

Edificios que el juego tiene y ese dataset todavía no: `scripts/extra-buildings.json` (por ahora, la mina
de carbón; ciclo de 30 s y 5 plebeyos tomados del juego y de https://anno117.tools/buildings/coal-mine.
La mano de obra de la versión de Albion está sin confirmar).

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
