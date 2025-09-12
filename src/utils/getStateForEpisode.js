export function getStateForEpisode(characterStates = [], currentEpisode) {
  // Find all state changes that have occurred up to the current episode
  const relevantStates = characterStates.filter(
    (state) => state.episode <= currentEpisode
  );

  // Start with an empty object and merge all relevant states in order.
  // This ensures that later episode changes overwrite earlier ones.
  const activeState = relevantStates.reduce(
    (acc, currentState) => ({ ...acc, ...currentState }),
    {}
  );

  return activeState;
}