import { buildLayoutModel, getSemanticLayout } from "./layoutHelper";

describe("layoutHelper (global generations)", () => {
  it("aligns seeded primaries on generation 0 across houses", () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "house-tully", type: "house", data: { house: "Tully" } },
      {
        id: "ned",
        type: "character",
        data: { house: "Stark", layout: { generationSeed: 0, importance: "primary" } },
      },
      {
        id: "catelyn",
        type: "character",
        data: { house: "Tully", layout: { generationSeed: 0, importance: "primary" } },
      },
    ];

    const model = buildLayoutModel(nodes, []);

    expect(model.derivedGenerationByCharacter.get("ned")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("catelyn")).toBe(0);
    expect(model.displayRowByCharacter.get("ned")).toBe(
      model.displayRowByCharacter.get("catelyn"),
    );
  });

  it("derives parents above and children below a seeded primary", () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "rickard", type: "character", data: { house: "Stark" } },
      {
        id: "ned",
        type: "character",
        data: { house: "Stark", layout: { generationSeed: 0, importance: "primary" } },
      },
      { id: "robb", type: "character", data: { house: "Stark" } },
    ];
    const edges = [
      { id: "parent-rickard-ned", source: "rickard", target: "ned", relationshipType: "child" },
      { id: "parent-ned-robb", source: "ned", target: "robb", relationshipType: "child" },
    ];

    const model = buildLayoutModel(nodes, edges);

    expect(model.derivedGenerationByCharacter.get("rickard")).toBe(-1);
    expect(model.derivedGenerationByCharacter.get("ned")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("robb")).toBe(1);
  });

  it("keeps siblings on the same row and children below parents in positioned output", async () => {
    const nodes = [
      { id: "house-baratheon", type: "house", data: { house: "Baratheon" } },
      { id: "steffon", type: "character", data: { house: "Baratheon" } },
      {
        id: "robert",
        type: "character",
        data: {
          house: "Baratheon",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "renly", type: "character", data: { house: "Baratheon" } },
      { id: "stannis", type: "character", data: { house: "Baratheon" } },
    ];

    const edges = [
      { id: "steffon-robert", source: "steffon", target: "robert", relationshipType: "child" },
      { id: "steffon-renly", source: "steffon", target: "renly", relationshipType: "child" },
      { id: "steffon-stannis", source: "steffon", target: "stannis", relationshipType: "child" },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, edges);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId.robert.position.y).toBe(byId.renly.position.y);
    expect(byId.robert.position.y).toBe(byId.stannis.position.y);
    expect(byId.steffon.position.y).toBeLessThan(byId.robert.position.y);
  });

  it("uses partner edges for unions but not for generation derivation", () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      { id: "house-baratheon", type: "house", data: { house: "Baratheon" } },
      {
        id: "cersei",
        type: "character",
        data: {
          house: "Lannister",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "jaime", type: "character", data: { house: "Lannister" } },
      {
        id: "robert",
        type: "character",
        data: {
          house: "Baratheon",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      {
        id: "union-robert-cersei",
        type: "union",
        data: { relationship: "married", layout: { primary: true } },
      },
    ];

    const edges = [
      { id: "child-tywin-cersei", source: "jaime", target: "cersei", relationshipType: "visual_only", sourceHandle: "lover", targetHandle: "lover" },
      { id: "partner-robert", source: "robert", target: "union-robert-cersei", relationshipType: "partner" },
      { id: "partner-cersei", source: "cersei", target: "union-robert-cersei", relationshipType: "partner" },
    ];

    const model = buildLayoutModel(nodes, edges);
    const structuralEdgeIds = model.structuralEdges.map((edge) => edge.id);

    expect(structuralEdgeIds).not.toContain("child-tywin-cersei");
    expect(model.derivedGenerationByCharacter.get("cersei")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("robert")).toBe(0);
    expect(model.derivedGenerationByCharacter.has("jaime")).toBe(false);
  });

  it("uses banner fallback to align unresolved banner siblings", () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      {
        id: "tywin",
        type: "character",
        data: {
          house: "Lannister",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "kevan", type: "character", data: { house: "Lannister" } },
    ];
    const edges = [
      { id: "banner-tywin", source: "house-lannister", target: "tywin", relationshipType: "banner" },
      { id: "banner-kevan", source: "house-lannister", target: "kevan", relationshipType: "banner" },
    ];

    const model = buildLayoutModel(nodes, edges);

    expect(model.derivedGenerationByCharacter.get("tywin")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("kevan")).toBe(0);
  });

  it("propagates lineage from a banner-fallback parent", () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      {
        id: "tyrion",
        type: "character",
        data: {
          house: "Lannister",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "kevan", type: "character", data: { house: "Lannister" } },
      { id: "lancel", type: "character", data: { house: "Lannister" } },
    ];
    const edges = [
      { id: "banner-tyrion", source: "house-lannister", target: "tyrion", relationshipType: "banner" },
      { id: "banner-kevan", source: "house-lannister", target: "kevan", relationshipType: "banner" },
      { id: "kevan-lancel", source: "kevan", target: "lancel", relationshipType: "child" },
    ];

    const model = buildLayoutModel(nodes, edges);

    expect(model.derivedGenerationByCharacter.get("kevan")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("lancel")).toBe(1);
  });

  it("uses spouse inheritance for unresolved married partners", () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "house-maegyr", type: "house", data: { house: "Maegyr" } },
      {
        id: "robb",
        type: "character",
        data: {
          house: "Stark",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "talisa", type: "character", data: { house: "Maegyr" } },
      {
        id: "union-robb-talisa",
        type: "union",
        data: { relationship: "married", layout: { primary: true } },
      },
    ];
    const edges = [
      { id: "partner-robb", source: "robb", target: "union-robb-talisa", relationshipType: "partner" },
      { id: "partner-talisa", source: "talisa", target: "union-robb-talisa", relationshipType: "partner" },
    ];

    const model = buildLayoutModel(nodes, edges);

    expect(model.derivedGenerationByCharacter.get("robb")).toBe(0);
    expect(model.derivedGenerationByCharacter.get("talisa")).toBe(0);
  });

  it("keeps unresolved characters out of the aligned global rows when no fallback applies", async () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      {
        id: "tyrion",
        type: "character",
        data: {
          house: "Lannister",
          layout: { generationSeed: 0, importance: "primary" },
        },
      },
      { id: "bronn", type: "character", data: { house: "Lannister" } },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, []);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId.bronn.position.y).toBeGreaterThan(byId.tyrion.position.y);
  });

  it("keeps all banners on the same row", async () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "house-tully", type: "house", data: { house: "Tully" } },
      {
        id: "ned",
        type: "character",
        data: { house: "Stark", layout: { generationSeed: 0, importance: "primary" } },
      },
      {
        id: "catelyn",
        type: "character",
        data: { house: "Tully", layout: { generationSeed: 0, importance: "primary" } },
      },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, []);
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));

    expect(byId["house-stark"].position.y).toBe(byId["house-tully"].position.y);
  });

  it("places grouped characters inside a house-affiliated group box", async () => {
    const nodes = [
      { id: "house-targaryen", type: "house", data: { house: "Targaryen" } },
      {
        id: "group-qarth",
        type: "group",
        data: {
          label: "The Thirteen of Qarth",
          houseAffinity: "house-targaryen",
          members: ["xaro", "pyat", "spice"],
        },
      },
      { id: "xaro", type: "character", data: { house: "Qarth" } },
      { id: "pyat", type: "character", data: { house: "Qarth" } },
      { id: "spice", type: "character", data: { house: "Qarth" } },
      {
        id: "daenerys",
        type: "character",
        data: {
          house: "Targaryen",
          layout: { generationSeed: 0, importance: "primary" },
          states: [{ season: 1, episode: 1 }],
        },
      },
    ];

    const { nodes: layoutedNodes } = await getSemanticLayout(nodes, [], {
      visibleNodeIds: ["xaro", "pyat", "spice", "daenerys"],
    });
    const byId = Object.fromEntries(layoutedNodes.map((node) => [node.id, node]));
    const group = byId["group-qarth"];

    expect(group.position.y).toBeGreaterThan(byId.daenerys.position.y);
    expect(byId.xaro.position.x).toBeGreaterThanOrEqual(group.position.x);
    expect(byId.pyat.position.x).toBeGreaterThanOrEqual(group.position.x);
    expect(byId.spice.position.y).toBeGreaterThanOrEqual(group.position.y);
    expect(group.data.layoutBox.width).toBeGreaterThan(0);
  });

  it("matches the regression cases in the real dataset", () => {
    const nodes = [
      { id: "house-lannister", type: "house", data: { house: "Lannister" } },
      { id: "house-frey", type: "house", data: { house: "Frey" } },
      { id: "house-royce", type: "house", data: { house: "Royce" } },
      { id: "house-tully", type: "house", data: { house: "Tully" } },
      { id: "house-targaryen", type: "house", data: { house: "Targaryen" } },
      { id: "house_martell", type: "house", data: { house: "Martell" } },
      {
        id: "tyrion",
        type: "character",
        data: { house: "Lannister", layout: { generationSeed: 0, importance: "primary" } },
      },
      { id: "tywin", type: "character", data: { house: "Lannister" } },
      { id: "kevan", type: "character", data: { house: "Lannister" } },
      { id: "lancel", type: "character", data: { house: "Lannister" } },
      { id: "walder", type: "character", data: { house: "Frey" } },
      { id: "joyeuse", type: "character", data: { house: "Frey" } },
      {
        id: "union-walder-joyeuse",
        type: "union",
        data: { relationship: "married", layout: { primary: true } },
      },
      {
        id: "yohn",
        type: "character",
        data: { house: "Royce", layout: { generationSeed: 0, importance: "primary" } },
      },
      { id: "waymar", type: "character", data: { house: "Royce" } },
      {
        id: "catelyn",
        type: "character",
        data: { house: "Tully", layout: { generationSeed: 0, importance: "primary" } },
      },
      { id: "hoster", type: "character", data: { house: "Tully", layout: { importance: "primary" } } },
      { id: "blackfish", type: "character", data: { house: "Tully", layout: { importance: "primary" } } },
      {
        id: "daenerys",
        type: "character",
        data: { house: "Targaryen", layout: { generationSeed: 0, importance: "primary" } },
      },
      { id: "aerys", type: "character", data: { house: "Targaryen" } },
      { id: "aegon", type: "character", data: { house: "Targaryen" } },
      { id: "aemon", type: "character", data: { house: "Targaryen" } },
      {
        id: "ellaria",
        type: "character",
        data: {
          house: "Sand",
          layout: {
            generationSeed: 0,
            importance: "primary",
            houseAffinity: "house_martell",
          },
        },
      },
      {
        id: "oberyn",
        type: "character",
        data: { house: "Martell", layout: { generationSeed: 0, importance: "primary" } },
      },
    ];
    const edges = [
      { id: "banner-tywin", source: "house-lannister", target: "tywin", relationshipType: "banner" },
      { id: "banner-kevan", source: "house-lannister", target: "kevan", relationshipType: "banner" },
      { id: "kevan-lancel", source: "kevan", target: "lancel", relationshipType: "child" },
      { id: "tywin-tyrion", source: "tywin", target: "tyrion", relationshipType: "child" },
      { id: "banner-walder", source: "house-frey", target: "walder", relationshipType: "banner" },
      { id: "partner-walder", source: "walder", target: "union-walder-joyeuse", relationshipType: "partner" },
      { id: "partner-joyeuse", source: "joyeuse", target: "union-walder-joyeuse", relationshipType: "partner" },
      { id: "banner-yohn", source: "house-royce", target: "yohn", relationshipType: "banner" },
      { id: "yohn-waymar", source: "yohn", target: "waymar", relationshipType: "child" },
      { id: "banner-hoster", source: "house-tully", target: "hoster", relationshipType: "banner" },
      { id: "banner-blackfish", source: "house-tully", target: "blackfish", relationshipType: "banner" },
      { id: "hoster-catelyn", source: "hoster", target: "catelyn", relationshipType: "child" },
      { id: "banner-aegon", source: "house-targaryen", target: "aegon", relationshipType: "banner" },
      { id: "banner-aemon", source: "house-targaryen", target: "aemon", relationshipType: "banner" },
      { id: "aegon-aerys", source: "aegon", target: "aerys", relationshipType: "child" },
      { id: "aerys-daenerys", source: "aerys", target: "daenerys", relationshipType: "child" },
      { id: "banner-oberyn", source: "house_martell", target: "oberyn", relationshipType: "banner" },
    ];

    const model = buildLayoutModel(nodes, edges);

    expect(model.derivedGenerationByCharacter.get("kevan")).toBe(
      model.derivedGenerationByCharacter.get("tywin"),
    );
    expect(model.derivedGenerationByCharacter.get("lancel")).toBe(
      model.derivedGenerationByCharacter.get("tyrion"),
    );
    expect(model.derivedGenerationByCharacter.get("joyeuse")).toBe(
      model.derivedGenerationByCharacter.get("walder"),
    );
    expect(model.derivedGenerationByCharacter.get("aemon")).toBe(
      model.derivedGenerationByCharacter.get("aegon"),
    );
    expect(model.derivedGenerationByCharacter.get("waymar")).toBe(
      model.derivedGenerationByCharacter.get("yohn") + 1,
    );
    expect(model.derivedGenerationByCharacter.get("hoster")).toBe(-1);
    expect(model.derivedGenerationByCharacter.get("blackfish")).toBe(-1);
    expect(model.characterHouseById.get("ellaria")).toBe("house_martell");
  });
});
