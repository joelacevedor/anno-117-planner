import { useState } from "react";
import { buildings, chains, consumptionLevels, DLCS, hasDlc, regionName, regionsFor, source, techs, touchesRegion, type Boost, type Region } from "../data/catalog";
import { importState, listBackups, undoImport, type State } from "../core/state";
import { formatCode, parseCode } from "../sync/model";
import { syncLabel } from "../sync/useSync";
import { InstallCard } from "./Install";
import { useApp } from "./context";
import { Segmented } from "./parts";
import { PushToggle } from "./PushToggle";

/** Ajustes de la app y de la partida. Se abre desde la rueda de la barra superior. */
export function SettingsScreen() {
  const { state, rawState, setState, replaceState, island, sync, t, lang, back } = useApp();
  const [backups] = useState(() => listBackups());
  const [player, setPlayer] = useState(state.session?.player ?? "");
  const [codeIn, setCodeIn] = useState("");
  const [shareMsg, setShareMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [msg, setMsg] = useState<{ text: string; undo?: boolean; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [region, setRegion] = useState<Region>(island.region);

  const patch = (next: Partial<State>) => setState({ ...state, ...next });
  const targetsText = (x: Boost) => {
    const names = [...new Set(x.targets.filter((id) => buildings[id]?.region === region).map((id) => buildings[id].name[lang]))];
    return names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t("andMore", { n: names.length - 4 })}` : names.join(", ");
  };
  const boostText = (x: Boost) =>
    [x.prod ? `+${x.prod} %` : "", x.base ? `+${x.base} % ${t("baseShort")}` : "", x.fuel ? t("fuelLonger", { n: x.fuel }) : ""].filter(Boolean).join(" · ") + " · " + targetsText(x);
  // La copia lleva todo, también las islas que esta versión no muestra.
  const json = () => JSON.stringify(rawState, null, 2);

  return (
    <div className="islands-screen settings-screen">
      <button type="button" className="back" onClick={back}>
        <span aria-hidden="true">‹</span> {t("backShort")}
      </button>
      <header className="screen-head">
        <h1>{t("settings")}</h1>
      </header>

      <section aria-labelledby="share-t" className="stack">
        <h2 id="share-t" className="section-t">{t("shareTitle")}</h2>
        <div className="card setting share">
          {!sync.available ? (
            <p>{t("shareUnavailable")}</p>
          ) : state.session ? (
            <>
              <p className={`share-status ${sync.status}`}>
                <span className="dot-s" aria-hidden="true" />
                {t(syncLabel(sync.status))}
              </p>
              <div className="code-box">
                <span className="label">{t("shareCode")}</span>
                <b className="code">{formatCode(state.session.code)}</b>
                <button type="button" onClick={() => navigator.clipboard?.writeText(formatCode(state.session!.code)).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); }, () => {})}>
                  {codeCopied ? t("copied") : t("copyCode")}
                </button>
              </div>
              <div className="players">
                <span className="label">{t("playersTitle")}</span>
                <ul>
                  {Object.entries(sync.players).map(([uid, n]) => (
                    <li key={uid}>
                      <span>{n}{uid === sync.me && <small> · {t("thisDevice")}</small>}</span>
                      {uid !== sync.me && (
                        <button type="button" className="link danger-link" onClick={() => sync.removePlayer(uid)} aria-label={t("removePlayer", { name: n })}>{t("remove")}</button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="fine">{t("removePlayerHelp")}</p>
              </div>
              <form className="rename" onSubmit={(e) => { e.preventDefault(); sync.rename(player); }}>
                <label className="sr" htmlFor="my-name">{t("youAre")}</label>
                <input id="my-name" value={player} maxLength={40} onChange={(e) => setPlayer(e.target.value)} placeholder={t("yourNamePh")} />
                <button type="submit" disabled={!player.trim() || player.trim() === state.session.player}>{t("changeName")}</button>
              </form>
              <span className="label">{t("gameMode")}</span>
              <Segmented label={t("gameMode")} value={state.mode} onChange={(v) => patch({ mode: v })}
                options={[["coop", t("modeCoop")], ["versus", t("modeVersus")]]} />
              <p className="fine">{t(state.mode === "coop" ? "modeCoopHelp" : "modeVersusHelp")}</p>
              <PushToggle />
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

      <section aria-labelledby="game-t" className="stack">
        <h2 id="game-t" className="section-t">{t("gameSettings")}</h2>
        <div className="card setting boosts">
          <h3>{t("dlcTitle")}</h3>
          <ul className="toggles dlcs">
            {DLCS.map((d) => (
              <li key={d.id}>
                <label>
                  <input type="checkbox" checked={state.dlcs.includes(d.id)}
                    onChange={(e) => patch({ dlcs: e.target.checked ? [...state.dlcs, d.id] : state.dlcs.filter((x) => x !== d.id) })} />
                  <span><b>{d.name[lang]}</b>{d.id === "delta" && <small>{t("dlcDeltaHelp")}</small>}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="fine">{t("dlcHelp")}</p>
          <span className="label">{t("consumption")}</span>
          <Segmented label={t("consumption")} value={state.consumption} onChange={(v) => patch({ consumption: v })}
            options={consumptionLevels.map((c) => [c.id, c.name[lang]] as [State["consumption"], string])} />
          <p>{t("consumptionHelp")}</p>

          <label className="switch-row count-built">
            <span><b>{t("countBuilt")}</b><small>{t("countBuiltHelp")}</small></span>
            <input type="checkbox" role="switch" checked={state.countBuilt} onChange={(e) => patch({ countBuilt: e.target.checked })} />
          </label>

          <h3>{t("research")}</h3>
          <Segmented<Region> label={t("region")} value={region} onChange={setRegion} options={regionsFor(state.dlcs).map((r) => [r, regionName(r, lang)] as [Region, string])} />
          <h3>{t("research")}</h3>
          <ul className="toggles">
            {techs.filter((x) => hasDlc(x, state.dlcs) && touchesRegion(x, region)).map((x) => (
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

        </div>
      </section>

      <section aria-labelledby="set-t" className="stack">
        <h2 id="set-t" className="section-t">{t("appSettings")}</h2>
        <div className="card setting">
          <span className="label">{t("language")}</span>
          <Segmented label={t("language")} value={state.lang} onChange={(v) => patch({ lang: v })} options={[["es", "Español"], ["en", "English"]]} />
          <span className="label">{t("animations")}</span>
          <Segmented label={t("animations")} value={state.motion} onChange={(v) => patch({ motion: v })} options={[["auto", t("animAuto")], ["reduce", t("animReduce")]]} />
        </div>
        <InstallCard />
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
                    replaceState(importState(await f.text(), rawState));
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
                    if (prev) replaceState(prev);
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

      {backups.length > 0 && (
        <section aria-labelledby="ab-t" className="stack">
          <h2 id="ab-t" className="section-t">{t("autoBackups")}</h2>
          <div className="card setting">
            <p className="fine">{t("autoBackupsHelp")}</p>
            <ul className="backup-list">
              {backups.map((b) => (
                <li key={b.at}>
                  <span>
                    {t("autoBackupItem", { date: new Date(b.at).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }), n: b.islands })}
                    {b.reason === "before-remote-removal" && <small> · {t("autoBackupRemoval")}</small>}
                  </span>
                  <button type="button" onClick={() => {
                    try { replaceState(importState(b.data, rawState)); setMsg({ text: t("restored"), undo: true }); }
                    catch { setMsg({ text: t("importError"), error: true }); }
                  }}>{t("restore")}</button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
