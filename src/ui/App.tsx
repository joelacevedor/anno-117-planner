import { Icon, type IconName } from "./Icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { chainById, chains, consumptionLevels, dlcNeedsOff, isKnownRegion } from "../data/catalog";
import { worldPlan } from "../core/plan";
import { empireEconomy, islandEconomy } from "../core/economy";
import { routeGaps } from "../core/routes";
import { chainRates, isShort } from "../core/chainRates";
import { normalizeSources } from "../core/supply";
import { islandBoosts, modsFor } from "../core/boosts";
import { autoBackup, hiddenIslands, loadState, saveState, withHidden, type Island, type State } from "../core/state";
import { translator } from "../i18n";
import { AppCtx, type Ctx, type IslandView, type Screen } from "./context";
import { CatalogScreen, ChainsScreen } from "./ChainsScreen";
import { ChainScreen } from "./ChainScreen";
import { BuildScreen } from "./BuildScreen";
import { BoostsScreen, IslandsScreen, ManageIslandsScreen, byRegion } from "./IslandsScreen";
import { SettingsScreen } from "./SettingsScreen";
import { RegionChip } from "./parts";
import { useSheetDrag, useSwipeNav } from "./gestures";
import { Chat } from "./Chat";
import { HousesScreen } from "./HousesScreen";
import { RoutesScreen } from "./RoutesScreen";
import { useMedia } from "./media";
import { syncLabel, useSync } from "../sync/useSync";
import { previewBuild } from "../sync/config";

const TABS = ["chains", "houses", "build", "routes", "islands"] as const;
type TabId = (typeof TABS)[number];
/** Pantallas que se abren "encima" de una pestaña. */
const isChild = (s: Screen) => "chain" in s || "catalog" in s || "boosts" in s || s.tab === "settings" || s.tab === "manage";

/** Vista elegida en la pestaña Isla (se recuerda en este dispositivo). */
const VIEW_KEY = "anno117-island-view";
const readView = (): IslandView => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === "region" || v === "empire" ? v : "island"; } catch { return "island"; }
};
const SIDE_KEY = "anno117-side-collapsed";
const WIDE = "(min-width: 1024px)";
/** Pantalla ancha: menú lateral y paneles en columnas. */
export function useWide() {
  return useMedia(WIDE);
}

/** Entradas del menú lateral (escritorio): Imperio y Región son vistas de la pestaña Isla. */
type SideItem = { id: string; tab: TabId; view?: IslandView };
const SIDE: SideItem[] = [
  { id: "empire", tab: "islands", view: "empire" },
  { id: "region", tab: "islands", view: "region" },
  { id: "chains", tab: "chains" },
  { id: "houses", tab: "houses" },
  { id: "build", tab: "build" },
  { id: "routes", tab: "routes" },
  { id: "island", tab: "islands", view: "island" },
];
const SideIcon = ({ id }: { id: string }) => <Icon name={id as IconName} size={22} className="nav-ico" />;

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

const TAB_ICON: Partial<Record<Screen["tab"], IconName>> = { chains: "chains", houses: "houses", build: "build", routes: "routes", islands: "island" };
const TabIcon = ({ tab }: { tab: Screen["tab"] }) => <Icon name={TAB_ICON[tab] ?? "chains"} size={24} className="nav-ico" />;

export function App() {
  const [raw, setStateRaw] = useState<State>(() => loadState());
  // La interfaz solo ve las islas de regiones que esta versión conoce; las demás se conservan aparte.
  const hiddenCount = useMemo(() => hiddenIslands(raw).length, [raw]);
  const state = useMemo<State>(() => {
    if (!hiddenCount) return raw;
    const islands = raw.islands.filter((i) => isKnownRegion(i.region));
    if (!islands.length) return raw;
    return { ...raw, islands, current: islands.some((i) => i.id === raw.current) ? raw.current : islands[0].id };
  }, [raw, hiddenCount]);
  const onlyHidden = hiddenCount > 0 && hiddenCount === raw.islands.length;
  const [screen, setScreen] = useState<Screen>(() => {
    const s = loadState();
    const isl = s.islands.find((i) => i.id === s.current)!;
    return Object.values(isl.goals).some((n) => n > 0) || Object.values(isl.houses ?? {}).some((n) => n > 0) ? { tab: "build" } : { tab: "chains" };
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);
  const sheetIn = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const lastTab = useRef<TabId>("chains");
  const [islandQuery, setIslandQuery] = useState("");
  const wide = useWide();
  const [islandView, setIslandViewRaw] = useState<IslandView>(readView);
  const setIslandView = (v: IslandView) => { setIslandViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento */ } };
  // Sin preferencia guardada, el menú empieza contraído en ventanas estrechas (portátiles pequeños).
  const [collapsed, setCollapsedRaw] = useState(() => { try { const v = localStorage.getItem(SIDE_KEY); return v === null ? typeof innerWidth === "number" && innerWidth < 1200 : v === "1"; } catch { return false; } });
  const setCollapsed = (v: boolean) => { setCollapsedRaw(v); try { localStorage.setItem(SIDE_KEY, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  const sync = useSync(raw, setStateRaw);
  const island = state.islands.find((i) => i.id === state.current) ?? state.islands[0];
  const factor = consumptionLevels.find((c) => c.id === state.consumption)?.factor ?? 1;
  const modsByIsland = useMemo(
    () => Object.fromEntries(state.islands.filter((i) => isKnownRegion(i.region)).map((i) => [i.id, modsFor(i.region, islandBoosts(state, i))])),
    [state.islands, state.techs, state.techLevels, state.wonders, state.regionFx],
  );
  // Lo que entra en el plan del imperio (las necesidades de DLC que no tenéis cuentan como desactivadas).
  const worldIslands = useMemo(() => {
    const dlcOff = dlcNeedsOff(state.dlcs);
    return state.islands.filter((i) => isKnownRegion(i.region)).map((i) => ({ ...i, needsOff: dlcOff.length ? [...i.needsOff, ...dlcOff] : i.needsOff, mods: modsByIsland[i.id] }));
  }, [state.islands, modsByIsland, state.dlcs]);
  const circuits = state.ships.circuits;
  const world = useMemo(() => worldPlan(worldIslands, factor, { countBuilt: state.countBuilt, circuits }), [worldIslands, factor, state.countBuilt, circuits]);
  // El mismo plan sin objetivos a mano: lo que piden de verdad casas e islas. Sirve para separar en Obra y Cadenas
  // «necesarios» de «por tus objetivos».
  const needsWorld = useMemo(() => {
    const has = (c?: Record<string, number>) => Object.values(c ?? {}).some((n) => n > 0);
    if (!worldIslands.some((i) => has(i.goals) || has(i.targets))) return world;
    return worldPlan(worldIslands.map((i) => ({ ...i, goals: {}, targets: {} })), factor, { countBuilt: state.countBuilt, circuits });
  }, [worldIslands, factor, state.countBuilt, world, circuits]);
  const econIslands = useMemo(() => state.islands.filter((i) => isKnownRegion(i.region)).map((i) => ({ id: i.id, name: i.name, region: i.region, built: i.built, mods: modsByIsland[i.id] })), [state.islands, modsByIsland]);
  const econ = useMemo(() => islandEconomy(econIslands, world), [econIslands, world]);
  const empire = useMemo(() => empireEconomy(econIslands, world, econ, state.ships), [econIslands, world, econ, state.ships]);
  const plan = world.plans[island.id];
  const rates = useMemo(() => {
    const acc = new Set(island.accepted ?? []);
    return chainRates(plan, island.built, modsByIsland[island.id], chains.filter((c) => c.region === island.region), state.countBuilt)
      .map((r) => (r.state === "short" && acc.has(r.chainId) ? { ...r, accepted: true } : r));
  }, [plan, island.built, island.region, modsByIsland, island.id, state.countBuilt, island.accepted]);
  const inbound = world.flows.filter((f) => f.to === island.id);
  const outbound = world.flows.filter((f) => f.from === island.id);
  const t = useMemo(() => translator(state.lang), [state.lang]);

  useEffect(() => {
    setSaveFailed(!saveState(raw));
    autoBackup(raw);
    document.documentElement.lang = raw.lang;
    document.documentElement.dataset.motion = raw.motion;
  }, [raw]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (screen.tab !== "settings" && screen.tab !== "manage") lastTab.current = screen.tab;
  }, [screen]);

  // Historial del navegador: las pantallas "hijas" (una cadena, ajustes) se apilan,
  // así el botón/gesto de atrás del móvil vuelve a donde estabas.
  useEffect(() => {
    history.replaceState({ screen }, "");
    const onPop = (e: PopStateEvent) => setScreen((e.state?.screen as Screen | undefined) ?? { tab: "chains" });
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = useCallback((s: Screen) => {
    if (isChild(s)) history.pushState({ screen: s, child: true }, "");
    else history.replaceState({ screen: s }, "");
    setScreen(s);
  }, []);
  const back = useCallback(() => {
    if (history.state?.child) history.back();
    else setScreen((cur) => (cur.tab === "settings" || cur.tab === "manage" ? ({ tab: lastTab.current } as Screen) : { tab: "chains" }));
  }, []);

  // Si cambias a una isla de otra región, una cadena abierta deja de aplicar.
  useEffect(() => {
    if ("chain" in screen && chainById[screen.chain]?.region !== island.region) setScreen({ tab: "chains" });
  }, [island.region, screen]);

  const setState = (next: State) => setStateRaw((r) => withHidden(r, next));
  const replaceState = (next: State) => setStateRaw(next);
  const editIsland = (patch: Partial<Island>) =>
    setStateRaw((s) => ({ ...s, islands: s.islands.map((i) => (i.id === state.current ? { ...i, ...patch } : i)) }));

  const ctx: Ctx = {
    econ, empire, worldIslands, factor,
    setSupplyFor: (islandId, product, sources) => setStateRaw((r) => ({
      ...r,
      islands: r.islands.map((i) => {
        if (i.id !== islandId) return i;
        const supplies = { ...i.supplies };
        const v = sources && normalizeSources(i.id, sources, (id) => r.islands.some((x) => x.id === id));
        if (v) supplies[product] = v; else delete supplies[product];
        return { ...i, supplies };
      }),
    })),
    state, rawState: raw, hiddenCount, island, plan, world, imports: world.imports[island.id] ?? [], inbound, outbound, sync, t, lang: state.lang, setState, replaceState, editIsland,
    // Fuente única: poner un objetivo en edificios quita el de t/min de esa cadena y al revés.
    setGoal: (id, n) => {
      const targets = { ...(island.targets ?? {}) };
      delete targets[id];
      editIsland({ goals: { ...island.goals, [id]: clamp(n, 99) }, targets });
    },
    setTarget: (id, tpm) => {
      const targets = { ...(island.targets ?? {}) };
      const v = Math.round(Math.max(0, Math.min(100000, tpm)) * 10) / 10;
      if (v > 0) targets[id] = v; else delete targets[id];
      const goals = { ...island.goals };
      delete goals[id];
      editIsland({ goals, targets });
    },
    setAccepted: (id, on) => {
      const rest = (island.accepted ?? []).filter((x) => x !== id);
      editIsland({ accepted: on ? [...rest, id] : rest });
    },
    setBuilt: (id, n) => editIsland({ built: { ...island.built, [id]: clamp(n, 999) } }),
    setBuiltMany: (counts) => editIsland({ built: { ...island.built, ...Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, clamp(n, 999)])) } }),
    rates,
    boosts: modsByIsland[island.id]?.detail ?? {},
    needsPlan: needsWorld.plans[island.id] ?? plan,
    mods: modsByIsland[island.id],
    modsByIsland,
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
    setProductivityMany: (ids, pct) => {
      const productivity = { ...island.productivity };
      for (const id of ids) {
        productivity[id] = Math.max(-90, Math.min(500, Math.round(pct)));
        if (!productivity[id]) delete productivity[id];
      }
      editIsland({ productivity });
    },
    setObservedProductivity: (id, pct) => {
      const prodObserved = { ...island.prodObserved };
      if (pct && pct > 0) prodObserved[id] = Math.max(1, Math.min(2000, Math.round(pct * 10) / 10)); else delete prodObserved[id];
      editIsland({ prodObserved });
    },
    setProdCalc: (id, calc) => {
      const prodCalc = { ...island.prodCalc };
      if (calc && calc.groups.length) prodCalc[id] = calc; else delete prodCalc[id];
      editIsland({ prodCalc });
    },
    setSupply: (product, sources) => {
      const supplies = { ...island.supplies };
      const v = sources && normalizeSources(island.id, sources, (id) => state.islands.some((i) => i.id === id));
      if (v) supplies[product] = v; else delete supplies[product];
      editIsland({ supplies });
    },
    go,
    back,
    islandView, setIslandView, wide,
  };

  const gapCount = useMemo(() => routeGaps(world).length, [world]);
  const tabIndex = TABS.indexOf(screen.tab as TabId);
  const child = isChild(screen);
  useSwipeNav(mainRef, {
    reduceMotion: state.motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches,
    onRight: child ? back : tabIndex > 0 ? () => go({ tab: TABS[tabIndex - 1] } as Screen) : undefined,
    onLeft: !child && tabIndex >= 0 && tabIndex < TABS.length - 1 ? () => go({ tab: TABS[tabIndex + 1] } as Screen) : undefined,
  });
  useSheetDrag(sheet, sheetIn);

  if (onlyHidden) {
    // Solo hay islas de regiones que esta versión no conoce: no se toca nada y se pide actualizar.
    return (
      <main className="screen only-hidden">
        <header className="screen-head"><h1>Praefectus</h1></header>
        <div className="card"><p>{t("onlyHiddenIslands", { n: hiddenCount })}</p></div>
      </main>
    );
  }

  const missing = plan.toBuild.reduce((s, x) => s + x.count, 0);
  // Escritorio: Cadenas es lista + detalle; sin cadena elegida se abre la primera (lo que más falta).
  const split = wide && screen.tab === "chains" && !("catalog" in screen);
  const firstChain = split && rates.length ? [...rates].sort((a, b) => (isShort(a) ? 0 : 1) - (isShort(b) ? 0 : 1) || a.coverage - b.coverage)[0].chainId : undefined;
  const openChain = "chain" in screen ? screen.chain : firstChain;
  const selectChain = (id: string) => { const s: Screen = { tab: "chains", chain: id }; history.replaceState({ screen: s, child: history.state?.child }, ""); setScreen(s); };
  const screenKey = split ? "chains-split" : "chain" in screen ? `chain-${screen.chain}` : "catalog" in screen ? "catalog" : "boosts" in screen ? "boosts" : screen.tab;
  const inChain = "chain" in screen || !!(split && openChain);

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app${inChain ? " with-order" : ""}${wide ? " wide" : ""}${wide && collapsed ? " side-collapsed" : ""}`} data-region={island.region.toLowerCase()}>
        {wide && (
          <aside className="sidebar" aria-label={t("mainMenu")}>
            <nav className="side-nav" aria-label="Main">
              {SIDE.map((s) => {
                const on = screen.tab === s.tab && (!s.view || islandView === s.view);
                const label = t(s.id === "empire" ? "viewEmpire" : s.id === "region" ? "viewRegion" : s.id === "island" ? "viewIsland" : s.id === "chains" ? "tabChains" : s.id === "houses" ? "tabHouses" : s.id === "build" ? "tabBuild" : "tabRoutes");
                return (
                  <button type="button" key={s.id} aria-current={on ? "page" : undefined} title={label}
                    onClick={() => { if (s.view) setIslandView(s.view); go({ tab: s.tab } as Screen); }}>
                    <span className="side-icon"><SideIcon id={s.id} /></span>
                    <span className="side-label">{label}</span>
                    {s.tab === "build" && missing > 0 && <span className="side-badge">{missing}</span>}
                    {s.tab === "routes" && gapCount > 0 && <span className="side-badge">{gapCount}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="side-foot">
              <button type="button" aria-current={screen.tab === "settings" ? "page" : undefined} title={t("settings")} onClick={() => go({ tab: "settings" })}>
                <span className="side-icon"><Icon name="settings" size={22} className="nav-ico" /></span>
                <span className="side-label">{t("settings")}</span>
              </button>
              <button type="button" className="side-toggle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} title={t(collapsed ? "sideExpand" : "sideCollapse")}>
                <span className="side-icon" aria-hidden="true"><Icon name="chev" size={18} className={collapsed ? "nav-ico" : "nav-ico flip"} /></span>
                <span className="side-label">{t(collapsed ? "sideExpand" : "sideCollapse")}</span>
              </button>
            </div>
          </aside>
        )}
        <header className="topbar">
          <button type="button" className="gear" aria-label={t("settings")} aria-pressed={screen.tab === "settings"}
            onClick={() => (screen.tab === "settings" ? back() : go({ tab: "settings" }))}>
            <Icon name="settings" size={22} className="nav-ico" />
          </button>
          <span className="brand" aria-hidden="true">PRAEFECTUS</span>
          {state.session && (
            <button type="button" className={`sync-dot ${sync.status}`} onClick={() => go({ tab: "settings" })}
              aria-label={t("syncStatus", { s: t(syncLabel(sync.status)) })}>
              <span aria-hidden="true" />{Object.keys(sync.players).length || ""}
            </button>
          )}
          <button type="button" className="island-pill" onClick={() => sheet.current?.showModal()} aria-label={`${t("switchIsland")}: ${island.name}`}>
            <RegionChip region={island.region} />
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
        {previewBuild && <div className="banner preview" role="status">{t("previewBanner")}</div>}
        {sync.status === "outdated" && <div className="banner warn" role="status">{t("outdatedGame")}</div>}
        {hiddenCount > 0 && <div className="banner" role="status">{t("hiddenIslands", { n: hiddenCount })}</div>}

        <main className="screen" key={screenKey} ref={mainRef}>
          {split && (
            <div className="chains-split">
              <ChainsScreen selected={openChain} onSelect={selectChain} />
              {openChain && <ChainScreen key={`${openChain}|${"building" in screen ? screen.building ?? "" : ""}`} chainId={openChain} building={"building" in screen ? screen.building : undefined} from={"from" in screen ? screen.from : undefined} />}
            </div>
          )}
          {!split && screen.tab === "chains" && ("chain" in screen ? <ChainScreen key={`${screen.chain}|${screen.building ?? ""}`} chainId={screen.chain} building={screen.building} from={screen.from} /> : "catalog" in screen ? <CatalogScreen /> : <ChainsScreen />)}
          {screen.tab === "houses" && <HousesScreen />}
          {screen.tab === "build" && <BuildScreen />}
          {screen.tab === "routes" && <RoutesScreen intent={"intent" in screen ? screen.intent : undefined} focus={"focus" in screen ? screen.focus : undefined} />}
          {screen.tab === "islands" && ("boosts" in screen ? <BoostsScreen /> : <IslandsScreen />)}
          {screen.tab === "settings" && <SettingsScreen />}
          {screen.tab === "manage" && <ManageIslandsScreen />}
        </main>

        <nav className="tabbar" aria-label="Main">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              aria-current={screen.tab === tab ? "page" : undefined}
              onClick={() => go({ tab } as Screen)}
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

        <Chat raised={inChain} />

        <dialog ref={sheet} className="sheet" onClick={(e) => e.target === sheet.current && sheet.current.close()} onClose={() => setIslandQuery("")} aria-label={t("switchIsland")}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="sheet-in" ref={sheetIn}>
            <h2>{t("switchIsland")}</h2>
            {state.islands.length > 8 && (
              <input type="search" className="sheet-search" placeholder={t("searchIsland")} aria-label={t("searchIsland")} value={islandQuery} onChange={(e) => setIslandQuery(e.target.value)} />
            )}
            {byRegion(state.islands.filter((i) => i.name.toLowerCase().includes(islandQuery.trim().toLowerCase())), island.region).map((g) => (
              <div key={g.region} className="sheet-group">
                <h3 className="region-h"><RegionChip region={g.region} /> <span>{g.list.length}</span></h3>
                {g.list.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    className={`sheet-row ${i.region.toLowerCase()}`}
                    aria-pressed={i.id === state.current}
                    onClick={() => { setState({ ...state, current: i.id }); sheet.current?.close(); }}
                  >
                    <span className="sheet-name">{i.name}{state.mode === "versus" && i.owner && <small className="owner"> · {i.owner}</small>}</span>
                    {i.id === state.current && <span className="check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            ))}
            <button type="button" className="manage-btn" onClick={() => { sheet.current?.close(); go({ tab: "manage" }); }}>
              {t("manageIslands")} ›
            </button>
          </div>
        </dialog>
      </div>
    </AppCtx.Provider>
  );
}
