const DEFAULT_SIZES = {
  house: { width: 250, height: 190 },
  character: { width: 170, height: 210 },
  union: { width: 28, height: 28 },
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
  return [...new Set(values.filter(Boolean))];
}

function getMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
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

  if (hasLeftCouple && !hasRightCouple) {
    return placement.coreLeft;
  }

  if (hasRightCouple && !hasLeftCouple) {
    return placement.coreRight - totalWidth;
  }

  const preferredStart = targetCenterX - totalWidth / 2;
  return Math.min(
    placement.coreRight - totalWidth,
    Math.max(placement.coreLeft, preferredStart),
  );
}

export function buildLayoutModel(initialNodes, initialEdges) {
  const cleanNodes = initialNodes.map((node, index) => {
    const nextNode = { ...node };
    delete nextNode.parentId;
    return { ...nextNode, _layoutOrder: index };
  });

  const nodeById = new Map(cleanNodes.map((node) => [node.id, node]));
  const houses = cleanNodes.filter((node) => node.type === "house");
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
      edge.relationshipType === "banner" ||
      nodeById.get(edge.source)?.type === "house",
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
  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      const layout = getNodeLayout(node);
      const houseId =
        resolveHouseId(layout.houseAffinity, houseIdByName) ??
        resolveHouseId(node.data?.house, houseIdByName);
      characterHouseById.set(node.id, houseId);
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

  const incomingGenerationalEdges = new Map();
  [...bannerEdges, ...childEdges].forEach((edge) => {
    if (!incomingGenerationalEdges.has(edge.target)) {
      incomingGenerationalEdges.set(edge.target, []);
    }
    incomingGenerationalEdges.get(edge.target).push(edge);
  });

  const characterGeneration = new Map();
  const unionGeneration = new Map();

  function getUnionGeneration(unionId, visiting = new Set()) {
    if (unionGeneration.has(unionId)) return unionGeneration.get(unionId);

    const partnerEntries = partnerEdgesByUnion.get(unionId) ?? [];
    const partnerGenerations = partnerEntries
      .map((edge) => getCharacterGeneration(edge.source, visiting))
      .filter((value) => value != null);

    const nextGeneration =
      partnerGenerations.length > 0 ? Math.max(...partnerGenerations) : null;
    unionGeneration.set(unionId, nextGeneration);
    return nextGeneration;
  }

  function getCharacterGeneration(characterId, visiting = new Set()) {
    if (characterGeneration.has(characterId)) {
      return characterGeneration.get(characterId);
    }

    if (visiting.has(characterId)) return null;
    visiting.add(characterId);

    const incoming = incomingGenerationalEdges.get(characterId) ?? [];
    let nextGeneration = null;

    incoming.forEach((edge) => {
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode) return;

      let candidate = null;

      if (sourceNode.type === "house" || edge.relationshipType === "banner") {
        candidate = 0;
      } else if (sourceNode.type === "union") {
        const sourceGeneration = getUnionGeneration(edge.source, visiting);
        candidate = sourceGeneration == null ? null : sourceGeneration + 1;
      } else if (sourceNode.type === "character") {
        const sourceGeneration = getCharacterGeneration(edge.source, visiting);
        candidate = sourceGeneration == null ? null : sourceGeneration + 1;
      }

      if (candidate != null) {
        nextGeneration =
          nextGeneration == null ? candidate : Math.max(nextGeneration, candidate);
      }
    });

    visiting.delete(characterId);
    characterGeneration.set(characterId, nextGeneration);
    return nextGeneration;
  }

  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      getCharacterGeneration(node.id);
    });

  primaryUnionIds.forEach((unionId) => {
    getUnionGeneration(unionId);
  });

  primaryUnionIds.forEach((unionId) => {
    const partnerEntries = partnerEdgesByUnion.get(unionId) ?? [];
    const knownGenerations = partnerEntries
      .map((edge) => characterGeneration.get(edge.source))
      .filter((value) => value != null);

    if (knownGenerations.length === 0) return;

    unionGeneration.set(unionId, Math.max(...knownGenerations));
  });

  const characterImportance = new Map();
  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      characterImportance.set(
        node.id,
        getCharacterImportance(node, structuralParticipation.has(node.id)),
      );
    });

  const houseKnownGenerations = new Map();
  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      const houseId = characterHouseById.get(node.id);
      const generation = characterGeneration.get(node.id);

      if (!houseId || generation == null) return;
      if (!houseKnownGenerations.has(houseId)) houseKnownGenerations.set(houseId, []);
      houseKnownGenerations.get(houseId).push(generation);
    });

  cleanNodes
    .filter((node) => node.type === "character")
    .forEach((node) => {
      if (characterImportance.get(node.id) === "satellite") return;
      if (characterGeneration.get(node.id) != null) return;

      const houseId = characterHouseById.get(node.id);
      const fallbackGeneration = houseId
        ? Math.round(getMedian(houseKnownGenerations.get(houseId) ?? [0]))
        : 0;
      characterGeneration.set(node.id, fallbackGeneration);
    });

  primaryUnionIds.forEach((unionId) => {
    const nextGeneration =
      unionGeneration.get(unionId) ??
      Math.max(
        0,
        ...((partnerEdgesByUnion.get(unionId) ?? [])
          .map((edge) => characterGeneration.get(edge.source))
          .filter((value) => value != null)),
      );
    unionGeneration.set(unionId, nextGeneration);
  });

  return {
    cleanNodes,
    structuralEdges,
    childEdges,
    nodeById,
    houses,
    orderedHouseIds,
    characterHouseById,
    characterGeneration,
    unionGeneration,
    characterImportance,
    partnerEdgesByUnion,
    primaryUnionIds,
  };
}

function buildHousePlacement(model) {
  const {
    houses,
    orderedHouseIds,
    cleanNodes,
    characterHouseById,
    characterImportance,
    characterGeneration,
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
        characterImportance.get(node.id) !== "satellite",
    );
    const rowCountByGeneration = new Map();

    coreNodes.forEach((node) => {
      const generation = characterGeneration.get(node.id) ?? 0;
      rowCountByGeneration.set(
        generation,
        (rowCountByGeneration.get(generation) ?? 0) + 1,
      );
    });

    const maxRowWidth = Math.max(
      0,
      ...[...rowCountByGeneration.values()].map(
        (count) =>
          count * DEFAULT_SIZES.character.width +
          Math.max(0, count - 1) * SPACING.cardGap,
      ),
    );
    const coreWidth = Math.max(
      SPACING.coreLaneMinWidth,
      bannerSize.width + SPACING.cardGap,
      maxRowWidth,
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
      bannerX: cursorX + coreWidth / 2 - bannerSize.width / 2,
      bannerY: SPACING.canvasPaddingY,
    });

    cursorX += coreWidth + SPACING.territoryGap;
  });

  return placements;
}

export async function getSemanticLayout(initialNodes, initialEdges) {
  const model = buildLayoutModel(initialNodes, initialEdges);
  const housePlacement = buildHousePlacement(model);
  const {
    cleanNodes,
    houses,
    nodeById,
    orderedHouseIds,
    characterHouseById,
    characterGeneration,
    childEdges,
    unionGeneration,
    characterImportance,
    partnerEdgesByUnion,
    primaryUnionIds,
  } = model;

  const positionedNodes = new Map();
  const primaryPartnerHouseIdsByCharacter = new Map();
  const childEdgesByTarget = new Map();

  childEdges.forEach((edge) => {
    if (!childEdgesByTarget.has(edge.target)) {
      childEdgesByTarget.set(edge.target, []);
    }
    childEdgesByTarget.get(edge.target).push(edge);
  });

  houses.forEach((house) => {
    const placement = housePlacement.get(house.id);
    positionedNodes.set(house.id, {
      ...house,
      position: { x: placement.bannerX, y: placement.bannerY },
    });
  });

  const firstRowY =
    SPACING.canvasPaddingY +
    DEFAULT_SIZES.house.height +
    SPACING.bannerToContentGap;

  const rowY = (generation) =>
    firstRowY + generation * (DEFAULT_SIZES.character.height + SPACING.rowGap);

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

      const houseId = characterHouseById.get(node.id);
      if (!houseId || !housePlacement.has(houseId)) return;

      const generation = characterGeneration.get(node.id) ?? 0;
      if (!rowCharactersByHouse.has(houseId)) {
        rowCharactersByHouse.set(houseId, new Map());
      }
      if (!rowCharactersByHouse.get(houseId).has(generation)) {
        rowCharactersByHouse.get(houseId).set(generation, []);
      }

      rowCharactersByHouse.get(houseId).get(generation).push(node);
    });

  orderedHouseIds.forEach((houseId) => {
    const placement = housePlacement.get(houseId);
    const houseRows = rowCharactersByHouse.get(houseId) ?? new Map();

    [...houseRows.keys()]
      .sort((left, right) => left - right)
      .forEach((generation) => {
        const rowNodes = sortRowNodes(
          houseRows.get(generation),
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
              y: rowY(generation),
            },
          });
        });
      });
  });

  primaryUnionIds.forEach((unionId) => {
    const partnerEntries = partnerEdgesByUnion.get(unionId) ?? [];
    const partners = unique(partnerEntries.map((edge) => edge.source))
      .map((partnerId) => positionedNodes.get(partnerId))
      .filter(Boolean)
      .sort((leftNode, rightNode) => leftNode.position.x - rightNode.position.x);

    if (partners.length < 2) return;

    const leftPartner = partners[0];
    const rightPartner = partners[partners.length - 1];
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
    const satellites = cleanNodes.filter(
      (node) =>
        node.type === "character" &&
        characterHouseById.get(node.id) === houseId &&
        characterImportance.get(node.id) === "satellite",
    );

    if (satellites.length === 0) return;

    const satelliteCols = satellites.length >= 4 ? 2 : 1;
    const satelliteGridWidth =
      satelliteCols * DEFAULT_SIZES.character.width +
      Math.max(0, satelliteCols - 1) * SPACING.satelliteGap;
    const houseCoreYValues = cleanNodes
      .filter(
        (node) =>
          node.type === "character" &&
          characterHouseById.get(node.id) === houseId &&
          characterImportance.get(node.id) !== "satellite",
      )
      .map((node) => positionedNodes.get(node.id)?.position?.y)
      .filter((value) => value != null);
    const startY =
      (houseCoreYValues.length > 0 ? Math.max(...houseCoreYValues) : firstRowY) +
      DEFAULT_SIZES.character.height +
      SPACING.rowGap;
    const startX = placement.coreCenterX - satelliteGridWidth / 2;

    satellites.forEach((node, index) => {
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
          y: rowY(unionGeneration.get(unionNode.id) ?? 0),
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
        y: firstRowY + fallbackIndex * (DEFAULT_SIZES.character.height + 40),
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
