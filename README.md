# Anno 117 · Cadenas

**0.10.0 · proyecto de fans · [abrir la app](https://anno117-cadenas.web.app)**

Planificador para tener abierto en el móvil mientras juegas (pensado para Xbox + segunda pantalla).
Eliges qué producir y cuántos edificios finales quieres abastecer; la app dibuja la cadena en
**edificios enteros**, te dice la proporción sin desperdicio y, al marcar lo que ya tienes, te da una
orden directa: «Construye 3 secaderos de barro».

## Pantallas

- **Cadenas**: todas las cadenas de la región de tu isla, por categorías y con buscador. Al abrir una:
  − / + y atajos sin desperdicio, cadena por etapas (materias primas → procesado → final) en edificios
  enteros, trabajadores y fertilidad de cada edificio, casillas para marcar lo construido y orden fija abajo.
- **Casas**: cuántas casas tienes de cada nivel y qué necesidades quieres cubrir. La app lo convierte en
  edificios y avisa de los bienes que tu región no produce.
- **Obra**: la lista de la isla para mirar de reojo mientras juegas. Suma cadenas, casas y lo que piden
  otras islas (cada edificio se redondea una sola vez). Lista «Construye» plegable, filas de una línea con
  filtro Faltan / Por cadena / Todos y buscador, y un bloque de comercio (recibes, envías, falta origen).
- **Comercio**: en cualquier eslabón de una cadena, o en lo que tus casas piden y tu región no produce,
  eliges de qué isla llega (también el producto final, ya hecho). Puede ser una, varias a la vez (repartidas
  por partes) o una parte hecha aquí.
  Lo que llega deja de construirse aquí y se suma a cada isla de origen (en cadena).
- **Rutas**: todas las rutas entre islas (qué viaja en cada sentido y cuántas t/min), vista por isla
  (recibe, envía, quién depende de ella) y avisos de lo que nadie envía, con acceso directo para arreglarlo.
- **Mejoras**: investigación (para toda la partida), dios patrón y nivel de devoción, festivales y eventos
  por isla, y ajuste manual de productividad en cada edificio (especialistas, objetos, módulos).
  Con más productividad se necesitan menos edificios; el carbón se gasta por tiempo.
- **Productores alternativos**: si el juego tiene dos edificios para el mismo producto en la región
  (p. ej. mena de oro: lavandería o mina), eliges cuál usas en la cadena; se guarda por isla.
- **Jugar con un amigo**: partida compartida en tiempo real con un código (Firebase, gratis). Ver
  [docs/SHARED_GAME.md](docs/SHARED_GAME.md). Se activa con tu propia configuración de Firebase.
- **Islas**: varias islas (Albion / Latium), idioma ES/EN, nivel de consumo de la partida, animaciones
  suaves o reducidas, copia de seguridad y procedencia de los datos.

## Datos

Catálogo generado con `scripts/import-params.mjs` desde `js/params-base.js` de
[anno-mods/anno-117-calculator](https://github.com/anno-mods/anno-117-calculator) (revisión `16ce9aa`,
Release 3.1): nombres oficiales ES/EN, tiempos, insumos, combustible, mano de obra, fertilidad y consumo
por casa. Las pruebas lo contrastan con los ratios de Prima Games. Sin mejoras de productividad.

```sh
node scripts/import-params.mjs ../anno-117-calculator/js/params-base.js <sha>
```

## Desarrollo

Node ≥ 22.18, pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev            # desarrollo
pnpm test           # cálculo y guardado (vitest)
pnpm build          # PWA con modo offline → dist/
pnpm test:e2e       # recorridos en viewport iPhone (Playwright)
pnpm build:single   # un solo HTML para compartir/probar → dist-single/anno117-cadenas.html
```

## Estructura

- `src/data/game.json` + `catalog.ts` — catálogo importado, plurales, cadenas y niveles de casas.
- `src/core/plan.ts` — cálculo puro: fracciones dentro, población → edificios, redondeo único por edificio, cuello de botella.
- `src/core/state.ts` — esquema Zod, guardado local, importación con copia previa.
- `src/ui/` — App, pantallas, componentes y estilos (tokens de color y de movimiento de `docs/MOTION_SYSTEM.md`).

Código bajo licencia [MIT](LICENSE). Proyecto de fans independiente, sin relación con Ubisoft: nombres y valores del juego © Ubisoft (ver [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)).
