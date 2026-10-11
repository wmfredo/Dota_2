# Matchline

Herramienta web estática para consultar un jugador de Dota 2 por nombre exacto o account ID y mostrar sus cinco héroes más jugados en las últimas 20 partidas procesadas.

## Ejecutar localmente

La aplicación usa `fetch`, así que debe abrirse desde un servidor HTTP local y no directamente con `file://`.

```powershell
python -m http.server 8000
```

Después, abre <http://localhost:8000>.

## Datos y cálculo

La aplicación consulta la API de [Stratz](https://stratz.com/api) usando el token JWT incluido en la app:

- `/api/v1/players/{account_id}` para el perfil.
- `/api/v1/players/{account_id}/matches?take=20` para las partidas recientes.
- `/api/v1/heroes` para convertir IDs en nombres e imágenes.
- `/api/v1/search?query={nombre}` o rutas equivalentes para resolver un nombre exacto a su account ID.

Puedes introducir el Steam32/account ID numérico, el SteamID64 no está soportado, o el nombre exacto visible en Stratz. La búsqueda por nombre ignora mayúsculas y espacios exteriores, pero no acepta coincidencias parciales. Para cada partida se determina la victoria comparando el lado del jugador (`player_slot`) con `radiant_win`. El porcentaje mostrado es:

```text
victorias / partidas * 100
```

## Limitaciones conocidas

- La clasificación usa como máximo las 20 partidas recientes que Stratz devuelve, por lo que no representa todo el historial.
- Stratz puede tardar en procesar partidas nuevas, devolver menos de 20 resultados o limitar consultas según el plan y la cuota disponible.
- El frontend consulta Stratz directamente con el token JWT de la app. En producción sería recomendable un proxy o backend para ocultar la clave y controlar caché y límites.
- No se aplican filtros por parche, modo de juego, Turbo, ranked o partidas significativas.