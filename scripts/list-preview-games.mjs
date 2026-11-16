#!/usr/bin/env node
/**
 * Lista (solo lectura) las partidas creadas con la versión de prueba (meta.preview = true).
 * No borra ni escribe nada. Lo lanza a mano el flujo «Listar partidas de prueba».
 *
 * El repositorio es público y sus registros también: nunca se imprime el código de una partida
 * (es la llave). Cada partida se identifica con una huella corta del código, que no permite
 * abrirla, y con datos neutros (fecha, islas, jugadores).
 */
import { createHash } from "node:crypto";

export const fingerprint = (code) => createHash("sha256").update(code).digest("hex").slice(0, 8);

/** games: [{ code, data: { meta, createdAt }, islands: number }] */
export function summarize(games) {
  const preview = games.filter((g) => g.data?.meta?.preview === true);
  const rows = preview.map((g) => ({
    huella: fingerprint(g.code),
    creada: g.data.createdAt?.toDate?.().toISOString().slice(0, 16).replace("T", " ") ?? "?",
    islas: g.islands,
    jugadores: Object.keys(g.data.meta.players ?? {}).length,
    versionDatos: g.data.meta.dataVersion ?? 1,
  })).sort((a, b) => a.creada.localeCompare(b.creada));
  return { total: games.length, reales: games.length - preview.length, preview: rows };
}

export function render(s) {
  const lines = [`Partidas en total: ${s.total} · reales: ${s.reales} · de prueba: ${s.preview.length}`, ""];
  if (s.preview.length) {
    lines.push("| Huella | Creada (UTC) | Islas | Jugadores | Versión de datos |", "| --- | --- | --- | --- | --- |");
    for (const r of s.preview) lines.push(`| ${r.huella} | ${r.creada} | ${r.islas} | ${r.jugadores} | ${r.versionDatos} |`);
  } else lines.push("No hay partidas de prueba.");
  return lines.join("\n");
}

async function main() {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const projectId = process.env.FIREBASE_PROJECT;
  if (!projectId) throw new Error("Falta FIREBASE_PROJECT");
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  // Solo lecturas: get() de la colección y recuento de islas de cada partida de prueba.
  const snap = await db.collection("games").get();
  const games = [];
  for (const d of snap.docs) {
    const data = d.data();
    const islands = data?.meta?.preview === true ? (await d.ref.collection("islands").count().get()).data().count : 0;
    games.push({ code: d.id, data, islands });
  }
  console.log(render(summarize(games)));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
