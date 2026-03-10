import { buildElkLayoutInput, getElkLayout } from "./layoutHelper";

describe("layoutHelper (ELK)", () => {
  it("builds ELK graph input with dummy grid blocks for side characters", () => {
    const nodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "c1", type: "character", data: { house: "Stark" } },
      { id: "c2", type: "character", data: { house: "Stark" } },
      { id: "c3", type: "character", data: { house: "Stark" } },
      { id: "c4", type: "character", data: { house: "Stark" } },
    ];
    const edges = [];

    const { graph } = buildElkLayoutInput(nodes, edges);

    const dummy = graph.children.find((c) => c.id === "dummy_grid_house-stark");
    expect(dummy).toBeTruthy();
    // 4 side chars => 2 rows x 3 cols (GRID_COLS=3), with spacings baked into size.
    expect(dummy.width).toBe(570);
    expect(dummy.height).toBe(450);
  });

  it("maps ELK positions for connected nodes and places side characters into the dummy grid", async () => {
    const initialNodes = [
      { id: "house-stark", type: "house", data: { house: "Stark" } },
      { id: "c1", type: "character", data: { house: "Stark" } },
      { id: "c2", type: "character", data: { house: "Stark" } },
      { id: "side1", type: "character", data: { house: "Stark" } },
      { id: "union1", type: "union", data: {} },
    ];

    const initialEdges = [
      { id: "pc-1", source: "c1", target: "c2" },
      { id: "decorative-1", source: "c1", target: "union1" },
    ];

    const elkInstance = {
      layout: async (graph) => {
        // Ensure the dummy node was requested in the input graph.
        const dummyId = graph.children.find((c) =>
          c.id.startsWith("dummy_grid_"),
        )?.id;
        expect(dummyId).toBe("dummy_grid_house-stark");

        return {
          children: [
            { id: "house-stark", x: 10, y: 20 },
            { id: "c1", x: 100, y: 200 },
            { id: "c2", x: 200, y: 200 },
            { id: "union1", x: 150, y: 240 },
            { id: "dummy_grid_house-stark", x: 1000, y: 2000 },
          ],
        };
      },
    };

    const { nodes: finalNodes, edges: finalEdges } = await getElkLayout(
      initialNodes,
      initialEdges,
      { elkInstance },
    );

    expect(finalEdges).toBe(initialEdges);

    const byId = Object.fromEntries(finalNodes.map((n) => [n.id, n]));
    expect(byId["house-stark"].position).toEqual({ x: 10, y: 20 });
    expect(byId["c1"].position).toEqual({ x: 100, y: 200 });
    expect(byId["c2"].position).toEqual({ x: 200, y: 200 });
    expect(byId["union1"].position).toEqual({ x: 150, y: 240 });

    // Side character placement: first item in grid goes at dummy's top-left corner.
    expect(byId["side1"].position).toEqual({ x: 1000, y: 2000 });
  });
});
