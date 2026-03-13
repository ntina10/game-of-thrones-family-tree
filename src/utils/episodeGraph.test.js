import rawNodes from "../data/nodes.json";
import rawEdges from "../data/edges.json";
import { seasonEpisodeToAbsolute } from "./episodeIndex";
import {
  buildEpisodeGraph,
  buildEpisodeSubgraph,
  getVisibleCharacterIdsForEpisode,
  getVisibleNodeIdsForEpisode,
} from "./episodeGraph";
import { getHouseCoreWidthById } from "./layoutHelper";

describe("episodeGraph", () => {
  it("omits houses that have no visible house members yet", async () => {
    const nodes = [
      {
        id: "house-nights-watch",
        type: "house",
        data: {
          house: "Night's Watch",
          label: "Night's Watch",
          states: [{ episode: 1 }],
        },
      },
      {
        id: "house-stark",
        type: "house",
        data: { house: "Stark", label: "House Stark", states: [{ episode: 1 }] },
      },
      {
        id: "ned",
        type: "character",
        data: {
          house: "Stark",
          name: "Ned",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
    ];

    const graph = await buildEpisodeGraph(nodes, [], 1);

    expect(graph.nodes.map((node) => node.id)).toContain("house-stark");
    expect(graph.nodes.map((node) => node.id)).not.toContain("house-nights-watch");
  });

  it("does not reserve layout space for future-only nodes", async () => {
    const nodes = [
      {
        id: "house-stark",
        type: "house",
        data: { house: "Stark", label: "House Stark", states: [{ episode: 1 }] },
      },
      {
        id: "house-tully",
        type: "house",
        data: { house: "Tully", label: "House Tully", states: [{ episode: 1 }] },
      },
      {
        id: "ned",
        type: "character",
        data: {
          house: "Stark",
          name: "Ned",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      {
        id: "bran",
        type: "character",
        data: {
          house: "Stark",
          name: "Bran",
          states: [{ episode: 2 }],
          layout: { generationSeed: 1, importance: "primary" },
        },
      },
      {
        id: "rickon",
        type: "character",
        data: {
          house: "Stark",
          name: "Rickon",
          states: [{ episode: 2 }],
          layout: { generationSeed: 1, importance: "primary" },
        },
      },
      {
        id: "catelyn",
        type: "character",
        data: {
          house: "Tully",
          name: "Catelyn",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
    ];

    const episodeOne = await buildEpisodeGraph(nodes, [], 1);
    const episodeTwo = await buildEpisodeGraph(nodes, [], 2);
    const episodeOneById = Object.fromEntries(
      episodeOne.nodes.map((node) => [node.id, node]),
    );
    const episodeTwoById = Object.fromEntries(
      episodeTwo.nodes.map((node) => [node.id, node]),
    );

    expect(episodeOneById.bran).toBeUndefined();
    expect(episodeOneById.rickon).toBeUndefined();
    expect(episodeTwoById["house-tully"].position.x).toBeGreaterThan(
      episodeOneById["house-tully"].position.x,
    );
  });

  it("keeps house banner positions stable when using a fixed house order and widths", async () => {
    const nodes = [
      {
        id: "house-stark",
        type: "house",
        data: { house: "Stark", label: "House Stark", states: [{ episode: 1 }] },
      },
      {
        id: "house-tully",
        type: "house",
        data: { house: "Tully", label: "House Tully", states: [{ episode: 1 }] },
      },
      {
        id: "ned",
        type: "character",
        data: {
          house: "Stark",
          name: "Ned",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      {
        id: "arya",
        type: "character",
        data: {
          house: "Stark",
          name: "Arya",
          states: [{ episode: 2 }],
          layout: { generationSeed: 1, importance: "primary" },
        },
      },
      {
        id: "catelyn",
        type: "character",
        data: {
          house: "Tully",
          name: "Catelyn",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
    ];
    const fixedHouseCoreWidthById = getHouseCoreWidthById(nodes, []);
    const options = {
      fixedHouseCoreWidthById,
      orderedHouseIds: ["house-stark", "house-tully"],
    };

    const episodeOne = await buildEpisodeGraph(nodes, [], 1, options);
    const episodeTwo = await buildEpisodeGraph(nodes, [], 2, options);
    const episodeOneById = Object.fromEntries(
      episodeOne.nodes.map((node) => [node.id, node]),
    );
    const episodeTwoById = Object.fromEntries(
      episodeTwo.nodes.map((node) => [node.id, node]),
    );

    expect(episodeTwoById["house-tully"].position.x).toBe(
      episodeOneById["house-tully"].position.x,
    );
  });

  it("ignores source banner edges and emits deterministic runtime banner edges", () => {
    const nodes = [
      {
        id: "house-lannister",
        type: "house",
        data: {
          house: "Lannister",
          label: "House Lannister",
          states: [{ episode: 1 }],
        },
      },
      {
        id: "tywin",
        type: "character",
        data: {
          house: "Lannister",
          name: "Tywin",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      {
        id: "kevan",
        type: "character",
        data: {
          house: "Lannister",
          name: "Kevan",
          states: [{ episode: 1 }],
          layout: { generationSeed: 1, importance: "primary" },
        },
      },
    ];
    const edges = [
      {
        id: "file-banner-kevan",
        source: "house-lannister",
        sourceHandle: "parent",
        target: "kevan",
        targetHandle: "child",
        relationshipType: "banner",
      },
    ];

    const subgraph = buildEpisodeSubgraph(nodes, edges, 1);
    const autoBanner = subgraph.edges.find(
      (edge) => edge.id === "auto-banner-house-lannister-tywin",
    );

    expect(subgraph.edges.map((edge) => edge.id)).not.toContain("file-banner-kevan");
    expect(autoBanner).toMatchObject({
      source: "house-lannister",
      sourceHandle: "parent",
      target: "tywin",
      targetHandle: "child",
      relationshipType: "banner",
    });
  });

  it("connects all tied topmost visible characters to the banner", () => {
    const nodes = [
      {
        id: "house-tully",
        type: "house",
        data: { house: "Tully", label: "House Tully", states: [{ episode: 1 }] },
      },
      {
        id: "hoster",
        type: "character",
        data: {
          house: "Tully",
          name: "Hoster",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      {
        id: "blackfish",
        type: "character",
        data: {
          house: "Tully",
          name: "Blackfish",
          states: [{ episode: 1 }],
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
    ];

    const subgraph = buildEpisodeSubgraph(nodes, [], 1);

    expect(
      subgraph.bannerEdges.map((edge) => edge.id).sort(),
    ).toEqual([
      "auto-banner-house-tully-blackfish",
      "auto-banner-house-tully-hoster",
    ]);
  });

  it("falls back to shallowest visible lineage depth when no rows are resolved", () => {
    const nodes = [
      {
        id: "house-greyjoy",
        type: "house",
        data: {
          house: "Greyjoy",
          label: "House Greyjoy",
          states: [{ episode: 1 }],
        },
      },
      {
        id: "balon",
        type: "character",
        data: {
          house: "Greyjoy",
          name: "Balon",
          states: [{ episode: 1 }],
        },
      },
      {
        id: "theon",
        type: "character",
        data: {
          house: "Greyjoy",
          name: "Theon",
          states: [{ episode: 1 }],
        },
      },
    ];
    const edges = [
      {
        id: "balon-theon",
        source: "balon",
        target: "theon",
        relationshipType: "child",
      },
    ];

    const subgraph = buildEpisodeSubgraph(nodes, edges, 1);

    expect(subgraph.bannerEdges.map((edge) => edge.id)).toEqual([
      "auto-banner-house-greyjoy-balon",
    ]);
  });

  it("returns episode visibility helpers that match the real dataset", () => {
    expect(getVisibleCharacterIdsForEpisode(rawNodes, 1)).toContain("jon_snow");
    expect(getVisibleCharacterIdsForEpisode(rawNodes, 1)).not.toContain("jeor_mormont");
    expect(getVisibleNodeIdsForEpisode(rawNodes, 1)).toContain("house_stark");
    expect(getVisibleNodeIdsForEpisode(rawNodes, 1)).not.toContain("house_nights_watch");
  });

  it("matches real-data visible character ids across the current slider range", async () => {
    const maxEpisode = seasonEpisodeToAbsolute(5, 2);

    for (let episode = 1; episode <= maxEpisode; episode += 1) {
      const graph = await buildEpisodeGraph(rawNodes, rawEdges, episode);
      const actualCharacterIds = graph.nodes
        .filter((node) => node.type === "character")
        .map((node) => node.id)
        .sort();
      const expectedCharacterIds = getVisibleCharacterIdsForEpisode(
        rawNodes,
        episode,
      ).sort();

      expect(actualCharacterIds).toEqual(expectedCharacterIds);
      expect(graph.nodes.filter(
        (node) => node.type === "character",
      ).length).toBe(expectedCharacterIds.length);
    }
  });
});
