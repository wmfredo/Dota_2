const API_BASE = "https://api.opendota.com/api";
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
  setStatus("Buscando jugador", "Resolviendo el perfil en OpenDota.");

  try {
    const accountId = await resolveAccountId(query);
    setStatus("Leyendo perfil", "Consultando tus datos recientes en OpenDota.");
    const [profile, matches, heroes] = await Promise.all([
      fetchJson(`/players/${accountId}`),
      fetchJson(`/players/${accountId}/matches?limit=${RECENT_MATCH_LIMIT}`),
      fetchJson("/heroes")
    ]);

    const heroIndex = new Map(heroes.map((hero) => [hero.id, hero]));
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

  const searchResults = await fetchJson(`/search?q=${encodeURIComponent(query)}`);
  const normalizedQuery = query.toLocaleLowerCase();
  const exactMatch = searchResults.find((player) => {
    const names = [player.personaname, player.name].filter(Boolean);
    return names.some((name) => name.trim().toLocaleLowerCase() === normalizedQuery);
  });

  if (!exactMatch) {
    throw new Error("No encontramos una coincidencia exacta para ese nombre de jugador.");
  }

  return String(exactMatch.account_id);
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    if (response.status === 429) throw new Error("OpenDota está limitando consultas. Espera un momento e inténtalo de nuevo.");
    if (response.status === 404) throw new Error("No encontramos ese perfil en OpenDota.");
    throw new Error("OpenDota no pudo responder. Inténtalo de nuevo más tarde.");
  }
  return response.json();
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