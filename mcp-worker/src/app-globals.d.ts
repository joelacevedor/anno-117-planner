// Tipos que el código de la app (src/core/state.ts) espera del navegador. En el Worker no se usan:
// state.ts solo toca localStorage al guardar o cargar en el móvil, y el Worker no llama a esas funciones.
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
declare var localStorage: Storage | undefined;
declare var crypto: Crypto;
