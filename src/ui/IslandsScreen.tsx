import { useState } from "react";
import { buildings, chains, consumptionLevels, events, patrons, source, techs, touchesRegion, type Boost, type Region } from "../data/catalog";
import { importState, newIsland, undoImport, type State } from "../core/state";
import { formatCode, parseCode } from "../sync/model";
import { InstallCard } from "./Install";
import { useApp } from "./context";
import { Segmented } from "./parts";

export function IslandsScreen() {
  const { state, setState, island, editIsland, sync, t, lang } = useApp();
  const [player, setPlayer] = useState(state.session?.player ?? "");
  const [codeIn, setCodeIn] = useState("");
  const [shareMsg, setShareMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Region>("Albion");
  const [msg, setMsg] = useState<{ text: string; undo?: boolean; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = (next: Partial<State>) => setState({ ...state, ...next });
  const targetsText = (x: Boost) => {
    const names = [...new Set(x.targets.filter((id) => buildings[id]?.region === island.region).map((id) => buildings[id].name[lang]))];
    return names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t("andMore", { n: names.length - 4 })}` : names.join(", ");
  };
  const boostText = (x: Boost) =>
    [x.prod ? `+${x.prod} %` : "", x.base ? `+${x.base} % ${t("baseShort")}` : "", x.fuel ? t("fuelLonger", { n: x.fuel }) : ""].filter(Boolean).join(" · ") + " · " + targetsText(x);
  const json = () => JSON.stringify(state, null, 2);


  return (
    <div className="islands-screen">
      <header className="screen-head">
        <h1>{t("islandsTitle")}</h1>
      </header>

      <InstallCard />

      <section aria-labelledby="share-t" className="stack">
        <h2 id="share-t" className="section-t">{t("shareTitle")}</h2>
        <div className="card setting share">
          {!sync.available ? (
            <p>{t("shareUnavailable")}</p>
          ) : state.session ? (
            <>
              <p className={`share-status ${sync.status}`}>
                <span className="dot-s" aria-hidden="true" />
                {t(sync.status === "live" ? "syncLive" : sync.status === "offline" ? "syncOffline" : sync.status === "error" ? "syncError" : "syncConnecting")}
              </p>
              <div className="code-box">
                <span className="label">{t("shareCode")}</span>
                <b className="code">{formatCode(state.session.code)}</b>
                <button type="button" onClick={() => navigator.clipboard?.writeText(formatCode(state.session!.code)).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); }, () => {})}>
                  {codeCopied ? t("copied") : t("copyCode")}
                </button>
              </div>
              <p>{t("sharePlayers", { list: Object.values(sync.players).join(", ") || state.session.player })}</p>
              <p className="fine">{t("shareHowTo")}</p>
              <button type="button" className="danger" onClick={sync.leave}>{t("shareLeave")}</button>
            </>
          ) : (
            <>
              <p>{t("shareIntro")}</p>
              <label htmlFor="player-name">{t("yourName")}</label>
              <input id="player-name" value={player} maxLength={40} onChange={(e) => setPlayer(e.target.value)} placeholder={t("yourNamePh")} />
              <button type="button" className="primary" disabled={!player.trim() || busy}
                onClick={async () => { setBusy(true); const ok = await sync.create(player.trim()); setBusy(false); setShareMsg(ok ? null : { text: t("shareError"), error: true }); }}>
                {t("shareCreate")}
              </button>
              <div className="join">
                <label htmlFor="join-code">{t("joinCode")}</label>
                <input id="join-code" value={codeIn} onChange={(e) => setCodeIn(e.target.value)} placeholder="ABCDE-FGHJK" autoCapitalize="characters" autoComplete="off" />
                <button type="button" disabled={!player.trim() || !parseCode(codeIn) || busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await sync.join(parseCode(codeIn)!, player.trim());
                    setBusy(false);
                    setShareMsg(ok ? null : { text: t("joinNotFound"), error: true });
                  }}>
                  {t("shareJoin")}
                </button>
                <p className="fine">{t("joinNote")}</p>
              </div>
            </>
          )}
          {shareMsg && <p className={`msg${shareMsg.error ? " error" : ""}`} role="alert">{shareMsg.text}</p>}
        </div>
      </section>

      <section aria-labelledby="isl-t" className="stack">
        <h2 id="isl-t" className="section-t">{t("islands")}</h2>
        {state.islands.map((i) => {
          const isCurrent = i.id === state.current;
          const goals = Object.values(i.goals).filter((n) => n > 0).length;
          return (
            <article key={i.id} className={`island-row card${isCurrent ? " current" : ""}`}>
              {renaming === i.id ? (
                <form
                  className="rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = String(new FormData(e.currentTarget).get("n") ?? "").trim();
                    if (v) patch({ islands: state.islands.map((x) => (x.id === i.id ? { ...x, name: v } : x)) });
                    setRenaming(null);
                  }}
                >
                  <label className="sr" htmlFor={`rn-${i.id}`}>{t("name")}</label>
                  <input id={`rn-${i.id}`} name="n" defaultValue={i.name} maxLength={40} required autoFocus />
                  <button type="submit" className="primary">{t("save")}</button>
                  <button type="button" onClick={() => setRenaming(null)}>{t("cancel")}</button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="island-main"
                    aria-pressed={isCurrent}
                    onClick={() => patch({ current: i.id })}
                  >
                    <span className="region-chip">{i.region}</span>
                    <b>{i.name}{i.owner && <span className="owner-chip">{i.owner}</span>}</b>
                    <small>{isCurrent ? t("current") : t("use")}{goals ? ` · ${goals} ${lang === "es" ? (goals === 1 ? "objetivo" : "objetivos") : goals === 1 ? "goal" : "goals"}` : ""}</small>
                  </button>
                  <div className="row-actions">
                    <button type="button" onClick={() => setRenaming(i.id)}>{t("rename")}</button>
                    <button type="button" disabled={state.islands.length === 1} onClick={() => setDeleting(i.id)}>
                      {t("delete")}
                    </button>
                  </div>
                  {deleting === i.id && (
                    <div className="confirm" role="group" aria-label={t("deleteConfirm", { name: i.name })}>
                      <p>{t("deleteConfirm", { name: i.name })}</p>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          const islands = state.islands.filter((x) => x.id !== i.id);
                          patch({ islands, current: isCurrent ? islands[0].id : state.current });
                          setDeleting(null);
                        }}
                      >
                        {t("delete")}
                      </button>
                      <button type="button" onClick={() => setDeleting(null)}>{t("cancel")}</button>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}

        <form
          className="add-island card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const isl = { ...newIsland(name, region), ...(state.session ? { owner: state.session.player } : {}) };
            patch({ islands: [...state.islands, isl], current: isl.id });
            setName("");
          }}
        >
          <h3>{t("newIsland")}</h3>
          <label htmlFor="new-name">{t("name")}</label>
          <input id="new-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
          <span className="label">{t("region")}</span>
          <Segmented<Region> label={t("region")} value={region} onChange={setRegion} options={[["Albion", "Albion"], ["Latium", "Latium"]]} />
          <button type="submit" className="primary" disabled={!name.trim() || state.islands.length >= 50}>{t("add")}</button>
        </form>
      </section>

      <section aria-labelledby="boost-t" className="stack">
        <h2 id="boost-t" className="section-t">{t("boostsTitle", { island: island.name })}</h2>
        <div className="card setting boosts">
          <p>{t("boostsHelp")}</p>

          <h3>{t("research")}</h3>
          <ul className="toggles">
            {techs.filter((x) => touchesRegion(x, island.region)).map((x) => (
              <li key={x.id}>
                <label>
                  <input type="checkbox" checked={state.techs.includes(x.id)}
                    onChange={(e) => patch({ techs: e.target.checked ? [...state.techs, x.id] : state.techs.filter((k) => k !== x.id) })} />
                  <span><b>{x.name[lang]}</b><small>{boostText(x)}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <p className="fine">{t("researchNote")}</p>

          <h3>{t("patron")}</h3>
          {(() => {
            const options = patrons.filter((p) => p.effects.some((e) => touchesRegion(e, island.region)));
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
            {events.filter((x) => touchesRegion(x, island.region)).map((x) => (
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

      <section aria-labelledby="set-t" className="stack">
        <h2 id="set-t" className="section-t">{t("settings")}</h2>
        <div className="card setting">
          <span className="label">{t("language")}</span>
          <Segmented label={t("language")} value={state.lang} onChange={(v) => patch({ lang: v })} options={[["es", "Español"], ["en", "English"]]} />
          <span className="label">{t("animations")}</span>
          <Segmented label={t("animations")} value={state.motion} onChange={(v) => patch({ motion: v })} options={[["auto", t("animAuto")], ["reduce", t("animReduce")]]} />
          <span className="label">{t("consumption")}</span>
          <Segmented label={t("consumption")} value={state.consumption} onChange={(v) => patch({ consumption: v })}
            options={consumptionLevels.map((c) => [c.id, c.name[lang]] as [State["consumption"], string])} />
          <p>{t("consumptionHelp")}</p>
        </div>
      </section>

      <section aria-labelledby="bk-t" className="stack">
        <h2 id="bk-t" className="section-t">{t("backup")}</h2>
        <div className="card setting">
          <p>{t("backupHelp")}</p>
          <div className="row-actions wrap">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(json()).then(
                  () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
                  () => setMsg({ text: t("notSaved"), error: true }),
                );
              }}
            >
              {copied ? t("copied") : t("copySave")}
            </button>
            {import.meta.env.MODE !== "single" && <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([json()], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "anno117-plan.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {t("download")}
            </button>}
            <label className="file-btn">
              {t("importFile")}
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    setState(importState(await f.text(), state));
                    setMsg({ text: t("imported"), undo: true });
                  } catch {
                    setMsg({ text: t("importError"), error: true });
                  }
                }}
              />
            </label>
          </div>
          {msg && (
            <p className={`msg${msg.error ? " error" : ""}`} role={msg.error ? "alert" : "status"}>
              {msg.text}
              {msg.undo && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    const prev = undoImport();
                    if (prev) setState(prev);
                    setMsg(null);
                  }}
                >
                  {t("undoImport")}
                </button>
              )}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="dt-t" className="stack">
        <h2 id="dt-t" className="section-t">{t("data")}</h2>
        <div className="card data">
          <p>{t("dataHelp2", { n: chains.length })}</p>
          <p>
            {t("sources")}:{" "}
            <a href={`${source.repo}/blob/${source.sha}/${source.file}`} target="_blank" rel="noopener noreferrer">anno-117-calculator</a>{" "}
            ({source.sha.slice(0, 7)}, MIT) ·{" "}
            <a href="https://anno.land/en/anno-117-buildings/" target="_blank" rel="noopener noreferrer">anno.land</a> ·{" "}
            <a href="https://primagames.com/tips/all-building-production-ratios-in-anno-117-pax-romana" target="_blank" rel="noopener noreferrer">Prima Games</a>
          </p>
          <p className="fine">{t("fanMade")}</p>
        </div>
      </section>
    </div>
  );
}
