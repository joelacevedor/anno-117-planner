/**
 * Mejoras activas → multiplicadores por edificio.
 * Productividad del juego: (100 + base %) × (100 + productividad %) / 10000.
 * El combustible dura más con los fuelles: duración × (1 + %/100).
 */
import { buildings, events, patronById, techs, type Region } from "../data/catalog";
import type { Counts, Mods } from "./plan";

export type BoostSettings = {
  techs: string[];
  patron: { id: string; scaling: number } | null;
  events: string[];
  /** % extra a mano por edificio (especialistas, objetos, módulos…). */
  manual: Counts;
  /** producto → edificio alternativo elegido */
  producers?: Record<string, string>;
};

export type BoostDetail = { prod: number; base: number; fuel: number; manual: number };

export function modsFor(region: Region, s: BoostSettings): Mods & { detail: Record<string, BoostDetail> } {
  const detail: Record<string, BoostDetail> = {};
  const add = (targets: string[], prod: number, base: number, fuel: number) => {
    for (const id of targets) {
      if (buildings[id]?.region !== region) continue;
      const d = (detail[id] ??= { prod: 0, base: 0, fuel: 0, manual: 0 });
      d.prod += prod; d.base += base; d.fuel += fuel;
    }
  };
  for (const t of techs) if (s.techs.includes(t.id)) add(t.targets, t.prod, t.base, t.fuel);
  for (const e of events) if (s.events.includes(e.id)) add(e.targets, e.prod, e.base, e.fuel);
  const patron = s.patron && patronById[s.patron.id];
  if (patron && s.patron!.scaling > 0)
    for (const e of patron.effects) add(e.targets, e.prod * s.patron!.scaling, e.base * s.patron!.scaling, e.fuel * s.patron!.scaling);
  for (const [id, pct] of Object.entries(s.manual)) {
    if (buildings[id]?.region !== region || !pct) continue;
    (detail[id] ??= { prod: 0, base: 0, fuel: 0, manual: 0 }).manual += pct;
  }
  const boost: Counts = {};
  const fuel: Counts = {};
  for (const [id, d] of Object.entries(detail)) {
    const b = ((100 + d.base) * (100 + d.prod + d.manual)) / 10000;
    if (Math.abs(b - 1) > 1e-9) boost[id] = Math.max(0.1, b);
    if (d.fuel) fuel[id] = 1 + d.fuel / 100;
  }
  return { boost, fuel, detail, provider: s.producers ?? {} };
}

/** Productividad total en % (100 = sin mejoras). */
export const totalPct = (d?: BoostDetail) =>
  d ? Math.round(((100 + d.base) * (100 + d.prod + d.manual)) / 100) : 100;
