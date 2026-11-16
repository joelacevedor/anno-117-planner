import { useMemo, useRef, useState } from "react";
import { buildings, categoryName, categoryOrder, chainById, chains, type Category, type Chain } from "../data/catalog";
import { perFinal } from "../core/plan";
import { r1, type ChainRate } from "../core/chainRates";
import { nice } from "../i18n";
import { useApp } from "./context";
import { ProductIcon } from "./Emblems";
import { InstallCard } from "./Install";
import { ChipFilter, CoverBar, FilterTabs, PageHero, SearchBar, UiIcon } from "./parts";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
type Tab = "all" | "short" | "ok";

/**
 * Cadenas: el planificador. Arriba, las cadenas que esta isla produce o necesita, con su cobertura
 * (producción / demanda en t/min). Abajo, todas las cadenas de la región para planificar una nueva.
 */
export function ChainsScreen() {
  const { island, rates, t, lang, go } = useApp();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [cats, setCats] = useState<Category[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const catalogRef = useRef<HTMLElement>(null);
  const [hideInstall, setHideInstall] = useState(() => { try { return localStorage.getItem("anno117-install-dismissed") === "1"; } catch { return false; } });

  const mine = useMemo(() => chains.filter((c) => c.region === island.region), [island.region]);
  const query = norm(q.trim());
  const match = (c: Chain) => {
    if (cats.length && !cats.includes(c.category)) return false;
    if (!query) return true;
    const ids = Object.keys(perFinal(c));
    return [c.product.es, c.product.en, ...ids.flatMap((id) => [buildings[id].name.es, buildings[id].name.en])].some((s) => norm(s).includes(query));
  };

  const shortN = rates.filter((r) => r.state === "short").length;
  const okN = rates.filter((r) => r.state !== "short").length;
  // Primero lo que falta (más déficit primero), luego lo cubierto y lo que sobra.
  const order = (a: ChainRate, b: ChainRate) =>
    (a.state === "short" ? 0 : 1) - (b.state === "short" ? 0 : 1) || a.coverage - b.coverage || chainById[a.chainId].product[lang].localeCompare(chainById[b.chainId].product[lang]);
  const listed = rates
    .filter((r) => (tab === "all" ? true : tab === "short" ? r.state === "short" : r.state !== "short"))
    .filter((r) => match(chainById[r.chainId]))
    .sort(order);
  const catalog = mine.filter(match);
  const catCounts = Object.fromEntries(categoryOrder.map((c) => [c, mine.filter((x) => x.category === c).length]));

  const row = (r: ChainRate, i: number) => {
    const c = chainById[r.chainId];
    const root = buildings[c.root];
    const pct = Math.round(r.coverage * 100);
    return (
      <li key={c.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
        <button type="button" className={`rate-row ${r.state}`} onClick={() => go({ tab: "chains", chain: c.id })}>
          <ProductIcon product={root.productId} fallback={root.glyph} size={44} />
          <span className="rate-main">
            <span className="rate-top">
              <b>{c.product[lang]}</b>
              <span className="rate-nums">
                {r.state === "spare"
                  ? t("rateNoDemand", { p: nice(r1(r.production), lang) })
                  : t("rateOf", { p: nice(r1(r.production), lang), d: nice(r1(r.demand), lang) })}
              </span>
            </span>
            <span className="rate-bottom">
              <CoverBar value={r.coverage} tone={r.state} />
              {r.state !== "spare" && <span className={`pct-pill ${r.state}`}>{pct} %</span>}
            </span>
            {(r.toBuild > 0 || (r.limitedBy && r.deficit > 0) || r.surplus > 0.05) && (
              <small className="rate-note">
                {r.toBuild > 0 ? t("toBuildN", { n: r.toBuild })
                  : r.limitedBy && r.deficit > 0 ? t("goalLacks", { good: buildings[r.limitedBy].good[lang].toLowerCase() })
                  : t("surplusShort", { x: nice(r1(r.surplus), lang) })}
              </small>
            )}
          </span>
          {r.state === "ok" ? <span className="rate-ok" aria-label={t("goalOk")}><UiIcon name="check" size={16} /></span> : <span className="chev" aria-hidden="true"><UiIcon name="chev" size={18} /></span>}
        </button>
      </li>
    );
  };

  const card = (c: Chain, i: number) => {
    const root = buildings[c.root];
    const r = rates.find((x) => x.chainId === c.id);
    return (
      <button type="button" key={c.id} className={`chain-card ${r?.state ?? ""}`} style={{ ["--i" as string]: Math.min(i, 12) }} onClick={() => go({ tab: "chains", chain: c.id })}>
        <span className="chain-card-top"><ProductIcon product={root.productId} fallback={root.glyph} size={44} /></span>
        <span className="chain-card-name">{c.product[lang]}</span>
        <span className="chain-card-kind">{t("buildingsCount", { n: Object.keys(perFinal(c)).length })}</span>
        {r && r.state !== "spare" && <span className="chain-card-status">{Math.round(r.coverage * 100)} %</span>}
      </button>
    );
  };

  return (
    <div className="chains-screen">
      <PageHero title={t("tabChains")} island={island.name} sub={t("chainsHeroSub")} icon={<UiIcon name="laurel" size={34} />} />
      {!hideInstall && (
        <InstallCard compact onClose={() => { setHideInstall(true); try { localStorage.setItem("anno117-install-dismissed", "1"); } catch { /* opcional */ } }} />
      )}

      {rates.length > 0 && (
        <FilterTabs<Tab> label={t("chainsFilter")} value={tab} onChange={setTab}
          options={[{ v: "all", text: t("filterAll") }, { v: "short", text: t("filterShort"), n: shortN, tone: "danger" }, { v: "ok", text: t("filterCovered"), n: okN, tone: "ok" }]} />
      )}
      <SearchBar id="chain-search" value={q} onChange={setQ} placeholder={t("searchProductPh")} label={t("search")}
        filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(!filtersOpen)} filtersLabel={t("filterCategories")} active={cats.length > 0} />
      {filtersOpen && (
        <ChipFilter<Category> label={t("filterCategories")} allText={t("filterAllCats")} value={cats} onChange={setCats}
          options={categoryOrder.filter((c) => catCounts[c] > 0).map((c) => ({ v: c, text: categoryName[c][lang], n: catCounts[c] }))} />
      )}

      {rates.length > 0 && (
        listed.length ? <ul className="rate-list">{listed.map(row)}</ul>
          : <p className="fine empty-line">{tab === "short" && !query && !cats.length ? t("noShortChains") : t("noResults")}</p>
      )}

      <button type="button" className="primary cta" onClick={() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <UiIcon name="plus" /> {t("planChain")}
      </button>

      <section ref={catalogRef} className="catalog" aria-labelledby="catalog-t">
        <h2 id="catalog-t" className="section-t">{t("allChainsOf", { region: island.region, n: catalog.length })}</h2>
        {categoryOrder.map((cat) => {
          const list = catalog.filter((c) => c.category === cat);
          if (!list.length) return null;
          const grid = <div className="chain-grid">{list.map(card)}</div>;
          return (cat === "Intermediate" || cat === "Raw") && !query && !cats.includes(cat) ? (
            <details key={cat} className="cat more">
              <summary>{categoryName[cat][lang]} <span>({list.length})</span></summary>
              {grid}
            </details>
          ) : (
            <section key={cat} className="cat">
              <h3 className="cat-t">{categoryName[cat][lang]}</h3>
              {grid}
            </section>
          );
        })}
        {catalog.length === 0 && <p className="fine">{t("noResults")}</p>}
      </section>
      <p className="fine">{t("otherRegionHint", { region: island.region === "Albion" ? "Latium" : "Albion" })}</p>
    </div>
  );
}
