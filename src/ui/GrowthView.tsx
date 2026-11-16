import { useMemo, useState } from "react";
import { buildings, levelById, productName } from "../data/catalog";
import { growthOutlook } from "../core/growth";
import { r1 } from "../core/chainRates";
import { newGrowthPlan, type GrowthPlan } from "../core/state";
import { nice } from "../i18n";
import { useApp } from "./context";
import { Portrait, ProductIcon } from "./Emblems";
import { RegionChip, Stepper, UiIcon } from "./parts";

/**
 * Planes de crecimiento: objetivo de casas por nivel en una isla. La población, lo que pedirán y los
 * edificios que harán falta se calculan. Se guardan con la partida y los ven los dos jugadores.
 * No cambian la isla: es una simulación.
 */
export function GrowthView() {
  const { state, setState, island, world, worldIslands, factor, t, lang } = useApp();
  const plans = state.growth ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);
  const rate = (x: number) => nice(r1(x), lang);
  const nameOf = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";
  const save = (growth: GrowthPlan[]) => setState({ ...state, growth });
  const patch = (id: string, p: Partial<GrowthPlan>) => save(plans.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const create = () => {
    const g = newGrowthPlan(t("growthDefaultName", { island: island.name }), island);
    save([...plans, g]);
    setOpenId(g.id);
  };
  const open = plans.find((g) => g.id === openId) ?? null;
  const outlook = useMemo(
    () => (open ? growthOutlook(worldIslands, factor, open, { countBuilt: state.countBuilt, current: world }) : null),
    [open, worldIslands, factor, state.countBuilt, world],
  );
  const summary = (g: GrowthPlan) => {
    const isl = worldIslands.find((i) => i.id === g.island);
    if (!isl) return null;
    let now = 0, target = 0;
    for (const [id, n] of Object.entries({ ...isl.houses, ...g.houses })) {
      const l = levelById[id];
      if (!l || l.region !== isl.region) continue;
      now += isl.houses[id] ?? 0; target += g.houses[id] ?? 0;
    }
    return { now, target };
  };

  if (open) {
    const isl = state.islands.find((i) => i.id === open.island);
    const levelsOf = isl ? Object.values(levelById).filter((l) => l.region === isl.region) : [];
    const delta = outlook ? outlook.residents.target - outlook.residents.now : 0;
    return (
      <section className="growth" aria-label={open.name}>
        <button type="button" className="back" onClick={() => { setOpenId(null); setConfirmDel(false); }}><span aria-hidden="true">‹</span> {t("growthAll")}</button>
        <div className="card growth-head">
          <label className="growth-name">
            <span className="sr">{t("growthName")}</span>
            <input value={open.name} maxLength={60} onChange={(e) => patch(open.id, { name: e.target.value || " " })} onBlur={(e) => { if (!e.target.value.trim()) patch(open.id, { name: t("growthDefaultName", { island: nameOf(open.island) }) }); }} aria-label={t("growthName")} />
          </label>
          <p className="growth-isl">{isl && <RegionChip region={isl.region} />}<b>{nameOf(open.island)}</b></p>
          <p className="fine">{t("growthHelp")}</p>
        </div>
        {!isl && <p className="fine">{t("growthNoIsland")}</p>}
        {isl && outlook && (
          <>
            <div className="rate-cards">
              <div className="rate-card"><small>{t("growthNow")}</small><b>≈{fmt(outlook.residents.now)}</b><span>{t("statResidents").toLowerCase()}</span></div>
              <div className="rate-card"><small>{t("growthTarget")}</small><b>≈{fmt(outlook.residents.target)}</b><span>{t("statResidents").toLowerCase()}</span></div>
              <div className={`rate-card cover ${delta >= 0 ? "ok" : "short"}`}><small>{t("growthDelta")}</small><b>{delta >= 0 ? "+" : "−"}{fmt(Math.abs(delta))}</b></div>
            </div>

            <h3 className="cat-t">{t("growthHouses")}</h3>
            <ul className="growth-levels">
              {levelsOf.map((l) => {
                const now = isl.houses[l.id] ?? 0;
                const v = open.houses[l.id] ?? 0;
                const row = outlook.levels.find((x) => x.id === l.id);
                return (
                  <li key={l.id} className="card">
                    <div className="level-head">
                      <Portrait level={l.id} size={44} />
                      <div>
                        <h4>{l.name[lang]}</h4>
                        <small>{t("growthLevelNow", { n: fmt(now) })}{row ? ` · ${t("growthLevelPop", { r: fmt(row.residentsTarget), w: fmt(row.workersTarget) })}` : ""}</small>
                      </div>
                    </div>
                    <Stepper size="sm" value={v} max={99999} unit={t(v === 1 ? "house" : "houses")} label={`${t("growthHouses")}: ${l.name[lang]}`}
                      lessLabel={`${t("oneLess")}: ${l.name[lang]}`} moreLabel={`${t("oneMore")}: ${l.name[lang]}`}
                      onChange={(n) => patch(open.id, { houses: { ...open.houses, [l.id]: Math.max(0, n) } })} />
                  </li>
                );
              })}
            </ul>

            {outlook.build.length > 0 && (
              <>
                <h3 className="cat-t">{t("growthBuild")}</h3>
                <ul className="quick-list">
                  {outlook.build.map((b) => {
                    const lack = Math.max(0, b.target - b.built);
                    return (
                      <li key={b.id} className={`quick-row ${lack > 0 ? "short" : "ok"}`}>
                        <ProductIcon product={buildings[b.id].productId} fallback={buildings[b.id].glyph} size={34} />
                        <span className="quick-name">
                          <b>{buildings[b.id].name[lang]}</b>
                          <small>{t("growthBuildLine", { now: b.now, target: b.target, built: b.built })}</small>
                        </span>
                        {lack > 0 ? <span className="missing-pill">{t("missingN", { n: lack })}</span> : <span className="rate-ok" aria-label={t("goalOk")}><UiIcon name="check" size={14} /></span>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {outlook.elsewhere.length > 0 && (
              <>
                <h3 className="cat-t">{t("growthElsewhere")}</h3>
                <ul className="out-list card">
                  {outlook.elsewhere.map((x) => (
                    <li key={x.island + x.id}><b>{nameOf(x.island)}</b><span>+{x.extra} {(x.extra === 1 ? buildings[x.id].name : buildings[x.id].plural)[lang].toLowerCase()}</span></li>
                  ))}
                </ul>
              </>
            )}
            {outlook.demand.length > 0 && (
              <>
                <h3 className="cat-t">{t("growthDemand")}</h3>
                <ul className="consume-list">
                  {outlook.demand.map((d) => (
                    <li key={d.product}>
                      <ProductIcon product={d.product} fallback="house" size={28} />
                      <span className="rf-main">
                        <span className="rate-top">
                          <b>{productName(d.product)[lang]}</b>
                          <span className="rate-nums">{rate(d.now)} → {rate(d.target)} t/min</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <div className="row-actions wrap growth-actions">
          {!confirmDel ? <button type="button" className="ghost-btn danger" onClick={() => setConfirmDel(true)}>{t("growthDelete")}</button> : (
            <>
              <span>{t("growthDeleteQ")}</span>
              <button type="button" className="danger" onClick={() => { save(plans.filter((g) => g.id !== open.id)); setOpenId(null); setConfirmDel(false); }}>{t("growthDeleteYes")}</button>
              <button type="button" onClick={() => setConfirmDel(false)}>{t("cancel")}</button>
            </>
          )}
        </div>
        <p className="fine">{t("growthShared")}</p>
      </section>
    );
  }

  return (
    <section className="growth" aria-label={t("growthTitle")}>
      <p className="fine">{t("growthIntro")}</p>
      {plans.length > 0 && (
        <ul className="rate-list">
          {plans.map((g) => {
            const s = summary(g);
            return (
              <li key={g.id}>
                <button type="button" className="rate-row" onClick={() => setOpenId(g.id)}>
                  <span className="rate-main">
                    <span className="rate-top"><b>{g.name}</b><span className="rate-nums">{nameOf(g.island)}</span></span>
                    {s && <small className="rate-note">{t("growthRowLine", { now: fmt(s.now), target: fmt(s.target) })}</small>}
                  </span>
                  <span className="chev" aria-hidden="true"><UiIcon name="chev" size={18} /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="primary cta" onClick={create}><UiIcon name="plus" /> {t("growthNew", { island: island.name })}</button>
    </section>
  );
}
