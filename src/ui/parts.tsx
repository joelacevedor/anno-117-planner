import { useState, type ReactNode } from "react";
import { buildings, regionName } from "../data/catalog";
import { totalPct } from "../core/boosts";
import { MAX_PARTS, sourcesOf, type Sources } from "../core/supply";
import { useApp } from "./context";
import { RegionGlyph } from "./Emblems";

/** Etiqueta de región, con su color (Latium bronce, Albion verde celta). */
export function RegionChip({ region }: { region: string }) {
  const { lang } = useApp();
  return <span className={`region-chip ${region.toLowerCase()}`}><RegionGlyph region={region} size={13} />{regionName(region, lang)}</span>;
}

/** Número que hace un pequeño pulso cuando cambia (se desactiva con movimiento reducido). */
export function Tick({ value, className = "" }: { value: number | string; className?: string }) {
  return (
    <span key={String(value)} className={`tick ${className}`}>
      {value}
    </span>
  );
}

export function Stepper({
  value, onChange, unit, lessLabel, moreLabel, max = 99, size = "lg", label, step = 1, decimal = false,
}: {
  value: number; onChange: (n: number) => void; unit: string;
  lessLabel: string; moreLabel: string; max?: number; size?: "lg" | "sm";
  /** Nombre accesible del campo para escribir el número directamente. */
  label?: string;
  /** Paso de los botones − / +. */
  step?: number;
  /** Admite una cifra decimal (t/min); se escribe con coma o punto. */
  decimal?: boolean;
}) {
  // Se puede tocar el número y escribirlo; mientras se escribe, el campo vacío se respeta.
  const [draft, setDraft] = useState<string | null>(null);
  const show = (v: number) => (decimal ? String(Math.round(v * 10) / 10).replace(".", ",") : String(v));
  const commit = (raw: string) => {
    if (decimal) {
      const m = raw.replace(".", ",").match(/^\d{0,6}(,\d?)?/);
      const d = m ? m[0] : "";
      setDraft(d);
      const v = parseFloat(d.replace(",", "."));
      if (!Number.isNaN(v)) onChange(Math.min(max, v));
      return;
    }
    const digits = raw.replace(/\D/g, "").slice(0, String(max).length);
    setDraft(digits);
    if (digits !== "") onChange(Math.min(max, parseInt(digits, 10)));
  };
  return (
    <div className={`stepper ${size}`}>
      <button type="button" className="step" onClick={() => onChange(Math.max(0, Math.round((value - step) * 10) / 10))} disabled={value <= 0} aria-label={lessLabel}>
        −
      </button>
      <label className="step-out">
        <input
          className="n" type="text" inputMode={decimal ? "decimal" : "numeric"} pattern={decimal ? undefined : "[0-9]*"} autoComplete="off" enterKeyHint="done"
          aria-label={label ?? unit} value={draft ?? show(value)}
          onFocus={(e) => { setDraft(show(value)); requestAnimationFrame(() => e.target.select()); }}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => { if (draft === "") onChange(0); setDraft(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{ ["--len" as string]: Math.max(1, (draft ?? show(value)).length) }}
        />
        <span className="unit">{unit}</span>
      </label>
      <button type="button" className="step" onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} disabled={value >= max} aria-label={moreLabel}>
        +
      </button>
    </div>
  );
}

/** Número pequeño que se escribe (minutos, toneladas…). 0 = vacío. */
export function NumberField({ value, onChange, max = 9999, label, placeholder = "–" }: { value: number; onChange: (n: number) => void; max?: number; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input className="num-field" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" aria-label={label}
      value={draft ?? (value ? String(value) : "")} placeholder={placeholder}
      onFocus={(e) => { setDraft(value ? String(value) : ""); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, String(max).length);
        setDraft(d);
        onChange(d === "" ? 0 : Math.min(max, parseInt(d, 10)));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
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
                <label htmlFor={id}>{i.id === self ? t("thisIsland") : i.name}<small>{i.region}{state.mode === "versus" && i.owner ? ` · ${i.owner}` : ""}</small></label>
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

// ── Piezas del rediseño (cabecera de sección, pestañas con recuento, filtros) ──────────────

/** Iconos de línea pequeños para la interfaz (sin arte del juego). */
export function UiIcon({ name, size = 20 }: { name: "search" | "sliders" | "check" | "alert" | "chev" | "plus" | "laurel" | "hammer" | "list"; size?: number }) {
  const d: Record<string, ReactNode> = {
    search: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>),
    sliders: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
    check: (<path d="m5 12.5 4.5 4.5L19 7.5" />),
    alert: (<><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.3v.2" /></>),
    chev: (<path d="m9 5 7 7-7 7" />),
    plus: (<path d="M12 5v14M5 12h14" />),
    laurel: (<><path d="M12 20c-4-1-7-4.5-7-10M12 20c4-1 7-4.5 7-10" /><path d="M6.5 13.5c-1.6 0-2.8-.8-3.3-2.3 1.6-.2 2.8.5 3.3 2.3ZM5.4 9.6C4 9.1 3.3 8 3.4 6.5c1.4.6 2.1 1.6 2 3.1ZM17.5 13.5c1.6 0 2.8-.8 3.3-2.3-1.6-.2-2.8.5-3.3 2.3ZM18.6 9.6c1.4-.5 2.1-1.6 2-3.1-1.4.6-2.1 1.6-2 3.1Z" /></>),
    hammer: (<><path d="m14 7-9.5 9.5 3 3L17 10" /><path d="m13 6 4-3 4 4-3 4" /></>),
    list: (<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>),
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d[name]}
    </svg>
  );
}

/** Cabecera de sección: emblema, «Sección · Isla» y una línea de ayuda. */
export function PageHero({ title, island, sub, icon }: { title: string; island?: string; sub?: string; icon: ReactNode }) {
  return (
    <header className="page-hero">
      <span className="page-hero-icon" aria-hidden="true">{icon}</span>
      <div>
        <h1>{title}{island && <span className="page-hero-island"> · {island}</span>}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </header>
  );
}

/** Pestañas de filtro con recuento (Todas · Con déficit · Cubiertas). */
export function FilterTabs<V extends string>({ value, options, onChange, label }: {
  value: V; label: string;
  options: { v: V; text: string; n?: number; tone?: "danger" | "ok" | "warn" }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="filter-tabs" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.v} role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}>
          {o.text}{o.n !== undefined && <span className={`ft-n ${o.tone ?? ""}`}>{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Búsqueda con botón de filtros (abre las categorías). */
export function SearchBar({ id, value, onChange, placeholder, label, filtersOpen, onToggleFilters, filtersLabel, active }: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string; label: string;
  filtersOpen?: boolean; onToggleFilters?: () => void; filtersLabel?: string; active?: boolean;
}) {
  return (
    <div className="search-bar">
      <label className="search-field" htmlFor={id}>
        <UiIcon name="search" size={19} />
        <span className="sr">{label}</span>
        <input id={id} type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      </label>
      {onToggleFilters && (
        <button type="button" className={`filter-btn${active ? " active" : ""}`} aria-expanded={filtersOpen} aria-label={filtersLabel} onClick={onToggleFilters}>
          <UiIcon name="sliders" />
        </button>
      )}
    </div>
  );
}

/** Chips para elegir varias categorías (ninguna = todas). */
export function ChipFilter<V extends string>({ options, value, onChange, label, allText }: {
  options: { v: V; text: string; n?: number }[]; value: V[]; onChange: (v: V[]) => void; label: string; allText: string;
}) {
  const toggle = (v: V) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="chip-filter" role="group" aria-label={label}>
      <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])}>{allText}</button>
      {options.map((o) => (
        <button type="button" key={o.v} aria-pressed={value.includes(o.v)} onClick={() => toggle(o.v)}>
          {o.text}{o.n !== undefined && <small> {o.n}</small>}
        </button>
      ))}
    </div>
  );
}

/** Barra de cobertura: verde si cubre, ámbar si falta. */
export function CoverBar({ value, tone }: { value: number; tone: "ok" | "short" | "spare" }) {
  return <span className={`cover-bar ${tone}`} aria-hidden="true"><span style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></span>;
}

/** Pestañas de una pantalla (Resumen · Edificios · Flujo · Comercio). */
export function ViewTabs<V extends string>({ value, options, onChange, label }: {
  value: V; label: string; options: { v: V; text: string; n?: number }[]; onChange: (v: V) => void;
}) {
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.v} role="tab" aria-selected={o.v === value} onClick={() => onChange(o.v)}>
          {o.text}{o.n !== undefined && <span className="ft-n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}
