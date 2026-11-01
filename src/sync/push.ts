/**
 * Avisos del chat con Web Push.
 * El móvil se suscribe con la clave pública del cartero (Cloudflare Worker) y guarda su
 * suscripción en la partida; al escribir en el chat, la app pide al cartero que avise a los demás.
 */
import { pushUrl } from "./config";
import { getBackend } from "./useSync";
import type { PushSub } from "./controller";

const flagKey = (code: string) => `anno117-push:${code}`;

export const pushSupported = () =>
  !!pushUrl && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** En iPhone/iPad, Web Push solo funciona con la app instalada en la pantalla de inicio. */
export const needsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;

export function pushEnabled(code: string) {
  try { return localStorage.getItem(flagKey(code)) === "1" && Notification.permission === "granted"; } catch { return false; }
}

const toBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function enablePush(code: string, name: string): Promise<"ok" | "denied" | "error"> {
  try {
    if (!pushSupported()) return "error";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const { publicKey } = await (await fetch(`${pushUrl}/vapid`)).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
    const json = sub.toJSON() as PushSub;
    const b = await getBackend();
    await b.pushSave?.(code, await b.uid(), { name, sub: { endpoint: json.endpoint, keys: json.keys } });
    localStorage.setItem(flagKey(code), "1");
    return "ok";
  } catch {
    return "error";
  }
}

export async function disablePush(code: string) {
  try {
    localStorage.removeItem(flagKey(code));
    const b = await getBackend();
    await b.pushRemove?.(code, await b.uid());
  } catch { /* sin conexión: se limpia al volver */ }
}

/** Avisa a los demás jugadores de un mensaje nuevo. No bloquea ni falla en voz alta. */
export async function notifyOthers(code: string, name: string, text: string) {
  if (!pushUrl) return;
  try {
    const b = await getBackend();
    const me = await b.uid();
    const targets = (await b.pushTargets?.(code) ?? []).filter((x) => x.uid !== me);
    if (!targets.length) return;
    const res = await fetch(`${pushUrl}/notify`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subs: targets.map((x) => x.sub), title: name, body: text, tag: code }),
    });
    const { gone } = (await res.json()) as { gone?: string[] };
    for (const t of targets) if (gone?.includes(t.sub.endpoint)) void b.pushRemove?.(code, t.uid);
  } catch { /* el aviso es un extra */ }
}
