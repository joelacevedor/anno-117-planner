import { checkReference } from "./reference";

/** Sin copia de referencia, la validación se detiene (no se salta ninguna prueba). */
export default function setup() {
  const r = checkReference();
  if (!r.ok) throw new Error(`Validación detenida: ${r.reason}`);
}
