import type { ReactNode } from "react";
import type { Glyph as G } from "../data/catalog";

/** Glifos propios por tipo de edificio (sin iconos del juego). */
const paths: Record<G, ReactNode> = {
  field: (<><path d="M4 27h24" /><path d="M9 27V12M16 27V8M23 27V12" /><path d="M9 14c-2.5 0-3.5-2-3.5-4 2.5 0 3.5 2 3.5 4Zm0 0c2.5 0 3.5-2 3.5-4-2.5 0-3.5 2-3.5 4ZM16 10c-2.5 0-3.5-2-3.5-4 2.5 0 3.5 2 3.5 4Zm0 0c2.5 0 3.5-2 3.5-4-2.5 0-3.5 2-3.5 4ZM23 14c-2.5 0-3.5-2-3.5-4 2.5 0 3.5 2 3.5 4Zm0 0c2.5 0 3.5-2 3.5-4-2.5 0-3.5 2-3.5 4Z" /></>),
  animal: (<><path d="M6 18c0-4 4-6 9-6h5c4 0 6 2 6 5v2" /><path d="M26 17c1-1 3-1 3 1s-1 2-2 2" /><path d="M8 18v8M13 19v7M20 19v7M24 19v7" /><path d="M6 18c-1.5 0-2.5-1-2.5-2.5" /></>),
  flower: (<><path d="M16 28V16" /><circle cx="16" cy="11" r="3" /><path d="M16 8c0-3 3-4 3-4M16 8c0-3-3-4-3-4M13 11c-3 0-4-3-4-3M19 11c3 0 4-3 4-3" /><path d="M16 22c-3 0-5-2-5-4 3 0 5 2 5 4Zm0 0c3 0 5-2 5-4-3 0-5 2-5 4Z" /></>),
  fish: (<><path d="M4 16c4-6 12-7 18-2l5-4v12l-5-4c-6 5-14 4-18-2Z" /><circle cx="10" cy="15" r="1" /><path d="M5 27c3-2 5-2 8 0s5 2 8 0 5-2 7-1" /></>),
  tree: (<><path d="M16 29V19" /><path d="M16 4 8 14h4l-5 6h18l-5-6h4Z" /></>),
  mine: (<><path d="M3 27 12 10l5 7 4-5 8 15Z" /><path d="M20 4l4 4M24 4l-4 4" strokeWidth="1.6" /></>),
  clay: (<><path d="M3 20c3-2 5-2 8 0s5 2 8 0 5-2 8 0" /><path d="M6 27h20l-2-5H8Z" /><path d="M20 4l-4 12M16 16l-2-1 1-3" /></>),
  reeds: (<><path d="M9 29V11M16 29V5M23 29V13" /><path d="M9 11c-2-1-3-3-3-5 2 0 3 2 3 5ZM23 13c2-1 3-3 3-5-2 0-3 2-3 5ZM16 5c-1.5-1-2-2.5-2-4" /><path d="M4 29h24" /></>),
  flask: (<><path d="M12 4h8M13 4v8L6 25a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3l-7-13V4" /><path d="M9 20h14" /></>),
  anvil: (<><path d="M5 10h17c0 4 3 5 6 5v2c-4 0-7 1-8 4H11c0-3-3-4-6-5Z" /><path d="M12 21v4M19 21v4M8 27h16" /></>),
  mill: (<><path d="M12 28l2-14h4l2 14Z" /><path d="M16 14 8 6M16 14l8-8M16 14l-8 8M16 14l8 8" strokeWidth="1.6" /></>),
  hammer: (<><path d="M14 10 6 18l3 3 8-8" /><path d="M13 5l7-1 7 7-1 7-4-4-3 3-5-5 3-3Z" /><path d="M5 28h22" /></>),
  brick: (<><rect x="4" y="18" width="11" height="7" rx="1.5" /><rect x="17" y="18" width="11" height="7" rx="1.5" /><rect x="10.5" y="10" width="11" height="7" rx="1.5" /><path d="M3 29h26" /></>),
  shield: (<><path d="M16 4 6 8v7c0 7 4 11 10 13 6-2 10-6 10-13V8Z" /><path d="M16 9v14M11 15h10" /></>),
  bowl: (<><path d="M4 15h24c0 7-5 11-12 11S4 22 4 15Z" /><path d="M11 11c0-2 2-2 2-4M16 11c0-2 2-2 2-4M21 11c0-2 2-2 2-4" /></>),
  tunic: (<><path d="M11 4 4 9l3 5 3-2v16h12V12l3 2 3-5-7-5c0 2-2 4-5 4s-5-2-5-4Z" /></>),
  amphora: (<><path d="M13 4h6M14 4v4c-5 2-7 7-7 12 0 4 4 8 9 8s9-4 9-8c0-5-2-10-7-12V4" /><path d="M14 9c-3 0-5-1-5-3M18 9c3 0 5-1 5-3" /></>),
  lyre: (<><path d="M9 6c-3 4-3 12 1 16h12c4-4 4-12 1-16" /><path d="M8 9h16M10 22v5h12v-5" /><path d="M13 9v13M16 9v13M19 9v13" strokeWidth="1.3" /></>),
  fire: (<><path d="M4 27c2-5 6-8 12-8s10 3 12 8Z" /><path d="M16 16c-3-2-3-5 0-9 1 2 4 3 4 6a4 4 0 0 1-4 3Z" /></>),
  ship: (<><path d="M4 21h24l-3 6H7Z" /><path d="M16 4v17M16 6l8 12h-8M16 9l-6 9h6" /></>),
  house: (<><path d="M4 15 16 5l12 10" /><path d="M7 13v15h18V13" /><path d="M13 28v-7h6v7" /></>),
};

export function Glyph({ name, size = 34 }: { name: G; size?: number }) {
  return (
    <svg className="glyph" viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
