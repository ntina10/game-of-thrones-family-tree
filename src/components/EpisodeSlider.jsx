import React, { useMemo } from "react";
import "./EpisodeSlider.css";
import { seasonEpisodeToAbsolute } from "../utils/episodeIndex";

function EpisodeSlider({
  currentEpisode,
  setCurrentEpisode,
  maxEpisode,
  locked = false,
  updating = false,
}) {
  const handleChange = (event) => {
    setCurrentEpisode(Number(event.target.value));
  };

  const seasonStarts = useMemo(() => {
    const starts = [];

    for (let season = 1; season <= 8; season += 1) {
      const absoluteEpisode = seasonEpisodeToAbsolute(season, 1);
      if (absoluteEpisode === null || absoluteEpisode > maxEpisode) break;

      starts.push({
        season,
        leftPercent:
          maxEpisode <= 1
            ? 0
            : ((absoluteEpisode - 1) / (maxEpisode - 1)) * 100,
      });
    }

    return starts;
  }, [maxEpisode]);

  const displayValue = Math.max(1, Math.min(currentEpisode, maxEpisode));
  const progressPercent =
    maxEpisode <= 1 ? 0 : ((displayValue - 1) / (maxEpisode - 1)) * 100;
  const statusLabel = updating || locked ? "Updating..." : null;

  return (
    <div
      className={`slider-container${locked ? " slider-container--locked" : ""}`}
      style={{ "--slider-progress": `${progressPercent}%` }}
    >
      {statusLabel ? (
        <div className="slider-status" aria-live="polite">
          {statusLabel}
        </div>
      ) : null}

      <div className="slider-season-markers" aria-hidden="true">
        {seasonStarts.map(({ season, leftPercent }) => (
          <div
            key={season}
            className="slider-season-marker"
            style={{ left: `${leftPercent}%` }}
          >
            <span className="slider-season-label">{`S${season}`}</span>
          </div>
        ))}
      </div>

      <input
        id="episode-slider"
        type="range"
        min="1"
        max={maxEpisode}
        step="1"
        value={currentEpisode}
        onChange={handleChange}
        className="slider"
        aria-busy={locked}
        aria-valuetext={`Episode ${currentEpisode}`}
      />
    </div>
  );
}

export default EpisodeSlider;
