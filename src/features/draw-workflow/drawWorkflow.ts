export type DrawWorkflowStatus =
  | "planned"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved_for_release"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "released";

export interface DrawWorkflowCapabilities {
  canApprove: boolean;
  canOpenReview: boolean;
  canReject: boolean;
  canRelease: boolean;
  canStartReview: boolean;
  canSubmitForAdmin: boolean;
}

export type DrawWorkflowActionKind =
  | "approve"
  | "open_review"
  | "reject"
  | "release"
  | "start_review"
  | "submit_for_admin";

export interface DrawWorkflowActionMetadata {
  kind: "mutation" | "navigation";
  label: string;
  operation: DrawWorkflowActionKind;
}

export interface DrawWorkflowActions {
  open?: DrawWorkflowActionMetadata;
  primary?: DrawWorkflowActionMetadata;
  secondary?: DrawWorkflowActionMetadata;
}

const READABLE_DRAW_STATUSES = new Set<DrawWorkflowStatus>([
  "approved_for_release",
  "cancelled",
  "in_review",
  "planned",
  "ready_for_admin",
  "rejected",
  "released",
  "requested",
  "withdrawn",
]);

export function getDrawWorkflowActions(input: {
  canonicalIdAvailable: boolean;
  capabilities: DrawWorkflowCapabilities;
  status: DrawWorkflowStatus;
}): DrawWorkflowActions {
  const { capabilities, status } = input;
  const actions: DrawWorkflowActions = {};

  if (
    input.canonicalIdAvailable &&
    capabilities.canOpenReview &&
    READABLE_DRAW_STATUSES.has(status)
  ) {
    actions.open = {
      kind: "navigation",
      label:
        status === "requested"
          ? "Review request"
          : status === "in_review" || status === "ready_for_admin"
            ? "Open review"
            : "Open draw",
      operation: "open_review",
    };
  }

  if (status === "requested" && capabilities.canStartReview) {
    actions.primary = mutationAction("start_review", "Start review");
  }
  if (status === "in_review" && capabilities.canSubmitForAdmin) {
    actions.primary = mutationAction("submit_for_admin", "Send to admin");
  }
  if (status === "ready_for_admin") {
    if (capabilities.canApprove) {
      actions.primary = mutationAction("approve", "Approve for release");
    }
    if (capabilities.canReject) {
      actions.secondary = mutationAction("reject", "Reject");
    }
  }
  if (status === "approved_for_release" && capabilities.canRelease) {
    actions.primary = mutationAction("release", "Release");
  }

  return actions;
}

function mutationAction(
  operation: Exclude<DrawWorkflowActionKind, "open_review">,
  label: string
): DrawWorkflowActionMetadata {
  return { kind: "mutation", label, operation };
}
