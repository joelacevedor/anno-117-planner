import { useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { chainById, consumptionLevels } from "../data/catalog";
import { worldPlan } from "../core/plan";
import { routeGaps } from "../core/routes";
import { modsFor } from "../core/boosts";
import { loadState, saveState, type Island, type State } from "../core/state";
import { translator } from "../i18n";
import { AppCtx, type Ctx, type Screen } from "./context";
import { ChainsScreen } from "./ChainsScreen";
import { ChainScreen } from "./ChainScreen";
import { BuildScreen } from "./BuildScreen";
import { IslandsScreen } from "./IslandsScreen";
import { HousesScreen } from "./HousesScreen";
import { RoutesScreen } from "./RoutesScreen";
import { useSync } from "../sync/useSync";

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

const TabIcon = ({ tab }: { tab: Screen["tab"] }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tab === "chains" && (<><rect x="3" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="3" width="7" height="6" rx="1.5" /><rect x="8.5" y="15" width="7" height="6" rx="1.5" /><path d="M6.5 9v2.5c0 1 .8 1.5 1.8 1.5H12m5.5-4v2.5c0 1-.8 1.5-1.8 1.5H12m0 0v2" /></>)}
    {tab === "houses" && (<><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>)}
    {tab === "build" && (<><path d="M14.5 6.5 18 3l3 3-3.5 3.5" /><path d="m15.5 8.5-11 11a1.4 1.4 0 0 0 2 2l11-11" /><path d="M3 9l4-4 3 3-4 4z" /></>)}
    {tab === "routes" && (<><path d="M3 21h18l-2.5-4h-13z" /><path d="M12 17V3l6 10h-6" /><path d="M12 6l-5 7h5" /></>)}
    {tab === "islands" && (<><path d="M3 18c3-1.5 5-1.5 9 0s6 1.5 9 0" /><path d="M6 15c1-4 3-7 6-7s5 3 6 7" /><path d="M12 8V3l4 2-4 2" /></>)}
  </svg>
);

export function App() {
  const [state, setStateRaw] = useState<State>(() => loadState());
  const [screen, setScreen] = useState<Screen>(() => {
    const s = loadState();
    const isl = s.islands.find((i) => i.id === s.current)!;
    return Object.values(isl.goals).some((n) => n > 0) || Object.values(isl.houses ?? {}).some((n) => n > 0) ? { tab: "build" } : { tab: "chains" };
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  const sync = useSync(state, setStateRaw);
  const island = state.islands.find((i) => i.id === state.current) ?? state.islands[0];
  const factor = consumptionLevels.find((c) => c.id === state.consumption)?.factor ?? 1;
  const modsByIsland = useMemo(
    () => Object.fromEntries(state.islands.map((i) => [i.id, modsFor(i.region, { techs: state.techs, patron: i.patron, events: i.events, manual: i.productivity, producers: i.producers })])),
    [state.islands, state.techs],
  );
  const world = useMemo(
    () => worldPlan(state.islands.map((i) => ({ ...i, mods: modsByIsland[i.id] })), factor),
    [state.islands, factor, modsByIsland],
  );
  const plan = world.plans[island.id];
  const inbound = world.flows.filter((f) => f.to === island.id);
  const outbound = world.flows.filter((f) => f.from === island.id);
  const t = useMemo(() => translator(state.lang), [state.lang]);

  useEffect(() => {
    setSaveFailed(!saveState(state));
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.motion = state.motion;
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  // Si cambias a una isla de otra región, una cadena abierta deja de aplicar.
  useEffect(() => {
    if ("chain" in screen && chainById[screen.chain]?.region !== island.region) setScreen({ tab: "chains" });
  }, [island.region, screen]);

  const setState = (next: State) => setStateRaw(next);
  const editIsland = (patch: Partial<Island>) =>
    setStateRaw((s) => ({ ...s, islands: s.islands.map((i) => (i.id === s.current ? { ...i, ...patch } : i)) }));

  const ctx: Ctx = {
    state, island, plan, world, imports: world.imports[island.id] ?? [], inbound, outbound, sync, t, lang: state.lang, setState, editIsland,
    setGoal: (id, n) => editIsland({ goals: { ...island.goals, [id]: clamp(n, 99) } }),
    setBuilt: (id, n) => editIsland({ built: { ...island.built, [id]: clamp(n, 999) } }),
    boosts: modsByIsland[island.id]?.detail ?? {},
    mods: modsByIsland[island.id],
    setProducer: (product, building) => {
      const producers = { ...island.producers };
      if (building) producers[product] = building; else delete producers[product];
      editIsland({ producers });
    },
    setProductivity: (id, pct) => {
      const productivity = { ...island.productivity, [id]: Math.max(-90, Math.min(500, Math.round(pct))) };
      if (!productivity[id]) delete productivity[id];
      editIsland({ productivity });
    },
    setSupply: (product, from) => {
      const supplies = { ...island.supplies };
      if (from) supplies[product] = from; else delete supplies[product];
      editIsland({ supplies });
    },
    go: setScreen,
  };

  const gapCount = useMemo(() => routeGaps(world).length, [world]);
  const missing = plan.toBuild.reduce((s, x) => s + x.count, 0);
  const screenKey = "chain" in screen ? `chain-${screen.chain}` : screen.tab;
  const inChain = "chain" in screen;

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app${inChain ? " with-order" : ""}`}>
        <header className="topbar">
          <span className="brand" aria-hidden="true">ANNO&nbsp;117</span>
          {state.session && (
            <button type="button" className={`sync-dot ${sync.status}`} onClick={() => setScreen({ tab: "islands" })}
              aria-label={t("syncStatus", { s: t(sync.status === "live" ? "syncLive" : sync.status === "offline" ? "syncOffline" : sync.status === "error" ? "syncError" : "syncConnecting") })}>
              <span aria-hidden="true" />{Object.keys(sync.players).length || ""}
            </button>
          )}
          <button type="button" className="island-pill" onClick={() => sheet.current?.showModal()} aria-label={`${t("switchIsland")}: ${island.name}`}>
            <span className="region-chip">{island.region}</span>
            <span className="pill-name">{island.name}</span>
            <span aria-hidden="true" className="caret">▾</span>
          </button>
        </header>

        {needRefresh && (
          <div className="banner">
            {t("update")} <button type="button" className="link" onClick={() => updateServiceWorker(true)}>{t("reload")}</button>
          </div>
        )}
        {saveFailed && <div className="banner warn">{t("notSaved")}</div>}

        <main className="screen" key={screenKey}>
          {screen.tab === "chains" && ("chain" in screen ? <ChainScreen chainId={screen.chain} /> : <ChainsScreen />)}
          {screen.tab === "houses" && <HousesScreen />}
          {screen.tab === "build" && <BuildScreen />}
          {screen.tab === "routes" && <RoutesScreen />}
          {screen.tab === "islands" && <IslandsScreen />}
        </main>

        <nav className="tabbar" aria-label="Main">
          {(["chains", "houses", "build", "routes", "islands"] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              aria-current={screen.tab === tab ? "page" : undefined}
              onClick={() => setScreen({ tab } as Screen)}
            >
              <span className="tab-icon">
                <TabIcon tab={tab} />
                {tab === "build" && missing > 0 && <span className="tab-badge" key={missing}>{missing}</span>}
                {tab === "routes" && gapCount > 0 && <span className="tab-badge" key={"r" + gapCount}>{gapCount}</span>}
              </span>
              {t(tab === "chains" ? "tabChains" : tab === "houses" ? "tabHouses" : tab === "build" ? "tabBuild" : tab === "routes" ? "tabRoutes" : "tabIslands")}
            </button>
          ))}
        </nav>

        <dialog ref={sheet} className="sheet" onClick={(e) => e.target === sheet.current && sheet.current.close()} aria-label={t("switchIsland")}>
          <div className="sheet-in">
            <h2>{t("switchIsland")}</h2>
            {state.islands.map((i) => (
              <button
                type="button"
                key={i.id}
                className="sheet-row"
                aria-pressed={i.id === state.current}
                onClick={() => { setState({ ...state, current: i.id }); sheet.current?.close(); }}
              >
                <span className="region-chip">{i.region}</span>
                <span>{i.name}{i.owner && <small className="owner"> · {i.owner}</small>}</span>
                {i.id === state.current && <span className="check" aria-hidden="true">✓</span>}
              </button>
            ))}
            <button type="button" className="link manage" onClick={() => { sheet.current?.close(); setScreen({ tab: "islands" }); }}>
              {t("manageIslands")}
            </button>
          </div>
        </dialog>
      </div>
    </AppCtx.Provider>
  );
}
