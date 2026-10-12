const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdWJqZWN0IjoiMDAwYWNjNWItMzQxOC00NWEwLTkwZGEtNGJlOWQ5NThlMzhjIiwiU3RlYW1JZCI6Ijg0OTI3NDE3IiwiQVBJVXNlciI6InRydWUiLCJuYmYiOjE3OTE3MzYxMzksImV4cCI6MTgyMzI3MjEzOSwiaWF0IjoxNzkxNzM2MTM5LCJpc3MiOiJodHRwczovL2FwaS5zdHJhdHouY29tIn0.B-TVkY7N14TUJGDmhSctbMiSxD_I8RceBxiwsLUK_Ew";
const API_BASE = "https://api.stratz.com";
const OPEN_DOTA_BASE = "https://api.opendota.com/api";
const RECENT_MATCH_LIMIT = 5;

const form = document.querySelector("#player-form");
const accountInput = document.querySelector("#account-id");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const statusPanel = document.querySelector("#status-panel");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const results = document.querySelector("#results");
const emptyState = document.querySelector("#empty-state");
const matchList = document.querySelector("#match-list");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = accountInput.value.trim();

  if (!query) {
    formMessage.textContent = "Escribe un nombre exacto o un account ID Steam32.";
    accountInput.focus();
    return;
  }

  formMessage.textContent = "";
  loadPlayer(query);
});

async function loadPlayer(query) {
  setLoading(true);
  clearView();
  setStatus("Buscando jugador", "Resolviendo el perfil en Stratz.");

  try {
    const accountId = await resolveAccountId(query);

    let profile;
    let matches;
    let heroes;
    try {
      setStatus("Leyendo perfil", "Consultando tus datos recientes en Stratz.");
      [profile, matches, heroes] = await Promise.all([
        fetchStratzPlayer(accountId),
        fetchStratzMatches(accountId),
        fetchHeroCatalog()
      ]);
    } catch (stratzError) {
      setStatus("Usando respaldo público", "Stratz rechazó la consulta; usando OpenDota para completar la búsqueda.");
      [profile, matches, heroes] = await Promise.all([
        fetchOpenDotaPlayer(accountId),
        fetchOpenDotaMatches(accountId),
        fetchHeroCatalog()
      ]);
    }

    const recentMatches = matches.slice(0, RECENT_MATCH_LIMIT);
    if (recentMatches.length === 0) {
      emptyState.hidden = false;
      return;
    }

    renderProfile(profile, recentMatches, new Map(heroes.map((hero) => [hero.id, hero])));
    results.hidden = false;
  } catch (error) {
    formMessage.textContent = error.message || "No pudimos leer este perfil ahora.";
  } finally {
    setLoading(false);
    statusPanel.hidden = true;
  }
}

async function resolveAccountId(query) {
  if (/^\d+$/.test(query) && Number(query) > 0) return query;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  try {
    const searchResults = await searchPlayers(query);
    const exactMatch = searchResults.find((player) => {
      const names = [player.personaname, player.name, player.steamAccount?.name].filter(Boolean);
      return names.some((name) => String(name).trim().toLocaleLowerCase() === normalizedQuery);
    });

    if (exactMatch) {
      return String(exactMatch.account_id || exactMatch.accountId || exactMatch.id || "");
    }
  } catch (error) {
    // Stratz no pudo devolver coincidencias; intentamos el buscador público.
  }

  const fallbackSearch = await fetchOpenDotaJson(`/search?q=${encodeURIComponent(query)}`);
  const exactMatch = Array.isArray(fallbackSearch) ? fallbackSearch.find((player) => {
    const names = [player.personaname, player.name].filter(Boolean);
    return names.some((name) => String(name).trim().toLocaleLowerCase() === normalizedQuery);
  }) : null;

  if (!exactMatch) {
    throw new Error("No encontramos una coincidencia exacta para ese nombre de jugador.");
  }

  return String(exactMatch.account_id);
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${API_KEY}` }
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Stratz está limitando consultas. Espera un momento e inténtalo de nuevo.");
    if (response.status === 404) throw new Error("No encontramos ese perfil en Stratz.");
    throw new Error("Stratz no pudo responder. Inténtalo de nuevo más tarde.");
  }

  return response.json();
}

async function fetchOpenDotaJson(path) {
  const response = await fetch(`${OPEN_DOTA_BASE}${path}`);
  if (!response.ok) {
    if (response.status === 429) throw new Error("OpenDota está limitando consultas. Espera un momento e inténtalo de nuevo.");
    if (response.status === 404) throw new Error("No encontramos ese perfil en OpenDota.");
    throw new Error("OpenDota no pudo responder. Inténtalo de nuevo más tarde.");
  }
  return response.json();
}

async function searchPlayers(query) {
  const paths = [
    `/api/v1/search?query=${encodeURIComponent(query)}`,
    `/api/v1/players/search?query=${encodeURIComponent(query)}`,
    `/api/v1/Players/Search?query=${encodeURIComponent(query)}`,
    `/api/v1/players?query=${encodeURIComponent(query)}`
  ];

  for (const path of paths) {
    try {
      const data = await fetchJson(path);
      const result = normalizeSearchResults(data);
      if (result.length > 0) return result;
    } catch (error) {
      // Intenta la siguiente ruta hasta encontrar un resultado válido.
    }
  }

  return [];
}

async function fetchStratzPlayer(accountId) {
  const paths = [
    `/api/v1/players/${accountId}`,
    `/api/v1/Players/${accountId}`,
    `/api/v1/player/${accountId}`,
    `/api/v1/Player/${accountId}`
  ];

  for (const path of paths) {
    try {
      const data = await fetchJson(path);
      return normalizeProfile(data);
    } catch (error) {
      // Probar la siguiente ruta si esta no existe.
    }
  }

  throw new Error("No pudimos cargar el perfil del jugador en Stratz.");
}

async function fetchStratzMatches(accountId) {
  const paths = [
    `/api/v1/players/${accountId}/matches?take=${RECENT_MATCH_LIMIT}`,
    `/api/v1/Players/${accountId}/Matches?take=${RECENT_MATCH_LIMIT}`,
    `/api/v1/player/${accountId}/matches?take=${RECENT_MATCH_LIMIT}`,
    `/api/v1/Player/${accountId}/Matches?take=${RECENT_MATCH_LIMIT}`
  ];

  for (const path of paths) {
    try {
      const data = await fetchJson(path);
      return normalizeMatches(data);
    } catch (error) {
      // La siguiente ruta puede usar un nombre de recurso distinto.
    }
  }

  return [];
}

async function fetchHeroCatalog() {
  const paths = ["/api/v1/heroes", "/api/v1/Heroes", "/api/v1/hero"];
  for (const path of paths) {
    try {
      const heroes = normalizeHeroes(await fetchJson(path));
      if (heroes.length) return heroes;
    } catch (error) {
      // Intenta la siguiente ruta disponible.
    }
  }

  try {
    return normalizeHeroes(await fetchOpenDotaJson("/heroes"));
  } catch (error) {
    return [];
  }
}

async function fetchOpenDotaPlayer(accountId) {
  const profile = await fetchOpenDotaJson(`/players/${accountId}`);
  return profile;
}

async function fetchOpenDotaMatches(accountId) {
  const matches = await fetchOpenDotaJson(`/players/${accountId}/matches?limit=${RECENT_MATCH_LIMIT}`);
  return matches;
}

function normalizeSearchResults(payload) {
  const list = normalizeArray(payload);
  return list.map((player) => {
    const account = player.steamAccount || player.account || {};
    return {
      personaname: player.personaname || player.name || account.name || player.displayName || "",
      name: player.name || account.name || player.personaname || "",
      account_id: player.account_id ?? player.accountId ?? account.accountId ?? player.id ?? null,
      steamAccount: account
    };
  });
}

function normalizeProfile(payload) {
  const source = payload?.player || payload?.data?.player || payload?.profile || payload?.result || payload || {};
  const steamAccount = source.steamAccount || source.profile || source;

  return {
    profile: {
      personaname: source.personaname || steamAccount.personaname || steamAccount.name || source.name || "Jugador de Dota 2",
      name: source.name || steamAccount.name || "",
      avatarfull: source.avatarfull || steamAccount.avatarfull || steamAccount.avatarFull || steamAccount.avatar || "",
      avatarmedium: source.avatarmedium || steamAccount.avatarmedium || steamAccount.avatarMedium || "",
      avatar: source.avatar || steamAccount.avatar || source.avatarfull || steamAccount.avatarfull || ""
    }
  };
}

function normalizeMatches(payload) {
  const list = normalizeArray(payload);
  return list.map((match) => {
    const stats = match.player || match.stats || {};
    return {
      ...match,
      hero_id: match.hero_id ?? match.heroId ?? match.hero?.id ?? null,
      player_slot: match.player_slot ?? match.playerSlot ?? match.player_slot_id ?? null,
      radiant_win: match.radiant_win ?? match.radiantWin ?? match.radiant ?? null,
      win: match.win ?? match.isWin ?? match.isVictory ?? null,
      kills: match.kills ?? stats.kills ?? null,
      deaths: match.deaths ?? stats.deaths ?? null,
      assists: match.assists ?? stats.assists ?? null,
      duration: match.duration ?? match.durationSeconds ?? null
    };
  });
}

function normalizeHeroes(payload) {
  return normalizeArray(payload).map((hero) => {
    const data = hero.hero || hero;
    return {
      id: Number(data.id ?? data.heroId ?? data.hero_id),
      name: data.localized_name || data.localizedName || data.name || "Héroe desconocido",
      shortName: data.shortName || data.short_name || data.name || "",
      image: getHeroImage(data)
    };
  }).filter((hero) => Number.isInteger(hero.id));
}

function getHeroImage(hero) {
  const source = hero.icon || hero.iconUrl || hero.img || hero.image || hero.imageUrl;
  if (source) {
    try {
      const url = new URL(source, "https://cdn.cloudflare.steamstatic.com");
      if (url.protocol === "https:") return url.href;
    } catch (error) {
      // Usa el nombre interno para generar una URL conocida.
    }
  }

  const shortName = String(hero.shortName || hero.name || "").replace(/^npc_dota_hero_/, "");
  return /^[a-z0-9_]+$/i.test(shortName)
    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${shortName.toLowerCase()}.png`
    : "";
}

function normalizeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const nested = ["result", "results", "data", "items", "list", "heroes", "players", "matches"]
    .map((key) => payload[key])
    .find((value) => Array.isArray(value));

  if (nested) return nested;

  if (payload.data && typeof payload.data === "object") return normalizeArray(payload.data);
  if (payload.result && typeof payload.result === "object") return normalizeArray(payload.result);
  return [];
}

function isPlayerWin(match) {
  if (typeof match.win === "boolean") return match.win;
  if (typeof match.win === "string" && ["true", "false"].includes(match.win.toLowerCase())) {
    return match.win.toLowerCase() === "true";
  }

  const playerSlot = Number(match.player_slot);
  if (!Number.isFinite(playerSlot) || match.radiant_win == null) return null;

  const isRadiant = playerSlot < 128;
  const radiantWon = match.radiant_win === true || match.radiant_win === 1 || match.radiant_win === "true";
  return isRadiant === radiantWon;
}

function formatKda(match) {
  const values = [match.kills, match.deaths, match.assists];
  return values.every((value) => value != null && Number.isFinite(Number(value)))
    ? values.join("/")
    : "No disponible";
}

function formatDuration(duration) {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds < 0) return "No disponible";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function getMatchReview(match, won) {
  const kills = Number(match.kills);
  const deaths = Number(match.deaths);
  const assists = Number(match.assists);
  const hasKda = [match.kills, match.deaths, match.assists]
    .every((value) => value != null && Number.isFinite(Number(value)));
  const result = won === null ? "Resultado no disponible" : won ? "Victoria" : "Derrota";
  const summary = `${result} · K/D/A ${formatKda(match)} · ${formatDuration(match.duration)}`;
  const improvements = [
    hasKda && deaths >= 6
      ? "Reduce muertes: evita iniciar sin visión y espera a que tu equipo pueda seguirte."
      : "Antes de avanzar, comprueba el minimapa y evita pelear en inferioridad.",
    hasKda && assists < kills
      ? "Tras ganar un duelo, busca una rotación que convierta la ventaja en objetivo."
      : "Después de una pelea favorable, coordina con tu equipo para asegurar un objetivo.",
    won === false
      ? "Tras una pelea perdida, reagrúpate y prioriza una zona de farmeo segura."
      : "Reserva tus habilidades clave para la siguiente pelea importante."
  ];

  return { summary, improvements };
}

function renderProfile(profile, matches, heroNames) {
  const profileData = profile.profile || {};
  const displayName = profileData.personaname || profileData.name || "Jugador de Dota 2";
  const avatar = profileData.avatarfull || profileData.avatarmedium || profileData.avatar;

  document.querySelector("#player-name").textContent = displayName;
  document.querySelector("#matches-count").textContent = matches.length;
  document.querySelector("#updated-time").textContent = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  document.querySelector("#avatar-fallback").textContent = displayName.charAt(0).toUpperCase();

  const avatarImage = document.querySelector("#player-avatar");
  if (avatar) {
    avatarImage.src = avatar;
    avatarImage.alt = `Avatar de ${displayName}`;
    avatarImage.hidden = false;
    document.querySelector("#avatar-fallback").hidden = true;
  }

  matchList.replaceChildren(...matches.flatMap((match, index) => {
    const won = isPlayerWin(match);
    const heroData = match.hero && typeof match.hero === "object" ? match.hero : heroNames.get(Number(match.hero_id));
    const hero = heroData?.localizedName || heroData?.localized_name || heroData?.name;
    const heroIcon = getHeroImage(heroData || {});
    const cells = [
      [won === null ? "No disponible" : won ? "Victoria" : "Derrota", `match-result ${won === null ? "unknown" : won ? "win" : "loss"}`],
      [formatKda(match), ""],
      [formatDuration(match.duration), ""]
    ];
    const row = document.createElement("tr");
    const heroCell = document.createElement("td");
    heroCell.className = "match-hero";
    if (heroIcon) {
      const image = document.createElement("img");
      image.className = "match-hero-icon";
      image.src = heroIcon;
      image.alt = "";
      image.loading = "lazy";
      heroCell.append(image);
    }
    const heroName = document.createElement("span");
    heroName.textContent = hero || "Héroe desconocido";
    heroCell.append(heroName);
    row.append(heroCell);
    for (const [value, className] of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (className) cell.className = className;
      row.append(cell);
    }

    const actionCell = document.createElement("td");
    const reviewId = `match-review-${index + 1}`;
    const reviewToggle = document.createElement("button");
    reviewToggle.className = "review-toggle";
    reviewToggle.type = "button";
    reviewToggle.textContent = "Valoración";
    reviewToggle.setAttribute("aria-expanded", "false");
    reviewToggle.setAttribute("aria-controls", reviewId);
    actionCell.append(reviewToggle);
    row.append(actionCell);

    const review = getMatchReview(match, won);
    const reviewRow = document.createElement("tr");
    reviewRow.className = "review-row";
    reviewRow.hidden = true;
    const reviewCell = document.createElement("td");
    reviewCell.colSpan = 5;
    reviewCell.id = reviewId;
    const summary = document.createElement("p");
    summary.className = "review-summary";
    summary.textContent = review.summary;
    const points = document.createElement("ol");
    points.className = "review-points";
    for (const improvement of review.improvements) {
      const point = document.createElement("li");
      point.textContent = improvement;
      points.append(point);
    }
    reviewCell.append(summary, points);
    reviewRow.append(reviewCell);

    reviewToggle.addEventListener("click", () => {
      reviewRow.hidden = !reviewRow.hidden;
      reviewToggle.setAttribute("aria-expanded", String(!reviewRow.hidden));
    });

    return [row, reviewRow];
  }));
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.querySelector("span:first-child").textContent = isLoading ? "Analizando..." : "Analizar perfil";
  statusPanel.hidden = !isLoading;
}

function setStatus(title, detail) {
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function clearView() {
  results.hidden = true;
  emptyState.hidden = true;
  matchList.replaceChildren();
  document.querySelector("#player-avatar").hidden = true;
  document.querySelector("#avatar-fallback").hidden = false;
}