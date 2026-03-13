import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import HouseNode from "./HouseNode";

const updateNodeInternals = vi.fn();

vi.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Bottom: "bottom" },
  useNodeId: () => "house-node-id",
  useUpdateNodeInternals: () => updateNodeInternals,
}));

describe("HouseNode", () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it("refreshes node internals when the banner image loads", () => {
    render(
      <HouseNode
        data={{
          label: "House Stark",
          image: "/houses/stark.png",
        }}
      />,
    );

    fireEvent.load(screen.getByAltText("House Stark"));

    expect(updateNodeInternals).toHaveBeenCalledWith("house-node-id");
  });
});
