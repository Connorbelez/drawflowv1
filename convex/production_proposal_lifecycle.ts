export const proposalCapitalSources = ["internal", "external"] as const;
export type ProposalCapitalSource = (typeof proposalCapitalSources)[number];

export type ProposalLifecycleCommand =
  | "activate"
  | "assign"
  | "approve"
  | "close"
  | "confirm"
  | "reject"
  | "request_changes"
  | "submit"
  | "withdraw";

const allowedProposalStates: Record<
  ProposalLifecycleCommand,
  readonly ProposalLifecycleProjection["proposalState"][]
> = {
  activate: ["closed"],
  assign: ["approved"],
  approve: ["submitted"],
  close: ["approved"],
  confirm: ["approved"],
  reject: ["submitted"],
  request_changes: ["submitted"],
  submit: ["draft"],
  withdraw: ["approved"],
};

export type ProposalLifecycleProjection = {
  activation: "active" | "inactive";
  backOfficeApproval:
    | "approved"
    | "changes_requested"
    | "not_submitted"
    | "pending"
    | "rejected";
  capitalSource: ProposalCapitalSource;
  closing: "closed" | "not_ready" | "pending_closing";
  externalAssignment: "assigned" | "not_required" | "unassigned" | "withdrawn";
  lenderConfirmation: "approved" | "declined" | "not_required" | "pending";
  proposalState: "approved" | "closed" | "draft" | "submitted";
};

type ProposalLifecycleRecord = {
  activeBuildId?: string;
  approvedAt?: number;
  capitalSource?: ProposalCapitalSource;
  closedAt?: number;
  reviewOutcome: "approved" | "none" | "rejected" | "requested_changes";
  status: ProposalLifecycleProjection["proposalState"];
};

type ProposalReviewOutcome = ProposalLifecycleRecord["reviewOutcome"];

export function assertProposalLifecycleTransition(input: {
  command: ProposalLifecycleCommand;
  reviewOutcome: ProposalReviewOutcome;
  state: ProposalLifecycleProjection["proposalState"];
}) {
  const allowedStates = allowedProposalStates[input.command];
  if (!allowedStates.includes(input.state)) {
    throw new Error(
      `Proposal command ${input.command} requires state ${allowedStates.join(" or ")}.`,
    );
  }
  if (
    ["approve", "reject", "request_changes"].includes(input.command) &&
    input.reviewOutcome !== "none"
  ) {
    throw new Error(
      `Proposal command ${input.command} requires review outcome none.`,
    );
  }
  if (
    input.command === "submit" &&
    !["none", "requested_changes"].includes(input.reviewOutcome)
  ) {
    throw new Error(
      "Proposal command submit requires review outcome none or requested_changes.",
    );
  }
  if (
    ["activate", "assign", "close", "confirm", "withdraw"].includes(
      input.command,
    ) &&
    input.reviewOutcome !== "approved"
  ) {
    throw new Error(
      `Proposal command ${input.command} requires review outcome approved.`,
    );
  }
}

export function projectProposalLifecycle(
  proposal: ProposalLifecycleRecord,
  assignment?: {
    state: "assigned" | "unassigned" | "withdrawn";
    lenderConfirmation: "approved" | "declined" | "pending";
  },
): ProposalLifecycleProjection {
  const capitalSource = proposal.capitalSource ?? "internal";
  const hasLenderAssignmentFlow =
    capitalSource === "external" ||
    Boolean(assignment && assignment.state !== "unassigned");

  return {
    activation: proposal.activeBuildId ? "active" : "inactive",
    backOfficeApproval:
      proposal.reviewOutcome === "approved"
        ? "approved"
        : proposal.reviewOutcome === "requested_changes"
          ? "changes_requested"
          : proposal.reviewOutcome === "rejected"
            ? "rejected"
            : proposal.status === "submitted"
              ? "pending"
              : "not_submitted",
    capitalSource,
    closing:
      proposal.status === "closed"
        ? "closed"
        : proposal.status === "approved"
          ? "pending_closing"
          : "not_ready",
    externalAssignment: hasLenderAssignmentFlow
      ? (assignment?.state ?? "unassigned")
      : "not_required",
    lenderConfirmation: hasLenderAssignmentFlow
      ? (assignment?.lenderConfirmation ?? "pending")
      : "not_required",
    proposalState: proposal.status,
  };
}
