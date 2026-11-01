import type { FirebaseOptions } from "firebase/app";

/**
 * Configuración web del proyecto de Firebase para la partida compartida.
 * No vive en el repositorio: se pasa al compilar con la variable VITE_FIREBASE_CONFIG (JSON).
 *  - Publicación: variable de GitHub Actions FIREBASE_CONFIG (ver .github/workflows/deploy.yml).
 *  - En local: un archivo .env.local con VITE_FIREBASE_CONFIG={"apiKey":...}.
 * Sin ella, la app funciona igual pero sin «Jugar con un amigo».
 */
const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;

function parse(s: string | undefined): FirebaseOptions | null {
  if (!s) return null;
  try {
    const c = JSON.parse(s) as FirebaseOptions;
    return c.projectId && c.apiKey ? c : null;
  } catch {
    return null;
  }
}

export const firebaseConfig = parse(raw);

/** La versión de un solo archivo (vista previa en Claude) no puede conectar con servicios externos. */
export const syncAvailable = !!firebaseConfig && import.meta.env.MODE !== "single";

/** Cartero de avisos del chat (Cloudflare Worker). Lo rellena la publicación (VITE_PUSH_URL). */
export const pushUrl = ((import.meta.env.VITE_PUSH_URL as string | undefined) ?? "").replace(/\/$/, "") || null;
