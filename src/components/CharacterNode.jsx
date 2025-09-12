import React from 'react';
import { Handle, Position } from 'reactflow';
import './CharacterNode.css';

// The data prop is passed automatically by React Flow
function CharacterNode({ data }) {
  // We can create a dynamic class string
  const nodeClasses = `character-node ${data.house || ''}`;

  return (
    // The main container for our custom node
    <div className={nodeClasses}>
        {/* Handles are the connection points for edges */}
        <Handle type="source" position={Position.Right} id="partner"/>
        <Handle type="target" position={Position.Left} id="partner"/>

        <Handle type="source" position={Position.Bottom} id="parent"/>
        <Handle type="target" position={Position.Top} id="child"/>

        <div className='character-image-container'>
          <img src={data.image} alt={data.name} className="character-image" />
          {data.tag && (
            <div className={`status-tag ${data.tag.type}`}>
              {data.tag.text}
            </div>
          )}
        </div>
        <div className="character-name">{data.name}</div>


    </div>
  );
}

export default CharacterNode;