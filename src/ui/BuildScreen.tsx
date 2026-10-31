import { useState } from "react";
import { buildings, chainById, chainForProduct, productName } from "../data/catalog";
import { perMinute, type Row } from "../core/plan";
import { list, nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { Segmented, SupplyPicker, Tick } from "./parts";
import { totalPct } from "../core/boosts";

type View = "missing" | "chain" | "all";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const HERO_MAX = 8;

export function BuildScreen() {
  const { state, island, plan, imports, inbound, outbound, t, lang, go, setBuilt, boosts } = useApp();
  const [view, setView] = useState<View>("missing");
  const [q, setQ] = useState("");
  const [heroAll, setHeroAll] = useState(false);
  const lower = (s: string) => s.toLowerCase();
  const islandName = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";

  if (plan.chains.length === 0 && plan.rows.length === 0 && outbound.length === 0)
    return (
      <div className="build-screen">
        <header className="screen-head"><h1>{t("buildTitle")}</h1></header>
        <div className="empty card">
          <Glyph name="hammer" size={48} />
          <p>{t("buildEmpty")}</p>
          <div className="row-actions wrap center">
            <button type="button" className="primary" onClick={() => go({ tab: "chains" })}>{t("buildEmptyCta")}</button>
            <button type="button" onClick={() => go({ tab: "houses" })}>{t("buildEmptyHouses")}</button>
          </div>
        </div>
      </div>
    );

  const isShort = (s: (typeof plan.chains)[number]) => !!s.bottleneck || s.running < s.finals;
  const short = plan.chains.filter(isShort);
  const fine = plan.chains.filter((s) => !isShort(s));
  const totalMissing = plan.toBuild.reduce((a, x) => a + x.count, 0);
  const heroItems = heroAll ? plan.toBuild : plan.toBuild.slice(0, HERO_MAX);

  const query = norm(q.trim());
  const matches = (r: Row) => !query || norm(buildings[r.id].name[lang]).includes(query) || norm(buildings[r.id].good[lang]).includes(query);
  const rows = plan.rows.filter(matches).filter((r) => view !== "missing" || r.missing > 0);

  const row = (r: Row) => {
    const b = buildings[r.id];
    const users = Object.entries(r.byChain).filter(([, n]) => n > 0).map(([c]) => chainById[c].product[lang]);
    const pct = r.recommended ? Math.min(100, (r.built / r.recommended) * 100) : 100;
    return (
      <li key={r.id} className={`brow ${r.missing > 0 ? "short" : "ok"}`}>
        <Glyph name={b.glyph} size={26} />
        <div className="brow-main">
          <b>{b.name[lang]}{totalPct(boosts[r.id]) !== 100 && <span className="pct">{totalPct(boosts[r.id])} %</span>}</b>
          <small>{users.length ? list(users, lang) : t("noLongerNeeded")}</small>
          <span className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        </div>
        <div className="brow-count" aria-label={t("builtOf", { b: r.built, n: r.recommended })}>
          <Tick value={r.built} /><span>/{r.recommended}</span>
        </div>
        <div className="mini">
          <button type="button" onClick={() => setBuilt(r.id, r.built - 1)} disabled={r.built === 0} aria-label={t("builtLess", { name: b.name[lang] })}>−</button>
          <button type="button" onClick={() => setBuilt(r.id, r.built + 1)} aria-label={t("builtMore", { name: b.name[lang] })}>+</button>
        </div>
      </li>
    );
  };

  // Vista por cadena: cada edificio aparece en la cadena que más lo usa.
  const byChainGroups = () => {
    const groups: Record<string, Row[]> = {};
    for (const r of rows) {
      const main = Object.entries(r.byChain).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "_";
      (groups[main] ??= []).push(r);
    }
    return Object.entries(groups);
  };

  const goalRow = (s: (typeof plan.chains)[number]) => {
    const c = chainById[s.chainId];
    const root = buildings[c.root];
    const ok = !isShort(s);
    const why = s.bottleneck
      ? t("goalLacks", { good: lower(buildings[s.bottleneck].good[lang]) })
      : ok ? t("goalOk")
      : t("goalBuildMore", { n: s.finals - s.builtFinals, unit: lower((s.finals - s.builtFinals === 1 ? root.name : root.plural)[lang]) });
    const sources = [
      s.goal ? t("srcManual", { n: s.goal }) : "",
      s.fromHouses > 0 ? t("srcHouses", { x: nice(s.fromHouses, lang) }) : "",
      s.fromTrade > 0 ? t("srcTrade", { x: nice(s.fromTrade, lang) }) : "",
    ].filter(Boolean).join(" · ");
    return (
      <li key={c.id}>
        <button type="button" className={`grow ${ok ? "ok" : "short"}`} onClick={() => go({ tab: "chains", chain: c.id })}>
          <Glyph name={root.glyph} size={26} />
          <span className="grow-main">
            <b>{c.product[lang]}</b>
            <small>{t("goalStatus", { r: s.running, n: s.finals })} · {why}</small>
            {sources && <small className="src">{sources}</small>}
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      </li>
    );
  };

  return (
    <div className="build-screen">
      <header className="screen-head">
        <span className="eyebrow">{island.region}</span>
        <h1>{island.name}</h1>
      </header>

      <section className={`hero card${plan.complete ? " done" : ""}`} role="status" aria-live="polite">
        {plan.toBuild.length === 0 ? (
          <>
            <h2>{t("allSetSub")}</h2>
            <p className="hero-sub">{t("suppliedAll")}</p>
          </>
        ) : (
          <>
            <h2>{t("build")} <span className="hero-n">{t("buildingsCount", { n: totalMissing })}</span></h2>
            <ul className="todo">
              {heroItems.map((x) => {
                const b = buildings[x.id];
                return (
                  <li key={x.id}>
                    <Glyph name={b.glyph} size={22} />
                    <b><Tick value={x.count} /></b>
                    <span>{(x.count === 1 ? b.name : b.plural)[lang]}</span>
                  </li>
                );
              })}
            </ul>
            {plan.toBuild.length > HERO_MAX && (
              <button type="button" className="link" onClick={() => setHeroAll(!heroAll)}>
                {heroAll ? t("showLess") : t("showMoreN", { n: plan.toBuild.length - HERO_MAX })}
              </button>
            )}
          </>
        )}
      </section>

      {(imports.length > 0 || inbound.length > 0 || outbound.length > 0 || Object.keys(plan.unsupplied).length > 0) && (
        <section className="trade card" aria-labelledby="trade-t">
          <h2 id="trade-t" className="section-t">{t("tradeTitle")}</h2>
          {imports.length > 0 && (
            <div className="trade-block">
              <p className="import-note">{t("needsSource")}</p>
              <ul className="trade-list">
                {imports.map((x) => (
                  <li key={x.product}>
                    <span className="ship"><Glyph name="ship" size={22} /></span>
                    <b>{productName(x.product)[lang]}</b>
                    <SupplyPicker product={x.product} compact />
                  </li>
                ))}
              </ul>
              {state.islands.length < 2 && <p className="fine">{t("addIslandForTrade")}</p>}
            </div>
          )}
          {inbound.length > 0 && (
            <div className="trade-block">
              <h3>{t("receives")}</h3>
              <ul className="trade-list">
                {inbound.map((f) => (
                  <li key={f.product + f.from}>
                    <span className="arrow-in" aria-hidden="true">↓</span>
                    <b>{productName(f.product)[lang]}</b>
                    <small>{t("fromIsland", { island: islandName(f.from) })} · {nice(Math.round(f.rate * 10) / 10, lang)}/min</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outbound.length > 0 && (
            <div className="trade-block">
              <h3>{t("sends")}</h3>
              <ul className="trade-list">
                {outbound.map((f) => {
                  const c = chainForProduct(island.region, f.product);
                  const eq = c ? f.rate / (perMinute(buildings[c.root]) * (totalPct(boosts[c.root]) / 100)) : 0;
                  return (
                    <li key={f.product + f.to}>
                      <span className="arrow-out" aria-hidden="true">↑</span>
                      <b>{productName(f.product)[lang]}</b>
                      <small>
                        {t("toIsland", { island: islandName(f.to) })} · {nice(Math.round(f.rate * 10) / 10, lang)}/min
                        {c ? ` · ${t("equalsBuildings", { x: nice(Math.round(eq * 10) / 10, lang), name: lower(buildings[c.root].plural[lang]) })}` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {Object.keys(plan.unsupplied).length > 0 && (
            <p className="import-note">{t("cantProduce", { list: Object.keys(plan.unsupplied).map((p) => productName(p)[lang]).join(", ") })}</p>
          )}
        </section>
      )}

      {plan.chains.length > 0 && (
        <details className="fold goals-fold goals" open={plan.chains.length <= 4}>
          <summary>
            {t("goals")} ({plan.chains.length})
            {short.length > 0 && <small>{t("shortN", { n: short.length })}</small>}
          </summary>
          <ul className="glist">{[...short, ...fine].map(goalRow)}</ul>
        </details>
      )}

      {plan.rows.length > 0 && (
        <section aria-labelledby="bld-t" className="island-buildings">
          <div className="bld-head">
            <h2 id="bld-t" className="section-t">{t("islandBuildings")}</h2>
            <Segmented<View> label={t("islandBuildings")} value={view} onChange={setView}
              options={[["missing", t("viewMissing", { n: plan.toBuild.length })], ["chain", t("viewChain")], ["all", t("viewAll")]]} />
            {plan.rows.length > 8 && (
              <>
                <label htmlFor="bld-search" className="sr">{t("search")}</label>
                <input id="bld-search" type="search" placeholder={t("searchBuildings")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              </>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="fine">{view === "missing" && !query ? t("nothingMissing") : t("noResults")}</p>
          ) : view === "chain" ? (
            byChainGroups().map(([cid, rs]) => (
              <div key={cid} className="bgroup">
                <h3>{chainById[cid]?.product[lang] ?? t("noLongerNeeded")}</h3>
                <ul className="blist">{rs.map(row)}</ul>
              </div>
            ))
          ) : (
            <ul className="blist">{rows.map(row)}</ul>
          )}
        </section>
      )}
    </div>
  );
}
