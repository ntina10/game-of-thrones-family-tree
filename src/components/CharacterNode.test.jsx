import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CharacterNode from "./CharacterNode";

const updateNodeInternals = vi.fn();

vi.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Right: "right", Left: "left", Bottom: "bottom", Top: "top" },
  useNodeId: () => "character-node-id",
  useUpdateNodeInternals: () => updateNodeInternals,
}));

vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => <span data-testid="fa" />,
}));

describe("CharacterNode", () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it("adds dead styling class when tag.type is dead", () => {
    const { container } = render(
      <CharacterNode
        data={{
          name: "Test",
          image: "/characters/test.png",
          house: "Night's Watch",
          tag: { type: "dead", text: "DEAD" },
        }}
      />,
    );

    const root = container.querySelector(".character-node");
    expect(root).toBeTruthy();
    expect(root.className).toContain("is-dead");
    expect(root.className).toContain("NightsWatch");
  });

  it("refreshes node internals when the portrait loads", () => {
    render(
      <CharacterNode
        data={{
          name: "Arya",
          image: "/characters/arya.png",
          house: "Stark",
        }}
      />,
    );

    fireEvent.load(screen.getByAltText("Arya"));

    expect(updateNodeInternals).toHaveBeenCalledWith("character-node-id");
  });
});
