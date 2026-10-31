import { useState } from "react";
import { buildings, categoryName, categoryOrder, chains, type Chain } from "../data/catalog";
import { perFinal } from "../core/plan";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { InstallCard } from "./Install";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ChainsScreen() {
  const { island, plan, t, lang, go } = useApp();
  const [q, setQ] = useState("");
  const [hideInstall, setHideInstall] = useState(() => { try { return localStorage.getItem("anno117-install-dismissed") === "1"; } catch { return false; } });
  const mine = chains.filter((c) => c.region === island.region);
  const query = norm(q.trim());
  const match = (c: Chain) => {
    if (!query) return true;
    const ids = Object.keys(perFinal(c));
    return [c.product.es, c.product.en, ...ids.flatMap((id) => [buildings[id].name.es, buildings[id].name.en])].some((s) => norm(s).includes(query));
  };
  const visible = mine.filter(match);
  const activeIds = new Set(plan.chains.map((s) => s.chainId));
  const active = visible.filter((c) => activeIds.has(c.id));

  const card = (c: Chain, i: number) => {
    const ids = Object.keys(perFinal(c));
    const root = buildings[c.root];
    const s = plan.chains.find((x) => x.chainId === c.id);
    const missing = ids.reduce((sum, id) => sum + (plan.byId[id]?.missing ?? 0), 0);
    const state = !s ? "" : missing > 0 ? "short" : "ok";
    return (
      <button type="button" key={c.id} className={`chain-card ${state}`} style={{ ["--i" as string]: Math.min(i, 12) }} onClick={() => go({ tab: "chains", chain: c.id })}>
        <span className="chain-card-top">
          <Glyph name={root.glyph} size={36} />
          {s && <span className="badge">×{s.finals} <span className="dot" aria-hidden="true" /></span>}
        </span>
        <span className="chain-card-name">{c.product[lang]}</span>
        <span className="chain-card-kind">{t("buildingsCount", { n: ids.length })}</span>
        {s && <span className="chain-card-status">{missing > 0 ? t("toBuildN", { n: missing }) : t("goalOk")}</span>}
      </button>
    );
  };

  return (
    <div className="chains-screen">
      <header className="screen-head">
        <h1>{t("chainsTitle")}</h1>
        <p>{t("chainsSub", { region: island.region, n: mine.length })}</p>
      </header>
      {!hideInstall && (
        <InstallCard compact onClose={() => { setHideInstall(true); try { localStorage.setItem("anno117-install-dismissed", "1"); } catch { /* opcional */ } }} />
      )}
      <div className="search">
        <label htmlFor="chain-search" className="sr">{t("search")}</label>
        <input id="chain-search" type="search" placeholder={t("searchPh")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {active.length > 0 && !query && (
        <section className="cat">
          <h2 className="section-t">{t("inYourPlan")}</h2>
          <div className="chain-grid">{active.map(card)}</div>
        </section>
      )}
      {categoryOrder.map((cat) => {
        const list = visible.filter((c) => c.category === cat);
        if (!list.length) return null;
        const grid = <div className="chain-grid">{list.map(card)}</div>;
        return (cat === "Intermediate" || cat === "Raw") && !query ? (
          <details key={cat} className="cat more">
            <summary>{categoryName[cat][lang]} <span>({list.length})</span></summary>
            {grid}
          </details>
        ) : (
          <section key={cat} className="cat">
            <h2 className="section-t">{categoryName[cat][lang]}</h2>
            {grid}
          </section>
        );
      })}
      {visible.length === 0 && <p className="fine">{t("noResults")}</p>}
      <p className="fine">{t("otherRegionHint", { region: island.region === "Albion" ? "Latium" : "Albion" })}</p>
    </div>
  );
}
