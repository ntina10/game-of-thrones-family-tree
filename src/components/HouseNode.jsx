import React from 'react';
import './HouseNode.css';

function HouseNode({data}) {
    const name = data.label.toUpperCase();
    return (
        <div className='house-node'>
            <img src={data.image} alt={data.label} />
            <h2> {name} </h2>
        </div>
    );
}

export default HouseNode;