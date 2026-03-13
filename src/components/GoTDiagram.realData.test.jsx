import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DiagramWrapper from "./GoTDiagram";
import rawNodes from "../data/nodes.json";
import {
  getVisibleCharacterIdsForEpisode,
} from "../utils/episodeGraph";
import { seasonEpisodeToAbsolute } from "../utils/episodeIndex";
import {
  __resetReactFlowMock,
  __setNodesInitialized,
  __setReactFlowApi,
} from "@xyflow/react";

vi.mock("@tisoap/react-flow-smart-edge", () => ({
  SmartBezierEdge: () => null,
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  let nodesInitialized = true;
  let reactFlowApi = createReactFlowApi();
  const subscribers = new Set();

  function createReactFlowApi(overrides = {}) {
    return {
      fitView: vi.fn(() => Promise.resolve(true)),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      screenToFlowPosition: vi.fn((position) => position),
      viewportInitialized: true,
      ...overrides,
    };
  }

  function emit() {
    subscribers.forEach((subscriber) => subscriber());
  }

  return {
    __resetReactFlowMock: () => {
      nodesInitialized = true;
      reactFlowApi = createReactFlowApi();
      emit();
    },
    __setNodesInitialized: (value) => {
      nodesInitialized = value;
      emit();
    },
    __setReactFlowApi: (overrides) => {
      reactFlowApi = createReactFlowApi(overrides);
      emit();
      return reactFlowApi;
    },
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    EdgeLabelRenderer: ({ children }) => <>{children}</>,
    Handle: () => <div data-testid="handle" />,
    Position: {
      Left: "left",
      Right: "right",
      Top: "top",
      Bottom: "bottom",
    },
    ReactFlow: ({ nodes, edges, onInit, children }) => {
      React.useEffect(() => {
        onInit?.(reactFlowApi);
      }, [onInit]);

      return (
        <div data-testid="react-flow">
          {nodes.map((node) => (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              data-type={node.type}
              data-x={node.position?.x ?? ""}
              data-y={node.position?.y ?? ""}
              className="react-flow__node"
              style={node.style}
            >
              {node.data?.name ?? node.data?.label ?? node.id}
            </div>
          ))}
          {edges.map((edge) => (
            <div
              key={edge.id}
              data-testid={`edge-${edge.id}`}
              data-type={edge.type ?? ""}
              style={edge.style}
            />
          ))}
          {children}
        </div>
      );
    },
    ReactFlowProvider: ({ children }) => <>{children}</>,
    BaseEdge: () => null,
    getSmoothStepPath: () => ["M 0 0", 0, 0],
    useNodesInitialized: () =>
      React.useSyncExternalStore(
        (subscriber) => {
          subscribers.add(subscriber);
          return () => subscribers.delete(subscriber);
        },
        () => nodesInitialized,
        () => nodesInitialized,
      ),
    useReactFlow: () => reactFlowApi,
  };
});

describe("GoTDiagram real data parity", () => {
  let rafNow;
  let rafId;
  let rafCallbacks;

  const flushAnimationFrames = async (durationMs) => {
    const steps = Math.ceil(durationMs / 16);

    for (let index = 0; index < steps; index += 1) {
      const callbacks = [...rafCallbacks.values()];
      rafCallbacks.clear();
      rafNow += 16;
      callbacks.forEach((callback) => callback(rafNow));
      await Promise.resolve();
    }
  };

  const getRenderedCharacterIds = () =>
    [...document.querySelectorAll('[data-testid^="node-"][data-type="character"]')]
      .map((element) => element.getAttribute("data-testid").replace(/^node-/, ""))
      .sort();

  const expectEpisodeCharacters = (episode) => {
    expect(getRenderedCharacterIds()).toEqual(
      [...getVisibleCharacterIdsForEpisode(rawNodes, episode)].sort(),
    );
  };

  const settleEpisode = async (episode) => {
    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: String(episode) },
      });
      await Promise.resolve();
      await Promise.resolve();
      await flushAnimationFrames(400);
    });

    await waitFor(() => expectEpisodeCharacters(episode));
  };

  beforeEach(() => {
    rafNow = 0;
    rafId = 0;
    rafCallbacks = new Map();

    __resetReactFlowMock();
    __setNodesInitialized(true);
    __setReactFlowApi({
      fitView: vi.fn(() => Promise.resolve(true)),
      screenToFlowPosition: vi.fn((position) => position),
    });

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        rafId += 1;
        rafCallbacks.set(rafId, callback);
        return rafId;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((frameId) => {
        rafCallbacks.delete(frameId);
      }),
    );
    vi.spyOn(performance, "now").mockImplementation(() => rafNow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it(
    "renders exactly the expected real-data characters while scrubbing forward and backward",
    async () => {
      const maxEpisode = seasonEpisodeToAbsolute(5, 2);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(<DiagramWrapper />);

      await waitFor(() => expectEpisodeCharacters(1));

      for (let episode = 2; episode <= maxEpisode; episode += 1) {
        await settleEpisode(episode);
      }

      for (let episode = maxEpisode - 1; episode >= 1; episode -= 1) {
        await settleEpisode(episode);
      }

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    },
    10000,
  );
});
