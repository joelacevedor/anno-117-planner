/**
 * Temporadas del Nilo (Dawn of the Delta). Afectan a los edificios de ribera (Building.nile).
 *
 * Reglas confirmadas en el juego (7-11-2026):
 *  - Ajet (crecida): producen al 25 % de su producción.
 *  - Shemu (río bajo): 1 tonelada adicional por ciclo, sea cual sea la producción base.
 * Ubisoft indica que cada temporada dura unas 2 horas de juego: la media pondera las dos por igual.
 *
 * Supuesto pendiente de confirmar: el 25 % y la tonelada extra se combinan con las demás mejoras
 * multiplicando (los ciclos por minuto ya incluyen la productividad de dioses, investigación, etc.).
 */
export type NileSeason = "media" | "shemu" | "ajet";
export const NILE_SEASONS: NileSeason[] = ["media", "shemu", "ajet"];
export const AJET_RATE = 0.25;
export const SHEMU_EXTRA = 1;
/** Peso de cada temporada en la media (duraciones iguales, ~2 h cada una). */
export const SEASON_WEIGHT = { shemu: 0.5, ajet: 0.5 } as const;

/** Toneladas por ciclo de un edificio de ribera en cada temporada (out = producción base por ciclo). */
export function perCycle(season: NileSeason, out: number): number {
  const shemu = out + SHEMU_EXTRA;
  const ajet = out * AJET_RATE;
  if (season === "shemu") return shemu;
  if (season === "ajet") return ajet;
  return SEASON_WEIGHT.shemu * shemu + SEASON_WEIGHT.ajet * ajet;
}

/** Multiplicador sobre la producción normal del edificio. */
export const nileFactor = (season: NileSeason, out: number) => perCycle(season, out) / out;
