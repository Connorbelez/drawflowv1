import { BUILD_COLLABORATION_CUTOVER_GATES } from "./build-collaboration-cutover-gates";

export const REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS =
  BUILD_COLLABORATION_CUTOVER_GATES;

export const REQUIRED_BUILD_COLLABORATION_MONITORS = [
  "authorizationDenials",
  "disclosureAlarms",
  "deliveryFanout",
  "idempotency",
  "staleApprovals",
  "revisionConflicts",
  "migrationParity",
  "searchLatency",
  "feedPagination",
  "overdueScheduling",
] as const;

export const PLACEHOLDER_PATTERN =
  /ACTIVE_BUILD_ID|ACTION_ITEM_ID|<[^>]+>|(?:^|[_\W])(?:TODO|TBD|UNKNOWN|PLACEHOLDER|REPLACE(?:D|_ME)?|YOUR)(?:$|[_\W])/i;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
export const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;
export const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
export const HTTPS_PATTERN = /^https:\/\//;
export const NON_HUMAN_ACTOR_PATTERN = /^(?:agent|system):/i;
export const WORKOS_USER_PATTERN = /^user_[A-Za-z0-9]+$/;

export type ArtifactAttestationKind =
  | "migration_preview"
  | "migration_application"
  | "migration_replay"
  | "migration_parity"
  | "manual_visual_review"
  | "manual_keyboard_review";

export const MIGRATION_ATTESTATION_KINDS = {
  application: "migration_application",
  parity: "migration_parity",
  preview: "migration_preview",
  replay: "migration_replay",
} as const satisfies Record<string, ArtifactAttestationKind>;

export const MANUAL_ATTESTATION_KINDS = {
  keyboardReview: "manual_keyboard_review",
  visualReview: "manual_visual_review",
} as const satisfies Record<string, ArtifactAttestationKind>;

export type JsonObject = Record<string, unknown>;
export interface BuildCollaborationCutoverLiveState {
  artifactAttestations: Array<{
    artifactSha256: string;
    attestedByRoles: string[];
    attestedByWorkosUserId: string;
    attestationId: string;
    createdAt: number;
    kind: ArtifactAttestationKind;
    rehearsalId: string;
  }>;
  companionCutover: {
    activeSubmilestoneCount: number;
    exceptionCount: number;
    generatedCompanionCount: number;
    manualActionItemCount: number;
    materializedCount: number;
    parityMismatchCount: number;
    planToken: string;
    repairedCount: number;
    reportCount: number;
    reportHash?: string;
    runId: string;
    status: string;
  } | null;
  evidence: {
    buildReportCount: number;
    cutoverEpoch: number;
    evidenceId: string;
    importedPostCount: number;
    migrationRunId: string;
    mismatchCount: number;
    parityPassed: boolean;
    parityRunId: string;
    planToken: string;
    reportHash: string;
    reportVersion: string;
    sourceRecordCount: number;
    verifiedAt: number;
    verifiedByWorkosUserId: string;
  } | null;
  latestBuild: { buildId: string; creationTime: number } | null;
  migration: {
    latestBuildCreationTime: number;
    latestBuildId: string;
    planToken: string;
    processedBuildCount: number;
    runId: string;
    status: string;
  } | null;
  observedAt: number;
  observedByWorkosUserId: string;
  organizationId: string;
  parityRun: {
    evidenceId: string;
    importedPostCount: number;
    mismatchCount: number;
    migrationRunId: string;
    parityRunId: string;
    sourceRecordCount: number;
    status: string;
  } | null;
  release: {
    applicationUrl: string;
    applicationVersion: string;
    convexDeployment: string;
    convexUrl: string;
    gitCommit: string;
  } | null;
  representativeBuildId: string;
  rollbackRehearsal: {
    afterSnapshot: RetainedDigestSnapshot;
    beforeCutoverEpoch: number;
    beforeSnapshot: RetainedDigestSnapshot;
    completedAt: number;
    disabledCutoverEpoch: number;
    disabledVerifiedAt: number;
    legacyWriteDenialError: string;
    legacyWriteDeniedAt: number;
    rehearsalId: string;
    requestedByWorkosUserId: string;
    status: string;
  } | null;
  rolloutTransitions: Array<{
    actorWorkosUserId: string;
    createdAt: number;
    newState: { cutoverEpoch?: number; status?: string } | null;
    priorState: { status?: string } | null;
  }>;
  schemaVersion: "build-collaboration-cutover-live-state/v2";
  tenant: {
    activatedAt?: number;
    activatedByWorkosUserId?: string;
    cutoverEpoch: number;
    status: "active" | "disabled" | "migration_ready";
  };
}

export interface RetainedDigestSnapshot {
  assets: { count: number; sha256: string };
  auditCutoffAt: number;
  auditEvents: { count: number; sha256: string };
  completedAt: number;
  posts: { count: number; sha256: string };
  receipts: { count: number; sha256: string };
  revisions: { count: number; sha256: string };
  snapshotId: string;
  status: string;
}

export interface CommonArtifactContext {
  applicationUrl: string;
  applicationVersion: string;
  convexDeployment: string;
  convexUrl: string;
  forbiddenOrganizationId: string;
  gitCommit: string;
  organizationId: string;
  representativeBuildId: string;
}
