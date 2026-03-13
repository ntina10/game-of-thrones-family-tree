import React, { useCallback, useEffect } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
} from "@xyflow/react";
import "./HouseNode.css";

function HouseNode({ data }) {
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  const name = data.label.toUpperCase();
  const refreshNodeInternals = useCallback(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [nodeId, updateNodeInternals]);

  useEffect(() => {
    let active = true;

    refreshNodeInternals();

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          if (active) refreshNodeInternals();
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [refreshNodeInternals, data.image, data.label]);

  return (
    <div className="house-node">
      <Handle type="source" position={Position.Bottom} id="parent" />

      <img
        src={data.image}
        alt={data.label}
        loading="lazy"
        decoding="async"
        onLoad={refreshNodeInternals}
        onError={refreshNodeInternals}
      />
      <h2> {name} </h2>
    </div>
  );
}

export default HouseNode;
