import { createContext, useContext } from "react";
import type { Lang } from "../data/catalog";
import type { Flow, IslandPlan, PopulationDemand, WorldPlan } from "../core/plan";
import type { Island, State } from "../core/state";
import type { T } from "../i18n";

export type Screen =
  | { tab: "chains" }
  | { tab: "chains"; chain: string }
  | { tab: "houses" }
  | { tab: "build" }
  | { tab: "routes"; intent?: RouteIntent; focus?: string }
  | { tab: "settings" }
  | { tab: "islands" }
  | { tab: "manage" };

/** Recomendación de Imperio abierta en Rutas: se muestra como ruta propuesta hasta confirmarla. */
export type RouteIntent = { from: string; to: string; product: string; rate: number };

export type Ctx = {
  /** Economía por isla y producto, y recomendaciones del imperio (core/economy.ts). */
  econ: import("../core/economy").IslandProduct[];
  empire: import("../core/economy").Empire;
  /** Cambia el origen de un producto en cualquier isla (confirmar una recomendación). */
  setSupplyFor: (islandId: string, productId: string, sources: Record<string, number> | null) => void;
  /** Lo que ve la interfaz: solo islas de regiones que esta versión conoce. */
  state: State;
  /** Todo lo guardado, también las islas ocultas (para copias de seguridad). */
  rawState: State;
  /** Islas ocultas por ser de una región que esta versión no conoce. */
  hiddenCount: number;
  island: Island;
  plan: IslandPlan;
  /** Plan de todas las islas, con los flujos de comercio. */
  world: WorldPlan;
  imports: PopulationDemand["imports"];
  /** Flujos de comercio que tocan la isla actual. */
  inbound: Flow[];
  outbound: Flow[];
  /** Origen de un producto: islaId → partes (la propia isla = se produce aquí); null = todo aquí. */
  setSupply: (productId: string, sources: Record<string, number> | null) => void;
  /** Detalle de mejoras por edificio en la isla actual. */
  boosts: Record<string, import("../core/boosts").BoostDetail>;
  setProductivity: (buildingId: string, pct: number) => void;
  mods: import("../core/plan").Mods;
  /** Mejoras de cada isla (para calcular edificios en las islas de origen). */
  modsByIsland: Record<string, import("../core/plan").Mods>;
  setProducer: (productId: string, buildingId: string | null) => void;
  sync: import("../sync/useSync").SyncApi;
  lang: Lang;
  t: T;
  /** Cambia lo que ve la interfaz; las islas ocultas se conservan en su sitio. */
  setState: (next: State) => void;
  /** Sustituye todo (importar o restaurar una copia completa). */
  replaceState: (next: State) => void;
  editIsland: (patch: Partial<Island>) => void;
  setGoal: (chainId: string, n: number) => void;
  setBuilt: (buildingId: string, n: number) => void;
  go: (s: Screen) => void;
  /** Vuelve a la pantalla anterior (lo mismo que deslizar a la derecha en una cadena o en ajustes). */
  back: () => void;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppCtx missing");
  return c;
};
