import { useMemo, useState } from "react";
import { consumptionLevels, dlcNeedsOff, hasDlc, levelById, levels, productName, type Level } from "../data/catalog";
import { residentsOf, serviceKey, workforceOf } from "../core/population";
import { islandNeeds, needsCovered, type NeedRow, type NeedStatus } from "../core/needs";
import { r1 } from "../core/chainRates";
import { nice } from "../i18n";
import type { State } from "../core/state";
import { useApp } from "./context";
import { sumPop } from "./stats";
import { Glyph } from "./Glyph";
import { Portrait, ProductIcon, WorkerGlyph } from "./Emblems";
import { FilterTabs, NumberField, PageHero, Segmented, Stepper, UiIcon, ViewTabs } from "./parts";

type View = "pop" | "needs" | "levels" | "config";
type NeedFilter = "all" | "on" | "off";

export function HousesScreen() {
  const { island, state, setState, t, lang, editIsland, go, imports, rates, econ } = useApp();
  const mine = levels.filter((l) => l.region === island.region && hasDlc(l, state.dlcs));
  const [view, setView] = useState<View>("pop");
  const [needFilter, setNeedFilter] = useState<NeedFilter>("all");
  const [levelPick, setLevelPick] = useState<string | null>(null);
  const totalHouses = mine.reduce((s, l) => s + (island.houses[l.id] ?? 0), 0);
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);
  // Necesidades de DLC que no tenéis: no cuentan ni se muestran.
  const dlcOff = useMemo(() => dlcNeedsOff(state.dlcs), [state.dlcs]);
  const needsOf = (l: Level) => l.needs.filter((x) => hasDlc(x, state.dlcs));
  const servicesOf = (l: Level) => l.services.filter((x) => hasDlc(x, state.dlcs));
  /**
   * Residentes: si se copió el número del juego, se guarda como residentes por casa (×1000) y se escala
   * con las casas que haya; si no, la estimación.
   */
  const res = (i: typeof island, id: string) =>
    (i.houses[id] ?? 0) > 0 && (i.popReal?.[id] ?? 0) > 0
      ? Math.round(((i.popReal[id] / 1000) * (i.houses[id] ?? 0)))
      : residentsOf(levelById[id], i.houses[id] ?? 0, [...i.needsOff, ...dlcOff]);
  const anyEstimated = mine.some((l) => (island.houses[l.id] ?? 0) > 0 && !(island.popReal?.[l.id] > 0));
  const [editingPop, setEditingPop] = useState<string | null>(null);
  /** Niveles sin casas desplegados (por defecto se ven como una fila compacta). */
  const [openLevels, setOpenLevels] = useState<string[]>([]);
  const setPopReal = (id: string, v: number) => {
    const popReal = { ...(island.popReal ?? {}) };
    const houses = island.houses[id] ?? 0;
    if (v > 0 && houses > 0) popReal[id] = Math.round((v * 1000) / houses); else delete popReal[id];
    editIsland({ popReal });
  };
  const islandPop = mine.reduce((a, l) => a + res(island, l.id), 0);
  const regionIslands = state.islands.filter((i) => i.region === island.region);
  const regionPopSum = sumPop(regionIslands, state.dlcs);

  const factor = consumptionLevels.find((c) => c.id === state.consumption)?.factor ?? 1;
  const needRows = useMemo(() => islandNeeds({
    region: island.region, houses: island.houses, needsOff: [...island.needsOff, ...dlcOff], factor, dlcs: state.dlcs, rates,
    econ: econ.filter((x) => x.island === island.id),
  }), [island, dlcOff, factor, state.dlcs, rates, econ]);
  const cover = needsCovered(needRows);
  const inhabited = mine.filter((l) => (island.houses[l.id] ?? 0) > 0);
  const shownLevel = inhabited.find((l) => l.id === levelPick) ?? inhabited[0];

  const setHouses = (id: string, v: number) =>
    editIsland({ houses: { ...island.houses, [id]: Math.max(0, Math.min(9999, Math.round(v))) } });
  const toggle = (key: string) =>
    editIsland({ needsOff: island.needsOff.includes(key) ? island.needsOff.filter((k) => k !== key) : [...island.needsOff, key] });

  const statusText: Record<NeedStatus, string> = {
    off: t("needOff"), covered: t("needCovered"), short: t("needShort"), imported: t("needImported"), unsourced: t("needUnsourced"),
  };
  const needItem = (x: NeedRow) => (
    <li key={x.key} className={`need-row ${x.status}`}>
      <label>
        <input type="checkbox" checked={x.on} onChange={() => toggle(x.key)} />
        <ProductIcon product={x.product} fallback="house" size={30} />
        <span className="need-name">
          <span>{productName(x.product)[lang]}</span>
          {x.on && x.perMinute > 0 && <small>{nice(r1(x.perMinute), lang)} t/min</small>}
        </span>
      </label>
      <span className={`need-pill ${x.status}`}>{statusText[x.status]}</span>
      {x.chainId && (
        <button type="button" className="need-go" aria-label={`${t("seeChain")}: ${productName(x.product)[lang]}`} onClick={() => go({ tab: "chains", chain: x.chainId! })}>
          <UiIcon name="chev" size={16} />
        </button>
      )}
    </li>
  );

  const levelCard = (l: Level, i: number) => {
    const n = island.houses[l.id] ?? 0;
    const rows = needRows.filter((x) => x.level === l.id);
    const c = needsCovered(rows);
    // Sin ninguna casa todavía, el primer nivel se ve abierto para empezar a escribir.
    if (n === 0 && !openLevels.includes(l.id) && !(totalHouses === 0 && i === 0)) {
      return (
        <button type="button" key={l.id} className="level-collapsed" style={{ ["--i" as string]: i }} aria-expanded={false}
          onClick={() => setOpenLevels([...openLevels, l.id])}>
          <Portrait level={l.id} size={34} />
          <span className="lc-name"><b>{l.name[lang]}</b><small>{t("perHouse", { n: l.residents })}</small></span>
          <span className="lc-add"><UiIcon name="plus" size={16} /> {t("addHouses")}</span>
        </button>
      );
    }
    return (
      <article key={l.id} className={`level card compact${n > 0 ? " on" : ""}`} style={{ ["--i" as string]: i }}>
        <div className="level-head">
          <Portrait level={l.id} size={44} />
          <div className="level-info">
            <h2>{l.name[lang]}</h2>
            {n > 0 ? (
              <button type="button" className={`pop-line${island.popReal?.[l.id] ? " real" : ""}`} aria-expanded={editingPop === l.id}
                onClick={() => setEditingPop(editingPop === l.id ? null : l.id)}>
                {t(island.popReal?.[l.id] ? "levelPopReal" : "levelPop", { r: fmt(res(island, l.id)), w: fmt(workforceOf(l, res(island, l.id))) })}
                <span aria-hidden="true"> ✎</span>
              </button>
            ) : <small>{t("perHouse", { n: l.residents })}</small>}
          </div>
          {n > 0 && (
            <button type="button" className={`need-chip${c.covered < c.total ? " short" : ""}`} onClick={() => { setLevelPick(l.id); setNeedFilter("all"); setView("needs"); }}
              aria-label={t("needsCoveredN", { n: c.covered, total: c.total })}>
              {c.covered}/{c.total}
            </button>
          )}
        </div>
        {editingPop === l.id && n > 0 && (
          <div className="pop-edit">
            <label>
              <span>{t("popFromGame")}</span>
              <NumberField value={island.popReal?.[l.id] ? res(island, l.id) : 0} onChange={(v) => setPopReal(l.id, v)} max={10000000}
                label={`${t("popFromGame")}: ${l.name[lang]}`} placeholder={String(residentsOf(l, n, [...island.needsOff, ...dlcOff]))} />
            </label>
            <p className="fine">{t("popFromGameHelp")}</p>
          </div>
        )}
        <div className="level-ctrl">
          <button type="button" className="q10" onClick={() => setHouses(l.id, n - 10)} disabled={n === 0} aria-label={`−10 ${t("houses")}: ${l.name[lang]}`}>−10</button>
          <Stepper size="sm" value={n} onChange={(v) => setHouses(l.id, v)} max={9999} label={`${t("houses")}: ${l.name[lang]}`}
            unit={t(n === 1 ? "house" : "houses")} lessLabel={`${t("oneLess")}: ${l.name[lang]}`} moreLabel={`${t("oneMore")}: ${l.name[lang]}`} />
          <button type="button" className="q10" onClick={() => setHouses(l.id, n + 10)} aria-label={`+10 ${t("houses")}: ${l.name[lang]}`}>+10</button>
        </div>
      </article>
    );
  };

  const filteredNeeds = (l: Level) => needRows.filter((x) => x.level === l.id && (needFilter === "all" || (needFilter === "on" ? x.on : !x.on)));
  const onN = needRows.filter((x) => x.on).length;
  const offN = needRows.length - onN;

  return (
    <div className="houses-screen">
      <PageHero title={t("housesTitle")} island={island.name} sub={t("housesSub")} icon={<Glyph name="house" size={30} />} />

      {totalHouses > 0 && (
        <div className="stat-tiles">
          <div className="stat-tile"><span>{t("statResidents")}</span><b>{anyEstimated ? "≈" : ""}{fmt(islandPop)}</b><small>{t("statHousesN", { n: fmt(totalHouses) })}</small></div>
          <div className={`stat-tile ${cover.covered < cover.total ? "warn" : "ok"}`}><span>{t("statNeedsCovered")}</span><b>{cover.covered}/{cover.total}</b><small>{t("statInPlan")}</small></div>
          <div className="stat-tile"><span>{t("statOffPlan")}</span><b>{offN}</b><small>{t("statNeeds")}</small></div>
        </div>
      )}

      <ViewTabs<View> label={t("housesViews")} value={view} onChange={setView}
        options={[
          { v: "pop", text: t("population") },
          { v: "needs", text: t("viewNeeds"), n: cover.total - cover.covered || undefined },
          { v: "levels", text: t("viewByLevel") },
          { v: "config", text: t("viewConfig") },
        ]} />

      {view === "pop" && (
        <>
          {totalHouses > 0 && (
            <section className="pop-summary card compact" aria-label={t("population")}>
              <div className="pop-row">
                <div className="wf-row" aria-label={t("workforceProvided")}>
                  {inhabited.map((l) => (
                    <span key={l.id} className="wf" title={l.name[lang]}><WorkerGlyph level={l.id} size={16} />{fmt(workforceOf(l, res(island, l.id)))}</span>
                  ))}
                </div>
                {regionIslands.length > 1 && <div className="pop-region"><span className="pop-n sm">{regionPopSum.estimated ? "≈ " : ""}{fmt(regionPopSum.residents)}</span><small>{t("residentsRegion", { region: island.region, n: regionIslands.length })}</small></div>}
              </div>
              <p className="fine">{t("popNote")}</p>
            </section>
          )}
          {mine.map(levelCard)}
          {totalHouses > 0 && (
            <div className="card houses-summary">
              {imports.length > 0 && (
                <p className="import-note">
                  {t("importsNote", { list: imports.map((x) => productName(x.product)[lang]).join(", ") })}
                </p>
              )}
              <button type="button" className="primary" onClick={() => go({ tab: "build" })}>{t("seeBuild")}</button>
            </div>
          )}
        </>
      )}

      {view === "needs" && (
        inhabited.length === 0 ? <p className="fine empty-line">{t("needsEmpty")}</p> : (
          <>
            <FilterTabs<NeedFilter> label={t("viewNeeds")} value={needFilter} onChange={setNeedFilter}
              options={[{ v: "all", text: t("filterAll") }, { v: "on", text: t("needsOn"), n: onN, tone: "ok" }, { v: "off", text: t("needOff"), n: offN }]} />
            <p className="fine">{t("needsHelp")}</p>
            {inhabited.map((l) => {
              const list = filteredNeeds(l);
              const services = needFilter === "on" ? servicesOf(l).filter((x) => !island.needsOff.includes(serviceKey(l.id, x.id)))
                : needFilter === "off" ? servicesOf(l).filter((x) => island.needsOff.includes(serviceKey(l.id, x.id))) : servicesOf(l);
              if (!list.length && !services.length) return null;
              const c = needsCovered(needRows.filter((x) => x.level === l.id));
              return (
                <section key={l.id} className={`need-group${shownLevel?.id === l.id && levelPick ? " picked" : ""}`} aria-labelledby={`ng-${l.id}`}>
                  <header className="need-group-head">
                    <Portrait level={l.id} size={36} />
                    <h2 id={`ng-${l.id}`}>{l.name[lang]}</h2>
                    <span className={`pct-pill ${c.covered < c.total ? "short" : "ok"}`}>{c.covered}/{c.total}</span>
                  </header>
                  <ul className="need-list">{list.map(needItem)}</ul>
                  {services.length > 0 && (
                    <>
                      <h3 className="cat-t">{t("publicServices")}</h3>
                      <ul className="needs">
                        {services.map((x) => {
                          const key = serviceKey(l.id, x.id);
                          return (
                            <li key={key} className="service">
                              <label>
                                <input type="checkbox" checked={!island.needsOff.includes(key)} onChange={() => toggle(key)} />
                                <span>{x.name[lang]}{x.wonder && <em className="wonder">{t("wonder")}</em>}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </section>
              );
            })}
          </>
        )
      )}

      {view === "levels" && (
        !shownLevel ? <p className="fine empty-line">{t("needsEmpty")}</p> : (
          <section className="by-level" aria-label={t("viewByLevel")}>
            {inhabited.length > 1 && (
              <Segmented label={t("viewByLevel")} value={shownLevel.id} onChange={setLevelPick}
                options={inhabited.map((l) => [l.id, l.name[lang]] as [string, string])} />
            )}
            {(() => {
              const l = shownLevel;
              const n = island.houses[l.id] ?? 0;
              const rows = needRows.filter((x) => x.level === l.id);
              const total = rows.reduce((a, x) => a + x.perMinute, 0);
              const c = needsCovered(rows);
              const max = Math.max(1e-9, ...rows.map((x) => x.perMinute));
              return (
                <div className="card level-detail">
                  <div className="level-head">
                    <Portrait level={l.id} size={56} />
                    <div>
                      <h2>{l.name[lang]}</h2>
                      <small>{t("levelLine", { h: fmt(n), r: fmt(res(island, l.id)), w: fmt(workforceOf(l, res(island, l.id))) })}</small>
                    </div>
                  </div>
                  <div className="rate-cards">
                    <div className="rate-card"><small>{t("statHouses")}</small><b>{fmt(n)}</b></div>
                    <div className="rate-card"><small>{t("statConsumes")}</small><b>{nice(r1(total), lang)}</b><span>t/min</span></div>
                    <div className={`rate-card cover ${c.covered < c.total ? "short" : "ok"}`}><small>{t("statNeedsCovered")}</small><b>{c.covered}/{c.total}</b></div>
                  </div>
                  <h3 className="cat-t">{t("levelConsumes")}</h3>
                  <ul className="consume-list">
                    {[...rows].sort((a, b) => b.perMinute - a.perMinute).map((x) => (
                      <li key={x.key} className={x.on ? x.status : "off"}>
                        <ProductIcon product={x.product} fallback="house" size={28} />
                        <span className="rf-main">
                          <span className="rate-top">
                            <b>{productName(x.product)[lang]}</b>
                            <span className="rate-nums">{x.on ? `${nice(r1(x.perMinute), lang)} t/min` : statusText.off}</span>
                          </span>
                          {x.on && <span className="cover-bar spare"><span style={{ width: `${Math.max(2, (x.perMinute / max) * 100)}%` }} /></span>}
                        </span>
                        {x.on && <span className={`need-pill ${x.status}`}>{statusText[x.status]}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="fine">{t("consumptionNote", { level: (consumptionLevels.find((c) => c.id === state.consumption)?.name[lang] ?? state.consumption).toLowerCase() })}</p>
                </div>
              );
            })()}
          </section>
        )
      )}

      {view === "config" && (
        <section className="card houses-config" aria-label={t("viewConfig")}>
          <div className="field">
            <span className="label">{t("consumption")}</span>
            <Segmented label={t("consumption")} value={state.consumption} onChange={(v) => setState({ ...state, consumption: v })}
              options={consumptionLevels.map((c) => [c.id, c.name[lang]] as [State["consumption"], string])} />
            <p className="fine">{t("consumptionHelp")}</p>
          </div>
          <div className="field">
            <span className="label">{t("popFromGame")}</span>
            <p className="fine">{t("popFromGameHelp")} {t("popConfigHint")}</p>
          </div>
          <div className="field">
            <span className="label">{t("statOffPlan")}</span>
            <p className="fine">{t("offPlanHelp", { n: offN })}</p>
            {offN > 0 && <button type="button" className="ghost-btn" onClick={() => { setNeedFilter("off"); setView("needs"); }}>{t("seeOffPlan")} <UiIcon name="chev" size={14} /></button>}
          </div>
        </section>
      )}
      {view !== "levels" && <p className="fine">{t("consumptionNote", { level: (consumptionLevels.find((c) => c.id === state.consumption)?.name[lang] ?? state.consumption).toLowerCase() })}</p>}
    </div>
  );
}
