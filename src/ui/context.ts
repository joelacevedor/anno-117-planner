import { createContext, useContext } from "react";
import type { Lang } from "../data/catalog";
import type { Flow, IslandPlan, PopulationDemand } from "../core/plan";
import type { Island, State } from "../core/state";
import type { T } from "../i18n";

export type Screen =
  | { tab: "chains" }
  | { tab: "chains"; chain: string }
  | { tab: "houses" }
  | { tab: "build" }
  | { tab: "islands" };

export type Ctx = {
  state: State;
  island: Island;
  plan: IslandPlan;
  imports: PopulationDemand["imports"];
  /** Flujos de comercio que tocan la isla actual. */
  inbound: Flow[];
  outbound: Flow[];
  setSupply: (productId: string, from: string | null) => void;
  /** Detalle de mejoras por edificio en la isla actual. */
  boosts: Record<string, import("../core/boosts").BoostDetail>;
  setProductivity: (buildingId: string, pct: number) => void;
  mods: import("../core/plan").Mods;
  setProducer: (productId: string, buildingId: string | null) => void;
  sync: import("../sync/useSync").SyncApi;
  lang: Lang;
  t: T;
  setState: (next: State) => void;
  editIsland: (patch: Partial<Island>) => void;
  setGoal: (chainId: string, n: number) => void;
  setBuilt: (buildingId: string, n: number) => void;
  go: (s: Screen) => void;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppCtx missing");
  return c;
};
