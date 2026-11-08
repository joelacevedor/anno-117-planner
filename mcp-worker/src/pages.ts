/** Páginas HTML del Worker, con el estilo de Praefectus. Todo lo variable pasa por esc(). */

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--olive:#17211D;--surface:#26342C;--surface-2:#304036;--bronze:#DDBA80;--ivory:#F3EBDC;--muted:#B3B6A4;--line:#3C4C42;--ok:#A9C7A6;--warn:#E6AF78;--danger:#E58F7B}
*{box-sizing:border-box}body{margin:0;background:var(--olive);color:var(--ivory);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{width:100%;max-width:440px}h1{font:600 28px/1.15 "Iowan Old Style",Georgia,serif;color:var(--bronze);margin:8px 0 4px}
.sub{color:var(--muted);margin:0 0 20px}.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0}
label{display:block;font-weight:600;margin-bottom:6px}input[type=text]{width:100%;font:600 22px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--ivory)}
button{font:600 16px/1 system-ui,sans-serif;min-height:48px;padding:0 18px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--ivory);cursor:pointer}
button.primary{background:var(--bronze);color:#17211D;border-color:var(--bronze)}.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.muted{color:var(--muted);font-size:14px}.warn{color:var(--warn)}.err{color:var(--danger);font-weight:600}.ok{color:var(--ok)}
ul{margin:8px 0;padding-left:20px}li{margin:2px 0}code{color:var(--bronze)}
`;

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export function page(title: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Praefectus</title><style>${CSS}</style></head><body><main>
<p class="muted">PRAEFECTUS · ANNO 117</p>${body}</main></body></html>`;
}

export type ConsentInfo = { clientName: string; clientDomain?: string; redirectHost: string; redirectIsLoopback: boolean; scope: string[] };

function clientBlock(d: ConsentInfo) {
  return `<div class="card"><p><strong>${esc(d.clientName)}</strong> quiere consultar una partida de Praefectus.</p>
<p class="muted">${d.clientDomain ? `Publicado por <strong>${esc(d.clientDomain)}</strong>.` : "Esta app se registró sola; su nombre no está verificado."}
El acceso se enviará a <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? `<p class="warn">El acceso irá a una app de este ordenador. Continúa solo si acabas de iniciar la conexión desde ella.</p>` : ""}
<p class="muted">Permiso: <strong>solo lectura</strong>. No puede cambiar nada de la partida.</p></div>`;
}

/** Paso 1: escribir el código de la partida. */
export function codeForm(d: ConsentInfo, handle: string, error?: string, scopeLabel?: string) {
  return page("Conectar partida", `<h1>Conectar con ChatGPT</h1>
<p class="sub">Escribe el código de la partida compartida, el mismo que se usa en «Jugar con un amigo → Unirme».</p>
${clientBlock(d)}
<form method="post" class="card" autocomplete="off">
<input type="hidden" name="handle" value="${esc(handle)}"><input type="hidden" name="step" value="lookup">
<label for="code">Código de la partida</label>
<input id="code" name="code" type="text" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="XXXXX-XXXXX" required>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
${scopeLabel ? `<p class="muted">${esc(scopeLabel)}</p>` : ""}
<p class="muted">El código se queda en este servidor. ChatGPT recibe un permiso que no contiene el código.</p>
<div class="row"><button class="primary" type="submit">Continuar</button>
<button type="submit" name="decision" value="deny" formnovalidate>Cancelar</button></div>
</form>`);
}

/** Paso 2: confirmar que es la partida correcta. */
export function confirmForm(d: ConsentInfo, handle: string, code: string, players: string[], islands: { name: string; region: string }[], preview: boolean) {
  return page("Confirmar partida", `<h1>¿Es esta partida?</h1>
${clientBlock(d)}
<div class="card"><p><strong>Jugadores:</strong> ${players.length ? players.map(esc).join(", ") : "—"}</p>
<p><strong>Islas (${islands.length}):</strong></p><ul>${islands.slice(0, 30).map((i) => `<li>${esc(i.name)} <span class="muted">· ${esc(i.region)}</span></li>`).join("")}${islands.length > 30 ? `<li class="muted">…y ${islands.length - 30} más</li>` : ""}</ul>
${preview ? `<p class="muted">Partida de la versión de prueba.</p>` : ""}</div>
<form method="post" class="card">
<input type="hidden" name="handle" value="${esc(handle)}"><input type="hidden" name="code" value="${esc(code)}"><input type="hidden" name="step" value="approve">
<p>ChatGPT podrá <strong>leer</strong> esta partida (islas, casas, edificios, producción y comercio) hasta que desconectes. No podrá modificar nada.</p>
<div class="row"><button class="primary" type="submit" name="decision" value="approve">Permitir solo lectura</button>
<button type="submit" name="decision" value="deny">Cancelar</button></div>
</form>`);
}

export function message(title: string, text: string, ok = false) {
  return page(title, `<h1>${esc(title)}</h1><div class="card"><p class="${ok ? "ok" : "err"}">${esc(text)}</p></div>`);
}

/** Página para desconectar ChatGPT de una partida (revoca todos los permisos de esa partida). */
export function disconnectForm(result?: { ok: boolean; text: string }) {
  return page("Desconectar", `<h1>Desconectar ChatGPT</h1>
<p class="sub">Retira todos los permisos de lectura concedidos a ChatGPT para una partida. Tendrás que volver a conectar para usarla.</p>
${result ? `<div class="card"><p class="${result.ok ? "ok" : "err"}" role="status">${esc(result.text)}</p></div>` : ""}
<form method="post" class="card" autocomplete="off">
<label for="code">Código de la partida</label>
<input id="code" name="code" type="text" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="XXXXX-XXXXX" required>
<div class="row"><button class="primary" type="submit">Desconectar</button></div>
</form>`);
}

export function home(origin: string) {
  return page("Servidor MCP", `<h1>Praefectus para ChatGPT</h1>
<p class="sub">Servidor MCP de solo lectura para consultar partidas compartidas de Praefectus.</p>
<div class="card"><p>Dirección para ChatGPT (<em>Add MCP server</em>):</p><p><code>${esc(origin)}/mcp</code></p>
<p class="muted">Autenticación: OAuth. Al conectar, se pedirá el código de la partida.</p></div>
<div class="card"><p><a href="/disconnect" style="color:var(--bronze)">Desconectar ChatGPT de una partida</a></p></div>`);
}
