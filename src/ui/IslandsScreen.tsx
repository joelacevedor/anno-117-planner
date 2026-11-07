import { useState } from "react";
import { buildings, events, hasDlc, KNOWN_REGIONS, patrons, regionName, regionsFor, touchesRegion, type Boost, type Region } from "../data/catalog";
import { NILE_SEASONS } from "../core/nile";
import { newIsland, type Island, type State } from "../core/state";
import { useApp } from "./context";
import { RegionChip, Segmented } from "./parts";
import { EmpireView, RegionView } from "./EconomyViews";

/** Islas agrupadas por región, con la región de la isla actual primero. */
export function byRegion(islands: Island[], first: Region) {
  const order = [first, ...KNOWN_REGIONS.filter((r) => r !== first)];
  return order.map((region) => ({ region, list: islands.filter((i) => i.region === region) })).filter((g) => g.list.length);
}

/** Vista elegida en la pestaña Isla (se recuerda en este dispositivo). */
type IslandView = "island" | "region" | "empire";
const VIEW_KEY = "anno117-island-view";
const readView = (): IslandView => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === "region" || v === "empire" ? v : "island"; } catch { return "island"; }
};

/** Pestaña Isla: la isla actual y, al lado, su región y el imperio. */
export function IslandsScreen() {
  const { state, island, plan, editIsland, t, lang, go, empire } = useApp();
  const [view, setViewRaw] = useState<IslandView>(readView);
  const setView = (v: IslandView) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento */ } };
  const targetsText = (x: Boost) => {
    const names = [...new Set(x.targets.filter((id) => buildings[id]?.region === island.region).map((id) => buildings[id].name[lang]))];
    return names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t("andMore", { n: names.length - 4 })}` : names.join(", ");
  };
  const boostText = (x: Boost) =>
    [x.prod ? `+${x.prod} %` : "", x.base ? `+${x.base} % ${t("baseShort")}` : "", x.fuel ? t("fuelLonger", { n: x.fuel }) : ""].filter(Boolean).join(" · ") + " · " + targetsText(x);

  const houses = Object.values(island.houses).reduce((a, n) => a + n, 0);
  const goals = Object.values(island.goals).filter((n) => n > 0).length;
  const missing = plan.toBuild.reduce((a, x) => a + x.count, 0);

  return (
    <div className="islands-screen island-screen">
      <header className="screen-head">
        <p className="eyebrow"><RegionChip region={island.region} /></p>
        <h1>{island.name}</h1>
      </header>

      <Segmented<IslandView> label={t("islandViews")} value={view} onChange={setView}
        options={[["island", t("viewIsland")], ["region", t("viewRegion")], ["empire", empire.recommendations.length ? `${t("viewEmpire")} · ${empire.recommendations.length}` : t("viewEmpire")]]} />

      {view === "island" && (
        <>
          <section className="card island-facts" aria-label={t("viewIsland")}>
            <ul>
              <li><b>{houses.toLocaleString(lang)}</b><span>{t("factHouses")}</span></li>
              <li><b>{goals}</b><span>{t("factGoals")}</span></li>
              <li><b>{missing}</b><span>{t("factMissing")}</span></li>
            </ul>
            <button type="button" className="link" onClick={() => go({ tab: "manage" })}>{t("manageIslands")} ›</button>
          </section>
        <section aria-labelledby="boost-t" className="stack">
          <h2 id="boost-t" className="section-t">{t("boostsTitle", { island: island.name })}</h2>
          <div className="card setting boosts">
            <p>{t("boostsHelpIsland")}</p>
            {island.region === "Aegyptus" && (
              <>
                <h3>{t("nileTitle")}</h3>
                <Segmented label={t("nileTitle")} value={island.nile ?? "media"} onChange={(v) => editIsland({ nile: v })}
                  options={NILE_SEASONS.map((x) => [x, t(x === "media" ? "nileMedia" : x === "shemu" ? "nileShemu" : "nileAjet")] as [typeof x, string])} />
                <p className="fine">{t("nileHelp")}</p>
              </>
            )}
            <h3>{t("patron")}</h3>
            {(() => {
              const options = patrons.filter((p) => hasDlc(p, state.dlcs) && p.effects.some((e) => touchesRegion(e, island.region)));
              const cur = island.patron && options.find((p) => p.id === island.patron!.id);
              const milestones = cur ? cur.effects[0].milestones : [];
              return (
                <div className="patron">
                  <label htmlFor="patron-sel" className="sr">{t("patron")}</label>
                  <select id="patron-sel" value={cur?.id ?? ""} onChange={(e) => editIsland({ patron: e.target.value ? { id: e.target.value, scaling: island.patron?.scaling || milestones[0]?.scaling || 10 } : null })}>
                    <option value="">{t("noPatron")}</option>
                    {options.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
                  </select>
                  {cur && (
                    <>
                      <label htmlFor="devotion-sel" className="label">{t("devotion")}</label>
                      <select id="devotion-sel" value={island.patron!.scaling} onChange={(e) => editIsland({ patron: { id: cur.id, scaling: Number(e.target.value) } })}>
                        {cur.effects[0].milestones.map((m) => (
                          <option key={m.devotion} value={m.scaling}>{t("devotionOpt", { d: m.devotion.toLocaleString(lang), n: m.scaling * (cur.effects[0].prod || 1) })}</option>
                        ))}
                      </select>
                      <p className="fine">{cur.effects.map((e) => `${e.name[lang]}: ${targetsText(e)}`).join(" · ")}</p>
                    </>
                  )}
                </div>
              );
            })()}

            <h3>{t("eventsTitle")}</h3>
            <ul className="toggles">
              {events.filter((x) => hasDlc(x, state.dlcs) && touchesRegion(x, island.region)).map((x) => (
                <li key={x.id}>
                  <label>
                    <input type="checkbox" checked={island.events.includes(x.id)}
                      onChange={(e) => editIsland({ events: e.target.checked ? [...island.events, x.id] : island.events.filter((k) => k !== x.id) })} />
                    <span><b>{x.name[lang]}</b><small>{boostText(x)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="fine">{t("manualNote")}</p>
          </div>
        </section>
        </>
      )}

      {view === "region" && <RegionView />}
      {view === "empire" && <EmpireView />}
    </div>
  );
}

/** Página aparte para gestionar las islas: crear, renombrar, borrar y elegir la actual. */
export function ManageIslandsScreen() {
  const { state, setState, island, t, lang, back } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Region>(island.region);
  const patch = (next: Partial<State>) => setState({ ...state, ...next });

  const row = (i: Island) => {
    const isCurrent = i.id === state.current;
    const goals = Object.values(i.goals).filter((n) => n > 0).length;
    const open = editing === i.id;
    return (
      <li key={i.id} className={`island-row ${i.region.toLowerCase()}${isCurrent ? " current" : ""}`}>
        <div className="island-line">
          <button type="button" className="island-main" aria-pressed={isCurrent} onClick={() => patch({ current: i.id })}>
            <b>{i.name}</b>
            <small>
              {isCurrent ? t("current") : t("use")}
              {goals ? ` · ${t(goals === 1 ? "goalsOne" : "goalsMany", { n: goals })}` : ""}
              {state.mode === "versus" && i.owner ? ` · ${i.owner}` : ""}
            </small>
          </button>
          <button type="button" className="edit-btn" aria-expanded={open} aria-label={t("editIsland", { name: i.name })}
            onClick={() => { setEditing(open ? null : i.id); setDeleting(null); }}>
            {open ? "✕" : "✎"}
          </button>
        </div>
        {open && (
          <div className="island-edit">
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                const v = String(new FormData(e.currentTarget).get("n") ?? "").trim();
                if (v) patch({ islands: state.islands.map((x) => (x.id === i.id ? { ...x, name: v } : x)) });
                setEditing(null);
              }}
            >
              <label className="sr" htmlFor={`rn-${i.id}`}>{t("name")}</label>
              <input id={`rn-${i.id}`} name="n" defaultValue={i.name} maxLength={40} required />
              <button type="submit" className="primary">{t("save")}</button>
            </form>
            {deleting === i.id ? (
              <div className="confirm" role="group" aria-label={t("deleteConfirm", { name: i.name })}>
                <p>{t("deleteConfirm", { name: i.name })}</p>
                <button type="button" className="danger" onClick={() => {
                  const islands = state.islands.filter((x) => x.id !== i.id);
                  patch({ islands, current: isCurrent ? islands[0].id : state.current });
                  setDeleting(null); setEditing(null);
                }}>{t("delete")}</button>
                <button type="button" onClick={() => setDeleting(null)}>{t("cancel")}</button>
              </div>
            ) : (
              <button type="button" className="link danger-link" disabled={state.islands.length === 1} onClick={() => setDeleting(i.id)}>{t("deleteIsland")}</button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="islands-screen manage-screen">
      <button type="button" className="back" onClick={back}>
        <span aria-hidden="true">‹</span> {t("backShort")}
      </button>
      <header className="screen-head">
        <h1>{t("islandsOnly")}</h1>
        <p>{t("islandsSub", { n: state.islands.length })}</p>
      </header>

      <section aria-label={t("islands")} className="stack">
        {byRegion(state.islands, island.region).map((g) => (
          <div key={g.region} className="region-group">
            <h2 className="region-h"><RegionChip region={g.region} /> <span>{g.list.length}</span></h2>
            <ul className="island-list">{g.list.map(row)}</ul>
          </div>
        ))}

        {adding ? (
          <form
            className="add-island card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const isl = { ...newIsland(name, region), ...(state.session ? { owner: state.session.player } : {}) };
              patch({ islands: [...state.islands, isl], current: isl.id });
              setName("");
              setAdding(false);
            }}
          >
            <h3>{t("newIsland")}</h3>
            <label htmlFor="new-name">{t("name")}</label>
            <input id="new-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required autoFocus />
            <span className="label">{t("region")}</span>
            <Segmented<Region> label={t("region")} value={region} onChange={setRegion} options={regionsFor(state.dlcs).map((r) => [r, regionName(r, lang)] as [Region, string])} />
            <div className="row-actions">
              <button type="submit" className="primary" disabled={!name.trim() || state.islands.length >= 50}>{t("add")}</button>
              <button type="button" onClick={() => setAdding(false)}>{t("cancel")}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="add-btn" onClick={() => setAdding(true)} disabled={state.islands.length >= 50}>+ {t("newIsland")}</button>
        )}
      </section>
    </div>
  );
}
