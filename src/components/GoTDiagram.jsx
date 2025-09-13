import React, { useState, useMemo, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import ReactFlow, {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Controls,
  SmoothStepEdge,
} from "reactflow";
import { SmartBezierEdge } from "@tisoap/react-flow-smart-edge";
import "reactflow/dist/style.css"; // Important: import the styles
import CharacterNode from "./CharacterNode";
import HouseNode from "./HouseNode";
import EpisodeSlider from "./EpisodeSlider";
import { getStateForEpisode } from "../utils/getStateForEpisode";
import { createHybridLayout } from "../utils/getLayoutedElements";

// Import your initial data
import initialNodes from "../data/nodes.json";
import initialEdges from "../data/edges_temp.json";

const { nodes: layoutedNodes, edges: layoutedEdges } = createHybridLayout(
  initialNodes,
  initialEdges
);

function GoTDiagram() {
  // Use state to manage nodes and edges
  const [nodes, setNodes] = useState(layoutedNodes);
  const [edges, setEdges] = useState(layoutedEdges);

  // Use state for the slider
  const [currentEpisode, setCurrentEpisode] = useState(1);

  // useMemo is a React hook that prevents the object from being recreated on every render
  const nodeTypes = useMemo(
    () => ({ character: CharacterNode, house: HouseNode }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      step: SmoothStepEdge,
      // smart: SmartBezierEdge,
    }),
    []
  );

  const onNodesChange = useCallback(
    (changes) =>
      setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) =>
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    []
  );
  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    []
  );

  const activeNodes = useMemo(() => {
    return nodes.map((node) => {
      // Get the state for the current episode
      const currentState = getStateForEpisode(node.data.states, currentEpisode);

      // Check if the character has been introduced yet.
      // An empty currentState object means they have not.
      const hasBeenIntroduced = Object.keys(currentState).length > 0;

      return {
        ...node, // Keep original id, position, etc.
        // Use React Flow's 'hidden' property to control visibility
        hidden: !hasBeenIntroduced,
        // Merge the calculated state into the node's data
        data: {
          ...node.data,
          ...currentState,
        },
      };
    });
  }, [currentEpisode, nodes]);

  return (
    // Set a height for the container, otherwise it won't be visible
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0, padding: "10px", textAlign: "center" }}>
          GAME OF THRONES Family Tree
        </h2>
        <p>by Konstantina & Alejandro</p>
      </div>

      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={activeNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          minZoom={0.1}
        >
          <Controls />
        </ReactFlow>
      </div>
      <EpisodeSlider
        currentEpisode={currentEpisode}
        setCurrentEpisode={setCurrentEpisode}
      />
    </div>
  );
}

export default GoTDiagram;
