export interface ActionItemDependencyEdge {
  source: string;
  target: string;
}

export function wouldCreateActionItemDependencyCycle(
  activeEdges: readonly ActionItemDependencyEdge[],
  sourceActionItemId: string,
  targetActionItemId: string
) {
  if (sourceActionItemId === targetActionItemId) {
    return true;
  }
  const targetsBySource = new Map<string, string[]>();
  for (const edge of activeEdges) {
    const targets = targetsBySource.get(edge.source) ?? [];
    targets.push(edge.target);
    targetsBySource.set(edge.source, targets);
  }
  const pending = [targetActionItemId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    if (current === sourceActionItemId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...(targetsBySource.get(current) ?? []));
  }
  return false;
}
