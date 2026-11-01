# Avisos del chat (Web Push)

El chat puede avisar a los demás jugadores aunque tengan el móvil bloqueado. Para eso hace falta un
"cartero" que firme y envíe los avisos: un Cloudflare Worker (`push-worker/`), gratis y sin tarjeta.

## Cómo funciona

1. En Ajustes → Jugar con un amigo → «Avisos del chat», el móvil pide permiso, se suscribe con la clave
   pública del cartero (`GET /vapid`) y guarda su suscripción en `games/{código}/push/{jugador}`.
2. Al enviar un mensaje, la app lee las suscripciones de los demás y llama a `POST /notify`.
3. El cartero firma cada aviso con la clave privada VAPID (secreto del Worker, nunca sale de Cloudflare)
   y lo entrega. Solo acepta peticiones desde la web de la app y solo envía a los servicios de avisos
   de Google, Apple, Mozilla y Microsoft.

En iPhone/iPad funciona con la app instalada en la pantalla de inicio (iOS 16.4 o posterior).

## Puesta en marcha (una vez)

1. Crea una cuenta gratuita en Cloudflare y entra una vez en **Workers & Pages** (crea tu subdominio
   `*.workers.dev`).
2. Copia el **Account ID** (columna derecha de Workers & Pages).
3. Crea un token: **My Profile → API Tokens → Create Token → plantilla «Edit Cloudflare Workers»**.
4. En GitHub, **Settings → Secrets and variables → Actions → Secrets**, añade
   `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

La siguiente publicación despliega el cartero, genera la clave VAPID la primera vez y compila la app
con su dirección (`VITE_PUSH_URL`). Sin esos secretos, la app se publica igual, sin avisos.
