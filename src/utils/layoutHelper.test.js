import { buildLayoutModel, getSemanticLayout } from "./layoutHelper";

describe("layoutHelper (semantic)", () => {
  it("keeps all house banners on one top row and aligns generations", async () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "house-tully", type: "house", data: { house: "Tully" } },
      { id: "rickard", type: "character", data: { house: "Stark" } },
      { id: "ned", type: "character", data: { house: "Stark" } },
      { id: "benjen", type: "character", data: { house: "Stark" } },
      { id: "catelyn", type: "character", data: { house: "Tully" } },
      { id: "robb", type: "character", data: { house: "Stark" } },
      { id: "jory", type: "character", data: { house: "Stark" } },
      {
        id: "union-ned-cat",
        type: "union",
        data: { relationship: "married", layout: { primary: true } },
      },
    ];

    const edges = [
      {
        id: "banner-stark-rickard",
        source: "house-stark",
        target: "rickard",
        relationshipType: "banner",
      },
      {
        id: "banner-tully-cat",
        source: "house-tully",
        target: "catelyn",
        relationshipType: "banner",
      },
      {
        id: "child-rickard-ned",
        source: "rickard",
        target: "ned",
        relationshipType: "child",
      },
      {
        id: "child-rickard-benjen",
        source: "rickard",
        target: "benjen",
        relationshipType: "child",
      },
      {
        id: "partner-ned",
        source: "ned",
        target: "union-ned-cat",
        relationshipType: "partner",
      },
      {
        id: "partner-cat",
        source: "catelyn",
        target: "union-ned-cat",
        relationshipType: "partner",
      },
      {
        id: "child-union-robb",
        source: "union-ned-cat",
        target: "robb",
        relationshipType: "child",
      },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, edges);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId["house-stark"].position.y).toBe(byId["house-tully"].position.y);
    expect(byId["rickard"].position.y - byId["house-stark"].position.y).toBeGreaterThanOrEqual(396);
    expect(byId["ned"].position.y).toBe(byId["benjen"].position.y);
    expect(byId["catelyn"].position.y).toBe(byId["house-tully"].position.y + 396);
    expect(byId["robb"].position.y).toBeGreaterThan(byId["ned"].position.y);
    expect(byId["benjen"].position.x - byId["ned"].position.x).toBeLessThanOrEqual(0);
    expect(byId["union-ned-cat"].position.x).toBeGreaterThan(byId["ned"].position.x);
    expect(byId["union-ned-cat"].position.x).toBeLessThan(
      byId["catelyn"].position.x + 170,
    );
    expect(byId["jory"].position.x).toBeGreaterThan(byId["house-stark"].position.x);
  });

  it("keeps descendants below their parents with minimum row spacing", async () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "rickard", type: "character", data: { house: "Stark" } },
      { id: "ned", type: "character", data: { house: "Stark" } },
      { id: "jon", type: "character", data: { house: "Stark" } },
    ];
    const edges = [
      {
        id: "banner-stark-rickard",
        source: "house-stark",
        target: "rickard",
        relationshipType: "banner",
      },
      {
        id: "child-rickard-ned",
        source: "rickard",
        target: "ned",
        relationshipType: "child",
      },
      {
        id: "child-ned-jon",
        source: "ned",
        target: "jon",
        relationshipType: "child",
      },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, edges);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId.jon.position.y).toBeGreaterThan(byId.ned.position.y);
    expect(byId.jon.position.x).toBeGreaterThanOrEqual(byId["house-stark"].position.x);
    expect(byId.jon.position.x - byId.ned.position.x).toBeGreaterThanOrEqual(-170);
  });

  it("keeps siblings aligned even when one sibling has a union", async () => {
    const nodes = [
      { id: "house-baratheon", type: "house", data: { house: "Baratheon" } },
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      { id: "robert", type: "character", data: { house: "Baratheon" } },
      { id: "renly", type: "character", data: { house: "Baratheon" } },
      { id: "stannis", type: "character", data: { house: "Baratheon" } },
      { id: "cersei", type: "character", data: { house: "Lannister" } },
      {
        id: "union-robert-cersei",
        type: "union",
        data: { relationship: "married", layout: { primary: true } },
      },
    ];

    const edges = [
      {
        id: "banner-baratheon-robert",
        source: "house-baratheon",
        target: "robert",
        relationshipType: "banner",
      },
      {
        id: "banner-baratheon-renly",
        source: "house-baratheon",
        target: "renly",
        relationshipType: "banner",
      },
      {
        id: "banner-baratheon-stannis",
        source: "house-baratheon",
        target: "stannis",
        relationshipType: "banner",
      },
      {
        id: "banner-lannister-cersei",
        source: "house-lannister",
        target: "cersei",
        relationshipType: "banner",
      },
      {
        id: "partner-robert",
        source: "robert",
        target: "union-robert-cersei",
        relationshipType: "partner",
      },
      {
        id: "partner-cersei",
        source: "cersei",
        target: "union-robert-cersei",
        relationshipType: "partner",
      },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, edges);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId.robert.position.y).toBe(byId.renly.position.y);
    expect(byId.robert.position.y).toBe(byId.stannis.position.y);
  });

  it("ignores visual-only edges when building the structural model", () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      { id: "tywin", type: "character", data: { house: "Lannister" } },
      { id: "cersei", type: "character", data: { house: "Lannister" } },
      { id: "jaime", type: "character", data: { house: "Lannister" } },
    ];

    const edges = [
      {
        id: "banner-lannister-tywin",
        source: "house-lannister",
        target: "tywin",
        relationshipType: "banner",
      },
      {
        id: "child-tywin-cersei",
        source: "tywin",
        target: "cersei",
        relationshipType: "child",
      },
      {
        id: "lover-jaime-cersei",
        source: "jaime",
        target: "cersei",
        sourceHandle: "lover",
        targetHandle: "lover",
        relationshipType: "visual_only",
      },
    ];

    const model = buildLayoutModel(nodes, edges);
    const structuralEdgeIds = model.structuralEdges.map((edge) => edge.id);

    expect(structuralEdgeIds).toContain("banner-lannister-tywin");
    expect(structuralEdgeIds).toContain("child-tywin-cersei");
    expect(structuralEdgeIds).not.toContain("lover-jaime-cersei");
  });

  it("does not let visual-only relationships reflow the main layout", async () => {
    const nodes = [
      { id: "house-baratheon", type: "house", data: { house: "Baratheon" } },
      { id: "robert", type: "character", data: { house: "Baratheon" } },
      { id: "gendry", type: "character", data: { house: "Baratheon" } },
      { id: "someone", type: "character", data: { house: "Baratheon" } },
    ];

    const structuralEdges = [
      {
        id: "banner-baratheon-robert",
        source: "house-baratheon",
        target: "robert",
        relationshipType: "banner",
      },
      {
        id: "child-robert-gendry",
        source: "robert",
        target: "gendry",
        relationshipType: "child",
      },
    ];

    const layoutWithoutOverlay = await getSemanticLayout(nodes, structuralEdges);
    const layoutWithOverlay = await getSemanticLayout(nodes, [
      ...structuralEdges,
      {
        id: "lover-robert-someone",
        source: "robert",
        target: "someone",
        sourceHandle: "lover",
        targetHandle: "lover",
        relationshipType: "visual_only",
      },
    ]);

    const withoutById = Object.fromEntries(
      layoutWithoutOverlay.nodes.map((node) => [node.id, node]),
    );
    const withById = Object.fromEntries(
      layoutWithOverlay.nodes.map((node) => [node.id, node]),
    );

    expect(withById["house-baratheon"].position).toEqual(
      withoutById["house-baratheon"].position,
    );
    expect(withById["robert"].position).toEqual(withoutById["robert"].position);
    expect(withById["gendry"].position).toEqual(withoutById["gendry"].position);
  });
});
