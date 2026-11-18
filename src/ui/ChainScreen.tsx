import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useMedia } from "./media";
import { createPortal } from "react-dom";
import { alternativesOf, buildings, categoryName, chainById, hasDlc, levelOfWorkforce, productName, providerOf } from "../data/catalog";
import { cleanRatio, perFinalCut, perMinute, perText, pick, stages } from "../core/plan";
import { externalShares, splitExternal } from "../core/supply";
import { nileFactor } from "../core/nile";
import { list, nice } from "../i18n";
import { r1 } from "../core/chainRates";
import { chainCauses, type Cause } from "../core/causes";
import { totalPct } from "../core/boosts";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon, WorkerGlyph } from "./Emblems";
import { BuiltCounter, CoverBar, NumberField, Pips, ProductivityControl, Segmented, Stepper, SupplyPicker, Tick, UiIcon, ViewTabs } from "./parts";

type View = "summary" | "buildings" | "flow" | "trade";

const EPS = 1e-6;

export function ChainScreen({ chainId, building, from }: { chainId: string; building?: string; from?: "build" }) {
  const { state, setState, island, plan, needsPlan, world, t, lang, setGoal, setTarget, setAccepted, setProductivityMany, boosts, setBuilt, back, mods, modsByIsland, setProducer, rates, wide } = useApp();
  // Escritorio ancho: los edificios van en su propia columna, siempre a la vista.
  const sideBuildings = useMedia("(min-width: 1500px)") && wide;
  const [view0, setView] = useState<View>(building ? "buildings" : "summary");
  const view: View = sideBuildings && view0 === "buildings" ? "summary" : view0;
  // Desde Obra: llevar hasta la tarjeta del edificio y destacarla un momento.
  useEffect(() => {
    if (!building) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`node-${building}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1800);
    }, 80);
    return () => clearTimeout(timer);
  }, [building]);
  const target = island.targets?.[chainId] ?? 0;
  const [unitMode, setUnitMode] = useState<"count" | "rate">(target > 0 ? "rate" : "count");
  const chain = chainById[chainId];
  const countBuilt = state.countBuilt;
  const chainRoot = buildings[chain.root];
  const cut = externalShares(island.id, island.supplies);
  /** Parte del producto final que llega hecha de otra isla (para lo que pides tú). */
  const rootShare = cut[chainRoot.productId] ?? 0;
  delete cut[chainRoot.productId];
  const base = perFinalCut(chain, cut, undefined, mods);
  const rootId = Object.keys(base)[0];
  const depth = stages(chain, undefined, cut, mods);
  const root = buildings[rootId];
  const ids = Object.keys(base);
  const clean = Object.keys(cut).length ? null : cleanRatio(chain, undefined, 24, mods);
  /** Objetivo en edificios guardado (el de t/min se guarda aparte; una cadena tiene uno u otro). */
  const goalCount = island.goals[chainId] ?? 0;
  const status = plan.chains.find((c) => c.chainId === chainId);
  /** Objetivo efectivo en edificios finales (incluye el de t/min convertido). */
  const goal = status?.goal ?? goalCount;
  const houses = status?.fromHouses ?? 0;
  const trade = status?.fromTrade ?? 0;
  const imported = status?.imported ?? 0;
  const n = goal * (1 - rootShare) + houses + trade;
  const allImported = rootShare >= 1 - EPS && trade <= EPS;
  const finals = Math.ceil(n - EPS);
  const unitN = root.plural[lang].toLowerCase();
  const unit1 = root.name[lang].toLowerCase();
  const lower = (s: string) => s.toLowerCase();
  const nextClean = clean ? clean.finals * Math.ceil((finals + 1) / clean.finals) : null;

  // Para cada edificio, a quién alimenta dentro de esta cadena.
  const feeds: Record<string, string[]> = {};
  for (const id of ids)
    for (const input of Object.keys(buildings[id].inputs)) (feeds[pick(buildings, mods, input)] ??= []).push(id);

  /** Edificio de ribera: producción por edificio en cada temporada, para comparar. */
  const nileNote = (b: (typeof buildings)[string]) => {
    if (!b.nile) return null;
    const season = island.nile ?? "media";
    const now = perMinute(b, mods);
    const base = now / nileFactor(season, b.output);
    const r = (x: number) => x.toLocaleString(lang, { maximumFractionDigits: 3 });
    return (
      <p className="note nile">
        {t("nileNote", {
          season: t(season === "media" ? "nileMedia" : season === "shemu" ? "nileShemu" : "nileAjet"),
          rate: r(now), shemu: r(base * nileFactor("shemu", b.output)), ajet: r(base * nileFactor("ajet", b.output)), media: r(base * nileFactor("media", b.output)),
        })}
      </p>
    );
  };

  /** Otros productores del mismo producto (p. ej. mina y quemadero de carbón): se pueden tener a la vez. */
  const altsOf = (id: string) => alternativesOf(buildings[id].region, buildings[id].productId)
    .filter((a) => a !== id && hasDlc(buildings[a], state.dlcs));
  const altBuilt = (id: string) => altsOf(id).some((a) => (island.built[a] ?? 0) > 0);

  /** Tarjeta de un productor alternativo: su propio contador, productividad y requisitos. */
  const altNode = (a: string, main: string) => {
    const b = buildings[a];
    const row = plan.byId[a];
    const built = island.built[a] ?? 0;
    const workers = b.workers && levelOfWorkforce(b.workers.level);
    const first = alternativesOf(b.region, b.productId)[0];
    return (
      <article key={a} id={`node-${a}`} className="node supplier alt-node" aria-label={b.name[lang]}>
        <div className="node-top">
          <ProductIcon product={b.productId} fallback={b.glyph} size={44} />
          <div className="count"><small>×</small><Tick value={built} /></div>
          <div className="node-name">
            <h3>{b.name[lang]}</h3>
            <span className="en">{b.good[lang]} · {b.cycleSeconds} s{lang === "es" ? ` · ${b.name.en}` : ""}</span>
          </div>
        </div>
        <p className="per">{t("altProducer", { good: lower(b.good[lang]), main: buildings[main].name[lang] })}</p>
        {(workers || b.fertility) && (
          <p className="meta">
            {workers && <span className="workers-tag"><WorkerGlyph level={b.workers!.level} size={15} />{t("workers", { n: b.workers!.amount, level: workers.name[lang] })}</span>}
            {b.fertility && <span>{t("fertility", { f: b.fertility[lang] })}</span>}
          </p>
        )}
        {nileNote(b)}
        <BuiltCounter id={a} needed={built} free />
        <div className="node-tools">
          <ProductivityControl id={a} />
          <button type="button" className="chip alt-main" onClick={() => setProducer(b.productId, a === first ? null : a)}>{t("altMakeMain")}</button>
        </div>
        {(row?.extra ?? 0) > 0 && <p className="note">{t("altExtra", { n: row!.extra })}</p>}
      </article>
    );
  };

  const node = (id: string, i: number) => {
    const b = buildings[id];
    const isRoot = id === rootId;
    const row = plan.byId[id];
    // Si hay otros productores construidos, este solo cubre lo que ellos no hacen (lo dice el plan).
    const exact = altBuilt(id) && row ? row.byChain[chainId] ?? 0 : base[id] * n;
    const mine = Math.ceil(exact - EPS);
    const total = row?.recommended ?? 0;
    const missing = row?.missing ?? 0;
    // Parte de lo recomendado que solo piden los objetivos a mano.
    const byGoals = needsPlan === plan ? 0 : Math.max(0, total - (needsPlan.byId[id]?.recommended ?? 0));
    const others = row
      ? Object.entries(row.byChain).filter(([c, v]) => c !== chainId && v > 0).map(([c]) => lower(chainById[c].product[lang]))
      : [];
    const state = n <= EPS ? "idle" : missing > 0 ? "short" : "ok";
    const [a, k] = perText(base[id]);
    const spare = !isRoot && others.length === 0 && mine - exact > EPS;
    const consumers = (feeds[id] ?? []).filter((c) => b.glyph === "fire" || c !== rootId || depth[id] > 1);
    const workers = b.workers && levelOfWorkforce(b.workers.level);
    const alts = altsOf(id);
    return (
      <Fragment key={id}>
      <article id={`node-${id}`} className={`node ${isRoot ? "final" : "supplier"} ${state}`} style={{ ["--i" as string]: i }} aria-label={b.name[lang]}>
        <div className="node-top">
          <ProductIcon product={b.productId} fallback={b.glyph} size={52} />
          <div className="count"><small>×</small><Tick value={mine} /></div>
          <div className="node-name">
            <h3>{b.name[lang]}</h3>
            <span className="en">{b.good[lang]}{lang === "es" ? ` · ${b.name.en}` : ""}</span>
          </div>
        </div>
        <p className="per">
          {isRoot
            ? t("produces", { good: lower(b.good[lang]) })
            : k === 1 ? t("perOne", { a, unit1 }) : t("perMany", { a, k, unitN })}
          {consumers.length > 0 && (
            <span className="feeds"> · {t(b.glyph === "fire" ? "fuelFor" : "feeds", { list: list(consumers.map((c) => buildings[c].name[lang]), lang) })}</span>
          )}
        </p>
        {(workers || b.fertility) && (
          <p className="meta">
            {workers && <span className="workers-tag"><WorkerGlyph level={b.workers!.level} size={15} />{t("workers", { n: b.workers!.amount, level: workers.name[lang] })}</span>}
            {b.fertility && <span>{t("fertility", { f: b.fertility[lang] })}</span>}
          </p>
        )}
        {total + (island.built[id] ?? 0) > 0 && (
          <>
            <Pips id={id} needed={total} />
            <BuiltCounter id={id} needed={total} />
            {byGoals > 0 && <p className="note goal-split">{t("recSplit", { need: total - byGoals, goals: byGoals })}</p>}
          </>
        )}
        {alts.length > 0 && <p className="alt-tag">{t("altMain", { s: b.cycleSeconds })}</p>}
        <div className="node-tools">
          <ProductivityControl id={id} />
          <SupplyPicker product={b.productId} compact />
        </div>
        {others.length > 0 && <p className="note">{t("shared", { total, others: list(others, lang) })}</p>}
        {spare && <p className="note">{nextClean && nextClean <= 8 ? t("spare", { x: nice(mine / base[id], lang), unitN, k: nextClean }) : t("spareOnly", { x: nice(mine / base[id], lang), unitN })}</p>}
        {nileNote(b)}
        {b.loose && Object.entries(b.loose).map(([prod, amt]) => (
          <p className="note loose" key={prod}>
            <ProductIcon product={prod} fallback="hammer" size={22} />
            <span>{t("looseInput", { good: productName(prod)[lang], rate: nice(Math.round(amt * 60 / b.cycleSeconds * Math.max(mine, total, 1) * 10) / 10, lang) })} {t(prod === "145102" ? "looseObsidian" : "looseOther")}</span>
          </p>
        ))}
        {(row?.extra ?? 0) > 0 && <p className="note">{t("extra", { n: row!.extra })}{countBuilt ? ` ${t("extraCounted")}` : ""}</p>}
      </article>
      {alts.map((a) => altNode(a, id))}
      </Fragment>
    );
  };

  // Insumos que llegan de otra isla.
  const importedInputs = [...new Set(ids.flatMap((id) => Object.keys(buildings[id].inputs).map((x) => buildings[x].productId)))]
    .filter((p) => (cut[p] ?? 0) > 0);
  const islandName = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";
  const setLoad = (k: string, v: number) => {
    const loads = { ...state.ships.loads };
    if (v > 0) loads[k] = v; else delete loads[k];
    setState({ ...state, ships: { ...state.ships, loads } });
  };
  /** Cuánto llega de fuera de cada producto (para toda la isla) y qué supone en cada isla de origen. */
  const inflow = (p: string) => {
    const flows = world.flows.filter((f) => f.to === island.id && f.product === p);
    const total = flows.reduce((a, f) => a + f.rate, 0);
    return (
      <div className="inflow">
        <p className="inflow-total">{t("needToBring", { x: nice(Math.round(total * 10) / 10, lang) })}</p>
        <ul>
          {flows.map((f) => {
            const src = state.islands.find((i) => i.id === f.from);
            const prov = src && providerOf(src.region, p);
            const b = prov && buildings[pick(buildings, modsByIsland[f.from], prov)];
            const eq = b ? f.rate / perMinute(b, modsByIsland[f.from]) : 0;
            return (
              <li key={f.from}>
                <b>{islandName(f.from)}</b>
                <span>{nice(Math.round(f.rate * 10) / 10, lang)} t/min</span>
                {b ? <small>{t("equalsThere", { x: nice(Math.round(eq * 10) / 10, lang), name: (Math.abs(eq - 1) < 0.05 ? b.name : b.plural)[lang].toLowerCase() })}</small>
                  : <small className="warn">{t("cantMakeThere")}</small>}
                {(() => {
                  // Las toneladas que trae el barco de este producto en esta ruta (las mismas que en Rutas).
                  const k = `${[f.from, island.id].sort().join("|")}|${f.from}|${p}`;
                  const tons = state.ships.loads[k] ?? 0;
                  const m = tons > 0 ? tons / f.rate : 0;
                  const when = m >= 120 ? `${nice(Math.round(m / 6) / 10, lang)} h` : `${Math.max(1, Math.round(m))} min`;
                  return (
                    <div className="inflow-ship">
                      <label>
                        <Glyph name="ship" size={16} />
                        <span>{t("weBring")}</span>
                        <NumberField value={tons} onChange={(v) => setLoad(k, v)} max={9999} label={`${t("weBring")} ${productName(p)[lang]} ${t("fromIsland", { island: islandName(f.from) })}`} />
                        <span>{t("tonsPerTrip")}</span>
                      </label>
                      <small>{tons > 0 ? t("lastsReturn", { m: when }) : t("typeTons")}</small>
                    </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const comesFromNames = (p: string) => list(splitExternal(island.id, island.supplies, p).map((s) => islandName(s.from)), lang);
  /** "Llega de A" / "Llega de A 67 % y B 33 %" / "Llega de A (la mitad; el resto aquí)". */
  const comesFrom = (p: string) => {
    const split = splitExternal(island.id, island.supplies, p);
    const f = p === chainRoot.productId ? rootShare : cut[p] ?? 0;
    const names = split.length === 1 ? islandName(split[0].from) : list(split.map((s) => `${islandName(s.from)} ${Math.round(s.share * f * 100)} %`), lang);
    return f < 1 - EPS ? t("comesFromPart", { island: names, pct: Math.round(f * 100) }) : t("comesFrom", { island: names });
  };

  // Etapas: de las materias primas (más profundas) al edificio final.
  const maxDepth = Math.max(...Object.values(depth));
  const groups: string[][] = [];
  for (let d = maxDepth; d >= 1; d--) groups.push(ids.filter((id) => depth[id] === d));
  let idx = 0;

  const toBuild = plan.toBuild.filter((x) => ids.includes(x.id));
  const rateNow = rates.find((r) => r.chainId === chainId);
  let order: { main: ReactNode; sub: string; done?: boolean };
  if (allImported && goal + (status?.fromHouses ?? 0) + imported > EPS)
    order = { main: t("orderAllImported", { island: comesFromNames(chainRoot.productId) }), sub: t("orderAllImportedSub"), done: true };
  else if (n <= EPS) order = { main: t("orderPick", { unit: unitN }), sub: t("orderPickSub") };
  else if (toBuild.length === 0)
    order = { main: finals === 1 ? t("allSetOne") : t("allSet", { all: `${finals} ${unitN}` }), sub: t("allSetSub"), done: true };
  else {
    const parts = toBuild.map((x) => (
      <span key={x.id}><em>{x.count}</em> {lower((x.count === 1 ? buildings[x.id].name : buildings[x.id].plural)[lang])}</span>
    ));
    const joined = parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? ` ${t("and")} ` : ", ", p]));
    const nothingBuilt = ids.every((id) => (island.built[id] ?? 0) === 0);
    const sub = nothingBuilt
      ? t("tapToMark")
      : rateNow?.limitedBy && rateNow.deficit > 0
        ? t("running", { p: nice(r1(rateNow.production), lang), d: nice(r1(rateNow.demand), lang), good: lower(buildings[rateNow.limitedBy].good[lang]) })
        : t("suppliedAll");
    order = { main: <>{t("build")} {joined}</>, sub };
  }

  // Cifras de la cadena en t/min (las mismas que la lista de Cadenas).
  const rate = rateNow;
  const finalRate = perMinute(root, mods);
  const good = lower(chainRoot.good[lang]);
  const fmt = (x: number) => nice(r1(x), lang);
  const pct = rate && rate.demand > 1e-9 ? Math.round(rate.coverage * 100) : null;
  const tone = rate?.state ?? "idle";
  let alert: { tone: "short" | "ok" | "spare" | "accepted"; title: string; sub: string } | null = null;
  if (rate?.state === "short" && rate.accepted) {
    alert = { tone: "accepted", title: t("acceptedTitle", { x: fmt(rate.deficit), good }), sub: t("acceptedSub") };
  } else if (rate?.state === "short") {
    const why = rate.limitedBy ? t("limitedNote", { good: lower(buildings[rate.limitedBy].good[lang]) }) : "";
    const more = rate.toBuild === 1 ? t("shortRateSub1") : rate.toBuild > 1 ? t("shortRateSub", { n: rate.toBuild }) : "";
    alert = { tone: "short", title: t("shortRate", { x: fmt(rate.deficit), good }), sub: [why, more].filter(Boolean).join(" ") };
  } else if (rate?.state === "ok") {
    const pending = rate.toBuild > 0 ? t(rate.toBuild === 1 ? "pendingSub1" : "pendingSub", { n: rate.toBuild }) : "";
    alert = { tone: "ok", title: t("chainCovered"), sub: [rate.surplus > 0.05 ? t("surplusLong", { x: fmt(rate.surplus), good }) : t("chainCoveredSub"), pending].filter(Boolean).join(" ") };
  } else if (rate?.state === "spare") {
    alert = { tone: "spare", title: t("spareChain"), sub: t("spareChainSub", { x: fmt(rate.production), good }) };
  }

  // Por qué falta (o puede faltar): mismas cifras que el resto de la app.
  const causes = rate && rate.state !== "spare"
    ? chainCauses({ island, chain, rate, boosts, world, islands: state.islands, modsByIsland, ships: state.ships, countBuilt })
    : [];
  const causeText = (c: Cause) => {
    switch (c.kind) {
      case "build": return t(c.n === 1 ? "causeBuild1" : "causeBuild", { n: c.n, name: lower((c.n === 1 ? buildings[c.id].name : buildings[c.id].plural)[lang]) });
      case "input": return t("causeInput", { good: lower(buildings[c.id].good[lang]) });
      case "productivity": return t("causeProd", { name: buildings[c.id].name[lang], pct: c.pct });
      case "source": return t("causeSource", { good: lower(productName(c.product)[lang]), island: islandName(c.from) });
      case "route": return c.missing > 0 ? t("causeRouteShips", { island: islandName(c.from), n: c.missing }) : t("causeRouteOver", { island: islandName(c.from) });
    }
  };
  // Lo que viene de fuera puede fallar aunque aquí esté cubierta: se avisa sin contarlo como déficit.
  const warnings = rate?.state === "short" ? [] : causes.filter((c) => c.kind === "source" || c.kind === "route");

  // Desglose de la demanda en t/min: objetivo, casas, otras islas y lo que llega hecho.
  const housesRaw = rootShare > EPS ? Math.max(0, imported / rootShare - goal) : houses;
  const breakdown = [
    { k: "goal", label: target > 0 ? t("bdTarget") : t("bdGoal"), v: goal * finalRate },
    { k: "houses", label: t("bdHouses"), v: housesRaw * finalRate },
    { k: "export", label: t("bdExport"), v: trade * finalRate },
    { k: "imported", label: t("bdImported"), v: -imported * finalRate },
  ].filter((x) => Math.abs(x.v) > 0.005);

  // Productividad de la cadena: el mismo ajuste a mano para todos sus edificios (se conservan las mejoras).
  const manuals = ids.map((id) => island.productivity[id] ?? 0);
  const common = manuals.every((m) => m === manuals[0]) ? manuals[0] : null;
  const sharedIds = ids.filter((id) => Object.keys(plan.byId[id]?.byChain ?? {}).some((c) => c !== chainId));

  // Del principio (materias primas) al final, en el orden de la cadena.
  const ordered = [...groups.flat(), rootId];
  const builtOf = (id: string) => island.built[id] ?? 0;
  const outFlows = world.flows.filter((f) => f.from === island.id && f.product === chainRoot.productId);
  const tradeCount = importedInputs.length + (rootShare > EPS ? 1 : 0) + outFlows.length;
  const goTrade = () => { setView("trade"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const importChip = (p: string) => (
    <button type="button" key={p} className="import-chip" onClick={goTrade}>
      <span className="ship-icon"><ProductIcon product={p} fallback="ship" size={30} /><Glyph name="ship" size={14} /></span>
      <span><b>{productName(p)[lang]}</b><small>{comesFrom(p)}</small></span>
      <UiIcon name="chev" size={16} />
    </button>
  );

  /** Tira con la cadena: materias primas → … → producto final. */
  const strip = (
    <ol className="flow-strip" aria-label={t("flowStrip")}>
      {importedInputs.map((p) => (
        <li key={p} className="fs-step import">
          <span className="ship-icon"><ProductIcon product={p} fallback="ship" size={34} /><Glyph name="ship" size={13} /></span>
          <small>{productName(p)[lang]}</small>
        </li>
      ))}
      {ordered.map((id) => {
        const row = plan.byId[id];
        const miss = row?.missing ?? 0;
        return (
          <li key={id} className={`fs-step ${miss > 0 ? "short" : row && row.recommended > 0 ? "ok" : ""}`}>
            <ProductIcon product={buildings[id].productId} fallback={buildings[id].glyph} size={34} />
            <small>{buildings[id].good[lang]}</small>
            {row && row.recommended + builtOf(id) > 0 && <b className="fs-n">{builtOf(id)}/{row.recommended}</b>}
          </li>
        );
      })}
    </ol>
  );

  /** Lista corta de edificios: construidos / recomendados, lo que falta y − / +. */
  const quickList = (
    <ul className="quick-list">
      {ordered.map((id) => {
        const b = buildings[id];
        const row = plan.byId[id];
        const need = row?.recommended ?? 0;
        const have = builtOf(id);
        const miss = row?.missing ?? 0;
        return (
          <li key={id} className={`quick-row ${miss > 0 ? "short" : need > 0 ? "ok" : ""}`}>
            <ProductIcon product={b.productId} fallback={b.glyph} size={36} />
            <span className="quick-name">
              <b>{b.name[lang]}</b>
              <small>{t("builtOf", { b: have, n: need })}</small>
            </span>
            {miss > 0 ? <span className="missing-pill">{t("missingN", { n: miss })}</span>
              : need > 0 ? <span className="rate-ok" aria-label={t("goalOk")}><UiIcon name="check" size={14} /></span> : null}
            <span className="mini">
              <button type="button" onClick={() => setBuilt(id, have - 1)} disabled={have === 0} aria-label={t("builtLess", { name: b.name[lang] })}>−</button>
              <button type="button" onClick={() => setBuilt(id, have + 1)} aria-label={t("builtMore", { name: b.name[lang] })}>+</button>
            </span>
          </li>
        );
      })}
    </ul>
  );

  /** Flujo en t/min: capacidad de lo construido frente a lo que hace falta en la isla. */
  const flowView = (
    <section className="rate-flow" aria-label={t("viewFlow")}>
      <p className="fine">{t("flowHelp")}</p>
      <ol>
        {importedInputs.map((p) => {
          const inT = world.flows.filter((f) => f.to === island.id && f.product === p).reduce((a, f) => a + f.rate, 0);
          return (
            <li key={p} className="rf-step import">
              <span className="ship-icon"><ProductIcon product={p} fallback="ship" size={36} /><Glyph name="ship" size={14} /></span>
              <span className="rf-main">
                <b>{productName(p)[lang]}</b>
                <small>{t("flowImported", { x: fmt(inT) })} · {comesFromNames(p)}</small>
              </span>
            </li>
          );
        })}
        {ordered.map((id) => {
          const b = buildings[id];
          const row = plan.byId[id];
          const r = perMinute(b, mods);
          const cap = builtOf(id) * r;
          const need = id === rootId && rate ? rate.demand : (row?.exact ?? 0) * r;
          const mineT = base[id] * n * r;
          const cov = need > 1e-9 ? cap / need : cap > 0 ? 1 : 0;
          const st = need <= 1e-9 ? (cap > 0 ? "spare" : "idle") : cap + 0.05 < need ? "short" : "ok";
          const shared = row && Object.entries(row.byChain).some(([c, v]) => c !== chainId && v > 0);
          return (
            <li key={id} className={`rf-step ${st}`}>
              <ProductIcon product={b.productId} fallback={b.glyph} size={36} />
              <span className="rf-main">
                <span className="rate-top">
                  <b>{b.good[lang]}</b>
                  <span className="rate-nums">{need > 1e-9 ? t("rateOf", { p: fmt(cap), d: fmt(need) }) : t("rateNoDemand", { p: fmt(cap) })}</span>
                </span>
                <span className="rate-bottom">
                  <CoverBar value={cov} tone={st === "short" ? "short" : st === "spare" ? "spare" : "ok"} />
                  {need > 1e-9 && <span className={`pct-pill ${st}`}>{Math.round(cov * 100)} %</span>}
                </span>
                <small className="rate-note">
                  {t("flowPer", { n: builtOf(id), name: lower((builtOf(id) === 1 ? b.name : b.plural)[lang]), r: r.toLocaleString(lang, { maximumFractionDigits: 2 }) })}
                  {shared && mineT > 1e-9 ? ` · ${t("flowShared", { x: fmt(mineT) })}` : ""}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );

  const tradeView = (
    <section className="trade-view" aria-label={t("viewTrade")}>
      {tradeCount === 0 && trade <= EPS && (
        <div className="card empty-card">
          <p>{t("tradeNone")}</p>
          <p className="fine">{t("tradeNoneHint")}</p>
        </div>
      )}
      {(rootShare > EPS || importedInputs.length > 0) && <h3 className="cat-t">{t("tradeIn")}</h3>}
      {rootShare > EPS && (
        <article className="node import-node final-import ok" aria-label={chain.product[lang]}>
          <div className="node-top">
            <span className="ship-icon"><ProductIcon product={chainRoot.productId} fallback="ship" size={44} /><Glyph name="ship" size={18} /></span>
            <div className="node-name">
              <h3>{chain.product[lang]}</h3>
              <span className="en">{comesFrom(chainRoot.productId)}</span>
            </div>
          </div>
          {imported > EPS && <p className="per">{t("importedFinals", { x: nice(Math.round(imported * 10) / 10, lang), unitN })}</p>}
          {inflow(chainRoot.productId)}
          {trade > EPS && <p className="per">{t("tradeStillHere")}</p>}
          <SupplyPicker product={chainRoot.productId} compact />
        </article>
      )}
      {importedInputs.map((p) => (
        <article key={p} className="node supplier import-node ok" aria-label={productName(p)[lang]}>
          <div className="node-top">
            <span className="ship-icon"><ProductIcon product={p} fallback="ship" size={44} /><Glyph name="ship" size={18} /></span>
            <div className="node-name">
              <h3>{productName(p)[lang]}</h3>
              <span className="en">{comesFrom(p)}</span>
            </div>
          </div>
          {inflow(p)}
          <SupplyPicker product={p} compact />
        </article>
      ))}
      {(outFlows.length > 0 || trade > EPS) && (
        <>
          <h3 className="cat-t">{t("tradeOut")}</h3>
          <div className="card out-card">
            {trade > EPS && <p className="from-houses"><Glyph name="ship" size={18} /> {t("fromTradeNote", { x: nice(trade, lang), unitN })}</p>}
            <ul className="out-list">
              {outFlows.map((f) => (
                <li key={f.to}>
                  <b>{islandName(f.to)}</b>
                  <span>{fmt(f.rate)} t/min</span>
                  <small>{t("equalsHere", { x: nice(Math.round((f.rate / finalRate) * 10) / 10, lang), name: (Math.abs(f.rate / finalRate - 1) < 0.05 ? root.name : root.plural)[lang].toLowerCase() })}</small>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );

  const buildingsSection = (
        <section className="chain" aria-labelledby="chain-title">
          <div className="chain-head">
            <h2 id="chain-title">{t("yourChain")}</h2>
            {clean && (
              <span className="ratio" aria-label={`${t("ratio")} ${ids.map((id) => `${clean.counts[id]} ${buildings[id].name[lang]}`).join(", ")}`}>
                {t("ratio")}
                {[...ids].reverse().map((id) => (
                  <span key={id} className="ratio-chip"><ProductIcon product={buildings[id].productId} fallback={buildings[id].glyph} size={22} />{clean.counts[id]}</span>
                ))}
              </span>
            )}
          </div>
          {rootShare > EPS && importChip(chainRoot.productId)}
          {!allImported && <div className="flow" key={chainId}>
            {importedInputs.length > 0 && (
              <div className="stage">
                <div className="suppliers imports">{importedInputs.map(importChip)}</div>
                <div className="flow-end" aria-hidden="true" />
              </div>
            )}
            {groups.map((g, gi) => (
              <div key={gi} className="stage">
                <div className="suppliers">{g.map((id) => node(id, idx++))}</div>
                <div className="flow-end" aria-hidden="true" />
              </div>
            ))}
            {node(rootId, idx)}
          </div>}
        </section>
        );

  return (
    <div className={`chain-screen${sideBuildings ? " chain-3col" : ""}${wide ? " in-split" : ""}`}>
      {(!wide || from) && (
        <button type="button" className="back" onClick={back}>
          <span aria-hidden="true">‹</span> {from === "build" ? t("backToBuild") : t("back")}
        </button>
      )}
      <header className="chain-header chain-hero">
        <span className="chain-hero-icon"><ProductIcon product={chainRoot.productId} fallback={chainRoot.glyph} size={60} /></span>
        <div>
          <span className="eyebrow">{chain.region} · {categoryName[chain.category][lang]}</span>
          <h1>{chain.product[lang]}</h1>
          {lang === "es" && <span className="sub">{chain.product.en}</span>}
        </div>
      </header>

      <div className={`rate-cards ${tone}`}>
        <div className="rate-card"><small>{t("statDemand")}</small><b>{fmt(rate?.demand ?? 0)}</b><span>t/min</span></div>
        <div className="rate-card"><small>{t("statProduction")}</small><b>{fmt(rate?.production ?? 0)}</b><span>t/min</span></div>
        <div className={`rate-card cover ${tone}`}><small>{t("statCoverage")}</small><b>{pct === null ? "—" : `${pct} %`}</b>
          {rate && <CoverBar value={rate.coverage} tone={rate.state} />}
        </div>
      </div>
      {alert && (
        <div className={`chain-alert ${alert.tone}`} role="status">
          <UiIcon name={alert.tone === "short" || alert.tone === "accepted" ? "alert" : "check"} size={20} />
          <div><b>{alert.title}</b>{alert.sub && <small>{alert.sub}</small>}</div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="chain-alert warn" role="note">
          <UiIcon name="alert" size={20} />
          <div><b>{t("warningsTitle")}</b>{warnings.map((c, i) => <small key={i}>{causeText(c)}</small>)}</div>
        </div>
      )}

      <div className="chain-main">
      <ViewTabs<View> label={t("chainViews")} value={view} onChange={setView}
        options={[
          { v: "summary", text: t("viewSummary") },
          ...(sideBuildings ? [] : [{ v: "buildings" as View, text: t("viewBuildings"), n: toBuild.length ? toBuild.reduce((a, x) => a + x.count, 0) : undefined }]),
          { v: "flow", text: t("viewFlow") },
          { v: "trade", text: t("viewTrade"), n: tradeCount || undefined },
        ]} />

      {view === "summary" && (
        <>
          {rate?.state === "short" && (
            <section className="card causes" aria-labelledby="causes-t">
              <h2 id="causes-t" className="section-t">{t("causesTitle")}</h2>
              {causes.length > 0
                ? <ul className="cause-list">{causes.map((c, i) => <li key={i} className={`cause ${c.kind}`}>{causeText(c)}</li>)}</ul>
                : <p className="fine">{t("causesNone")}</p>}
              <div className="row-actions wrap">
                {rate.accepted
                  ? <button type="button" className="ghost-btn" onClick={() => setAccepted(chainId, false)}>{t("acceptUndo")}</button>
                  : <button type="button" className="ghost-btn" onClick={() => setAccepted(chainId, true)}>{t("acceptDeficit")}</button>}
              </div>
              {!rate.accepted && <p className="fine">{t("acceptHelp")}</p>}
            </section>
          )}
          <section className="goal card" aria-labelledby="goal-q">
            <div className="goal-top">
              <h2 id="goal-q">{unitMode === "rate" ? t("howManyRate", { good }) : t("howMany", { unit: unitN })}</h2>
              <Segmented<"count" | "rate"> label={t("goalUnit")} value={unitMode} onChange={setUnitMode}
                options={[["count", t("unitBuildings")], ["rate", "t/min"]]} />
            </div>
            {unitMode === "rate" ? (
              <>
                <Stepper value={target} onChange={(v) => setTarget(chainId, v)} unit="t/min" decimal step={1} max={9999}
                  label={t("targetRateLabel", { good })} lessLabel={t("rateLess")} moreLabel={t("rateMore")} />
                <p className="fine goal-eq">
                  {target > 0 ? t("targetEq", { x: nice(Math.round((target / finalRate) * 10) / 10, lang), unit: unitN }) : goalCount > 0 ? t("goalNowCount", { n: goalCount, unit: goalCount === 1 ? unit1 : unitN }) : t("targetHelp")}
                </p>
              </>
            ) : (
              <>
                <Stepper value={goalCount} onChange={(v) => setGoal(chainId, v)} unit={goalCount === 1 ? unit1 : unitN} lessLabel={t("oneLess")} moreLabel={t("oneMore")} />
                {target > 0 && <p className="fine goal-eq">{t("goalNowRate", { x: fmt(target) })}</p>}
              </>
            )}
            {trade > EPS && (
              <p className="from-houses"><Glyph name="ship" size={18} /> {t("fromTradeNote", { x: nice(trade, lang), unitN })}</p>
            )}
            {houses > EPS && (
              <p className="from-houses">
                <Glyph name="house" size={18} /> {t("fromHouses", { x: nice(houses, lang), unitN, total: finals })}
              </p>
            )}
            {clean && clean.finals <= 6 && (
              <div className="picks">
                <span>{t("clean")}</span>
                {[1, 2, 3, 4].map((m) => {
                  const v = clean.finals * m;
                  return <button type="button" key={v} aria-pressed={!target && v === goalCount} onClick={() => setGoal(chainId, v)}>{v}</button>;
                })}
              </div>
            )}
          </section>
          {rate && rate.state !== "spare" && breakdown.length > 0 && (
            <section className="card breakdown" aria-labelledby="bd-t">
              <h2 id="bd-t" className="section-t">{t("bdTitle")}</h2>
              <dl className="bd-list">
                {breakdown.map((x) => (
                  <div key={x.k} className={`bd-row ${x.k}`}>
                    <dt>{x.label}</dt><dd>{x.v < 0 ? "−" : ""}{fmt(Math.abs(x.v))} t/min</dd>
                  </div>
                ))}
                {outFlows.length > 0 && (
                  <div className="bd-sub"><dt className="sr">{t("bdExport")}</dt><dd>{outFlows.map((f) => `${islandName(f.to)} ${fmt(f.rate)}`).join(" · ")}</dd></div>
                )}
                <div className="bd-row total"><dt>{t("bdDemand")}</dt><dd>{fmt(rate.demand)} t/min</dd></div>
                <div className="bd-row"><dt>{t("statProduction")}</dt><dd>{fmt(rate.production)} t/min</dd></div>
                {rate.surplus > 0.05 && <div className="bd-row surplus"><dt>{t("bdSurplus")}</dt><dd>+{fmt(rate.surplus)} t/min</dd></div>}
                {rate.deficit > 0 && <div className="bd-row deficit"><dt>{t("bdDeficit")}</dt><dd>−{fmt(rate.deficit)} t/min</dd></div>}
              </dl>
              {rate.surplus > 0.05 && <p className="fine">{t("bdSurplusNote")}</p>}
            </section>
          )}
          {!allImported && (
            <details className="card chain-prod">
              <summary>
                <span>{t("chainProdTitle")}</span>
                <b>{common === null ? t("chainProdMixed") : common === 0 ? t("chainProdNone") : `${common > 0 ? "+" : ""}${common} %`}</b>
              </summary>
              <p className="fine">{t("chainProdHelp")}</p>
              <div className="prod-row">
                <span>{t("prodManual")}</span>
                <span className="mini">
                  <button type="button" onClick={() => setProductivityMany(ids, (common ?? Math.min(...manuals)) - 10)} disabled={common !== null && common <= -90} aria-label={t("chainProdLess")}>−</button>
                  <b className="prod-val">{common === null ? "—" : `${common > 0 ? "+" : ""}${common} %`}</b>
                  <button type="button" onClick={() => setProductivityMany(ids, (common ?? Math.max(...manuals)) + 10)} disabled={common !== null && common >= 500} aria-label={t("chainProdMore")}>+</button>
                </span>
              </div>
              <ul className="prod-list">
                {ids.map((id) => (
                  <li key={id}><span>{buildings[id].name[lang]}{boosts[id]?.observed ? <small className="tag">{t("prodObservedTag")}</small> : null}</span><b>{totalPct(boosts[id]).toLocaleString(lang, { maximumFractionDigits: 1 })} %</b></li>
                ))}
              </ul>
              {ids.some((id) => boosts[id]?.observed) && <p className="fine">{t("chainProdObserved")}</p>}
              {sharedIds.length > 0 && <p className="fine">{t("chainProdShared", { list: list(sharedIds.map((id) => buildings[id].name[lang]), lang) })}</p>}
            </details>
          )}
          {!allImported && (
            <section className="summary-chain" aria-labelledby="strip-t">
              <div className="chain-head">
                <h2 id="strip-t" className="section-t">{t("flowStrip")}</h2>
                <button type="button" className="ghost-btn" onClick={() => setView("flow")}>{t("viewFlow")} <UiIcon name="chev" size={14} /></button>
              </div>
              {strip}
            </section>
          )}
          {!allImported && !sideBuildings && (
            <section aria-labelledby="quick-t">
              <div className="chain-head">
                <h2 id="quick-t" className="section-t">{t("viewBuildings")}</h2>
                <button type="button" className="ghost-btn" onClick={() => setView("buildings")}>{t("seeDetail")} <UiIcon name="chev" size={14} /></button>
              </div>
              {quickList}
            </section>
          )}
          {allImported && <button type="button" className="ghost-btn" onClick={goTrade}>{t("viewTrade")} <UiIcon name="chev" size={14} /></button>}
        </>
      )}

      {view === "buildings" && buildingsSection}

      {view === "flow" && flowView}
      {view === "trade" && tradeView}
      </div>
      {sideBuildings && <aside className="chain-side" aria-label={t("viewBuildings")}>{buildingsSection}</aside>}

      {createPortal(
        <div className={`order${order.done ? " done" : ""}`} role="status" aria-live="polite">
          <div className="order-in">
            <div className="do">{order.main}</div>
            <div className="status">{order.sub}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
