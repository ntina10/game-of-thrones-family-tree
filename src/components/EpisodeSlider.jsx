import React from 'react';
import './EpisodeSlider.css'; // We'll create this next

function EpisodeSlider({ currentEpisode, setCurrentEpisode }) {
  const handleChange = (event) => {
    // The value from a range input is a string, so we convert it to a number
    setCurrentEpisode(Number(event.target.value));
  };

  return (
    <div className="slider-container">
      <label htmlFor="episode-slider">Episode: {currentEpisode}</label>
      <input
        id="episode-slider"
        type="range"
        min="1"
        max="10" // For the 10 episodes of Season 1
        value={currentEpisode}
        onChange={handleChange}
        className="slider"
      />
    </div>
  );
}

export default EpisodeSlider;