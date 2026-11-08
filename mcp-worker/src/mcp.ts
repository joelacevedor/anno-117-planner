/** Herramientas MCP de solo lectura. Cada llamada lee la partida en ese momento (nada se guarda en caché). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readGame, UpstreamError } from "./firebase";
import { compute, findIslands, gameSummary, islandDetail, islandText, load, type Loaded } from "./game";
import { SCOPE_READ, scopeAllows, type Env, type Props } from "./config";
export { SCOPE_READ };
const VERSION = "0.1.0";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const security = { securitySchemes: [{ type: "oauth2", scopes: [SCOPE_READ] }] };
const lang = z.enum(["es", "en"]).optional().describe("Idioma de los nombres de productos y edificios (por defecto, es).");

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const fail = (text: string): Result => ({ content: [{ type: "text", text }], isError: true });
const ok = (text: string, data: Record<string, unknown>): Result => ({ content: [{ type: "text", text }], structuredContent: data });

/** Lee la partida concedida. Nunca devuelve el código. */
async function loadGranted(env: Env, props: Props, l: "es" | "en"): Promise<Loaded | Result> {
  let read;
  try {
    read = await readGame(env, props.code);
  } catch (e) {
    console.error(JSON.stringify({ ev: "firestore_error", status: e instanceof UpstreamError ? e.status : 0 }));
    return fail("No se ha podido leer la partida en Firebase ahora mismo. Inténtalo de nuevo en unos minutos.");
  }
  if (!read) return fail("La partida conectada ya no existe. Desconecta y vuelve a conectar con el código actual.");
  const preview = (read.game.data.meta as { preview?: boolean } | undefined)?.preview === true;
  if (!scopeAllows(env, preview)) return fail("Este servidor ya no acepta esta partida. Vuelve a conectar desde el servidor correcto.");
  return load(read.game, read.islands, l);
}

const audit = (tool: string, okFlag: boolean, t0: number) =>
  console.log(JSON.stringify({ ev: "tool", tool, ok: okFlag, ms: Date.now() - t0 }));

export function createMcpServer(env: Env, props: Props) {
  const server = new McpServer(
    { name: "praefectus", title: "Praefectus · ANNO 117", version: VERSION },
    {
      instructions:
        "Praefectus es el planificador de producción de la partida compartida de ANNO 117 de los usuarios. " +
        "Usa get_game para ver las islas y find_island o get_island para consultar una isla por su nombre (p. ej. «Hispania»). " +
        "Los datos son los registrados en Praefectus y los cálculos de su motor; di siempre si un valor es estimado. " +
        "Este servidor es de solo lectura: no puede cambiar la partida.",
    },
  );

  server.registerTool("get_game", {
    title: "Consultar partida",
    description: "Resumen de la partida compartida conectada: jugadores, nivel de consumo, DLC, versión de datos, fecha de la última modificación y lista de islas (id, nombre, región, dueño, casas y edificios construidos).",
    inputSchema: { lang },
    annotations: { ...readOnly, title: "Consultar partida" },
    _meta: security,
  }, async ({ lang: l = "es" }) => {
    const t0 = Date.now();
    const g = await loadGranted(env, props, l);
    if ("content" in g) { audit("get_game", false, t0); return g; }
    const s = gameSummary(g, l);
    audit("get_game", true, t0);
    return ok(`Partida de ${s.players.join(", ") || "—"}: ${s.islands.length} islas (${s.islands.map((i) => `${i.name} · ${i.region}`).join(", ")}).`, s);
  });

  server.registerTool("find_island", {
    title: "Buscar isla",
    description: "Busca islas de la partida por nombre (sin distinguir mayúsculas ni acentos). Devuelve id, nombre, región y dueño.",
    inputSchema: { name: z.string().min(1).max(40).describe("Nombre o parte del nombre, p. ej. «Hispania»."), lang },
    annotations: { ...readOnly, title: "Buscar isla" },
    _meta: security,
  }, async ({ name, lang: l = "es" }) => {
    const t0 = Date.now();
    const g = await loadGranted(env, props, l);
    if ("content" in g) { audit("find_island", false, t0); return g; }
    const matches = findIslands(g.state, name);
    audit("find_island", true, t0);
    return ok(matches.length ? matches.map((m) => `${m.name} (${m.region}) id=${m.id}`).join("; ") : `No hay ninguna isla que se llame «${name}».`, { matches });
  });

  server.registerTool("get_island", {
    title: "Consultar isla",
    description:
      "Datos actuales de una isla y los cálculos de Praefectus: casas y residentes por nivel, edificios construidos y pendientes, " +
      "cadenas de producción (objetivo, demanda de las casas, cuello de botella), producción y consumo por producto (unidades/min), " +
      "excedentes, déficits, comercio con otras islas y mejoras. Acepta el id o el nombre de la isla.",
    inputSchema: { island: z.string().min(1).max(64).describe("Id de la isla o su nombre, p. ej. «Hispania»."), lang },
    annotations: { ...readOnly, title: "Consultar isla" },
    _meta: security,
  }, async ({ island, lang: l = "es" }) => {
    const t0 = Date.now();
    const g = await loadGranted(env, props, l);
    if ("content" in g) { audit("get_island", false, t0); return g; }
    let id = g.state.islands.some((i) => i.id === island) ? island : null;
    if (!id) {
      const m = findIslands(g.state, island);
      const exact = m.filter((x) => x.name.toLowerCase() === island.toLowerCase());
      const pick = exact.length === 1 ? exact : m;
      if (pick.length === 1) id = pick[0].id;
      else {
        audit("get_island", false, t0);
        return pick.length
          ? fail(`Hay varias islas que coinciden con «${island}»: ${pick.map((x) => `${x.name} (id=${x.id})`).join(", ")}. Indica el id.`)
          : fail(`No hay ninguna isla «${island}» en esta partida. Usa get_game para ver la lista.`);
      }
    }
    const detail = islandDetail(g, compute(g.state), id, l);
    audit("get_island", !!detail, t0);
    if (!detail) return fail("Esa isla es de una región que este servidor no conoce todavía.");
    return ok(islandText(detail), detail as unknown as Record<string, unknown>);
  });

  return server;
}
