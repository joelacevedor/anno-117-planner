# Praefectus para ChatGPT (servidor MCP, solo lectura)

Servidor MCP remoto para consultar una partida compartida de Praefectus desde una conversación de ChatGPT:
«Theo, consulta Hispania». Es un Cloudflare Worker independiente de la app: si se apaga o se borra,
Praefectus funciona exactamente igual.

## Qué hace y qué no

| Puede | No puede |
|---|---|
| Leer la partida conectada: islas, casas, residentes, edificios, cadenas, producción, consumo, excedentes, déficits y comercio | Escribir nada: no tiene ninguna función de escritura y solo hace `GET` a Firestore |
| Calcular con el mismo motor que la app (`src/core`, sin cambios) | Ver otras partidas: cada permiso está atado a una sola partida |
| | Ver el código de la partida desde ChatGPT: el código se queda en el Worker, cifrado dentro del permiso |

## Herramientas

| Herramienta | Para qué |
|---|---|
| `get_game` | Resumen: jugadores, consumo, DLC, versión de datos, última modificación y lista de islas |
| `find_island` | Buscar una isla por nombre (sin mayúsculas ni acentos) |
| `get_island` | Todo sobre una isla (por id o nombre), con cada valor marcado como registrado, calculado o estimado |

## Seguridad

- **OAuth 2.1** con PKCE S256, registro dinámico de clientes e `iss` en la respuesta (RFC 9207). Lo hace la
  librería oficial `@cloudflare/workers-oauth-provider`: tokens guardados solo como hash y datos del permiso
  cifrados. Token de acceso: 1 hora. Refresh token: 30 días.
- **La llave es el código de la partida**, como en la app («quien tiene el código, juega»). Decisión D2:
  válido para la lectura. Antes de escribir habrá que revisar la identidad y los permisos.
- **Acceso a Firebase como un jugador**: sesión anónima propia y las reglas de `firestore.rules`. Sin cuenta de
  servicio ni credenciales de administrador.
- **`GAME_SCOPE`** (en `wrangler.toml`): `preview` solo acepta partidas creadas en la versión de prueba;
  `real` solo acepta partidas reales. Se cambia a `real` **solo con autorización expresa (D3)**, en un commit propio.
- Límite de 12 intentos de código por IP cada 10 minutos. La página de conexión no se puede incrustar en otra
  web y el formulario solo funciona en el navegador que lo abrió.
- **Desconectar**: `https://<servidor>/disconnect` y el código de la partida retira todos los permisos al
  momento. También al borrar la app en ChatGPT.

## Conectar desde ChatGPT

1. Abre **chatgpt.com en el navegador** (la creación de servidores propios es en la web).
2. **Ajustes → Plugins → Add MCP server** (si no aparece, activa el modo desarrollador en los ajustes).
3. Rellena:
   - **Nombre**: `Praefectus`
   - **Descripción**: `Partida compartida de ANNO 117 en Praefectus (solo lectura)`
   - **URL**: la dirección que muestra el workflow, acabada en `/mcp`
     (p. ej. `https://praefectus-mcp-test.<cuenta>.workers.dev/mcp`)
   - **Autenticación**: OAuth (sin client ID ni secreto: ChatGPT se registra solo)
4. Revisa el aviso de riesgo, acepta y crea el plugin. ChatGPT mostrará las 3 herramientas.
5. ChatGPT abre la página de **Praefectus**:
   1. Escribe el **código de la partida** (el de «Jugar con un amigo»).
   2. Comprueba que los jugadores y las islas son los tuyos.
   3. Pulsa **Permitir solo lectura**.
6. En una conversación nueva, escribe `@` y elige **Praefectus**. Después: *«Consulta Hispania»*.

Si cambias el servidor (nueva versión), en ChatGPT abre el plugin y pulsa **Refresh**.

## Primera prueba: partida de la versión de prueba

El servidor desplegado empieza con `GAME_SCOPE = "preview"`. Solo acepta partidas creadas desde la versión de
prueba (canal de vista previa de `dlc-egipto`), que no se mezclan con la partida real:

1. Abre la versión de prueba de Praefectus y crea una partida compartida («Jugar con un amigo → Crear»)
   con una isla llamada **Hispania** y algunas casas y edificios.
2. Conecta ChatGPT con ese código y pregunta por Hispania.
3. Compara las cifras con las pantallas de Hispania en la versión de prueba.
4. Comprueba que el código de la **partida real** se rechaza en ese servidor.

## Despliegue

`.github/workflows/mcp-worker.yml`, solo en la rama `mcp-chatgpt`:

- Pasa las pruebas de la app y las del Worker.
- Despliega el Worker `praefectus-mcp-test` con su propio almacén KV. No toca `anno117-push`, Firebase
  Hosting ni las reglas.
- Usa `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y la variable `FIREBASE_CONFIG`, que ya existen.
  Genera una vez el secreto `GRANT_SECRET`.
- La dirección aparece en el resumen del workflow y como aviso «Servidor MCP de prueba».

Para apagarlo: Cloudflare → Workers → `praefectus-mcp-test` → Settings → Disable (o Delete).

## Probar en local

```sh
pnpm install                     # en la raíz: dependencias de la app
cd mcp-worker && npm ci
npm test                         # 29 pruebas: OAuth, revocación, código protegido, aislamiento, cálculos
npm run typecheck
```

Prueba de extremo a extremo en el runtime real de Cloudflare (`wrangler dev`) con un Firebase simulado:

```sh
node test/local/fake-firebase.mjs "$(cat partidas.json)" &      # partidas de prueba en formato Remote
npx wrangler dev --port 8787 --var PUBLIC_ORIGIN:http://localhost:8787 --var GAME_SCOPE:preview \
  --var FIREBASE_API_KEY:k --var FIREBASE_PROJECT_ID:p --var GRANT_SECRET:$(printf 'a%.0s' {1..40}) \
  --var AUTH_BASE:http://127.0.0.1:8788 --var TOKEN_BASE:http://127.0.0.1:8788 --var FIRESTORE_BASE:http://127.0.0.1:8788
npm run e2e
```
