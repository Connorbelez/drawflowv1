import type { AssistantSelectionOption } from "./AssistantAutocompleteSelection.tsx";
import type { AssistantWorkflowPlannedAction } from "./assistantWorkflow.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";

export type DrawFlowAssistantProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routeContext: DrawFlowAssistantRouteContext;
};

export type PreviewItem = {
  actionKey: string;
  after?: unknown;
  before?: unknown;
  clientRequestId: string;
  entityLabel: string;
  entityType: string;
  input?: Record<string, unknown>;
  reasonRequired?: boolean;
  status?: "accepted" | "edited" | "preview" | "rejected";
  validation?: {
    errors?: string[];
    warnings?: string[];
  };
};

export type AssistantCommitState =
  | "idle"
  | "committing"
  | "committed"
  | "failed";

export type ReminderIntent = {
  allDay: boolean;
  startsAt: string;
  timezone: string;
  title: string;
};

export type AssistantSelectionRequest = {
  intent: ReminderIntent;
  title: string;
  type: "reminderTarget";
};

export type AssistantSelectionTarget = AssistantSelectionOption;

export type PlannedAction = AssistantWorkflowPlannedAction;
