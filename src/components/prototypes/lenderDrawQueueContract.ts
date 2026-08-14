// PROTOTYPE ONLY: structured, representative source facts for the locked
// lender Draw Queue. Display claims must be projected from this contract; they
// must never be authored as free-form fixture labels.

export type DrawQueueState =
  | "needs-action"
  | "waiting"
  | "correction"
  | "approved";

export type ApprovalState = "approved" | "outstanding" | "reset";

type ApprovalGroupKey = "back_office" | "lender_quorum";

interface ApprovalRequirementRecord {
  group: ApprovalGroupKey;
  recordedApprovals: number;
  requiredApprovals: number;
  state: "open" | "complete" | "reset";
}

interface EvidencePackageSummary {
  locationRequiredItemCount: number;
  locationVerifiedItemCount: number;
  packageRevisionIds: readonly string[];
  requiredItemCount: number;
  satisfiedItemCount: number;
}

interface FundingPositionSummary {
  availableBeforeCents: number;
  remainingAfterCents: number;
}

interface SubmissionCycleSummary {
  correctionRequirementsAvailableToBuilder: boolean;
  decisionHistoryCount: number;
  number: number;
  priorCycleCount: number;
  status: "submitted" | "awaiting_builder_correction" | "approved";
}

export interface LenderDrawQueueRecord {
  amountCents: number;
  approvalRequirements: readonly ApprovalRequirementRecord[];
  build: string;
  builder: string;
  buildId: string;
  currentUserLenderDecision: "required" | "recorded" | "not_required";
  displayId: string;
  drawRequestId: string;
  evidencePackage: EvidencePackageSummary;
  fundingPosition: FundingPositionSummary;
  location: string;
  policySnapshotId: string;
  requestLabel: string;
  requestNote: string;
  submissionCycle: SubmissionCycleSummary;
  submittedAt: string;
  workOrderKey: string;
}

export interface ApprovalGroupProjection {
  label: "Back Office" | "Lender quorum";
  progress: string;
  state: ApprovalState;
}

export interface DrawEvidenceFactProjection {
  kind:
    | "approved"
    | "correction"
    | "decision-history"
    | "decision-cycle"
    | "evidence-package"
    | "evidence-retained"
    | "lender-approval"
    | "location";
  label: string;
  tone: "neutral" | "success" | "warning";
}

export interface FundingPositionProjection {
  availableBefore: string;
  remainingAfter: string;
  requested: string;
}

export interface LenderDrawQueueProjection {
  amount: string;
  approvals: readonly ApprovalGroupProjection[];
  build: string;
  builder: string;
  cycle: string;
  displayId: string;
  evidence: readonly DrawEvidenceFactProjection[];
  fundingPosition: FundingPositionProjection;
  location: string;
  policy: string;
  requestLabel: string;
  requestNote: string;
  state: DrawQueueState;
  stateLabel: string;
  submittedAt: string;
  summary: string;
  workOrderKey: string;
}

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});

const submittedAtFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "America/Toronto",
  year: "numeric",
});

const formatCents = (amountCents: number) =>
  currencyFormatter.format(amountCents / 100);

const formatSubmittedAt = (value: string) => {
  const parts = Object.fromEntries(
    submittedAtFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.month} ${parts.day}, ${parts.year} · ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
};

function approvalLabel(group: ApprovalGroupKey) {
  return group === "back_office" ? "Back Office" : "Lender quorum";
}

function projectApproval(
  requirement: ApprovalRequirementRecord
): ApprovalGroupProjection {
  const state: ApprovalState =
    requirement.state === "complete"
      ? "approved"
      : requirement.state === "reset"
        ? "reset"
        : "outstanding";
  const progress =
    state === "approved"
      ? requirement.group === "back_office"
        ? "Approved"
        : `${requirement.recordedApprovals} of ${requirement.requiredApprovals}`
      : state === "reset"
        ? "Reset for next cycle"
        : requirement.group === "back_office"
          ? "Outstanding"
          : `${requirement.recordedApprovals} of ${requirement.requiredApprovals}`;

  return { label: approvalLabel(requirement.group), progress, state };
}

function projectPolicy(requirements: readonly ApprovalRequirementRecord[]) {
  const backOffice = requirements.some(
    (requirement) => requirement.group === "back_office"
  );
  const lenderQuorum = requirements.some(
    (requirement) => requirement.group === "lender_quorum"
  );
  if (backOffice && lenderQuorum) {
    return "Back Office + lender quorum";
  }
  return backOffice ? "Back Office only" : "Lender quorum only";
}

function projectState(record: LenderDrawQueueRecord): DrawQueueState {
  if (record.submissionCycle.status === "awaiting_builder_correction") {
    return "correction";
  }
  if (record.submissionCycle.status === "approved") {
    return "approved";
  }
  return record.currentUserLenderDecision === "required"
    ? "needs-action"
    : "waiting";
}

function projectStateLabel(state: DrawQueueState) {
  switch (state) {
    case "needs-action":
      return "Needs my action";
    case "waiting":
      return "Waiting on others";
    case "correction":
      return "Builder correction";
    case "approved":
      return "Approved";
  }
}

function projectSummary(record: LenderDrawQueueRecord, state: DrawQueueState) {
  if (state === "correction") {
    return "Same request record is waiting for corrected resubmission.";
  }
  if (state === "approved") {
    return "Every locked approval requirement is complete.";
  }

  const backOffice = record.approvalRequirements.find(
    (requirement) => requirement.group === "back_office"
  );
  const lender = record.approvalRequirements.find(
    (requirement) => requirement.group === "lender_quorum"
  );

  if (state === "waiting" && lender?.state === "complete") {
    return "The lender requirement is complete; Back Office remains outstanding.";
  }
  if (backOffice?.state === "complete" && lender?.state === "open") {
    return "Back Office is complete; one lender decision remains.";
  }
  if (!backOffice && lender?.state === "open") {
    return "The required lender decision is not yet recorded.";
  }
  return "Lender quorum can proceed while Back Office remains outstanding.";
}

function projectCorrectionEvidenceFacts(
  record: LenderDrawQueueRecord
): readonly DrawEvidenceFactProjection[] {
  return [
    {
      kind: "correction",
      label: "Correction requested",
      tone: "warning",
    },
    {
      kind: "decision-history",
      label: `${record.submissionCycle.priorCycleCount} prior cycle retained`,
      tone: "neutral",
    },
    {
      kind: "evidence-package",
      label: `${record.evidencePackage.satisfiedItemCount} of ${record.evidencePackage.requiredItemCount} evidence requirements satisfied`,
      tone: "warning",
    },
  ];
}

function projectApprovedEvidenceFacts(
  record: LenderDrawQueueRecord
): readonly DrawEvidenceFactProjection[] {
  return [
    {
      kind: "approved",
      label: "Current cycle approved",
      tone: "success",
    },
    {
      kind: "evidence-retained",
      label: `${record.evidencePackage.packageRevisionIds.length} evidence package revision retained`,
      tone: "neutral",
    },
    {
      kind: "decision-history",
      label: `${record.submissionCycle.decisionHistoryCount} decisions retained`,
      tone: "neutral",
    },
  ];
}

function projectEvidenceFacts(
  record: LenderDrawQueueRecord,
  state: DrawQueueState
): readonly DrawEvidenceFactProjection[] {
  if (state === "correction") {
    return projectCorrectionEvidenceFacts(record);
  }

  if (state === "approved") {
    return projectApprovedEvidenceFacts(record);
  }

  const facts: DrawEvidenceFactProjection[] = [];
  const packageComplete =
    record.evidencePackage.requiredItemCount > 0 &&
    record.evidencePackage.satisfiedItemCount ===
      record.evidencePackage.requiredItemCount;
  facts.push({
    kind: "evidence-package",
    label: packageComplete
      ? "Evidence package complete"
      : `${record.evidencePackage.satisfiedItemCount} of ${record.evidencePackage.requiredItemCount} evidence requirements satisfied`,
    tone: packageComplete ? "success" : "warning",
  });

  if (record.evidencePackage.locationRequiredItemCount > 0) {
    const locationComplete =
      record.evidencePackage.locationVerifiedItemCount ===
      record.evidencePackage.locationRequiredItemCount;
    facts.push({
      kind: "location",
      label: locationComplete
        ? "Location signals verified"
        : `${record.evidencePackage.locationVerifiedItemCount} of ${record.evidencePackage.locationRequiredItemCount} location signals verified`,
      tone: locationComplete ? "success" : "warning",
    });
  }

  const lender = record.approvalRequirements.find(
    (requirement) => requirement.group === "lender_quorum"
  );
  if (state === "waiting" && lender?.state === "complete") {
    facts.push({
      kind: "lender-approval",
      label: "Lender requirement complete",
      tone: "success",
    });
  }

  facts.push({
    kind: "decision-cycle",
    label: `Current decision cycle ${record.submissionCycle.number}`,
    tone: "neutral",
  });

  return facts.slice(0, 3);
}

export function assertLenderDrawQueueRecord(record: LenderDrawQueueRecord) {
  if (
    !(
      record.buildId &&
      record.drawRequestId &&
      record.policySnapshotId &&
      record.workOrderKey
    )
  ) {
    throw new Error(`${record.displayId}: canonical identity is incomplete.`);
  }
  if (
    record.fundingPosition.availableBeforeCents - record.amountCents !==
    record.fundingPosition.remainingAfterCents
  ) {
    throw new Error(
      `${record.displayId}: pooled funding position must reconcile.`
    );
  }
  if (
    record.evidencePackage.satisfiedItemCount >
      record.evidencePackage.requiredItemCount ||
    record.evidencePackage.locationVerifiedItemCount >
      record.evidencePackage.locationRequiredItemCount
  ) {
    throw new Error(
      `${record.displayId}: evidence summary counts are invalid.`
    );
  }
  if (
    record.evidencePackage.satisfiedItemCount > 0 &&
    record.evidencePackage.packageRevisionIds.length === 0
  ) {
    throw new Error(
      `${record.displayId}: evidence completion needs package revision provenance.`
    );
  }
  for (const requirement of record.approvalRequirements) {
    if (
      requirement.recordedApprovals > requirement.requiredApprovals ||
      requirement.requiredApprovals < 1
    ) {
      throw new Error(`${record.displayId}: approval counts are invalid.`);
    }
  }
  const lenderRequirement = record.approvalRequirements.find(
    (requirement) => requirement.group === "lender_quorum"
  );
  if (
    record.currentUserLenderDecision === "required" &&
    lenderRequirement?.state !== "open"
  ) {
    throw new Error(
      `${record.displayId}: current-user action needs an open lender requirement.`
    );
  }
  if (
    record.submissionCycle.status === "awaiting_builder_correction" &&
    !record.submissionCycle.correctionRequirementsAvailableToBuilder
  ) {
    throw new Error(
      `${record.displayId}: Builder correction needs Builder-visible requirements.`
    );
  }
  if (
    record.submissionCycle.status === "approved" &&
    record.approvalRequirements.some(
      (requirement) => requirement.state !== "complete"
    )
  ) {
    throw new Error(
      `${record.displayId}: an approved cycle needs every required group complete.`
    );
  }
}

export function projectLenderDrawQueueRecord(
  record: LenderDrawQueueRecord
): LenderDrawQueueProjection {
  assertLenderDrawQueueRecord(record);
  const state = projectState(record);

  return {
    amount: formatCents(record.amountCents),
    approvals: record.approvalRequirements.map(projectApproval),
    build: record.build,
    builder: record.builder,
    cycle: `Cycle ${record.submissionCycle.number}${record.submissionCycle.priorCycleCount > 0 ? " · prior cycle retained" : ""}`,
    displayId: record.displayId,
    evidence: projectEvidenceFacts(record, state),
    fundingPosition: {
      availableBefore: formatCents(record.fundingPosition.availableBeforeCents),
      remainingAfter: formatCents(record.fundingPosition.remainingAfterCents),
      requested: formatCents(record.amountCents),
    },
    location: record.location,
    policy: projectPolicy(record.approvalRequirements),
    requestLabel: record.requestLabel,
    requestNote: record.requestNote,
    state,
    stateLabel: projectStateLabel(state),
    submittedAt: formatSubmittedAt(record.submittedAt),
    summary: projectSummary(record, state),
    workOrderKey: record.workOrderKey,
  };
}

const completeEvidence = (suffix: string): EvidencePackageSummary => ({
  locationRequiredItemCount: 2,
  locationVerifiedItemCount: 2,
  packageRevisionIds: [`EPR-${suffix}`],
  requiredItemCount: 4,
  satisfiedItemCount: 4,
});

export const lenderDrawQueueRecords: readonly LenderDrawQueueRecord[] = [
  {
    amountCents: 18_640_000,
    approvalRequirements: [
      {
        group: "back_office",
        recordedApprovals: 1,
        requiredApprovals: 1,
        state: "complete",
      },
      {
        group: "lender_quorum",
        recordedApprovals: 1,
        requiredApprovals: 2,
        state: "open",
      },
    ],
    build: "Harbourline Residences",
    buildId: "BLD-HARBOURLINE",
    builder: "Northshore Build Co.",
    currentUserLenderDecision: "required",
    displayId: "DR-2048",
    drawRequestId: "DRAW-REQUEST-2048",
    evidencePackage: completeEvidence("2048"),
    fundingPosition: {
      availableBeforeCents: 24_290_000,
      remainingAfterCents: 5_650_000,
    },
    location: "Hamilton, ON",
    policySnapshotId: "DRAW-POLICY-HARBOURLINE-1",
    requestLabel: "Framing reimbursement",
    requestNote: "Reimbursement request against completed framing work.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: false,
      decisionHistoryCount: 2,
      number: 1,
      priorCycleCount: 0,
      status: "submitted",
    },
    submittedAt: "2026-08-12T19:42:00.000Z",
    workOrderKey: "DRAW-WO-2048",
  },
  {
    amountCents: 12_475_000,
    approvalRequirements: [
      {
        group: "lender_quorum",
        recordedApprovals: 0,
        requiredApprovals: 1,
        state: "open",
      },
    ],
    build: "Cedar & King",
    buildId: "BLD-CEDAR-KING",
    builder: "Eastline Developments",
    currentUserLenderDecision: "required",
    displayId: "DR-2051",
    drawRequestId: "DRAW-REQUEST-2051",
    evidencePackage: {
      ...completeEvidence("2051"),
      locationRequiredItemCount: 0,
      locationVerifiedItemCount: 0,
    },
    fundingPosition: {
      availableBeforeCents: 18_000_000,
      remainingAfterCents: 5_525_000,
    },
    location: "Toronto, ON",
    policySnapshotId: "DRAW-POLICY-CEDAR-KING-1",
    requestLabel: "Mechanical rough-in reimbursement",
    requestNote: "Completed plumbing, electrical, and HVAC rough-in work.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: false,
      decisionHistoryCount: 0,
      number: 1,
      priorCycleCount: 0,
      status: "submitted",
    },
    submittedAt: "2026-08-13T13:18:00.000Z",
    workOrderKey: "DRAW-WO-2051",
  },
  {
    amountCents: 9_820_000,
    approvalRequirements: [
      {
        group: "back_office",
        recordedApprovals: 0,
        requiredApprovals: 1,
        state: "open",
      },
      {
        group: "lender_quorum",
        recordedApprovals: 0,
        requiredApprovals: 2,
        state: "open",
      },
    ],
    build: "Lakeside Works",
    buildId: "BLD-LAKESIDE",
    builder: "Fieldstone Homes",
    currentUserLenderDecision: "required",
    displayId: "DR-2056",
    drawRequestId: "DRAW-REQUEST-2056",
    evidencePackage: completeEvidence("2056"),
    fundingPosition: {
      availableBeforeCents: 15_000_000,
      remainingAfterCents: 5_180_000,
    },
    location: "Burlington, ON",
    policySnapshotId: "DRAW-POLICY-LAKESIDE-1",
    requestLabel: "Exterior envelope reimbursement",
    requestNote: "Reimbursement request for the completed envelope scope.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: false,
      decisionHistoryCount: 0,
      number: 1,
      priorCycleCount: 0,
      status: "submitted",
    },
    submittedAt: "2026-08-13T15:06:00.000Z",
    workOrderKey: "DRAW-WO-2056",
  },
  {
    amountCents: 21_360_000,
    approvalRequirements: [
      {
        group: "back_office",
        recordedApprovals: 0,
        requiredApprovals: 1,
        state: "open",
      },
      {
        group: "lender_quorum",
        recordedApprovals: 2,
        requiredApprovals: 2,
        state: "complete",
      },
    ],
    build: "Parkview Mews",
    buildId: "BLD-PARKVIEW",
    builder: "Aster Lane Construction",
    currentUserLenderDecision: "recorded",
    displayId: "DR-2044",
    drawRequestId: "DRAW-REQUEST-2044",
    evidencePackage: completeEvidence("2044"),
    fundingPosition: {
      availableBeforeCents: 30_000_000,
      remainingAfterCents: 8_640_000,
    },
    location: "Mississauga, ON",
    policySnapshotId: "DRAW-POLICY-PARKVIEW-1",
    requestLabel: "Foundation reimbursement",
    requestNote: "Foundation reimbursement from unlocked Build availability.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: false,
      decisionHistoryCount: 2,
      number: 1,
      priorCycleCount: 0,
      status: "submitted",
    },
    submittedAt: "2026-08-11T17:24:00.000Z",
    workOrderKey: "DRAW-WO-2044",
  },
  {
    amountCents: 7_690_000,
    approvalRequirements: [
      {
        group: "back_office",
        recordedApprovals: 0,
        requiredApprovals: 1,
        state: "reset",
      },
    ],
    build: "Northfield Commons",
    buildId: "BLD-NORTHFIELD",
    builder: "Kestrel Projects",
    currentUserLenderDecision: "not_required",
    displayId: "DR-2037",
    drawRequestId: "DRAW-REQUEST-2037",
    evidencePackage: {
      ...completeEvidence("2037"),
      requiredItemCount: 5,
      satisfiedItemCount: 4,
    },
    fundingPosition: {
      availableBeforeCents: 10_000_000,
      remainingAfterCents: 2_310_000,
    },
    location: "Oakville, ON",
    policySnapshotId: "DRAW-POLICY-NORTHFIELD-1",
    requestLabel: "Roofing reimbursement",
    requestNote:
      "Correction requirements are shared without reviewer identity.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: true,
      decisionHistoryCount: 1,
      number: 2,
      priorCycleCount: 1,
      status: "awaiting_builder_correction",
    },
    submittedAt: "2026-08-08T20:12:00.000Z",
    workOrderKey: "DRAW-WO-2037",
  },
  {
    amountCents: 9_150_000,
    approvalRequirements: [
      {
        group: "back_office",
        recordedApprovals: 1,
        requiredApprovals: 1,
        state: "complete",
      },
      {
        group: "lender_quorum",
        recordedApprovals: 2,
        requiredApprovals: 2,
        state: "complete",
      },
    ],
    build: "Harbourline Residences",
    buildId: "BLD-HARBOURLINE",
    builder: "Northshore Build Co.",
    currentUserLenderDecision: "recorded",
    displayId: "DR-2029",
    drawRequestId: "DRAW-REQUEST-2029",
    evidencePackage: completeEvidence("2029"),
    fundingPosition: {
      availableBeforeCents: 12_000_000,
      remainingAfterCents: 2_850_000,
    },
    location: "Hamilton, ON",
    policySnapshotId: "DRAW-POLICY-HARBOURLINE-1",
    requestLabel: "Excavation reimbursement",
    requestNote:
      "Approved reimbursement request retained in the queue history.",
    submissionCycle: {
      correctionRequirementsAvailableToBuilder: false,
      decisionHistoryCount: 3,
      number: 1,
      priorCycleCount: 0,
      status: "approved",
    },
    submittedAt: "2026-08-05T14:30:00.000Z",
    workOrderKey: "DRAW-WO-2029",
  },
];

export const lenderDrawQueue = lenderDrawQueueRecords.map(
  projectLenderDrawQueueRecord
);
