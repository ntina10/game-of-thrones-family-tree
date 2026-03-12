const DEFAULT_SIZES = {
  house: { width: 250, height: 190 },
  character: { width: 170, height: 210 },
  union: { width: 28, height: 28 },
  group: { width: 320, height: 180 },
};

const SPACING = {
  canvasPaddingX: 40,
  canvasPaddingY: 12,
  territoryPadding: 40,
  territoryGap: 72,
  coreLaneMinWidth: 250,
  bannerToContentGap: 206,
  rowGap: 170,
  cardGap: 36,
  partnerGap: 48,
  satelliteGap: 32,
  unionOffsetY: 42,
  groupGap: 42,
  groupPadding: 18,
  groupTitleHeight: 44,
};

const HOUSE_AFFINITY_ALIASES = {
  Sand: "house_martell",
};

function getNodeLayout(node) {
  return node?.data?.layout ?? {};
}

function getNodeSize(node) {
  const layout = getNodeLayout(node);
  const explicitWidth = Number(layout.width ?? node?.width);
  const explicitHeight = Number(layout.height ?? node?.height);

  if (Number.isFinite(explicitWidth) && Number.isFinite(explicitHeight)) {
    return { width: explicitWidth, height: explicitHeight };
  }

  return { ...(DEFAULT_SIZES[node?.type] ?? DEFAULT_SIZES.character) };
}

function resolveHouseId(value, houseIdByName) {
  if (!value) return null;
  return houseIdByName.get(value) ?? value;
}

function resolveCharacterHouseId(node, houseIdByName) {
  const layout = getNodeLayout(node);
  const explicitHouse =
    resolveHouseId(layout.houseAffinity, houseIdByName) ??
    resolveHouseId(node.data?.house, houseIdByName);

  if (explicitHouse && houseIdByName.has(explicitHouse)) {
    return explicitHouse;
  }

  const alias = HOUSE_AFFINITY_ALIASES[node.data?.house];
  return resolveHouseId(alias, houseIdByName) ?? explicitHouse;
}

function isVisualRelationship(edge) {
  return (
    edge.relationshipType === "visual_only" ||
    edge.relationshipType === "lover" ||
    edge.sourceHandle === "lover" ||
    edge.targetHandle === "lover"
  );
}

function edgeAffectsLayout(edge, nodeById) {
  const explicit = edge.data?.layout?.affectsLayout;
  if (typeof explicit === "boolean") return explicit;
  if (isVisualRelationship(edge)) return false;
  if (edge.relationshipType === "partner_overlay") return false;

  const unionNode = nodeById.get(edge.target);
  if (
    unionNode?.type === "union" &&
    unionNode.data?.layout?.freezePosition === true
  ) {
    return false;
  }

  return true;
}

function getCharacterImportance(node, participatesInStructure) {
  const layout = getNodeLayout(node);

  if (layout.importance) return layout.importance;
  if (layout.preserveAnchor) return "primary";
  if (participatesInStructure) return "secondary";
  return "satellite";
}

function getGenerationSeed(node) {
  const layout = getNodeLayout(node);

  if (Number.isFinite(layout.generationSeed)) return Number(layout.generationSeed);
  if (Number.isFinite(layout.generation)) return Number(layout.generation);

  return null;
}

function addWeightedConnection(weightMap, leftId, rightId, weight) {
  if (!leftId || !rightId || leftId === rightId) return;
  const pair = [leftId, rightId].sort().join("::");
  weightMap.set(pair, (weightMap.get(pair) ?? 0) + weight);
}

function scoreHouseOrder(order, weightMap, originalIndex) {
  const positionByHouse = new Map(order.map((houseId, index) => [houseId, index]));
  let score = 0;

  weightMap.forEach((weight, pair) => {
    const [leftId, rightId] = pair.split("::");
    score +=
      weight * Math.abs(positionByHouse.get(leftId) - positionByHouse.get(rightId));
  });

  order.forEach((houseId, index) => {
    score += Math.abs(index - originalIndex.get(houseId)) * 0.25;
  });

  return score;
}

function optimizeHouseOrder(houseIds, weightMap) {
  const originalIndex = new Map(houseIds.map((houseId, index) => [houseId, index]));
  let order = [...houseIds];
  let improved = true;

  while (improved) {
    improved = false;

    for (let index = 0; index < order.length - 1; index += 1) {
      const candidate = [...order];
      [candidate[index], candidate[index + 1]] = [
        candidate[index + 1],
        candidate[index],
      ];

      if (
        scoreHouseOrder(candidate, weightMap, originalIndex) <
        scoreHouseOrder(order, weightMap, originalIndex)
      ) {
        order = candidate;
        improved = true;
      }
    }
  }

  return order;
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null))];
}

function getMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function getGroupMembers(groupNode) {
  return Array.isArray(groupNode?.data?.members) ? groupNode.data.members : [];
}

function getVisibleGroupMembers(groupNode, visibleNodeIdSet) {
  const members = getGroupMembers(groupNode);
  if (!(visibleNodeIdSet instanceof Set) || visibleNodeIdSet.size === 0) {
    return members;
  }
  return members.filter((memberId) => visibleNodeIdSet.has(memberId));
}

function getGroupLayoutMetrics(groupNode, visibleMembers) {
  const layout = getNodeLayout(groupNode);
  const memberCount = visibleMembers.length;
  const memberColumns = Math.max(
    1,
    Number(layout.memberColumns) || 3,
  );
  const padding = Math.max(12, Number(layout.padding) || SPACING.groupPadding);
  const titleHeight = Math.max(
    36,
    Number(layout.titleHeight) || SPACING.groupTitleHeight,
  );
  const columnCount = memberCount > 0 ? Math.min(memberColumns, memberCount) : 1;
  const rowCount = memberCount > 0 ? Math.ceil(memberCount / columnCount) : 1;
  const contentWidth =
    columnCount * DEFAULT_SIZES.character.width +
    Math.max(0, columnCount - 1) * SPACING.cardGap;
  const contentHeight =
    rowCount * DEFAULT_SIZES.character.height +
    Math.max(0, rowCount - 1) * SPACING.satelliteGap;
  const width = Math.max(
    Number(layout.width) || DEFAULT_SIZES.group.width,
    contentWidth + padding * 2,
  );
  const height = Math.max(
    Number(layout.height) || DEFAULT_SIZES.group.height,
    titleHeight + contentHeight + padding * 2,
  );

  return {
    width,
    height,
    titleHeight,
    padding,
    memberColumns: columnCount,
    rowCount,
    contentWidth,
    contentHeight,
  };
}

function sortFallbackNodes(nodes, childEdgesByTarget) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const depthByNode = new Map();

  const getDepth = (nodeId, visiting = new Set()) => {
    if (depthByNode.has(nodeId)) return depthByNode.get(nodeId);
    if (visiting.has(nodeId)) return 0;

    visiting.add(nodeId);
    const parentEdges = (childEdgesByTarget.get(nodeId) ?? []).filter((edge) =>
      nodeIds.has(edge.source),
    );
    const depth =
      parentEdges.length === 0
        ? 0
        : Math.max(
            ...parentEdges.map((edge) => getDepth(edge.source, visiting) + 1),
          );
    visiting.delete(nodeId);
    depthByNode.set(nodeId, depth);
    return depth;
  };

  nodes.forEach((node) => {
    getDepth(node.id);
  });

  return [...nodes].sort((leftNode, rightNode) => {
    const leftDepth = depthByNode.get(leftNode.id) ?? 0;
    const rightDepth = depthByNode.get(rightNode.id) ?? 0;

    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    return leftNode._layoutOrder - rightNode._layoutOrder;
  });
}

function getHouseIndex(houseId, orderedHouseIds) {
  return orderedHouseIds.indexOf(houseId);
}

function sortRowNodes(
  rowNodes,
  houseId,
  orderedHouseIds,
  primaryPartnerHouseIdsByCharacter,
) {
  const houseIndex = getHouseIndex(houseId, orderedHouseIds);

  return [...rowNodes].sort((leftNode, rightNode) => {
    const leftPartnerHouses =
      primaryPartnerHouseIdsByCharacter.get(leftNode.id) ?? [];
    const rightPartnerHouses =
      primaryPartnerHouseIdsByCharacter.get(rightNode.id) ?? [];

    const leftHasLeft = leftPartnerHouses.some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) < houseIndex,
    );
    const rightHasLeft = rightPartnerHouses.some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) < houseIndex,
    );
    const leftHasRight = leftPartnerHouses.some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) > houseIndex,
    );
    const rightHasRight = rightPartnerHouses.some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) > houseIndex,
    );

    if (leftHasLeft !== rightHasLeft) return leftHasLeft ? -1 : 1;
    if (leftHasRight !== rightHasRight) return leftHasRight ? 1 : -1;

    return leftNode._layoutOrder - rightNode._layoutOrder;
  });
}

function getRowStartX(
  placement,
  totalWidth,
  houseId,
  orderedHouseIds,
  rowNodes,
  primaryPartnerHouseIdsByCharacter,
  targetCenterX,
) {
  const houseIndex = getHouseIndex(houseId, orderedHouseIds);
  const hasLeftCouple = rowNodes.some((node) =>
    (primaryPartnerHouseIdsByCharacter.get(node.id) ?? []).some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) < houseIndex,
    ),
  );
  const hasRightCouple = rowNodes.some((node) =>
    (primaryPartnerHouseIdsByCharacter.get(node.id) ?? []).some(
      (partnerHouseId) => getHouseIndex(partnerHouseId, orderedHouseIds) > houseIndex,
    ),
  );

  if (hasLeftCouple && !hasRightCouple) return placement.coreLeft;
  if (hasRightCouple && !hasLeftCouple) return placement.coreRight - totalWidth;

  const preferredStart = targetCenterX - totalWidth / 2;
  return Math.min(
    placement.coreRight - totalWidth,
    Math.max(placement.coreLeft, preferredStart),
  );
}

function addToSetMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function buildCharacterLineage({
  childEdges,
  bannerEdges,
  nodeById,
  partnerEdgesByUnion,
}) {
  const childIdsByParent = new Map();
  const parentIdsByChild = new Map();
  const bannerChildrenByHouse = new Map();

  bannerEdges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (sourceNode?.type !== "house" || targetNode?.type !== "character") return;

    addToSetMap(bannerChildrenByHouse, sourceNode.id, targetNode.id);
  });

  childEdges.forEach((edge) => {
    const targetNode = nodeById.get(edge.target);
    if (targetNode?.type !== "character") return;

    const sourceNode = nodeById.get(edge.source);
    if (!sourceNode) return;

    let parentIds = [];

    if (sourceNode.type === "character") {
      parentIds = [sourceNode.id];
    } else if (sourceNode.type === "union") {
      parentIds = unique(
        (partnerEdgesByUnion.get(sourceNode.id) ?? []).map(
          (partnerEdge) => partnerEdge.source,
        ),
      );
    }

    parentIds.forEach((parentId) => {
      const parentNode = nodeById.get(parentId);
      if (parentNode?.type !== "character") return;

      addToSetMap(childIdsByParent, parentId, targetNode.id);
      addToSetMap(parentIdsByChild, targetNode.id, parentId);
    });
  });

  return { childIdsByParent, parentIdsByChild, bannerChildrenByHouse };
}

function deriveCharacterGenerations({
  characterNodes,
  childIdsByParent,
  parentIdsByChild,
  bannerChildrenByHouse,
  partnerEdgesByUnion,
  primaryUnionIds,
  nodeById,
}) {
  const explicitGenerationByCharacter = new Map();
  const derivedGenerationByCharacter = new Map();
  const conflicts = [];
  const queue = [];

  characterNodes.forEach((node) => {
    const seed = getGenerationSeed(node);
    if (!Number.isFinite(seed)) return;

    explicitGenerationByCharacter.set(node.id, seed);
    derivedGenerationByCharacter.set(node.id, seed);
    queue.push(node.id);
  });

  const assignGeneration = (characterId, generation, reason) => {
    const explicitGeneration = explicitGenerationByCharacter.get(characterId);
    if (explicitGeneration != null) {
      if (explicitGeneration !== generation) {
        conflicts.push({
          characterId,
          expected: explicitGeneration,
          received: generation,
          reason,
          explicit: true,
        });
      }
      return false;
    }

    const existing = derivedGenerationByCharacter.get(characterId);
    if (existing == null) {
      derivedGenerationByCharacter.set(characterId, generation);
      queue.push(characterId);
      return true;
    }

    if (existing !== generation) {
      conflicts.push({
        characterId,
        expected: existing,
        received: generation,
        reason,
        explicit: false,
      });
    }

    return false;
  };

  const processLineageQueue = () => {
    let changed = false;

    while (queue.length > 0) {
      const characterId = queue.shift();
      const generation = derivedGenerationByCharacter.get(characterId);

      (childIdsByParent.get(characterId) ?? []).forEach((childId) => {
        changed =
          assignGeneration(childId, generation + 1, {
            type: "child",
            sourceId: characterId,
          }) || changed;
      });

      (parentIdsByChild.get(characterId) ?? []).forEach((parentId) => {
        changed =
          assignGeneration(parentId, generation - 1, {
            type: "parent",
            sourceId: characterId,
          }) || changed;
      });
    }

    return changed;
  };

  const isMarriedUnion = (unionNode) =>
    unionNode?.data?.relationship === "married" ||
    unionNode?.data?.layout?.primary !== false;

  processLineageQueue();

  let progress = true;
  while (progress) {
    progress = false;

    bannerChildrenByHouse.forEach((characterIds, houseId) => {
      const resolvedGenerations = [...characterIds]
        .map((characterId) => derivedGenerationByCharacter.get(characterId))
        .filter((generation) => generation != null);

      if (resolvedGenerations.length === 0) return;

      const candidateGeneration = Math.round(getMedian(resolvedGenerations));
      [...characterIds]
        .filter((characterId) => !derivedGenerationByCharacter.has(characterId))
        .forEach((characterId) => {
          progress =
            assignGeneration(characterId, candidateGeneration, {
              type: "banner",
              sourceId: houseId,
            }) || progress;
        });
    });

    primaryUnionIds.forEach((unionId) => {
      const unionNode = nodeById.get(unionId);
      if (!isMarriedUnion(unionNode)) return;

      const partnerIds = unique(
        (partnerEdgesByUnion.get(unionId) ?? []).map((edge) => edge.source),
      );
      const resolvedPartners = partnerIds.filter((partnerId) =>
        derivedGenerationByCharacter.has(partnerId),
      );
      const unresolvedPartners = partnerIds.filter(
        (partnerId) => !derivedGenerationByCharacter.has(partnerId),
      );

      if (resolvedPartners.length === 0 || unresolvedPartners.length === 0) return;

      const resolvedGenerations = resolvedPartners.map((partnerId) =>
        derivedGenerationByCharacter.get(partnerId),
      );
      const candidateGeneration = Math.round(getMedian(resolvedGenerations));

      unresolvedPartners.forEach((partnerId) => {
        progress =
          assignGeneration(partnerId, candidateGeneration, {
            type: "spouse",
            sourceId: unionId,
          }) || progress;
      });
    });

    if (progress) {
      processLineageQueue();
    }
  }

  return {
    explicitGenerationByCharacter,
    derivedGenerationByCharacter,
    conflicts,
  };
}

export function buildLayoutModel(initialNodes, initialEdges) {
  const cleanNodes = initialNodes.map((node, index) => {
    const nextNode = { ...node };
    delete nextNode.parentId;
    return { ...nextNode, _layoutOrder: index };
  });

  const nodeById = new Map(cleanNodes.map((node) => [node.id, node]));
  const houses = cleanNodes.filter((node) => node.type === "house");
  const characterNodes = cleanNodes.filter((node) => node.type === "character");
  const groupNodes = cleanNodes.filter((node) => node.type === "group");
  const houseIdByName = new Map();

  houses.forEach((house) => {
    houseIdByName.set(house.id, house.id);
    if (house.data?.house) houseIdByName.set(house.data.house, house.id);
    if (house.data?.label) houseIdByName.set(house.data.label, house.id);
  });

  const structuralEdges = initialEdges.filter((edge) =>
    edgeAffectsLayout(edge, nodeById),
  );
  const bannerEdges = structuralEdges.filter(
    (edge) =>
      edge.relationshipType === "banner" &&
      nodeById.get(edge.source)?.type === "house" &&
      nodeById.get(edge.target)?.type === "character",
  );
  const childEdges = structuralEdges.filter(
    (edge) =>
      edge.relationshipType === "child" &&
      nodeById.get(edge.target)?.type !== "house",
  );
  const partnerEdges = structuralEdges.filter(
    (edge) => edge.relationshipType === "partner",
  );

  const structuralParticipation = new Set();
  structuralEdges.forEach((edge) => {
    if (nodeById.get(edge.source)?.type === "character") {
      structuralParticipation.add(edge.source);
    }
    if (nodeById.get(edge.target)?.type === "character") {
      structuralParticipation.add(edge.target);
    }
  });

  const characterHouseById = new Map();
  characterNodes.forEach((node) => {
    characterHouseById.set(node.id, resolveCharacterHouseId(node, houseIdByName));
  });

  const groupHouseById = new Map();
  const groupMembershipByCharacter = new Map();
  groupNodes.forEach((node) => {
    const houseId = resolveHouseId(node.data?.houseAffinity, houseIdByName);
    groupHouseById.set(node.id, houseId);

    getGroupMembers(node).forEach((characterId) => {
      if (!groupMembershipByCharacter.has(characterId)) {
        groupMembershipByCharacter.set(characterId, node.id);
      }
    });
  });

  const partnerEdgesByUnion = new Map();
  partnerEdges.forEach((edge) => {
    const unionNode = nodeById.get(edge.target);
    if (unionNode?.type !== "union") return;

    if (!partnerEdgesByUnion.has(edge.target)) {
      partnerEdgesByUnion.set(edge.target, []);
    }

    partnerEdgesByUnion.get(edge.target).push(edge);
  });

  const primaryUnionIds = new Set();
  partnerEdgesByUnion.forEach((edges, unionId) => {
    const unionNode = nodeById.get(unionId);
    if (unionNode?.data?.layout?.primary !== false) {
      primaryUnionIds.add(unionId);
    }
  });

  const houseConnectionWeights = new Map();
  partnerEdgesByUnion.forEach((edges, unionId) => {
    if (!primaryUnionIds.has(unionId)) return;
    const partnerHouses = unique(
      edges.map((edge) => characterHouseById.get(edge.source)),
    );

    if (partnerHouses.length >= 2) {
      addWeightedConnection(
        houseConnectionWeights,
        partnerHouses[0],
        partnerHouses[1],
        6,
      );
    }
  });

  const orderedHouseIds = optimizeHouseOrder(
    houses.map((house) => house.id),
    houseConnectionWeights,
  );

  const { childIdsByParent, parentIdsByChild, bannerChildrenByHouse } = buildCharacterLineage({
    childEdges,
    bannerEdges,
    nodeById,
    partnerEdgesByUnion,
  });

  const {
    explicitGenerationByCharacter,
    derivedGenerationByCharacter,
    conflicts,
  } = deriveCharacterGenerations({
    characterNodes,
    childIdsByParent,
    parentIdsByChild,
    bannerChildrenByHouse,
    partnerEdgesByUnion,
    primaryUnionIds,
    nodeById,
  });

  const characterImportance = new Map();
  const resolvedGenerationByHouse = new Map();

  characterNodes.forEach((node) => {
    const importance = getCharacterImportance(
      node,
      structuralParticipation.has(node.id),
    );
    characterImportance.set(node.id, importance);

    const houseId = characterHouseById.get(node.id);
    const generation = derivedGenerationByCharacter.get(node.id);

    if (!houseId || generation == null) return;
    if (!resolvedGenerationByHouse.has(houseId)) {
      resolvedGenerationByHouse.set(houseId, []);
    }
    resolvedGenerationByHouse.get(houseId).push(generation);
  });

  const resolvedGenerations = [...derivedGenerationByCharacter.values()];
  const minResolvedGeneration =
    resolvedGenerations.length > 0 ? Math.min(...resolvedGenerations) : 0;
  const generationShift = minResolvedGeneration < 0 ? -minResolvedGeneration : 0;

  const displayRowByCharacter = new Map();
  characterNodes.forEach((node) => {
    const generation = derivedGenerationByCharacter.get(node.id);
    if (generation == null) return;
    displayRowByCharacter.set(node.id, generation + generationShift);
  });

  const unresolvedCharacters = new Set(
    characterNodes
      .filter((node) => !displayRowByCharacter.has(node.id))
      .map((node) => node.id),
  );

  const fallbackGenerationByCharacter = new Map();
  unresolvedCharacters.forEach((characterId) => {
    const houseId = characterHouseById.get(characterId);
    const medianGeneration = houseId
      ? getMedian(resolvedGenerationByHouse.get(houseId) ?? [0])
      : 0;
    fallbackGenerationByCharacter.set(characterId, medianGeneration);
  });

  const displayRowByUnion = new Map();
  primaryUnionIds.forEach((unionId) => {
    const partnerRows = (partnerEdgesByUnion.get(unionId) ?? [])
      .map((edge) => displayRowByCharacter.get(edge.source))
      .filter((value) => value != null);

    displayRowByUnion.set(
      unionId,
      partnerRows.length > 0 ? Math.max(...partnerRows) : generationShift,
    );
  });

  return {
    cleanNodes,
    structuralEdges,
    childEdges,
    nodeById,
    houses,
    groupNodes,
    orderedHouseIds,
    characterHouseById,
    groupHouseById,
    groupMembershipByCharacter,
    characterImportance,
    explicitGenerationByCharacter,
    derivedGenerationByCharacter,
    displayRowByCharacter,
    unresolvedCharacters,
    fallbackGenerationByCharacter,
    displayRowByUnion,
    partnerEdgesByUnion,
    primaryUnionIds,
    childIdsByParent,
    parentIdsByChild,
    bannerChildrenByHouse,
    conflicts,
  };
}

function buildHousePlacement(model, visibleNodeIdSet) {
  const {
    houses,
    groupNodes,
    orderedHouseIds,
    cleanNodes,
    characterHouseById,
    groupHouseById,
    groupMembershipByCharacter,
    characterImportance,
    displayRowByCharacter,
    unresolvedCharacters,
  } = model;
  const houseById = new Map(houses.map((house) => [house.id, house]));
  const placements = new Map();
  let cursorX = SPACING.canvasPaddingX + SPACING.territoryPadding;

  orderedHouseIds.forEach((houseId) => {
    const houseNode = houseById.get(houseId);
    const bannerSize = getNodeSize(houseNode);
    const coreNodes = cleanNodes.filter(
      (node) =>
        node.type === "character" &&
        characterHouseById.get(node.id) === houseId &&
        !groupMembershipByCharacter.has(node.id) &&
        characterImportance.get(node.id) !== "satellite" &&
        displayRowByCharacter.has(node.id),
    );
    const fallbackNodes = cleanNodes.filter(
      (node) =>
        node.type === "character" &&
        characterHouseById.get(node.id) === houseId &&
        !groupMembershipByCharacter.has(node.id) &&
        (characterImportance.get(node.id) === "satellite" ||
          unresolvedCharacters.has(node.id)),
    );
    const groupWidth = Math.max(
      0,
      ...groupNodes
        .filter((node) => groupHouseById.get(node.id) === houseId)
        .map((node) => {
          const visibleMembers = getVisibleGroupMembers(node, visibleNodeIdSet);
          if (visibleMembers.length === 0) return 0;
          return getGroupLayoutMetrics(node, visibleMembers).width;
        }),
    );
    const rowCountByDisplay = new Map();

    coreNodes.forEach((node) => {
      const displayRow = displayRowByCharacter.get(node.id) ?? 0;
      rowCountByDisplay.set(
        displayRow,
        (rowCountByDisplay.get(displayRow) ?? 0) + 1,
      );
    });

    const maxRowWidth = Math.max(
      0,
      ...[...rowCountByDisplay.values()].map(
        (count) =>
          count * DEFAULT_SIZES.character.width +
          Math.max(0, count - 1) * SPACING.cardGap,
      ),
    );
    const fallbackCols =
      fallbackNodes.length >= 3 ? 3 : Math.max(1, fallbackNodes.length);
    const fallbackWidth =
      fallbackNodes.length > 0
        ? fallbackCols * DEFAULT_SIZES.character.width +
          Math.max(0, fallbackCols - 1) * SPACING.satelliteGap
        : 0;
    const coreWidth = Math.max(
      SPACING.coreLaneMinWidth,
      bannerSize.width + SPACING.cardGap,
      maxRowWidth,
      fallbackWidth,
      groupWidth,
    );
    const territoryLeft = cursorX - SPACING.territoryPadding;
    const territoryWidth = SPACING.territoryPadding * 2 + coreWidth;

    placements.set(houseId, {
      houseId,
      left: territoryLeft,
      width: territoryWidth,
      coreLeft: cursorX,
      coreRight: cursorX + coreWidth,
      coreWidth,
      coreCenterX: cursorX + coreWidth / 2,
    });

    cursorX += coreWidth + SPACING.territoryGap;
  });

  return placements;
}

export async function getSemanticLayout(initialNodes, initialEdges, options = {}) {
  const model = buildLayoutModel(initialNodes, initialEdges);
  const visibleNodeIdSet = new Set(options.visibleNodeIds ?? []);
  const housePlacement = buildHousePlacement(model, visibleNodeIdSet);
  const {
    cleanNodes,
    houses,
    groupNodes,
    nodeById,
    orderedHouseIds,
    characterHouseById,
    groupHouseById,
    groupMembershipByCharacter,
    displayRowByCharacter,
    displayRowByUnion,
    childEdges,
    characterImportance,
    partnerEdgesByUnion,
    primaryUnionIds,
    unresolvedCharacters,
  } = model;

  const positionedNodes = new Map();
  const primaryPartnerHouseIdsByCharacter = new Map();
  const childEdgesByTarget = new Map();
  const rowTop = (displayRow) =>
    SPACING.canvasPaddingY +
    DEFAULT_SIZES.house.height +
    SPACING.bannerToContentGap +
    displayRow * (DEFAULT_SIZES.character.height + SPACING.rowGap);

  childEdges.forEach((edge) => {
    if (!childEdgesByTarget.has(edge.target)) {
      childEdgesByTarget.set(edge.target, []);
    }
    childEdgesByTarget.get(edge.target).push(edge);
  });

  houses.forEach((house) => {
    const placement = housePlacement.get(house.id);
    const bannerSize = getNodeSize(house);

    positionedNodes.set(house.id, {
      ...house,
      position: {
        x: placement.coreCenterX - bannerSize.width / 2,
        y: SPACING.canvasPaddingY,
      },
    });
  });

  primaryUnionIds.forEach((unionId) => {
    const partnerEntries = partnerEdgesByUnion.get(unionId) ?? [];
    const partnerIds = unique(partnerEntries.map((edge) => edge.source));

    partnerIds.forEach((characterId) => {
      const otherHouseIds = unique(
        partnerIds
          .filter((otherId) => otherId !== characterId)
          .map((otherId) => characterHouseById.get(otherId)),
      );
      primaryPartnerHouseIdsByCharacter.set(characterId, otherHouseIds);
    });
  });

  const rowCharactersByHouse = new Map();
  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      if (characterImportance.get(node.id) === "satellite") return;
      if (groupMembershipByCharacter.has(node.id)) return;
      if (!displayRowByCharacter.has(node.id)) return;

      const houseId = characterHouseById.get(node.id);
      if (!houseId || !housePlacement.has(houseId)) return;
      const displayRow = displayRowByCharacter.get(node.id);

      if (!rowCharactersByHouse.has(houseId)) {
        rowCharactersByHouse.set(houseId, new Map());
      }
      if (!rowCharactersByHouse.get(houseId).has(displayRow)) {
        rowCharactersByHouse.get(houseId).set(displayRow, []);
      }
      rowCharactersByHouse.get(houseId).get(displayRow).push(node);
    });

  orderedHouseIds.forEach((houseId) => {
    const placement = housePlacement.get(houseId);
    const houseRows = rowCharactersByHouse.get(houseId) ?? new Map();

    [...houseRows.keys()]
      .sort((left, right) => left - right)
      .forEach((displayRow) => {
        const rowNodes = sortRowNodes(
          houseRows.get(displayRow),
          houseId,
          orderedHouseIds,
          primaryPartnerHouseIdsByCharacter,
        );
        const totalWidth =
          rowNodes.length * DEFAULT_SIZES.character.width +
          Math.max(0, rowNodes.length - 1) * SPACING.cardGap;
        const parentCenters = rowNodes
          .flatMap((node) => childEdgesByTarget.get(node.id) ?? [])
          .map((edge) => positionedNodes.get(edge.source))
          .filter(Boolean)
          .map((parentNode) => {
            const parentSize = getNodeSize(parentNode);
            return parentNode.position.x + parentSize.width / 2;
          });
        const targetCenterX =
          parentCenters.length > 0
            ? parentCenters.reduce((sum, value) => sum + value, 0) /
              parentCenters.length
            : placement.coreCenterX;
        const startX = getRowStartX(
          placement,
          totalWidth,
          houseId,
          orderedHouseIds,
          rowNodes,
          primaryPartnerHouseIdsByCharacter,
          targetCenterX,
        );

        rowNodes.forEach((node, index) => {
          positionedNodes.set(node.id, {
            ...node,
            position: {
              x: startX + index * (DEFAULT_SIZES.character.width + SPACING.cardGap),
              y: rowTop(displayRow),
            },
          });
        });
      });
  });

  const getHouseContentBottom = (houseId) => {
    const houseCharacterBottoms = cleanNodes
      .filter(
        (node) =>
          node.type === "character" &&
          characterHouseById.get(node.id) === houseId &&
          positionedNodes.has(node.id),
      )
      .map((node) => {
        const positioned = positionedNodes.get(node.id);
        return positioned.position.y + DEFAULT_SIZES.character.height;
      });
    return houseCharacterBottoms.length > 0
      ? Math.max(...houseCharacterBottoms)
      : rowTop(0);
  };

  primaryUnionIds.forEach((unionId) => {
    const partnerEntries = partnerEdgesByUnion.get(unionId) ?? [];
    const partners = unique(partnerEntries.map((edge) => edge.source))
      .map((partnerId) => positionedNodes.get(partnerId))
      .filter(Boolean)
      .sort((leftNode, rightNode) => leftNode.position.x - rightNode.position.x);

    if (partners.length < 2) return;

    const leftPartner = partners[0];
    const rightPartner = partners[partners.length - 1];
    const leftRow = displayRowByCharacter.get(leftPartner.id);
    const rightRow = displayRowByCharacter.get(rightPartner.id);

    if (leftRow === rightRow) {
      const leftWidth = getNodeSize(leftPartner).width;
      const rightWidth = getNodeSize(rightPartner).width;
      const desiredRightX = leftPartner.position.x + leftWidth + SPACING.partnerGap;
      const rightHouseId = characterHouseById.get(rightPartner.id);
      const rightPlacement = housePlacement.get(rightHouseId);

      if (rightPartner.position.x < desiredRightX) {
        const adjustedRightX = Math.min(
          desiredRightX,
          (rightPlacement?.coreRight ?? desiredRightX) - rightWidth,
        );
        positionedNodes.set(rightPartner.id, {
          ...rightPartner,
          position: { ...rightPartner.position, x: adjustedRightX },
        });
      }
    }

    const refreshedLeft = positionedNodes.get(leftPartner.id);
    const refreshedRight = positionedNodes.get(rightPartner.id);
    const rightEdge = refreshedRight.position.x + getNodeSize(refreshedRight).width;
    const unionNode = nodeById.get(unionId);

    positionedNodes.set(unionNode.id, {
      ...unionNode,
      position: {
        x:
          refreshedLeft.position.x +
          (rightEdge - refreshedLeft.position.x) / 2 -
          DEFAULT_SIZES.union.width / 2,
        y:
          Math.max(refreshedLeft.position.y, refreshedRight.position.y) +
          DEFAULT_SIZES.character.height +
          SPACING.unionOffsetY,
      },
    });
  });

  orderedHouseIds.forEach((houseId) => {
    const placement = housePlacement.get(houseId);
    const fallbackNodes = cleanNodes.filter(
      (node) =>
        node.type === "character" &&
        characterHouseById.get(node.id) === houseId &&
        !groupMembershipByCharacter.has(node.id) &&
        (characterImportance.get(node.id) === "satellite" ||
          unresolvedCharacters.has(node.id)),
    );

    if (fallbackNodes.length === 0) return;

    const satelliteCols = fallbackNodes.length >= 3 ? 3 : fallbackNodes.length;
    const satelliteGridWidth =
      satelliteCols * DEFAULT_SIZES.character.width +
      Math.max(0, satelliteCols - 1) * SPACING.satelliteGap;
    const houseCoreYValues = cleanNodes
      .filter(
        (node) =>
          (node.type === "character" || node.type === "group") &&
          ((node.type === "character" &&
            characterHouseById.get(node.id) === houseId &&
            positionedNodes.has(node.id)) ||
            (node.type === "group" &&
              groupHouseById.get(node.id) === houseId &&
              positionedNodes.has(node.id))),
      )
      .map((node) => {
        const positioned = positionedNodes.get(node.id);
        const size =
          node.type === "group"
            ? positioned?.data?.layoutBox ?? getNodeSize(node)
            : { height: DEFAULT_SIZES.character.height };
        return positioned?.position?.y + size.height;
      })
      .filter((value) => value != null);
    const startY =
      (houseCoreYValues.length > 0 ? Math.max(...houseCoreYValues) : rowTop(0)) +
      SPACING.rowGap;
    const startX = placement.coreCenterX - satelliteGridWidth / 2;

    sortFallbackNodes(fallbackNodes, childEdgesByTarget).forEach((node, index) => {
      const col = index % satelliteCols;
      const row = Math.floor(index / satelliteCols);
      const x = startX + col * (DEFAULT_SIZES.character.width + SPACING.satelliteGap);
      const y = startY + row * (DEFAULT_SIZES.character.height + SPACING.satelliteGap);

      positionedNodes.set(node.id, {
        ...node,
        position: { x, y },
      });
    });
  });

  orderedHouseIds.forEach((houseId) => {
    const placement = housePlacement.get(houseId);
    const groups = groupNodes
      .filter((node) => groupHouseById.get(node.id) === houseId)
      .sort((left, right) => left._layoutOrder - right._layoutOrder);

    if (groups.length === 0) return;

    let nextGroupY = getHouseContentBottom(houseId) + SPACING.rowGap;

    groups.forEach((groupNode) => {
      const visibleMembers = getVisibleGroupMembers(groupNode, visibleNodeIdSet);
      if (visibleMembers.length === 0) return;

      const metrics = getGroupLayoutMetrics(groupNode, visibleMembers);
      const groupX = placement.coreCenterX - metrics.width / 2;
      const groupY = nextGroupY;

      positionedNodes.set(groupNode.id, {
        ...groupNode,
        selectable: false,
        draggable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        position: { x: groupX, y: groupY },
        data: {
          ...groupNode.data,
          visibleMembers,
          visibleMemberCount: visibleMembers.length,
          layoutBox: metrics,
        },
      });

      sortFallbackNodes(
        visibleMembers
          .map((memberId) => nodeById.get(memberId))
          .filter((memberNode) => memberNode?.type === "character"),
        childEdgesByTarget,
      ).forEach((memberNode, index) => {
        const col = index % metrics.memberColumns;
        const row = Math.floor(index / metrics.memberColumns);
        const contentStartX =
          groupX + (metrics.width - metrics.contentWidth) / 2;
        const x =
          contentStartX +
          col * (DEFAULT_SIZES.character.width + SPACING.cardGap);
        const y =
          groupY +
          metrics.titleHeight +
          metrics.padding +
          row * (DEFAULT_SIZES.character.height + SPACING.satelliteGap);

        positionedNodes.set(memberNode.id, {
          ...memberNode,
          position: { x, y },
        });
      });

      nextGroupY += metrics.height + SPACING.groupGap;
    });
  });

  cleanNodes
    .filter((node) => node.type === "union" && !positionedNodes.has(node.id))
    .forEach((unionNode) => {
      const partnerEntries = partnerEdgesByUnion.get(unionNode.id) ?? [];
      const partners = unique(partnerEntries.map((edge) => edge.source))
        .map((partnerId) => positionedNodes.get(partnerId))
        .filter(Boolean)
        .sort((leftNode, rightNode) => leftNode.position.x - rightNode.position.x);

      if (partners.length >= 2) {
        const leftPartner = partners[0];
        const rightPartner = partners[partners.length - 1];
        const rightEdge = rightPartner.position.x + getNodeSize(rightPartner).width;
        const unionCenterX =
          leftPartner.position.x + (rightEdge - leftPartner.position.x) / 2;

        positionedNodes.set(unionNode.id, {
          ...unionNode,
          position: {
            x: unionCenterX - DEFAULT_SIZES.union.width / 2,
            y:
              Math.max(leftPartner.position.y, rightPartner.position.y) +
              DEFAULT_SIZES.character.height +
              SPACING.unionOffsetY,
          },
        });
        return;
      }

      positionedNodes.set(unionNode.id, {
        ...unionNode,
        position: {
          x: SPACING.canvasPaddingX,
          y: rowTop(displayRowByUnion.get(unionNode.id) ?? 0),
        },
      });
    });

  const fallbackX =
    Math.max(
      ...orderedHouseIds.map((houseId) => {
        const placement = housePlacement.get(houseId);
        return placement.left + placement.width;
      }),
    ) + 200;
  let fallbackIndex = 0;

  cleanNodes.forEach((node) => {
    if (positionedNodes.has(node.id)) return;

    positionedNodes.set(node.id, {
      ...node,
      position: {
        x: fallbackX,
        y: rowTop(0) + fallbackIndex * (DEFAULT_SIZES.character.height + 40),
      },
    });
    fallbackIndex += 1;
  });

  return {
    nodes: cleanNodes.map((node) => {
      const positionedNode = positionedNodes.get(node.id) ?? node;
      const { _layoutOrder, ...rest } = positionedNode;
      return rest;
    }),
    edges: initialEdges,
  };
}

export const getElkLayout = getSemanticLayout;
