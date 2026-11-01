import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "../core/state";
import { KEY } from "../core/state";
import { firebaseConfig, syncAvailable } from "./config";
import { SyncController, type SyncBackend, type SyncStatus } from "./controller";
import { newCode } from "./model";

export type SyncApi = {
  available: boolean;
  status: SyncStatus | "off";
  players: Record<string, string>;
  create: (player: string) => Promise<boolean>;
  join: (code: string, player: string) => Promise<boolean>;
  leave: () => void;
  rename: (name: string) => void;
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
      setState((prev) => ({
        ...next,
        lang: prev.lang,
        motion: prev.motion,
        session: prev.session,
        current: next.islands.some((i) => i.id === prev.current) ? prev.current : next.current,
      })),
    [setState],
  );
  const onStatus = useCallback((s: SyncStatus, p: Record<string, string>) => { setStatus(s); setPlayers(p); }, []);

  const connect = useCallback(
    async (mode: "create" | "join", code: string, player: string, base: State) => {
      if (!syncAvailable) return false;
      try {
        setStatus("connecting");
        const backend = await getBackend();
        const c = new SyncController(backend, code, player, onState, onStatus);
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
    leave: () => {
      ctrl.current?.stop();
      ctrl.current = null;
      setStatus("off");
      setPlayers({});
      setState((s) => ({ ...s, session: null }));
    },
  };
}
