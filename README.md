# Matchline

Herramienta web estática para consultar un jugador de Dota 2 por nombre exacto o account ID y mostrar el resultado de sus últimas diez partidas procesadas.

## Página del clan

La portada muestra la posición semanal europea de RATOGER ([RATOG]) consultando en cada carga la API oficial de Dota 2 `FindGuildByTag`, sin reutilizar una respuesta almacenada en la caché del navegador. Se muestran el puesto semanal, los puntos y el número de miembros cuando están disponibles. Si la API no responde o aún no publica un puesto, la página indica que no pudo actualizar los datos en vez de mostrar una cifra anterior.

## Ejecutar localmente

La aplicación usa `fetch`, así que debe abrirse desde un servidor HTTP local y no directamente con `file://`.

```powershell
python -m http.server 8000
```

Después, abre <http://localhost:8000>.

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