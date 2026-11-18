import { Icon, type IconName } from "./Icons";
import { useState, type ReactNode } from "react";
import { buildings, regionName } from "../data/catalog";
import { autoPct, totalPct, weightedPct } from "../core/boosts";
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

/** `free`: sin objetivo (productor alternativo): solo cuántos hay. */
export function BuiltCounter({ id, needed, free }: { id: string; needed: number; free?: boolean }) {
  const { island, setBuilt, t, lang } = useApp();
  const built = island.built[id] ?? 0;
  const name = buildings[id].name[lang];
  return (
    <div className="built">
      <span>{free ? t("builtN", { b: built }) : t("builtOf", { b: built, n: needed })}</span>
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

/** Número escrito a mano («212,5» o «212.5»); vacío o inválido → NaN. */
const parseNum = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/**
 * Productividad de un edificio: desglose de lo automático, ajuste a mano en pasos de 10 % y calculadora de media.
 * «Total observada» es la cifra final que muestra el juego y sustituye a todo; «ajuste adicional» se suma a lo automático.
 */
export function ProductivityControl({ id }: { id: string }) {
  const { island, boosts, setProductivity, setObservedProductivity, t, lang } = useApp();
  const d = boosts[id];
  const total = totalPct(d);
  const auto = autoPct(d);
  const manual = island.productivity[id] ?? 0;
  const observed = d?.observed;
  const name = buildings[id].name[lang];
  const [calc, setCalc] = useState(false);
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 1 });
  const sign = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)} %`;
  return (
    <details className={`prod${total !== 100 ? " on" : ""}${observed ? " observed" : ""}`}>
      <summary>{t("productivity", { n: fmt(total) })}{observed ? <span className="tag">{t("prodObservedTag")}</span> : null}</summary>
      <div className="prod-body">
        {observed ? (
          <div className="prod-observed">
            <p><b>{t("prodObservedIs", { n: fmt(observed) })}</b> {t("prodObservedNote", { n: fmt(auto) })}</p>
            <button type="button" className="link" onClick={() => setObservedProductivity(id, null)}>{t("prodObservedClear")}</button>
          </div>
        ) : null}
        {d?.parts?.length || d?.nile ? (
          <ul className={`prod-parts${observed ? " muted" : ""}`} aria-label={t("prodPartsTitle")}>
            {(d.parts ?? []).map((p, k) => (
              <li key={k}>
                <span>{p.kind === "patron" ? t("prodPartPatron", { name: p.name[lang] }) : p.name[lang]}</span>
                <b>{[p.base ? `${sign(p.base)} ${t("baseShort")}` : "", p.prod ? sign(p.prod) : ""].filter(Boolean).join(" · ") || "—"}</b>
              </li>
            ))}
            {manual ? <li><span>{t("prodManual")}</span><b>{sign(manual)}</b></li> : null}
            {d.nile && Math.abs(d.nile - 1) > 1e-9 ? <li><span>{t("prodPartNile")}</span><b>× {fmt(d.nile)}</b></li> : null}
            <li className="sum"><span>{t("prodPartsFormula", { base: fmt(100 + d.base), prod: fmt(100 + d.prod + d.manual) })}</span><b>{fmt(auto)} %</b></li>
          </ul>
        ) : null}
        <div className="prod-row">
          <span>{t("prodManual")}</span>
          <span className="mini">
            <button type="button" onClick={() => setProductivity(id, manual - 10)} disabled={manual <= -90} aria-label={t("prodLess", { name })}>−</button>
            <b className="prod-val">{manual > 0 ? "+" : ""}{manual} %</b>
            <button type="button" onClick={() => setProductivity(id, manual + 10)} disabled={manual >= 500} aria-label={t("prodMore", { name })}>+</button>
          </span>
        </div>
        <p className="fine">{observed ? t("prodManualIgnored") : t("prodHelp")}</p>
        {calc ? <ProdCalculator id={id} onClose={() => setCalc(false)} /> : (
          <button type="button" className="ghost-btn calc-open" onClick={() => setCalc(true)}>{t("calcOpen")}</button>
        )}
      </div>
    </details>
  );
}

/** Calculadora de productividad media ponderada por número de edificios. */
function ProdCalculator({ id, onClose }: { id: string; onClose: () => void }) {
  const { island, boosts, setProductivity, setObservedProductivity, setProdCalc, t, lang } = useApp();
  const saved = island.prodCalc?.[id];
  const built = island.built[id] ?? 0;
  const [mode, setMode] = useState<"total" | "extra">(saved?.mode ?? "total");
  const [rows, setRows] = useState<{ n: string; pct: string }[]>(() =>
    saved?.groups.length ? saved.groups.map((g) => ({ n: String(g.n), pct: String(g.pct) }))
      : [{ n: String(built || 1), pct: mode === "total" ? String(totalPct(boosts[id])) : "0" }]);
  const groups = rows.map((r) => ({ n: Math.round(parseNum(r.n)), pct: parseNum(r.pct) }));
  const valid = groups.filter((g) => g.n > 0 && Number.isFinite(g.pct) && (mode === "extra" ? g.pct >= -90 : g.pct > 0));
  const mean = weightedPct(valid);
  const count = valid.reduce((a, g) => a + g.n, 0);
  const fmt = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 1 });
  const d = boosts[id];
  // En «ajuste adicional» el ajuste a mano es entero (−90…500): se redondea la media.
  const extra = mean === null ? null : Math.max(-90, Math.min(500, Math.round(mean)));
  const extraTotal = extra === null ? null : Math.round(((100 + (d?.base ?? 0)) * (100 + (d?.prod ?? 0) + extra)) / 100 * (d?.nile ?? 1));
  const set = (k: number, patch: Partial<{ n: string; pct: string }>) => setRows(rows.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const apply = () => {
    if (mean === null) return;
    setProdCalc(id, { mode, groups: valid.map((g) => ({ n: g.n, pct: Math.round(g.pct * 10) / 10 })) });
    if (mode === "total") setObservedProductivity(id, mean);
    else { setObservedProductivity(id, null); setProductivity(id, extra!); }
    onClose();
  };
  return (
    <div className="prod-calc" role="group" aria-label={t("calcTitle")}>
      <h4>{t("calcTitle")}</h4>
      <Segmented label={t("calcMode")} value={mode} onChange={setMode}
        options={[["total", t("calcModeTotal")], ["extra", t("calcModeExtra")]]} />
      <p className="fine">{mode === "total" ? t("calcModeTotalHelp") : t("calcModeExtraHelp")}</p>
      <ul className="calc-rows">
        {rows.map((r, k) => (
          <li key={k}>
            <label className="sr" htmlFor={`calc-n-${id}-${k}`}>{t("calcCount", { k: k + 1 })}</label>
            <input id={`calc-n-${id}-${k}`} type="text" inputMode="numeric" value={r.n} onChange={(e) => set(k, { n: e.target.value })} />
            <span className="x">{t("calcBuildingsAt")}</span>
            <label className="sr" htmlFor={`calc-p-${id}-${k}`}>{t("calcPct", { k: k + 1 })}</label>
            <input id={`calc-p-${id}-${k}`} type="text" inputMode="decimal" value={r.pct} onChange={(e) => set(k, { pct: e.target.value })} />
            <span className="x">%</span>
            <button type="button" className="rm" onClick={() => setRows(rows.filter((_, j) => j !== k))} disabled={rows.length <= 1} aria-label={t("calcRemove", { k: k + 1 })}>×</button>
          </li>
        ))}
      </ul>
      {rows.length < 20 && <button type="button" className="ghost-btn" onClick={() => setRows([...rows, { n: "1", pct: mode === "total" ? "100" : "0" }])}>{t("calcAdd")}</button>}
      <p className="calc-result" aria-live="polite">
        {mean === null ? t("calcEmpty") : mode === "total"
          ? t("calcMeanTotal", { n: fmt(mean), count })
          : t("calcMeanExtra", { n: fmt(mean), count, r: extra! > 0 ? `+${extra}` : String(extra), total: extraTotal! })}
      </p>
      {built > 0 && count > 0 && count !== built && <p className="fine warn">{t("calcCountDiff", { count, built })}</p>}
      <div className="calc-actions">
        <button type="button" className="primary" onClick={apply} disabled={mean === null}>{t("calcApply")}</button>
        <button type="button" className="link" onClick={onClose}>{t("cancel")}</button>
      </div>
    </div>
  );
}

// ── Piezas del rediseño (cabecera de sección, pestañas con recuento, filtros) ──────────────

/** Iconos de interfaz: misma familia que la navegación (ver Icons.tsx). */
const UI_ALIAS = { laurel: "empire", hammer: "build" } as const;
export function UiIcon({ name, size = 20 }: { name: "search" | "sliders" | "check" | "alert" | "chev" | "plus" | "laurel" | "hammer" | "list" | "chains" | "houses" | "routes" | "island"; size?: number }) {
  return <Icon name={(UI_ALIAS as Record<string, IconName>)[name] ?? (name as IconName)} size={size} />;
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
