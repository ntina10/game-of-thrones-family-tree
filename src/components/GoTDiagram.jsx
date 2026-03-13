import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { SmartBezierEdge } from "@tisoap/react-flow-smart-edge";
import CharacterNode from "./CharacterNode";
import GroupNode from "./GroupNode";
import HouseNode from "./HouseNode";
import RelationshipEdge from "./RelationshipEdge";
import UnionNode from "./UnionNode";
import EpisodeSlider from "./EpisodeSlider";
import {
  seasonEpisodeToAbsolute,
  totalEpisodesThroughSeason,
} from "../utils/episodeIndex";
import {
  buildEpisodeGraph,
  getVisibleHouseIdsForEpisode,
} from "../utils/episodeGraph";
import { getHouseCoreWidthById } from "../utils/layoutHelper";

import initialNodes from "../data/nodes.json";
import initialEdges from "../data/edges.json";

const ANIMATION_DURATION_MS = 520;
const DENSE_ANIMATION_DURATION_MS = 360;
const ENTRY_OFFSET_Y = 18;
const VIEWPORT_MARGIN_RATIO = 0.1;
const INITIAL_FIT_PADDING = 0.18;
const SMART_REFIT_DURATION_MS = 0;
const DENSE_GRAPH_NODE_THRESHOLD = 85;
const DENSE_GRAPH_EDGE_THRESHOLD = 140;
const MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const DEFAULT_NODE_SIZES = {
  character: { width: 170, height: 210 },
  group: { width: 320, height: 180 },
  house: { width: 250, height: 190 },
  union: { width: 28, height: 28 },
};
const NODE_LAYER_Z_INDEX = {
  group: 0,
  house: 1,
  union: 3,
  character: 4,
};
const SHARED_EDGE_TYPES = new Set(["banner", "child", "partner"]);
const EMPTY_GRAPH = { nodes: [], edges: [] };
const DEBUG_STORAGE_KEY = "__gotDiagramDebugLog";
const MAX_DEBUG_EVENTS = 200;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function shouldLogDebugEvents() {
  if (typeof window === "undefined") return false;

  try {
    if (window.localStorage?.getItem("got-diagram-debug") === "1") return true;
    return import.meta.env.DEV && import.meta.env.MODE !== "test";
  } catch {
    return Boolean(import.meta.env.DEV && import.meta.env.MODE !== "test");
  }
}

function serializeError(error) {
  if (!error) return null;

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function appendDebugEvent(type, payload = {}) {
  if (!shouldLogDebugEvents()) return;

  const entry = {
    at: new Date().toISOString(),
    type,
    ...payload,
  };
  const existingEntries = Array.isArray(window[DEBUG_STORAGE_KEY])
    ? window[DEBUG_STORAGE_KEY]
    : [];
  const nextEntries = [...existingEntries, entry].slice(-MAX_DEBUG_EVENTS);

  window[DEBUG_STORAGE_KEY] = nextEntries;
  window.__printGotDiagramDebug = () => {
    console.table(window[DEBUG_STORAGE_KEY] ?? []);
  };

  console.info(`[GoTDiagram] ${type}`, entry);
}

function summarizeGraph(graph) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    characterCount: nodes.filter((node) => node.type === "character").length,
    houseCount: nodes.filter((node) => node.type === "house").length,
    groupCount: nodes.filter((node) => node.type === "group").length,
    unionCount: nodes.filter((node) => node.type === "union").length,
  };
}

function sanitizePosition(position, fallbackPosition = { x: 0, y: 0 }) {
  const fallbackX = isFiniteNumber(fallbackPosition?.x) ? fallbackPosition.x : 0;
  const fallbackY = isFiniteNumber(fallbackPosition?.y) ? fallbackPosition.y : 0;

  return {
    x: isFiniteNumber(position?.x) ? position.x : fallbackX,
    y: isFiniteNumber(position?.y) ? position.y : fallbackY,
  };
}

function sanitizeGraph(graph, fallbackGraph, context) {
  const fallbackNodesById = new Map(
    (fallbackGraph?.nodes ?? []).map((node) => [node.id, node]),
  );
  const seenNodeIds = new Set();
  const duplicateNodeIds = [];
  const invalidNodeIds = [];
  const sanitizedNodes = (graph?.nodes ?? []).flatMap((node, index) => {
    if (!node?.id) return [];
    if (seenNodeIds.has(node.id)) {
      duplicateNodeIds.push(node.id);
      return [];
    }

    seenNodeIds.add(node.id);
    const fallbackPosition =
      fallbackNodesById.get(node.id)?.position ??
      fallbackGraph?.nodes?.[index]?.position ??
      { x: 0, y: index * (DEFAULT_NODE_SIZES.character.height + 24) };
    const position = sanitizePosition(node.position, fallbackPosition);

    if (!isFiniteNumber(node.position?.x) || !isFiniteNumber(node.position?.y)) {
      invalidNodeIds.push(node.id);
    }

    return [{ ...node, position }];
  });

  const validNodeIds = new Set(sanitizedNodes.map((node) => node.id));
  const seenEdgeIds = new Set();
  const duplicateEdgeIds = [];
  const danglingEdgeIds = [];
  const sanitizedEdges = (graph?.edges ?? []).flatMap((edge) => {
    if (!edge?.id) return [];
    if (seenEdgeIds.has(edge.id)) {
      duplicateEdgeIds.push(edge.id);
      return [];
    }
    if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) {
      danglingEdgeIds.push(edge.id);
      return [];
    }

    seenEdgeIds.add(edge.id);
    return [edge];
  });

  if (
    invalidNodeIds.length > 0 ||
    duplicateNodeIds.length > 0 ||
    duplicateEdgeIds.length > 0 ||
    danglingEdgeIds.length > 0
  ) {
    appendDebugEvent("graph:sanitized", {
      ...context,
      invalidNodeIds,
      duplicateNodeIds,
      duplicateEdgeIds,
      danglingEdgeIds,
    });
  }

  return {
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
  };
}

class DiagramErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function withOpacity(style, opacity) {
  return {
    ...(style ?? {}),
    opacity,
  };
}

function withTransition(style, durationMs, properties = "transform") {
  let transition = "none";

  if (durationMs > 0) {
    if (properties === "opacity") {
      transition = `opacity ${durationMs}ms ease-out`;
    } else {
      transition = `${properties} ${durationMs}ms ${MOTION_EASING}`;
    }
  }

  return {
    ...(style ?? {}),
    transition,
  };
}

function getNodeSize(node) {
  if (node?.type === "group") {
    return {
      width: node.data?.layoutBox?.width ?? DEFAULT_NODE_SIZES.group.width,
      height: node.data?.layoutBox?.height ?? DEFAULT_NODE_SIZES.group.height,
    };
  }

  const fallback = DEFAULT_NODE_SIZES[node?.type] ?? DEFAULT_NODE_SIZES.character;

  return {
    width: Number(node?.width) || fallback.width,
    height: Number(node?.height) || fallback.height,
  };
}

function withStableNodeBox(node) {
  const { width, height } = getNodeSize(node);
  const zIndex = NODE_LAYER_Z_INDEX[node?.type] ?? 2;

  return {
    ...node,
    width,
    height,
    zIndex,
    style: {
      ...(node.style ?? {}),
      width,
      height,
      zIndex,
    },
  };
}

function getGraphBounds(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  const measurableNodes = nodes.filter(
    (node) => isFiniteNumber(node.position?.x) && isFiniteNumber(node.position?.y),
  );

  if (measurableNodes.length === 0) return null;

  const bounds = measurableNodes.reduce(
    (acc, node) => {
      const { width, height } = getNodeSize(node);
      const minX = node.position?.x ?? 0;
      const minY = node.position?.y ?? 0;
      const maxX = minX + width;
      const maxY = minY + height;

      return {
        minX: Math.min(acc.minX, minX),
        minY: Math.min(acc.minY, minY),
        maxX: Math.max(acc.maxX, maxX),
        maxY: Math.max(acc.maxY, maxY),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    ...bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function expandBounds(bounds, ratio) {
  if (!bounds) return null;

  const paddingX = bounds.width * ratio;
  const paddingY = bounds.height * ratio;

  return {
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
    maxX: bounds.maxX + paddingX,
    maxY: bounds.maxY + paddingY,
    width: bounds.width + paddingX * 2,
    height: bounds.height + paddingY * 2,
  };
}

function boundsContain(outerBounds, innerBounds) {
  if (!outerBounds || !innerBounds) return false;

  return (
    innerBounds.minX >= outerBounds.minX &&
    innerBounds.maxX <= outerBounds.maxX &&
    innerBounds.minY >= outerBounds.minY &&
    innerBounds.maxY <= outerBounds.maxY
  );
}

function getViewportBounds(containerElement, reactFlow) {
  if (!containerElement || !reactFlow?.screenToFlowPosition) return null;

  const rect = containerElement.getBoundingClientRect?.();
  const width =
    rect && rect.width > 0 ? rect.width : (window.innerWidth ?? 0);
  const height =
    rect && rect.height > 0 ? rect.height : (window.innerHeight ?? 0);

  if (!width || !height) return null;

  const left = rect && rect.width > 0 ? rect.left : 0;
  const top = rect && rect.height > 0 ? rect.top : 0;
  const topLeft = reactFlow.screenToFlowPosition({ x: left, y: top });
  const bottomRight = reactFlow.screenToFlowPosition({
    x: left + width,
    y: top + height,
  });

  if (
    !isFiniteNumber(topLeft?.x) ||
    !isFiniteNumber(topLeft?.y) ||
    !isFiniteNumber(bottomRight?.x) ||
    !isFiniteNumber(bottomRight?.y)
  ) {
    return null;
  }

  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

function decorateEdge(edge, opacity = 1) {
  const isRelationshipOverlay =
    edge.relationshipType === "lover" ||
    edge.relationshipType === "partner_overlay" ||
    edge.sourceHandle === "lover" ||
    edge.targetHandle === "lover" ||
    edge.relationshipType === "visual_only";
  const shouldBeSmart =
    !SHARED_EDGE_TYPES.has(edge.relationshipType) && !isRelationshipOverlay;

  return {
    ...edge,
    type: isRelationshipOverlay ? "relationship" : shouldBeSmart ? "smart" : edge.type,
    style: {
      ...(edge.style ?? {}),
      opacity,
    },
    data: {
      ...(edge.data ?? {}),
      relationshipType:
        edge.relationshipType === "visual_only" &&
        (edge.sourceHandle === "lover" || edge.targetHandle === "lover")
          ? "lover"
          : edge.relationshipType,
    },
  };
}

function renderGraphForDisplay(graph) {
  return {
    nodes: graph.nodes.map((node) =>
      withStableNodeBox({
        ...node,
        style: withTransition(withOpacity(node.style, 1), 0, "transform"),
      }),
    ),
    edges: graph.edges.map((edge) => decorateEdge(edge, 1)),
  };
}

function shouldUseLightweightAnimation(previousGraph, nextGraph) {
  const previousNodeCount = previousGraph?.nodes?.length ?? 0;
  const nextNodeCount = nextGraph?.nodes?.length ?? 0;
  const previousEdgeCount = previousGraph?.edges?.length ?? 0;
  const nextEdgeCount = nextGraph?.edges?.length ?? 0;

  return (
    Math.max(previousNodeCount, nextNodeCount) >= DENSE_GRAPH_NODE_THRESHOLD ||
    Math.max(previousEdgeCount, nextEdgeCount) >= DENSE_GRAPH_EDGE_THRESHOLD
  );
}

function buildAnimatedGraph(previousGraph, nextGraph, progress, options = {}) {
  const { includeEdges = true } = options;
  const previousNodesById = new Map(
    (previousGraph?.nodes ?? []).map((node) => [node.id, node]),
  );
  const nextNodesById = new Map(
    (nextGraph?.nodes ?? []).map((node) => [node.id, node]),
  );
  const orderedNodeIds = [
    ...(nextGraph?.nodes ?? []).map((node) => node.id),
    ...((previousGraph?.nodes ?? [])
      .map((node) => node.id)
      .filter((nodeId) => !nextNodesById.has(nodeId))),
  ];

  const nodes = orderedNodeIds.map((nodeId) => {
    const previousNode = previousNodesById.get(nodeId);
    const nextNode = nextNodesById.get(nodeId);

    if (previousNode && nextNode) {
      return {
        ...nextNode,
        position: {
          x: interpolate(previousNode.position.x, nextNode.position.x, progress),
          y: interpolate(previousNode.position.y, nextNode.position.y, progress),
        },
        style: nextNode.style,
      };
    }

    if (nextNode) {
      return {
        ...nextNode,
        position: {
          x: nextNode.position.x,
          y: interpolate(
            nextNode.position.y - ENTRY_OFFSET_Y,
            nextNode.position.y,
            progress,
          ),
        },
        style: nextNode.style,
      };
    }

    return {
      ...previousNode,
      style: previousNode.style,
    };
  });

  const edges = includeEdges
    ? (() => {
        const previousEdgesById = new Map(
          (previousGraph?.edges ?? []).map((edge) => [edge.id, edge]),
        );
        const nextEdgesById = new Map(
          (nextGraph?.edges ?? []).map((edge) => [edge.id, edge]),
        );
        const orderedEdgeIds = [
          ...(nextGraph?.edges ?? []).map((edge) => edge.id),
          ...((previousGraph?.edges ?? [])
            .map((edge) => edge.id)
            .filter((edgeId) => !nextEdgesById.has(edgeId))),
        ];

        return orderedEdgeIds.map((edgeId) => {
          const previousEdge = previousEdgesById.get(edgeId);
          const nextEdge = nextEdgesById.get(edgeId);

          if (previousEdge && nextEdge) {
            return decorateEdge(nextEdge, 1);
          }

          if (nextEdge) {
            return decorateEdge(nextEdge, 1);
          }

          return decorateEdge(previousEdge, 1);
        });
      })()
    : [];

  return { nodes, edges };
}

function buildTransitionGraph(previousGraph, nextGraph, durationMs, options = {}) {
  const { includeEdges = true, progress = 1 } = options;
  const graph = buildAnimatedGraph(previousGraph, nextGraph, progress, {
    includeEdges,
  });

  return {
    nodes: graph.nodes.map((node) =>
      withStableNodeBox({
        ...node,
        style: withTransition(node.style, durationMs, "transform"),
      }),
    ),
    edges: graph.edges,
  };
}

function GoTDiagram() {
  const [displayGraph, setDisplayGraph] = useState(EMPTY_GRAPH);
  const [settledGraph, setSettledGraph] = useState({
    version: 0,
    ...EMPTY_GRAPH,
  });
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [isEpisodeUpdating, setIsEpisodeUpdating] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState(1);

  const displayGraphRef = useRef(EMPTY_GRAPH);
  const settledGraphRef = useRef({
    version: 0,
    ...EMPTY_GRAPH,
  });
  const requestIdRef = useRef(0);
  const animationFrameRef = useRef(null);
  const animationSettleFrameRef = useRef(null);
  const animationTokenRef = useRef(0);
  const settledGraphVersionRef = useRef(0);
  const seenHouseOrderRef = useRef([]);
  const flowContainerRef = useRef(null);
  const previousEpisodeRef = useRef(null);
  const reactFlowInstanceRef = useRef(null);
  const viewportSyncTokenRef = useRef(0);
  const initialFitDoneRef = useRef(false);
  const handledViewportVersionRef = useRef(0);

  const maxEpisode = useMemo(
    () => seasonEpisodeToAbsolute(5, 2) ?? totalEpisodesThroughSeason(4) ?? 40,
    [],
  );
  const fixedHouseCoreWidthById = useMemo(
    () => getHouseCoreWidthById(initialNodes, initialEdges),
    [],
  );

  const nodeTypes = useMemo(
    () => ({
      character: CharacterNode,
      group: GroupNode,
      house: HouseNode,
      union: UnionNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      relationship: RelationshipEdge,
      smart: SmartBezierEdge,
    }),
    [],
  );

  const reportRuntimeError = useCallback((label, error) => {
    appendDebugEvent(`runtime-error:${label}`, {
      episode: currentEpisode,
      error: serializeError(error),
    });
    console.error(`[GoTDiagram:${label}]`, error);
  }, [currentEpisode]);

  const handleReactFlowError = useCallback((id, message) => {
    appendDebugEvent("reactflow:error", {
      episode: currentEpisode,
      id,
      message,
    });
    console.error(`[ReactFlow:${id}]`, message);
  }, [currentEpisode]);
  const handleViewportError = useCallback(
    (error) => reportRuntimeError("viewport", error),
    [reportRuntimeError],
  );
  const syncViewportForGraph = useCallback(
    (graph, reason = "effect") => {
      viewportSyncTokenRef.current += 1;
      const syncToken = viewportSyncTokenRef.current;
      let attempt = 0;
      const maxAttempts = 24;

      appendDebugEvent("viewport:sync:scheduled", {
        version: graph.version,
        reason,
      });

      const runSync = async () => {
        if (syncToken !== viewportSyncTokenRef.current) return;

        const reactFlow = reactFlowInstanceRef.current;
        const containerElement = flowContainerRef.current;

        if (!reactFlow || graph.version === 0 || graph.nodes.length === 0) return;

        const renderedNodeCount =
          containerElement?.querySelectorAll?.(".react-flow__node")?.length ?? 0;

        if (attempt < 2 || !containerElement || renderedNodeCount === 0) {
          if (attempt >= maxAttempts) {
            appendDebugEvent("viewport:sync:gave-up", {
              version: graph.version,
              reason,
              attempt,
              renderedNodeCount,
            });
            return;
          }

          attempt += 1;
          requestAnimationFrame(() => {
            void runSync();
          });
          return;
        }

        try {
          appendDebugEvent("viewport:sync:start", {
            version: graph.version,
            reason,
            attempt,
            renderedNodeCount,
            ...summarizeGraph(graph),
          });

          if (!initialFitDoneRef.current) {
            appendDebugEvent("viewport:fit:initial:start", {
              version: graph.version,
              reason,
            });
            await reactFlow.fitView({
              duration: 0,
              padding: INITIAL_FIT_PADDING,
            });
            if (syncToken !== viewportSyncTokenRef.current) return;

            initialFitDoneRef.current = true;
            handledViewportVersionRef.current = graph.version;
            appendDebugEvent("viewport:fit:initial:done", {
              version: graph.version,
              reason,
            });
            return;
          }

          if (handledViewportVersionRef.current === graph.version) return;

          const graphBounds = getGraphBounds(graph.nodes);
          const viewportBounds = getViewportBounds(containerElement, reactFlow);

          if (!graphBounds || !viewportBounds) {
            appendDebugEvent("viewport:sync:skipped", {
              version: graph.version,
              reason,
              skipReason: !graphBounds ? "missing-graph-bounds" : "missing-viewport-bounds",
            });
            handledViewportVersionRef.current = graph.version;
            return;
          }

          const viewportWithMargin = expandBounds(
            viewportBounds,
            VIEWPORT_MARGIN_RATIO,
          );

          if (!boundsContain(viewportWithMargin, graphBounds)) {
            appendDebugEvent("viewport:fit:smart:start", {
              version: graph.version,
              reason,
              graphBounds,
              viewportBounds,
            });
            await reactFlow.fitView({
              duration: SMART_REFIT_DURATION_MS,
              padding: INITIAL_FIT_PADDING,
            });
            if (syncToken !== viewportSyncTokenRef.current) return;

            appendDebugEvent("viewport:fit:smart:done", {
              version: graph.version,
              reason,
            });
          } else {
            appendDebugEvent("viewport:fit:smart:skipped", {
              version: graph.version,
              reason,
            });
          }

          handledViewportVersionRef.current = graph.version;
        } catch (error) {
          appendDebugEvent("viewport:sync:error", {
            version: graph.version,
            reason,
            error: serializeError(error),
          });
          handleViewportError(error);
        }
      };

      requestAnimationFrame(() => {
        void runSync();
      });
    },
    [handleViewportError],
  );
  const handleReactFlowInit = useCallback(
    (instance) => {
      reactFlowInstanceRef.current = instance;
      appendDebugEvent("reactflow:init", {
        viewportInitialized: instance?.viewportInitialized ?? null,
      });

      if (settledGraph.version > 0) {
        syncViewportForGraph(settledGraph, "init");
      }
    },
    [settledGraph, syncViewportForGraph],
  );
  const handleBoundaryError = useCallback(
    (error, errorInfo) => {
      appendDebugEvent("react:boundary:error", {
        episode: currentEpisode,
        error: serializeError(error),
        componentStack: errorInfo?.componentStack ?? null,
      });
      console.error("[GoTDiagram:boundary]", error, errorInfo);
    },
    [currentEpisode],
  );

  const publishDisplayGraph = useCallback((nextDisplayGraph) => {
    displayGraphRef.current = nextDisplayGraph;
    setDisplayGraph(nextDisplayGraph);
  }, []);

  const invalidateAnimation = useCallback(() => {
    const hadActiveAnimation =
      animationFrameRef.current !== null || animationSettleFrameRef.current !== null;

    animationTokenRef.current += 1;
    if (animationFrameRef.current !== null) {
      appendDebugEvent("animation:cancel", {
        episode: currentEpisode,
        token: animationTokenRef.current,
      });
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (animationSettleFrameRef.current !== null) {
      cancelAnimationFrame(animationSettleFrameRef.current);
      animationSettleFrameRef.current = null;
    }

    if (hadActiveAnimation && settledGraphRef.current.version > 0) {
      publishDisplayGraph(renderGraphForDisplay(settledGraphRef.current));
    }
  }, [currentEpisode, publishDisplayGraph]);

  const commitSettledGraph = useCallback((nextGraph) => {
    const nextDisplayGraph = renderGraphForDisplay(nextGraph);
    settledGraphVersionRef.current += 1;
    const nextSettledGraph = {
      version: settledGraphVersionRef.current,
      nodes: nextGraph.nodes,
      edges: nextGraph.edges,
    };

    displayGraphRef.current = nextDisplayGraph;
    settledGraphRef.current = nextSettledGraph;
    appendDebugEvent("graph:commit", {
      episode: currentEpisode,
      version: settledGraphVersionRef.current,
      ...summarizeGraph(nextGraph),
    });
    syncViewportForGraph(nextSettledGraph, "commit");

    setDisplayGraph(nextDisplayGraph);
    setSettledGraph(nextSettledGraph);
    setIsLayoutReady(true);
    setIsEpisodeUpdating(false);
  }, [currentEpisode, syncViewportForGraph]);

  const animateToGraph = useCallback(
    (nextGraph, requestId) => {
      invalidateAnimation();

      const animationToken = animationTokenRef.current;
      const previousGraph =
        settledGraphRef.current.version > 0
          ? settledGraphRef.current
          : displayGraphRef.current;
      const animationStart = performance.now();
      const useLightweightAnimation = shouldUseLightweightAnimation(
        previousGraph,
        nextGraph,
      );
      const animationDuration = useLightweightAnimation
        ? DENSE_ANIMATION_DURATION_MS
        : ANIMATION_DURATION_MS;
      const includeEdges = true;
      const startGraph = buildTransitionGraph(
        previousGraph,
        nextGraph,
        0,
        { includeEdges, progress: 0 },
      );
      const endGraph = buildTransitionGraph(
        previousGraph,
        nextGraph,
        animationDuration,
        { includeEdges, progress: 1 },
      );
      appendDebugEvent("animation:start", {
        episode: currentEpisode,
        requestId,
        token: animationToken,
        mode: useLightweightAnimation ? "lightweight" : "full",
        previous: summarizeGraph(previousGraph),
        next: summarizeGraph(nextGraph),
      });

      publishDisplayGraph(startGraph);

      const settle = (timestamp) => {
        if (
          animationToken !== animationTokenRef.current ||
          requestId !== requestIdRef.current
        ) {
          appendDebugEvent("animation:aborted", {
            episode: currentEpisode,
            requestId,
            token: animationToken,
            activeToken: animationTokenRef.current,
            activeRequestId: requestIdRef.current,
          });
          return;
        }

        const elapsed = timestamp - animationStart;
        if (elapsed < animationDuration) {
          animationSettleFrameRef.current = requestAnimationFrame(settle);
          return;
        }

        animationSettleFrameRef.current = null;
        appendDebugEvent("animation:complete", {
          episode: currentEpisode,
          requestId,
          token: animationToken,
        });
        commitSettledGraph(nextGraph);
      };

      animationFrameRef.current = requestAnimationFrame(() => {
        if (
          animationToken !== animationTokenRef.current ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        animationFrameRef.current = null;
        publishDisplayGraph(endGraph);
        animationSettleFrameRef.current = requestAnimationFrame(settle);
      });
    },
    [commitSettledGraph, currentEpisode, invalidateAnimation, publishDisplayGraph],
  );

  useEffect(() => {
    appendDebugEvent("episode:requested", {
      episode: currentEpisode,
      previousEpisode: previousEpisodeRef.current,
    });
    previousEpisodeRef.current = currentEpisode;
    invalidateAnimation();

    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const loadGraph = async () => {
      try {
        const visibleHouseIds = getVisibleHouseIdsForEpisode(
          initialNodes,
          currentEpisode,
        );
        appendDebugEvent("load:start", {
          episode: currentEpisode,
          requestId,
          visibleHouseIds,
        });
        if (displayGraphRef.current.nodes.length > 0) {
          setIsEpisodeUpdating(true);
        }
        visibleHouseIds.forEach((houseId) => {
          if (!seenHouseOrderRef.current.includes(houseId)) {
            seenHouseOrderRef.current = [...seenHouseOrderRef.current, houseId];
          }
        });

        const nextGraph = await buildEpisodeGraph(
          initialNodes,
          initialEdges,
          currentEpisode,
          {
            fixedHouseCoreWidthById,
            orderedHouseIds: seenHouseOrderRef.current,
          },
        );
        const sanitizedGraph = sanitizeGraph(nextGraph, displayGraphRef.current, {
          episode: currentEpisode,
          requestId,
        });

        appendDebugEvent("load:success", {
          episode: currentEpisode,
          requestId,
          seenHouseOrder: seenHouseOrderRef.current,
          ...summarizeGraph(sanitizedGraph),
        });

        if (cancelled || requestId !== requestIdRef.current) {
          appendDebugEvent("load:stale", {
            episode: currentEpisode,
            requestId,
            cancelled,
            activeRequestId: requestIdRef.current,
          });
          return;
        }

        if (displayGraphRef.current.nodes.length === 0) {
          commitSettledGraph(sanitizedGraph);
          return;
        }

        animateToGraph(sanitizedGraph, requestId);
      } catch (error) {
        if (!cancelled && requestId === requestIdRef.current) {
          setIsEpisodeUpdating(false);
          reportRuntimeError("loadGraph", error);
        }
      }
    };

    void loadGraph();

    return () => {
      cancelled = true;
      appendDebugEvent("load:cleanup", {
        episode: currentEpisode,
        requestId,
      });
    };
  }, [
    animateToGraph,
    commitSettledGraph,
    currentEpisode,
    fixedHouseCoreWidthById,
    invalidateAnimation,
    reportRuntimeError,
  ]);

  useEffect(() => () => invalidateAnimation(), [invalidateAnimation]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleWindowError = (event) => {
      if (
        event.message?.includes(
          "ResizeObserver loop completed with undelivered notifications.",
        )
      ) {
        event.preventDefault?.();
        return;
      }
      appendDebugEvent("window:error", {
        episode: currentEpisode,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: serializeError(event.error),
      });
    };
    const handleUnhandledRejection = (event) => {
      appendDebugEvent("window:unhandledrejection", {
        episode: currentEpisode,
        reason: serializeError(event.reason) ?? String(event.reason),
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [currentEpisode]);

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

      <div
        ref={flowContainerRef}
        style={{ flex: 1, position: "relative" }}
      >
        {isLayoutReady ? (
          <DiagramErrorBoundary
            resetKey={`${currentEpisode}:${settledGraph.version}`}
            onError={handleBoundaryError}
            fallback={(
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100%",
                  padding: "24px",
                  textAlign: "center",
                }}
              >
                <div>
                  <h3 style={{ marginBottom: "8px" }}>Diagram render failed</h3>
                  <p style={{ margin: 0 }}>
                    Check the browser console for `[GoTDiagram]` logs, then move the slider
                    again or refresh.
                  </p>
                </div>
              </div>
            )}
          >
            <ReactFlow
              nodes={displayGraph.nodes}
              edges={displayGraph.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={handleReactFlowInit}
              minZoom={0.1}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              onError={handleReactFlowError}
            >
              <Controls />
              <Background />
            </ReactFlow>
          </DiagramErrorBoundary>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <h3>Drawing the Realm...</h3>
          </div>
        )}
        {isLayoutReady ? (
          <div
            aria-hidden={!isEpisodeUpdating}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              padding: "8px 12px",
              borderRadius: "999px",
              background: "rgba(245, 239, 228, 0.92)",
              border: "1px solid rgba(70, 49, 24, 0.12)",
              boxShadow: "0 8px 18px rgba(48, 35, 18, 0.08)",
              color: "#473421",
              fontSize: "0.9rem",
              letterSpacing: "0.02em",
              opacity: isEpisodeUpdating ? 1 : 0,
              transform: isEpisodeUpdating ? "translateY(0)" : "translateY(-6px)",
              transition: `opacity 180ms ease-out, transform 180ms ease-out`,
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            Updating episode...
          </div>
        ) : null}
      </div>

      <EpisodeSlider
        currentEpisode={currentEpisode}
        setCurrentEpisode={setCurrentEpisode}
        maxEpisode={maxEpisode}
      />
    </div>
  );
}

export default function DiagramWrapper() {
  return (
    <ReactFlowProvider>
      <GoTDiagram />
    </ReactFlowProvider>
  );
}
