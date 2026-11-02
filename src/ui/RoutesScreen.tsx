import { useMemo, useState } from "react";
import { chainById, productName, providerOf } from "../data/catalog";
import { perFinal } from "../core/plan";
import { routeGaps, tradeRoutes, type RouteGap } from "../core/routes";
import { nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { NumberField, RegionChip, Segmented, Stepper } from "./parts";
import { DEFAULT_CAPACITY, assignBoat, boatOf, boatsIn, perShipDeadline, planLeg, shipsNeeded } from "../core/ships";
import { ProductIcon } from "./Emblems";

type View = "route" | "island";
const VIEW_KEY = "anno117-routes-view";

export function RoutesScreen() {
  const { state, world, t, lang, go, setState } = useApp();
  const ships = state.ships;
  const setShips = (patch: Partial<typeof ships>) => setState({ ...state, ships: { ...ships, ...patch } });
  const setTime = (key: string, min: number) => {
    const times = { ...ships.times };
    if (min > 0) times[key] = Math.min(600, min); else delete times[key];
    setShips({ times });
  };
  const tons = (n: number) => `${Math.round(n).toLocaleString(lang)} t`;
  const fmtMin = (m: number) => (m >= 120 ? `${nice(Math.round(m / 6) / 10, lang)} h` : `${Math.max(1, Math.round(m))} min`);
  const setLoad = (k: string, v: number) => {
    const loads = { ...ships.loads };
    if (v > 0) loads[k] = v; else delete loads[k];
    setShips({ loads });
  };
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === "island" ? "island" : "route"; } catch { return "route"; } });
  const [focus, setFocus] = useState<string | null>(null);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  const routes = useMemo(() => tradeRoutes(world.flows), [world.flows]);
  const gaps = useMemo(() => routeGaps(world), [world]);
  const byId = Object.fromEntries(state.islands.map((i) => [i.id, i]));
  const me = state.session?.player;
  const name = (id: string) => byId[id]?.name ?? "?";
  const rate = (r: number) => `${nice(Math.round(r * 10) / 10, lang)} ${t("perMinUnit")}`;
  const pname = (p: string) => productName(p)[lang];
  const mine = (id: string) => state.mode !== "versus" || !me || !byId[id]?.owner || byId[id].owner === me;
  const dot = (id: string) => (
    <span className={`who${mine(id) ? "" : " friend"}`} title={state.mode === "versus" ? byId[id]?.owner : undefined} aria-hidden="true" />
  );
  const total = world.flows.reduce((s, f) => s + f.rate, 0);
  const shipRoutes = routes.reduce((n, r) => {
    const keys = [...r.ab.map((x) => `${r.a}|${r.b}|${r.a}|${x.product}`), ...r.ba.map((x) => `${r.a}|${r.b}|${r.b}|${x.product}`)];
    return n + boatsIn(ships.boats, keys).length;
  }, 0);

  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* opcional */ } };
  const toggle = (key: string) => setClosed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  /** Lleva a donde se arregla: la obra de la isla (casas) o la cadena que trae el producto. */
  const fix = (g: RouteGap) => {
    const isl = byId[g.to];
    if (!isl) return;
    setState({ ...state, current: g.to });
    if (g.kind === "cantMake") {
      const b = providerOf(isl.region, g.product);
      const chain = world.plans[g.to]?.chains.map((c) => chainById[c.chainId]).find((c) => c && b && b in perFinal(c));
      if (chain) return go({ tab: "chains", chain: chain.id });
    }
    go({ tab: "build" });
  };

  if (state.islands.length < 2 || (routes.length === 0 && gaps.length === 0)) {
    return (
      <div className="routes-screen">
        <header className="screen-head">
          <h1>{t("routesTitle")}</h1>
          <p>{t("routesSub")}</p>
        </header>
        <div className="empty card">
          <Glyph name="ship" size={48} />
          <p>{state.islands.length < 2 ? t("routesNeedIslands") : t("routesEmpty")}</p>
          <button type="button" className="primary" onClick={() => go(state.islands.length < 2 ? { tab: "islands" } : { tab: "chains" })}>
            {state.islands.length < 2 ? t("tabIslands") : t("tabChains")}
          </button>
        </div>
      </div>
    );
  }

  const visibleRoutes = routes.filter((r) => !focus || r.a === focus || r.b === focus);
  const connected = (id: string) => !focus || id === focus || world.flows.some((f) => (f.from === focus && f.to === id) || (f.to === focus && f.from === id));
  const islands = state.islands.filter((i) => connected(i.id));

  return (
    <div className="routes-screen">
      <header className="screen-head">
        <h1>{t("routesTitle")}</h1>
        <p>{t("routesSub")}</p>
        <div className="route-stats">
          <span><b>{state.islands.length}</b>{t("statIslands")}</span>
          <span><b>{shipRoutes}</b>{t("statRoutes")}</span>
          <span><b>{nice(Math.round(total * 10) / 10, lang)}</b>{t("statMoving")}</span>
        </div>
        <label className="ship-cap">
          <Glyph name="ship" size={20} />
          <span>{t("shipCapacity")}</span>
          <NumberField value={ships.capacity || DEFAULT_CAPACITY} onChange={(v) => setShips({ capacity: v })} max={100000} label={t("shipCapacity")} />
          <span>t</span>
        </label>
      </header>

      {gaps.length > 0 && (
        <section className="gaps" aria-labelledby="gaps-t">
          <h2 id="gaps-t">{t("gapsTitle", { n: gaps.length })}</h2>
          {gaps.map((g, i) => (
            <div className="gap-row" key={`${g.kind}-${g.product}-${g.to}-${i}`}>
              <strong className="gname"><ProductIcon product={g.product} fallback="ship" size={30} />{pname(g.product)} → {name(g.to)} <span>{rate(g.rate)}</span></strong>
              <small>{g.kind === "noSource" ? t("gapNoSource") : t("gapCantMake", { island: name(g.from) })}</small>
              <button type="button" onClick={() => fix(g)}>{t("gapFix")}</button>
            </div>
          ))}
        </section>
      )}

      <Segmented<View> label={t("routesView")} value={view} onChange={pickView} options={[["route", t("byRoute")], ["island", t("byIsland")]]} />

      <div className="route-filter" role="group" aria-label={t("filterIsland")}>
        <button type="button" aria-pressed={!focus} onClick={() => setFocus(null)}>{t("all")}</button>
        {state.islands.map((i) => (
          <button type="button" key={i.id} aria-pressed={focus === i.id} onClick={() => setFocus(focus === i.id ? null : i.id)}>
            {dot(i.id)}{i.name}
          </button>
        ))}
      </div>

      {view === "route" ? (
        <div className="route-list">
          {visibleRoutes.length === 0 && <p className="fine">{t("noRoutesFor", { island: name(focus ?? "") })}</p>}
          {visibleRoutes.map((r, i) => {
            let { a, b, ab, ba } = r;
            if (focus === b) [a, b, ab, ba] = [b, a, ba, ab];
            const key = `${r.a}|${r.b}`;
            const open = !closed.has(key);
            const cross = byId[a]?.region !== byId[b]?.region;
            const other = !mine(a) ? byId[a]?.owner : !mine(b) ? byId[b]?.owner : undefined;
            const T = ships.times[key] ?? 0;
            const cap = ships.capacity || DEFAULT_CAPACITY;
            const loadKey = (from: string, product: string) => `${key}|${from}|${product}`;
            const fixedFor = (from: string) =>
              Object.fromEntries(Object.entries(ships.loads).filter(([k]) => k.startsWith(`${key}|${from}|`)).map(([k, v]) => [k.split("|").pop()!, v]));
            const allKeys = [...ab.map((x) => loadKey(a, x.product)), ...ba.map((x) => loadKey(b, x.product))];
            const groups = boatsIn(ships.boats, allKeys);
            const multi = groups.length > 1;
            const boats = groups.map((n) => {
              const inBoat = (from: string) => (x: { product: string }) => boatOf(ships.boats, loadKey(from, x.product)) === n;
              const capKey = `${key}#${n}`;
              const c = ships.caps[capKey] || cap;
              const legAB = planLeg(ab.filter(inBoat(a)), c, fixedFor(a));
              const legBA = planLeg(ba.filter(inBoat(b)), c, fixedFor(b));
              const deadline = Math.min(legAB.deadline, legBA.deadline);
              const limiting = [...legAB.loads, ...legBA.loads].find((x) => x.minutes === deadline);
              const count = ships.counts[capKey] ?? 1;
              return { n, capKey, c, legAB, legBA, deadline, limiting, count, perShip: perShipDeadline(deadline, count), nShips: shipsNeeded(T, deadline) };
            });
            const tripLine = (bt: { count: number; nShips: number }, cls: string) =>
              bt.count >= bt.nShips
                ? <p className={`${cls} ok`}>{bt.count > 1 ? t("tripOk", { k: bt.count }) : t("shipsOne2")}</p>
                : <p className={`${cls} short`}>{t("tripShort", { n: bt.nShips, k: bt.count })}</p>;
            const pick = (from: string, product: string) => {
              if (allKeys.length < 2) return null;
              const k = loadKey(from, product);
              const cur = boatOf(ships.boats, k);
              const alone = allKeys.filter((x) => boatOf(ships.boats, x) === cur).length === 1;
              return (
                <select className="boat-pick" value={cur} aria-label={t("boatOf", { good: pname(product) })}
                  onChange={(e) => setShips(assignBoat({ boats: ships.boats, caps: ships.caps, counts: ships.counts }, key, allKeys, k, Number(e.target.value)))}>
                  {groups.map((n, i) => <option key={n} value={n}>{t("boatN", { n: i + 1 })}</option>)}
                  {!alone && <option value={groups[groups.length - 1] + 1}>{t("boatNew")}</option>}
                </select>
              );
            };
            const side = (from: string, to: string, leg: ReturnType<typeof planLeg>, c: number) =>
              leg.loads.length > 0 && (
                <div className="route-dir">
                  <h3>{name(from)} → {name(to)}<span className={`trip-total${leg.over ? " over" : ""}`}>{tons(leg.total)} / {tons(c)}</span></h3>
                  <ul>{leg.loads.map((x) => (
                    <li key={x.product}>
                      <span className="gname"><ProductIcon product={x.product} fallback="ship" size={28} /><span className="gtext">{pname(x.product)}{pick(from, x.product)}</span></span>
                      <span className="cargo">
                        <span className={`cargo-t${x.fixed ? " fixed" : ""}`}>
                          <NumberField value={x.fixed ? Math.round(x.load) : 0} placeholder={String(Math.round(x.load))} onChange={(v) => setLoad(loadKey(from, x.product), v)} max={9999} label={`${t("cargoOf", { good: pname(x.product) })}: ${name(from)} → ${name(to)}`} />
                          <span>t</span>
                        </span>
                        <small>{t("lasts", { m: fmtMin(x.minutes) })} · {rate(x.rate)}</small>
                      </span>
                    </li>
                  ))}</ul>
                  {leg.over && <p className="fine warn">{t("cargoOver")}</p>}
                </div>
              );
            return (
              <article className={`route card${open ? "" : " closed"}`} key={key} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <button type="button" className="route-top" aria-expanded={open} onClick={() => toggle(key)}>
                  <span className="ship"><Glyph name="ship" size={26} /></span>
                  <span className="pair">
                    <span>{dot(a)}{name(a)}</span><span className="x" aria-label={t("andBack")}>⇄</span><span>{dot(b)}{name(b)}</span>
                    {cross && <span className="tag cross">{t("crossRegion")}</span>}
                    {other && <span className="tag friend">{t("withPlayer", { name: other })}</span>}
                  </span>
                  <span className="load"><b>{nice(Math.round(r.total * 10) / 10, lang)}</b>{t("perMinUnit")}<span className="chev" aria-hidden="true">▾</span></span>
                </button>
                {open && <>
                  {boats.map((bt, bi) => (
                    <section className={`boat${multi ? " multi" : ""}`} key={bt.n} aria-label={multi ? t("boatN", { n: bi + 1 }) : undefined}>
                      <div className="boat-head">
                        {multi && <b>{t("boatN", { n: bi + 1 })}</b>}
                        <div className="boat-count">
                          <span>{t("boatCount")}</span>
                          <Stepper size="sm" value={bt.count} max={50} unit="" lessLabel={`− ${t("boatCountOf", { route: t("boatN", { n: bi + 1 }) })}`} moreLabel={`+ ${t("boatCountOf", { route: t("boatN", { n: bi + 1 }) })}`}
                            label={t("boatCountOf", { route: t("boatN", { n: bi + 1 }) })}
                            onChange={(v) => { const counts = { ...ships.counts }; if (v > 1) counts[bt.capKey] = Math.min(50, v); else delete counts[bt.capKey]; setShips({ counts }); }} />
                        </div>
                        {multi && (
                          <label>
                            <span>{t("boatCarries")}</span>
                            <NumberField value={ships.caps[bt.capKey] ?? 0} placeholder={String(cap)} max={100000} label={`${t("boatCarries")} · ${t("boatN", { n: bi + 1 })}`}
                              onChange={(v) => { const caps = { ...ships.caps }; if (v > 0) caps[bt.capKey] = v; else delete caps[bt.capKey]; setShips({ caps }); }} />
                            <span>t</span>
                          </label>
                        )}
                      </div>
                      {Number.isFinite(bt.deadline) && (
                        <p className="trip-deadline">
                          {t(bt.count > 1 ? "mustReturnN" : "mustReturn", { m: fmtMin(bt.perShip) })}
                          {bt.count > 1 && <small>{t("arrivesEvery", { k: bt.count, m: fmtMin(bt.deadline) })}</small>}
                          {bt.limiting && <small>{t("limitedBy", { good: pname(bt.limiting.product).toLowerCase() })}</small>}
                        </p>
                      )}
                      {side(a, b, bt.legAB, bt.c)}{side(b, a, bt.legBA, bt.c)}
                      {T > 0 && multi && tripLine(bt, "trip-ships boat-ships")}
                    </section>
                  ))}
                  <details className="trip-more" open={T > 0}>
                    <summary>{t("knowTrip")}</summary>
                    <div className="trip">
                    <label>
                      <span>{t("roundTrip")}</span>
                      <NumberField value={T} onChange={(v) => setTime(key, v)} max={600} label={`${t("roundTrip")}: ${name(a)} – ${name(b)}`} />
                      <span>min</span>
                    </label>
                    {T > 0 && !multi && tripLine(boats[0], "trip-ships")}
                    {T > 0 && multi && <p className="fine">{t("shipsPerRoute")}</p>}
                    </div>
                  </details>
                </>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="route-list">
          {islands.map((isl, i) => {
            const inn = world.flows.filter((f) => f.to === isl.id).sort((x, y) => y.rate - x.rate);
            const out = world.flows.filter((f) => f.from === isl.id).sort((x, y) => y.rate - x.rate);
            const own = gaps.filter((g) => g.to === isl.id);
            const deps = new Set(out.map((f) => f.to)).size;
            return (
              <article className="isl-io card" key={isl.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                <div className="isl-io-top">
                  <h3>{dot(isl.id)}{isl.name} <RegionChip region={isl.region} /></h3>
                  <span className="deps">{deps ? t(deps === 1 ? "dependsOne" : "dependsMany", { n: deps }) : t("dependsNone")}</span>
                </div>
                <div className="io">
                  <div>
                    <h4>{t("receivesShort")}</h4>
                    {inn.map((f) => <p key={f.product + f.from}>{pname(f.product)} · {rate(f.rate)}<small>{t("fromIsland", { island: name(f.from) })}</small></p>)}
                    {own.map((g, k) => <p key={"g" + k} className="gap">{pname(g.product)} · {rate(g.rate)}<small>{t("noRoute")}</small></p>)}
                    {!inn.length && !own.length && <p className="none">{t("nothing")}</p>}
                  </div>
                  <div>
                    <h4>{t("sendsShort")}</h4>
                    {out.map((f) => <p key={f.product + f.to}>{pname(f.product)} · {rate(f.rate)}<small>{t("toIsland", { island: name(f.to) })}</small></p>)}
                    {!out.length && <p className="none">{t("nothing")}</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="fine">{t("routesHint")}</p>
    </div>
  );
}
