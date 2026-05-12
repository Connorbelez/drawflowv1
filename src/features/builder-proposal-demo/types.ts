import type { Id } from "../../../convex/_generated/dataModel";

export type BuilderTemplatePreset = {
  dependencyKeys: string[];
  durationDays: number;
  key: string;
  name: string;
  percentageBps: number;
  type: string;
};

export type BuilderProposalTemplate = {
  description: string;
  isDefault: boolean;
  milestonePresets: BuilderTemplatePreset[];
  summary: string;
  templateKey: string;
  title: string;
};

export type BuilderProposalDraft = {
  _id: Id<"demo_builderProposalDrafts">;
  borrowerCashAvailabilityCents?: number;
  borrowerCoPayCents?: number;
  buildLocation: string;
  buildName: string;
  currentBudgetCents: number;
  estimatedStartDate?: string;
  generatedMilestoneVersion: number;
  lenderDrawPolicyLimitCents: number;
  manuallyEdited: boolean;
  orgKey: string;
  originalBudgetCents?: number;
  proposalNumber: string;
  status: "draft" | "milestones_generated" | "workspace_ready" | string;
  templateKey?: string;
  templateTitle?: string;
  workspaceReadyAt?: number;
};

export type BuilderProposalMilestone = {
  _id: Id<"demo_builderProposalMilestones">;
  bankItemKey?: string;
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  draftId: Id<"demo_builderProposalDrafts">;
  durationDays: number;
  included: boolean;
  key: string;
  name: string;
  order: number;
  percentageBps?: number;
  source: "template" | "bank" | "custom" | string;
  templateKey?: string;
  type: string;
};

export type BuilderProposalReadiness = {
  blockingIssues: string[];
  budgetDiffCents: number;
  canFinalize: boolean;
  currentBudgetCents: number;
  includedCount: number;
  originalBudgetCents: number;
  peakExposureCents: number;
  totalDurationDays: number;
  warningIssues: string[];
};

export type BuilderProposalBoundary = {
  _id: Id<"demo_builderProposalBoundaryPayloads">;
  payload: {
    build: Record<string, unknown>;
    budget: Record<string, unknown>;
    dependencies: Array<Record<string, unknown>>;
    milestoneSequence: Array<Record<string, unknown>>;
    planningAssumptions: Record<string, unknown>;
    validationWarnings: string[];
  };
  snapshotSummary: string;
  status: string;
};

export type BuilderProposalDraftProjection = {
  boundary: BuilderProposalBoundary | null;
  draft: BuilderProposalDraft;
  events: Array<Record<string, unknown>>;
  milestones: BuilderProposalMilestone[];
  readiness: BuilderProposalReadiness;
};

export type BuilderDashboardData = {
  activeDraft: BuilderProposalDraftProjection | null;
  dashboard: {
    metrics: {
      draftCount: number;
      planningBudgetCents: number;
      readyCount: number;
    };
    workspaceCards: Array<{
      description: string;
      href?: string;
      title: string;
    }>;
  };
  drafts: BuilderProposalDraft[];
  needsSeed: boolean;
  orgKey: string;
  templates: BuilderProposalTemplate[];
};
