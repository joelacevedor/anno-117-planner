import { useState } from "react";
import { alternativesOf, buildings, categoryName, categoryOrder, chains, type Chain } from "../data/catalog";
import { perFinal } from "../core/plan";
import { nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon } from "./Emblems";
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
  // Tres grupos claros: lo que necesitas y te falta, lo que necesitas y está al día,
  // y lo que tienes construido aunque ya no lo necesites. El resto, por categorías.
  const missingOf = (c: Chain) => Object.keys(perFinal(c)).reduce((sum, id) => sum + (plan.byId[id]?.missing ?? 0), 0);
  const statusOf = (c: Chain): "short" | "ok" | "spare" | "" => {
    const st = plan.chains.find((x) => x.chainId === c.id);
    if (st) return missingOf(c) > 0 ? "short" : "ok";
    // Solo el edificio final (o su alternativa), y solo si ninguna otra cadena lo usa como proveedor.
    return alternativesOf(c.region, buildings[c.root].productId).some((id) => (island.built[id] ?? 0) > 0 && !(plan.byId[id]?.recommended))
      ? "spare" : "";
  };
  const status = new Map(visible.map((c) => [c.id, statusOf(c)]));
  const group = (k: string) => visible.filter((c) => status.get(c.id) === k);
  const short = group("short"), ok = group("ok"), spare = group("spare");

  const card = (c: Chain, i: number) => {
    const ids = Object.keys(perFinal(c));
    const root = buildings[c.root];
    const s = plan.chains.find((x) => x.chainId === c.id);
    const missing = missingOf(c);
    const state = status.get(c.id) ?? "";
    return (
      <button type="button" key={c.id} className={`chain-card ${state}`} style={{ ["--i" as string]: Math.min(i, 12) }} onClick={() => go({ tab: "chains", chain: c.id })}>
        <span className="chain-card-top">
          <ProductIcon product={root.productId} fallback={root.glyph} size={52} />
          {s && <span className="badge">{s.finals ? `×${s.finals}` : <Glyph name="ship" size={14} />} <span className="dot" aria-hidden="true" /></span>}
        </span>
        <span className="chain-card-name">{c.product[lang]}</span>
        <span className="chain-card-kind">{t("buildingsCount", { n: ids.length })}</span>
        {state === "short" && <span className="chain-card-status">{t("toBuildN", { n: missing })}</span>}
        {state === "ok" && <span className="chain-card-status">✓ {t("goalOk")}</span>}
        {s && s.surplus > 0.05 && <span className="chain-card-surplus">{t("surplusShort", { x: nice(Math.round(s.surplus * 10) / 10, lang) })}</span>}
        {state === "spare" && <span className="chain-card-status">{t("builtNotNeeded")}</span>}
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
      {!query && ([["short", short, "groupShort"], ["ok", ok, "groupOk"], ["spare", spare, "groupSpare"]] as const).map(([k, list, title]) =>
        list.length > 0 && (
          <section key={k} className={`cat plan-group ${k}`}>
            <h2 className="section-t"><span className="plan-dot" aria-hidden="true" />{t(title)} <span className="count-n">{list.length}</span></h2>
            <div className="chain-grid">{list.map(card)}</div>
          </section>
        ))}
      {!query && short.length + ok.length + spare.length > 0 && <h2 className="section-t rest-t">{t("groupRest")}</h2>}
      {categoryOrder.map((cat) => {
        const list = visible.filter((c) => c.category === cat && (query || !status.get(c.id)));
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
