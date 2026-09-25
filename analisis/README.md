# Matchline

Herramienta web estática para consultar un jugador de Dota 2 por nombre exacto o account ID y mostrar sus cinco héroes más jugados en las últimas 20 partidas procesadas.

## Ejecutar localmente

La aplicación usa `fetch`, así que debe abrirse desde un servidor HTTP local y no directamente con `file://`.

```powershell
python -m http.server 8000
```

Después, abre <http://localhost:8000>.

## Datos y cálculo

La aplicación consulta la API pública de [OpenDota](https://docs.opendota.com/):

- `/players/{account_id}` para el perfil.
- `/players/{account_id}/matches?limit=20` para las partidas recientes.
- `/heroes` para convertir IDs en nombres e imágenes.
- `/search?q={nombre}` para resolver un nombre exacto a su account ID.

Puedes introducir el Steam32/account ID numérico, el SteamID64 no está soportado, o el nombre exacto visible en OpenDota. La búsqueda por nombre ignora mayúsculas y espacios exteriores, pero no acepta coincidencias parciales. Para cada partida se determina la victoria comparando el lado del jugador (`player_slot`) con `radiant_win`. El porcentaje mostrado es:

```text
victorias / partidas * 100
```

## Limitaciones conocidas

- La clasificación usa como máximo las 20 partidas recientes que OpenDota devuelve, por lo que no representa todo el historial.
- OpenDota puede tardar en procesar partidas nuevas, devolver menos de 20 resultados o limitar consultas públicas.
- El frontend consulta OpenDota directamente. Un proxy o backend sería recomendable para producción, caché y mayores límites de uso.
- No se aplican filtros por parche, modo de juego, Turbo, ranked o partidas significativas.