import { useMemo, useState } from "react";
import { buildings, chains, productName } from "../data/catalog";
import { circuitAdvice, circuitCover, moveStop, newCircuit, planCircuit, SLOT_TONS, type Circuit, type CircuitCargo, type CircuitIssue } from "../core/circuits";
import { nice } from "../i18n";
import { useApp } from "./context";
import { Glyph } from "./Glyph";
import { ProductIcon } from "./Emblems";
import { NumberField, Stepper, UiIcon } from "./parts";

/**
 * Circuitos con varias paradas: el barco visita las islas en orden y en cada una carga o descarga.
 * Calcula lo que va a bordo en cada tramo, las bodegas que ocupa y si llega lo que pide el plan.
 * Las rutas de dos islas siguen como siempre; lo que lleva un circuito deja de contarse en ellas.
 */
export function CircuitsPanel() {
  const { state, setState, world, t, lang } = useApp();
  const circuits = state.ships.circuits ?? [];
  const [openId, setOpenId] = useState<string | null>(circuits[0]?.id ?? null);
  const save = (next: Circuit[]) => setState({ ...state, ships: { ...state.ships, circuits: next } });
  const put = (c: Circuit) => save(circuits.map((x) => (x.id === c.id ? c : x)));
  const name = (id: string) => state.islands.find((i) => i.id === id)?.name ?? "?";
  const pname = (p: string) => productName(p)[lang];
  const r1 = (n: number) => nice(Math.round(n * 10) / 10, lang);
  const cover = useMemo(() => circuitCover(circuits, world.flows), [circuits, world.flows]);

  // Productos que se pueden cargar: los que mueve el plan y los de cualquier cadena del catálogo.
  const products = useMemo(() => {
    const ids = new Set<string>(world.flows.map((f) => f.product));
    for (const c of chains) ids.add(String(buildings[c.root].productId));
    return [...ids].sort((a, b) => pname(a).localeCompare(pname(b), lang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.flows, lang]);

  const add = () => {
    const id = `c${Date.now().toString(36)}`;
    const first = state.current;
    const second = state.islands.find((i) => i.id !== first)?.id;
    const c = newCircuit(id, t("circuitN", { n: circuits.length + 1 }), second ? [first, second] : [first]);
    save([...circuits, c]);
    setOpenId(id);
  };

  return (
    <section className="circuits" aria-labelledby="circ-t">
      <div className="circ-head">
        <div>
          <h2 id="circ-t" className="section-t">{t("circuitsTitle")}</h2>
          <p className="fine">{t("circuitsSub")}</p>
        </div>
        <button type="button" className="primary" onClick={add} disabled={state.islands.length < 2 || circuits.length >= 100}><UiIcon name="plus" size={18} /> {t("circuitNew")}</button>
      </div>
      {circuits.length === 0 && <p className="fine empty-line">{t("circuitsEmpty")}</p>}
      {circuits.map((c) => (
        <CircuitCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          onChange={put} onDelete={() => { if (confirm(t("circuitDeleteQ", { name: c.name }))) save(circuits.filter((x) => x.id !== c.id)); }}
          products={products} name={name} pname={pname} r1={r1} cover={cover} />
      ))}
      <p className="fine">{t("circuitsMechanics")}</p>
    </section>
  );
}

function CircuitCard({ c, open, onToggle, onChange, onDelete, products, name, pname, r1, cover }: {
  c: Circuit; open: boolean; onToggle: () => void; onChange: (c: Circuit) => void; onDelete: () => void;
  products: string[]; name: (id: string) => string; pname: (p: string) => string; r1: (n: number) => string;
  cover: ReturnType<typeof circuitCover>;
}) {
  const { state, world, t } = useApp();
  const p = planCircuit(c);
  const advice = circuitAdvice(c, world.flows);
  const set = (patch: Partial<Circuit>) => onChange({ ...c, ...patch });
  const setStop = (i: number, patch: Partial<Circuit["stops"][number]>) => set({ stops: c.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setCargo = (i: number, j: number, patch: Partial<CircuitCargo>) =>
    setStop(i, { cargo: c.stops[i].cargo.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
  const bad = p.issues.filter((x) => x.kind !== "noTime");
  const status = bad.some((x) => x.kind === "overSlots") || [...cover.values()].some((e) => e.circuits.includes(c.id) && e.status === "short") ? "short"
    : c.minutes > 0 && !bad.length ? "ok" : "unchecked";

  // Rellenar con lo que el plan envía entre las paradas (necesita la duración de la vuelta).
  const fill = () => {
    if (!(c.minutes > 0)) return;
    const at = (id: string) => c.stops.findIndex((s) => s.island === id);
    const stops = c.stops.map((s) => ({ ...s, cargo: [] as CircuitCargo[] }));
    const ships = Math.max(1, c.ships);
    for (const f of world.flows) {
      const i = at(f.from), j = at(f.to);
      if (i < 0 || j < 0 || i === j || !(f.rate > 0)) continue;
      const tons = Math.ceil((f.rate * c.minutes) / ships);
      const add = (k: number, op: CircuitCargo["op"]) => {
        const e = stops[k].cargo.find((x) => x.product === f.product && x.op === op);
        if (e) e.tons += tons; else stops[k].cargo.push({ product: f.product, op, tons });
      };
      add(i, "load"); add(j, "unload");
    }
    set({ stops });
  };
  const canFill = c.minutes > 0 && world.flows.some((f) => c.stops.some((s) => s.island === f.from) && c.stops.some((s) => s.island === f.to) && f.from !== f.to);

  const applyAdvice = (a: (typeof advice)[number]) => {
    if (a.kind === "slots") return set({ slots: Math.min(20, a.slots) });
    if (a.kind === "ships") return set({ ships: Math.min(50, a.ships) });
    const extra = a.tons - a.now;
    const i = c.stops.findIndex((s) => s.island === a.from);
    // La descarga: la primera parada de destino después del origen (en orden de recorrido).
    const n = c.stops.length;
    let j = -1;
    for (let k = 1; k < n; k++) if (c.stops[(i + k) % n].island === a.to) { j = (i + k) % n; break; }
    if (i < 0 || j < 0 || extra <= 0) return;
    const bump = (cargo: CircuitCargo[], op: CircuitCargo["op"]) => {
      const e = cargo.find((x) => x.product === a.product && x.op === op);
      return e ? cargo.map((x) => (x === e ? { ...x, tons: x.tons + extra } : x)) : [...cargo, { product: a.product, op, tons: extra }];
    };
    set({ stops: c.stops.map((s, k) => (k === i ? { ...s, cargo: bump(s.cargo, "load") } : k === j ? { ...s, cargo: bump(s.cargo, "unload") } : s)) });
  };

  const issueText = (x: CircuitIssue) =>
    x.kind === "overSlots" ? t("circIssueSlots", { from: name(c.stops[x.leg].island), to: name(c.stops[(x.leg + 1) % c.stops.length].island), used: x.used, slots: x.slots })
    : x.kind === "unloadMore" ? t("circIssueUnload", { good: pname(x.product), island: name(c.stops[x.stop].island), t: Math.round(x.missing) })
    : x.kind === "leftOnBoard" ? t("circIssueLeft", { good: pname(x.product), t: Math.round(x.tons) })
    : x.kind === "fewStops" ? t("circIssueFew") : t("circIssueTime");

  return (
    <article className={`circuit card${open ? "" : " closed"}`} aria-label={c.name}>
      <button type="button" className="route-top circ-top" aria-expanded={open} onClick={onToggle}>
        <span className="ship"><Glyph name="ship" size={26} /></span>
        <span className="pair circ-path">
          <b>{c.name}</b>
          <span className="circ-stops">{c.stops.map((s) => name(s.island)).join(" → ")}{c.stops.length > 1 ? ` → ${name(c.stops[0].island)}` : ""}</span>
        </span>
        <span className={`need-pill ${status === "short" ? "short" : status === "ok" ? "covered" : ""}`}>
          {status === "short" ? t("circShort") : status === "ok" ? t("routeOk") : t("routeUnchecked")}
        </span>
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="circ-body">
          <div className="circ-settings">
            <label className="circ-name"><span>{t("circName")}</span>
              <input type="text" value={c.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label={t("circName")} />
            </label>
            <div className="circ-field"><span>{t("boatCount")}</span>
              <Stepper size="sm" value={c.ships} max={50} unit="" label={t("circShips", { name: c.name })} lessLabel={`− ${t("circShips", { name: c.name })}`} moreLabel={`+ ${t("circShips", { name: c.name })}`} onChange={(v) => set({ ships: Math.max(1, v) })} />
            </div>
            <label className="circ-field"><span>{t("circSlots")}</span>
              <NumberField value={c.slots} max={20} label={t("circSlots")} onChange={(v) => set({ slots: Math.max(1, v || 1) })} />
            </label>
            <label className="circ-field"><span>{t("circSlotTons")}</span>
              <NumberField value={c.slotTons} placeholder={String(SLOT_TONS)} max={1000} label={t("circSlotTons")} onChange={(v) => set({ slotTons: v || SLOT_TONS })} /><span>t</span>
            </label>
            <label className="circ-field"><span>{t("circMinutes")}</span>
              <NumberField value={c.minutes} max={1440} label={t("circMinutes")} onChange={(v) => set({ minutes: v })} /><span>min</span>
            </label>
          </div>
          <p className="fine">
            {c.minutes > 0 ? t("circEvery", { m: r1(p.every) }) : t("circNoTime")} · {t("circCapacity", { t: c.slots * c.slotTons, s: c.slots })}
          </p>

          <div className="circ-cols">
          <div className="circ-left">
          <ol className="circ-stop-list">
            {c.stops.map((s, i) => {
              const leg = p.legs[i];
              return (
                <li key={i} className="circ-stop">
                  <div className="circ-stop-head">
                    <span className="circ-n" aria-hidden="true">{i + 1}</span>
                    <select value={s.island} aria-label={t("circStopIsland", { n: i + 1 })} onChange={(e) => setStop(i, { island: e.target.value })}>
                      {state.islands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <span className="circ-move">
                      <button type="button" disabled={i === 0} onClick={() => set(moveStop(c, i, i - 1))} aria-label={t("circUp", { n: i + 1 })}>↑</button>
                      <button type="button" disabled={i === c.stops.length - 1} onClick={() => set(moveStop(c, i, i + 1))} aria-label={t("circDown", { n: i + 1 })}>↓</button>
                      <button type="button" disabled={c.stops.length <= 1} onClick={() => set({ stops: c.stops.filter((_, k) => k !== i) })} aria-label={t("circRemoveStop", { n: i + 1 })}>✕</button>
                    </span>
                  </div>
                  <ul className="circ-cargo">
                    {s.cargo.map((x, j) => (
                      <li key={j}>
                        <ProductIcon product={x.product} fallback="ship" size={24} />
                        <select value={x.op} aria-label={t("circOpOf", { n: i + 1, k: j + 1 })} onChange={(e) => setCargo(i, j, { op: e.target.value as CircuitCargo["op"] })}>
                          <option value="load">{t("circLoad")}</option>
                          <option value="unload">{t("circUnload")}</option>
                        </select>
                        <select value={x.product} aria-label={t("circGoodOf", { n: i + 1, k: j + 1 })} onChange={(e) => setCargo(i, j, { product: e.target.value })}>
                          {products.map((id) => <option key={id} value={id}>{pname(id)}</option>)}
                        </select>
                        <span className="cargo-t"><NumberField value={x.tons} max={9999} label={t("circTonsOf", { n: i + 1, k: j + 1 })} onChange={(v) => setCargo(i, j, { tons: v })} /><span>t</span></span>
                        <button type="button" className="circ-x" onClick={() => setStop(i, { cargo: s.cargo.filter((_, k) => k !== j) })} aria-label={t("circRemoveCargo", { n: i + 1, k: j + 1 })}>✕</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="link" disabled={s.cargo.length >= 40}
                    onClick={() => setStop(i, { cargo: [...s.cargo, { product: world.flows.find((f) => f.from === s.island)?.product ?? products[0], op: "load", tons: 0 }] })}>
                    + {t("circAddCargo")}
                  </button>
                  {leg && (
                    <p className={`circ-leg${leg.over ? " over" : ""}`}>
                      <span>{t("circLeg", { to: name(leg.to) })}</span>
                      <b>{Math.round(leg.tons)} t · {t("circSlotsUsed", { u: leg.slotsUsed, s: c.slots })}</b>
                      {Object.keys(leg.cargo).length > 0 && <small>{Object.entries(leg.cargo).map(([k, v]) => `${pname(k)} ${Math.round(v)} t`).join(" · ")}</small>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="row-actions wrap">
            <button type="button" className="ghost-btn" disabled={c.stops.length >= 30}
              onClick={() => set({ stops: [...c.stops, { island: state.islands.find((x) => !c.stops.some((s) => s.island === x.id))?.id ?? state.islands[0].id, cargo: [] }] })}>
              <UiIcon name="plus" size={16} /> {t("circAddStop")}
            </button>
            <button type="button" className="ghost-btn" disabled={!canFill} onClick={fill} title={c.minutes > 0 ? undefined : t("circFillNeedsTime")}>{t("circFill")}</button>
            <button type="button" className="link danger" onClick={onDelete}>{t("circDelete")}</button>
          </div>
          {!canFill && !(c.minutes > 0) && <p className="fine">{t("circFillNeedsTime")}</p>}
          </div>
          <div className="circ-results">

          {p.deliveries.length > 0 && (
            <div className="circ-deliv">
              <h3 className="section-t small">{t("circDeliveries")}</h3>
              <table className="btable">
                <thead><tr><th>{t("circGood")}</th><th>{t("circFromTo")}</th><th className="num">{t("circBrings")}</th><th className="num">{t("circPlanNeeds")}</th></tr></thead>
                <tbody>
                  {p.deliveries.map((d) => {
                    const e = cover.get(`${d.from}|${d.to}|${d.product}`);
                    const need = e?.need ?? 0;
                    const ok = c.minutes > 0 && (need === 0 || d.rate >= need * 0.98);
                    return (
                      <tr key={`${d.from}|${d.to}|${d.product}`} className={ok ? "ok" : "short"}>
                        <td className="bt-name"><ProductIcon product={d.product} fallback="ship" size={22} /><span>{pname(d.product)}</span></td>
                        <td>{name(d.from)} → {name(d.to)}</td>
                        <td className="num">{Math.round(d.tons)} t{c.minutes > 0 ? ` · ${r1(d.rate)}/min` : ""}</td>
                        <td className="num">{need > 0 ? `${r1(need)}/min` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {bad.length > 0 && (
            <div className="chain-alert short" role="status">
              <UiIcon name="alert" size={20} />
              <div><b>{t("circProblems")}</b>{bad.map((x, i) => <small key={i}>{issueText(x)}</small>)}</div>
            </div>
          )}
          {advice.length > 0 && (
            <div className="circ-advice">
              <h3 className="section-t small">{t("circAdvice")}</h3>
              <ul>
                {advice.map((a, i) => (
                  <li key={i}>
                    <span>{a.kind === "raise" ? t("circAdvRaise", { good: pname(a.product), from: name(a.from), to: name(a.to), t: a.tons, now: Math.round(a.now) })
                      : a.kind === "slots" ? t("circAdvSlots", { s: a.slots }) : t("circAdvShips", { n: a.ships })}</span>
                    <button type="button" className="ghost-btn" onClick={() => applyAdvice(a)}>{t("circApply")}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!p.deliveries.length && !bad.length && <p className="fine">{t("circNoDeliveries")}</p>}
          </div>
          </div>
        </div>
      )}
    </article>
  );
}
