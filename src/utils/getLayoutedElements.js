import dagre from 'dagre';

// --- Configuration ---
const NODE_WIDTH = 170;
const NODE_HEIGHT = 210;
const HOUSE_SPACING = 200; // Horizontal space between the start of each house group
const SATELLITE_SPACING = 200; // Horizontal space for unconnected nodes
const SATELLITE_VERTICAL_OFFSET = 100; // Vertical space below the main tree for satellites

export const createHybridLayout = (initialNodes, initialEdges) => {
  let finalNodes = [];
  let masterXOffset = 0;

  // 1. Group nodes by their parent (the house)
  const houseGroups = initialNodes.reduce((acc, node) => {
    const house = node.data.house;
    if (!house) return acc; // Skip nodes without a parent
    if (!acc[house]) {
      acc[house] = [];
    }
    acc[house].push(node);
    return acc;
  }, {});

  // Process each house group individually
  for (const houseId in houseGroups) {
    const houseNodes = houseGroups[houseId];
    const houseNodeIds = new Set(houseNodes.map(node => node.id));

    // Get only the edges that connect nodes within this house
    const houseEdges = initialEdges.filter(edge => 
      houseNodeIds.has(edge.source) && houseNodeIds.has(edge.target)
    );
    
    // Find which nodes are connected by these edges
    const connectedNodeIds = new Set();
    houseEdges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    const connectedNodes = houseNodes.filter(node => connectedNodeIds.has(node.id));
    const satelliteNodes = houseNodes.filter(node => !connectedNodeIds.has(node.id));

    let layoutedConnectedNodes = [];
    let bottomY = 0;

    // 2. Run Dagre on the connected part of the house (the family tree)
    if (connectedNodes.length > 0) {
      const { nodes: dagreNodes } = getDagreLayout(connectedNodes, houseEdges);
      layoutedConnectedNodes = dagreNodes;
      
      // Find the bottom-most point of the Dagre layout to position satellites below it
      bottomY = Math.max(...dagreNodes.map(n => n.position.y + NODE_HEIGHT));
    }

    // 3. Position the unconnected "satellite" nodes in a simple grid
    satelliteNodes.forEach((node, index) => {
      node.position = {
        x: index * SATELLITE_SPACING,
        y: bottomY + SATELLITE_VERTICAL_OFFSET
      };
    });

    // 4. Assemble the final layout for this house and apply the master offset
    const allHouseNodes = [...layoutedConnectedNodes, ...satelliteNodes];
    allHouseNodes.forEach(node => {
      node.position.x += masterXOffset;
      finalNodes.push(node);
    });

    // Add the house banner node itself, positioned above its group
    const houseBannerNode = initialNodes.find(n => n.id === houseId);
    if (houseBannerNode) {
        houseBannerNode.position = { x: masterXOffset + 200, y: 0 };
        finalNodes.push(houseBannerNode);
    }

    masterXOffset += HOUSE_SPACING + (Math.max(connectedNodes.length, satelliteNodes.length) * 150);
  }

  return { nodes: finalNodes, edges: initialEdges };
};


// A helper function to run Dagre on a subgraph
function getDagreLayout(nodes, edges) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - NODE_WIDTH / 2,
      y: nodeWithPosition.y - NODE_HEIGHT / 2,
    };
  });
  return { nodes, edges };
}