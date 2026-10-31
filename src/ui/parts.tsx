import type { ReactNode } from "react";
import { buildings } from "../data/catalog";
import { totalPct } from "../core/boosts";
import { MAX_PARTS, sourcesOf, type Sources } from "../core/supply";
import { useApp } from "./context";

/** Número que hace un pequeño pulso cuando cambia (se desactiva con movimiento reducido). */
export function Tick({ value, className = "" }: { value: number | string; className?: string }) {
  return (
    <span key={String(value)} className={`tick ${className}`}>
      {value}
    </span>
  );
}

export function Stepper({
  value, onChange, unit, lessLabel, moreLabel, max = 99, size = "lg",
}: {
  value: number; onChange: (n: number) => void; unit: string;
  lessLabel: string; moreLabel: string; max?: number; size?: "lg" | "sm";
}) {
  return (
    <div className={`stepper ${size}`}>
      <button type="button" className="step" onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={lessLabel}>
        −
      </button>
      <output aria-live="polite">
        <Tick value={value} className="n" />
        <span className="unit">{unit}</span>
      </output>
      <button type="button" className="step" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={moreLabel}>
        +
      </button>
    </div>
  );
}

/** Una casilla por edificio. Tocar la casilla i marca i+1 construidos (o desmarca la última). */
export function Pips({ id, needed }: { id: string; needed: number }) {
  const { island, setBuilt, t, lang } = useApp();
  const built = island.built[id] ?? 0;
  const total = Math.min(Math.max(needed, built), 60);
  const name = buildings[id].name[lang];
  const pips: ReactNode[] = [];
  for (let i = 0; i < total; i++) {
    const on = i < built;
    const extra = i >= needed;
    pips.push(
      <button
        type="button"
        key={i}
        className={`pip${on ? " on" : ""}${extra ? " extra" : ""}`}
        style={{ ["--i" as string]: i }}
        aria-pressed={on}
        aria-label={t("pip", { name, i: i + 1, state: t(on ? "isBuilt" : "notBuilt") })}
        onClick={() => setBuilt(id, built === i + 1 ? i : i + 1)}
      />,
    );
  }
  return <div className="pips">{pips}</div>;
}

export function BuiltCounter({ id, needed }: { id: string; needed: number }) {
  const { island, setBuilt, t, lang } = useApp();
  const built = island.built[id] ?? 0;
  const name = buildings[id].name[lang];
  return (
    <div className="built">
      <span>{t("builtOf", { b: built, n: needed })}</span>
      <span className="mini">
        <button type="button" onClick={() => setBuilt(id, built - 1)} disabled={built === 0} aria-label={t("builtLess", { name })}>−</button>
        <button type="button" onClick={() => setBuilt(id, built + 1)} aria-label={t("builtMore", { name })}>+</button>
      </span>
    </div>
  );
}

export function Segmented<V extends string>({
  value, options, onChange, label,
}: { value: V; options: [V, string][]; onChange: (v: V) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" key={v} role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * De dónde viene un producto: esta isla, otra o varias a la vez (por partes).
 * `local` = false cuando aquí no se puede producir (lo que piden las casas y la región no tiene).
 */
export function SupplyPicker({ product, compact = false, local = true }: { product: string; compact?: boolean; local?: boolean }) {
  const { state, island, setSupply, t } = useApp();
  const others = state.islands.filter((i) => i.id !== island.id);
  if (!others.length) return null;
  const self = island.id;
  const configured = product in island.supplies;
  const src: Sources = configured || local ? sourcesOf(self, island.supplies, product) : {};
  if (!local) delete src[self];
  const chosen = Object.keys(src);
  const total = chosen.reduce((a, id) => a + src[id], 0);
  const multi = chosen.length > 1;
  const nameOf = (id: string) => (id === self ? t("thisIsland") : state.islands.find((i) => i.id === id)?.name ?? "?");
  const summary = chosen.length ? chosen.map(nameOf).join(" + ") : t("pickSource");
  const candidates = [...(local ? [island] : []), ...others];

  const toggle = (id: string) => {
    const next = { ...src };
    if (next[id]) delete next[id];
    else {
      next[id] = 1;
      // Elegir otra isla cuando todo se producía aquí = "todo llega de esa isla".
      if (id !== self && !configured) delete next[self];
    }
    setSupply(product, next);
  };
  const parts = (id: string, d: number) => setSupply(product, { ...src, [id]: Math.max(1, Math.min(MAX_PARTS, src[id] + d)) });

  return (
    <details className={`supply${compact ? " compact" : ""}${configured ? " on" : ""}`}>
      <summary><span className="supply-k">{t("supplyFrom")}</span> <b>{summary}</b></summary>
      <div className="supply-body">
        <ul>
          {candidates.map((i) => {
            const on = (src[i.id] ?? 0) > 0;
            const id = `src-${self}-${product}-${i.id}`;
            return (
              <li key={i.id} className={on ? "on" : ""}>
                <input type="checkbox" id={id} checked={on} onChange={() => toggle(i.id)} />
                <label htmlFor={id}>{i.id === self ? t("thisIsland") : i.name}<small>{i.region}{i.owner ? ` · ${i.owner}` : ""}</small></label>
                {on && multi && (
                  <span className="src-parts">
                    <button type="button" onClick={() => parts(i.id, -1)} disabled={src[i.id] <= 1} aria-label={t("partsLess", { island: nameOf(i.id) })}>−</button>
                    <b aria-label={t("partsOf", { island: nameOf(i.id) })}>{src[i.id]}</b>
                    <button type="button" onClick={() => parts(i.id, 1)} disabled={src[i.id] >= MAX_PARTS} aria-label={t("partsMore", { island: nameOf(i.id) })}>+</button>
                    <span className="pct">{Math.round((100 * src[i.id]) / total)} %</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="fine">{t("supplyHelp")}</p>
      </div>
    </details>
  );
}

/** Productividad de un edificio: total y ajuste manual en pasos de 10 %. */
export function ProductivityControl({ id }: { id: string }) {
  const { island, boosts, setProductivity, t, lang } = useApp();
  const d = boosts[id];
  const total = totalPct(d);
  const manual = island.productivity[id] ?? 0;
  const fromBonuses = d ? d.prod + d.base : 0;
  const name = buildings[id].name[lang];
  return (
    <details className={`prod${total !== 100 ? " on" : ""}`}>
      <summary>{t("productivity", { n: total })}</summary>
      <div className="prod-body">
        {fromBonuses !== 0 && <p>{t("prodFromBoosts", { n: Math.round(fromBonuses) })}</p>}
        <div className="prod-row">
          <span>{t("prodManual")}</span>
          <span className="mini">
            <button type="button" onClick={() => setProductivity(id, manual - 10)} disabled={manual <= -90} aria-label={t("prodLess", { name })}>−</button>
            <b className="prod-val">{manual > 0 ? "+" : ""}{manual} %</b>
            <button type="button" onClick={() => setProductivity(id, manual + 10)} disabled={manual >= 500} aria-label={t("prodMore", { name })}>+</button>
          </span>
        </div>
        <p className="fine">{t("prodHelp")}</p>
      </div>
    </details>
  );
}
