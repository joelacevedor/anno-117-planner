# Partida compartida (Firebase)

Dos jugadores (o más) comparten las islas de una partida en tiempo real. Coste: 0 € con el plan
gratuito Spark de Firebase (sin tarjeta; 50.000 lecturas y 20.000 escrituras al día).

## Cómo funciona

- **Crear**: Islas → Jugar con un amigo → nombre → «Crear partida compartida». Se genera un código de
  10 caracteres (p. ej. `KQ7XA-M3TZP`) y se suben tus islas.
- **Unirse**: el amigo escribe su nombre y el código → «Unirme». Ve las islas de la partida; las suyas de
  antes quedan como copia local (`anno117-planner:before-join`).
- Se comparten las islas (objetivos, casas, edificios construidos, comercio, mejoras, productores) y los
  ajustes de partida (investigación, consumo). Cada móvil conserva idioma, animaciones e isla abierta.
- Cada isla muestra su dueño. El comercio entre islas de distintos jugadores funciona igual.
- Los cambios se envían campo a campo (`built.b5848`), agrupados cada 300 ms: dos jugadores pueden
  tocar cosas distintas a la vez sin pisarse. Si se toca exactamente lo mismo, gana el último.
- Sin conexión, Firestore guarda los cambios y los envía al volver (indicador naranja).

## Datos en Firestore

```
games/{code}              { meta: { techs, consumption, players: {uid: nombre} }, createdAt }
games/{code}/islands/{id} isla compartida (+ owner, order)
```

Reglas (`firestore.rules`): solo usuarios con sesión anónima y solo dentro de `games/{code}` con un
código válido. El código es la llave: quien lo tiene, juega. No se guardan correos ni nombres reales
salvo el nombre que cada jugador escriba.

## Puesta en marcha (una vez)

1. console.firebase.google.com → Crear proyecto (sin Analytics).
2. Firestore Database → Crear (eur3) → modo producción → pestaña **Reglas** → pegar `firestore.rules`
   → Publicar.
3. Authentication → Comenzar → Anónimo → Habilitar.
4. Configuración del proyecto → Tus apps → Web → copiar `firebaseConfig` como JSON de una línea.
   **No se guarda en el repositorio**: va en la variable de GitHub Actions `FIREBASE_CONFIG`
   (Settings → Secrets and variables → Actions → Variables). En local, crea `.env.local` con
   `VITE_FIREBASE_CONFIG={"apiKey":"…","projectId":"…",…}` (está en .gitignore).
5. La app se publica en Firebase Hosting (`https://<proyecto>.web.app`, dominio ya autorizado) con
   `.github/workflows/deploy.yml`. Necesita además el secreto `FIREBASE_SERVICE_ACCOUNT`: Configuración
   del proyecto → Cuentas de servicio → Generar nueva clave privada → copiar el JSON entero como secreto.
6. Recomendado: en Google Cloud → APIs y servicios → Credenciales, restringir la clave web a tu dominio
   (`https://<proyecto>.web.app/*` y `https://<proyecto>.firebaseapp.com/*`).

Sin `FIREBASE_CONFIG`, la app compila y funciona igual, solo que sin «Jugar con un amigo». Así, quien
copie el repositorio no usa tu Firebase sin querer.

## Pruebas

`tests/sync.test.ts` simula dos móviles contra un servidor en memoria (crear, unirse, ediciones
simultáneas en la misma isla, investigación compartida, código inexistente). El adaptador de Firebase
(`src/sync/firebase.ts`) no se ha podido probar contra el emulador desde el entorno de desarrollo:
hay que probarlo con el proyecto real antes de dar la función por buena.
