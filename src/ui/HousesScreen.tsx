import { useState } from "react";
import { chainForProduct, levels, productName } from "../data/catalog";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon, WorkerGlyph } from "./Emblems";
import { Stepper } from "./parts";

export function HousesScreen() {
  const { island, state, t, lang, editIsland, go, imports } = useApp();
  const mine = levels.filter((l) => l.region === island.region);
  const [open, setOpen] = useState<string | null>(null);
  const totalHouses = mine.reduce((s, l) => s + (island.houses[l.id] ?? 0), 0);

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

      {mine.map((l, i) => {
        const n = island.houses[l.id] ?? 0;
        const off = l.needs.filter((x) => island.needsOff.includes(`${l.id}:${x.product}`)).length;
        const isOpen = open === l.id;
        return (
          <article key={l.id} className={`level card${n > 0 ? " on" : ""}`} style={{ ["--i" as string]: i }}>
            <div className="level-head">
              <span className="level-glyph"><WorkerGlyph level={l.id} size={28} /></span>
              <div>
                <h2>{l.name[lang]}</h2>
                <small>{l.residence[lang]}</small>
              </div>
            </div>
            <Stepper size="sm" value={n} onChange={(v) => setHouses(l.id, v)} max={9999}
              unit={t(n === 1 ? "house" : "houses")} lessLabel={`${t("oneLess")}: ${l.name[lang]}`} moreLabel={`${t("oneMore")}: ${l.name[lang]}`} />
            <div className="quick">
              {[-10, +10].map((d) => (
                <button type="button" key={d} onClick={() => setHouses(l.id, n + d)} disabled={d < 0 && n === 0}
                  aria-label={`${d > 0 ? "+" : "−"}10 ${t("houses")}: ${l.name[lang]}`}>{d > 0 ? "+10" : "−10"}</button>
              ))}
              <button type="button" className="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                {t("needsN", { n: l.needs.length - off, total: l.needs.length })}
              </button>
            </div>
            {isOpen && (
              <ul className="needs">
                {l.needs.map((x) => {
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
      <p className="fine">{t("consumptionNote", { level: state.consumption === "Low" ? t("consLow") : state.consumption === "Medium" ? t("consMed") : t("consHigh") })}</p>
    </div>
  );
}
