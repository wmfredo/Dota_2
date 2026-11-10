# Matchline

Herramienta web estática para consultar un jugador de Dota 2 por nombre exacto o account ID y mostrar el resultado de sus últimas diez partidas procesadas.

## Página del clan

La portada muestra la posición semanal europea de RATOGER ([RATOG]) consultando en cada carga la API oficial de Dota 2 `FindGuildByTag`, sin reutilizar una respuesta almacenada en la caché del navegador. Se muestran el puesto semanal, los puntos y el número de miembros cuando están disponibles. Si la API no responde o aún no publica un puesto, la página indica que no pudo actualizar los datos en vez de mostrar una cifra anterior.

## Acceso de miembros

El botón «Acceso miembros» abre `/miembros` en el mismo servidor. [server.mjs](./server.mjs) sirve la web y gestiona Discord OAuth2 (`identify guilds.members.read`), comprueba si el usuario pertenece al servidor y crea una cookie de sesión `HttpOnly`, `Secure` y `SameSite=Lax`. No necesita Cloudflare, base de datos ni paquetes npm. Las sesiones viven en memoria y duran un día; si se reinicia el proceso, los usuarios deberán volver a iniciar sesión.

### Configurar el servidor dedicado

1. Instala Node.js 20 o superior en el servidor.
2. Crea una aplicación en el [Discord Developer Portal](https://discord.com/developers/applications). Copia el Client ID y Client Secret y añade como Redirect URI `https://TU-DOMINIO/auth/callback`.
3. Obtén el ID del servidor de Discord (activa el modo desarrollador en Discord y copia el ID del servidor).
4. Configura estas variables de entorno en el servicio que ejecuta Node; no guardes el Client Secret en el frontend ni lo subas al repositorio:

   ```text
   DISCORD_CLIENT_ID=el-client-id
   DISCORD_CLIENT_SECRET=el-client-secret
   DISCORD_GUILD_ID=el-id-del-servidor
   PUBLIC_URL=https://TU-DOMINIO
   PORT=3000
   ```

5. Ejecuta `node server.mjs`. El servidor escucha sólo en `127.0.0.1:3000`; configura Nginx (o el proxy HTTPS que ya uses) para reenviar el dominio a ese puerto. Mantén HTTPS habilitado, porque Discord OAuth y la cookie segura lo requieren.

Nginx necesita pasar las peticiones del dominio al servidor Node, por ejemplo:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
}
```

La página privada «Miembros» es provisional. Discord permite comprobar al usuario que inicia sesión, pero no recuperar el listado completo del servidor con esos permisos; para añadirlo habrá que crear un bot. Si alguien abandona el servidor, su sesión activa puede seguir funcionando hasta que caduque.

## Ejecutar localmente

La aplicación usa `fetch`, así que debe abrirse desde un servidor HTTP local y no directamente con `file://`.

```powershell
python -m http.server 8000
```

Después, abre <http://localhost:8000>.

Este servidor Python sólo sirve la web estática; para probar el acceso de miembros hace falta ejecutar `server.mjs` con la configuración de Discord y HTTPS indicadas arriba.

## Datos y cálculo

La aplicación consulta la API de [Stratz](https://stratz.com/api) usando el token JWT incluido en la app:

- `/api/v1/players/{account_id}` para el perfil.
- `/api/v1/players/{account_id}/matches?take=10` para las partidas recientes.
- `/api/v1/search?query={nombre}` o rutas equivalentes para resolver un nombre exacto a su account ID.
- `/matches/{match_id}` de OpenDota sólo al desplegar detalles cuando faltan estadísticas en la respuesta inicial.

Puedes introducir el Steam32/account ID numérico, el SteamID64 no está soportado, o el nombre exacto visible en Stratz. La búsqueda por nombre ignora mayúsculas y espacios exteriores, pero no acepta coincidencias parciales. La tabla muestra héroe, resultado, K/D/A y duración; el botón de detalles despliega nivel final, valor neto, GPM, XPM, daño a héroes y estructuras, curación y participación en bajas cuando los datos están disponibles.

## Limitaciones conocidas

- La página muestra como máximo las diez partidas recientes que Stratz devuelve, por lo que no representa todo el historial.
- Stratz puede tardar en procesar partidas nuevas, devolver menos de diez resultados o limitar consultas según el plan y la cuota disponible.
- El frontend consulta Stratz directamente con el token JWT de la app. En producción sería recomendable un proxy o backend para ocultar la clave y controlar caché y límites.
- No se aplican filtros por parche, modo de juego, Turbo, ranked o partidas significativas.