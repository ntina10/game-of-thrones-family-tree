import { getStateForEpisode } from "./getStateForEpisode";
import {
  buildNodeIntroMap,
  getEdgeEpisodeStatus,
  isEdgeVisible,
} from "./diagramVisibility";
import { buildLayoutModel, getSemanticLayout } from "./layoutHelper";

function isNodeVisible(node, currentAbsoluteEpisode) {
  if (!node || node.type === "group") return false;

  const currentState = getStateForEpisode(
    node.data?.states || [],
    currentAbsoluteEpisode,
  );

  return Object.keys(currentState).length > 0;
}

function buildVisibleNodes(rawNodes, currentAbsoluteEpisode) {
  const visibleNodeIds = new Set();
  const visibleNodes = [];

  rawNodes.forEach((node) => {
    if (node.type === "group") return;
    if (!isNodeVisible(node, currentAbsoluteEpisode)) return;

    visibleNodeIds.add(node.id);
    visibleNodes.push({
      ...node,
      data: {
        ...node.data,
        ...getStateForEpisode(node.data?.states || [], currentAbsoluteEpisode),
      },
    });
  });

  rawNodes
    .filter((node) => node.type === "group")
    .forEach((groupNode) => {
      const members = Array.isArray(groupNode.data?.members)
        ? groupNode.data.members
        : [];
      const visibleMembers = members.filter((memberId) =>
        visibleNodeIds.has(memberId),
      );

      if (visibleMembers.length === 0) return;

      visibleNodeIds.add(groupNode.id);
      visibleNodes.push({
        ...groupNode,
        selectable: false,
        draggable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        data: {
          ...groupNode.data,
          visibleMembers,
          visibleMemberCount: visibleMembers.length,
        },
      });
    });

  return { visibleNodes, visibleNodeIds };
}

function filterVisibleHouses(visibleNodes) {
  const visibilityModel = buildLayoutModel(visibleNodes, []);
  const visibleHouseIds = new Set();

  visibilityModel.cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      const houseId = visibilityModel.characterHouseById.get(node.id);
      if (houseId) visibleHouseIds.add(houseId);
    });

  visibilityModel.groupNodes.forEach((groupNode) => {
    const houseId = visibilityModel.groupHouseById.get(groupNode.id);
    if (houseId) visibleHouseIds.add(houseId);
  });

  const filteredVisibleNodes = visibleNodes.filter(
    (node) => node.type !== "house" || visibleHouseIds.has(node.id),
  );
  const orderedVisibleHouseIds = filteredVisibleNodes
    .filter((node) => node.type === "house")
    .map((node) => node.id);

  return {
    visibleNodes: filteredVisibleNodes,
    visibleNodeIds: new Set(filteredVisibleNodes.map((node) => node.id)),
    visibleHouseIds: orderedVisibleHouseIds,
  };
}

export function getEpisodeVisibilitySnapshot(rawNodes, currentAbsoluteEpisode) {
  const { visibleNodes: initiallyVisibleNodes } = buildVisibleNodes(
    rawNodes,
    currentAbsoluteEpisode,
  );
  const {
    visibleNodes,
    visibleNodeIds,
    visibleHouseIds,
  } = filterVisibleHouses(initiallyVisibleNodes);
  const visibleCharacterIds = visibleNodes
    .filter((node) => node.type === "character")
    .map((node) => node.id);

  return {
    visibleNodes,
    visibleNodeIds: [...visibleNodeIds],
    visibleHouseIds,
    visibleCharacterIds,
  };
}

export function getVisibleNodeIdsForEpisode(rawNodes, currentAbsoluteEpisode) {
  return getEpisodeVisibilitySnapshot(rawNodes, currentAbsoluteEpisode).visibleNodeIds;
}

export function getVisibleCharacterIdsForEpisode(rawNodes, currentAbsoluteEpisode) {
  return getEpisodeVisibilitySnapshot(
    rawNodes,
    currentAbsoluteEpisode,
  ).visibleCharacterIds;
}

function buildVisibleEdges(rawEdges, rawNodes, visibleNodeIds, currentAbsoluteEpisode) {
  const nodeIntroById = buildNodeIntroMap(rawNodes);
  const nodeHiddenById = Object.fromEntries(
    (rawNodes ?? []).map((node) => [node.id, !visibleNodeIds.has(node.id)]),
  );

  return rawEdges
    .filter((edge) => edge.relationshipType !== "banner")
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .filter((edge) =>
      isEdgeVisible({
        edge,
        currentAbsoluteEpisode,
        nodeIntroById,
        nodeHiddenById,
      }),
    )
    .map((edge) => {
      const status = getEdgeEpisodeStatus(edge, currentAbsoluteEpisode);
      return {
        ...edge,
        data: {
          ...(edge.data ?? {}),
          ...(status.mode === "override" ? status.merged : null),
        },
      };
    });
}

function deriveLineageDepthByCharacter(model) {
  const depthByCharacter = new Map();
  const visiting = new Set();

  const getDepth = (characterId) => {
    if (depthByCharacter.has(characterId)) return depthByCharacter.get(characterId);
    if (visiting.has(characterId)) return 0;

    visiting.add(characterId);
    const parentIds = [...(model.parentIdsByChild.get(characterId) ?? [])];
    const depth =
      parentIds.length === 0
        ? 0
        : Math.min(...parentIds.map((parentId) => getDepth(parentId) + 1));
    visiting.delete(characterId);
    depthByCharacter.set(characterId, depth);
    return depth;
  };

  model.cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => getDepth(node.id));

  return depthByCharacter;
}

function getParentSignature(characterId, parentIdsByChild) {
  const parentIds = [...(parentIdsByChild.get(characterId) ?? [])]
    .filter((parentId) => parentId != null)
    .sort();
  return parentIds.length > 0 ? parentIds.join("::") : null;
}

function pickBannerTargets(candidateNodes, houseId, lineageModel) {
  const explicitBannerMembers = lineageModel.bannerChildrenByHouse?.get(houseId) ?? new Set();
  const explicitTargets = candidateNodes.filter((node) =>
    explicitBannerMembers.has(node.id),
  );

  if (explicitTargets.length > 0) return explicitTargets;

  const siblingTargets = candidateNodes.filter(
    (node) => getParentSignature(node.id, lineageModel.parentIdsByChild) != null,
  );

  if (siblingTargets.length > 0) return siblingTargets;

  return candidateNodes;
}

export function buildSyntheticBannerEdges(model, options = {}) {
  const lineageModel = options.lineageModel ?? model;
  const lineageDepthByCharacter = deriveLineageDepthByCharacter(lineageModel);
  const characterNodes = model.cleanNodes.filter((node) => node.type === "character");

  return model.houses.flatMap((houseNode) => {
    const houseCharacters = characterNodes.filter(
      (node) => model.characterHouseById.get(node.id) === houseNode.id,
    );

    if (houseCharacters.length === 0) return [];

    const resolvedTargets = houseCharacters.filter((node) =>
      model.displayRowByCharacter.has(node.id),
    );

    const targetNodes =
      resolvedTargets.length > 0
        ? (() => {
            const minRow = Math.min(
              ...resolvedTargets.map((node) =>
                model.displayRowByCharacter.get(node.id),
              ),
            );
            return pickBannerTargets(
              resolvedTargets.filter(
                (node) => model.displayRowByCharacter.get(node.id) === minRow,
              ),
              houseNode.id,
              lineageModel,
            );
          })()
        : (() => {
            const minDepth = Math.min(
              ...houseCharacters.map(
                (node) =>
                  lineageDepthByCharacter.get(node.id) ?? Number.POSITIVE_INFINITY,
              ),
            );
            return pickBannerTargets(
              houseCharacters.filter(
                (node) =>
                  (lineageDepthByCharacter.get(node.id) ??
                    Number.POSITIVE_INFINITY) === minDepth,
              ),
              houseNode.id,
              lineageModel,
            );
          })();

    return targetNodes
      .sort((leftNode, rightNode) => leftNode._layoutOrder - rightNode._layoutOrder)
      .map((targetNode) => ({
        id: `auto-banner-${houseNode.id}-${targetNode.id}`,
        source: houseNode.id,
        sourceHandle: "parent",
        target: targetNode.id,
        targetHandle: "child",
        relationshipType: "banner",
        data: {
          runtimeDerived: true,
        },
      }));
  });
}

export function getVisibleHouseIdsForEpisode(rawNodes, currentAbsoluteEpisode) {
  return getEpisodeVisibilitySnapshot(rawNodes, currentAbsoluteEpisode).visibleHouseIds;
}

export function buildEpisodeSubgraph(
  rawNodes,
  rawEdges,
  currentAbsoluteEpisode,
  options = {},
) {
  const fullModel = buildLayoutModel(rawNodes, rawEdges, {
    orderedHouseIds: options.orderedHouseIds,
  });
  const {
    visibleNodes,
    visibleNodeIds,
    visibleHouseIds,
  } = getEpisodeVisibilitySnapshot(rawNodes, currentAbsoluteEpisode);
  const visibleEdges = buildVisibleEdges(
    rawEdges,
    rawNodes,
    new Set(visibleNodeIds),
    currentAbsoluteEpisode,
  );
  const firstPassModel = buildLayoutModel(visibleNodes, visibleEdges, {
    orderedHouseIds: options.orderedHouseIds,
    generationOverrideByCharacter: fullModel.derivedGenerationByCharacter,
    bannerChildrenByHouse: fullModel.bannerChildrenByHouse,
  });
  const bannerEdges = buildSyntheticBannerEdges(firstPassModel, {
    lineageModel: fullModel,
  });

  return {
    visibleNodes,
    visibleNodeIds: [...visibleNodeIds],
    visibleHouseIds,
    visibleEdges,
    bannerEdges,
    edges: [...visibleEdges, ...bannerEdges],
  };
}

export async function buildEpisodeGraph(
  rawNodes,
  rawEdges,
  currentAbsoluteEpisode,
  options = {},
) {
  const fullModel = buildLayoutModel(rawNodes, rawEdges, {
    orderedHouseIds: options.orderedHouseIds,
  });
  const { visibleNodes, visibleNodeIds, edges } = buildEpisodeSubgraph(
    rawNodes,
    rawEdges,
    currentAbsoluteEpisode,
    options,
  );

  return getSemanticLayout(visibleNodes, edges, {
    visibleNodeIds,
    orderedHouseIds: options.orderedHouseIds,
    fixedHouseCoreWidthById: options.fixedHouseCoreWidthById,
    generationOverrideByCharacter: fullModel.derivedGenerationByCharacter,
    bannerChildrenByHouse: fullModel.bannerChildrenByHouse,
  });
}
