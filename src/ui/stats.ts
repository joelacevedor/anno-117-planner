/**
 * Cifras de resumen compartidas por los paneles (Isla, Región, Imperio y el plan de crecimiento).
 * Población: si se copió el número del juego (popReal) se usa ese; si no, la estimación por casas.
 * Nunca se mezclan sin decirlo: `estimated` indica si alguna parte es estimada.
 */
import { dlcNeedsOff, hasDlc, levelById, levels, type Region } from "../data/catalog";
import { residentsOf } from "../core/population";
import type { Island } from "../core/state";

export function levelResidents(i: Island, levelId: string, dlcOff: string[]) {
  const houses = i.houses[levelId] ?? 0;
  const real = houses > 0 && (i.popReal?.[levelId] ?? 0) > 0;
  const n = real ? Math.round((i.popReal[levelId] / 1000) * houses) : residentsOf(levelById[levelId], houses, [...i.needsOff, ...dlcOff]);
  return { n, real };
}

export type PopSummary = { residents: number; houses: number; estimated: boolean; real: number };

export function islandPop(i: Island, dlcs: string[]): PopSummary {
  const dlcOff = dlcNeedsOff(dlcs);
  let residents = 0, houses = 0, real = 0, estimated = false;
  for (const l of levels) {
    if (l.region !== i.region || !hasDlc(l, dlcs)) continue;
    const h = i.houses[l.id] ?? 0;
    if (!(h > 0)) continue;
    const r = levelResidents(i, l.id, dlcOff);
    residents += r.n; houses += h;
    if (r.real) real += r.n; else estimated = true;
  }
  return { residents, houses, estimated, real };
}

export function sumPop(list: Island[], dlcs: string[]): PopSummary {
  return list.map((i) => islandPop(i, dlcs)).reduce(
    (a, b) => ({ residents: a.residents + b.residents, houses: a.houses + b.houses, estimated: a.estimated || b.estimated, real: a.real + b.real }),
    { residents: 0, houses: 0, estimated: false, real: 0 },
  );
}

/** La capital: la isla llamada Roma (Rome). No hay otro dato en la partida que la marque. */
export const capitalOf = (islands: Island[]) => islands.find((i) => /^(roma|rome)$/i.test(i.name.trim()));

export const regionIslands = (islands: Island[], r: Region) => islands.filter((i) => i.region === r);
