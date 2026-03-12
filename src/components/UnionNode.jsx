import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRing } from "@fortawesome/free-solid-svg-icons";

const UnionNode = ({ data }) => {
  const relationship = data?.relationship ?? "married";

  return (
    <div
      style={{
        width: "28px",
        height: "28px",
        background: "rgba(255, 250, 240, 0.98)",
        border: "1px solid rgba(154, 115, 47, 0.5)",
        borderRadius: "999px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        color: relationship === "betrothed" ? "#7c5d12" : "#b8860b",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ opacity: 0, top: -3 }}
      />
      <FontAwesomeIcon icon={faRing} size="sm" />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ opacity: 0, bottom: -3 }}
      />
    </div>
  );
};

export default UnionNode;
