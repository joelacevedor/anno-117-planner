import { createContext, useContext } from "react";
import type { Lang } from "../data/catalog";
import type { Flow, IslandPlan, PopulationDemand, WorldPlan } from "../core/plan";
import type { Island, State } from "../core/state";
import type { T } from "../i18n";

export type IslandView = "island" | "region" | "empire";

export type Screen =
  | { tab: "chains" }
  /** `building`: edificio a mostrar en la pestaña Edificios; `from`: de dónde se vino (para «Atrás»). */
  | { tab: "chains"; chain: string; building?: string; from?: "build" }
  /** Catálogo de todas las cadenas de la región (para añadir una nueva). */
  | { tab: "chains"; catalog: true }
  | { tab: "houses" }
  | { tab: "build" }
  | { tab: "routes"; intent?: RouteIntent; focus?: string }
  | { tab: "settings" }
  | { tab: "islands" }
  /** Mejoras de la isla: dios patrón, devoción, festivales y eventos. */
  | { tab: "islands"; boosts: true }
  | { tab: "manage" };

/** Recomendación de Imperio abierta en Rutas: se muestra como ruta propuesta hasta confirmarla. */
export type RouteIntent = { from: string; to: string; product: string; rate: number };

export type Ctx = {
  /** Economía por isla y producto, y recomendaciones del imperio (core/economy.ts). */
  econ: import("../core/economy").IslandProduct[];
  empire: import("../core/economy").Empire;
  /** Islas tal como entran en el plan del imperio, y nivel de consumo (para simular planes de crecimiento). */
  worldIslands: import("../core/plan").WorldIsland[];
  factor: number;
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
  /** Mismo ajuste manual para varios edificios (control por cadena). */
  setProductivityMany: (buildingIds: string[], pct: number) => void;
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
  /** Objetivo en t/min (quita el de edificios de esa cadena). */
  setTarget: (chainId: string, tpm: number) => void;
  /** Aceptar (o no) el déficit de una cadena. */
  setAccepted: (chainId: string, on: boolean) => void;
  setBuilt: (buildingId: string, n: number) => void;
  /** Registra varios edificios a la vez (un solo cambio). */
  setBuiltMany: (counts: Record<string, number>) => void;
  /** Cifras de cada cadena de la isla actual en t/min (core/chainRates.ts). */
  rates: import("../core/chainRates").ChainRate[];
  go: (s: Screen) => void;
  /** Vista de la pestaña Isla (isla, región o imperio); el menú lateral de escritorio la abre directamente. */
  islandView: IslandView;
  setIslandView: (v: IslandView) => void;
  /** Pantalla ancha (escritorio): distribuciones en columnas. */
  wide: boolean;
  /** Vuelve a la pantalla anterior (lo mismo que deslizar a la derecha en una cadena o en ajustes). */
  back: () => void;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppCtx missing");
  return c;
};
