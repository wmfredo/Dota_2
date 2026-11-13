const OPEN_DOTA_BASE = "https://api.opendota.com/api";
const form = document.querySelector("#coach-form");
const playerInput = document.querySelector("#player-name");
const loadButton = document.querySelector("#load-button");
const formMessage = document.querySelector("#form-message");
const statusPanel = document.querySelector("#status-panel");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const matchPicker = document.querySelector("#match-picker");
const matchSelect = document.querySelector("#match-select");
const roleSelect = document.querySelector("#player-role");
const analyzeButton = document.querySelector("#analyze-button");
const coachMessage = document.querySelector("#coach-message");
const coachResults = document.querySelector("#coach-results");
const focusList = document.querySelector("#focus-list");
let currentPlayer;
let currentMatches = [];
let heroNames = new Map();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = playerInput.value.trim();
  if (!name) {
    formMessage.textContent = "Escribe el nombre exacto de OpenDota.";
    playerInput.focus();
    return;
  }
  loadMatches(name);
});

analyzeButton.addEventListener("click", () => {
  const match = currentMatches[Number(matchSelect.value)];
  if (match) analyzeMatch(match);
});

const initialPlayer = new URLSearchParams(window.location.search).get("player")?.trim();
if (initialPlayer) {
  playerInput.value = initialPlayer;
  loadMatches(initialPlayer);
}

async function loadMatches(name) {
  setLoading(true);
  formMessage.textContent = "";
  coachMessage.textContent = "";
  coachResults.hidden = true;
  matchPicker.hidden = true;
  setStatus("Buscando jugador", "Resolviendo el nombre exacto en OpenDota.");

  try {
    const searchResults = await fetchOpenDota(`/search?q=${encodeURIComponent(name)}`);
    const normalizedName = name.toLocaleLowerCase();
    const player = Array.isArray(searchResults) ? searchResults.find((candidate) =>
      [candidate.personaname, candidate.name]
        .filter(Boolean)
        .some((candidateName) => String(candidateName).trim().toLocaleLowerCase() === normalizedName)
    ) : null;
    if (!player) throw new Error("No encontramos una coincidencia exacta para ese nombre.");

    currentPlayer = { accountId: String(player.account_id) };
    setStatus("Leyendo partidas", "Cargando las últimas partidas procesadas.");
    currentMatches = await fetchOpenDota(`/players/${encodeURIComponent(currentPlayer.accountId)}/matches?limit=10`);
    if (!Array.isArray(currentMatches) || currentMatches.length === 0) {
      throw new Error("No hay partidas recientes procesadas para este perfil.");
    }

    const heroes = await fetchOpenDota("/heroes");
    heroNames = new Map((Array.isArray(heroes) ? heroes : []).map((hero) => [Number(hero.id), hero.localized_name]));
    matchSelect.replaceChildren(...currentMatches.map((match, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      const hero = heroNames.get(Number(match.hero_id)) || "Héroe desconocido";
      const date = formatDate(match.start_time);
      option.textContent = `${date} · ${hero} · ${match.kills ?? "?"}/${match.deaths ?? "?"}/${match.assists ?? "?"}`;
      return option;
    }));
    matchPicker.hidden = false;
  } catch (error) {
    formMessage.textContent = error.message || "No pudimos cargar las partidas de OpenDota.";
  } finally {
    setLoading(false);
    statusPanel.hidden = true;
  }
}

async function analyzeMatch(match) {
  analyzeButton.disabled = true;
  coachMessage.textContent = "Cargando estadísticas detalladas de la partida…";
  coachResults.hidden = true;
  try {
    const fullMatch = await fetchOpenDota(`/matches/${encodeURIComponent(match.match_id)}`);
    const players = Array.isArray(fullMatch.players) ? fullMatch.players : [];
    const player = players.find((candidate) => Number(candidate.account_id) === Number(currentPlayer.accountId)) ||
      players.find((candidate) => Number(candidate.player_slot) === Number(match.player_slot));
    if (!player) throw new Error("OpenDota no devolvió las estadísticas del jugador para esta partida.");

    const stats = { ...match, ...player };
    const name = playerInput.value.trim();
    const hero = heroNames.get(Number(stats.hero_id));
    renderCoach(stats, fullMatch, hero || "Héroe desconocido", name, roleSelect.value);
    coachMessage.textContent = "";
    coachResults.hidden = false;
  } catch (error) {
    coachMessage.textContent = error.message || "No se pudo analizar esta partida.";
  } finally {
    analyzeButton.disabled = false;
  }
}

function renderCoach(stats, fullMatch, hero, playerName, role) {
  const durationMinutes = Number(stats.duration) / 60;
  const kills = numericValue(stats.kills);
  const deaths = numericValue(stats.deaths);
  const assists = numericValue(stats.assists);
  const gpm = numericValue(stats.gold_per_min);
  const xpm = numericValue(stats.xp_per_min);
  const lastHits = numericValue(stats.last_hits);
  const towerDamage = numericValue(stats.tower_damage);
  const participation = getKillParticipation(stats, fullMatch);
  const result = getPlayerResult(stats, fullMatch);
  const kda = [stats.kills, stats.deaths, stats.assists].map((value) => value ?? "?").join("/");
  const roleGuidance = role ? `de posición ${role}` : "propias de tu rol";
  const priorities = [
    getDeathFocus(deaths, durationMinutes),
    getTeamplayFocus(participation, kills, assists),
    getRoleFocus(role, gpm, xpm, lastHits, towerDamage)
  ];

  document.querySelector("#coach-results-title").textContent =
    `${playerName} · ${hero} · ${kda} · ${result}`;
  focusList.replaceChildren(...priorities.map((priority) => {
    const item = document.createElement("li");
    item.className = "focus-item";
    for (const [label, value] of [
      ["Enfoque", priority.focus],
      ["Evidencia", priority.evidence],
      ["Acción siguiente", priority.action]
    ]) {
      const paragraph = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      paragraph.append(strong, document.createTextNode(value));
      item.append(paragraph);
    }
    return item;
  }));
  document.querySelector("#next-match-observation").textContent =
    `En la siguiente partida, observa si tus decisiones ${roleGuidance} mejoran estas métricas sin perder de vista los objetivos del equipo.`;
}

function getDeathFocus(deaths, durationMinutes) {
  if (deaths == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return {
      focus: "Revisar el coste de las muertes",
      evidence: "OpenDota no devolvió las muertes o la duración necesarias para calcular una referencia.",
      action: "Anota las circunstancias de tus dos primeras muertes en la repetición y marca si estabas cerca de un objetivo o de un aliado."
    };
  }

  const deathsPerTen = deaths / durationMinutes * 10;
  return {
    focus: deathsPerTen >= 2
      ? "Revisar el alto ritmo de muertes"
      : "Validar el coste de las muertes",
    evidence: `${deaths} muertes en ${formatNumber(durationMinutes)} minutos (${formatNumber(deathsPerTen)} por cada 10 min); es una señal orientativa, no demuestra por sí sola que fueran evitables.`,
    action: "Revisa la repetición y anota para cada muerte si tenías visión, aliados cerca y un objetivo que justificara el riesgo; elige una causa repetida para corregir."
  };
}

function getTeamplayFocus(participation, kills, assists) {
  if (participation != null) {
    return {
      focus: participation < 0.35
        ? "Aumentar la participación en peleas"
        : "Convertir la participación en objetivos",
      evidence: `Participación estimada en bajas: ${Math.round(participation * 100)}% del total de tu equipo; es una referencia orientativa que depende del rol y la partida.`,
      action: participation < 0.35
        ? "Después de cada objeto clave o aviso de pelea, comprueba si puedes llegar a tiempo y contrasta tu participación al final."
        : "Revisa una pelea en la que participaste y comprueba si el equipo convirtió la ventaja en una torre, Roshan o control de mapa."
    };
  }
  return {
    focus: "Comprobar el impacto en las peleas",
    evidence: `OpenDota registra ${kills ?? "?"} bajas y ${assists ?? "?"} asistencias, pero no hay suficientes datos del marcador del equipo para calcular la participación.`,
    action: "Revisa una pelea importante de la repetición y apunta si tu héroe llegó a tiempo para aportar control, daño o protección."
  };
}

function getRoleFocus(role, gpm, xpm, lastHits, towerDamage) {
  if (role && Number(role) <= 3) {
    const evidence = [
      gpm == null ? "GPM no disponible" : `${Math.round(gpm)} GPM`,
      xpm == null ? "XPM no disponible" : `${Math.round(xpm)} XPM`,
      lastHits == null ? "últimos golpes no disponibles" : `${Math.round(lastHits)} últimos golpes`,
      towerDamage == null ? "daño a estructuras no disponible" : `${Math.round(towerDamage)} de daño a estructuras`
    ].join("; ");
    return {
      focus: "Convertir recursos en objetivos",
      evidence: `Posición ${role}: ${evidence}. Una partida no basta para definir un baremo de farm.`,
      action: "Revisa un tramo de 5 minutos: registra los últimos golpes y el tiempo de farm, y decide qué objetivo o pelea debía seguir a ese recurso."
    };
  }

  if (role && Number(role) >= 4) {
    const evidence = [
      gpm == null ? "GPM no disponible" : `${Math.round(gpm)} GPM`,
      xpm == null ? "XPM no disponible" : `${Math.round(xpm)} XPM`,
      towerDamage == null ? "daño a estructuras no disponible" : `${Math.round(towerDamage)} de daño a estructuras`
    ].join("; ");
    return {
      focus: "Vincular la utilidad con los objetivos",
      evidence: `Posición ${role}: ${evidence}. Estas estadísticas no describen por sí solas el valor del apoyo.`,
      action: "Revisa una rotación y anota qué aliado u objetivo ayudó, qué recurso utilizaste y si el equipo pudo aprovecharla."
    };
  }

  return {
    focus: "Medir tu aporte según la posición",
    evidence: "No se indicó la posición y OpenDota no permite deducirla con certeza solo con estas estadísticas.",
    action: "En la repetición, elige una decisión propia de tu posición (farm, rotación, visión o inicio de pelea) y registra una alternativa concreta para la siguiente partida."
  };
}

function getKillParticipation(stats, fullMatch) {
  const slot = Number(stats.player_slot);
  if (!Number.isFinite(slot)) return null;
  const isRadiant = slot < 128;
  let teamKills = numericValue(isRadiant ? fullMatch.radiant_score : fullMatch.dire_score);
  if (teamKills == null || teamKills <= 0) {
    const teammates = (fullMatch.players || []).filter((player) => (Number(player.player_slot) < 128) === isRadiant);
    if (teammates.length) {
      teamKills = teammates.reduce((total, player) => total + (numericValue(player.kills) || 0), 0);
    }
  }
  const kills = numericValue(stats.kills);
  const assists = numericValue(stats.assists);
  if (teamKills == null || teamKills <= 0 || kills == null || assists == null) return null;
  return Math.min(1, (kills + assists) / teamKills);
}

function getPlayerResult(stats, fullMatch) {
  const radiantWin = fullMatch.radiant_win;
  if (radiantWin == null) return "resultado no disponible";
  const playerIsRadiant = Number(stats.player_slot) < 128;
  return playerIsRadiant === (radiantWin === true || radiantWin === 1 || radiantWin === "true")
    ? "victoria"
    : "derrota";
}

async function fetchOpenDota(path) {
  const response = await fetch(`${OPEN_DOTA_BASE}${path}`);
  if (!response.ok) {
    if (response.status === 429) throw new Error("OpenDota está limitando consultas. Espera un momento e inténtalo de nuevo.");
    if (response.status === 404) throw new Error("No encontramos ese perfil o partida en OpenDota.");
    throw new Error(`OpenDota no pudo responder (código ${response.status}).`);
  }
  return response.json();
}

function numericValue(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime())
    ? "Fecha desconocida"
    : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
}

function setLoading(loading) {
  loadButton.disabled = loading;
  statusPanel.hidden = !loading;
}

function setStatus(title, detail) {
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}
