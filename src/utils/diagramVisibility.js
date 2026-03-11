import { stateToAbsoluteEpisode } from "./episodeIndex";
import { getStateForEpisode } from "./getStateForEpisode";

export function getIntroAbsoluteEpisode(states) {
  if (!Array.isArray(states) || states.length === 0) return null;
  let min = Infinity;
  for (const state of states) {
    const abs = stateToAbsoluteEpisode(state);
    if (abs !== null && abs < min) min = abs;
  }
  return Number.isFinite(min) ? min : null;
}

export function buildNodeIntroMap(nodes) {
  const introById = {};
  for (const node of nodes ?? []) {
    introById[node.id] = getIntroAbsoluteEpisode(node?.data?.states);
  }
  return introById;
}

function getLastRelevantState(states, currentAbsoluteEpisode) {
  if (!Array.isArray(states) || states.length === 0) return null;
  const relevant = states
    .map((state) => ({ state, abs: stateToAbsoluteEpisode(state) }))
    .filter(({ abs }) => abs !== null && abs <= currentAbsoluteEpisode)
    .sort((a, b) => a.abs - b.abs);
  return relevant.length ? relevant[relevant.length - 1].state : null;
}

export function getEdgeEpisodeStatus(edge, currentAbsoluteEpisode) {
  const states = edge?.data?.states;
  if (!Array.isArray(states) || states.length === 0) {
    return { mode: "default", introduced: null, active: null, merged: null };
  }

  const merged = getStateForEpisode(states, currentAbsoluteEpisode);
  const last = getLastRelevantState(states, currentAbsoluteEpisode);
  const introduced = last !== null;
  const active = introduced ? last.active !== false : false;

  return { mode: "override", introduced, active, merged };
}

export function isEdgeVisible({
  edge,
  currentAbsoluteEpisode,
  nodeIntroById,
  nodeHiddenById,
}) {
  if (!edge) return false;
  if (nodeHiddenById?.[edge.source] || nodeHiddenById?.[edge.target]) {
    return false;
  }

  const status = getEdgeEpisodeStatus(edge, currentAbsoluteEpisode);
  if (status.mode === "override") {
    return status.introduced && status.active;
  }

  const sourceIntro = nodeIntroById?.[edge.source];
  const targetIntro = nodeIntroById?.[edge.target];
  if (sourceIntro === null || targetIntro === null) return false;

  return currentAbsoluteEpisode >= Math.max(sourceIntro, targetIntro);
}

