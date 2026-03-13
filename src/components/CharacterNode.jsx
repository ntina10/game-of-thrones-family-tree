import React, { useCallback, useEffect } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useUpdateNodeInternals,
} from "@xyflow/react";
import "./CharacterNode.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrown,
  faHand,
  faHandshake,
  faFaceAngry,
} from "@fortawesome/free-solid-svg-icons";
import { toCssClass } from "../utils/toCssClass";

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
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  const houseClass = toCssClass(data.house);
  const isDead = data.tag?.type === "dead";
  const nodeClasses = `character-node ${houseClass} ${isDead ? "is-dead" : ""}`;

  const infoToRender = data.title ? titleInfo[data.title] : null;
  const infoToRen = data.opinion ? opinionInfo[data.opinion] : null;
  const refreshNodeInternals = useCallback(() => {
    if (nodeId) {
      updateNodeInternals(nodeId);
    }
  }, [nodeId, updateNodeInternals]);

  useEffect(() => {
    refreshNodeInternals();
  }, [refreshNodeInternals, data.image, data.name]);

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
        <img
          src={data.image}
          alt={data.name}
          className="character-image"
          loading="lazy"
          decoding="async"
          onLoad={refreshNodeInternals}
          onError={refreshNodeInternals}
        />

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
