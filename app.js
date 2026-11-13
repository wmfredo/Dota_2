const OPEN_DOTA_BASE = "https://api.opendota.com/api";
const RECENT_MATCH_LIMIT = 10;
const DETAIL_FIELDS = ["level", "netWorth", "goldPerMinute", "experiencePerMinute", "heroDamage", "structureDamage", "healing"];

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

const initialPlayer = new URLSearchParams(window.location.search).get("player")?.trim();
if (initialPlayer) {
  accountInput.value = initialPlayer;
  loadPlayer(initialPlayer);
}

async function loadPlayer(query) {
  setLoading(true);
  clearView();
  setStatus("Buscando jugador", "Resolviendo el perfil en OpenDota.");

  try {
    const accountId = await resolveAccountId(query);

    setStatus("Leyendo perfil", "Consultando las partidas recientes en OpenDota.");
    const [profile, matches, heroes] = await Promise.all([
      fetchOpenDotaPlayer(accountId),
      fetchOpenDotaMatches(accountId),
      fetchHeroCatalog()
    ]);

    const recentMatches = matches.slice(0, RECENT_MATCH_LIMIT);
    if (recentMatches.length === 0) {
      emptyState.hidden = false;
      return;
    }

    renderProfile(profile, recentMatches, new Map(heroes.map((hero) => [hero.id, hero])), accountId);
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
  const searchResults = await fetchOpenDotaJson(`/search?q=${encodeURIComponent(query)}`);
  const exactMatch = Array.isArray(searchResults) ? searchResults.find((player) => {
    const names = [player.personaname, player.name].filter(Boolean);
    return names.some((name) => String(name).trim().toLocaleLowerCase() === normalizedQuery);
  }) : null;

  if (!exactMatch) {
    throw new Error("No encontramos una coincidencia exacta para ese nombre de jugador.");
  }

  return String(exactMatch.account_id);
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

async function fetchHeroCatalog() {
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
    const stats = match.player || match.stats || match.statistics || {};
    const value = (...keys) => {
      for (const key of keys) {
        const field = match[key] ?? stats[key];
        if (field != null) return field;
      }
      return null;
    };

    return {
      ...match,
      match_id: value("match_id", "matchId"),
      hero_id: match.hero_id ?? match.heroId ?? match.hero?.id ?? null,
      player_slot: match.player_slot ?? match.playerSlot ?? match.player_slot_id ?? null,
      radiant_win: match.radiant_win ?? match.radiantWin ?? match.radiant ?? null,
      win: match.win ?? match.isWin ?? match.isVictory ?? null,
      kills: value("kills"),
      deaths: value("deaths"),
      assists: value("assists"),
      duration: value("duration", "durationSeconds"),
      level: value("level", "finalLevel", "levelAchieved"),
      netWorth: value("netWorth", "net_worth"),
      goldPerMinute: value("goldPerMinute", "goldPerMin", "gold_per_min"),
      experiencePerMinute: value("experiencePerMinute", "experiencePerMin", "xpPerMin", "xp_per_min"),
      heroDamage: value("heroDamage", "hero_damage"),
      structureDamage: value("structureDamage", "buildingDamage", "towerDamage", "tower_damage"),
      healing: value("heroHealing", "hero_healing", "healing"),
      teamKills: value("teamKills", "team_kills"),
      killParticipation: value("killParticipation", "kill_participation")
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

function numericValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    const values = Object.values(value).map(Number).filter(Number.isFinite);
    return values.length ? values.reduce((total, item) => total + item, 0) : null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMetric(value, suffix = "") {
  const number = numericValue(value);
  return number == null ? "No disponible" : `${new Intl.NumberFormat("es").format(Math.round(number))}${suffix}`;
}

function formatKillParticipation(match) {
  const direct = numericValue(match.killParticipation);
  if (direct != null) return `${Math.round(direct <= 1 ? direct * 100 : direct)}%`;

  const kills = numericValue(match.kills);
  const assists = numericValue(match.assists);
  const teamKills = numericValue(match.teamKills);
  if (kills == null || assists == null || teamKills == null || teamKills <= 0) return "No disponible";
  return `${Math.round(((kills + assists) / teamKills) * 100)}%`;
}

function renderMatchDetails(list, match) {
  const metrics = [
    ["Nivel final", formatMetric(match.level)],
    ["Valor neto", formatMetric(match.netWorth, " oro")],
    ["GPM", formatMetric(match.goldPerMinute, " oro/min")],
    ["XPM", formatMetric(match.experiencePerMinute, " EXP/min")],
    ["Daño a héroes", formatMetric(match.heroDamage)],
    ["Daño a estructuras", formatMetric(match.structureDamage)],
    ["Curación", formatMetric(match.healing)],
    ["Participación en bajas", formatKillParticipation(match)]
  ];

  list.replaceChildren(...metrics.flatMap(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    item.append(term, description);
    return item;
  }));
}

function getTeamKills(match, fullMatch, player) {
  const existing = numericValue(match.teamKills);
  if (existing != null && existing > 0) return existing;

  const slot = Number(player.player_slot ?? match.player_slot);
  if (!Number.isFinite(slot)) return null;
  const isRadiant = slot < 128;
  const score = numericValue(isRadiant ? fullMatch.radiant_score : fullMatch.dire_score);
  if (score != null && score > 0) return score;

  const team = (fullMatch.players || []).filter((teammate) => (Number(teammate.player_slot) < 128) === isRadiant);
  return team.length ? team.reduce((total, teammate) => total + (numericValue(teammate.kills) || 0), 0) : null;
}

async function fetchFullMatchDetails(match, accountId) {
  const fullMatch = await fetchOpenDotaJson(`/matches/${encodeURIComponent(match.match_id)}`);
  const players = Array.isArray(fullMatch.players) ? fullMatch.players : [];
  const player = players.find((item) => Number(item.account_id) === Number(accountId)) ||
    players.find((item) => Number(item.player_slot) === Number(match.player_slot));
  if (!player) return null;

  const [details] = normalizeMatches([player]);
  const merged = { ...match };
  for (const field of [...DETAIL_FIELDS, "kills", "assists", "killParticipation"]) {
    if (details[field] != null) merged[field] = details[field];
  }
  merged.teamKills = getTeamKills(match, fullMatch, player);
  return merged;
}

function needsFullMatchDetails(match) {
  return DETAIL_FIELDS.some((field) => numericValue(match[field]) == null) ||
    (numericValue(match.killParticipation) == null && numericValue(match.teamKills) == null);
}

function renderProfile(profile, matches, heroNames, accountId) {
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
    const detailsId = `match-details-${index + 1}`;
    const detailsToggle = document.createElement("button");
    detailsToggle.className = "details-toggle";
    detailsToggle.type = "button";
    detailsToggle.textContent = "+";
    detailsToggle.setAttribute("aria-label", "Ampliar detalles de la partida");
    detailsToggle.setAttribute("aria-expanded", "false");
    detailsToggle.setAttribute("aria-controls", detailsId);
    actionCell.append(detailsToggle);
    row.append(actionCell);

    const detailsRow = document.createElement("tr");
    detailsRow.className = "match-details-row";
    detailsRow.hidden = true;
    const detailsCell = document.createElement("td");
    detailsCell.colSpan = 5;
    detailsCell.id = detailsId;
    const detailsHeading = document.createElement("h3");
    detailsHeading.className = "match-details-heading";
    detailsHeading.textContent = "Rendimiento de la partida";
    const detailsStatus = document.createElement("p");
    detailsStatus.className = "match-details-status";
    const detailsList = document.createElement("dl");
    detailsList.className = "match-details-list";
    renderMatchDetails(detailsList, match);
    detailsCell.append(detailsHeading, detailsStatus, detailsList);
    detailsRow.append(detailsCell);

    detailsToggle.addEventListener("click", async () => {
      detailsRow.hidden = !detailsRow.hidden;
      const expanded = !detailsRow.hidden;
      detailsToggle.textContent = expanded ? "−" : "+";
      detailsToggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Ampliar"} detalles de la partida`);
      detailsToggle.setAttribute("aria-expanded", String(expanded));

      if (!expanded || !needsFullMatchDetails(match) || match.match_id == null) return;
      match.detailsPromise ||= fetchFullMatchDetails(match, accountId).catch(() => null);
      detailsStatus.textContent = "Cargando estadísticas detalladas…";
      const details = await match.detailsPromise;
      if (details) Object.assign(match, details);
      detailsStatus.textContent = details ? "" : "Algunos datos no están disponibles.";
      renderMatchDetails(detailsList, match);
    });

    return [row, detailsRow];
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