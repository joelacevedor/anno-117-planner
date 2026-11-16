# Protección de los datos de la partida

Lo primero es no perder la partida. Este documento resume qué la protege y qué hay que hacer antes
de cambiar algo que afecte a los datos.

## Suite de integridad (obligatoria)

Usa una **copia de referencia** de la partida real, siempre **fuera del repositorio** y **sin el código
de la partida compartida**.

1. En la app: Ajustes → Descargar copia (`anno117-plan.json`).
2. Prepararla (quita el código y la guarda en `~/.praefectus/referencia.json`, o en `$PRAEFECTUS_REF`):

   ```bash
   pnpm integrity:prepare ruta/a/anno117-plan.json
   ```

3. Pasar la suite:

   ```bash
   pnpm integrity
   ```

Si la copia no está o todavía lleva el código, la validación **se detiene con un error**: no se salta.
Todo ocurre en memoria. No hay red, ni Firebase, ni se escribe en la partida real.

La suite comprueba lo siguiente:

- Al cargar no se pierde ni cambia ningún valor con contenido. Solo se quitan valores a 0 de
  objetivos, edificios y viviendas.
- Quitar esos ceros no cambia ningún cálculo: planes, economía, Imperio, rutas y recuentos.
- Se conservan las necesidades desactivadas de cada isla, en el mismo orden.
- Guardar y recargar, exportar e importar, y restaurar una copia dan exactamente la partida.
- La partida multiplicada hasta 200 islas carga, guarda y cabe en 2 MB.
- Con dos dispositivos simulados (con las claves desordenadas, como hace Firestore), lo que sube uno
  llega igual al otro, sin reescrituras. Las ediciones a la vez en islas distintas no pisan nada.

Si todo pasa, se escribe `integrity.lock.json` con la huella de los archivos que deciden cómo se leen,
guardan, migran y sincronizan los datos (lista en `scripts/integrity-files.mjs`). El candado no lleva
datos de la partida.

**CI y publicación** ejecutan `pnpm integrity:check`. Si alguno de esos archivos cambió y no se volvió
a pasar la suite en local, las pruebas y la publicación se detienen.

## Protecciones en la app

- **Copia antes de migrar.** Al abrir la partida guardada se compara lo guardado con lo cargado
  (`src/core/integrity.ts`). Si cambia la versión de los datos o se perdería algún valor con
  contenido, antes de guardar se hace una copia exacta del texto guardado. Es una copia automática
  con el motivo «antes de actualizar los datos», y las copias periódicas no la empujan fuera.
- **Sin copia, no se guarda.** Si esa copia no se puede escribir, la app deja de guardar en este
  dispositivo y avisa con «No se ha podido guardar». Así nunca pisa lo único que queda.
- **Partida compartida.** Antes de que un dispositivo suba la versión de datos de la partida (una
  migración compartida), guarda una copia de la partida tal y como está en el servidor. Si no puede,
  no envía nada. Las apps con una versión de datos menor que la de la partida la ven, pero no
  escriben en ella (`dataVersion`).
- **Copias automáticas.** Hay tres casos:
  - una cada 6 horas;
  - otra antes de que la partida compartida quite islas;
  - otra antes de empezar una partida nueva.

  Se guardan como mucho 5 y caben en un presupuesto de unos 2,5 MB. Con partidas muy grandes se
  guardan menos, pero siempre la última.
- **Límites.** 200 islas y 2 MB por importación (contados en bytes).

## Canal de prueba de Firebase (retirado de la rama)

- Se quitó el flujo `preview.yml`, que publicaba `dlc-egipto` en un canal de vista previa.
- El canal ya publicado no se ha borrado y caduca solo, 30 días después de su última publicación.
- Las partidas creadas con la versión de prueba (`meta.preview`) siguen en Firestore. Se listan sin
  tocarlas con el flujo manual **Listar partidas de prueba**. Ese flujo no imprime códigos, solo una
  huella corta de cada uno.
