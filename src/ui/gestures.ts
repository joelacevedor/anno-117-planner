import { useEffect, useRef, type RefObject } from "react";

/**
 * Deslizar en horizontal sobre la pantalla:
 *  - a la derecha → `onRight` (volver, o pestaña anterior)
 *  - a la izquierda → `onLeft` (pestaña siguiente)
 * La pantalla sigue al dedo; si no hay acción en ese sentido, se resiste y vuelve a su sitio.
 * No se activa al empezar sobre algo que se desplaza en horizontal, campos de texto o deslizadores.
 */
export function useSwipeNav(
  ref: RefObject<HTMLElement | null>,
  opts: { onRight?: () => void; onLeft?: () => void; reduceMotion: boolean },
) {
  // Las acciones cambian en cada render; los escuchadores se registran una sola vez
  // para que un render a mitad de gesto no lo corte.
  const live = useRef(opts);
  live.current = opts;
  useEffect(() => {
    let startX = 0, startY = 0, startT = 0, dx = 0;
    let mode: "idle" | "pending" | "drag" | "off" = "idle";
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

    const blocked = (el: EventTarget | null) => {
      for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        if (n.matches?.("input, textarea, select, [data-noswipe], dialog")) return true;
        const s = getComputedStyle(n);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    const el = () => ref.current;
    const set = (x: number, animate: boolean) => {
      const e = el();
      if (!e) return;
      e.style.transition = animate ? "transform 220ms cubic-bezier(.22,1,.36,1), opacity 220ms ease" : "none";
      e.style.transform = x ? `translateX(${x}px)` : "";
      e.style.opacity = x ? String(Math.max(0.4, 1 - Math.abs(x) / (window.innerWidth * 1.4))) : "";
    };
    const clear = () => { const e = el(); if (e) { e.style.transition = ""; e.style.transform = ""; e.style.opacity = ""; } };

    const start = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) { mode = "off"; return; }
      const t = ev.touches[0];
      // En Safari (fuera de la app instalada) el borde izquierdo ya es el gesto de atrás del navegador.
      if (!standalone && t.clientX < 24) { mode = "off"; return; }
      if (blocked(ev.target)) { mode = "off"; return; }
      startX = t.clientX; startY = t.clientY; startT = performance.now(); dx = 0; mode = "pending";
    };
    const move = (ev: TouchEvent) => {
      if (mode === "off" || mode === "idle") return;
      const t = ev.touches[0];
      const x = t.clientX - startX, y = t.clientY - startY;
      if (mode === "pending") {
        if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { mode = "off"; return; }
        if (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.5) return;
        mode = "drag";
      }
      const { onRight, onLeft, reduceMotion } = live.current;
      const can = x > 0 ? !!onRight : !!onLeft;
      dx = can ? x : x * 0.2;
      if (!reduceMotion) set(dx, false);
    };
    const end = () => {
      if (mode !== "drag") { mode = "idle"; return; }
      mode = "idle";
      const v = Math.abs(dx) / Math.max(1, performance.now() - startT);
      const far = Math.abs(dx) > Math.min(110, window.innerWidth * 0.28) || (v > 0.5 && Math.abs(dx) > 40);
      const { onRight, onLeft, reduceMotion } = live.current;
      const action = dx > 0 ? onRight : onLeft;
      if (far && action) {
        if (reduceMotion) { clear(); action(); return; }
        set(Math.sign(dx) * window.innerWidth * 0.6, true);
        setTimeout(() => { clear(); action(); }, 160);
      } else if (!reduceMotion) {
        set(0, true);
        setTimeout(clear, 230);
      }
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [ref]);
}

/** Bajar la hoja inferior con el dedo para cerrarla. */
export function useSheetDrag(ref: RefObject<HTMLDialogElement | null>, scroller: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let y0 = 0, dy = 0, on = false;
    const start = (e: TouchEvent) => {
      on = (scroller.current?.scrollTop ?? 0) <= 0;
      y0 = e.touches[0].clientY; dy = 0;
    };
    const move = (e: TouchEvent) => {
      if (!on) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0 && (scroller.current?.scrollTop ?? 0) > 0) { on = false; return; }
      d.style.transition = "none";
      d.style.transform = dy ? `translateY(${dy}px)` : "";
    };
    const end = () => {
      if (!on) return;
      on = false;
      d.style.transition = "transform 200ms cubic-bezier(.22,1,.36,1)";
      if (dy > 90) {
        d.style.transform = "translateY(100%)";
        setTimeout(() => { d.close(); d.style.transform = ""; d.style.transition = ""; }, 180);
      } else d.style.transform = "";
    };
    d.addEventListener("touchstart", start, { passive: true });
    d.addEventListener("touchmove", move, { passive: true });
    d.addEventListener("touchend", end);
    return () => {
      d.removeEventListener("touchstart", start);
      d.removeEventListener("touchmove", move);
      d.removeEventListener("touchend", end);
    };
  }, [ref, scroller]);
}
