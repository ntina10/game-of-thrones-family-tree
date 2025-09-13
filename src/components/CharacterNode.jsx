import React from "react";
import { Handle, Position } from "reactflow";
import "./CharacterNode.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrown,
  faHand,
  faHandshake,
  faFaceAngry,
} from "@fortawesome/free-solid-svg-icons";

const titleInfo = {
  King: { icon: faCrown, color: "#FFD700" }, // A gold color for the king
  "Hand of the King": { icon: faHand, color: "#f5f0adff" }, // A silver color
  Helper: { icon: faHandshake, color: "#ddbff7ff" }, // An olive green color
};

const opinionInfo = {
  Evil: { icon: faFaceAngry, color: "#8800ffff" }, // A red color for evil
};

// The data prop is passed automatically by React Flow
function CharacterNode({ data }) {
  // We can create a dynamic class string
  const nodeClasses = `character-node ${data.house || ""}`;

  const infoToRender = data.title ? titleInfo[data.title] : null;
  const infoToRen = data.opinion ? opinionInfo[data.opinion] : null;

  return (
    // The main container for our custom node
    <div className={nodeClasses}>
      {/* Handles are the connection points for edges */}
      <Handle type="source" position={Position.Right} id="partner" />
      <Handle type="target" position={Position.Left} id="partner" />

      <Handle type="source" position={Position.Bottom} id="parent" />
      <Handle type="target" position={Position.Top} id="child" />

      <Handle type="source" position={Position.Bottom} id="lover" />
      <Handle type="target" position={Position.Bottom} id="lover" />

      <div className="character-image-container">
        <img src={data.image} alt={data.name} className="character-image" />

        <div className="character-info">
          {infoToRender && (
            <div className={`character-info-item ${data.title}`}>
              <FontAwesomeIcon
                icon={infoToRender.icon}
                size="xl"
                style={{ color: infoToRender.color }}
              />
            </div>
          )}
          {infoToRen && (
            <div className={`character-info-item ${data.opinion}`}>
              <FontAwesomeIcon
                icon={infoToRen.icon}
                size="xl"
                style={{ color: infoToRen.color }}
              />
            </div>
          )}
        </div>
        {data.tag && (
          <div className={`status-tag ${data.tag.type}`}>{data.tag.text}</div>
        )}
      </div>
      <div className="character-name">{data.name}</div>
    </div>
  );
}

export default CharacterNode;
