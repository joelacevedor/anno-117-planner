/**
 * Vistas Región e Imperio de la pestaña Isla (maquetas aprobadas el 7-11-2026).
 * Todo sale de core/economy.ts; aquí solo se presenta y se navega.
 */
import { useMemo, useState, type ReactNode } from "react";
import { buildings, chainForProduct, productName, providerOf, regionName, regionsFor, type Region } from "../data/catalog";
import { regionEconomy, type IslandProduct, type Recommendation, type RegionProduct } from "../core/economy";
import { nice } from "../i18n";
import { useApp } from "./context";
import { ProductIcon, RegionGlyph } from "./Emblems";
import { Segmented } from "./parts";

const BASE = import.meta.env.BASE_URL;

/** Iconos de línea de las tarjetas de resumen. */
const ICON: Record<string, ReactNode> = {
  islands: <><path d="M3 18c3-1.5 5-1.5 9 0s6 1.5 9 0" /><path d="M6 15c1-4 3-7 6-7s5 3 6 7" /><path d="M12 8V3l4 2-4 2" /></>,
  down: <><path d="M12 4v15" /><path d="m6 13 6 6 6-6" /></>,
  up: <><path d="M12 20V5" /><path d="m6 11 6-6 6 6" /></>,
  temple: <><path d="M3 9 12 4l9 5" /><path d="M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16" /></>,
  factory: <><path d="M3 20V10l5 3V10l5 3V6h3v14z" /><path d="M3 20h18" /></>,
  people: <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><path d="M3 19c.5-3.5 2.5-5 5-5s4.5 1.5 5 5M11 19c.5-3.5 2.5-5 5-5s4.5 1.5 5 5" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="m5 7-3 6h6zM19 7l-3 6h6z" /></>,
  warn: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17v.5" /></>,
  ship: <><path d="M3 15h18l-2.5 4h-13z" /><path d="M12 3v12M12 4l6 8h-6M12 6l-5 6h5" /></>,
  boxes: <><rect x="3" y="12" width="8" height="8" rx="1" /><rect x="13" y="12" width="8" height="8" rx="1" /><rect x="8" y="3" width="8" height="8" rx="1" /></>,
  laurel: <g fill="currentColor" stroke="none"><path d="M7.4 20.5C4 18.2 2.3 14.6 3 10.6l1.6.3c-.6 3.3.8 6.3 3.6 8.2zM16.6 20.5l-.8-1.4c2.8-1.9 4.2-4.9 3.6-8.2l1.6-.3c.7 4-1 7.6-4.4 9.9z" /><ellipse cx="3.6" cy="8.2" rx="1.2" ry="2.2" transform="rotate(-20 3.6 8.2)" /><ellipse cx="3.4" cy="13" rx="1.2" ry="2.2" transform="rotate(-60 3.4 13)" /><ellipse cx="5" cy="17" rx="1.2" ry="2.2" transform="rotate(-50 5 17)" /><ellipse cx="20.4" cy="8.2" rx="1.2" ry="2.2" transform="rotate(20 20.4 8.2)" /><ellipse cx="20.6" cy="13" rx="1.2" ry="2.2" transform="rotate(60 20.6 13)" /><ellipse cx="19" cy="17" rx="1.2" ry="2.2" transform="rotate(50 19 17)" /></g>,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  chev: <path d="m9 6 6 6-6 6" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  hammer: <><path d="m14 6 4 4M3 21l9-9" /><path d="m11 4 3-1 7 7-1 3-3-1-5-5z" /></>,
};
export const Ico = ({ name, size = 20 }: { name: keyof typeof ICON; size?: number }) => (
  <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>
);

/** Emblema de región dentro de un círculo de su color. */
export const RegionCoin = ({ region, size = 34 }: { region: string; size?: number }) => (
  <span className={`coin ${region.toLowerCase()}`} style={{ width: size, height: size }}><RegionGlyph region={region} size={Math.round(size * 0.56)} /></span>
);

const useFmt = () => {
  const { lang } = useApp();
  return (x: number) => nice(Math.round(x * 10) / 10, lang);
};

// ── Región ────────────────────────────────────────────────────────────────

type Filter = "all" | "surplus" | "deficit" | "balanced";

export function RegionView() {
  const { state, island, econ, empire, t, lang, setState, go } = useApp();
  const fmt = useFmt();
  const withIslands = regionsFor(state.dlcs).filter((r) => state.islands.some((i) => i.region === r));
  const [region, setRegion] = useState<Region>(island.region);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [info, setInfo] = useState(false);
  const islands = state.islands;
  const sum = useMemo(() => regionEconomy(region, islands.map((i) => ({ id: i.id, name: i.name, region: i.region, built: i.built })), econ), [region, islands, econ]);
  const nameOf = (id: string) => islands.find((i) => i.id === id)?.name ?? "?";
  const q = query.trim().toLowerCase();
  const list = sum.products.filter((p) =>
    (filter === "all" || p.status === filter) && (!q || productName(p.product)[lang].toLowerCase().includes(q)));
  const LIMIT = 8;
  const shown = all || q || filter !== "all" ? list : list.slice(0, LIMIT);
  const openIsland = (id: string, tab: "build" | "chains", product?: string) => {
    const isl = islands.find((i) => i.id === id);
    if (!isl) return;
    const chain = product && chainForProduct(isl.region, product);
    setState({ ...state, current: id });
    go(tab === "chains" && chain ? { tab: "chains", chain: chain.id } : { tab: "build" });
  };

  return (
    <div className="econ region-view">
      <div className="region-chips" role="radiogroup" aria-label={t("region")}>
        {withIslands.map((r) => (
          <button type="button" key={r} role="radio" aria-checked={r === region} className={`region-chip big ${r.toLowerCase()}`} onClick={() => { setRegion(r); setOpen(null); }}>
            <RegionGlyph region={r} size={15} />{regionName(r, lang)}
          </button>
        ))}
      </div>

      <section className="card econ-card">
        <header className="econ-head">
          <span className={`head-glyph ${region.toLowerCase()}`}><RegionGlyph region={region} size={22} /></span>
          <h2>{t("regionSummary", { region: regionName(region, lang) })}</h2>
          <button type="button" className="icon-btn" aria-expanded={info} aria-label={t("regionInfo")} onClick={() => setInfo(!info)}><Ico name="info" /></button>
        </header>
        {info && <p className="fine econ-info">{t("regionInfoText")}</p>}
        <ul className="stat-row">
          <li><Ico name="islands" /><b>{sum.islands.length}</b><span>{t("statIslands")}</span></li>
          <li className="down"><Ico name="down" /><b>{sum.deficit}</b><span>{t("statDeficit")}</span></li>
          <li className="up"><Ico name="up" /><b>{sum.surplus}</b><span>{t("statSurplus")}</span></li>
          <li className="muted"><Ico name="temple" /><b>{sum.estimated}</b><span>{t("statEstimated")}</span></li>
        </ul>
        <ul className="flow-row">
          <li><span><Ico name="factory" size={16} />{t("statProduce")}</span><b>{fmt(sum.produce)}</b></li>
          <li><span><Ico name="people" size={16} />{t("statConsume")}</span><b>{fmt(sum.consume)}</b></li>
          <li className={sum.net < -0.1 ? "down" : sum.net > 0.1 ? "up" : ""}><span><Ico name="scale" size={16} />{t("statBalance")}</span><b>{sum.net > 0.05 ? "+" : sum.net < -0.05 ? "−" : ""}{fmt(Math.abs(sum.net))}</b></li>
        </ul>
        <p className="fine flow-note">
          {sum.importIn > 0.05 || sum.exportOut > 0.05
            ? t("flowNote", { a: fmt(sum.produce), b: fmt(sum.consume), i: fmt(sum.importIn), e: fmt(sum.exportOut) })
            : t("flowUnit")}
        </p>
      </section>

      <section className="card econ-card">
        <header className="econ-head">
          <span className="head-glyph"><Ico name="boxes" size={22} /></span>
          <h2>{t("regionProducts")}</h2>
          {list.length > LIMIT && !q && filter === "all" && (
            <button type="button" className="link more-link" onClick={() => setAll(!all)}>{all ? t("showLess") : t("seeAll")} →</button>
          )}
        </header>
        <input type="search" className="econ-search" placeholder={t("searchProduct")} aria-label={t("searchProduct")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Segmented<Filter> label={t("filter")} value={filter} onChange={setFilter}
          options={[["all", t("fAll")], ["surplus", t("fSurplus")], ["deficit", t("fDeficit")], ["balanced", t("fBalanced")]]} />
        {shown.length === 0 && <p className="fine">{sum.products.length ? t("noMatches") : t("regionEmpty")}</p>}
        <ul className="eprods">
          {shown.map((p) => (
            <ProductRow key={p.product} p={p} chainable={!!chainForProduct(region, p.product)} open={open === p.product} onToggle={() => setOpen(open === p.product ? null : p.product)}
              nameOf={nameOf} recs={empire.recommendations.filter((r) => r.product === p.product && sum.islands.includes(r.to))}
              onChain={(id) => openIsland(id, "chains", p.product)} onBuild={(id) => openIsland(id, "build")} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ProductRow({ p, chainable, open, onToggle, nameOf, recs, onChain, onBuild }: {
  p: RegionProduct; chainable: boolean; open: boolean; onToggle: () => void; nameOf: (id: string) => string; recs: Recommendation[];
  onChain: (island: string) => void; onBuild: (island: string) => void;
}) {
  const { t, lang, state } = useApp();
  const fmt = useFmt();
  const regionsOf = (ids: string[]) => [...new Set(ids.map((id) => state.islands.find((i) => i.id === id)?.region).filter(Boolean) as string[])].map((r) => regionName(r, lang)).join(", ");
  const home = state.islands.find((i) => i.id === p.islands[0]?.island)?.region;
  const outside = (list: { island: string }[]) => list.map((f) => f.island).filter((id) => state.islands.find((i) => i.id === id)?.region !== home);
  const max = Math.max(p.produce + p.importIn, p.consume + p.exportOut, 0.0001);
  const sign = (x: number) => (x > 0.05 ? "+" : x < -0.05 ? "−" : "");
  const label = p.status === "deficit" ? t("fDeficit1") : p.status === "surplus" ? t("fSurplus1") : t("fBalanced1");
  const extra = [
    p.importIn > 0.05 ? t("arrivesFrom", { n: fmt(p.importIn), regions: regionsOf(outside(p.islands.flatMap((x) => x.from))) }) : "",
    p.exportOut > 0.05 ? t("sendsOut", { n: fmt(p.exportOut), regions: regionsOf(outside(p.islands.flatMap((x) => x.to))) }) : "",
    p.unsourced > 0.05 ? t("noSourceShort", { n: fmt(p.unsourced) }) : "",
  ].filter(Boolean).join(" · ");
  const top = [...p.islands].sort((a, b) => b.produce - a.produce)[0];
  const builder = recs.find((r) => r.state === "build")?.build?.island ?? top?.island;
  const hint = hintFor(p, recs, nameOf, fmt, t, lang);
  return (
    <li className={`eprod ${p.status}${open ? " open" : ""}`}>
      <button type="button" className="eprod-main" aria-expanded={open} onClick={onToggle}>
        <ProductIcon product={p.product} fallback="ship" size={40} />
        <span className="eprod-mid">
          <b>{productName(p.product)[lang]}</b>
          <span className="bars" aria-hidden="true">
            <span className="b made" style={{ width: `${((p.produce + p.importIn) / max) * 100}%` }} />
            <span className="b used" style={{ width: `${((p.consume + p.exportOut) / max) * 100}%` }} />
          </span>
          <small>{t("produceConsume", { a: fmt(p.produce), b: fmt(p.consume) })}{extra ? ` · ${extra}` : ""}{p.estimated ? ` · ${t("estimatedShort")}` : ""}</small>
        </span>
        <span className="eprod-end">
          <span className={`pill-state ${p.status}`}>{label}</span>
          <span className="net">{sign(p.net)}{fmt(Math.abs(p.net))}<small> t/min</small></span>
        </span>
        <span className="chev" aria-hidden="true"><Ico name="chev" size={18} /></span>
      </button>
      {open && (
        <div className="eprod-detail">
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t("colIsland")}</th><th>{t("colProduce")}</th><th>{t("colConsume")}</th><th>{t("colMoves")}</th><th>{t("colBalance")}</th></tr></thead>
              <tbody>
                {p.islands.map((x: IslandProduct) => {
                  const moves = x.inflow - x.outflow;
                  return (
                    <tr key={x.island}>
                      <td>{nameOf(x.island)}</td>
                      <td>{!x.hasBuilt && x.planned > 0 ? "≈" : ""}{fmt(x.produce)}</td>
                      <td>{fmt(x.consume)}</td>
                      <td>{Math.abs(moves) > 0.05 ? `${sign(moves)}${fmt(Math.abs(moves))}` : "—"}</td>
                      <td className={x.saldo < -0.1 ? "down" : x.saldo > 0.1 ? "up" : ""}>{Math.abs(x.saldo) > 0.05 ? `${sign(x.saldo)}${fmt(Math.abs(x.saldo))}` : "0"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hint && <p className="hint"><Ico name="bulb" /><span>{hint}</span></p>}
          <div className="row-actions wrap">
            {top && chainable && <button type="button" onClick={() => onChain(top.island)}><Ico name="link" size={18} /> {t("seeChain")}</button>}
            {builder && <button type="button" onClick={() => onBuild(builder)}><Ico name="hammer" size={18} /> {t("buildAt", { island: nameOf(builder) })}</button>}
          </div>
        </div>
      )}
    </li>
  );
}

/** Frase de redistribución: quién puede abastecer a quién y qué falta construir. */
function hintFor(p: RegionProduct, recs: Recommendation[], nameOf: (id: string) => string, fmt: (x: number) => string, t: ReturnType<typeof useApp>["t"], lang: "es" | "en") {
  const parts: string[] = [];
  for (const r of recs) {
    if ((r.state === "assign" || r.state === "no-route") && r.from) parts.push(t("hintSupply", { from: nameOf(r.from), n: fmt(r.offer ?? r.rate), to: nameOf(r.to), m: fmt(r.rate) }));
  }
  const build = recs.filter((r) => r.state === "build");
  if (build.length) {
    const missing = build.reduce((s, r) => s + r.rate, 0);
    const b = build[0].build!;
    const count = build.reduce((s, r) => s + (r.build?.count ?? 0), 0);
    parts.push(t("hintBuild", { n: fmt(missing), k: count, name: (count === 1 ? buildings[b.building].name : buildings[b.building].plural)[lang].toLowerCase() }));
  }
  if (!parts.length && p.status === "surplus") parts.push(t("hintSurplus", { n: fmt(p.net) }));
  return parts.join(" ");
}

// ── Imperio ───────────────────────────────────────────────────────────────

export function EmpireView() {
  const { state, empire, t, lang, setState, go } = useApp();
  const fmt = useFmt();
  const [tab, setTab] = useState<"pending" | "covered">("pending");
  const [map, setMap] = useState(false);
  const [pairFilter, setPairFilter] = useState<string | null>(null);
  const islands = state.islands;
  const byId = Object.fromEntries(islands.map((i) => [i.id, i]));
  const nameOf = (id: string) => byId[id]?.name ?? "?";
  const regionOf = (id: string) => byId[id]?.region;
  const recs = empire.recommendations.filter((r) => {
    if (!pairFilter) return true;
    const [a, b] = pairFilter.split(">");
    return r.from && regionOf(r.from) === a && regionOf(r.to) === b;
  });
  const act = (r: Recommendation) => {
    if (r.state === "no-route" || r.state === "assign") return go({ tab: "routes", intent: { from: r.from!, to: r.to, product: r.product, rate: r.rate } });
    if (r.state === "short" || r.state === "unchecked") return go({ tab: "routes", focus: `${r.route!.a}|${r.route!.b}` });
    const target = r.state === "build" ? r.build!.island : r.to;
    setState({ ...state, current: target });
    go(r.state === "build" ? { tab: "build" } : { tab: "houses" });
  };

  return (
    <div className="econ empire-view">
      <header className="view-ctx">
        <span className="head-glyph"><Ico name="laurel" size={24} /></span>
        <h1>{t("viewEmpire")}</h1>
      </header>
      <ul className="stat-row card">
        <li className="gold"><Ico name="laurel" size={26} /><b>{empire.regions.length}</b><span>{t("statRegions")}</span></li>
        <li className="down"><Ico name="warn" size={26} /><b>{empire.recommendations.length}</b><span>{t("statPending")}</span></li>
        <li className="warn"><Ico name="ship" size={26} /><b>{empire.shortRoutes}</b><span>{t("statShortRoutes")}</span></li>
        <li className="up"><Ico name="boxes" size={26} /><b>{empire.surplusProducts}</b><span>{t("statWithSurplus")}</span></li>
      </ul>

      <section className="card econ-card network">
        <header className="econ-head">
          <span className="head-glyph"><Ico name="temple" size={24} /></span>
          <h2>{t("tradeNetwork")}</h2>
          {empire.pairs.length > 0 && (
            <button type="button" className="link more-link" aria-pressed={map} onClick={() => setMap(!map)}><Ico name="map" size={18} /> {map ? t("hideMap") : t("seeMap")}</button>
          )}
        </header>
        {empire.pairs.length === 0 && <p className="fine">{t("networkEmpty")}</p>}
        {map && <EmpireMap />}
        <ul className="corridors">
          {empire.pairs.map((p, n) => {
            const key = `${p.from}>${p.to}`;
            const on = pairFilter === key;
            return (
              <li key={key}>
                <button type="button" className={`corridor${on ? " on" : ""}${p.rate > 0 ? "" : " none"}`} aria-pressed={on} onClick={() => { setPairFilter(on ? null : key); setTab("pending"); }}>
                  {map && <span className="cnum" aria-hidden="true">{n + 1}</span>}
                  <span className="c-regions">
                    <RegionCoin region={p.from} size={22} /><b>{regionName(p.from, lang)}</b>
                    <span className="arrow" aria-label={t("toWord")}>→</span>
                    <RegionCoin region={p.to} size={22} /><b>{regionName(p.to, lang)}</b>
                  </span>
                  <span className="c-state">
                    {p.rate > 0
                      ? <><Ico name="ship" size={16} /><b>{fmt(p.rate)}</b><small>t/min</small></>
                      : <em>{t("noShipments")}</em>}
                  </span>
                  <span className="chev" aria-hidden="true"><Ico name="chev" size={16} /></span>
                  {p.missing && <span className="c-warn"><Ico name="warn" size={14} />{t("pairMissing", { good: productName(p.missing.product)[lang], n: fmt(p.missing.rate) })}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {empire.pairs.length > 0 && <p className="fine">{t("corridorHelp")}</p>}
        <img className="empire-art" src={`${BASE}img/empire.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async" width="1200" height="481" />
      </section>

      <Segmented<"pending" | "covered"> label={t("recommendations")} value={tab} onChange={setTab}
        options={[["pending", `${t("pendingTab")} ${recs.length}`], ["covered", `${t("coveredTab")} ${empire.covered.length}`]]} />
      {pairFilter && <button type="button" className="link" onClick={() => setPairFilter(null)}>{t("clearFilter")}</button>}

      {tab === "pending" ? (
        recs.length ? (
          <ul className="recs">{recs.map((r) => <RecCard key={r.key} r={r} nameOf={nameOf} regionOf={regionOf} onAct={() => act(r)} />)}</ul>
        ) : <p className="fine empty-note">{t("allCovered")}</p>
      ) : (
        <ul className="recs">
          {empire.covered.map((c) => (
            <li key={`${c.a}|${c.b}`} className="rec covered">
              <div className="rhead"><Ico name="ship" size={26} /><div><b>{nameOf(c.a)} ⇄ {nameOf(c.b)}</b><small>{c.products.map((p) => productName(p)[lang]).join(", ")} · {fmt(c.rate)} t/min</small></div></div>
              <span className="state ok">{t("stTransportOk")}</span>
            </li>
          ))}
          {!empire.covered.length && <p className="fine empty-note">{t("noneCovered")}</p>}
        </ul>
      )}
      <p className="fine">{t("priorityNote")}</p>
    </div>
  );
}

function RecCard({ r, nameOf, regionOf, onAct }: { r: Recommendation; nameOf: (id: string) => string; regionOf: (id: string) => Region | undefined; onAct: () => void }) {
  const { t, lang } = useApp();
  const fmt = useFmt();
  const { state } = useApp();
  const good = productName(r.product)[lang];
  // Regiones (con vuestros DLC) que lo fabrican, aunque aún no tengáis islas allí.
  const makers = regionsFor(state.dlcs).filter((x) => !!providerOf(x, r.product));
  const reg = (id?: string) => (id && regionOf(id) ? regionName(regionOf(id)!, lang) : "");
  const title = r.route ? `${nameOf(r.route.a)} ⇄ ${nameOf(r.route.b)}` : `${good} → ${nameOf(r.to)}`;
  const sub = r.route ? `${fmt(r.rate)} t/min` : [reg(r.to), `${fmt(r.rate)} t/min`, r.from && r.state !== "build" ? t("fromIsl", { island: nameOf(r.from), region: reg(r.from) }) : ""].filter(Boolean).join(" · ");
  const S: Record<Recommendation["state"], { label: string; cls: string; why: string; action?: string }> = {
    "no-route": { label: t("stNoRoute"), cls: "none", why: t("whyNoRoute", { from: nameOf(r.from ?? ""), n: fmt(r.offer ?? 0), to: nameOf(r.to) }), action: t("doPrepare") },
    assign: { label: t("stAssign"), cls: "assigned", why: t("whyAssign", { from: nameOf(r.from ?? ""), n: fmt(r.offer ?? 0) }), action: t("doAssign") },
    short: { label: t("stShort"), cls: "warn", why: r.route?.missing ? t("whyShortShips", { n: r.route.missing }) : t("whyShortCargo"), action: t("doAdjust") },
    unchecked: { label: t("stUnchecked"), cls: "unk", why: t("whyUnchecked"), action: t("doComplete") },
    build: { label: t("stBuild"), cls: "build", why: r.build ? t("whyBuild", { island: nameOf(r.build.island), k: r.build.count, name: (r.build.count === 1 ? buildings[r.build.building].name : buildings[r.build.building].plural)[lang].toLowerCase() }) : "", action: r.build ? t("doBuild", { island: nameOf(r.build.island) }) : undefined },
    "no-provider": { label: t("stNoProvider"), cls: "build", why: makers.length ? t("whyNoIslandThere", { region: makers.map((x) => regionName(x, lang)).join(", ") }) : t("whyNoProvider"), action: t("doHouses") },
  };
  const s = S[r.state];
  return (
    <li className="rec">
      <div className="rhead">{r.route ? <Ico name="ship" size={30} /> : <ProductIcon product={r.product} fallback="ship" size={34} />}<div><b>{title}</b><small>{sub}</small></div></div>
      <span className={`state ${s.cls}`}>{s.label}</span>
      <p>{s.why}</p>
      {s.action && <button type="button" className="primary" onClick={onAct}>{s.action}</button>}
    </li>
  );
}

/**
 * Mapa comercial: una moneda por región y, para cada sentido, un carril recto con su flecha.
 * Cada sentido va a la derecha de su marcha, así ida y vuelta nunca se pisan. El número del carril
 * es el de la lista de debajo, donde están las cifras: el mapa solo enseña quién envía a quién.
 */
function EmpireMap() {
  const { empire, lang, t } = useApp();
  const regs = empire.regions;
  const POS: Record<string, [number, number]> = { Latium: [62, 58], Albion: [278, 58], Aegyptus: [170, 178] };
  const R = 30, LANE = 7;
  return (
    <figure className="emap-wrap">
      <svg className="emap" viewBox="0 0 340 222" role="img" aria-label={t("mapAria")}>
        <defs>
          <marker id="em-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--bronze)" /></marker>
          <marker id="em-w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--danger)" /></marker>
        </defs>
        {empire.pairs.map((p, n) => {
          const a = POS[p.from], b = POS[p.to];
          if (!a || !b) return null;
          const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
          const ux = dx / d, uy = dy / d, nx = -uy, ny = ux; // derecha de la marcha
          const x1 = a[0] + ux * (R + 6) + nx * LANE, y1 = a[1] + uy * (R + 6) + ny * LANE;
          const x2 = b[0] - ux * (R + 8) + nx * LANE, y2 = b[1] - uy * (R + 8) + ny * LANE;
          const bx = (x1 + x2) / 2 + nx * 13, by = (y1 + y2) / 2 + ny * 13;
          const none = p.rate <= 0;
          return (
            <g key={`${p.from}>${p.to}`} className={none ? "lane none" : "lane"}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={none ? "5 5" : undefined} markerEnd={`url(#${none ? "em-w" : "em-a"})`} />
              <circle cx={bx} cy={by} r="10" className="badge" />
              <text x={bx} y={by + 4} textAnchor="middle" className="bn">{n + 1}</text>
            </g>
          );
        })}
        {regs.map((r) => POS[r] && (
          <g key={r} transform={`translate(${POS[r][0]} ${POS[r][1]})`}>
            <circle r={R} className={`mc ${r.toLowerCase()}`} />
            <text y="4" textAnchor="middle" className="mr">{regionName(r, lang)}</text>
          </g>
        ))}
      </svg>
      <figcaption className="emap-legend">
        <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--bronze)" strokeWidth="2.5" /></svg>{t("legendShip")}</span>
        <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--danger)" strokeWidth="2" strokeDasharray="5 4" /></svg>{t("legendNone")}</span>
      </figcaption>
    </figure>
  );
}
