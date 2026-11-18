import { useEffect, useState } from "react";

/** ¿Se cumple esta consulta de pantalla? (se actualiza al cambiar el tamaño de la ventana) */
export function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}
