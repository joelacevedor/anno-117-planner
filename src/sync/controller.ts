/**
 * Conecta el estado local con una partida compartida a través de un backend
 * (Firebase en la app, un simulador en las pruebas).
 */
import type { State } from "../core/state";
import { applyOps, applyRemote, diff, toRemote, type Op, type Remote } from "./model";

export interface SyncBackend {
  /** Identificador estable de este dispositivo (sesión anónima). */
  uid(): Promise<string>;
  exists(code: string): Promise<boolean>;
  create(code: string, remote: Remote): Promise<void>;
  subscribe(code: string, onRemote: (r: Remote, pending: boolean) => void, onError: (e: unknown) => void): () => void;
  apply(code: string, ops: Op[]): Promise<void>;
}

export type SyncStatus = "connecting" | "live" | "offline" | "error";

export class SyncController {
  private last: Remote | null = null;
  private unsub: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued: State | null = null;
  private uidValue = "";

  constructor(
    private backend: SyncBackend,
    private code: string,
    private player: string,
    private onState: (s: State) => void,
    private onStatus: (s: SyncStatus, players: Record<string, string>) => void,
    private delayMs = 300,
  ) {}

  /** Crea la partida con las islas de este dispositivo. */
  async create(state: State) {
    this.uidValue = await this.backend.uid();
    const remote = toRemote(state, { [this.uidValue]: this.player });
    for (const i of Object.values(remote.islands)) i.owner ??= this.player;
    await this.backend.create(this.code, remote);
    this.start(state);
  }

  /** Se une a una partida existente. Devuelve false si el código no existe. */
  async join(state: State) {
    this.uidValue = await this.backend.uid();
    if (!(await this.backend.exists(this.code))) return false;
    this.start(state);
    return true;
  }

  private start(state: State) {
    this.onStatus("connecting", {});
    let local = state;
    this.unsub = this.backend.subscribe(
      this.code,
      (remote, pending) => {
        const first = !this.last;
        const prev = this.last;
        this.last = remote;
        // Si hay cambios locales sin enviar, se mantienen encima de lo que llega.
        let view = remote;
        if (this.queued && prev) view = applyOps(remote, diff(prev, toRemote(this.queued, remote.meta.players)));
        local = applyRemote(this.queued ?? local, view);
        if (this.queued) this.queued = local; // los cambios pendientes, ya sobre lo último del servidor
        this.onState(local);
        this.onStatus(pending ? "offline" : "live", remote.meta.players);
        if (first && remote.meta.players[this.uidValue] !== this.player) this.push(local);
      },
      () => this.onStatus("error", this.last?.meta.players ?? {}),
    );
  }

  /** Cambia el nombre con el que juegas; se envía con el siguiente cambio. */
  rename(name: string) {
    this.player = name;
  }

  /** Llamar con cada cambio local; agrupa cambios rápidos en un solo envío. */
  push(state: State) {
    if (!this.last) return;
    this.queued = state;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  async flush() {
    if (!this.last || !this.queued) return;
    const players = { ...this.last.meta.players, [this.uidValue]: this.player };
    const next = toRemote(this.queued, players);
    for (const [id, i] of Object.entries(next.islands)) i.owner = i.owner ?? this.last.islands[id]?.owner ?? this.player;
    const ops = diff(this.last, next);
    this.queued = null;
    if (!ops.length) return;
    this.last = applyOps(this.last, ops); // optimista
    try {
      await this.backend.apply(this.code, ops);
    } catch {
      this.onStatus("error", this.last.meta.players);
    }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    void this.flush();
    this.unsub?.();
    this.unsub = null;
  }
}
