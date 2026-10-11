const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdWJqZWN0IjoiMDAwYWNjNWItMzQxOC00NWEwLTkwZGEtNGJlOWQ5NThlMzhjIiwiU3RlYW1JZCI6Ijg0OTI3NDE3IiwiQVBJVXNlciI6InRydWUiLCJuYmYiOjE3OTE3MzYxMzksImV4cCI6MTgyMzI3MjEzOSwiaWF0IjoxNzkxNzM2MTM5LCJpc3MiOiJodHRwczovL2FwaS5zdHJhdHouY29tIn0.B-TVkY7N14TUJGDmhSctbMiSxD_I8RceBxiwsLUK_Ew";
const API_BASE = "https://api.stratz.com";
const OPEN_DOTA_BASE = "https://api.opendota.com/api";
const RECENT_MATCH_LIMIT = 20;

const form = document.querySelector("#player-form");
const accountInput = document.querySelector("#account-id");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const statusPanel = document.querySelector("#status-panel");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const results = document.querySelector("#results");
const emptyState = document.querySelector("#empty-state");
const heroList = document.querySelector("#hero-list");

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
        fetchStratzHeroes()
      ]);
    } catch (stratzError) {
      setStatus("Usando respaldo público", "Stratz rechazó la consulta; usando OpenDota para completar la búsqueda.");
      [profile, matches, heroes] = await Promise.all([
        fetchOpenDotaPlayer(accountId),
        fetchOpenDotaMatches(accountId),
        fetchOpenDotaHeroes()
      ]);
    }

    const heroIndex = new Map(heroes.map((hero) => [Number(hero.id), hero]));
    const topHeroes = aggregateHeroes(matches, heroIndex);

    if (topHeroes.length === 0) {
      emptyState.hidden = false;
      return;
    }

    renderProfile(profile, matches.length, topHeroes);
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

  try {
    const searchResults = await searchPlayers(query);
    const normalizedQuery = query.trim().toLocaleLowerCase();
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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const exactMatch = Array.isArray(fallbackSearch) ? fallbackSearch.find((player) => {
    const names = [player.personaname, player.name].filter(Boolean);
    return names.some((name) => String(name).trim().toLocaleLowerCase() === normalizedQuery);
  }) : null;

  if (!exactMatch) {
    throw new Error("No encontramos una coincidencia exacta para ese nombre de jugador.");
  }

  return String(exactMatch.account_id);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(options.headers || {})
    }
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
      const profile = normalizeProfile(data);
      if (profile && Object.keys(profile.profile || {}).length > 0) {
        return profile;
      }
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
      const matches = normalizeMatches(data);
      if (matches.length >= 0) return matches;
    } catch (error) {
      // La siguiente ruta puede usar un nombre de recurso distinto.
    }
  }

  return [];
}

async function fetchStratzHeroes() {
  const paths = [
    "/api/v1/heroes",
    "/api/v1/Heroes",
    "/api/v1/hero"
  ];

  for (const path of paths) {
    try {
      const data = await fetchJson(path);
      const heroes = normalizeHeroes(data);
      if (heroes.length > 0) return heroes;
    } catch (error) {
      // La siguiente ruta podría no existir pero la API puede devolver una estructura distinta.
    }
  }

  return [];
}

async function fetchOpenDotaPlayer(accountId) {
  const profile = await fetchOpenDotaJson(`/players/${accountId}`);
  return profile;
}

async function fetchOpenDotaMatches(accountId) {
  const matches = await fetchOpenDotaJson(`/players/${accountId}/matches?limit=${RECENT_MATCH_LIMIT}`);
  return matches;
}

async function fetchOpenDotaHeroes() {
  const heroes = await fetchOpenDotaJson("/heroes");
  return heroes;
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
  return list.map((match) => ({
    ...match,
    hero_id: match.hero_id ?? match.heroId ?? match.hero?.id ?? null,
    player_slot: match.player_slot ?? match.playerSlot ?? match.player_slot_id ?? null,
    radiant_win: match.radiant_win ?? match.radiantWin ?? match.radiant ?? null,
    win: match.win ?? match.isWin ?? null
  }));
}

function normalizeHeroes(payload) {
  const list = normalizeArray(payload);
  return list.map((hero) => {
    const base = hero.hero || hero;
    const id = Number(base.id ?? base.heroId ?? base.hero_id ?? 0);
    return {
      ...base,
      id,
      localized_name: base.localized_name || base.localizedName || base.name || "Héroe desconocido",
      img: base.img || base.image || base.icon || base.imageUrl || ""
    };
  });
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

function aggregateHeroes(matches, heroIndex) {
  const grouped = new Map();

  matches.forEach((match) => {
    const heroId = Number(match.hero_id);
    if (!Number.isInteger(heroId) || heroId <= 0 || !heroIndex.has(heroId)) return;

    const current = grouped.get(heroId) || { heroId, games: 0, wins: 0 };
    current.games += 1;
    if (isPlayerWin(match)) current.wins += 1;
    grouped.set(heroId, current);
  });

  return [...grouped.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      hero: heroIndex.get(item.heroId),
      winRate: (item.wins / item.games) * 100
    }));
}

function isPlayerWin(match) {
  const isRadiant = Number(match.player_slot) < 128;
  return isRadiant === Boolean(match.radiant_win);
}

function renderProfile(profile, matchCount, topHeroes) {
  const profileData = profile.profile || {};
  const displayName = profileData.personaname || profileData.name || "Jugador de Dota 2";
  const avatar = profileData.avatarfull || profileData.avatarmedium || profileData.avatar;

  document.querySelector("#player-name").textContent = displayName;
  document.querySelector("#matches-count").textContent = matchCount;
  document.querySelector("#updated-time").textContent = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  document.querySelector("#avatar-fallback").textContent = displayName.charAt(0).toUpperCase();

  const avatarImage = document.querySelector("#player-avatar");
  if (avatar) {
    avatarImage.src = avatar;
    avatarImage.alt = `Avatar de ${displayName}`;
    avatarImage.hidden = false;
    document.querySelector("#avatar-fallback").hidden = true;
  }

  heroList.replaceChildren(...topHeroes.map((hero, index) => createHeroRow(hero, index)));
}

function createHeroRow(item, index) {
  const row = document.createElement("article");
  row.className = "hero-row";
  const percentage = Math.round(item.winRate * 10) / 10;
  const image = item.hero.img ? `https://cdn.cloudflare.steamstatic.com${item.hero.img}` : "";
  row.innerHTML = `
    <div class="hero-rank">0${index + 1}</div>
    <div class="hero-info">
      ${image ? `<img class="hero-image" src="${image}" alt="" loading="lazy">` : ""}
      <span class="hero-name">${escapeHtml(item.hero.localized_name || "Héroe desconocido")}</span>
    </div>
    <div class="hero-games"><strong>${item.games}</strong> partidas</div>
    <div class="hero-wins"><strong>${item.wins}</strong> victorias</div>
    <div class="meter" aria-hidden="true"><div class="meter-fill" style="width: ${percentage}%"></div></div>
    <div class="win-rate ${percentage >= 50 ? "good" : ""}" aria-label="${percentage}% de victorias">${percentage.toFixed(1)}%</div>
  `;
  return row;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
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
  heroList.replaceChildren();
  document.querySelector("#player-avatar").hidden = true;
  document.querySelector("#avatar-fallback").hidden = false;
}