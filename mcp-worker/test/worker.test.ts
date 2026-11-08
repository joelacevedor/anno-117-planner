import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stateSchema, type State } from "../../src/core/state";
import { worldPlan } from "../../src/core/plan";
import { modsFor } from "../../src/core/boosts";
import { buildings, chains, consumptionLevels, dlcNeedsOff, levels } from "../../src/data/catalog";
import { parseCode } from "../../src/sync/model";
import { CODE_RE } from "../src/firebase";
import { call, connect, FakeFirebase, makeEnv, mcp, MemoryKV, ORIGIN, REDIRECT, setup, tool } from "./harness";

// Códigos de prueba con el formato real (sin I ni O).
const PREVIEW = "KQ7XAM3TZP"; // partida de la versión de prueba
const PREVIEW_B = "ZZ22HH44JJ"; // otra partida de prueba
const REAL = "HSPN2226AB"; // partida real

const latium = levels.filter((l) => l.region === "Latium");
const albion = levels.filter((l) => l.region === "Albion");
const latChain = chains.find((c) => c.region === "Latium" && c.category === "Food")!;
const albChain = chains.find((c) => c.region === "Albion")!;
const someLatBuilding = Object.values(buildings).find((b) => b.region === "Latium")!;

function gameState(name: string, extra: Partial<State> = {}): State {
  return stateSchema.parse({
    v: 2, lang: "es", motion: "auto", consumption: "Medium", techs: [], current: "isl-a",
    islands: [
      { id: "isl-a", name, region: "Latium", goals: { [latChain.id]: 3 }, built: { [someLatBuilding.id]: 2 }, houses: { [latium[0].id]: 120, [latium[1].id]: 40 }, popReal: { [latium[1].id]: 9000 }, owner: "Joel" },
      { id: "isl-b", name: "Britannia", region: "Albion", goals: { [albChain.id]: 2 }, built: {}, houses: { [albion[0].id]: 60 }, owner: "Ale" },
    ],
    ...extra,
  });
}

let kv: MemoryKV, fb: FakeFirebase;
beforeEach(() => {
  kv = new MemoryKV();
  fb = new FakeFirebase();
  fb.addGame(PREVIEW, gameState("Hispania"), { preview: true });
  fb.addGame(PREVIEW_B, gameState("Gallia"), { preview: true });
  fb.addGame(REAL, gameState("Hispania"));
  setup(fb);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("descubrimiento OAuth (lo que ChatGPT lee al conectar)", () => {
  it("/mcp sin token → 401 con enlace a los metadatos del recurso", async () => {
    const { res } = await mcp(makeEnv(kv), null, "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
  });
  it("metadatos del recurso y del servidor de autorización", async () => {
    const env = makeEnv(kv);
    const pr = await (await call(env, new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`))).json() as Record<string, unknown>;
    expect(pr.resource).toBe(`${ORIGIN}/mcp`);
    expect(pr.authorization_servers).toEqual([ORIGIN]);
    const as = await (await call(env, new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json() as Record<string, unknown>;
    expect(as.issuer).toBe(ORIGIN);
    expect(as.code_challenge_methods_supported).toContain("S256");
    expect(as.registration_endpoint).toBe(`${ORIGIN}/register`);
    expect(as.authorization_response_iss_parameter_supported).toBe(true);
    expect(as.scopes_supported).toEqual(["praefectus.read"]);
  });
  it("registro de clientes: solo redirecciones a chatgpt.com (anti-phishing de consentimiento)", async () => {
    const env = makeEnv(kv);
    for (const uri of ["https://evil.example/cb", "http://chatgpt.com/cb", "https://chatgpt.com.evil.example/cb"]) {
      const r = await call(env, new Request(`${ORIGIN}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "x", redirect_uris: [REDIRECT, uri], token_endpoint_auth_method: "none" }) }));
      expect(r.status).toBe(400);
    }
    const ok = await call(env, new Request(`${ORIGIN}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "x", redirect_uris: ["https://chatgpt.com/connector/oauth/abc123"], token_endpoint_auth_method: "none" }) }));
    expect(ok.status).toBe(201);
  });
  it("otro host → 421 (no se sirve con un Host distinto del público)", async () => {
    const res = await call(makeEnv(kv), new Request("https://evil.example/mcp"));
    expect(res.status).toBe(421);
  });
});

describe("conexión y consulta (prueba 1, 3, 4)", () => {
  it("flujo completo: código → confirmar → token → consultar Hispania", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, "kq7xa-m3tzp"); // como lo escribiría una persona
    expect(c.confirmHtml).toContain("Hispania");
    expect(c.location!.origin + c.location!.pathname).toBe(REDIRECT);
    expect(c.location!.searchParams.get("state")).toBe("st4te");
    expect(c.location!.searchParams.get("iss")).toBe(ORIGIN);
    expect(c.tokens!.scope).toBe("praefectus.read");

    const list = await mcp(env, c.tokens!.access_token, "tools/list");
    const names = ((list.body!.result!.tools as { name: string; annotations: { readOnlyHint: boolean } }[]));
    expect(names.map((t) => t.name).sort()).toEqual(["find_island", "get_game", "get_island"]);
    expect(names.every((t) => t.annotations.readOnlyHint)).toBe(true);

    const game = await tool(env, c.tokens!.access_token, "get_game", {});
    expect(game.result!.isError).toBeFalsy();
    expect((game.result!.structuredContent!.islands as { name: string }[]).map((i) => i.name)).toEqual(["Hispania", "Britannia"]);
    expect(game.result!.structuredContent!.players).toEqual(["Joel", "Ale"]);

    const isl = await tool(env, c.tokens!.access_token, "get_island", { island: "hispania" });
    const d = isl.result!.structuredContent as Record<string, any>;
    expect(d.island.name).toBe("Hispania");
    expect(d.population[0]).toMatchObject({ houses: 120, residentsSource: "estimado" });
    expect(d.population[1]).toMatchObject({ houses: 40, residents: 360, residentsSource: "registrado (copiado del juego)" }); // 9000/1000 × 40
    expect(isl.result!.content[0].text).toContain("Hispania (Latium)");
  });

  it("las cifras coinciden con el cálculo de la app (prueba 5)", async () => {
    const env = makeEnv(kv);
    const { tokens } = await connect(env, PREVIEW);
    const d = (await tool(env, tokens!.access_token, "get_island", { island: "isl-a" })).result!.structuredContent as Record<string, any>;
    // Lo mismo que hace src/ui/App.tsx con el estado original (sin pasar por Firestore).
    const s = gameState("Hispania");
    const factor = consumptionLevels.find((c) => c.id === s.consumption)!.factor;
    const mods = Object.fromEntries(s.islands.map((i) => [i.id, modsFor(i.region, { techs: s.techs, patron: i.patron, events: i.events, manual: i.productivity, producers: i.producers, nile: i.nile })]));
    const off = dlcNeedsOff(s.dlcs);
    const world = worldPlan(s.islands.map((i) => ({ ...i, needsOff: [...i.needsOff, ...off], mods: mods[i.id] })), factor, { countBuilt: s.countBuilt });
    const plan = world.plans["isl-a"];
    expect(d.toBuild.map((b: { id: string; count: number }) => [b.id, b.count])).toEqual(plan.toBuild.map((b) => [b.id, b.count]));
    for (const r of plan.rows) {
      const row = d.buildings.find((b: { id: string }) => b.id === r.id);
      expect(row).toMatchObject({ built: r.built, recommended: r.recommended, missing: r.missing });
    }
    expect(d.chains.map((c: { chainId: string; finalsNeeded: number }) => [c.chainId, c.finalsNeeded])).toEqual(plan.chains.map((c) => [c.chainId, c.finals]));
  });

  it("find_island ignora mayúsculas y acentos; isla inexistente → error claro", async () => {
    const env = makeEnv(kv);
    const { tokens } = await connect(env, PREVIEW);
    const f = await tool(env, tokens!.access_token, "find_island", { name: "BRITÁNNIA" });
    expect((f.result!.structuredContent!.matches as { id: string }[])[0].id).toBe("isl-b");
    const missing = await tool(env, tokens!.access_token, "get_island", { island: "Aegyptus Magna" });
    expect(missing.result!.isError).toBe(true);
  });

  it("partida de una versión más nueva: se lee con aviso", async () => {
    fb.games.get(PREVIEW)!.meta.dataVersion = 99;
    const env = makeEnv(kv);
    const { tokens } = await connect(env, PREVIEW);
    const d = (await tool(env, tokens!.access_token, "get_island", { island: "Hispania" })).result!.structuredContent as { notes: string[] };
    expect(d.notes.join(" ")).toContain("más nueva");
  });

  it("Firebase caído → error legible, sin datos ni detalles internos", async () => {
    const env = makeEnv(kv);
    const { tokens } = await connect(env, PREVIEW);
    fb.down = true;
    const r = await tool(env, tokens!.access_token, "get_game", {});
    expect(r.result!.isError).toBe(true);
    expect(r.result!.content[0].text).toContain("No se ha podido leer");
  });

  it("reutiliza la sesión anónima del Worker (no crea un usuario de Firebase por consulta)", async () => {
    const env = makeEnv(kv);
    const { tokens } = await connect(env, PREVIEW);
    for (let i = 0; i < 3; i++) await tool(env, tokens!.access_token, "get_game", {});
    expect(fb.signUps).toBe(1);
  });
});

describe("protección del código de la partida", () => {
  it("el código no aparece en tokens, respuestas MCP, redirecciones, KV ni registros", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...a) => { logs.push(a.join(" ")); });
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    const seen: string[] = [JSON.stringify(c.tokens), c.location!.href, c.approved!.headers.get("Location") ?? ""];
    for (const [name, args] of [["get_game", {}], ["find_island", { name: "a" }], ["get_island", { island: "Hispania" }], ["get_island", { island: "nope" }]] as const)
      seen.push((await tool(env, c.tokens!.access_token, name, args)).text);
    seen.push((await mcp(env, c.tokens!.access_token, "tools/list")).text);
    const variants = [PREVIEW, "KQ7XA-M3TZP", PREVIEW.toLowerCase()];
    for (const text of [...seen, kv.dump(), logs.join("\n")]) for (const v of variants) expect(text).not.toContain(v);
  });

  it("el identificador interno de la partida no se puede convertir en el código", async () => {
    const env = makeEnv(kv);
    await connect(env, PREVIEW);
    const grantKeys = [...kv.store.keys()].filter((k) => k.startsWith("grant:"));
    expect(grantKeys.length).toBe(1);
    expect(grantKeys[0]).toMatch(/^grant:g[0-9a-f]{40}:/);
  });

  it("código inexistente, mal escrito o de otra partida → la página lo dice y no redirige", async () => {
    const env = makeEnv(kv);
    const bad = await connect(env, "ABCDEFGH23");
    expect(bad.confirm!.status).toBe(400);
    expect(bad.confirmHtml).toContain("No existe ninguna partida");
    const malformed = await connect(env, "hola");
    expect(malformed.confirmHtml).toContain("10 letras");
    expect(malformed.confirm!.headers.get("Location")).toBeNull();
  });

  it("límite de intentos: tras 12 códigos en 10 minutos → 429", async () => {
    const env = makeEnv(kv);
    const first = await connect(env, "ABCDEFGH23", { stopAt: "page" });
    let last: Response | undefined;
    for (let i = 0; i < 13; i++) {
      last = await call(env, new Request(`${ORIGIN}/authorize`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: first.cookie!, "CF-Connecting-IP": "198.51.100.9" },
        body: new URLSearchParams({ handle: first.handle!, step: "lookup", code: `ABCDEFGH${"23456789"[i % 8]}${"ABCDEFGH"[Math.floor(i / 8)]}` }),
      }));
    }
    expect(last!.status).toBe(429);
  });

  it("el formulario no se puede usar sin la cookie del navegador que abrió la página", async () => {
    const env = makeEnv(kv);
    const p = await connect(env, PREVIEW, { stopAt: "page" });
    const lookup = await call(env, new Request(`${ORIGIN}/authorize`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: p.cookie! }, body: new URLSearchParams({ handle: p.handle!, step: "lookup", code: PREVIEW }) }));
    const code = (await lookup.text()).match(/name="code" value="([^"]+)"/)![1];
    const forged = await call(env, new Request(`${ORIGIN}/authorize`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ handle: p.handle!, step: "approve", decision: "approve", code }) }));
    expect(forged.status).toBe(400);
    expect(forged.headers.get("Location")).toBeNull();
  });

  it("la página escapa el nombre del cliente y no se puede incrustar", async () => {
    const env = makeEnv(kv);
    const p = await connect(env, PREVIEW, { stopAt: "page", clientName: `<img src=x onerror=alert(1)>` });
    expect(p.pageHtml).not.toContain("<img src=x");
    expect(p.pageHtml).toContain("&#60;img");
    expect(p.page!.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(p.page!.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("Cancelar → vuelve a ChatGPT con access_denied y sin permiso", async () => {
    const env = makeEnv(kv);
    const { denied } = await connect(env, PREVIEW, { deny: true });
    const loc = new URL(denied!.headers.get("Location")!);
    expect(loc.searchParams.get("error")).toBe("access_denied");
    expect([...kv.store.keys()].some((k) => k.startsWith("grant:"))).toBe(false);
  });

  it("el formato del código es el mismo que el de la app", () => {
    for (const c of ["KQ7XAM3TZP", "kq7xa-m3tzp", "IIIIIIIIII", "OOOOOOOOOO", "ABCDEFGH01", "ABCDEFGH2"]) {
      expect(CODE_RE.test(c.toUpperCase().replace(/[^A-Z0-9]/g, ""))).toBe(parseCode(c) !== null);
    }
  });
});

describe("aislamiento entre partidas (prueba 2, 6)", () => {
  it("cada permiso solo ve su partida; las islas de otra partida no existen para él", async () => {
    const env = makeEnv(kv);
    const a = await connect(env, PREVIEW);
    const b = await connect(env, PREVIEW_B);
    const ga = (await tool(env, a.tokens!.access_token, "get_game", {})).result!.structuredContent as { islands: { name: string }[] };
    const gb = (await tool(env, b.tokens!.access_token, "get_game", {})).result!.structuredContent as { islands: { name: string }[] };
    expect(ga.islands[0].name).toBe("Hispania");
    expect(gb.islands[0].name).toBe("Gallia");
    expect((await tool(env, a.tokens!.access_token, "get_island", { island: "Gallia" })).result!.isError).toBe(true);
  });

  it("los argumentos no permiten cambiar de partida (no hay parámetro de código)", async () => {
    const env = makeEnv(kv);
    const a = await connect(env, PREVIEW);
    const r = await tool(env, a.tokens!.access_token, "get_game", { code: PREVIEW_B, gameId: PREVIEW_B });
    const s = r.result!.structuredContent as { islands: { name: string }[] } | undefined;
    expect(s?.islands?.[0]?.name ?? "").not.toBe("Gallia");
    expect(fb.requests.some((p) => p.includes(PREVIEW_B) && p.includes("islands"))).toBe(false);
  });

  it("servidor de pruebas (preview) rechaza la partida real; servidor real rechaza las de prueba", async () => {
    const test = await connect(makeEnv(kv, "preview"), REAL);
    expect(test.confirmHtml).toContain("solo acepta partidas creadas en la versión de prueba");
    const kv2 = new MemoryKV();
    const prod = await connect(makeEnv(kv2, "real"), PREVIEW);
    expect(prod.confirmHtml).toContain("solo acepta partidas reales");
    const ok = await connect(makeEnv(kv2, "real"), REAL);
    expect(ok.tokens!.access_token).toBeTruthy();
  });

  it("si el servidor pasa de preview a real, los permisos de partidas de prueba dejan de servir", async () => {
    const c = await connect(makeEnv(kv, "preview"), PREVIEW);
    const r = await tool(makeEnv(kv, "real"), c.tokens!.access_token, "get_game", {});
    expect(r.result!.isError).toBe(true);
  });
});

describe("tokens: caducidad, invalidez, audiencia y revocación (pruebas 7, 8)", () => {
  it("token inventado o manipulado → 401", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    expect((await mcp(env, "abc:def:ghi", "tools/list")).res.status).toBe(401);
    const t = c.tokens!.access_token;
    expect((await mcp(env, t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA"), "tools/list")).res.status).toBe(401);
  });

  it("token caducado (más de 1 hora) → 401; el refresh token da uno nuevo que funciona", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect((await mcp(env, c.tokens!.access_token, "tools/list")).res.status).toBe(401);
    const r = await call(env, new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.client!.client_id, resource: `${ORIGIN}/mcp` }) }));
    const fresh = (await r.json()) as { access_token: string };
    expect((await tool(env, fresh.access_token, "get_game", {})).result!.isError).toBeFalsy();
  });

  it("token emitido para otro servidor (otra audiencia) → 401 aquí", async () => {
    const OTHER = "https://otro.example.workers.dev";
    const otherEnv = makeEnv(kv, "preview", OTHER);
    // Mismo KV a propósito: aun compartiendo almacenamiento, la audiencia no coincide.
    const reg = await call(otherEnv, new Request(`${OTHER}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "x", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }) }));
    expect(reg.status).toBe(201);
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    const other = await call(otherEnv, new Request(`${OTHER}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${c.tokens!.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    expect(other.status).toBe(401);
  });

  it("Desconectar en /disconnect revoca el acceso y el refresh token al momento", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    const other = await connect(env, PREVIEW_B);
    const res = await call(env, new Request(`${ORIGIN}/disconnect`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: "kq7xa-m3tzp" }) }));
    expect(await res.text()).toContain("se han retirado 1 permiso");
    expect((await mcp(env, c.tokens!.access_token, "tools/list")).res.status).toBe(401);
    const r = await call(env, new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.client!.client_id }) }));
    expect(r.status).toBe(400);
    // La otra partida sigue conectada.
    expect((await tool(env, other.tokens!.access_token, "get_game", {})).result!.isError).toBeFalsy();
  });

  it("revocación estándar (RFC 7009) del refresh token desde el cliente", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    const rev = await call(env, new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: c.tokens!.refresh_token, token_type_hint: "refresh_token", client_id: c.client!.client_id }) }));
    expect(rev.status).toBe(200);
    const r = await call(env, new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.client!.client_id }) }));
    expect(r.status).toBe(400);
  });

});

describe("protocolo", () => {
  it("GET y DELETE en /mcp → 405 (servidor sin estado, sin canal SSE abierto)", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    for (const method of ["GET", "DELETE"]) {
      const r = await call(env, new Request(`${ORIGIN}/mcp`, { method, headers: { Authorization: `Bearer ${c.tokens!.access_token}`, Accept: "text/event-stream" } }));
      expect(r.status).toBe(405);
    }
  });
  it("nombres en inglés con lang=en", async () => {
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    const d = (await tool(env, c.tokens!.access_token, "get_island", { island: "Hispania", lang: "en" })).result!.structuredContent as { population: { level: string }[] };
    expect(d.population[0].level).toBe(latium[0].name.en);
  });
});

describe("solo lectura", () => {
  it("el Worker solo hace GET a Firestore", async () => {
    const methods: string[] = [];
    const inner = fb.fetch;
    fb.fetch = async (input, init) => { const u = String(input instanceof Request ? input.url : input); if (u.includes("firestore")) methods.push(init?.method ?? "GET"); return inner(input, init); };
    setup(fb);
    const env = makeEnv(kv);
    const c = await connect(env, PREVIEW);
    for (const t of ["get_game", "get_island"]) await tool(env, c.tokens!.access_token, t, { island: "Hispania" });
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  });
});
