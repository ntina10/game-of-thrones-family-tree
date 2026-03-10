import {
  absoluteToSeasonEpisode,
  seasonEpisodeToAbsolute,
  stateToAbsoluteEpisode,
  totalEpisodesThroughSeason,
} from "./episodeIndex";

describe("episodeIndex", () => {
  it("computes total episodes through a season", () => {
    expect(totalEpisodesThroughSeason(4)).toBe(40);
    expect(totalEpisodesThroughSeason(8)).toBe(73);
    expect(totalEpisodesThroughSeason(0)).toBe(0);
  });

  it("returns null when season is unknown", () => {
    expect(totalEpisodesThroughSeason(9)).toBeNull();
  });

  it("converts season/episode to absolute and back", () => {
    expect(seasonEpisodeToAbsolute(1, 1)).toBe(1);
    expect(seasonEpisodeToAbsolute(2, 1)).toBe(11);
    expect(seasonEpisodeToAbsolute(8, 6)).toBe(73);

    expect(absoluteToSeasonEpisode(1)).toEqual({ season: 1, episode: 1 });
    expect(absoluteToSeasonEpisode(11)).toEqual({ season: 2, episode: 1 });
    expect(absoluteToSeasonEpisode(73)).toEqual({ season: 8, episode: 6 });
  });

  it("returns null for invalid conversion inputs", () => {
    expect(seasonEpisodeToAbsolute(0, 1)).toBeNull();
    expect(seasonEpisodeToAbsolute(1, 0)).toBeNull();
    expect(seasonEpisodeToAbsolute(1, 11)).toBeNull();
    expect(seasonEpisodeToAbsolute("1", 1)).toBeNull();
    expect(absoluteToSeasonEpisode(0)).toBeNull();
    expect(absoluteToSeasonEpisode("2")).toBeNull();
    expect(absoluteToSeasonEpisode(999)).toBeNull();
  });

  it("supports multiple state episode schemas", () => {
    expect(stateToAbsoluteEpisode({ absolute_episode: 5 })).toBe(5);
    expect(stateToAbsoluteEpisode({ season: 2, episode: 3 })).toBe(13);
    // Back-compat: older data used `episode` as an absolute episode index.
    expect(stateToAbsoluteEpisode({ episode: 4 })).toBe(4);
    expect(stateToAbsoluteEpisode(null)).toBeNull();
  });
});

