import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();
const NODE_WIDTH = 170;
const NODE_HEIGHT = 210;

export const getElkLayout = async (initialNodes, initialEdges) => {
  // FIX 1: THE MARRIAGE TRAP
  // We filter out marriages ('m-'), lovers ('l-'), and pets ('e-').
  // We ONLY feed parent-child ('pc-') edges into ELK for the layout math.
  const layoutEdges = initialEdges.filter(
    (edge) => edge.id.startsWith("pc-") || edge.id.startsWith("pu-"),
  );

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "80",
    },

    children: initialNodes.map((node) => {
      // FIX 2: THE BANNER TRAP
      // This forces all nodes of type 'house' to lock to the very top row,
      // preventing them from staggering down the screen.
      const nodeLayoutOptions =
        node.type === "house"
          ? { "elk.layered.layering.layerConstraint": "FIRST" }
          : {};

      return {
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layoutOptions: nodeLayoutOptions,
      };
    }),

    edges: layoutEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(graph);

    const finalNodes = initialNodes.map((node) => {
      const elkNode = layoutedGraph.children.find((n) => n.id === node.id);
      return {
        ...node,
        position: { x: elkNode.x, y: elkNode.y },
      };
    });

    // IMPORTANT: We return the original `initialEdges` (including marriages)
    // to React Flow so the marriage lines are still drawn on the screen!
    return { nodes: finalNodes, edges: initialEdges };
  } catch (error) {
    console.error("ELK Layout Error:", error);
    return { nodes: initialNodes, edges: initialEdges };
  }
};
