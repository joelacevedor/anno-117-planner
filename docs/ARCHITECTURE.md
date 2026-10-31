# Arquitectura

Una app Vite + React + TypeScript, sin servidor.

- **Catálogo** (`src/data`): `game.json` generado por `scripts/import-params.mjs`; `catalog.ts` lo
  convierte en edificios `b<guid>` (insumos apuntando al proveedor de la misma región, combustible a
  ciclo/120 s por ciclo), cadenas `c<guid>` por categoría y niveles de casas `p<guid>`.
- **Cálculo** (`src/core/plan.ts`): `perFinal` recorre la cadena con fracciones exactas; `islandPlan`
  suma todas las cadenas activas por edificio y redondea una vez (AC-M01/M02/M04). Si un proveedor
  compartido va corto, se reparte en proporción para saber cuántos edificios finales funcionan.
  Detecta ciclos y referencias rotas.
- **Estado** (`src/core/state.ts`): un objeto validado con Zod en `localStorage`; datos dañados se
  apartan y se arranca limpio; importar guarda la partida anterior para deshacer.
- **UI** (`src/ui`): tres pestañas; contexto React con acciones `setGoal` / `setBuilt`. La orden de la
  pantalla de cadena se renderiza en un portal para que las animaciones de entrada no la desplacen.
- **Movimiento**: solo transform/opacity; entrada 360 ms, cadena 550 ms, pulso de número 280 ms;
  sin efectos continuos. Se desactiva con `prefers-reduced-motion` o el ajuste «Reducidas».
- **PWA**: precache de la app y caché de fuentes; aviso de actualización. `build:single` genera un HTML
  autónomo sin service worker para probar en cualquier navegador.

- **Población**: casas × consumo por casa × nivel de consumo → bienes por minuto → edificios finales
  exactos, que se suman a los objetivos manuales antes de redondear. Los bienes sin productor en la
  región se listan como importaciones.

- **Comercio** (`worldPlan`): cada isla guarda `supplies` (producto → isla de origen). El plan de la
  isla corta la cadena en esos productos y los devuelve como demanda externa (unidades/min), que se
  suma como `tradeIn` a la isla de origen; se repite hasta estabilizar (máx. 8 pasadas). La isla que
  recibe un pedido lo produce ella misma, lo que evita ciclos. Lo que el origen no puede producir queda
  marcado como sin abastecer.

- **Mejoras** (`src/core/boosts.ts`): investigación, dios patrón (efecto × devoción), eventos y % manual
  → multiplicador por edificio `(100 + base) × (100 + prod) / 10000`, como el juego. Divide los edificios
  necesarios sin cambiar el insumo por unidad; el combustible se gasta por tiempo, así que por unidad baja
  con la productividad y con los fuelles.

- **Productores alternativos**: `Mods.provider` (producto → edificio) se aplica en todo recorrido de la
  cadena con `pick()`; por defecto, el primer productor que define el juego.

Pendiente: efectos de objetos/especialistas.
