import { isShort, r1 } from "../core/chainRates";
import { useMemo, useState } from "react";
import { buildings, chainById, chainForProduct, dlcNeedsOff, events, hasDlc, KNOWN_REGIONS, patrons, productName, regionName, regionsFor, touchesRegion, type Boost, type Region } from "../data/catalog";
import { islandNeeds, needsCovered } from "../core/needs";
import { tradeRoutes } from "../core/routes";
import { routeTransport } from "../core/economy";
import { nice } from "../i18n";
import { islandPop } from "./stats";
import { Glyph } from "./Glyph";
import { NILE_SEASONS } from "../core/nile";
import { newIsland, type Island, type State } from "../core/state";
import { useApp } from "./context";
import { CoverBar, FilterTabs, RegionChip, Segmented, UiIcon } from "./parts";
import { ProductIcon, RegionGlyph } from "./Emblems";
import { EmpireView, RegionView } from "./EconomyViews";

/** Islas agrupadas por región, con la región de la isla actual primero. */
export function byRegion(islands: Island[], first: Region) {
  const order = [first, ...KNOWN_REGIONS.filter((r) => r !== first)];
  return order.map((region) => ({ region, list: islands.filter((i) => i.region === region) })).filter((g) => g.list.length);
}

/** Vista elegida en la pestaña Isla (se recuerda en este dispositivo). */
type IslandView = "island" | "region" | "empire";
const VIEW_KEY = "anno117-island-view";
const readView = (): IslandView => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === "region" || v === "empire" ? v : "island"; } catch { return "island"; }
};

/** Pestaña Isla: la isla actual y, al lado, su región y el imperio. */
export function IslandsScreen() {
  const { t } = useApp();
  const [view, setViewRaw] = useState<IslandView>(readView);
  const setView = (v: IslandView) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento */ } };
  const [regionPick, setRegionPick] = useState<Region | undefined>();
  return (
    <div className="islands-screen island-screen">
      <FilterTabs<IslandView> label={t("islandViews")} value={view} onChange={(v) => { setRegionPick(undefined); setView(v); }}
        options={[{ v: "island", text: t("viewIsland") }, { v: "region", text: t("viewRegion") }, { v: "empire", text: t("viewEmpire") }]} />
      {view === "island" && <IslandDashboard />}
      {view === "region" && <RegionView key={regionPick} initial={regionPick} />}
      {view === "empire" && <EmpireView onRegion={(r) => { setRegionPick(r); setView("region"); }} />}
    </div>
  );
}

type Line = { key: string; tone: "danger" | "warn" | "ok" | "info"; text: string; onClick?: () => void };

/** Panel de la isla: estado de producción y necesidades, comercio, avisos y próximos pasos. */
function IslandDashboard() {
  const { state, island, plan, rates, econ, world, inbound, outbound, empire, factor, t, lang, go } = useApp();
  const pop = islandPop(island, state.dlcs);
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);
  const rate = (x: number) => nice(r1(x), lang);
  const dlcOff = useMemo(() => dlcNeedsOff(state.dlcs), [state.dlcs]);
  const needRows = useMemo(() => islandNeeds({
    region: island.region, houses: island.houses, needsOff: [...island.needsOff, ...dlcOff], factor, dlcs: state.dlcs, rates,
    econ: econ.filter((x) => x.island === island.id),
  }), [island, dlcOff, factor, state.dlcs, rates, econ]);
  const cover = needsCovered(needRows);
  const unsourced = needRows.filter((x) => x.status === "unsourced");
  const short = rates.filter(isShort).sort((a, b) => b.deficit - a.deficit);
  const managed = rates.filter((r) => r.state !== "spare");
  const accepted = rates.filter((r) => r.state === "short" && r.accepted).length;
  const missing = plan.toBuild.reduce((a, x) => a + x.count, 0);
  const goals = new Set([...Object.keys(island.goals).filter((k) => island.goals[k] > 0), ...Object.keys(island.targets ?? {})]).size;
  const routes = useMemo(() => tradeRoutes(world.flows).filter((r) => r.a === island.id || r.b === island.id), [world.flows, island.id]);
  const routeShort = routes.filter((r) => routeTransport(r, state.ships).status === "short").length;
  const nameOf = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";
  const group = (flows: typeof inbound, side: "from" | "to") => {
    const m = new Map<string, { product: string; rate: number; places: Set<string> }>();
    for (const f of flows) {
      const g = m.get(f.product) ?? { product: f.product, rate: 0, places: new Set<string>() };
      g.rate += f.rate; g.places.add(nameOf(f[side])); m.set(f.product, g);
    }
    return [...m.values()].sort((a, b) => b.rate - a.rate);
  };
  const ins = group(inbound, "from");
  const outs = group(outbound, "to");
  const chainOf = (product: string) => chainForProduct(island.region, product)?.id;
  const recs = empire.recommendations.filter((r) => r.to === island.id || r.from === island.id || r.build?.island === island.id);

  const alerts: Line[] = [];
  if (short.length) alerts.push({ key: "short", tone: "danger", text: t("dashShortChains", { n: short.length }), onClick: () => go({ tab: "chains" }) });
  if (unsourced.length) alerts.push({ key: "uns", tone: "danger", text: t("dashUnsourced", { n: unsourced.length }), onClick: () => go({ tab: "houses" }) });
  if (routeShort) alerts.push({ key: "routes", tone: "warn", text: t("dashRoutesShort", { n: routeShort }), onClick: () => go({ tab: "routes" }) });
  if (missing) alerts.push({ key: "build", tone: "warn", text: t("dashToBuild", { n: missing }), onClick: () => go({ tab: "build" }) });
  if (accepted) alerts.push({ key: "acc", tone: "info", text: t("dashAccepted", { n: accepted }), onClick: () => go({ tab: "chains" }) });
  if (!alerts.length) alerts.push({ key: "ok", tone: "ok", text: t("dashAllGood") });

  const actions: Line[] = [];
  for (const r of short.slice(0, 3)) {
    const c = chainById[r.chainId];
    actions.push({ key: r.chainId, tone: "danger", text: r.toBuild > 0 ? t(r.toBuild === 1 ? "dashActBuild1" : "dashActBuild", { good: c.product[lang], n: r.toBuild }) : t("dashActChain", { good: c.product[lang], x: rate(r.deficit) }), onClick: () => go({ tab: "chains", chain: c.id }) });
  }
  for (const r of recs.slice(0, 4 - actions.length)) {
    const good = productName(r.product)[lang];
    const txt = r.state === "build" && r.build ? t("dashActRecBuild", { good, island: nameOf(r.build.island) })
      : r.state === "short" ? t("dashActRoute", { a: nameOf(r.route?.a ?? ""), b: nameOf(r.route?.b ?? "") })
      : r.from ? t("dashActSupply", { good, from: nameOf(r.from), to: nameOf(r.to) }) : t("dashActNoSource", { good });
    actions.push({ key: r.key, tone: "warn", text: txt, onClick: () => go(r.state === "build" ? { tab: "build" } : { tab: "routes" }) });
  }
  if (!actions.length && missing) actions.push({ key: "b", tone: "warn", text: t("dashToBuild", { n: missing }), onClick: () => go({ tab: "build" }) });

  const patron = island.patron && patrons.find((p) => p.id === island.patron!.id);
  const boostSummary = [patron ? patron.name[lang] : t("noPatron"), t("dashEventsN", { n: island.events.length })].join(" · ");
  const pct = cover.total ? cover.covered / cover.total : 1;
  const lineList = (list: Line[]) => (
    <ul className="dash-lines">
      {list.map((l) => (
        <li key={l.key}>
          {l.onClick ? (
            <button type="button" className={`dash-line ${l.tone}`} onClick={l.onClick}>
              <span className="dl-dot" aria-hidden="true">{l.tone === "ok" ? <UiIcon name="check" size={14} /> : l.tone === "info" ? "i" : "!"}</span>
              <span className="dl-text">{l.text}</span>
              <UiIcon name="chev" size={16} />
            </button>
          ) : (
            <span className={`dash-line ${l.tone}`}>
              <span className="dl-dot" aria-hidden="true">{l.tone === "ok" ? <UiIcon name="check" size={14} /> : "!"}</span>
              <span className="dl-text">{l.text}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
  const flowList = (list: ReturnType<typeof group>, dir: "in" | "out") => (
    <ul className="dash-flows">
      {list.slice(0, 5).map((g) => {
        const c = chainOf(g.product);
        return (
          <li key={g.product}>
            <button type="button" className="dash-flow" disabled={!c} onClick={() => c && go({ tab: "chains", chain: c })}>
              <ProductIcon product={g.product} fallback="ship" size={26} />
              <span className="df-name">{productName(g.product)[lang]}</span>
              <span className="df-rate">{rate(g.rate)} t/min</span>
              <span className="df-place">{dir === "in" ? "←" : "→"} {[...g.places].join(", ")}</span>
            </button>
          </li>
        );
      })}
      {list.length > 5 && <li className="fine">{t("andMore", { n: list.length - 5 })}</li>}
    </ul>
  );

  return (
    <>
      <header className="dash-hero">
        <span className="dash-hero-icon"><RegionGlyph region={island.region} size={34} /></span>
        <div>
          <h1>{t("viewIsland")} · {island.name}</h1>
          <p><RegionChip region={island.region} /> <button type="button" className="link" onClick={() => go({ tab: "manage" })}>{t("manageIslands")} ›</button></p>
        </div>
      </header>

      <section className="dash-tiles" aria-label={t("viewIsland")}>
        <button type="button" className="dash-tile" onClick={() => go({ tab: "houses" })}>
          <span>{t("statResidents")}</span><b>{pop.estimated && pop.residents ? "≈" : ""}{fmt(pop.residents)}</b>
          <small>{pop.residents ? (pop.estimated ? t("popEstimated") : t("popReal")) : t("noHousesYet")}</small>
        </button>
        <button type="button" className="dash-tile" onClick={() => go({ tab: "houses" })}>
          <span>{t("factHouses")}</span><b>{fmt(pop.houses)}</b><small>{t("dashLevels", { n: Object.values(island.houses).filter((n) => n > 0).length })}</small>
        </button>
        <button type="button" className={`dash-tile ${cover.covered < cover.total ? "warn" : "ok"}`} onClick={() => go({ tab: "houses" })}>
          <span>{t("statNeedsCovered")}</span><b>{cover.covered}/{cover.total}</b><small>{t("statInPlan")}</small>
        </button>
      </section>

      {cover.total > 0 && (
        <button type="button" className="card dash-supply" onClick={() => go({ tab: "houses" })}>
          <span className="ds-top"><b>{t("dashSupply")}</b><span>{cover.covered}/{cover.total} ({Math.round(pct * 100)} %)</span></span>
          <CoverBar value={pct} tone={pct >= 1 ? "ok" : "short"} />
        </button>
      )}

      <section className="dash-quad" aria-label={t("dashQuick")}>
        <button type="button" className={`dash-q${short.length ? " danger" : ""}`} onClick={() => go({ tab: "chains" })}>
          <span className="dq-ico"><UiIcon name="laurel" size={20} /></span><span>{t("tabChains")}</span>
          <b>{managed.length - short.length}/{managed.length}</b><small>{t("dashCovered")}</small>
        </button>
        <button type="button" className="dash-q" onClick={() => go({ tab: "houses" })}>
          <span className="dq-ico"><Glyph name="house" size={20} /></span><span>{t("tabHouses")}</span>
          <b>{cover.total - cover.covered}</b><small>{t("dashNeedsOpen")}</small>
        </button>
        <button type="button" className={`dash-q${missing ? " warn" : ""}`} onClick={() => go({ tab: "build" })}>
          <span className="dq-ico"><UiIcon name="hammer" size={20} /></span><span>{t("tabBuild")}</span>
          <b>{missing}</b><small>{t("goalsN", { n: goals })}</small>
        </button>
        <button type="button" className={`dash-q${routeShort ? " warn" : ""}`} onClick={() => go({ tab: "routes" })}>
          <span className="dq-ico"><Glyph name="ship" size={20} /></span><span>{t("tabRoutes")}</span>
          <b>{routes.length}</b><small>{routeShort ? t("dashRoutesShortN", { n: routeShort }) : t("dashRoutesOk")}</small>
        </button>
      </section>

      <section className="card dash-card" aria-labelledby="dash-alerts">
        <h2 id="dash-alerts">{t("dashState")}</h2>
        {lineList(alerts)}
      </section>

      {actions.length > 0 && (
        <section className="card dash-card" aria-labelledby="dash-next">
          <h2 id="dash-next">{t("dashNext")}</h2>
          {lineList(actions)}
        </section>
      )}

      <section className="card dash-card" aria-labelledby="dash-trade">
        <h2 id="dash-trade">{t("dashTrade")}</h2>
        <h3 className="dash-sub"><span aria-hidden="true">↑</span> {t("dashExports", { n: outs.length })}</h3>
        {outs.length ? flowList(outs, "out") : <p className="fine">{t("dashNoExports")}</p>}
        <h3 className="dash-sub"><span aria-hidden="true">↓</span> {t("dashImports", { n: ins.length })}</h3>
        {ins.length ? flowList(ins, "in") : <p className="fine">{t("dashNoImports")}</p>}
      </section>

      <button type="button" className="card dash-boosts" onClick={() => go({ tab: "islands", boosts: true })}>
        <span className="dq-ico"><UiIcon name="sliders" size={20} /></span>
        <span><b>{t("boostsTitle", { island: island.name })}</b><small>{boostSummary}</small></span>
        <UiIcon name="chev" size={18} />
      </button>
    </>
  );
}

/** Mejoras de la isla (pantalla secundaria): dios patrón, devoción, crecida del Nilo y eventos. */
export function BoostsScreen() {
  const { state, island, editIsland, t, lang, back } = useApp();
  const targetsText = (x: Boost) => {
    const names = [...new Set(x.targets.filter((id) => buildings[id]?.region === island.region).map((id) => buildings[id].name[lang]))];
    return names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t("andMore", { n: names.length - 4 })}` : names.join(", ");
  };
  const boostText = (x: Boost) =>
    [x.prod ? `+${x.prod} %` : "", x.base ? `+${x.base} % ${t("baseShort")}` : "", x.fuel ? t("fuelLonger", { n: x.fuel }) : ""].filter(Boolean).join(" · ") + " · " + targetsText(x);
  return (
    <div className="islands-screen boosts-screen">
      <div className="sub-head">
        <button type="button" className="back" onClick={back}><span aria-hidden="true">‹</span> {t("viewIsland")}</button>
        <h1>{t("boostsTitle", { island: island.name })}</h1>
      </div>
        <section aria-label={t("boostsTitle", { island: island.name })} className="stack">
          <div className="card setting boosts">
            <p>{t("boostsHelpIsland")}</p>
            {island.region === "Aegyptus" && (
              <>
                <h3>{t("nileTitle")}</h3>
                <Segmented label={t("nileTitle")} value={island.nile ?? "media"} onChange={(v) => editIsland({ nile: v })}
                  options={NILE_SEASONS.map((x) => [x, t(x === "media" ? "nileMedia" : x === "shemu" ? "nileShemu" : "nileAjet")] as [typeof x, string])} />
                <p className="fine">{t("nileHelp")}</p>
              </>
            )}
            <h3>{t("patron")}</h3>
            {(() => {
              const options = patrons.filter((p) => hasDlc(p, state.dlcs) && p.effects.some((e) => touchesRegion(e, island.region)));
              const cur = island.patron && options.find((p) => p.id === island.patron!.id);
              const milestones = cur ? cur.effects[0].milestones : [];
              return (
                <div className="patron">
                  <label htmlFor="patron-sel" className="sr">{t("patron")}</label>
                  <select id="patron-sel" value={cur?.id ?? ""} onChange={(e) => editIsland({ patron: e.target.value ? { id: e.target.value, scaling: island.patron?.scaling || milestones[0]?.scaling || 10 } : null })}>
                    <option value="">{t("noPatron")}</option>
                    {options.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
                  </select>
                  {cur && (
                    <>
                      <label htmlFor="devotion-sel" className="label">{t("devotion")}</label>
                      <select id="devotion-sel" value={island.patron!.scaling} onChange={(e) => editIsland({ patron: { id: cur.id, scaling: Number(e.target.value) } })}>
                        {cur.effects[0].milestones.map((m) => (
                          <option key={m.devotion} value={m.scaling}>{t("devotionOpt", { d: m.devotion.toLocaleString(lang), n: m.scaling * (cur.effects[0].prod || 1) })}</option>
                        ))}
                      </select>
                      <p className="fine">{cur.effects.map((e) => `${e.name[lang]}: ${targetsText(e)}`).join(" · ")}</p>
                    </>
                  )}
                </div>
              );
            })()}

            <h3>{t("eventsTitle")}</h3>
            <ul className="toggles">
              {events.filter((x) => hasDlc(x, state.dlcs) && touchesRegion(x, island.region)).map((x) => (
                <li key={x.id}>
                  <label>
                    <input type="checkbox" checked={island.events.includes(x.id)}
                      onChange={(e) => editIsland({ events: e.target.checked ? [...island.events, x.id] : island.events.filter((k) => k !== x.id) })} />
                    <span><b>{x.name[lang]}</b><small>{boostText(x)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="fine">{t("manualNote")}</p>
          </div>
        </section>
    </div>
  );
}

/** Página aparte para gestionar las islas: crear, renombrar, borrar y elegir la actual. */
export function ManageIslandsScreen() {
  const { state, setState, island, t, lang, back } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Region>(island.region);
  const patch = (next: Partial<State>) => setState({ ...state, ...next });

  const row = (i: Island) => {
    const isCurrent = i.id === state.current;
    const goals = new Set([...Object.keys(i.goals).filter((k) => i.goals[k] > 0), ...Object.keys(i.targets ?? {})]).size;
    const open = editing === i.id;
    return (
      <li key={i.id} className={`island-row ${i.region.toLowerCase()}${isCurrent ? " current" : ""}`}>
        <div className="island-line">
          <button type="button" className="island-main" aria-pressed={isCurrent} onClick={() => patch({ current: i.id })}>
            <b>{i.name}</b>
            <small>
              {isCurrent ? t("current") : t("use")}
              {goals ? ` · ${t(goals === 1 ? "goalsOne" : "goalsMany", { n: goals })}` : ""}
              {state.mode === "versus" && i.owner ? ` · ${i.owner}` : ""}
            </small>
          </button>
          <button type="button" className="edit-btn" aria-expanded={open} aria-label={t("editIsland", { name: i.name })}
            onClick={() => { setEditing(open ? null : i.id); setDeleting(null); }}>
            {open ? "✕" : "✎"}
          </button>
        </div>
        {open && (
          <div className="island-edit">
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                const v = String(new FormData(e.currentTarget).get("n") ?? "").trim();
                if (v) patch({ islands: state.islands.map((x) => (x.id === i.id ? { ...x, name: v } : x)) });
                setEditing(null);
              }}
            >
              <label className="sr" htmlFor={`rn-${i.id}`}>{t("name")}</label>
              <input id={`rn-${i.id}`} name="n" defaultValue={i.name} maxLength={40} required />
              <button type="submit" className="primary">{t("save")}</button>
            </form>
            {deleting === i.id ? (
              <div className="confirm" role="group" aria-label={t("deleteConfirm", { name: i.name })}>
                <p>{t("deleteConfirm", { name: i.name })}</p>
                <button type="button" className="danger" onClick={() => {
                  const islands = state.islands.filter((x) => x.id !== i.id);
                  patch({ islands, current: isCurrent ? islands[0].id : state.current });
                  setDeleting(null); setEditing(null);
                }}>{t("delete")}</button>
                <button type="button" onClick={() => setDeleting(null)}>{t("cancel")}</button>
              </div>
            ) : (
              <button type="button" className="link danger-link" disabled={state.islands.length === 1} onClick={() => setDeleting(i.id)}>{t("deleteIsland")}</button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="islands-screen manage-screen">
      <button type="button" className="back" onClick={back}>
        <span aria-hidden="true">‹</span> {t("backShort")}
      </button>
      <header className="screen-head">
        <h1>{t("islandsOnly")}</h1>
        <p>{t("islandsSub", { n: state.islands.length })}</p>
      </header>

      <section aria-label={t("islands")} className="stack">
        {byRegion(state.islands, island.region).map((g) => (
          <div key={g.region} className="region-group">
            <h2 className="region-h"><RegionChip region={g.region} /> <span>{g.list.length}</span></h2>
            <ul className="island-list">{g.list.map(row)}</ul>
          </div>
        ))}

        {adding ? (
          <form
            className="add-island card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const isl = { ...newIsland(name, region), ...(state.session ? { owner: state.session.player } : {}) };
              patch({ islands: [...state.islands, isl], current: isl.id });
              setName("");
              setAdding(false);
            }}
          >
            <h3>{t("newIsland")}</h3>
            <label htmlFor="new-name">{t("name")}</label>
            <input id="new-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required autoFocus />
            <span className="label">{t("region")}</span>
            <Segmented<Region> label={t("region")} value={region} onChange={setRegion} options={regionsFor(state.dlcs).map((r) => [r, regionName(r, lang)] as [Region, string])} />
            <div className="row-actions">
              <button type="submit" className="primary" disabled={!name.trim() || state.islands.length >= 50}>{t("add")}</button>
              <button type="button" onClick={() => setAdding(false)}>{t("cancel")}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="add-btn" onClick={() => setAdding(true)} disabled={state.islands.length >= 50}>+ {t("newIsland")}</button>
        )}
      </section>
    </div>
  );
}
