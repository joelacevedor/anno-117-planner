import type { ReactNode } from "react";

/**
 * Iconos de Praefectus: una sola familia dibujada a mano para la app (sin arte del juego).
 * Retícula de 24, trazo de 1,6 con extremos redondeados y motivos romanos discretos:
 * corona de laurel, eslabones, domus con puerta en arco, escuadra y martillo de cantero,
 * galera de vela cuadrada, isla con faro y rueda dentada.
 * Se pintan con `currentColor`: el color (dorado activo, crema inactivo) lo pone el CSS.
 */
const leaf = (x: number, y: number, a: number) => <path transform={`rotate(${a} ${x} ${y})`} d={`M${x} ${y}c-1.3-.9-1.8-2.2-1.4-3.8 1.3.9 1.8 2.2 1.4 3.8Z`} />;

const P = {
  // ── Navegación ──
  /** Imperio: corona de laurel con su lazo. */
  empire: (<>
    <path d="M10.2 20.2C5.8 19 3.4 15.2 4.3 9.5M13.8 20.2c4.4-1.2 6.8-5 5.9-10.7" />
    {leaf(6.6, 18.4, -62)}{leaf(4.9, 15.4, -42)}{leaf(4.2, 12, -22)}{leaf(4.5, 8.6, -4)}
    {leaf(17.4, 18.4, 62)}{leaf(19.1, 15.4, 42)}{leaf(19.8, 12, 22)}{leaf(19.5, 8.6, 4)}
    <path d="M10.6 21.1 9.3 22.6M13.4 21.1l1.3 1.5" />
    <path d="M12 19.3c-1 0-1.8.5-1.8 1s.8 1 1.8 1 1.8-.4 1.8-1-.8-1-1.8-1Z" />
  </>),
  /** Región: mapa plegado de la provincia con su ruta. */
  region: (<>
    <path d="M3.5 6.6 9 4.6l6 2 5.5-2v12.8l-5.5 2-6-2-5.5 2Z" />
    <path d="M9 4.6v12.8M15 6.6v12.8" />
    <path d="M5.6 14.6c1.6-1.8 3.4-2 5.4-1.2s3.6.4 5-1.8" strokeDasharray="1.4 2.2" />
    <circle cx="17.8" cy="9.4" r="1.3" />
  </>),
  /** Cadenas: dos eslabones enlazados. */
  chains: (<>
    <rect x="3.8" y="13.9" width="8" height="4.6" rx="2.3" transform="rotate(-45 7.8 16.2)" />
    <rect x="8" y="9.7" width="8" height="4.6" rx="2.3" transform="rotate(45 12 12)" />
    <rect x="12.2" y="5.5" width="8" height="4.6" rx="2.3" transform="rotate(-45 16.2 7.8)" />
  </>),
  /** Casas: domus con frontón y puerta en arco. */
  houses: (<>
    <path d="M2.8 11.2 12 4.4l9.2 6.8" />
    <path d="M5.2 9.6V20h13.6V9.6" />
    <path d="M10 20v-3.6a2 2 0 0 1 4 0V20" />
    <path d="M3.5 20h17" />
  </>),
  /** Obra: escuadra y martillo de cantero. */
  build: (<>
    <path d="M4 4.5V20h15.5" />
    <path d="M4 8.5h1.8M4 12h1.8M4 15.5h1.8M8 20v-1.8M11.5 20v-1.8M15 20v-1.8" strokeWidth="1.3" />
    <path d="M15.8 4 20 8.2 18.2 10 14 5.8Z" />
    <path d="M16.1 7.9 9.6 14.4" />
  </>),
  /** Rutas: galera de vela cuadrada con remos. */
  routes: (<>
    <path d="M3 14.6h17.4c-.9 2.6-2.9 4-5.6 4H8.4c-2.6 0-4.4-1.4-5.4-4Z" />
    <path d="M20.4 14.6c.9-.7 1.2-1.7.8-2.8" />
    <path d="M12 2.8v2.4M12 11.4v3.2" />
    <path d="M6.8 5.2h10.4c-.9 2-.9 4.1 0 6.2-3.5-.8-6.9-.8-10.4 0 .9-2.1.9-4.2 0-6.2Z" />
    <path d="M8.2 18.6 7 21M12 18.6V21M15.8 18.6 17 21" />
  </>),
  /** Isla: colina sobre las olas con un faro. */
  island: (<>
    <path d="M2.6 19.4c1.9-1 3.6-1 5.5 0s3.6 1 5.5 0 3.6-1 5.5 0" />
    <path d="M4.4 16.3c1.1-3.2 4-5.1 7.6-5.1s6.5 1.9 7.6 5.1" />
    <path d="M10.6 11.3 11.2 6h1.6l.6 5.3" />
    <path d="M10.4 6h3.2" />
    <path d="M12 4.2c-.7-.5-.7-1.3 0-2 .7.7.7 1.5 0 2Z" />
  </>),
  /** Ajustes: rueda dentada con roseta. */
  settings: (<>
    <path d="M18.84 10.09 20.88 9.61v4.78l-2.04-.48-.65 1.57 1.78 1.11-3.38 3.38-1.11-1.78-1.57.65.48 2.04H9.61l.48-2.04-1.57-.65-1.11 1.78-3.38-3.38 1.78-1.11-.65-1.57-2.04.48V9.61l2.04.48.65-1.57-1.78-1.11 3.38-3.38 1.11 1.78 1.57-.65-.48-2.04h4.78l-.48 2.04 1.57.65 1.11-1.78 3.38 3.38-1.78 1.11Z" />
    <circle cx="12" cy="12" r="3" />
  </>),

  // ── Interfaz ──
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>),
  sliders: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
  alert: (<><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.3v.2" /></>),
  chev: (<path d="m9 5.5 6.5 6.5L9 18.5" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  list: (<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>),
  down: (<><path d="M12 4v15" /><path d="m6 13 6 6 6-6" /></>),
  up: (<><path d="M12 20V5" /><path d="m6 11 6-6 6 6" /></>),
  /** Templo: frontón y cuatro columnas. */
  temple: (<><path d="M3.5 9 12 4.4 20.5 9Z" /><path d="M5 9h14M6.5 9v9M10.2 9v9M13.8 9v9M17.5 9v9M4 18h16M3 20.5h18" /></>),
  factory: (<><path d="M3.5 20V10.5l5 3v-3l5 3V6h3.5v14Z" /><path d="M2.5 20h19" /></>),
  people: (<><circle cx="8.5" cy="8" r="2.6" /><circle cx="15.5" cy="8" r="2.6" /><path d="M3.5 19c.5-3.4 2.4-5 5-5s4.5 1.6 5 5M10.5 19c.5-3.4 2.4-5 5-5s4.5 1.6 5 5" /></>),
  /** Balanza (libra). */
  scale: (<><path d="M12 4v15.5M7.5 19.5h9M5 7h14" /><path d="M5 7 2.5 12.5h5ZM19 7l-2.5 5.5h5Z" /></>),
  warn: (<><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.3v.2" /></>),
  boxes: (<><rect x="3.5" y="12.5" width="7.5" height="7.5" rx="1.2" /><rect x="13" y="12.5" width="7.5" height="7.5" rx="1.2" /><rect x="8.2" y="3.5" width="7.5" height="7.5" rx="1.2" /></>),
  bulb: (<><path d="M9.5 18h5M10.5 21h3" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ?? "ico"} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
