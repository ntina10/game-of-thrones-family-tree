const SEASON_EPISODE_COUNTS = {
  1: 10,
  2: 10,
  3: 10,
  4: 10,
  5: 10,
  6: 10,
  7: 7,
  8: 6,
};

export function totalEpisodesThroughSeason(season) {
  let total = 0;
  for (let s = 1; s <= season; s += 1) {
    const count = SEASON_EPISODE_COUNTS[s];
    if (!count) return null;
    total += count;
  }
  return total;
}

export function seasonEpisodeToAbsolute(season, episode) {
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
  if (season < 1 || episode < 1) return null;

  const throughPrev = totalEpisodesThroughSeason(season - 1);
  const seasonCount = SEASON_EPISODE_COUNTS[season];
  if (throughPrev === null || !seasonCount) return null;
  if (episode > seasonCount) return null;

  return throughPrev + episode;
}

export function absoluteToSeasonEpisode(absoluteEpisode) {
  if (!Number.isFinite(absoluteEpisode) || absoluteEpisode < 1) return null;

  let remaining = absoluteEpisode;
  for (let season = 1; season <= 8; season += 1) {
    const count = SEASON_EPISODE_COUNTS[season];
    if (!count) return null;
    if (remaining <= count) return { season, episode: remaining };
    remaining -= count;
  }

  return null;
}

export function stateToAbsoluteEpisode(state) {
  if (!state || typeof state !== "object") return null;

  if (Number.isFinite(state.absolute_episode)) return state.absolute_episode;
  const computed = seasonEpisodeToAbsolute(state.season, state.episode);
  if (computed !== null) return computed;

  // Back-compat: older data used `episode` as an absolute episode index.
  if (Number.isFinite(state.episode)) return state.episode;

  return null;
}

