import { useSyncExternalStore } from "react";

import type { AssistantClientAction } from "./assistantClientActionBridge.ts";

/**
 * Assistant planning focus store.
 *
 * Holds the ephemeral, conversation-scoped "what are we pointing at" state for
 * assistant-driven planning: which sub-milestones are selected (deictic focus),
 * the last entity mentioned in conversation (pronoun fallback), and the most
 * recently accepted diff card (single-step undo payload).
 *
 * State is intentionally in-memory only — selection is conversational pointing,
 * not shareable navigation state, so it never touches the URL. Each setup
 * session / proposal gets its own scope so stale selections cannot leak across
 * proposals.
 */

export type AssistantPlanningFocusEntity = {
  key: string;
  kind: "milestone" | "submilestone";
  label: string;
};

export type AssistantPlanningAcceptedDiff = {
  appliedAt: number;
  id: string;
  label: string;
  /** Actions that restore the before-state, replayed through the diff-card checkpoint. */
  restoreActions: AssistantClientAction[];
  surface: "proposal" | "setup";
};

export type AssistantPlanningFocusState = {
  lastAcceptedDiff?: AssistantPlanningAcceptedDiff;
  lastMentioned?: AssistantPlanningFocusEntity & { at: number };
  selectedSubmilestoneKeys: string[];
};

const EMPTY_FOCUS: AssistantPlanningFocusState = {
  selectedSubmilestoneKeys: [],
};

const focusByScope = new Map<string, AssistantPlanningFocusState>();
const listeners = new Set<() => void>();

function emitFocusChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeFocus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Derives the focus scope for a route. Pre-proposal setup sessions key off the
 * pathname (backoffice and builder setup flows stay separate); persisted
 * proposals key off the proposal id.
 */
export function planningFocusScopeKey({
  pathname,
  proposalId,
}: {
  pathname: string;
  proposalId?: string;
}) {
  return proposalId ? `proposal:${proposalId}` : `setup:${pathname}`;
}

export function readPlanningFocus(
  scopeKey: string
): AssistantPlanningFocusState {
  return focusByScope.get(scopeKey) ?? EMPTY_FOCUS;
}

function writePlanningFocus(
  scopeKey: string,
  updater: (current: AssistantPlanningFocusState) => AssistantPlanningFocusState
) {
  const next = updater(readPlanningFocus(scopeKey));
  if (
    next.selectedSubmilestoneKeys.length === 0 &&
    !next.lastAcceptedDiff &&
    !next.lastMentioned
  ) {
    focusByScope.delete(scopeKey);
  } else {
    focusByScope.set(scopeKey, next);
  }
  emitFocusChange();
}

export function setSubmilestoneSelection(scopeKey: string, keys: string[]) {
  const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  writePlanningFocus(scopeKey, (current) => ({
    ...current,
    selectedSubmilestoneKeys: unique,
  }));
}

export function toggleSubmilestoneSelection(scopeKey: string, key: string) {
  const trimmed = key.trim();
  if (!trimmed) {
    return;
  }
  const current = readPlanningFocus(scopeKey).selectedSubmilestoneKeys;
  setSubmilestoneSelection(
    scopeKey,
    current.includes(trimmed)
      ? current.filter((item) => item !== trimmed)
      : [...current, trimmed]
  );
}

export function clearPlanningFocus(scopeKey: string) {
  writePlanningFocus(scopeKey, () => EMPTY_FOCUS);
}

/**
 * Records the entity the assistant just acted on or discussed. Bare pronouns
 * ("make it 5 days") resolve against this when nothing is selected.
 */
export function recordMentionedEntity(
  scopeKey: string,
  entity: AssistantPlanningFocusEntity
) {
  writePlanningFocus(scopeKey, (current) => ({
    ...current,
    lastMentioned: { ...entity, at: Date.now() },
  }));
}

/**
 * Explicit mentions re-point the selection: the UI pointer follows the
 * conversation so the on-screen checkboxes mirror what is being discussed.
 */
export function repointSelectionToMention(
  scopeKey: string,
  entity: AssistantPlanningFocusEntity
) {
  writePlanningFocus(scopeKey, (current) => ({
    ...current,
    lastMentioned: { ...entity, at: Date.now() },
    selectedSubmilestoneKeys:
      entity.kind === "submilestone"
        ? [entity.key]
        : current.selectedSubmilestoneKeys,
  }));
}

export function recordAcceptedDiff(
  scopeKey: string,
  diff: AssistantPlanningAcceptedDiff
) {
  writePlanningFocus(scopeKey, (current) => ({
    ...current,
    lastAcceptedDiff: diff,
  }));
}

export function consumeAcceptedDiff(scopeKey: string) {
  const diff = readPlanningFocus(scopeKey).lastAcceptedDiff;
  if (diff) {
    writePlanningFocus(scopeKey, (current) => ({
      ...current,
      lastAcceptedDiff: undefined,
    }));
  }
  return diff;
}

export function usePlanningFocus(
  scopeKey: string
): AssistantPlanningFocusState {
  return useSyncExternalStore(subscribeFocus, () =>
    readPlanningFocus(scopeKey)
  );
}
