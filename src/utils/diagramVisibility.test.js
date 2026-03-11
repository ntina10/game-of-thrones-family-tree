import { buildNodeIntroMap, isEdgeVisible } from "./diagramVisibility";

describe("diagramVisibility", () => {
  it("default: edge appears when both endpoints are introduced", () => {
    const nodes = [
      {
        id: "a",
        data: { states: [{ season: 1, episode: 1 }] },
      },
      {
        id: "b",
        data: { states: [{ season: 1, episode: 3 }] },
      },
    ];
    const nodeIntroById = buildNodeIntroMap(nodes);
    const nodeHiddenById = { a: false, b: false };
    const edge = { id: "e1", source: "a", target: "b", data: {} };

    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 2,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(false);

    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 3,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(true);
  });

  it("override: edge appears and disappears via active toggles", () => {
    const nodes = [
      { id: "a", data: { states: [{ season: 1, episode: 1 }] } },
      { id: "b", data: { states: [{ season: 1, episode: 1 }] } },
    ];
    const nodeIntroById = buildNodeIntroMap(nodes);
    const nodeHiddenById = { a: false, b: false };

    const edge = {
      id: "e2",
      source: "a",
      target: "b",
      data: {
        states: [
          { season: 3, episode: 2, active: true },
          { season: 3, episode: 9, active: false },
        ],
      },
    };

    // Before first state (S3E2 -> absolute 22)
    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 21,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(false);

    // Visible from S3E2 .. S3E8
    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 22,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(true);
    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 28,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(true);

    // Hidden from S3E9 onward
    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 29,
        nodeIntroById,
        nodeHiddenById,
      }),
    ).toBe(false);
  });

  it("always hides an edge if either endpoint node is hidden", () => {
    const nodes = [
      { id: "a", data: { states: [{ season: 1, episode: 1 }] } },
      { id: "b", data: { states: [{ season: 1, episode: 1 }] } },
    ];
    const nodeIntroById = buildNodeIntroMap(nodes);
    const edge = { id: "e3", source: "a", target: "b", data: {} };

    expect(
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode: 10,
        nodeIntroById,
        nodeHiddenById: { a: true, b: false },
      }),
    ).toBe(false);
  });
});

