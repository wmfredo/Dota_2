const rankStatus = document.querySelector("#member-rank");

if (rankStatus) {
  loadMemberRank(rankStatus.dataset.memberName);
}

async function loadMemberRank(memberName) {
  try {
    const searchResults = await fetchOpenDota(`/search?q=${encodeURIComponent(memberName)}`);
    const normalizedName = memberName.trim().toLocaleLowerCase();
    const player = Array.isArray(searchResults) ? searchResults.find((candidate) =>
      [candidate.personaname, candidate.name]
        .filter(Boolean)
        .some((name) => String(name).trim().toLocaleLowerCase() === normalizedName)
    ) : null;

    if (!player) {
      rankStatus.textContent = "OpenDota no encontró un perfil con el nombre de Discord.";
      return;
    }

    const profile = await fetchOpenDota(`/players/${encodeURIComponent(player.account_id)}`);
    const rank = formatRank(profile.rank_tier, profile.leaderboard_rank);
    rankStatus.textContent = rank || "El rango no está disponible en OpenDota para este perfil.";
  } catch (error) {
    rankStatus.textContent = `No se pudo consultar el rango en OpenDota: ${error.message}`;
  }
}

async function fetchOpenDota(path) {
  const response = await fetch(`https://api.opendota.com/api${path}`);
  if (!response.ok) {
    if (response.status === 429) throw new Error("se alcanzó el límite de consultas.");
    if (response.status === 404) throw new Error("no se encontró el perfil.");
    throw new Error(`OpenDota respondió con el código ${response.status}.`);
  }
  return response.json();
}

function formatRank(rankTier, leaderboardRank) {
  const tier = Number(rankTier);
  if (!Number.isInteger(tier) || tier < 10) return "";

  const medal = Math.floor(tier / 10);
  const stars = tier % 10;
  const medals = {
    1: "Herald",
    2: "Guardian",
    3: "Crusader",
    4: "Archon",
    5: "Legend",
    6: "Ancient",
    7: "Divine",
    8: "Immortal"
  };
  const medalName = medals[medal];
  if (!medalName) return "";

  if (medal === 8) {
    const position = Number(leaderboardRank);
    return Number.isInteger(position) && position > 0
      ? `Rango de Dota 2: ${medalName} (puesto ${new Intl.NumberFormat("es").format(position)})`
      : `Rango de Dota 2: ${medalName}`;
  }

  return `Rango de Dota 2: ${medalName} ${stars}`;
}
