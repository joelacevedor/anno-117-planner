/**
 * Backend de sincronización con Firebase (Firestore + sesión anónima).
 * Se carga solo cuando el jugador abre una partida compartida.
 *
 * games/{code}            → { meta: SharedMeta, createdAt }
 * games/{code}/islands/id → isla compartida
 */
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, deleteField, doc, FieldPath, getDoc, getDocs, setDoc, initializeFirestore, limit, onSnapshot, orderBy,
  persistentLocalCache, persistentMultipleTabManager, query, serverTimestamp, writeBatch, type Firestore, type Timestamp,
} from "firebase/firestore";
import type { ChatMessage, PushSub, SyncBackend } from "./controller";
import type { Op, Remote, SharedIsland, SharedMeta } from "./model";

export function firebaseBackend(config: FirebaseOptions): SyncBackend {
  const app = initializeApp(config, "anno117");
  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  let signing: Promise<string> | null = null;
  const uid = () =>
    (signing ??= auth.currentUser ? Promise.resolve(auth.currentUser.uid) : signInAnonymously(auth).then((c) => c.user.uid));

  const toArgs = (fields: Record<string, unknown>) => {
    const args: unknown[] = [];
    for (const [path, v] of Object.entries(fields)) {
      args.push(new FieldPath(...path.split(".")));
      args.push(v && typeof v === "object" && "__delete" in (v as object) ? deleteField() : v);
    }
    return args as [FieldPath, unknown, ...unknown[]];
  };

  return {
    uid,
    async exists(code) {
      await uid();
      return (await getDoc(doc(db, "games", code))).exists();
    },
    async create(code, remote) {
      await uid();
      const batch = writeBatch(db);
      batch.set(doc(db, "games", code), { meta: remote.meta, createdAt: serverTimestamp() });
      for (const [id, isl] of Object.entries(remote.islands)) batch.set(doc(db, "games", code, "islands", id), isl);
      await batch.commit();
    },
    subscribe(code, onRemote, onError) {
      let meta: SharedMeta | null = null;
      let islands: Record<string, SharedIsland> | null = null;
      let pendingMeta = false, pendingIslands = false;
      const emit = () => { if (meta && islands) onRemote({ meta, islands }, pendingMeta || pendingIslands); };
      const u1 = onSnapshot(doc(db, "games", code), { includeMetadataChanges: true }, (snap) => {
        const d = snap.data();
        meta = { techs: [], consumption: "Low", players: {}, ...(d?.meta ?? {}) };
        pendingMeta = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
        emit();
      }, onError);
      const u2 = onSnapshot(collection(db, "games", code, "islands"), { includeMetadataChanges: true }, (snap) => {
        islands = Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as SharedIsland]));
        pendingIslands = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
        emit();
      }, onError);
      return () => { u1(); u2(); };
    },
    chatSubscribe(code, onMessages) {
      // Solo los últimos 250 mensajes.
      const q = query(collection(db, "games", code, "chat"), orderBy("at", "desc"), limit(250));
      return onSnapshot(q, (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: "estimate" }) as { uid: string; name: string; text: string; at?: Timestamp | null };
          return { id: d.id, uid: x.uid, name: x.name, text: x.text, at: x.at ? x.at.toMillis() : null };
        });
        onMessages(list.reverse());
      }, () => {});
    },
    async chatSend(code, msg) {
      await uid();
      await addDoc(collection(db, "games", code, "chat"), { ...msg, text: msg.text.slice(0, 500), at: serverTimestamp() });
    },
    async pushSave(code, id, data) {
      await uid();
      await setDoc(doc(db, "games", code, "push", id), { ...data, at: serverTimestamp() });
    },
    async pushRemove(code, id) {
      await uid();
      await deleteDoc(doc(db, "games", code, "push", id));
    },
    async pushTargets(code) {
      await uid();
      const snap = await getDocs(collection(db, "games", code, "push"));
      return snap.docs.map((d) => ({ uid: d.id, sub: (d.data() as { sub: PushSub }).sub })).filter((x) => x.sub?.endpoint);
    },
    async apply(code, ops: Op[]) {
      const batch = writeBatch(db);
      for (const op of ops) {
        if (op.kind === "delete") batch.delete(doc(db, "games", code, "islands", op.island));
        else if (op.kind === "set") {
          if (op.island) batch.set(doc(db, "games", code, "islands", op.island), op.data);
          else batch.set(doc(db, "games", code), { meta: op.data }, { merge: true });
        } else if (op.island) batch.update(doc(db, "games", code, "islands", op.island), ...toArgs(op.fields));
        else batch.update(doc(db, "games", code), ...toArgs(Object.fromEntries(Object.entries(op.fields).map(([k, v]) => [`meta.${k}`, v]))));
      }
      await batch.commit();
    },
  };
}

export type { Remote };
