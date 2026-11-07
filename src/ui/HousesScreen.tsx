import { useMemo, useState } from "react";
import { chainForProduct, consumptionLevels, dlcNeedsOff, hasDlc, levelById, levels, productName, type Level } from "../data/catalog";
import { residentsOf, serviceKey, workforceOf } from "../core/population";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { Portrait, ProductIcon, WorkerGlyph } from "./Emblems";
import { NumberField, Stepper } from "./parts";

export function HousesScreen() {
  const { island, state, t, lang, editIsland, go, imports } = useApp();
  const mine = levels.filter((l) => l.region === island.region);
  const [open, setOpen] = useState<string | null>(null);
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
  const setPopReal = (id: string, v: number) => {
    const popReal = { ...(island.popReal ?? {}) };
    const houses = island.houses[id] ?? 0;
    if (v > 0 && houses > 0) popReal[id] = Math.round((v * 1000) / houses); else delete popReal[id];
    editIsland({ popReal });
  };
  const islandPop = mine.reduce((a, l) => a + res(island, l.id), 0);
  const regionIslands = state.islands.filter((i) => i.region === island.region);
  const regionPop = regionIslands.reduce((a, i) => a + mine.reduce((b, l) => b + res(i, l.id), 0), 0);

  const setHouses = (id: string, v: number) =>
    editIsland({ houses: { ...island.houses, [id]: Math.max(0, Math.min(9999, Math.round(v))) } });
  const toggle = (key: string) =>
    editIsland({ needsOff: island.needsOff.includes(key) ? island.needsOff.filter((k) => k !== key) : [...island.needsOff, key] });

  return (
    <div className="houses-screen">
      <header className="screen-head">
        <h1>{t("housesTitle")}</h1>
        <p>{t("housesSub")}</p>
      </header>

      {totalHouses > 0 && (
        <section className="pop-summary card" aria-label={t("population")}>
          <div className="pop-row">
            <div><span className="pop-n">{anyEstimated ? "≈ " : ""}{fmt(islandPop)}</span><small>{t("residentsIn", { place: island.name })}</small></div>
            {regionIslands.length > 1 && <div className="pop-region"><span className="pop-n sm">≈ {fmt(regionPop)}</span><small>{t("residentsRegion", { region: island.region, n: regionIslands.length })}</small></div>}
          </div>
          <div className="wf-row" aria-label={t("workforceProvided")}>
            {mine.filter((l) => (island.houses[l.id] ?? 0) > 0).map((l) => (
              <span key={l.id} className="wf" title={l.name[lang]}><WorkerGlyph level={l.id} size={16} />{fmt(workforceOf(l, res(island, l.id)))}</span>
            ))}
          </div>
          <p className="fine">{t("popNote")}</p>
        </section>
      )}

      {mine.map((l, i) => {
        const n = island.houses[l.id] ?? 0;
        const off = needsOf(l).filter((x) => island.needsOff.includes(`${l.id}:${x.product}`)).length
          + servicesOf(l).filter((x) => island.needsOff.includes(serviceKey(l.id, x.id))).length;
        const isOpen = open === l.id;
        return (
          <article key={l.id} className={`level card${n > 0 ? " on" : ""}`} style={{ ["--i" as string]: i }}>
            <div className="level-head">
              <Portrait level={l.id} size={56} />
              <div>
                <h2>{l.name[lang]}</h2>
                {n > 0 ? (
                  <button type="button" className={`pop-line${island.popReal?.[l.id] ? " real" : ""}`} aria-expanded={editingPop === l.id}
                    onClick={() => setEditingPop(editingPop === l.id ? null : l.id)}>
                    {t(island.popReal?.[l.id] ? "levelPopReal" : "levelPop", { r: fmt(res(island, l.id)), w: fmt(workforceOf(l, res(island, l.id))) })}
                    <span aria-hidden="true"> ✎</span>
                  </button>
                ) : <small>{t("perHouse", { n: l.residents })}</small>}
              </div>
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
            <Stepper size="sm" value={n} onChange={(v) => setHouses(l.id, v)} max={9999} label={`${t("houses")}: ${l.name[lang]}`}
              unit={t(n === 1 ? "house" : "houses")} lessLabel={`${t("oneLess")}: ${l.name[lang]}`} moreLabel={`${t("oneMore")}: ${l.name[lang]}`} />
            <div className="quick">
              {[-10, +10].map((d) => (
                <button type="button" key={d} onClick={() => setHouses(l.id, n + d)} disabled={d < 0 && n === 0}
                  aria-label={`${d > 0 ? "+" : "−"}10 ${t("houses")}: ${l.name[lang]}`}>{d > 0 ? "+10" : "−10"}</button>
              ))}
              <button type="button" className="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                {t("needsN", { n: needsOf(l).length + servicesOf(l).length - off, total: needsOf(l).length + servicesOf(l).length })}
              </button>
            </div>
            {isOpen && (
              <ul className="needs">
                {needsOf(l).map((x) => {
                  const key = `${l.id}:${x.product}`;
                  const on = !island.needsOff.includes(key);
                  const local = chainForProduct(island.region, x.product);
                  return (
                    <li key={x.product}>
                      <label>
                        <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                        <ProductIcon product={x.product} fallback="house" size={28} />
                        <span>{productName(x.product)[lang]}</span>
                        {!local && <em className="import">{t("notHere")}</em>}
                      </label>
                    </li>
                  );
                })}
                {servicesOf(l).length > 0 && <li className="needs-h">{t("publicServices")}</li>}
                {servicesOf(l).map((x) => {
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
            )}
          </article>
        );
      })}

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
      <p className="fine">{t("consumptionNote", { level: (consumptionLevels.find((c) => c.id === state.consumption)?.name[lang] ?? state.consumption).toLowerCase() })}</p>
    </div>
  );
}
