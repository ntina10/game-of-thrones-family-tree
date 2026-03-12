import React, { useState, useMemo, useCallback, useEffect } from "react";
// Make sure all imports come from the same package! '@xyflow/react' is the new standard
import {
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Controls,
  Background,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css"; // Updated stylesheet path for xyflow

import { SmartBezierEdge } from "@tisoap/react-flow-smart-edge";
import CharacterNode from "./CharacterNode";
import HouseNode from "./HouseNode";
import UnionNode from "./UnionNode";
import RelationshipEdge from "./RelationshipEdge";
import EpisodeSlider from "./EpisodeSlider";
import { getStateForEpisode } from "../utils/getStateForEpisode";
import { totalEpisodesThroughSeason } from "../utils/episodeIndex";
import {
  buildNodeIntroMap,
  getEdgeEpisodeStatus,
  isEdgeVisible,
} from "../utils/diagramVisibility";

import { getSemanticLayout } from "../utils/layoutHelper";

// Import your initial data
import initialNodes from "../data/nodes.json";
import initialEdges from "../data/edges.json";

function GoTDiagram() {
  // 1. Initialize state with the RAW, un-layouted data (or empty arrays)
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [isLayoutReady, setIsLayoutReady] = useState(false); // Helps prevent jumping UI

  const [currentEpisode, setCurrentEpisode] = useState(1);
  const maxEpisode = useMemo(() => totalEpisodesThroughSeason(4) ?? 40, []);

  // 2. Run semantic layout asynchronously when the component mounts
  useEffect(() => {
    const calculateLayout = async () => {
      // Fetch the layouted nodes and edges
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        await getSemanticLayout(
          initialNodes,
          initialEdges,
        );

      // Update the state with the new X/Y positions
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setIsLayoutReady(true);
    };

    calculateLayout();
  }, []); // Empty dependency array ensures this runs exactly once on mount

  const nodeTypes = useMemo(
    () => ({ character: CharacterNode, house: HouseNode, union: UnionNode }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      smart: SmartBezierEdge,
      relationship: RelationshipEdge,
    }),
    [],
  );

  const onNodesChange = useCallback(
    (changes) =>
      setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes) =>
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

  const activeNodes = useMemo(() => {
    return nodes.map((node) => {
      const currentState = getStateForEpisode(
        node.data?.states || [],
        currentEpisode,
      );
      const hasBeenIntroduced = Object.keys(currentState).length > 0;

      return {
        ...node,
        // Hide nodes that haven't been introduced yet
        hidden: !hasBeenIntroduced,
        data: {
          ...node.data,
          ...currentState,
        },
      };
    });
  }, [currentEpisode, nodes]);

  const nodeIntroById = useMemo(() => buildNodeIntroMap(nodes), [nodes]);
  const nodeHiddenById = useMemo(() => {
    const hiddenById = {};
    activeNodes.forEach((n) => {
      hiddenById[n.id] = Boolean(n.hidden);
    });
    return hiddenById;
  }, [activeNodes]);

  const activeEdges = useMemo(() => {
    const stable = new Set(["banner", "child", "partner"]);

    return edges.map((edge) => {
      const visible = isEdgeVisible({
        edge,
        currentAbsoluteEpisode: currentEpisode,
        nodeIntroById,
        nodeHiddenById,
      });

      const status = getEdgeEpisodeStatus(edge, currentEpisode);
      const mergedState = status.mode === "override" ? status.merged : null;

      const isRelationshipOverlay =
        edge.relationshipType === "lover" ||
        edge.relationshipType === "partner_overlay" ||
        edge.sourceHandle === "lover" ||
        edge.targetHandle === "lover" ||
        edge.relationshipType === "visual_only";
      const shouldBeSmart =
        !stable.has(edge.relationshipType) && !isRelationshipOverlay;
      const nextType = isRelationshipOverlay
        ? "relationship"
        : shouldBeSmart
          ? "smart"
          : edge.type;

      return {
        ...edge,
        hidden: !visible,
        type: nextType,
        data: {
          ...(edge.data ?? {}),
          ...(mergedState ?? {}),
          relationshipType:
            edge.relationshipType === "visual_only" &&
            (edge.sourceHandle === "lover" || edge.targetHandle === "lover")
              ? "lover"
              : edge.relationshipType,
        },
      };
    });
  }, [currentEpisode, edges, nodeIntroById, nodeHiddenById]);

  return (
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
        {/* Only render ReactFlow if the layout math is finished */}
        {isLayoutReady ? (
          <ReactFlow
            nodes={activeNodes}
            edges={activeEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            minZoom={0.1}
          >
            <Controls />
            <Background />
          </ReactFlow>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <h3>Drawing the Realm...</h3> {/* Simple loading state */}
          </div>
        )}
      </div>

      <EpisodeSlider
        currentEpisode={currentEpisode}
        setCurrentEpisode={setCurrentEpisode}
        maxEpisode={maxEpisode}
      />
    </div>
  );
}

// Wrap in provider if you need hooks like useReactFlow elsewhere
export default function DiagramWrapper() {
  return (
    <ReactFlowProvider>
      <GoTDiagram />
    </ReactFlowProvider>
  );
}
