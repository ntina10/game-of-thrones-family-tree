import React from "react";
import "./GroupNode.css";

function GroupNode({ data }) {
  const layoutBox = data?.layoutBox ?? {};
  const width = layoutBox.width ?? 280;
  const height = layoutBox.height ?? 160;
  const titleHeight = layoutBox.titleHeight ?? 42;
  const contentInset = layoutBox.padding ?? 18;

  return (
    <div
      className="group-node"
      style={{
        width,
        height,
      }}
    >
      <div
        className="group-node__title"
        style={{ height: titleHeight }}
      >
        {data.label}
      </div>
      <div
        className="group-node__content"
        style={{
          top: titleHeight,
          left: contentInset,
          right: contentInset,
          bottom: contentInset,
        }}
      />
    </div>
  );
}

export default GroupNode;
