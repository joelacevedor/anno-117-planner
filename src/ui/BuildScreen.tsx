import { useState } from "react";
import { buildings, categoryName, categoryOrder, chainById, chainForProduct, productName, providerOf, type Category } from "../data/catalog";
import { perMinute, type Row } from "../core/plan";
import { list, nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon } from "./Emblems";
import { ChipFilter, FilterTabs, PageHero, SearchBar, SupplyPicker, Tick, UiIcon } from "./parts";
import { totalPct } from "../core/boosts";
import { isShort, r1 } from "../core/chainRates";

type View = "missing" | "chain" | "all";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Obra: el registro principal de lo construido. Filtros (pendiente, por cadena, todo), búsqueda,
 * filtro por categoría y registro múltiple (marcar varios edificios de una vez).
 * Usa la misma lógica que Cadenas: lo que se registra aquí es lo que ve el planificador.
 */
export function BuildScreen() {
  const { state, island, plan, rates, imports, inbound, outbound, t, lang, go, setBuilt, setBuiltMany, boosts } = useApp();
  const [view, setView] = useState<View>("missing");
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Registro múltiple: edificio → cuántos se añaden. */
  const [batch, setBatch] = useState<Record<string, number> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const lower = (s: string) => s.toLowerCase();
  const islandName = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";

  if (plan.chains.length === 0 && plan.rows.length === 0 && outbound.length === 0)
    return (
      <div className="build-screen">
        <PageHero title={t("tabBuild")} island={island.name} sub={t("buildHeroSub")} icon={<UiIcon name="hammer" size={32} />} />
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

  // Mismo criterio que Cadenas: déficit = producción por debajo de la demanda (sin los aceptados).
  const rateOf = (id: string) => rates.find((r) => r.chainId === id);
  const chainShort = (s: (typeof plan.chains)[number]) => { const r = rateOf(s.chainId); return !!r && isShort(r); };
  const short = plan.chains.filter(chainShort);
  const fine = plan.chains.filter((s) => !chainShort(s));
  const totalMissing = plan.toBuild.reduce((a, x) => a + x.count, 0);
  const totalBuilt = plan.rows.reduce((a, r) => a + r.built, 0);
  const shortChains = rates.filter(isShort).length;

  /** Cadena principal de un edificio (la que más lo usa, o la que lo tiene como final). */
  const mainChain = (r: Row) => Object.entries(r.byChain).sort((a, b) => b[1] - a[1])[0]?.[0] ?? chainForProduct(island.region, buildings[r.id].productId)?.id;
  const categoryOf = (r: Row): Category | undefined => { const c = mainChain(r); return c ? chainById[c]?.category : undefined; };

  const query = norm(q.trim());
  const matches = (r: Row) => {
    if (cats.length) { const c = categoryOf(r); if (!c || !cats.includes(c)) return false; }
    if (!query) return true;
    const b = buildings[r.id];
    const chainsUsing = Object.keys(r.byChain).map((c) => chainById[c]?.product[lang] ?? "");
    return [b.name[lang], b.good[lang], ...chainsUsing].some((x) => norm(x).includes(query));
  };
  const rows = plan.rows.filter(matches).filter((r) => view !== "missing" || r.missing > 0);
  const catCounts = Object.fromEntries(categoryOrder.map((c) => [c, plan.rows.filter((r) => categoryOf(r) === c).length]));

  const startBatch = () => setBatch(Object.fromEntries(rows.filter((r) => r.missing > 0).map((r) => [r.id, r.missing])));
  const batchTotal = batch ? Object.values(batch).reduce((a, n) => a + n, 0) : 0;
  const applyBatch = () => {
    if (!batch) return;
    const add = Object.fromEntries(Object.entries(batch).filter(([, n]) => n > 0).map(([id, n]) => [id, (island.built[id] ?? 0) + n]));
    setBuiltMany(add);
    setDone(t("batchDone", { n: batchTotal }));
    setBatch(null);
  };

  const row = (r: Row) => {
    const b = buildings[r.id];
    const users = Object.entries(r.byChain).filter(([, n]) => n > 0).map(([c]) => chainById[c].product[lang]);
    const pct = r.recommended ? Math.min(100, (r.built / r.recommended) * 100) : 100;
    const sel = batch ? batch[r.id] ?? 0 : 0;
    return (
      <li key={r.id} className={`brow ${r.missing > 0 ? "short" : "ok"}${batch && sel > 0 ? " picked" : ""}`}>
        <ProductIcon product={b.productId} fallback={b.glyph} size={34} />
        <div className="brow-main">
          <b>{b.name[lang]}{totalPct(boosts[r.id]) !== 100 && <span className="pct">{totalPct(boosts[r.id])} %</span>}</b>
          <small>{users.length ? list(users, lang) : t("noLongerNeeded")}</small>
          <span className="brow-meta">
            {r.missing > 0 && <span className="missing-pill">{t("missingN", { n: r.missing })}</span>}
            <span className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
          </span>
        </div>
        <div className="brow-count" aria-label={t("builtOf", { b: r.built, n: r.recommended })}>
          <Tick value={r.built} /><span>/{r.recommended}</span>
        </div>
        {batch ? (
          <div className="mini batch" aria-label={t("batchAdd", { name: b.name[lang] })}>
            <button type="button" onClick={() => setBatch({ ...batch, [r.id]: Math.max(0, sel - 1) })} disabled={sel === 0} aria-label={t("batchLess", { name: b.name[lang] })}>−</button>
            <span className="batch-n">+{sel}</span>
            <button type="button" onClick={() => setBatch({ ...batch, [r.id]: Math.min(99, sel + 1) })} aria-label={t("batchMore", { name: b.name[lang] })}>+</button>
          </div>
        ) : (
          <div className="mini">
            <button type="button" onClick={() => setBuilt(r.id, r.built - 1)} disabled={r.built === 0} aria-label={t("builtLess", { name: b.name[lang] })}>−</button>
            <button type="button" onClick={() => setBuilt(r.id, r.built + 1)} aria-label={t("builtMore", { name: b.name[lang] })}>+</button>
          </div>
        )}
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
    const rt = rateOf(s.chainId);
    const ok = !chainShort(s);
    const why = rt?.accepted ? t("acceptedPill")
      : ok ? (rt && rt.toBuild > 0 ? t(rt.toBuild === 1 ? "pendingN1" : "pendingN", { n: rt.toBuild }) : t("goalOk"))
      : rt?.limitedBy ? t("goalLacks", { good: lower(buildings[rt.limitedBy].good[lang]) })
      : t("goalBuildMore", { n: Math.max(1, s.finals - s.builtFinals), unit: lower((s.finals - s.builtFinals === 1 ? root.name : root.plural)[lang]) });
    const sources = [
      s.goal ? (island.targets?.[s.chainId] ? t("srcTarget", { x: nice(island.targets[s.chainId], lang) }) : t("srcManual", { n: s.goal })) : "",
      s.fromHouses > 0 ? t("srcHouses", { x: nice(s.fromHouses, lang) }) : "",
      s.fromTrade > 0 ? t("srcTrade", { x: nice(s.fromTrade, lang) }) : "",
      s.imported > 0 ? t("srcImported", { x: nice(Math.round(s.imported * 10) / 10, lang) }) : "",
    ].filter(Boolean).join(" · ");
    return (
      <li key={c.id}>
        <button type="button" className={`grow ${ok ? "ok" : "short"}${rt?.accepted ? " accepted" : ""}`} onClick={() => go({ tab: "chains", chain: c.id })}>
          <ProductIcon product={root.productId} fallback={root.glyph} size={36} />
          <span className="grow-main">
            <b>{c.product[lang]}</b>
            <small>{s.finals === 0 && s.imported > 0 ? t("goalAllImported") : <>{rt ? t("rateOf", { p: nice(r1(rt.production), lang), d: nice(r1(rt.demand), lang) }) : t("goalStatus", { r: s.running, n: s.finals })} · {why}</>}</small>
            {sources && <small className="src">{sources}</small>}
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </button>
      </li>
    );
  };

  return (
    <div className={`build-screen${batch ? " batching" : ""}`}>
      <PageHero title={t("tabBuild")} island={island.name} sub={t("buildHeroSub")} icon={<UiIcon name="hammer" size={32} />} />

      <div className="stat-tiles" role="status" aria-live="polite">
        <button type="button" className={`stat-tile${totalMissing ? " warn" : " ok"}`} onClick={() => setView("missing")}>
          <span>{t("statToBuild")}</span><b><Tick value={totalMissing} /></b><small>{t("statBuildings")}</small>
        </button>
        <button type="button" className={`stat-tile${shortChains ? " danger" : " ok"}`} onClick={() => go({ tab: "chains" })}>
          <span>{t("statShortChains")}</span><b>{shortChains}</b><small>{t("statOf", { n: rates.length })}</small>
        </button>
        <button type="button" className="stat-tile" onClick={() => setView("all")}>
          <span>{t("statBuilt")}</span><b>{totalBuilt}</b><small>{t("statBuildings")}</small>
        </button>
      </div>
      {plan.toBuild.length === 0 && <p className="all-set">{t("suppliedAll")}</p>}
      {done && <p className="msg" role="status">{done} <button type="button" className="link" onClick={() => setDone(null)}>{t("close")}</button></p>}

      {plan.rows.length > 0 && (
        <section aria-labelledby="bld-t" className="island-buildings">
          <h2 id="bld-t" className="sr">{t("islandBuildings")}</h2>
          <FilterTabs<View> label={t("islandBuildings")} value={view} onChange={setView}
            options={[{ v: "missing", text: t("filterPending"), n: plan.toBuild.length, tone: plan.toBuild.length ? "warn" : "ok" }, { v: "chain", text: t("viewChain") }, { v: "all", text: t("viewAll"), n: plan.rows.length }]} />
          <SearchBar id="bld-search" value={q} onChange={setQ} placeholder={t("searchBuildings")} label={t("search")}
            filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(!filtersOpen)} filtersLabel={t("filterCategories")} active={cats.length > 0} />
          {filtersOpen && (
            <ChipFilter<Category> label={t("filterCategories")} allText={t("filterAllCats")} value={cats} onChange={setCats}
              options={categoryOrder.filter((c) => catCounts[c] > 0).map((c) => ({ v: c, text: categoryName[c][lang], n: catCounts[c] }))} />
          )}
          <div className="batch-bar">
            {batch ? (
              <>
                <span>{t("batchHelp")}</span>
                <button type="button" className="link" onClick={() => setBatch(null)}>{t("cancel")}</button>
              </>
            ) : (
              rows.some((r) => r.missing > 0) && <button type="button" className="ghost-btn" onClick={startBatch}><UiIcon name="list" size={18} /> {t("batchStart")}</button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="fine">{view === "missing" && !query && !cats.length ? t("nothingMissing") : t("noResults")}</p>
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

      {(imports.length > 0 || inbound.length > 0 || outbound.length > 0 || Object.keys(plan.unsupplied).length > 0) && (
        <section className="trade card" aria-labelledby="trade-t">
          <h2 id="trade-t" className="section-t">{t("tradeTitle")}</h2>
          {imports.length > 0 && (
            <div className="trade-block">
              <p className="import-note">{t("needsSource")}</p>
              <ul className="trade-list">
                {imports.map((x) => (
                  <li key={x.product}>
                    <ProductIcon product={x.product} fallback="ship" size={28} />
                    <b>{productName(x.product)[lang]}</b>
                    <SupplyPicker product={x.product} compact local={false} />
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
                {[...new Set(inbound.map((f) => f.product))].map((product) => {
                  const from = inbound.filter((f) => f.product === product);
                  return (
                    <li key={product}>
                      <ProductIcon product={product} fallback="ship" size={28} />
                      <b><span className="arrow-in" aria-hidden="true">↓ </span>{productName(product)[lang]}</b>
                      <small>{from.map((f) => `${t("fromIsland", { island: islandName(f.from) })} · ${nice(Math.round(f.rate * 10) / 10, lang)}/min`).join(" · ")}</small>
                      <SupplyPicker product={product} compact local={!!providerOf(island.region, product)} />
                    </li>
                  );
                })}
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
                      <ProductIcon product={f.product} fallback="ship" size={28} />
                      <b><span className="arrow-out" aria-hidden="true">↑ </span>{productName(f.product)[lang]}</b>
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

      {batch && (
        <div className="batch-footer">
          <button type="button" className="primary" disabled={batchTotal === 0} onClick={applyBatch}>
            {t("batchApply", { n: batchTotal })}
          </button>
        </div>
      )}
    </div>
  );
}
