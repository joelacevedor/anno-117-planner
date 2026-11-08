// Pruebas de firestore.rules con el emulador de Firestore.
// Se ejecutan en CI (.github/workflows/firestore-rules.yml); no despliegan nada.
// Comprueban lo que la app necesita (partida compartida) y que nadie pueda enumerar partidas.
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const CODE = "KQ7XAM3TZP";
const OTHER = "ZZ22HH44JJ";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-anno117-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const code of [CODE, OTHER]) {
      await setDoc(doc(db, "games", code), { meta: { players: { u1: "Joel" } } });
      await setDoc(doc(db, "games", code, "islands", "isl-a"), { name: "Hispania", region: "Latium" });
    }
  });
});

// Un jugador con sesión anónima (como la app).
const player = (uid = "anon-1") => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

describe("lo que la app necesita (no debe romperse)", () => {
  it("crear una partida con sus islas (writeBatch)", async () => {
    const db = player();
    const b = writeBatch(db);
    b.set(doc(db, "games", "NEW2345678"), { meta: { players: { u: "A" } } });
    b.set(doc(db, "games", "NEW2345678", "islands", "x"), { name: "Nueva" });
    await assertSucceeds(b.commit());
  });
  it("leer la partida conociendo el código (get)", async () => { await assertSucceeds(getDoc(doc(player(), "games", CODE))); });
  it("unirse: comprobar que existe", async () => { await assertSucceeds(getDoc(doc(player(), "games", "NOEXISTE22"))); });
  it("escuchar las islas de la partida (consulta dentro de la partida)", async () => { await assertSucceeds(getDocs(collection(player(), "games", CODE, "islands"))); });
  it("editar un campo de una isla y de la partida", async () => {
    await assertSucceeds(updateDoc(doc(player(), "games", CODE, "islands", "isl-a"), { "built.b1": 2 }));
    await assertSucceeds(updateDoc(doc(player(), "games", CODE), { "meta.players.u2": "Ale" }));
  });
  it("borrar una isla", async () => { await assertSucceeds(deleteDoc(doc(player(), "games", CODE, "islands", "isl-a"))); });
  it("chat: leer los últimos mensajes y enviar uno", async () => {
    await assertSucceeds(getDocs(query(collection(player(), "games", CODE, "chat"), limit(250))));
    await assertSucceeds(addDoc(collection(player(), "games", CODE, "chat"), { uid: "anon-1", name: "Joel", text: "hola" }));
  });
  it("avisos: guardar y leer suscripciones", async () => {
    await assertSucceeds(setDoc(doc(player(), "games", CODE, "push", "anon-1"), { name: "Joel" }));
    await assertSucceeds(getDocs(collection(player(), "games", CODE, "push")));
  });
});

describe("lo que no debe permitirse", () => {
  it("sin sesión no se lee nada", async () => { await assertFails(getDoc(doc(nobody(), "games", CODE))); });
  it("código con formato inválido", async () => { await assertFails(getDoc(doc(player(), "games", "hola"))); });
  it("fuera de /games", async () => { await assertFails(getDoc(doc(player(), "users", "x"))); });
  // D4: enumeración. Si estas fallan, cualquiera con la clave web pública y una sesión anónima
  // podría obtener los códigos de TODAS las partidas (y con ellos leerlas y modificarlas).
  it("ENUMERACIÓN: listar la colección /games", async () => { await assertFails(getDocs(collection(player(), "games"))); });
  it("ENUMERACIÓN: listar /games con límite", async () => { await assertFails(getDocs(query(collection(player(), "games"), limit(1)))); });
  it("ENUMERACIÓN: consulta de grupo sobre todas las islas", async () => { await assertFails(getDocs(collectionGroup(player(), "islands"))); });
  it("ENUMERACIÓN: consulta de grupo sobre todos los chats", async () => { await assertFails(getDocs(collectionGroup(player(), "chat"))); });
});
