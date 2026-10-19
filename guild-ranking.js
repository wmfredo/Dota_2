const GUILD_TAG = "RATOG";
const GUILD_REGION_EUROPE = 3;
const GUILD_LOOKUP_URL = "https://www.dota2.com/webapi/IDOTA2Guild/FindGuildByTag/v0001/";

const rankingStatus = document.querySelector("#guild-ranking-status");
const rankingResult = document.querySelector("#guild-ranking-result");
const rankingPosition = document.querySelector("#guild-ranking-position");
const rankingDetails = document.querySelector("#guild-ranking-details");
const rankingUpdated = document.querySelector("#guild-ranking-updated");

loadGuildRanking();

async function loadGuildRanking() {
  const url = new URL(GUILD_LOOKUP_URL);
  url.search = new URLSearchParams({ tag: GUILD_TAG, language: "english" }).toString();

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`La API respondió con estado ${response.status}.`);

    const data = await response.json();
    const guild = data?.found_guild;
    const guildInfo = guild?.guild_summary?.guild_info;
    if (guild?.result !== 1 || guildInfo?.guild_tag?.toLocaleUpperCase() !== GUILD_TAG) {
      throw new Error("La API no encontró el clan RATOGER.");
    }
    if (guildInfo.guild_region !== GUILD_REGION_EUROPE) {
      throw new Error("La API no identifica a RATOGER como un clan de Europa.");
    }

    const eventPoints = guild.guild_summary.event_points;
    const ranking = Array.isArray(eventPoints)
      ? eventPoints.find((event) => Number.isInteger(event.guild_weekly_rank) && event.guild_weekly_rank > 0)
      : null;
    if (!ranking) {
      rankingStatus.textContent = "La API oficial no ofrece una posición semanal para RATOGER en este momento.";
      return;
    }

    rankingPosition.textContent = `#${ranking.guild_weekly_rank}`;
    rankingDetails.textContent = [
      Number.isFinite(guild.guild_summary.member_count) ? `${guild.guild_summary.member_count} miembros` : null,
      Number.isFinite(ranking.guild_points) ? `${ranking.guild_points.toLocaleString("es-ES")} puntos semanales` : null
    ].filter(Boolean).join(" · ");
    rankingUpdated.textContent = `Consultado el ${new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date())}.`;

    rankingStatus.hidden = true;
    rankingResult.hidden = false;
  } catch (error) {
    rankingStatus.textContent = "No se pudo actualizar la posición del clan. Inténtalo de nuevo más tarde.";
    console.error("No se pudo cargar el ranking de RATOGER:", error);
  }
}
