import ELK from "elkjs/lib/elk.bundled.js";

const NODE_WIDTH = 170;
const NODE_HEIGHT = 210;

// Grid Settings for Side Characters
const GRID_COLS = 3;
const GRID_X_SPACING = 30; // Horizontal space
const GRID_Y_SPACING = 30; // Vertical space

const defaultElk = new ELK();

export function buildElkLayoutInput(initialNodes, initialEdges) {
  // 1. STRIP PARENT IDS: Prevent React Flow from messing with absolute math
  const cleanNodes = initialNodes.map((node) => {
    const newNode = { ...node };
    delete newNode.parentId;
    return newNode;
  });

  // 2. FILTER EDGES: Get only the core family tree (Now using your perfect JSON natively!)
  const layoutEdges = initialEdges.filter(
    (edge) => edge.id.startsWith("pc-") || edge.id.startsWith("pu-"),
  );

  // 3. IDENTIFY CONNECTED VS UNCONNECTED CHARACTERS
  const connectedIds = new Set();
  layoutEdges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const houseMap = {};
  cleanNodes.forEach((n) => {
    if (n.type === "house") houseMap[n.data.house] = n.id;
  });

  const elkNodes = [];
  const elkEdges = [...layoutEdges];
  const unconnectedByHouse = {};

  // Group unconnected characters by their House
  cleanNodes.forEach((node) => {
    if (node.type === "character" && !connectedIds.has(node.id)) {
      const houseId = houseMap[node.data?.house] || "independent";
      if (!unconnectedByHouse[houseId]) unconnectedByHouse[houseId] = [];
      unconnectedByHouse[houseId].push(node);
    } else {
      // Main family tree members, House banners, and Unions go straight to ELK
      elkNodes.push(node);
    }
  });

  // 4. CREATE DUMMY GRID BLOCKS FOR ELK
  Object.entries(unconnectedByHouse).forEach(([houseId, sideChars]) => {
    const count = sideChars.length;
    const rows = Math.ceil(count / GRID_COLS);
    const cols = Math.min(count, GRID_COLS);

    // Calculate exact width and height needed for the grid
    const dummyWidth =
      cols * NODE_WIDTH + Math.max(0, cols - 1) * GRID_X_SPACING;
    const dummyHeight =
      rows * NODE_HEIGHT + Math.max(0, rows - 1) * GRID_Y_SPACING;

    const dummyId = `dummy_grid_${houseId}`;

    elkNodes.push({
      id: dummyId,
      type: "dummy",
      width: dummyWidth,
      height: dummyHeight,
    });

    if (houseId !== "independent") {
      // Connect the invisible block to the House Banner
      elkEdges.push({
        id: `math_edge_${houseId}`,
        source: houseId,
        target: dummyId,
      });
    }
  });

  // 5. RUN ELK LAYOUT
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "60",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: elkNodes.map((node) => {
      const isHouse = node.type === "house";
      const isUnion = node.type === "union";
      const isDummy = node.type === "dummy";

      return {
        id: node.id,
        width: isUnion ? 4 : isDummy ? node.width : NODE_WIDTH,
        height: isUnion ? 4 : isDummy ? node.height : NODE_HEIGHT,
        layoutOptions: isHouse
          ? { "elk.layered.layering.layerConstraint": "FIRST" }
          : {},
      };
    }),
    edges: elkEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return { graph, cleanNodes, connectedIds, unconnectedByHouse };
}

export const getElkLayout = async (initialNodes, initialEdges, options = {}) => {
  const { elkInstance = defaultElk } = options;

  const { graph, cleanNodes, connectedIds, unconnectedByHouse } =
    buildElkLayoutInput(initialNodes, initialEdges);

  try {
    const layoutedGraph = await elkInstance.layout(graph);
    const finalNodes = [];

    // A. Map the normal family tree nodes based on ELK's results
    cleanNodes.forEach((node) => {
      if (node.type !== "character" || connectedIds.has(node.id)) {
        const elkNode = layoutedGraph.children.find((n) => n.id === node.id);
        if (elkNode) {
          finalNodes.push({
            ...node,
            position: { x: elkNode.x, y: elkNode.y },
          });
        }
      }
    });

    // B. Place the Side-Characters perfectly inside their House's Dummy Grid!
    Object.entries(unconnectedByHouse).forEach(([houseId, sideChars]) => {
      const dummyId = `dummy_grid_${houseId}`;
      const elkDummy = layoutedGraph.children.find((n) => n.id === dummyId);

      if (elkDummy) {
        // Start from the top-left corner of the invisible dummy block ELK placed
        const startX = elkDummy.x;
        const startY = elkDummy.y;

        sideChars.forEach((charNode, index) => {
          const col = index % GRID_COLS;
          const row = Math.floor(index / GRID_COLS);

          const charX = startX + col * (NODE_WIDTH + GRID_X_SPACING);
          const charY = startY + row * (NODE_HEIGHT + GRID_Y_SPACING);

          finalNodes.push({
            ...charNode,
            position: { x: charX, y: charY },
          });
        });
      }
    });

    // We pass initialEdges back so all your hardcoded handles and wavy lines are preserved!
    return { nodes: finalNodes, edges: initialEdges };
  } catch (error) {
    console.error("ELK Layout Error:", error);
    return { nodes: initialNodes, edges: initialEdges };
  }
};
