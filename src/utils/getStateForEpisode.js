import { stateToAbsoluteEpisode } from "./episodeIndex";

export function getStateForEpisode(characterStates = [], currentAbsoluteEpisode) {
  // Find all state changes that have occurred up to the current absolute episode.
  // Supports both the new `{ season, episode, absolute_episode }` schema and the old `{ episode }` (absolute) schema.
  const relevantStates = characterStates
    .map((state) => ({
      state,
      absoluteEpisode: stateToAbsoluteEpisode(state),
    }))
    .filter(
      ({ absoluteEpisode }) =>
        absoluteEpisode !== null && absoluteEpisode <= currentAbsoluteEpisode,
    )
    .sort((a, b) => a.absoluteEpisode - b.absoluteEpisode)
    .map(({ state }) => state);

  // Start with an empty object and merge all relevant states in order.
  // This ensures that later episode changes overwrite earlier ones.
  const activeState = relevantStates.reduce(
    (acc, currentState) => ({ ...acc, ...currentState }),
    {},
  );

  return activeState;
}
