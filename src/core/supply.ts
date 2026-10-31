/**
 * De dónde viene cada producto de una isla.
 *
 * En el estado se guarda lo más simple posible (y compatible con versiones anteriores):
 *  - sin entrada            → se produce aquí
 *  - "idIsla"               → todo llega de esa isla
 *  - { idIsla: partes, … }  → se reparte entre varias islas por partes (1–9);
 *                             la propia isla puede tener partes (lo que se produce aquí).
 */
export type SupplyValue = string | Record<string, number>;
export type Supplies = Record<string, SupplyValue>;
export type Sources = Record<string, number>;

export const MAX_PARTS = 9;
const EPS = 1e-9;

/** Fuentes de un producto como islaId → partes (la propia isla incluida si produce una parte). */
export function sourcesOf(self: string, supplies: Supplies, product: string): Sources {
  const v = supplies[product];
  if (!v) return { [self]: 1 };
  if (typeof v === "string") return { [v]: 1 };
  const out: Sources = {};
  for (const [id, n] of Object.entries(v)) if (n > 0) out[id] = n;
  return Object.keys(out).length ? out : { [self]: 1 };
}

/** Forma canónica para guardar: null = se produce aquí; texto si hay una sola isla de origen. */
export function normalizeSources(self: string, sources: Sources, valid: (id: string) => boolean = () => true): SupplyValue | null {
  const clean: Sources = {};
  for (const [id, n] of Object.entries(sources)) {
    const parts = Math.max(0, Math.min(MAX_PARTS, Math.round(n)));
    if (parts > 0 && (id === self || valid(id))) clean[id] = parts;
  }
  const others = Object.keys(clean).filter((id) => id !== self);
  if (!others.length) return null;
  if (others.length === 1 && !(self in clean)) return others[0];
  return clean;
}

/** Parte que llega de fuera (0–1) para cada producto con origen en otra isla. */
export function externalShares(self: string, supplies: Supplies): Record<string, number> {
  const out: Record<string, number> = {};
  for (const product of Object.keys(supplies)) {
    const s = sourcesOf(self, supplies, product);
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const ext = total - (s[self] ?? 0);
    if (total > 0 && ext > 0) out[product] = ext / total;
  }
  return out;
}

/** Reparto de lo que llega de fuera entre las islas de origen (las fracciones suman 1). */
export function splitExternal(self: string, supplies: Supplies, product: string): { from: string; share: number }[] {
  const s = sourcesOf(self, supplies, product);
  const others = Object.entries(s).filter(([id]) => id !== self);
  const total = others.reduce((a, [, n]) => a + n, 0);
  return total > EPS ? others.map(([from, n]) => ({ from, share: n / total })) : [];
}
