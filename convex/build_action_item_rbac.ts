import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "./build_collaboration_model";

export const buildActionItemOperations = [
  "create",
  "edit_fields",
  "assign",
  "accept_assignment",
  "transition",
  "complete",
  "reopen",
  "cancel",
  "add_checklist",
  "toggle_checklist",
  "link_relation",
  "create_child",
  "repair_relation",
] as const;

export type BuildActionItemOperation =
  (typeof buildActionItemOperations)[number];

/**
 * Structural operations which are intentionally overlaid on top of the
 * ordinary Action Item RBAC for generated Milestone/Sub-milestone companions.
 *
 * Generated companions remain projections of canonical Sub-milestones.  This
 * narrow operation set must never be passed to the generic workflow
 * authorizer: the latter (and its generated-root guard) continues to deny
 * task-definition and lifecycle ownership mutations.
 */
export const generatedMilestoneCompanionStructureOperations = [
  "add_checklist",
  "toggle_checklist",
  "create_child",
  "link_relation",
  "unlink_relation",
  "repair_relation",
] as const;

export type GeneratedMilestoneCompanionStructureOperation =
  (typeof generatedMilestoneCompanionStructureOperations)[number];

export type BuildActionItemAuthority =
  | "reader"
  | "creator"
  | "assignee"
  | "assigning_authority"
  | "coordinator";

export interface BuildActionItemRbacActor {
  role: BuildCollaborationRole;
  workosUserId: string;
}

export interface BuildActionItemRbacItem {
  assignedByWorkosUserId?: string;
  assigneeWorkosUserId?: string;
  assignmentState: "assigned" | "requested" | "unassigned";
  creatorRole?: BuildCollaborationRole;
  creatorWorkosUserId: string;
  requiresAcceptance: boolean;
  status:
    | "todo"
    | "in_progress"
    | "in_review"
    | "done"
    | "blocked"
    | "cancelled";
}

export interface BuildActionItemAuthorizationDecision {
  allowed: boolean;
  authority: BuildActionItemAuthority;
  warning?: string;
}

export interface GeneratedMilestoneCompanionStructureDecision {
  allowed: boolean;
  authority: BuildActionItemAuthority;
  reason?: string;
}

const GENERATED_COMPANION_STRUCTURE_ROLES = new Set<BuildCollaborationRole>([
  // These are the Builder-side structural coordinators.  Lender/backoffice
  // roles stay review-only even though the generic Action Item RBAC treats
  // some of them as coordinators for ordinary human-authored work.
  "admin",
  "builder",
  "builder-staff",
]);

/**
 * Authorize the deliberately small structural overlay for an active
 * generated Milestone/Sub-milestone companion.
 *
 * The caller must prove that the companion is active/readable.  For a
 * Contractor, the caller must also prove exact canonical execution ownership;
 * a Contractor role by itself is never sufficient.  Workspace capability
 * projections use this same pure decision function, while mutations use the
 * throwing wrapper below after their normal tenant/audience/revision checks.
 */
export function authorizeGeneratedMilestoneCompanionStructureOperation(input: {
  activeCompanion: boolean;
  actor: BuildActionItemRbacActor;
  operation: GeneratedMilestoneCompanionStructureOperation;
  exactExecutionOwner?: boolean;
}): GeneratedMilestoneCompanionStructureDecision {
  if (!input.activeCompanion) {
    return {
      allowed: false,
      authority: "reader",
      reason:
        "Generated companion is read-only outside the active disposition.",
    };
  }

  if (GENERATED_COMPANION_STRUCTURE_ROLES.has(input.actor.role)) {
    return {
      allowed: true,
      authority: "coordinator",
    };
  }

  if (
    input.actor.role === "contractor" &&
    input.operation === "toggle_checklist" &&
    input.exactExecutionOwner === true
  ) {
    return {
      allowed: true,
      authority: "assignee",
    };
  }

  return {
    allowed: false,
    authority: "reader",
    reason:
      input.actor.role === "contractor" &&
      input.operation === "toggle_checklist"
        ? "Only the exact canonical execution Contractor may toggle this checklist."
        : "Generated companion structure editing is not permitted for this role.",
  };
}

export function isGeneratedMilestoneCompanionStructureRole(
  role: BuildCollaborationRole
) {
  return GENERATED_COMPANION_STRUCTURE_ROLES.has(role);
}

const COORDINATING_ROLES = new Set<BuildCollaborationRole>([
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
]);

export function isBuildActionItemCoordinator(
  role: BuildCollaborationRole
): boolean {
  return COORDINATING_ROLES.has(role);
}

export function resolveBuildActionItemAuthority(input: {
  actor: BuildActionItemRbacActor;
  item: BuildActionItemRbacItem;
}): BuildActionItemAuthority {
  if (input.item.creatorWorkosUserId === input.actor.workosUserId) {
    return "creator";
  }
  if (input.item.assigneeWorkosUserId === input.actor.workosUserId) {
    return "assignee";
  }
  if (input.item.assignedByWorkosUserId === input.actor.workosUserId) {
    return "assigning_authority";
  }
  if (
    isBuildActionItemCoordinator(input.actor.role) &&
    coordinatorCanGovern(input.actor.role, input.item.creatorRole)
  ) {
    return "coordinator";
  }
  return "reader";
}

export function authorizeBuildActionItemOperation(input: {
  actor: BuildActionItemRbacActor;
  item: BuildActionItemRbacItem;
  nextStatus?: BuildActionItemRbacItem["status"];
  operation: BuildActionItemOperation;
  targetAssignee?: {
    role: BuildCollaborationRole;
    workosUserId: string;
  } | null;
}): BuildActionItemAuthorizationDecision {
  const authority = resolveBuildActionItemAuthority(input);
  const allowedAuthorities: Record<
    Exclude<
      BuildActionItemOperation,
      | "accept_assignment"
      | "assign"
      | "cancel"
      | "complete"
      | "create"
      | "reopen"
      | "transition"
    >,
    readonly BuildActionItemAuthority[]
  > = {
    add_checklist: ["creator", "coordinator"],
    create_child: ["creator", "coordinator"],
    edit_fields: ["creator", "coordinator"],
    link_relation: ["creator", "coordinator"],
    repair_relation: ["coordinator"],
    toggle_checklist: [
      "creator",
      "assignee",
      "assigning_authority",
      "coordinator",
    ],
  };

  if (input.operation === "create") {
    return { allowed: true, authority: "reader" };
  }
  if (input.operation === "accept_assignment") {
    return authorizeAssignmentAcceptance(input, authority);
  }
  if (input.operation === "assign") {
    return authorizeAssignment(input, authority);
  }
  if (input.operation === "complete") {
    return authorizeCompletion(input, authority);
  }
  if (input.operation === "reopen") {
    return authorizeReopen(input, authority);
  }
  if (input.operation === "cancel") {
    return authorizeCancellation(authority);
  }
  if (input.operation === "transition") {
    return authorizeTransition(input, authority);
  }
  if (input.operation === "repair_relation") {
    return {
      allowed:
        isBuildActionItemCoordinator(input.actor.role) &&
        coordinatorCanGovern(input.actor.role, input.item.creatorRole),
      authority: "coordinator",
    };
  }
  return {
    allowed: allowedAuthorities[input.operation].includes(authority),
    authority,
  };
}

function authorizeTransition(
  input: {
    actor: BuildActionItemRbacActor;
    item: BuildActionItemRbacItem;
  },
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  const isAssignee =
    input.item.assigneeWorkosUserId === input.actor.workosUserId;
  return {
    allowed:
      isAssignee || authority === "creator" || authority === "coordinator",
    authority: isAssignee ? "assignee" : authority,
  };
}

function authorizeAssignmentAcceptance(
  input: {
    actor: BuildActionItemRbacActor;
    item: BuildActionItemRbacItem;
  },
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  const isAssignee =
    input.item.assigneeWorkosUserId === input.actor.workosUserId;
  return {
    allowed: isAssignee && input.item.assignmentState === "requested",
    authority: isAssignee ? "assignee" : authority,
  };
}

function authorizeCompletion(
  input: {
    actor: BuildActionItemRbacActor;
    item: BuildActionItemRbacItem;
  },
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  const governedCompletion =
    input.item.requiresAcceptance || input.item.assignmentState === "requested";
  if (governedCompletion) {
    const isAssigningAuthority =
      input.item.assignedByWorkosUserId === input.actor.workosUserId;
    return {
      allowed:
        input.item.status === "in_review" &&
        (isAssigningAuthority || authority === "coordinator"),
      authority: isAssigningAuthority ? "assigning_authority" : authority,
    };
  }
  const isAssignee =
    input.item.assigneeWorkosUserId === input.actor.workosUserId;
  return {
    allowed:
      isAssignee || authority === "creator" || authority === "coordinator",
    authority: isAssignee ? "assignee" : authority,
  };
}

function authorizeReopen(
  input: {
    actor: BuildActionItemRbacActor;
    item: BuildActionItemRbacItem;
  },
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  const creatorTier = input.item.creatorRole
    ? collaborationRoleTier(input.item.creatorRole)
    : 0;
  return {
    allowed:
      authority === "creator" ||
      (authority === "coordinator" &&
        collaborationRoleTier(input.actor.role) > creatorTier),
    authority,
  };
}

function authorizeCancellation(
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  return {
    allowed: authority === "creator" || authority === "coordinator",
    authority,
  };
}

function authorizeAssignment(
  input: {
    actor: BuildActionItemRbacActor;
    item: BuildActionItemRbacItem;
    targetAssignee?: {
      role: BuildCollaborationRole;
      workosUserId: string;
    } | null;
  },
  authority: BuildActionItemAuthority
): BuildActionItemAuthorizationDecision {
  const target = input.targetAssignee;
  if (!target) {
    return {
      allowed:
        authority === "creator" ||
        authority === "assigning_authority" ||
        authority === "coordinator",
      authority,
    };
  }
  if (
    input.item.assignmentState === "unassigned" &&
    target.workosUserId === input.actor.workosUserId
  ) {
    return { allowed: true, authority: "reader" };
  }
  if (
    authority !== "creator" &&
    authority !== "assigning_authority" &&
    authority !== "coordinator"
  ) {
    return { allowed: false, authority };
  }
  const upward =
    collaborationRoleTier(target.role) >
    collaborationRoleTier(input.actor.role);
  if (authority === "coordinator" && upward) {
    return { allowed: false, authority };
  }
  return {
    allowed: true,
    authority,
    warning: upward ? "assignment_requested" : undefined,
  };
}

function coordinatorCanGovern(
  actorRole: BuildCollaborationRole,
  creatorRole: BuildCollaborationRole | undefined
) {
  return (
    actorRole === "admin" ||
    (creatorRole !== undefined &&
      collaborationRoleTier(actorRole) >= collaborationRoleTier(creatorRole))
  );
}
