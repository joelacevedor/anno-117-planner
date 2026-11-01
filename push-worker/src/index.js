/**
 * Cartero de avisos (Web Push) del chat de la partida.
 *
 * GET  /vapid   → clave pública VAPID (para que el móvil se suscriba)
 * POST /notify  → { subs: [{ endpoint, keys }], title, body, tag } ; firma y envía el aviso a cada suscripción.
 *                 Responde { gone: [endpoint] } con las suscripciones que ya no existen.
 *
 * La clave privada VAPID vive solo aquí, como secreto (VAPID_PRIVATE_JWK). No guarda datos.
 */
import { buildPushHTTPRequest } from "@pushforge/builder";

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];
const MAX_SUBS = 12;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function publicKey(jwk) {
  const x = fromB64url(jwk.x), y = fromB64url(jwk.y);
  const out = new Uint8Array(65);
  out[0] = 4; out.set(x, 1); out.set(y, 33);
  return b64url(out);
}

function cors(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const { ok, headers } = cors(req.headers.get("Origin") || "", allowed);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!env.VAPID_PRIVATE_JWK) return json({ error: "not configured" }, 503, headers);
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);

    if (req.method === "GET" && url.pathname === "/vapid") return json({ publicKey: publicKey(jwk) }, 200, headers);

    if (req.method === "POST" && url.pathname === "/notify") {
      if (!ok) return json({ error: "origin" }, 403, headers);
      let input;
      try { input = await req.json(); } catch { return json({ error: "json" }, 400, headers); }
      const subs = Array.isArray(input.subs) ? input.subs.slice(0, MAX_SUBS) : [];
      const payload = {
        title: String(input.title || "Anno 117").slice(0, 60),
        body: String(input.body || "").slice(0, 180),
        tag: String(input.tag || "chat").slice(0, 40),
      };
      const gone = [];
      await Promise.all(subs.map(async (sub) => {
        try {
          const host = new URL(sub.endpoint).hostname;
          if (!PUSH_HOSTS.some((r) => r.test(host)) || !sub.keys?.p256dh || !sub.keys?.auth) return;
          const r = await buildPushHTTPRequest({
            privateJWK: jwk,
            subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            message: { payload, adminContact: "https://anno117-cadenas.web.app", options: { ttl: 3600, urgency: "normal", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "chat" } },
          });
          const res = await fetch(r.endpoint, { method: "POST", headers: r.headers, body: r.body });
          if (res.status === 404 || res.status === 410) gone.push(sub.endpoint);
        } catch { /* una suscripción rota no frena a las demás */ }
      }));
      return json({ gone }, 200, headers);
    }
    return json({ error: "not found" }, 404, headers);
  },
};
