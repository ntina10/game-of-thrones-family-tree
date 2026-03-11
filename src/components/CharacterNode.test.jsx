import React from "react";
import { render } from "@testing-library/react";
import CharacterNode from "./CharacterNode";

vi.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Right: "right", Left: "left", Bottom: "bottom", Top: "top" },
}));

vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => <span data-testid="fa" />,
}));

describe("CharacterNode", () => {
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
});
