import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DiagramWrapper from "./GoTDiagram";
import { buildEpisodeGraph } from "../utils/episodeGraph";
import {
  __getReactFlowApi,
  __resetReactFlowMock,
  __setReactFlowApi,
} from "@xyflow/react";

vi.mock("../utils/episodeGraph", () => ({
  buildEpisodeGraph: vi.fn(),
  getVisibleHouseIdsForEpisode: vi.fn(() => ["house-stark"]),
}));

vi.mock("../utils/layoutHelper", async () => {
  const actual = await vi.importActual("../utils/layoutHelper");

  return {
    ...actual,
    getHouseCoreWidthById: vi.fn(
      () => new Map([["house-stark", 250], ["house-tully", 250]]),
    ),
  };
});

vi.mock("@tisoap/react-flow-smart-edge", () => ({
  SmartBezierEdge: () => null,
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  let nodesInitialized = true;
  let lastOnError = null;
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
    __getReactFlowApi: () => reactFlowApi,
    __resetReactFlowMock: () => {
      nodesInitialized = true;
      lastOnError = null;
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
    __triggerReactFlowError: (id, message) => {
      lastOnError?.(id, message);
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
    ReactFlow: ({ nodes, edges, onError, onInit, children }) => {
      React.useEffect(() => {
        lastOnError = onError ?? null;
      }, [onError]);
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

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("GoTDiagram", () => {
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

  beforeEach(() => {
    rafNow = 0;
    rafId = 0;
    rafCallbacks = new Map();

    __resetReactFlowMock();

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

  it("animates node movement and entry opacity between episode snapshots", async () => {
    buildEpisodeGraph.mockImplementation(async (_nodes, _edges, episode) => {
      if (episode === 1) {
        return {
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 0, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        };
      }

      return {
        nodes: [
          {
            id: "ned",
            type: "character",
            position: { x: 120, y: 120 },
            data: { name: "Ned" },
          },
          {
            id: "arya",
            type: "character",
            position: { x: 220, y: 120 },
            data: { name: "Arya" },
          },
        ],
        edges: [
          {
            id: "edge-ned-arya",
            source: "ned",
            target: "arya",
            relationshipType: "child",
          },
        ],
      };
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
    });

    await act(async () => {
      await flushAnimationFrames(176);
    });

    const animatedNed = screen.getByTestId("node-ned");
    const enteringArya = screen.getByTestId("node-arya");

    expect(Number(animatedNed.getAttribute("data-x"))).toBeGreaterThan(0);
    expect(Number(animatedNed.getAttribute("data-x"))).toBeLessThan(120);
    expect(parseFloat(enteringArya.style.opacity)).toBeGreaterThan(0);
    expect(parseFloat(enteringArya.style.opacity)).toBeLessThan(1);

    await act(async () => {
      await flushAnimationFrames(320);
    });

    expect(Number(screen.getByTestId("node-ned").getAttribute("data-x"))).toBe(120);
    expect(Number(screen.getByTestId("node-arya").getAttribute("data-y"))).toBe(120);
    expect(screen.getByTestId("edge-edge-ned-arya").style.opacity).toBe("1");
  });

  it("ignores stale async graph results during rapid forward and backward scrubs", async () => {
    const episodeThree = deferred();
    const episodeTwo = deferred();

    buildEpisodeGraph.mockImplementation((_nodes, _edges, episode) => {
      if (episode === 1) {
        return Promise.resolve({
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 0, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        });
      }

      if (episode === 3) {
        return episodeThree.promise;
      }

      return episodeTwo.promise;
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "3" },
      });
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
    });

    await act(async () => {
      episodeTwo.resolve({
        nodes: [
          {
            id: "arya",
            type: "character",
            position: { x: 220, y: 120 },
            data: { name: "Arya" },
          },
        ],
        edges: [],
      });
      await Promise.resolve();
    });

    await act(async () => {
      await flushAnimationFrames(400);
    });

    expect(screen.getByTestId("node-arya")).toBeInTheDocument();
    expect(screen.queryByTestId("node-ned")).not.toBeInTheDocument();

    await act(async () => {
      episodeThree.resolve({
        nodes: [
          {
            id: "sansa",
            type: "character",
            position: { x: 360, y: 120 },
            data: { name: "Sansa" },
          },
        ],
        edges: [],
      });
      await Promise.resolve();
    });

    await act(async () => {
      await flushAnimationFrames(400);
    });

    expect(screen.getByTestId("node-arya")).toBeInTheDocument();
    expect(screen.queryByTestId("node-sansa")).not.toBeInTheDocument();
  });

  it("animates cleanly when moving backward on the slider", async () => {
    buildEpisodeGraph.mockImplementation(async (_nodes, _edges, episode) => {
      if (episode === 1) {
        return {
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 40, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        };
      }

      return {
        nodes: [
          {
            id: "ned",
            type: "character",
            position: { x: 220, y: 120 },
            data: { name: "Ned" },
          },
          {
            id: "arya",
            type: "character",
            position: { x: 320, y: 120 },
            data: { name: "Arya" },
          },
        ],
        edges: [],
      };
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
      await flushAnimationFrames(400);
      await flushAnimationFrames(64);
    });

    expect(Number(screen.getByTestId("node-ned").getAttribute("data-x"))).toBe(220);
    expect(screen.getByTestId("node-arya")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "1" },
      });
      await Promise.resolve();
      await flushAnimationFrames(176);
    });

    expect(Number(screen.getByTestId("node-ned").getAttribute("data-x"))).toBeLessThan(220);
    expect(screen.getByTestId("node-arya")).toBeInTheDocument();

    await act(async () => {
      await flushAnimationFrames(320);
    });

    expect(Number(screen.getByTestId("node-ned").getAttribute("data-x"))).toBe(40);
    expect(screen.queryByTestId("node-arya")).not.toBeInTheDocument();
  });

  it("performs the initial fit view after the first settled graph mounts", async () => {
    const fitView = vi.fn(() => Promise.resolve(true));

    __setReactFlowApi({ fitView });
    buildEpisodeGraph.mockResolvedValue({
      nodes: [
        {
          id: "ned",
          type: "character",
          position: { x: 0, y: 120 },
          data: { name: "Ned" },
        },
      ],
      edges: [],
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());
    await act(async () => {
      await flushAnimationFrames(64);
    });

    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(1));
    expect(fitView).toHaveBeenCalledWith({ duration: 0, padding: 0.18 });
  });

  it("smart-refits after a settled episode when the graph no longer fits in view", async () => {
    const fitView = vi.fn(() => Promise.resolve(true));

    __setReactFlowApi({ fitView });
    buildEpisodeGraph.mockImplementation(async (_nodes, _edges, episode) => {
      if (episode === 1) {
        return {
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 0, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        };
      }

      return {
        nodes: [
          {
            id: "ned",
            type: "character",
            position: { x: 2400, y: 120 },
            data: { name: "Ned" },
          },
        ],
        edges: [],
      };
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());
    await act(async () => {
      await flushAnimationFrames(64);
    });
    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
      await flushAnimationFrames(400);
      await flushAnimationFrames(64);
    });

    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(2));
    expect(fitView).toHaveBeenLastCalledWith({ duration: 0, padding: 0.18 });
  });

  it("sanitizes invalid graph geometry before rendering", async () => {
    buildEpisodeGraph.mockImplementation(async (_nodes, _edges, episode) => {
      if (episode === 1) {
        return {
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 40, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        };
      }

      return {
        nodes: [
          {
            id: "ned",
            type: "character",
            position: { x: Number.NaN, y: 120 },
            data: { name: "Ned" },
          },
          {
            id: "arya",
            type: "character",
            position: { x: 220, y: Number.NaN },
            data: { name: "Arya" },
          },
          {
            id: "arya",
            type: "character",
            position: { x: 999, y: 999 },
            data: { name: "Arya duplicate" },
          },
        ],
        edges: [
          {
            id: "edge-ned-arya",
            source: "ned",
            target: "arya",
            relationshipType: "child",
          },
          {
            id: "edge-dangling",
            source: "ned",
            target: "ghost",
            relationshipType: "child",
          },
        ],
      };
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
      await flushAnimationFrames(400);
    });

    await waitFor(() => expect(screen.getByTestId("node-arya")).toBeInTheDocument());

    expect(Number(screen.getByTestId("node-ned").getAttribute("data-x"))).toBe(40);
    expect(Number(screen.getByTestId("node-arya").getAttribute("data-y"))).toBe(234);
    expect(screen.queryByTestId("edge-edge-dangling")).not.toBeInTheDocument();
  });

  it("keeps the current viewport when the settled graph already fits", async () => {
    const fitView = vi.fn(() => Promise.resolve(true));

    __setReactFlowApi({ fitView });
    buildEpisodeGraph.mockImplementation(async (_nodes, _edges, episode) => {
      if (episode === 1) {
        return {
          nodes: [
            {
              id: "ned",
              type: "character",
              position: { x: 0, y: 120 },
              data: { name: "Ned" },
            },
          ],
          edges: [],
        };
      }

      return {
        nodes: [
          {
            id: "ned",
            type: "character",
            position: { x: 200, y: 120 },
            data: { name: "Ned" },
          },
        ],
        edges: [],
      };
    });

    render(<DiagramWrapper />);

    await waitFor(() => expect(screen.getByTestId("node-ned")).toBeInTheDocument());
    await act(async () => {
      await flushAnimationFrames(64);
    });
    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.change(screen.getByRole("slider"), {
        target: { value: "2" },
      });
      await Promise.resolve();
      await flushAnimationFrames(400);
    });

    expect(fitView).toHaveBeenCalledTimes(1);
    expect(__getReactFlowApi().screenToFlowPosition).toHaveBeenCalled();
  });
});
