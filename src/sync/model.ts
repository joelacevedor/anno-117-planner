/**
 * Partida compartida: qué se comparte y cómo se calculan los cambios.
 * Lógica pura (sin Firebase) para poder probarla con un servidor simulado.
 *
 * Se comparten las islas y los ajustes de la partida (investigación, consumo).
 * Cada dispositivo conserva lo suyo: idioma, animaciones e isla abierta.
 * Los cambios se envían campo a campo (p. ej. `built.b5848`), así dos jugadores
 * pueden tocar cosas distintas a la vez sin pisarse.
 */
import type { Island, State } from "../core/state";

export type SharedMeta = { techs: string[]; consumption: State["consumption"]; mode?: State["mode"];
  /** Capacidad y tiempos de ida y vuelta. Las cargas van aparte para que una versión anterior de la app no las borre. */
  ships?: { capacity: number; times: Record<string, number> };
  shipLoads?: Record<string, number>;
  /** Varias rutas por conexión (aparte, por el mismo motivo). */
  shipBoats?: { boats: Record<string, number>; caps: Record<string, number> };
  countBuilt?: boolean;
  players: Record<string, string> };
export type SharedIsland = Island & { owner?: string; order?: number };
export type Remote = { meta: SharedMeta; islands: Record<string, SharedIsland> };

export const DELETE = { __delete: true } as const;
export type FieldValue = unknown | typeof DELETE;
export type Op =
  | { kind: "set"; island?: string; data: Record<string, unknown> }
  | { kind: "update"; island?: string; fields: Record<string, FieldValue> }
  | { kind: "delete"; island: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...rand(10)].map((x) => ALPHABET[x % ALPHABET.length]).join("");
}
export const formatCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
export const parseCode = (input: string) => {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 10 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
};

/** Lo que este dispositivo comparte. */
export function toRemote(state: State, players: Record<string, string> = {}): Remote {
  return {
    meta: { techs: [...state.techs].sort(), consumption: state.consumption, mode: state.mode, ships: { capacity: state.ships.capacity, times: state.ships.times }, shipLoads: state.ships.loads, shipBoats: { boats: state.ships.boats, caps: state.ships.caps }, countBuilt: state.countBuilt, players },
    islands: Object.fromEntries(state.islands.map((i, order) => [i.id, { ...i, order }])),
  };
}

/** Estado local con lo que llega del servidor (conserva idioma, animaciones e isla abierta). */
export function applyRemote(state: State, remote: Remote): State {
  const islands = Object.values(remote.islands)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
    .map(({ order: _o, ...i }) => i as Island);
  if (!islands.length) return state;
  const current = islands.some((i) => i.id === state.current) ? state.current : islands[0].id;
  return { ...state, techs: remote.meta.techs, consumption: remote.meta.consumption, mode: remote.meta.mode ?? "coop", countBuilt: remote.meta.countBuilt ?? true, ships: { capacity: remote.meta.ships?.capacity ?? 0, times: remote.meta.ships?.times ?? {}, loads: remote.meta.shipLoads ?? {}, boats: remote.meta.shipBoats?.boats ?? {}, caps: remote.meta.shipBoats?.caps ?? {} }, islands, current };
}

const MAP_FIELDS = ["goals", "built", "houses", "supplies", "productivity", "producers", "popReal"] as const;
/** JSON con las claves ordenadas: Firestore puede devolver los mapas en otro orden y no es un cambio. */
const stable = (v: unknown): string =>
  v && typeof v === "object"
    ? Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v ?? null);
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Operaciones mínimas para pasar de `prev` a `next`. */
export function diff(prev: Remote, next: Remote): Op[] {
  const ops: Op[] = [];
  const meta: Record<string, FieldValue> = {};
  if (!same(prev.meta.techs, next.meta.techs)) meta.techs = next.meta.techs;
  if (prev.meta.consumption !== next.meta.consumption) meta.consumption = next.meta.consumption;
  if ((prev.meta.mode ?? "coop") !== (next.meta.mode ?? "coop")) meta.mode = next.meta.mode ?? "coop";
  // Se comparan ya normalizados: un campo que falta y uno vacío son lo mismo (evita reescrituras en bucle).
  const shipsOf = (m: SharedMeta) => ({ capacity: m.ships?.capacity ?? 0, times: m.ships?.times ?? {} });
  if (!same(shipsOf(prev.meta), shipsOf(next.meta))) meta.ships = shipsOf(next.meta);
  if (!same(prev.meta.shipLoads ?? {}, next.meta.shipLoads ?? {})) meta.shipLoads = next.meta.shipLoads ?? {};
  const boatsOf = (m: SharedMeta) => ({ boats: m.shipBoats?.boats ?? {}, caps: m.shipBoats?.caps ?? {} });
  if (!same(boatsOf(prev.meta), boatsOf(next.meta))) meta.shipBoats = boatsOf(next.meta);
  if ((prev.meta.countBuilt ?? true) !== (next.meta.countBuilt ?? true)) meta.countBuilt = next.meta.countBuilt ?? true;
  for (const [uid, name] of Object.entries(next.meta.players)) if (prev.meta.players[uid] !== name) meta[`players.${uid}`] = name;
  if (Object.keys(meta).length) ops.push({ kind: "update", fields: meta });

  for (const [id, isl] of Object.entries(next.islands)) {
    const old = prev.islands[id];
    if (!old) { ops.push({ kind: "set", island: id, data: isl as unknown as Record<string, unknown> }); continue; }
    const fields: Record<string, FieldValue> = {};
    for (const key of Object.keys(isl) as (keyof SharedIsland)[]) {
      if ((MAP_FIELDS as readonly string[]).includes(key)) {
        const a = (old[key] ?? {}) as Record<string, unknown>;
        const b = (isl[key] ?? {}) as Record<string, unknown>;
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
          if (!same(a[k], b[k])) fields[`${key}.${k}`] = k in b ? b[k] : DELETE;
      } else if (!same(old[key], isl[key])) fields[key] = isl[key] ?? DELETE;
    }
    if (Object.keys(fields).length) ops.push({ kind: "update", island: id, fields });
  }
  for (const id of Object.keys(prev.islands)) if (!next.islands[id]) ops.push({ kind: "delete", island: id });
  return ops;
}

/** Aplica operaciones sobre una copia (lo que hace el servidor; sirve para el simulador y para la respuesta optimista). */
export function applyOps(remote: Remote, ops: Op[]): Remote {
  const r: Remote = structuredClone(remote);
  const setPath = (obj: Record<string, unknown>, path: string, v: FieldValue) => {
    const parts = path.split(".");
    let o = obj;
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    const last = parts[parts.length - 1];
    if (v && typeof v === "object" && "__delete" in (v as object)) delete o[last];
    else o[last] = v;
  };
  for (const op of ops) {
    if (op.kind === "delete") delete r.islands[op.island];
    else if (op.kind === "set") {
      if (op.island) r.islands[op.island] = structuredClone(op.data) as SharedIsland;
      else r.meta = structuredClone(op.data) as SharedMeta;
    } else {
      const target = op.island ? (r.islands[op.island] as unknown as Record<string, unknown>) : (r.meta as unknown as Record<string, unknown>);
      if (!target) continue;
      for (const [path, v] of Object.entries(op.fields)) setPath(target, path, v);
    }
  }
  return r;
}
