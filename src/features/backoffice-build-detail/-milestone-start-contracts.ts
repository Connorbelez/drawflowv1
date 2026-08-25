export type MilestoneStartPrototypeVariant =
  | "start-dialog"
  | "start-context"
  | "start-guided";

export type PrototypeScenario = "ready" | "backdated" | "dependency" | "completion";

export type PrototypeEntrySource =
  | "milestone_card"
  | "calendar"
  | "gantt"
  | "submilestone"
  | "assistant";

export type PrototypeLifecycle = "planned" | "in_progress" | "completion_submitted";

export interface PrototypeDependency {
  key: string;
  name: string;
  status: "planned" | "in_progress";
}

export interface PrototypeStartContext {
  buildName: string;
  dependencyCandidates: PrototypeDependency[];
  evidenceState: string;
  milestoneKey: string;
  plannedEndDate: string;
  plannedStartDate: string;
  progressPercent: number;
  scopeKind: "milestone" | "submilestone";
  targetKey: string;
  targetName: string;
}

export interface PrototypeStartState {
  actionLog: string[];
  actualStartedAt?: string;
  actualStartedAtInput: string;
  completionSubmittedAt?: string;
  dependencyOverrideReason: string;
  entrySource: PrototypeEntrySource;
  lifecycle: PrototypeLifecycle;
  reportedAt?: string;
  scenario: PrototypeScenario;
}

export const VARIANTS = [
  { label: "Compact confirmation", value: "start-dialog" as const },
  { label: "Context split", value: "start-context" as const },
  { label: "Guided field check-in", value: "start-guided" as const },
];

export const SCENARIOS: Array<{
  description: string;
  label: string;
  value: PrototypeScenario;
}> = [
  {
    description: "Start now with no dependency exception.",
    label: "Ready now",
    value: "ready",
  },
  {
    description: "Report work that began earlier.",
    label: "Backdated",
    value: "backdated",
  },
  {
    description: "Record reality while prerequisites remain open.",
    label: "Dependency exception",
    value: "dependency",
  },
  {
    description: "Capture the missing start during completion.",
    label: "Completion catch-up",
    value: "completion",
  },
];

export const ENTRY_SOURCES: Array<{
  label: string;
  value: PrototypeEntrySource;
}> = [
  { label: "Milestone card", value: "milestone_card" },
  { label: "Calendar", value: "calendar" },
  { label: "Gantt", value: "gantt" },
  { label: "Submilestone", value: "submilestone" },
  { label: "Assistant", value: "assistant" },
];

export interface SharedVariantProps {
  blockers: PrototypeDependency[];
  committed: boolean;
  context: PrototypeStartContext;
  error: string;
  isCompletionCatchUp: boolean;
  onCommit: () => boolean;
  onDismiss: () => void;
  onReset: () => void;
  onScenarioChange: (scenario: PrototypeScenario) => void;
  onStateChange: (patch: Partial<PrototypeStartState>) => void;
  state: PrototypeStartState;
  varianceDays: number;
}
