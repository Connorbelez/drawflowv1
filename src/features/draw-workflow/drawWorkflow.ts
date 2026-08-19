import type { Id } from "../../../convex/_generated/dataModel";

export type DrawWorkflowId =
  | Id<"activeBuildDrawRequests">
  | Id<"plannedDrawScheduleRows">;

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

export type DrawWorkflowRouteContext =
  | "builder"
  | "lender_admin"
  | "lender_operations"
  | "unknown";

export type DrawWorkflowOpenContext = "decision" | "detail" | "review";

export interface DrawWorkflowCapabilities {
  canApprove: boolean;
  /** The viewer can open the canonical Draw context, including read-only history. */
  canOpenCanonical: boolean;
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
  context?: DrawWorkflowOpenContext;
  kind: "mutation" | "navigation";
  label: string;
  operation: DrawWorkflowActionKind;
}

export interface DrawWorkflowActions {
  open?: DrawWorkflowActionMetadata;
  primary?: DrawWorkflowActionMetadata;
  secondary?: DrawWorkflowActionMetadata;
}

export interface DrawWorkflowTarget {
  drawId: DrawWorkflowId;
  kind: "draw";
}

export interface DrawWorkflowResolution {
  actions: DrawWorkflowActions;
  routeContext: DrawWorkflowRouteContext;
  status: DrawWorkflowStatus;
  target?: DrawWorkflowTarget;
  viewerRoles: readonly string[];
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
  routeContext?: DrawWorkflowRouteContext;
  status: DrawWorkflowStatus;
}): DrawWorkflowActions {
  const open = drawOpenAction(input);
  return {
    ...(open ? { open } : {}),
    ...drawMutationActions(input.status, input.capabilities),
  };
}

function drawOpenAction(input: {
  canonicalIdAvailable: boolean;
  capabilities: DrawWorkflowCapabilities;
  routeContext?: DrawWorkflowRouteContext;
  status: DrawWorkflowStatus;
}): DrawWorkflowActionMetadata | undefined {
  const canOpen =
    input.capabilities.canOpenCanonical || input.capabilities.canOpenReview;
  if (!(input.canonicalIdAvailable && canOpen)) {
    return;
  }
  if (!READABLE_DRAW_STATUSES.has(input.status)) {
    return;
  }
  return {
    context: drawOpenContext(input),
    kind: "navigation",
    label: drawOpenLabel(input.status, input.capabilities.canOpenReview),
    operation: "open_review",
  };
}

function drawOpenContext(input: {
  capabilities: DrawWorkflowCapabilities;
  routeContext?: DrawWorkflowRouteContext;
  status: DrawWorkflowStatus;
}): DrawWorkflowOpenContext {
  if (
    (input.status === "in_review" || input.status === "ready_for_admin") &&
    input.routeContext === "lender_admin" &&
    (input.capabilities.canApprove || input.capabilities.canReject)
  ) {
    return "decision";
  }
  if (
    input.capabilities.canOpenReview &&
    ["requested", "in_review", "ready_for_admin"].includes(input.status)
  ) {
    return "review";
  }
  return "detail";
}

function drawOpenLabel(
  status: DrawWorkflowStatus,
  canOpenReview: boolean
): string {
  if (status === "requested" && canOpenReview) {
    return "Review request";
  }
  if (
    canOpenReview &&
    (status === "in_review" || status === "ready_for_admin")
  ) {
    return "Open review";
  }
  return "Open draw";
}

function drawMutationActions(
  status: DrawWorkflowStatus,
  capabilities: DrawWorkflowCapabilities
): Pick<DrawWorkflowActions, "primary" | "secondary"> {
  switch (status) {
    case "requested":
      return capabilities.canStartReview
        ? { primary: mutationAction("start_review", "Start review") }
        : {};
    case "in_review":
      if (capabilities.canApprove || capabilities.canReject) {
        return {
          ...(capabilities.canApprove
            ? { primary: mutationAction("approve", "Approve for release") }
            : {}),
          ...(capabilities.canReject
            ? { secondary: mutationAction("reject", "Reject") }
            : {}),
        };
      }
      return capabilities.canSubmitForAdmin
        ? { primary: mutationAction("submit_for_admin", "Send to admin") }
        : {};
    case "ready_for_admin":
      return {
        ...(capabilities.canApprove
          ? { primary: mutationAction("approve", "Approve for release") }
          : {}),
        ...(capabilities.canReject
          ? { secondary: mutationAction("reject", "Reject") }
          : {}),
      };
    case "approved_for_release":
      return capabilities.canRelease
        ? { primary: mutationAction("release", "Release") }
        : {};
    default:
      return {};
  }
}

export function resolveDrawWorkflow(input: {
  capabilities: DrawWorkflowCapabilities;
  drawId?: DrawWorkflowId;
  routeContext?: DrawWorkflowRouteContext;
  status: DrawWorkflowStatus;
  viewerRoles?: readonly string[];
}): DrawWorkflowResolution {
  const routeContext = input.routeContext ?? "unknown";
  const viewerRoles = input.viewerRoles ?? [];
  return {
    actions: getDrawWorkflowActions({
      canonicalIdAvailable: Boolean(input.drawId),
      capabilities: input.capabilities,
      routeContext,
      status: input.status,
    }),
    routeContext,
    status: input.status,
    ...(input.drawId ? { target: { drawId: input.drawId, kind: "draw" } } : {}),
    viewerRoles,
  };
}

export function drawWorkflowRouteContextForRoles(
  viewerRoles: readonly string[]
): DrawWorkflowRouteContext {
  if (
    viewerRoles.some((role) => ["admin", "principle-broker"].includes(role))
  ) {
    return "lender_admin";
  }
  if (viewerRoles.some((role) => ["broker", "broker-staff"].includes(role))) {
    return "lender_operations";
  }
  if (viewerRoles.some((role) => ["builder", "builder-staff"].includes(role))) {
    return "builder";
  }
  return "unknown";
}

/**
 * Collaboration can read the server-derived role binding even when its host
 * does not provide route-local mutation callbacks. This fallback grants only
 * canonical navigation; mutations still require explicit server capabilities.
 */
export function drawWorkflowReadCapabilitiesForRoles(
  viewerRoles: readonly string[]
): DrawWorkflowCapabilities {
  const routeContext = drawWorkflowRouteContextForRoles(viewerRoles);
  const canOpenCanonical = viewerRoles.some((role) =>
    [
      "admin",
      "broker",
      "broker-staff",
      "builder",
      "builder-staff",
      "principle-broker",
    ].includes(role)
  );
  return {
    canApprove: false,
    canOpenCanonical,
    canOpenReview:
      canOpenCanonical &&
      (routeContext === "lender_admin" || routeContext === "lender_operations"),
    canReject: false,
    canRelease: false,
    canStartReview: false,
    canSubmitForAdmin: false,
  };
}

function mutationAction(
  operation: Exclude<DrawWorkflowActionKind, "open_review">,
  label: string
): DrawWorkflowActionMetadata {
  return { kind: "mutation", label, operation };
}
