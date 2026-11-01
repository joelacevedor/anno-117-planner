import { useState, type ReactNode } from "react";
import { Glyph } from "./Glyph";
import type { Glyph as G } from "../data/catalog";

/**
 * Iconos de la app:
 *  - Productos: ilustraciones pintadas propias (generadas con OpenArt para este proyecto), en public/icons/p/<producto>.webp.
 *  - Regiones y clases: glifos planos propios.
 * Ningún icono procede del juego.
 */
const BASE = import.meta.env.BASE_URL;

export function ProductIcon({ product, size = 40, fallback = "hammer" }: { product: string; size?: number; fallback?: G }) {
  const [failed, setFailed] = useState(import.meta.env.MODE === "single");
  if (failed) return <Glyph name={fallback} size={size} />;
  return (
    <img className="picon" src={`${BASE}icons/p/${product}.webp`} width={size} height={size} alt="" aria-hidden="true"
      loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
  );
}

const svg = (children: ReactNode, size: number, cls = "") => (
  <svg className={`emblem ${cls}`} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">{children}</svg>
);

const REGION: Record<string, ReactNode> = {
  Latium: (<>
    <path d="M7.4 20.5C4 18.2 2.3 14.6 3 10.6l1.6.3c-.6 3.3.8 6.3 3.6 8.2zM16.6 20.5l-.8-1.4c2.8-1.9 4.2-4.9 3.6-8.2l1.6-.3c.7 4-1 7.6-4.4 9.9z" />
    <ellipse cx="3.6" cy="8.2" rx="1.2" ry="2.2" transform="rotate(-20 3.6 8.2)" /><ellipse cx="3.4" cy="13" rx="1.2" ry="2.2" transform="rotate(-60 3.4 13)" /><ellipse cx="5" cy="17" rx="1.2" ry="2.2" transform="rotate(-50 5 17)" />
    <ellipse cx="20.4" cy="8.2" rx="1.2" ry="2.2" transform="rotate(20 20.4 8.2)" /><ellipse cx="20.6" cy="13" rx="1.2" ry="2.2" transform="rotate(60 20.6 13)" /><ellipse cx="19" cy="17" rx="1.2" ry="2.2" transform="rotate(50 19 17)" />
    <path d="M12 4 7 7.5h10zM8 8.5h8v1.4H8zM8.6 10.6h1.5v5.6H8.6zM11.25 10.6h1.5v5.6h-1.5zM13.9 10.6h1.5v5.6h-1.5zM7.6 16.8h8.8v1.6H7.6z" />
  </>),
  Albion: (<g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
    <path d="M12 12c0-3.6 2.6-6 5.2-4.9 2.2 1 1.6 4.9-1.4 4.6" /><path d="M12 12c-3.1 1.8-6.6.7-6.8-2.1-.1-2.4 3.5-3.2 4.7-.5" /><path d="M12 12c3.1 1.8 3.4 5.4.9 6.6-2.1 1-4.3-2-2.3-4.2" />
  </g>),
};

/** Clases de trabajadores (guid del nivel de población). */
const WORKER: Record<string, ReactNode> = {
  "1499": (<><path d="M6.5 17.5C6.5 10 9 4 12 4s5.5 6 5.5 13.5z" /><rect x="4" y="17" width="16" height="3.4" rx="1.7" /></>),
  "1496": (<><path d="M9.6 2.5h4.8v1.8h-.7v1.4c2.6 1 4.3 3.8 4.3 7 0 3.6-2.1 6.6-4.3 8.4v.4h-3.4v-.4C8.1 19.3 6 16.3 6 12.7c0-3.2 1.7-6 4.3-7V4.3h-.7z" /><path d="M8.4 6.2C5.6 5.6 4 7.4 4.6 9.8l1.3-.3c-.3-1.6.6-2.5 2.2-2.1zM15.6 6.2c2.8-.6 4.4 1.2 3.8 3.6l-1.3-.3c.3-1.6-.6-2.5-2.2-2.1z" /></>),
  "1497": (<path fillRule="evenodd" d="M6 21c0-4.4.7-7.4 2.8-9.6L7.6 5.5l2.9 2.2c.9-.4 1.9-.6 3-.6 3.9 0 6.5 2.6 6.5 6.3 0 .7-.4 1.1-1 1.2l-2.3.4-1.1-1-1.6.8-1.4-.5-.6 6.7zM15 9.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z" />),
  "1498": (<><circle cx="12" cy="7" r="3.6" /><path d="M5 18.4c0-4.1 3-6.6 7-6.6s7 2.5 7 6.6z" /><rect x="8" y="18.9" width="8" height="2.6" rx=".6" /></>),
  "1500": (<><path d="M7.2 19.5V9.5h1.3v10zM11.4 19.5V6.8h1.3v12.7zM15.6 19.5V9.5h1.3v10z" /><rect x="6.4" y="4.6" width="2.9" height="6" rx="1.45" /><rect x="10.6" y="2" width="2.9" height="6" rx="1.45" /><rect x="14.8" y="4.6" width="2.9" height="6" rx="1.45" /><path d="M3 21.2c2-1.3 3.6-1.3 5.6 0s3.6 1.3 5.6 0 3.6-1.3 5.6 0l.7 1.1c-2.4 1.6-4.4 1.6-6.9 0-1.6-1-2.6-1-4.2 0-2.5 1.6-4.5 1.6-6.9 0z" /></>),
  "1501": (<><path d="M3 12.5h12.5l2.8-1.8H21v2.5l-3.7 2v1.6h1.5v2.7H7.4v-2.7h1.8v-1.6L3 14.2z" /><path d="m11.2 2.6 1.8-1.8 4.6 4.6-1.8 1.8z" /><path d="m13.5 5 1.2 1.2-5.3 5.3-1.2-1.2z" /></>),
  "1503": (<><path d="M8.6 3.4h6.8l-1.3 3.2H9.9z" /><path fillRule="evenodd" d="M9.5 7.6h5c3 1.9 5 5.6 5 9 0 3.1-3.3 4.4-7.5 4.4S4.5 19.7 4.5 16.6c0-3.4 2-7.1 5-9zM12 12.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z" /></>),
  "1502": (<><path d="M12 22V12.4h1.2V22z" /><path d="M12.6 2c1.6 1 2.2 2.2 1.8 3.5 1.6.1 2.7 1.1 2.4 2.5 1.4.5 2 1.7 1.3 3-.8 1.6-2.7 2-4.5 1.6l-1 1.1-1-1.1c-1.8.4-3.7 0-4.5-1.6-.7-1.3-.1-2.5 1.3-3-.3-1.4.8-2.4 2.4-2.5-.4-1.3.2-2.5 1.8-3.5z" /></>),
  "1504": (<><path d="M5.2 9.5c0 6.6 3 10.3 6.8 10.3s6.8-3.7 6.8-10.3h-2.2c0 5.3-2.1 8.1-4.6 8.1S7.4 14.8 7.4 9.5z" /><circle cx="6.3" cy="8" r="2.7" /><circle cx="17.7" cy="8" r="2.7" /></>),
};

export const RegionGlyph = ({ region, size = 14 }: { region: string; size?: number }) => svg(REGION[region] ?? null, size, "region");

/** Acepta el id del nivel ("p1499") o el guid (1499). */
export function WorkerGlyph({ level, size = 16 }: { level: string | number; size?: number }) {
  const key = String(level).replace(/^p/, "");
  return WORKER[key] ? svg(WORKER[key], size, "worker") : null;
}
