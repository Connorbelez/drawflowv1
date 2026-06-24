import { EventType } from "@ag-ui/core";
import {
  assistantClientActionKeys,
  type AssistantClientActionKey,
} from "./assistantActionCatalog.ts";

export const ASSISTANT_CLIENT_ACTION_EVENT =
  "drawflow-assistant:client-action";
export const ASSISTANT_CLIENT_ACTION_RESULT_EVENT =
  "drawflow-assistant:client-action-result";
export const ASSISTANT_PENDING_CLIENT_ACTIONS_STORAGE_KEY =
  "drawflow.assistant.pendingClientActions";

export type SelectProposalTemplateAction = {
  actionKey: "select_proposal_template";
  input: {
    templateKey: string;
  };
  route?: string;
};

export type GenericAssistantClientAction = {
  actionKey: Exclude<AssistantClientActionKey, "select_proposal_template">;
  input?: Record<string, unknown>;
  route?: string;
};

export type AssistantClientAction =
  | GenericAssistantClientAction
  | SelectProposalTemplateAction;

export type AssistantClientActionResult = {
  action: AssistantClientAction;
  aguiEvent: {
    action: AssistantClientAction;
    result: unknown;
    type: typeof EventType.CUSTOM;
  };
  result: unknown;
};

type AssistantClientActionEventDetail = {
  action: AssistantClientAction;
  handled: boolean;
  markHandled: (result?: unknown) => void;
};

export function dispatchAssistantClientAction(action: AssistantClientAction) {
  if (typeof window === "undefined") {
    return false;
  }
  const detail: AssistantClientActionEventDetail = {
    action,
    handled: false,
    markHandled: (result?: unknown) => {
      detail.handled = true;
      window.dispatchEvent(
        new CustomEvent<AssistantClientActionResult>(
          ASSISTANT_CLIENT_ACTION_RESULT_EVENT,
          {
            detail: {
              action,
              aguiEvent: {
                action,
                result,
                type: EventType.CUSTOM,
              },
              result,
            },
          }
        )
      );
    },
  };
  window.dispatchEvent(
    new CustomEvent<AssistantClientActionEventDetail>(
      ASSISTANT_CLIENT_ACTION_EVENT,
      { detail }
    )
  );
  return detail.handled;
}

export function queueAssistantClientActions(actions: AssistantClientAction[]) {
  if (typeof window === "undefined" || actions.length === 0) {
    return;
  }
  const pending = readPendingAssistantClientActions();
  window.sessionStorage.setItem(
    ASSISTANT_PENDING_CLIENT_ACTIONS_STORAGE_KEY,
    JSON.stringify([...pending, ...actions])
  );
}

export function consumeQueuedAssistantClientActions({
  actionKey,
  route,
}: {
  actionKey: AssistantClientActionKey;
  route?: string;
}) {
  if (typeof window === "undefined") {
    return [];
  }
  const pending = readPendingAssistantClientActions();
  const matched: AssistantClientAction[] = [];
  const remaining: AssistantClientAction[] = [];
  for (const action of pending) {
    const actionRoute = action.route;
    if (
      action.actionKey === actionKey &&
      (!route || !actionRoute || actionRoute === route)
    ) {
      matched.push(action);
      continue;
    }
    remaining.push(action);
  }
  if (remaining.length > 0) {
    window.sessionStorage.setItem(
      ASSISTANT_PENDING_CLIENT_ACTIONS_STORAGE_KEY,
      JSON.stringify(remaining)
    );
  } else {
    window.sessionStorage.removeItem(ASSISTANT_PENDING_CLIENT_ACTIONS_STORAGE_KEY);
  }
  return matched;
}

export function readQueuedAssistantClientActions() {
  if (typeof window === "undefined") {
    return [];
  }
  return readPendingAssistantClientActions();
}

export function registerAssistantClientAction(
  actionKey: AssistantClientActionKey,
  handler: (action: AssistantClientAction) => unknown
) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AssistantClientActionEventDetail>)
      .detail;
    if (!detail || detail.action.actionKey !== actionKey) {
      return;
    }
    detail.markHandled(handler(detail.action));
  };
  window.addEventListener(ASSISTANT_CLIENT_ACTION_EVENT, listener);
  return () => window.removeEventListener(ASSISTANT_CLIENT_ACTION_EVENT, listener);
}

function readPendingAssistantClientActions() {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(
        ASSISTANT_PENDING_CLIENT_ACTIONS_STORAGE_KEY
      ) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter(isAssistantClientAction)
      : [];
  } catch {
    return [];
  }
}

function isAssistantClientAction(value: unknown): value is AssistantClientAction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.actionKey !== "string" ||
    !assistantClientActionKeys.includes(record.actionKey as AssistantClientActionKey)
  ) {
    return false;
  }
  if (record.input === undefined) {
    return true;
  }
  return Boolean(record.input) && typeof record.input === "object";
}
