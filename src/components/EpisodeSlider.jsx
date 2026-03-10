import React from 'react';
import './EpisodeSlider.css'; // We'll create this next
import { absoluteToSeasonEpisode } from "../utils/episodeIndex";

function EpisodeSlider({ currentEpisode, setCurrentEpisode, maxEpisode }) {
  const handleChange = (event) => {
    // The value from a range input is a string, so we convert it to a number
    setCurrentEpisode(Number(event.target.value));
  };

  const se = absoluteToSeasonEpisode(currentEpisode);
  const label = se
    ? `Season ${se.season}, Episode ${se.episode} (#${currentEpisode})`
    : `Episode #${currentEpisode}`;

  return (
    <div className="slider-container">
      <label htmlFor="episode-slider">{label}</label>
      <input
        id="episode-slider"
        type="range"
        min="1"
        max={maxEpisode}
        step="1"
        value={currentEpisode}
        onChange={handleChange}
        className="slider"
      />
    </div>
  );
}

export default EpisodeSlider;
