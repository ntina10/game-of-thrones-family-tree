import React from "react";
import { Handle, Position } from "reactflow";
import "./HouseNode.css";

function HouseNode({ data }) {
  const name = data.label.toUpperCase();
  return (
    <div className="house-node">
      <Handle type="source" position={Position.Bottom} id="parent" />

      <img src={data.image} alt={data.label} />
      <h2> {name} </h2>
    </div>
  );
}

export default HouseNode;
