import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "../core/state";
import { autoBackup, KEY, removesIslands } from "../core/state";
import { firebaseConfig, previewBuild, syncAvailable } from "./config";
import { SyncController, type SyncBackend, type SyncStatus } from "./controller";
import { newCode } from "./model";

export type SyncApi = {
  available: boolean;
  status: SyncStatus | "off";
  players: Record<string, string>;
  create: (player: string) => Promise<boolean>;
  join: (code: string, player: string) => Promise<boolean>;
  leave: () => void;
  /** Empieza una partida nueva: sale de la compartida (que queda intacta) y, si había una, crea otra con código nuevo. */
  restart: (next: State) => Promise<"local" | "shared" | "share-failed">;
  rename: (name: string) => void;
  removePlayer: (uid: string) => void;
  /** Identificador de este dispositivo en la partida. */
  me: string;
};

let backendPromise: Promise<SyncBackend> | null = null;
export const getBackend = () =>
  (backendPromise ??= import.meta.env.MODE === "single"
    ? Promise.reject(new Error("sync unavailable"))
    : import("./firebase").then((m) => m.firebaseBackend(firebaseConfig!)));

export function useSync(state: State, setState: (f: (prev: State) => State) => void): SyncApi {
  const ctrl = useRef<SyncController | null>(null);
  const [status, setStatus] = useState<SyncApi["status"]>("off");
  const [players, setPlayers] = useState<Record<string, string>>({});

  const onState = useCallback(
    (next: State) =>
      setState((prev) => {
        // Si la partida compartida quita islas, antes se guarda una copia en este dispositivo.
        if (removesIslands(prev, next)) autoBackup(prev, { force: true, reason: "before-remote-removal" });
        return ({
        ...next,
        lang: prev.lang,
        motion: prev.motion,
        session: prev.session,
        current: next.islands.some((i) => i.id === prev.current) ? prev.current : next.current,
      }); }),
    [setState],
  );
  const onStatus = useCallback((s: SyncStatus, p: Record<string, string>) => { setStatus(s); setPlayers(p); }, []);

  const connect = useCallback(
    async (mode: "create" | "join", code: string, player: string, base: State) => {
      if (!syncAvailable) return false;
      try {
        setStatus("connecting");
        const backend = await getBackend();
        const c = new SyncController(backend, code, player, onState, onStatus, 300, previewBuild);
        const ok = mode === "create" ? (await c.create(base), true) : await c.join(base);
        if (!ok) { setStatus("off"); return false; }
        ctrl.current?.stop();
        ctrl.current = c;
        setState((s) => ({ ...s, session: { code, player } }));
        return true;
      } catch {
        setStatus("error");
        return false;
      }
    },
    [onState, onStatus, setState],
  );

  // Al abrir la app, vuelve a la partida en la que estabas.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !state.session || !syncAvailable) return;
    resumed.current = true;
    void connect("join", state.session.code, state.session.player, state);
  }, [state, connect]);

  // Cada cambio local se envía (agrupado). Los que llegan del otro no generan envíos.
  useEffect(() => { ctrl.current?.push(state); }, [state]);

  return {
    available: syncAvailable,
    status,
    players,
    create: (player) => connect("create", newCode(), player, state),
    join: (code, player) => {
      try { localStorage.setItem(KEY + ":before-join", JSON.stringify(state)); } catch { /* opcional */ }
      return connect("join", code, player, state);
    },
    removePlayer: (uid) => { void ctrl.current?.removePlayer(uid).catch(() => setStatus("error")); },
    me: ctrl.current?.me ?? "",
    rename: (name) => {
      const clean = name.trim().slice(0, 40);
      if (!clean || !state.session) return;
      const old = state.session.player;
      ctrl.current?.rename(clean);
      // Las islas que eran tuyas pasan a tu nombre nuevo.
      setState((s) => ({
        ...s,
        session: s.session && { ...s.session, player: clean },
        islands: s.islands.map((i) => (i.owner === old ? { ...i, owner: clean } : i)),
      }));
    },
    restart: async (next) => {
      const player = state.session?.player;
      // Primero se corta la conexión, para que la partida en blanco nunca llegue a la compartida antigua.
      ctrl.current?.stop();
      ctrl.current = null;
      setStatus("off");
      setPlayers({});
      const local = { ...next, session: null };
      setState(() => local);
      if (!player || !syncAvailable) return "local";
      return (await connect("create", newCode(), player, local)) ? "shared" : "share-failed";
    },
    leave: () => {
      ctrl.current?.stop();
      ctrl.current = null;
      setStatus("off");
      setPlayers({});
      setState((s) => ({ ...s, session: null }));
    },
  };
}

/** Clave de texto para el estado de la partida compartida. */
export const syncLabel = (s: SyncApi["status"]) =>
  s === "live" ? "syncLive" : s === "offline" ? "syncOffline" : s === "error" ? "syncError" : s === "outdated" ? "syncOutdated" : s === "blocked" ? "syncBlocked" : "syncConnecting";
