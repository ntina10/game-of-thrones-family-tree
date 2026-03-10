import React from "react";
import { Handle, Position } from "@xyflow/react";

const UnionNode = () => {
  return (
    <div
      style={{
        width: "4px",
        height: "4px",
        background: "#555",
        borderRadius: "50%",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ opacity: 0 }}
      />
    </div>
  );
};

export default UnionNode;
