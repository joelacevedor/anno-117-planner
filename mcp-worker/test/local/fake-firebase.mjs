// Firebase simulado por HTTP para wrangler dev (mismas reglas que firestore.rules).
import http from "node:http";
const enc = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === "string" ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const games = JSON.parse(process.argv[2]);
const tokens = new Set(); let n = 0;
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (s, j) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(j)); };
  if (u.pathname === "/v1/accounts:signUp" || u.pathname === "/v1/token") { const t = "id" + ++n; tokens.add(t); return send(200, u.pathname === "/v1/token" ? { id_token: t, refresh_token: "r", expires_in: "3600" } : { idToken: t, refreshToken: "r", expiresIn: "3600" }); }
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (!tokens.has(auth)) return send(403, {});
  const m = u.pathname.match(/documents\/(.*)$/); const p = m ? m[1].split("/") : [];
  if (p[0] !== "games" || !/^[A-Z2-9]{10}$/.test(p[1] || "")) return send(403, {});
  const g = games[p[1]]; const name = (x) => `projects/p/databases/(default)/documents/${x}`;
  if (p.length === 2) return g ? send(200, { name: name(`games/${p[1]}`), fields: { meta: enc(g.meta) }, updateTime: "2026-11-07T20:00:00Z" }) : send(404, {});
  if (p[2] === "islands") return send(200, { documents: Object.entries(g?.islands || {}).map(([id, d]) => ({ name: name(`games/${p[1]}/islands/${id}`), fields: enc(d).mapValue.fields, updateTime: "2026-11-07T21:00:00Z" })) });
  send(404, {});
}).listen(8788, "127.0.0.1", () => console.log("fakefb on 8788"));
