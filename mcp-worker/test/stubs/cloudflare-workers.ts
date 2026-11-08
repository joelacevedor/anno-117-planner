// En Node no existe el módulo «cloudflare:workers»; la librería OAuth solo lo usa para heredar de esta clase.
export class WorkerEntrypoint<Env = unknown> {
  constructor(readonly ctx: unknown, readonly env: Env) {}
}
