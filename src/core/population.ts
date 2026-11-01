import type { Level } from "../data/catalog";

/** Clave en needsOff de un servicio (los bienes usan "nivel:producto"). */
export const serviceKey = (level: string, service: string) => `${level}:s${service}`;

/**
 * Residentes aproximados de un nivel: casas × residentes por casa, quitando lo que aportan
 * las necesidades desmarcadas. Sin mejoras, objetos ni efectos del juego.
 */
export function residentsOf(level: Level, houses: number, needsOff: string[]) {
  if (!houses) return 0;
  const off = new Set(needsOff);
  let per = level.residents;
  for (const n of level.needs) if (off.has(`${level.id}:${n.product}`)) per -= n.pop;
  for (const sv of level.services) if (off.has(serviceKey(level.id, sv.id))) per -= sv.pop;
  return houses * Math.max(0, per);
}

export const workforceOf = (level: Level, residents: number) => Math.floor(residents * level.workforce);
