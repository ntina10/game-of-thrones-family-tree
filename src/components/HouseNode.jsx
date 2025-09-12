import React from 'react';
// import { Handle, Position } from 'reactflow';
// import './HouseNode.css';

function HouseNode({data}) {
    return (
        <div className='house-node'>
            <img src={data.image} alt={data.label} />
            <h2>
            {data.label}
            </h2>
        </div>
    );
}

export default HouseNode;