import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { alternativesOf, buildings, categoryName, chainById, levelOfWorkforce, productName, providerOf } from "../data/catalog";
import { cleanRatio, perFinalCut, perMinute, perText, pick, stages } from "../core/plan";
import { externalShares, splitExternal } from "../core/supply";
import { list, nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon, WorkerGlyph } from "./Emblems";
import { BuiltCounter, NumberField, Pips, ProductivityControl, Segmented, Stepper, SupplyPicker, Tick } from "./parts";

const EPS = 1e-6;

export function ChainScreen({ chainId }: { chainId: string }) {
  const { state, setState, island, plan, world, t, lang, setGoal, back, mods, modsByIsland, setProducer } = useApp();
  const chain = chainById[chainId];
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
  const goal = island.goals[chainId] ?? 0;
  const status = plan.chains.find((c) => c.chainId === chainId);
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

  const node = (id: string, i: number) => {
    const b = buildings[id];
    const isRoot = id === rootId;
    const exact = base[id] * n;
    const mine = Math.ceil(exact - EPS);
    const row = plan.byId[id];
    const total = row?.recommended ?? 0;
    const missing = row?.missing ?? 0;
    const others = row
      ? Object.entries(row.byChain).filter(([c, v]) => c !== chainId && v > 0).map(([c]) => lower(chainById[c].product[lang]))
      : [];
    const state = n <= EPS ? "idle" : missing > 0 ? "short" : "ok";
    const [a, k] = perText(base[id]);
    const spare = !isRoot && others.length === 0 && mine - exact > EPS;
    const consumers = (feeds[id] ?? []).filter((c) => b.glyph === "fire" || c !== rootId || depth[id] > 1);
    const workers = b.workers && levelOfWorkforce(b.workers.level);
    return (
      <article key={id} className={`node ${isRoot ? "final" : "supplier"} ${state}`} style={{ ["--i" as string]: i }} aria-label={b.name[lang]}>
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
          </>
        )}
        {alternativesOf(b.region, b.productId).length > 1 && (
          <div className="alt">
            <span className="label">{t("producer")}</span>
            <Segmented label={t("producer")} value={id}
              onChange={(v) => setProducer(b.productId, v === alternativesOf(b.region, b.productId)[0] ? null : v)}
              options={alternativesOf(b.region, b.productId).map((a) => [a, `${buildings[a].name[lang]} · ${buildings[a].cycleSeconds} s`] as [string, string])} />
          </div>
        )}
        <div className="node-tools">
          <ProductivityControl id={id} />
          <SupplyPicker product={b.productId} compact />
        </div>
        {others.length > 0 && <p className="note">{t("shared", { total, others: list(others, lang) })}</p>}
        {spare && <p className="note">{nextClean && nextClean <= 8 ? t("spare", { x: nice(mine / base[id], lang), unitN, k: nextClean }) : t("spareOnly", { x: nice(mine / base[id], lang), unitN })}</p>}
        {(row?.extra ?? 0) > 0 && <p className="note">{t("extra", { n: row!.extra })}</p>}
      </article>
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
      : status?.bottleneck
        ? t("running", { r: status.running, b: status.builtFinals, unit: status.builtFinals === 1 ? unit1 : unitN, good: lower(buildings[status.bottleneck].good[lang]) })
        : t("suppliedAll");
    order = { main: <>{t("build")} {joined}</>, sub };
  }

  return (
    <div className="chain-screen">
      <button type="button" className="back" onClick={back}>
        <span aria-hidden="true">‹</span> {t("back")}
      </button>
      <header className="chain-header">
        <span className="eyebrow">{chain.region} · {categoryName[chain.category][lang]}</span>
        <h1>{chain.product[lang]}</h1>
        {lang === "es" && <span className="sub">{chain.product.en}</span>}
      </header>

      <section className="goal card" aria-labelledby="goal-q">
        <h2 id="goal-q">{t("howMany", { unit: unitN })}</h2>
        <Stepper value={goal} onChange={(v) => setGoal(chainId, v)} unit={goal === 1 ? unit1 : unitN} lessLabel={t("oneLess")} moreLabel={t("oneMore")} />
        {trade > EPS && (
          <p className="from-houses"><Glyph name="ship" size={18} /> {t("fromTradeNote", { x: nice(trade, lang), unitN })}</p>
        )}
        {(status?.surplus ?? 0) > 0.05 && (
          <p className="surplus-note">{t("surplusLong", { x: nice(Math.round(status!.surplus * 10) / 10, lang), good: lower(chainRoot.good[lang]) })}</p>
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
              return <button type="button" key={v} aria-pressed={v === goal} onClick={() => setGoal(chainId, v)}>{v}</button>;
            })}
          </div>
        )}
      </section>

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
        {!allImported && <div className="flow" key={chainId}>
          {importedInputs.length > 0 && (
            <div className="stage">
              <div className="suppliers">
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
              </div>
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
