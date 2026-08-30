export type MilestonePrototypeVariant = "ledger" | "console" | "field-walk";

export type WorkState = "not_started" | "in_progress" | "complete";
export type DetailTab = "overview" | "evidence" | "people" | "materials" | "notes";

interface PrototypeEvidence {
  fileName: string;
  id: string;
  locationVerified: boolean;
  source: string;
}

export interface PrototypeSubmilestone {
  actualCostCents: number | null;
  contractor: string | null;
  contractorRole: string | null;
  description: string;
  endDate: string;
  evidence: PrototypeEvidence[];
  fieldNote: string;
  key: string;
  materials: string[];
  name: string;
  plannedBudgetCents: number;
  startDate: string;
  workState: WorkState;
}

export interface PrototypeModel {
  actionLog: string[];
  milestoneKey: string;
  milestoneName: string;
  milestoneSubmitted: boolean;
  plannedBudgetCents: number;
  plannedEndDate: string;
  plannedStartDate: string;
  submilestones: PrototypeSubmilestone[];
}

export const VARIANTS = [
  { label: "Completion Ledger", value: "ledger" as const },
  { label: "Operations Console", value: "console" as const },
  { label: "Guided Field Walk", value: "field-walk" as const },
];

export interface SharedVariantProps {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  detailTab: DetailTab;
  model: PrototypeModel;
  onDetailTabChange: (tab: DetailTab) => void;
  onExit: () => void;
  onOpenDetail: (key: string, tab?: DetailTab) => void;
  onOpenGuidedCompletion: () => void;
  setActualCost: (key: string, value: string) => void;
  setFieldNote: (key: string, value: string) => void;
  setWorkState: (key: string, state: WorkState) => void;
  submitMilestone: () => void;
}
