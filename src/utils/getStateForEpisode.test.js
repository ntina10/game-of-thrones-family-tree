import { getStateForEpisode } from "./getStateForEpisode";

describe("getStateForEpisode", () => {
  it("merges all relevant states up to an episode (later overwrites earlier)", () => {
    const states = [
      { season: 1, episode: 1, name: "Arya", title: "Helper" },
      { season: 1, episode: 2, title: "Hand of the King" },
      { season: 1, episode: 3, opinion: "Evil" },
    ];

    expect(getStateForEpisode(states, 1)).toEqual({
      season: 1,
      episode: 1,
      name: "Arya",
      title: "Helper",
    });

    expect(getStateForEpisode(states, 2)).toEqual({
      season: 1,
      episode: 2,
      name: "Arya",
      title: "Hand of the King",
    });

    expect(getStateForEpisode(states, 3)).toEqual({
      season: 1,
      episode: 3,
      name: "Arya",
      title: "Hand of the King",
      opinion: "Evil",
    });
  });

  it("supports absolute_episode schema and ignores future states", () => {
    const states = [
      { absolute_episode: 2, tag: { type: "alive", text: "Alive" } },
      { absolute_episode: 5, tag: { type: "dead", text: "Dead" } },
    ];

    expect(getStateForEpisode(states, 1)).toEqual({});
    expect(getStateForEpisode(states, 2)).toEqual({
      absolute_episode: 2,
      tag: { type: "alive", text: "Alive" },
    });
    expect(getStateForEpisode(states, 4)).toEqual({
      absolute_episode: 2,
      tag: { type: "alive", text: "Alive" },
    });
  });

  it("supports legacy {episode} as absolute episode index", () => {
    const states = [
      { episode: 1, title: "Helper" },
      { episode: 3, title: "King" },
    ];

    expect(getStateForEpisode(states, 2)).toEqual({
      episode: 1,
      title: "Helper",
    });
    expect(getStateForEpisode(states, 3)).toEqual({
      episode: 3,
      title: "King",
    });
  });

  it("returns empty state when nothing is relevant", () => {
    expect(getStateForEpisode([], 10)).toEqual({});
    expect(getStateForEpisode(null, 10)).toEqual({});
  });
});

