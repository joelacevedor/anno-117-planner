import type { ReactNode } from "react";
import { buildings } from "../data/catalog";
import { totalPct } from "../core/boosts";
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

/** Elegir de qué isla viene un producto ("Esta isla" = se produce aquí). */
export function SupplyPicker({ product, compact = false }: { product: string; compact?: boolean }) {
  const { state, island, setSupply, t } = useApp();
  const others = state.islands.filter((i) => i.id !== island.id);
  if (!others.length) return null;
  const value = island.supplies[product] ?? "";
  const id = `sup-${island.id}-${product}`;
  return (
    <span className={`supply${compact ? " compact" : ""}${value ? " on" : ""}`}>
      <label htmlFor={id}>{t("supplyFrom")}</label>
      <select id={id} value={value} onChange={(e) => setSupply(product, e.target.value || null)}>
        <option value="">{t("thisIsland")}</option>
        {others.map((i) => (
          <option key={i.id} value={i.id}>{i.name} · {i.region}</option>
        ))}
      </select>
    </span>
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
