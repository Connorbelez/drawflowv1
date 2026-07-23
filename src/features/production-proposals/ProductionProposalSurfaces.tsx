import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Landmark,
  Layers3,
  Link2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Send,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundCog,
  UserRoundX,
  UsersRound,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "#/components/ui/combobox.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { EditableNumberChip } from "#/components/ui/editable-chip.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  type BrokerAssignmentBrokerage,
  BrokerAssignmentDialog,
} from "#/features/broker-assignments/BrokerAssignmentDialog.tsx";
import {
  type BuildPermitViewerDocument,
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import type { TimelinePlanRow } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import {
  buildProposalCalendarActions,
  buildProposalCalendarWorkspaceFromDetail,
  createProposalCalendarEditHandler,
  type ProposalCalendarAdapterActions,
} from "#/features/calendar-workspace/adapters/proposalCalendarAdapter.ts";
import { CalendarWorkspace } from "#/features/calendar-workspace/CalendarWorkspace.tsx";
import type {
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import {
  type MaterialPlanningActions,
  type MaterialPlanningItem,
  MaterialPlanningTab,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  type TimelineMilestoneWorksheetRow,
  TimelineMilestoneWorksheetTable,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";
import { useIsMobile } from "#/hooks/use-media-query.ts";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";
import { ProductionProposalDrawScheduleEditor } from "./ProductionProposalDrawScheduleEditor.tsx";
import {
  deriveProposalDrawGroups,
  normalizeProposalDrawRows,
  ProductionProposalGanttWorkspace,
  type ProposalGanttDrawDraft,
  type ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheet } from "./ProductionProposalMilestoneWorksheet.tsx";
import { productionProposalDetailToDraftMilestones } from "./productionMilestoneWorksheetAdapter.ts";
import {
  dateFromProposalDayOffset,
  isValidIsoDateOnly,
} from "./proposalScheduleDates.ts";
import {
  ScheduleWindowPicker,
  type ScheduleWindowValue,
} from "#/features/timeline-workspace/-ScheduleWindowPicker.tsx";

export type ProductionProposalStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "closed";

interface ProductionProposal {
  _id?: string;
  borrowerCoPayBps: number;
  borrowerCoPayCents?: number;
  borrowerStartingCashCents: number;
  buildName: string;
  interestAnnualBps?: number;
  lenderDrawPolicyLimitCents: number;
  location: string;
  proposedStartDate?: string;
  selectedPlan?: {
    metrics?: {
      drawCount: number;
      drawFeesCents: number;
      interestCostCents: number;
      minimumCashReserveCents: number;
      projectedDurationDays: number;
      requiredWorkingCapitalCents?: number;
      startingCashCents: number;
      totalCostCents: number;
      totalDrawAmountCents: number;
    };
    name: string;
    planKey: "cheapestFeasible" | "fastest" | "capitalConstrained";
    recommendationReason?: string;
  };
  status: ProductionProposalStatus;
  totalBudgetCents: number;
}

interface ProductionProposalIdentity {
  email?: string;
  name?: string;
  workosUserId: string;
}

interface ProductionProposalAssignment {
  broker?: ProductionProposalIdentity | null;
  brokerage?: {
    _id?: string;
    displayName: string;
    legalName?: string;
    workosOrganizationId?: string;
  } | null;
  builder?: {
    _id: string;
    accounts?: Array<ProductionProposalIdentity & { role?: string }>;
    displayName: string;
    legalName?: string;
    ownerEmail?: string;
    status?: string;
  } | null;
  builderAssigned?: boolean;
  claimLinkActive?: boolean;
  createdBy?: ProductionProposalIdentity | null;
  initiatedFromBackoffice?: boolean;
}

interface ProductionMilestone {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys?: string[];
  durationDays?: number;
  icon?: IsometricIconKey;
  key: string;
  name: string;
  order: number;
}

interface ProductionSubmilestone {
  _id?: string;
  budgetCents?: number;
  durationDays?: number;
  key: string;
  milestoneKey: string;
  name: string;
  order?: number;
  startDay?: number;
}

interface ProductionDraw {
  amountCents: number;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

interface ProductionDocument {
  documentType: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  status: string;
  storageId?: string;
  storageUrl?: string | null;
}

export interface ProductionProposalDetail {
  activeBuild?: { _id?: string; startDate?: string } | null;
  appPermissions?: BuilderStaffAppPermissions | null;
  assignment?: ProductionProposalAssignment | null;
  costItems?: MaterialPlanningItem[];
  documents?: ProductionDocument[];
  draws?: ProductionDraw[];
  loanFacility?: { interestAnnualBps?: number; principalCents?: number } | null;
  milestones?: ProductionMilestone[];
  permitWaiver?: { reason: string } | null;
  plannedDraws?: ProductionDraw[];
  proposal: ProductionProposal;
  submilestones?: ProductionSubmilestone[];
}

export type ProductionReviewTab =
  | "calendar"
  | "closing"
  | "contractors"
  | "draws"
  | "gantt"
  | "milestones"
  | "materials"
  | "packet"
  | "review"
  | "staff"
  | "timeline";

type PacketMilestonePatch = {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  durationDays: number;
  name: string;
  submilestones: PacketSubmilestonePatch[];
};

type PacketMilestoneCreatePayload = PacketMilestonePatch & {
  dependencyKeys?: string[];
  drawAvailabilityCents?: number;
  durationDays: number;
  evidenceState: string;
  milestoneKey: string;
  order: number;
  policyState: string;
  status?: string;
  x: number;
};

type PacketSubmilestonePatch = {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
};

type PacketSubmilestoneFormDraft = {
  budgetDollars: string;
  dayEnd: string;
  key: string;
  name: string;
  order: number;
  startDay: string;
};

type PacketMilestoneFormDraft = {
  budgetDollars: string;
  dayEnd: string;
  dayStart: string;
  milestoneKey: string;
  mode: "create" | "edit";
  name: string;
  order: number;
  submilestones: PacketSubmilestoneFormDraft[];
};

type PacketSubmilestoneOverlayDraft = {
  budgetDollars: string;
  dayEnd: string;
  key?: string;
  milestoneKey: string;
  name: string;
  order?: number;
  startDay: string;
};

type PacketMilestoneGroup = {
  fallbackBudgets: number[];
  fallbackDurations: number[];
  fallbackStartOffsets: number[];
  milestone: ProductionMilestone;
  submilestones: ProductionSubmilestone[];
};

type PacketSubmilestoneTableRow = {
  budgetCents: number;
  budgetDollars: string;
  dayEndDraft: string;
  durationDays: number;
  key: string;
  name: string;
  startDay: number;
  startDayDraft: string;
};

export interface ProductionKanbanCard {
  activeBuildId?: string;
  approvedAt?: number;
  assignedBrokerEmail?: string;
  assignedBrokerName?: string;
  assignedBrokerWorkosUserId?: string;
  borrowerCoPayBps?: number;
  borrowerCoPayCents?: number;
  borrowerStartingCashCents?: number;
  budgetGovernance?: TimelinePlanRow["budgetGovernance"];
  builderAssigned?: boolean;
  builderEmail?: string;
  builderLegalName?: string;
  builderName?: string;
  builderProfileId?: string;
  buildName?: string;
  buildStatus?: TimelinePlanRow["buildStatus"];
  column: ProductionProposalStatus;
  createdAt?: number;
  createdByEmail?: string;
  createdByName?: string;
  createdByWorkosUserId?: string;
  drawCount?: number;
  href?: string;
  imageUrl?: string | null;
  location?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  milestoneCount?: number;
  milestonesBehindSchedule?: number;
  pendingDrawRequestCount?: number;
  pendingModificationRequestCount?: number;
  planKey?: "capitalConstrained" | "cheapestFeasible" | "fastest";
  planName?: string;
  proposedStartDate?: string;
  proposalId: string;
  reviewOutcome?: "approved" | "none" | "rejected" | "requested_changes";
  statusLabel?: string;
  submittedAt?: number;
  subtitle?: string;
  title: string;
  totalBudgetCents: number;
  updatedAt: number;
  updatedByWorkosUserId?: string;
  lenderDrawPolicyLimitCents?: number;
}

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
  email?: string;
  workosUserIds?: string[];
}

export interface ProductionKanbanColumn {
  cards: ProductionKanbanCard[];
  id: ProductionProposalStatus;
  name: string;
}

export interface ProductionKanban {
  columns: ProductionKanbanColumn[];
}

export interface ProductionProposalSettings {
  archetypes: Array<{ key: string; name: string; status: string }>;
  brokerage?: unknown | null;
  provisioningRequired?: boolean;
  templates: Array<{
    milestones: Array<{
      archetypeKey?: string;
      dependencyKeys?: string[];
      durationDays?: number;
      icon?: IsometricIconKey;
      key: string;
      name: string;
      percentageBps: number;
      siteVisitGuidance?: {
        cameraAngles: string;
        whatToVerify: string;
      };
      submilestones: Array<{
        budgetCents?: number;
        durationDays?: number;
        key: string;
        name: string;
      }>;
      type?: string;
    }>;
    scenarios: Array<{ isDefault: boolean; name: string; scenarioKey: string }>;
    templateKey: string;
    title: string;
  }>;
  workflowRules: Array<{
    allowPermitWaiverByRoles: string[];
    proposalStates: string[];
    requirePermitForApproval: boolean;
    ruleKey: string;
    settings: { interestStartsOn?: string; reimbursementOnly?: boolean };
    version: number;
  }>;
}

export interface ProductionProposalDraftSavePayload {
  borrowerCoPayBps: number;
  borrowerStartingCashCents: number;
  buildName: string;
  contractorAssignments?: Array<{
    contractorId?: string;
    contractorName: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    milestoneKey: string;
    role: string;
    submilestoneKeys: string[];
  }>;
  costItems?: Array<{
    budgetSubmilestoneKey?: string;
    budgetTreatment?: "add" | "logOnly" | "maintain";
    costCents: number;
    description?: string;
    itemType: "equipment" | "material";
    milestoneKey: string;
    quantity: number;
    relevantSubmilestoneKeys: string[];
    supplier?: string;
    title: string;
  }>;
  documents?: Array<{
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageId?: string;
  }>;
  draws?: ProposalGanttDrawDraft[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: Array<{
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys: string[];
    durationDays: number;
    icon?: IsometricIconKey;
    key: string;
    name: string;
    order: number;
    submilestones: Array<{
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
    }>;
  }>;
  proposedStartDate?: string;
}

export function ProductionProposalDraftEditorSurface({
  detail,
  onSave,
  onSubmit,
  onUploadDocument,
}: {
  detail: ProductionProposalDetail;
  onSave: (payload: ProductionProposalDraftSavePayload) => void;
  onSubmit: () => void;
  onUploadDocument?: (file: File) => Promise<{ storageId: string }>;
}) {
  const proposal = detail.proposal;
  const proposedStartDate = proposal.proposedStartDate ?? "";
  const initialDraftMilestones = useMemo(
    () => productionProposalDetailToDraftMilestones(detail),
    [detail]
  );
  const [buildName, setBuildName] = useState(proposal.buildName);
  const [location, setLocation] = useState(proposal.location);
  const [borrowerStartingCashCents, setBorrowerStartingCashCents] = useState(
    String(proposal.borrowerStartingCashCents)
  );
  const [lenderDrawPolicyLimitCents, setLenderDrawPolicyLimitCents] = useState(
    String(proposal.lenderDrawPolicyLimitCents)
  );
  const [draftMilestones, setDraftMilestones] = useState<
    ProposalGanttMilestoneDraft[]
  >(initialDraftMilestones);
  const [draftDraws, setDraftDraws] = useState<ProposalGanttDrawDraft[]>(() =>
    normalizeProposalDrawRows({
      borrowerCoPayBps: proposal.borrowerCoPayBps,
      draws: productionProposalDetailToDraftDraws(detail),
      milestones: initialDraftMilestones,
    })
  );
  const [documentType, setDocumentType] = useState<
    "permit" | "budget" | "plan" | "supporting"
  >("permit");
  const [documents, setDocuments] = useState<
    NonNullable<ProductionProposalDraftSavePayload["documents"]>
  >(
    () =>
      detail.documents?.map((document) => ({
        documentType: normalizeDocumentType(document.documentType),
        fileName: document.fileName,
        mimeType: document.mimeType ?? "application/octet-stream",
        sizeBytes: document.sizeBytes ?? 0,
        storageId: document.storageId,
      })) ?? []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const draftTotalBudgetCents = draftMilestones.reduce(
    (total, milestone) =>
      total + Math.max(0, Math.round(milestone.budgetCents)),
    0
  );
  const draftApprovedAmountCents = parseInteger(lenderDrawPolicyLimitCents);
  const draftBorrowerCoPayBps = calculateUnapprovedBudgetBps(
    draftTotalBudgetCents,
    draftApprovedAmountCents
  );

  function save() {
    const normalizedDraftDraws = normalizeProposalDrawRows({
      borrowerCoPayBps: draftBorrowerCoPayBps,
      draws: draftDrawsForAvailabilityRecalculation(draftDraws),
      milestones: draftMilestones,
    });
    onSave({
      borrowerCoPayBps: calculateUnapprovedBudgetBps(
        draftTotalBudgetCents,
        draftApprovedAmountCents
      ),
      borrowerStartingCashCents: parseInteger(borrowerStartingCashCents),
      buildName,
      documents,
      draws: normalizedDraftDraws,
      lenderDrawPolicyLimitCents: draftApprovedAmountCents,
      location,
      milestones: draftMilestones,
      proposedStartDate: proposal.proposedStartDate,
    });
  }

  async function uploadDocument(file: File) {
    if (!onUploadDocument) {
      setDocuments((current) => [
        ...current,
        {
          documentType,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      ]);
      return;
    }
    setIsUploading(true);
    setUploadError("");
    try {
      const { storageId } = await onUploadDocument(file);
      setDocuments((current) => [
        ...current,
        {
          documentType,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          storageId,
        },
      ]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Document upload failed."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h1 className="mt-2 font-semibold text-2xl tracking-tight">
              Edit Build Proposal
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Draft edits are explicit saves against production proposal rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} size="sm" variant="outline">
              Save draft
            </Button>
            <Button onClick={onSubmit} size="sm">
              <Send />
              Submit proposal
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="grid gap-3 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="outline">Proposal Gantt workspace</Badge>
              <h2 className="mt-2 font-semibold text-xl tracking-tight">
                Construction roadmap and draw availability
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Draw groups are derived from ordered sub-milestones between
                milestone completion draw availability points.
              </p>
            </div>
            <Badge variant="success">
              {draftMilestones.length} milestones / {draftDraws.length} draws
            </Badge>
          </div>
          <div className="min-h-[44rem]">
            <ProductionProposalGanttWorkspace
              baseDate={proposedStartDate}
              borrowerCoPayBps={draftBorrowerCoPayBps}
              borrowerStartingCashCents={parseInteger(
                borrowerStartingCashCents
              )}
              buildName={buildName}
              draws={draftDraws}
              lenderDrawPolicyLimitCents={parseInteger(
                lenderDrawPolicyLimitCents
              )}
              location={location}
              milestones={draftMilestones}
              onDrawsChange={setDraftDraws}
              onMilestonesChange={setDraftMilestones}
              onSubmit={onSubmit}
              proposalStatus={proposal.status}
            />
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Proposal identity">
          <div className="grid gap-3">
            <LabeledInput
              label="Build name"
              onChange={setBuildName}
              value={buildName}
            />
            <GoogleAddressAutocomplete
              id="build-location"
              label="Build location"
              onChange={setLocation}
              placeholder="Search build address"
              value={location}
            />
          </div>
        </Section>
        <Section title="Budget and capital">
          <div className="grid gap-3">
            <LabeledInput
              inputMode="numeric"
              label="Borrower starting cash cents"
              onChange={setBorrowerStartingCashCents}
              value={borrowerStartingCashCents}
            />
            <LabeledInput
              inputMode="numeric"
              label="Approved amount cents"
              onChange={setLenderDrawPolicyLimitCents}
              value={lenderDrawPolicyLimitCents}
            />
          </div>
        </Section>
        <Section title="Milestone worksheet">
          <DraftMilestoneTimelineEditor
            milestones={draftMilestones}
            onMilestonesChange={(nextMilestones) => {
              setDraftMilestones(nextMilestones);
              setDraftDraws(
                normalizeProposalDrawRows({
                  borrowerCoPayBps: draftBorrowerCoPayBps,
                  draws: draftDraws,
                  milestones: nextMilestones,
                })
              );
            }}
          />
        </Section>
        <Section title="Draw schedule">
          <DraftDrawScheduleSummary
            borrowerCoPayBps={draftBorrowerCoPayBps}
            draws={draftDraws}
            milestones={draftMilestones}
          />
        </Section>
        <Section title="Documents">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="production-document-type">Document type</Label>
                <NativeSelect
                  id="production-document-type"
                  onChange={(event) =>
                    setDocumentType(normalizeDocumentType(event.target.value))
                  }
                  value={documentType}
                >
                  <NativeSelectOption value="permit">Permit</NativeSelectOption>
                  <NativeSelectOption value="budget">Budget</NativeSelectOption>
                  <NativeSelectOption value="plan">Plan</NativeSelectOption>
                  <NativeSelectOption value="supporting">
                    Supporting
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="grid min-w-60 flex-1 gap-2">
                <Label htmlFor="production-document-upload">
                  Upload document
                </Label>
                <Input
                  id="production-document-upload"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void uploadDocument(file);
                    }
                  }}
                  type="file"
                />
              </div>
            </div>
            {uploadError ? (
              <p className="text-destructive text-sm">{uploadError}</p>
            ) : null}
            {isUploading ? (
              <p className="text-muted-foreground text-sm">Uploading...</p>
            ) : null}
            {documents.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Permit upload metadata is saved with the proposal package.
              </p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {documents.map((document, index) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                    key={`${document.fileName}-${index}`}
                  >
                    <span>
                      {document.fileName} - {document.documentType}
                    </span>
                    <Badge variant={document.storageId ? "success" : "outline"}>
                      {document.storageId ? "Stored" : "Metadata"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
        <Section title="Readiness warnings">
          <p className="text-muted-foreground text-sm">
            Draft must include at least one milestone before submission.
          </p>
        </Section>
      </div>
    </main>
  );
}

function DraftMilestoneTimelineEditor({
  milestones,
  onMilestonesChange,
}: {
  milestones: ProposalGanttMilestoneDraft[];
  onMilestonesChange: (milestones: ProposalGanttMilestoneDraft[]) => void;
}) {
  const updateMilestone = (
    milestoneKey: string,
    patch: Partial<ProposalGanttMilestoneDraft>
  ) => {
    onMilestonesChange(
      milestones.map((milestone) => {
        if (milestone.key !== milestoneKey) {
          return milestone;
        }
        const next = { ...milestone, ...patch };
        const durationDays =
          patch.durationDays === undefined
            ? next.durationDays
            : Math.max(1, Math.round(patch.durationDays));
        return {
          ...next,
          dayEnd:
            patch.durationDays === undefined
              ? next.dayEnd
              : next.dayStart + durationDays,
          durationDays,
        };
      })
    );
  };

  return (
    <div className="grid gap-3">
      {milestones.map((milestone) => (
        <div
          className="grid gap-3 border-b pb-3 last:border-b-0 last:pb-0"
          key={milestone.key}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm">{milestone.name}</div>
              <div className="text-muted-foreground text-xs">
                {milestone.submilestones.length} sub-milestones / Day{" "}
                {milestone.dayStart} to {milestone.dayEnd}
              </div>
            </div>
            <Badge variant="outline">{milestone.key}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LabeledInput
              inputMode="numeric"
              label={`${milestone.name} budget`}
              onChange={(value) =>
                updateMilestone(milestone.key, {
                  budgetCents: parseInteger(value),
                })
              }
              value={String(milestone.budgetCents)}
            />
            <LabeledInput
              inputMode="numeric"
              label={`${milestone.name} start day`}
              onChange={(value) => {
                const dayStart = parseInteger(value);
                updateMilestone(milestone.key, {
                  dayEnd: dayStart + milestone.durationDays,
                  dayStart,
                });
              }}
              value={String(milestone.dayStart)}
            />
            <LabeledInput
              inputMode="numeric"
              label={`${milestone.name} duration days`}
              onChange={(value) =>
                updateMilestone(milestone.key, {
                  durationDays: Math.max(1, parseInteger(value)),
                })
              }
              value={String(milestone.durationDays)}
            />
          </div>
          {milestone.submilestones.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {milestone.submilestones.map((submilestone) => (
                <Badge key={submilestone.key} variant="secondary">
                  {submilestone.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DraftDrawScheduleSummary({
  borrowerCoPayBps,
  draws,
  milestones,
}: {
  borrowerCoPayBps: number;
  draws: ProposalGanttDrawDraft[];
  milestones: ProposalGanttMilestoneDraft[];
}) {
  const derivedDrawGroups = deriveProposalDrawGroups({
    borrowerCoPayBps,
    draws,
    milestones,
  });

  if (derivedDrawGroups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add milestones before draw availability can be derived.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draw group</TableHead>
          <TableHead>Boundary</TableHead>
          <TableHead>Sub-milestones</TableHead>
          <TableHead className="text-right">Available</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {derivedDrawGroups.map((group) => (
          <TableRow key={group.draw.drawKey}>
            <TableCell>
              <div className="font-medium">{group.draw.label}</div>
              <div className="text-muted-foreground text-xs">
                {group.draw.drawKey}
              </div>
            </TableCell>
            <TableCell>Day {group.endDay}</TableCell>
            <TableCell>
              {group.submilestones.length > 0
                ? group.submilestones
                    .map(
                      (submilestone) =>
                        `${submilestone.milestoneKey}.${submilestone.order}`
                    )
                    .join(", ")
                : group.groupMilestones
                    .map((milestone) => milestone.name)
                    .join(", ")}
            </TableCell>
            <TableCell className="text-right">
              <div>{formatCents(group.amountCents)}</div>
              {group.amountCents > group.drawAvailabilityCents ? (
                <div className="mt-1 flex justify-end gap-1 text-warning-foreground text-xs">
                  <AlertTriangle aria-hidden className="size-3.5" />
                  {formatCents(group.amountCents - group.drawAvailabilityCents)}{" "}
                  over availability
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProductionProposalPackageSurface({
  action,
  detail,
  onSubmit,
}: {
  action?: ReactNode;
  detail: ProductionProposalDetail;
  onSubmit: () => void;
}) {
  const proposal = detail.proposal;
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h1 className="mt-2 font-semibold text-2xl tracking-tight">
              {proposal.buildName}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {proposal.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {action}
            <Button
              disabled={proposal.status !== "draft"}
              onClick={onSubmit}
              size="sm"
            >
              <Send />
              Submit proposal
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Section title="Proposal identity">
            <DetailGrid
              rows={[
                ["Build", proposal.buildName],
                ["Location", proposal.location],
                ["Status", statusLabel(proposal.status)],
              ]}
            />
          </Section>

          <Section title="Documents">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={permit ? "success" : "warning"}>
                {permit ? "Permit PDF linked" : "Permit missing"}
              </Badge>
              {permit ? (
                <span className="text-sm">{permit.fileName}</span>
              ) : detail.permitWaiver ? (
                <span className="text-sm">
                  Permit waiver: {detail.permitWaiver.reason}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Approval requires permit upload or audited waiver.
                </span>
              )}
              <BuildPermitViewerDrawer
                permit={permitViewerDocument}
                size="sm"
              />
            </div>
          </Section>

          <Section title="Milestone worksheet">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail.milestones ?? []).map((milestone) => (
                  <TableRow key={milestone.key}>
                    <TableCell>{milestone.name}</TableCell>
                    <TableCell>
                      Day {milestone.dayStart} to {milestone.dayEnd}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(milestone.budgetCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Draw schedule">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Draw</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail.draws ?? detail.plannedDraws ?? []).map((draw) => (
                  <TableRow key={draw.drawKey}>
                    <TableCell>{draw.label}</TableCell>
                    <TableCell>Day {draw.timingDay}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(draw.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Budget and capital">
            <DetailGrid
              rows={[
                ["Total budget", formatCents(proposal.totalBudgetCents)],
                [
                  "Borrower starting cash",
                  formatCents(proposal.borrowerStartingCashCents),
                ],
                [
                  "Approved amount",
                  formatCents(
                    calculateProposalApprovedAmountCents(proposal, detail.draws)
                  ),
                ],
              ]}
            />
          </Section>

          <Section title="Template selection">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              Production foundation template snapshot
            </div>
          </Section>

          <Section title="Readiness warnings">
            <ul className="flex flex-col gap-2 text-sm">
              {permit || detail.permitWaiver ? null : (
                <li className="flex gap-2">
                  <XCircle className="size-4 text-warning" />
                  Permit PDF or permit waiver required before approval.
                </li>
              )}
              {(detail.milestones ?? []).length === 0 ? (
                <li className="flex gap-2">
                  <XCircle className="size-4 text-warning" />
                  Add at least one milestone before submission.
                </li>
              ) : (
                <li className="flex gap-2">
                  <CheckCircle2 className="size-4 text-success" />
                  Milestone and draw schedule rows are ready.
                </li>
              )}
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}

export function ProductionProposalKanbanSurface({
  builders = [],
  controls,
  kanban,
  loadingMore = false,
  onLoadMore,
  onAssignBuilder,
  onDeleteDraft,
  onOpen,
}: {
  builders?: ProductionBuilderOption[];
  controls?: ReactNode;
  kanban: ProductionKanban;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onAssignBuilder?: (
    card: ProductionKanbanCard,
    builderProfileId: string
  ) => Promise<unknown> | unknown;
  onDeleteDraft?: (card: ProductionKanbanCard) => Promise<unknown> | unknown;
  onOpen?: (card: ProductionKanbanCard) => void;
}) {
  const [assignCard, setAssignCard] = useState<ProductionKanbanCard | null>(
    null
  );
  const [deleteCard, setDeleteCard] = useState<ProductionKanbanCard | null>(
    null
  );

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="p-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            Proposal kanban
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Production Build Proposals move only through workflow mutations.
            Right-click a card to assign a builder or delete a draft.
          </p>
          {controls ? <div className="mt-4 border-t pt-4">{controls}</div> : null}
        </FramePanel>
      </Frame>
      <div className="grid gap-3 lg:grid-cols-4">
        {kanban.columns.map((column) => (
          <Card data-testid="production-kanban-column" key={column.id}>
            <CardHeader className="border-b p-4">
              <CardTitle className="text-base">{column.name}</CardTitle>
              <CardDescription>{column.cards.length} proposals</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-3">
              {column.cards.length === 0 ? (
                <p className="text-muted-foreground text-sm">No proposals.</p>
              ) : null}
              {column.cards.map((card) => (
                <ProposalKanbanCard
                  canAssign={Boolean(onAssignBuilder)}
                  canDelete={Boolean(onDeleteDraft)}
                  card={card}
                  key={card.proposalId}
                  onAssignRequest={() => setAssignCard(card)}
                  onDeleteRequest={() => setDeleteCard(card)}
                  onOpen={() => onOpen?.(card)}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {onLoadMore ? (
        <div className="flex justify-center">
          <Button loading={loadingMore} onClick={onLoadMore} variant="outline">
            Load more proposals
          </Button>
        </div>
      ) : null}
      <AssignBuilderDialog
        builders={builders}
        card={assignCard}
        onAssign={onAssignBuilder}
        onOpenChange={(open) => {
          if (!open) {
            setAssignCard(null);
          }
        }}
      />
      <DeleteDraftDialog
        card={deleteCard}
        onDelete={onDeleteDraft}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCard(null);
          }
        }}
      />
    </main>
  );
}

function ProposalKanbanCard({
  card,
  canAssign,
  canDelete,
  onAssignRequest,
  onDeleteRequest,
  onOpen,
}: {
  card: ProductionKanbanCard;
  canAssign: boolean;
  canDelete: boolean;
  onAssignRequest: () => void;
  onDeleteRequest: () => void;
  onOpen: () => void;
}) {
  const isDraft = card.column === "draft";
  const assigned =
    card.builderAssigned ?? !isUnassignedBuilderName(card.builderName);
  const showAssign = canAssign && isDraft && !assigned;
  const showDelete = canDelete && isDraft;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            className="w-full rounded-lg border bg-card p-3 text-left shadow-xs/5 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent/40"
            data-testid="production-kanban-card"
            onClick={onOpen}
            type="button"
          />
        }
      >
        <p className="font-medium text-sm leading-snug">{card.title}</p>
        {card.subtitle ? (
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {card.subtitle}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
          {assigned ? (
            <span className="flex min-w-0 items-start gap-1.5 text-foreground text-xs">
              <UserRound
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="grid min-w-0">
                <span className="truncate font-medium">{card.builderName}</span>
                {card.builderEmail ? (
                  <span className="truncate text-muted-foreground">
                    {card.builderEmail}
                  </span>
                ) : null}
              </span>
            </span>
          ) : (
            <span
              className="flex min-w-0 items-center gap-1.5 text-warning text-xs"
              data-testid="production-kanban-card-unassigned"
            >
              <UserRoundX aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate font-medium">Unassigned</span>
            </span>
          )}
          <span className="shrink-0 font-medium text-muted-foreground text-xs tabular-nums">
            {formatCents(card.totalBudgetCents)}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuGroup>
          <ContextMenuLabel className="truncate">{card.title}</ContextMenuLabel>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onOpen}>
          <FileText aria-hidden />
          Open
        </ContextMenuItem>
        {showAssign ? (
          <ContextMenuItem onClick={onAssignRequest}>
            <UserPlus aria-hidden />
            Assign builder
          </ContextMenuItem>
        ) : null}
        {showDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDeleteRequest} variant="destructive">
              <Trash2 aria-hidden />
              Delete draft
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function AssignBuilderDialog({
  builders,
  card,
  onAssign,
  onOpenChange,
}: {
  builders: ProductionBuilderOption[];
  card: ProductionKanbanCard | null;
  onAssign?: (
    card: ProductionKanbanCard,
    builderProfileId: string
  ) => Promise<unknown> | unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    setError(null);
    setPending(false);
  }, [card?.proposalId]);

  async function handleAssign() {
    if (!(card && selected && onAssign)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAssign(card, selected);
      onOpenChange(false);
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Could not assign builder."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={card !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign builder</DialogTitle>
          <DialogDescription>
            {card
              ? `Assign a builder to "${card.title}". This is only available while the proposal is an unassigned draft.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-1">
          {builders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active builders are available in this brokerage yet.
            </p>
          ) : (
            <Select
              onValueChange={(value) => setSelected(value as string)}
              value={selected ?? undefined}
            >
              <SelectTrigger data-testid="assign-builder-select">
                <SelectValue placeholder="Select a builder" />
              </SelectTrigger>
              <SelectContent>
                {builders.map((builder) => (
                  <SelectItem key={builder._id} value={builder._id}>
                    {builder.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {error ? (
            <p className="mt-2 text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button
            data-testid="assign-builder-confirm"
            disabled={!selected}
            loading={pending}
            onClick={handleAssign}
          >
            Assign builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDraftDialog({
  card,
  onDelete,
  onOpenChange,
}: {
  card: ProductionKanbanCard | null;
  onDelete?: (card: ProductionKanbanCard) => Promise<unknown> | unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [card?.proposalId]);

  async function handleDelete() {
    if (!(card && onDelete)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onDelete(card);
      onOpenChange(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete draft."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={card !== null}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft proposal</AlertDialogTitle>
          <AlertDialogDescription>
            {card
              ? `"${card.title}" and its draft plan will be permanently removed. This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
          <Button
            data-testid="delete-draft-confirm"
            loading={pending}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete draft
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isUnassignedBuilderName(builderName?: string) {
  return !builderName || builderName === "Unassigned builder";
}

export function ProductionProposalSettingsSurface({
  onSeed,
  seedPending = false,
  settings,
}: {
  onSeed?: () => void;
  seedPending?: boolean;
  settings: ProductionProposalSettings | undefined;
}) {
  const template = settings?.templates[0];
  const workflowRule = settings?.workflowRules[0];
  const activeScenario = template?.scenarios.find(
    (scenario) => scenario.isDefault
  );
  const worksheetRows = useMemo(
    () => productionTemplateToWorksheetRows(template),
    [template]
  );
  const [productionRows, setProductionRows] = useState(worksheetRows);

  useEffect(() => {
    setProductionRows(worksheetRows);
  }, [worksheetRows]);

  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Badge variant="outline">Production proposal settings</Badge>
            <h2 className="mt-2 font-semibold text-xl tracking-tight">
              Proposal-flow foundation
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Tenant-scoped templates, milestone archetypes, draw scenarios, and
              workflow rules used by canonical proposal routes.
            </p>
          </div>
          {onSeed ? (
            <Button
              loading={seedPending}
              onClick={onSeed}
              size="sm"
              variant="outline"
            >
              <Database />
              Seed defaults to prod
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3">
          {settings === undefined ? (
            <p className="text-muted-foreground text-sm">
              Loading production proposal settings...
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              <SettingMetric
                label="Archetypes"
                value={String(settings.archetypes.length)}
              />
              <SettingMetric
                label="Template milestones"
                value={String(template?.milestones.length ?? 0)}
              />
              <SettingMetric
                label="Draw scenarios"
                value={String(template?.scenarios.length ?? 0)}
              />
              <SettingMetric
                label="Workflow states"
                value={String(workflowRule?.proposalStates.length ?? 0)}
              />
            </div>
          )}
          {settings?.provisioningRequired ? (
            <Alert variant="warning">
              <Database />
              <AlertTitle>Brokerage profile required</AlertTitle>
              <AlertDescription>
                This WorkOS organization is active, but it does not have an
                active brokerage profile yet. Seed the production foundation to
                create the tenant-scoped brokerage, templates, draw scenarios,
                and workflow rules.
              </AlertDescription>
              {onSeed ? (
                <AlertAction>
                  <Button onClick={onSeed} size="sm" variant="outline">
                    <Database />
                    Seed foundation
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}
          {workflowRule ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">
                Reimbursement only:{" "}
                {workflowRule.settings.reimbursementOnly ? "yes" : "no"}
              </Badge>
              <Badge variant="outline">
                Interest starts on {workflowRule.settings.interestStartsOn}
              </Badge>
              <Badge variant="outline">
                Permit required:{" "}
                {workflowRule.requirePermitForApproval ? "yes" : "no"}
              </Badge>
            </div>
          ) : null}
        </div>
        {template ? (
          <TimelineMilestoneWorksheetTable
            footerExtra={
              <div className="timeline-blueprint-metric">
                <span>Active scenario</span>
                <strong>{activeScenario?.name ?? "Missing"}</strong>
              </div>
            }
            mode="settings"
            onRowsChange={setProductionRows}
            rows={productionRows}
            showHeading
            templateTitle={template.title}
          />
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function ProductionProposalReviewSurface({
  assignableBrokerages = [],
  brokerOptionsPending = false,
  builders = [],
  calendarAdapterActions,
  calendarAssignableParticipants = [],
  calendarTimeframe,
  calendarWorkspace,
  detail,
  initialActiveTab,
  materialPlanningActions,
  onChangeCalendarTimeframe,
  onChangeReviewTab,
  onApprove,
  onClose,
  onCommitCalendarEdit,
  onCreateCalendarReminderEvent,
  onCreateCalendarSyncSubscription,
  onDeleteCalendarReminderEvent,
  onRecordExternalCalendarSyncChange,
  onReject,
  onRequestChanges,
  onSubmit,
  onAssignBroker,
  onAssignBuilder,
  onOnboardBuilder,
  onUnassignBuilder,
  onCreatePacketMilestone,
  onUploadPermitDocument,
  onUpdateApprovedAmount,
  onUpdateCalendarReminderEvent,
  onUpdateInterestRate,
  onUpdatePacketMilestone,
  onUpdateProposedStartDate,
  onSaveCalendarView,
  onCreateClaimLink,
  onUpdateDraw,
  milestones,
  contractors,
  gantt,
  staff,
  timeline,
}: {
  assignableBrokerages?: BrokerAssignmentBrokerage[];
  brokerOptionsPending?: boolean;
  builders?: ProductionBuilderOption[];
  contractors?: ReactNode;
  gantt?: ReactNode;
  calendarAdapterActions?: ProposalCalendarAdapterActions;
  calendarAssignableParticipants?: CalendarAssignableParticipant[];
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  detail: ProductionProposalDetail;
  materialPlanningActions?: MaterialPlanningActions;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeReviewTab?: (tab: ProductionReviewTab) => void;
  onApprove?: (
    reason: string,
    permitWaiverReason?: string
  ) => Promise<unknown> | unknown;
  onClose?: (startDate: string, reason: string) => Promise<unknown> | unknown;
  onCommitCalendarEdit?: (
    request: CalendarEditRequest
  ) => Promise<unknown> | unknown;
  onCreateCalendarSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    sourceId: string;
    surface: "activeBuild" | "proposal";
  }) =>
    | Promise<CalendarSyncSubscriptionResult>
    | CalendarSyncSubscriptionResult
    | void;
  onCreateCalendarReminderEvent?: (
    input: CalendarReminderEventInput
  ) => Promise<unknown> | unknown;
  onDeleteCalendarReminderEvent?: (input: {
    eventId: string;
    reason?: string;
  }) => Promise<unknown> | unknown;
  onRecordExternalCalendarSyncChange?: (input: {
    changeKey: string;
    externalEventId?: string;
    payload: unknown;
    provider: "google" | "ics" | "outlook";
    subscriptionKey?: string;
  }) => Promise<unknown> | unknown;
  onReject?: (reason: string) => Promise<unknown> | unknown;
  onRequestChanges?: (reason: string) => Promise<unknown> | unknown;
  onSubmit?: () => Promise<unknown> | unknown;
  onAssignBroker?: (
    assignedBrokerWorkosUserId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onAssignBuilder?: (builderProfileId: string) => Promise<unknown> | unknown;
  onOnboardBuilder?: () => void;
  onUnassignBuilder?: () => Promise<unknown> | unknown;
  onCreatePacketMilestone?: (
    milestone: PacketMilestoneCreatePayload
  ) => Promise<unknown> | unknown;
  onUploadPermitDocument?: (file: File) => Promise<unknown> | unknown;
  onUpdateApprovedAmount?: (
    approvedAmountCents: number
  ) => Promise<unknown> | unknown;
  onUpdateCalendarReminderEvent?: (
    input: CalendarReminderEventInput & { eventId: string }
  ) => Promise<unknown> | unknown;
  onUpdateInterestRate?: (
    interestAnnualBps: number
  ) => Promise<unknown> | unknown;
  onUpdatePacketMilestone?: (
    milestoneKey: string,
    patch: PacketMilestonePatch
  ) => Promise<unknown> | unknown;
  onUpdateProposedStartDate?: (
    proposedStartDate: string
  ) => Promise<unknown> | unknown;
  onCreateClaimLink?: () =>
    | Promise<{ claimPath: string; claimToken: string; expiresAt: number }>
    | { claimPath: string; claimToken: string; expiresAt: number };
  onSaveCalendarView?: (input: {
    filters: CalendarFilters;
    isDefault?: boolean;
    label: string;
    timeframe: CalendarTimeframe;
    viewKey: string;
  }) => Promise<unknown> | unknown;
  onUpdateDraw?: (
    drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      reason: string;
      timingDay: number;
    }
  ) => Promise<unknown> | unknown;
  milestones?: ReactNode;
  staff?: ReactNode;
  timeline?: ReactNode;
  initialActiveTab?: ProductionReviewTab;
}) {
  const [reason, setReason] = useState("");
  const [permitWaiverReason, setPermitWaiverReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [drawAmounts, setDrawAmounts] = useState<Record<string, string>>({});
  const [drawLabels, setDrawLabels] = useState<Record<string, string>>({});
  const [drawTimingDays, setDrawTimingDays] = useState<Record<string, string>>(
    {}
  );
  const [pendingDecision, setPendingDecision] = useState<
    "approve" | "reject" | "requestChanges" | null
  >(null);
  const [submitPending, setSubmitPending] = useState(false);
  const proposal = detail.proposal;
  const proposedStartDate = proposal.proposedStartDate ?? "";
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);
  const canEditProposalCapitalTerms =
    !detail.activeBuild && proposal.status !== "closed";
  const canEditApprovedAmount =
    Boolean(onUpdateApprovedAmount) && canEditProposalCapitalTerms;
  const canEditInterestRate =
    Boolean(onUpdateInterestRate) && canEditProposalCapitalTerms;
  const reviewReason = reason.trim();
  const permitWaiverReviewReason = permitWaiverReason.trim();
  const editableDraws = detail.draws ?? [];
  const headerApprovedAmountCents = calculateProposalApprovedAmountCents(
    proposal,
    editableDraws
  );
  const headerMinimumApprovedAmountCents =
    calculateProposalTotalDrawAmountCents(editableDraws);
  const canEditDraws =
    !!onUpdateDraw &&
    (proposal.status === "draft" ||
      proposal.status === "submitted" ||
      proposal.status === "approved");
  const drawEditReasonRequired =
    proposal.status === "submitted" || proposal.status === "approved";
  const canRunReviewDecision = Boolean(
    onApprove && onReject && onRequestChanges
  );
  const canSubmitProposal = Boolean(onSubmit);
  const canRecordClosing = Boolean(onClose);
  const tabs = useMemo(() => {
    const nextTabs: { label: string; value: ProductionReviewTab }[] = [];
    nextTabs.push({ label: "Packet", value: "packet" });
    if (timeline) {
      nextTabs.push({ label: "Timeline", value: "timeline" });
    }
    if (gantt) {
      nextTabs.push({ label: "Gantt", value: "gantt" });
    }
    nextTabs.push({ label: "Milestones", value: "milestones" });
    nextTabs.push({ label: "Calendar", value: "calendar" });
    if (contractors) {
      nextTabs.push({ label: "Contractors", value: "contractors" });
    }
    nextTabs.push({ label: "Review", value: "review" });
    if (editableDraws.length > 0) {
      nextTabs.push({ label: "Draw schedule", value: "draws" });
    }
    nextTabs.push({ label: "Materials", value: "materials" });
    if (staff) {
      nextTabs.push({ label: "Staff", value: "staff" });
    }
    if (proposal.status === "approved" || proposal.status === "closed") {
      nextTabs.push({ label: "Closing", value: "closing" });
    }
    return nextTabs;
  }, [
    contractors,
    editableDraws.length,
    gantt,
    proposal.status,
    staff,
    timeline,
  ]);
  const proposalCalendarActions = useMemo<ProposalCalendarAdapterActions>(
    () => ({
      ...calendarAdapterActions,
      reviseDrawTiming:
        calendarAdapterActions?.reviseDrawTiming ??
        (onUpdateDraw
          ? (input) => {
              const draw = editableDraws.find(
                (candidate) => candidate.drawKey === input.drawKey
              );
              if (!draw) {
                return;
              }
              onUpdateDraw(input.drawKey, {
                amountCents: draw.amountCents,
                label: draw.label,
                reason: input.reason ?? "Calendar draw timing edit.",
                timingDay: input.timingDay,
              });
            }
          : undefined),
    }),
    [calendarAdapterActions, editableDraws, onUpdateDraw]
  );
  const effectiveCalendarWorkspace = useMemo(
    () =>
      calendarWorkspace ??
      buildProposalCalendarWorkspaceFromDetail(detail, {
        baseDate:
          detail.activeBuild?.startDate ||
          proposal.proposedStartDate ||
          undefined,
      }),
    [calendarWorkspace, detail, proposal.proposedStartDate]
  );
  const effectiveCalendarActions = useMemo(
    () => buildProposalCalendarActions(proposalCalendarActions),
    [proposalCalendarActions]
  );
  const fallbackCalendarEdit = useMemo(
    () =>
      createProposalCalendarEditHandler({
        actions: proposalCalendarActions,
        baseDate:
          detail.activeBuild?.startDate ??
          proposal.proposedStartDate ??
          "2026-06-01",
      }),
    [
      detail.activeBuild?.startDate,
      proposal.proposedStartDate,
      proposalCalendarActions,
    ]
  );
  const [activeTab, setActiveTab] = useState<ProductionReviewTab>(
    initialActiveTab ?? "packet"
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(tabs[0]?.value ?? "review");
    }
  }, [activeTab, tabs]);
  useEffect(() => {
    if (
      initialActiveTab &&
      tabs.some((tab) => tab.value === initialActiveTab)
    ) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab, tabs]);

  useEffect(() => {
    if (!detail.activeBuild && proposal.status === "approved") {
      setStartDate((current) => current || proposedStartDate);
    }
  }, [detail.activeBuild, proposal.status, proposedStartDate]);

  const activeTabLabel =
    tabs.find((tab) => tab.value === activeTab)?.label ?? "Proposal stage";
  const compactStageState = proposalCompactStageState(proposal.status);
  const changeReviewTab = (value: string) => {
    const next = value as ProductionReviewTab;
    setActiveTab(next);
    onChangeReviewTab?.(next);
  };

  const runReviewDecision = async (
    decision: "approve" | "reject" | "requestChanges"
  ) => {
    if (!canRunReviewDecision) {
      toast.error("You do not have permission to review this proposal.");
      return;
    }
    if (proposal.status !== "submitted") {
      toast.error("This proposal is no longer awaiting review.");
      return;
    }
    if (!reviewReason) {
      toast.error("Decision reason required.", {
        description:
          "Add the audit reason before requesting changes, rejecting, or approving.",
      });
      return;
    }
    if (
      decision === "approve" &&
      !(permit || detail.permitWaiver) &&
      !permitWaiverReviewReason
    ) {
      toast.error("Permit waiver reason required.", {
        description:
          "No permit PDF is linked, so approval needs a recorded waiver reason.",
      });
      return;
    }

    setPendingDecision(decision);
    try {
      if (decision === "approve") {
        await onApprove?.(reviewReason, permitWaiverReviewReason || undefined);
      } else if (decision === "reject") {
        await onReject?.(reviewReason);
      } else {
        await onRequestChanges?.(reviewReason);
      }
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingDecision(null);
    }
  };

  const submitProposal = async () => {
    if (!canSubmitProposal) {
      toast.error("You do not have permission to submit this proposal.");
      return;
    }
    if (proposal.status !== "draft") {
      toast.error("This proposal is no longer in draft.");
      return;
    }
    if (!proposal.selectedPlan) {
      toast.error("Select a preferred plan before submitting the proposal.");
      return;
    }
    setSubmitPending(true);
    try {
      await onSubmit?.();
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setSubmitPending(false);
    }
  };

  const renderReviewDecisionPanel = (idPrefix: string) => (
    <ProposalReviewDecisionPanel
      idPrefix={idPrefix}
      onReasonChange={setReason}
      onReviewDecision={runReviewDecision}
      pendingDecision={pendingDecision}
      proposal={proposal}
      reason={reason}
    />
  );

  const renderReviewOverview = ({
    idPrefix,
    includePermitUpload = false,
  }: {
    idPrefix: string;
    includePermitUpload?: boolean;
  }) => (
    <div
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]"
      data-testid="proposal-review-overview"
    >
      <div
        className="grid min-w-0 gap-4"
        data-testid="proposal-review-primary-column"
      >
        {proposal.status === "approved" ? (
          <ApprovedProposalConfirmation detail={detail} />
        ) : canRunReviewDecision ? (
          renderReviewDecisionPanel(idPrefix)
        ) : (
          <Section title="Review summary">
            <div className="grid gap-3">
              <div>
                <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
                <h2 className="mt-2 font-semibold text-xl tracking-tight">
                  {proposal.buildName}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {proposal.location}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                Review decisions are limited to authorized lender approval
                surfaces.
              </p>
            </div>
          </Section>
        )}

        <Section title="Readiness">
          <ProposalReadinessList
            canRecordPermitWaiverReason={canRunReviewDecision}
            detail={detail}
            onPermitWaiverReasonChange={setPermitWaiverReason}
            onUploadPermitDocument={
              includePermitUpload ? onUploadPermitDocument : undefined
            }
            permitFileName={permit?.fileName}
            permitViewerDocument={permitViewerDocument}
            permitWaiverReason={permitWaiverReason}
            proposalStatus={proposal.status}
          />
        </Section>
      </div>

      <div
        className="grid min-w-0 gap-4"
        data-testid="proposal-review-context-column"
      >
        <Section title="Review snapshot">
          <DetailGrid
            rows={[
              ["Total budget", formatCents(proposal.totalBudgetCents)],
              [
                "Borrower starting cash",
                formatCents(proposal.borrowerStartingCashCents),
              ],
              [
                "Approved amount",
                formatCents(
                  calculateProposalApprovedAmountCents(
                    proposal,
                    detail.draws ?? detail.plannedDraws
                  )
                ),
              ],
            ]}
          />
        </Section>

        <BuilderAssignmentSection
          assignableBrokerages={assignableBrokerages}
          assignment={detail.assignment}
          brokerOptionsPending={brokerOptionsPending}
          builders={builders}
          onAssignBroker={onAssignBroker}
          onAssignBuilder={onAssignBuilder}
          onCreateClaimLink={onCreateClaimLink}
          onOnboardBuilder={onOnboardBuilder}
          onUnassignBuilder={onUnassignBuilder}
          proposal={proposal}
        />
      </div>
    </div>
  );

  const reviewTabPanelClassName = "w-full min-w-0";

  return (
    <section
      className="flex min-h-[calc(100vh-4rem)] w-full min-w-0 flex-1 flex-col bg-muted/30 p-0 md:p-5"
      data-testid="production-proposal-review-tabs"
    >
      <Tabs
        className="flex w-full min-w-0 flex-col gap-4"
        onValueChange={changeReviewTab}
        value={activeTab}
      >
        <Frame className="w-full min-w-0">
          <FramePanel className="flex w-full min-w-0 flex-col gap-3 p-3">
            <div
              className="grid w-full min-w-0 gap-2 xl:hidden"
              data-testid="proposal-compact-stage-picker"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">Current stage</p>
                  <p
                    className="break-words font-semibold text-base"
                    data-testid="proposal-compact-active-stage"
                  >
                    {activeTabLabel}
                  </p>
                </div>
                <Badge variant="outline">{compactStageState}</Badge>
              </div>
              <NativeSelect
                aria-label="Proposal workspace stage"
                className="w-full"
                onChange={(event) => changeReviewTab(event.target.value)}
                value={activeTab}
              >
                {tabs.map((tab) => (
                  <NativeSelectOption key={tab.value} value={tab.value}>
                    {tab.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <TabsList
              aria-label="Proposal workspace sections"
              className="hidden w-full max-w-full flex-wrap justify-start overflow-visible xl:flex"
              variant="underline"
            >
              {tabs.map((tab) => (
                <TabsTab key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTab>
              ))}
            </TabsList>
            <ProposalReviewHeaderSummary
              approvedAmountCents={headerApprovedAmountCents}
              canEditApprovedAmount={canEditApprovedAmount}
              canEditInterestRate={canEditInterestRate}
              minimumApprovedAmountCents={headerMinimumApprovedAmountCents}
              onUpdateApprovedAmount={onUpdateApprovedAmount}
              onUpdateInterestRate={onUpdateInterestRate}
              proposal={proposal}
            />
          </FramePanel>
        </Frame>

        <div
          className="w-full min-w-0"
          data-testid="production-proposal-review-tab-panels"
        >
          {timeline ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-timeline-tab"
              value="timeline"
            >
              <div className="w-full min-w-0 overflow-x-auto">{timeline}</div>
            </TabsPanel>
          ) : null}

          {gantt ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-gantt-tab"
              value="gantt"
            >
              <div className="w-full min-w-0 overflow-x-auto">{gantt}</div>
            </TabsPanel>
          ) : null}

          <TabsPanel
            className={reviewTabPanelClassName}
            data-testid="production-proposal-milestones-tab"
            value="milestones"
          >
            {milestones ?? (
              <ProductionProposalMilestoneWorksheet
                detail={detail}
                footerExtra={
                  <div className="timeline-blueprint-metric">
                    <span>Proposal budget</span>
                    <strong>{formatCents(proposal.totalBudgetCents)}</strong>
                  </div>
                }
                showHeading
                templateTitle={proposal.buildName}
              />
            )}
          </TabsPanel>

          {contractors ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-contractors-tab"
              value="contractors"
            >
              {contractors}
            </TabsPanel>
          ) : null}

          <TabsPanel
            className={reviewTabPanelClassName}
            data-testid="production-proposal-calendar-tab"
            value="calendar"
          >
            <CalendarWorkspace
              actions={effectiveCalendarActions}
              assignableParticipants={calendarAssignableParticipants}
              initialTimeframe={
                calendarTimeframe ?? effectiveCalendarWorkspace.defaultTimeframe
              }
              onCommitEdit={onCommitCalendarEdit ?? fallbackCalendarEdit}
              onCreateReminderEvent={onCreateCalendarReminderEvent}
              onCreateSyncSubscription={onCreateCalendarSyncSubscription}
              onDeleteReminderEvent={onDeleteCalendarReminderEvent}
              onRecordExternalSyncChange={onRecordExternalCalendarSyncChange}
              onSaveView={onSaveCalendarView}
              onTimeframeChange={onChangeCalendarTimeframe}
              onUpdateReminderEvent={onUpdateCalendarReminderEvent}
              workspace={effectiveCalendarWorkspace}
            />
          </TabsPanel>

          <TabsPanel
            className={reviewTabPanelClassName}
            data-testid="production-proposal-review-tab"
            value="review"
          >
            {renderReviewOverview({ idPrefix: "production-review-tab" })}
          </TabsPanel>

          {editableDraws.length > 0 ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-draws-tab"
              value="draws"
            >
              {canEditDraws ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                  <Section title="Backoffice draw schedule">
                    <ProductionProposalDrawScheduleEditor
                      canEditDraws={canEditDraws}
                      drawAmounts={drawAmounts}
                      drawLabels={drawLabels}
                      draws={editableDraws}
                      drawTimingDays={drawTimingDays}
                      onAmountChange={(drawKey, value) =>
                        setDrawAmounts((current) => ({
                          ...current,
                          [drawKey]: value,
                        }))
                      }
                      onCommit={(drawKey, patch) => {
                        if (drawEditReasonRequired && !reviewReason) {
                          toast.error("Draw edit reason required.", {
                            description:
                              "Enter a change reason before saving a draw schedule row.",
                          });
                          return;
                        }
                        void Promise.resolve(
                          onUpdateDraw?.(drawKey, {
                            ...patch,
                            reason: drawEditReasonRequired
                              ? reason
                              : reason || "Draft draw schedule edit.",
                          })
                        )
                          .then(() => {
                            setDrawAmounts((current) => {
                              const next = { ...current };
                              delete next[drawKey];
                              return next;
                            });
                            setDrawLabels((current) => {
                              const next = { ...current };
                              delete next[drawKey];
                              return next;
                            });
                            setDrawTimingDays((current) => {
                              const next = { ...current };
                              delete next[drawKey];
                              return next;
                            });
                          })
                          .catch((error) => {
                            toast.error(
                              productionProposalActionErrorMessage(error)
                            );
                          });
                      }}
                      onLabelChange={(drawKey, value) =>
                        setDrawLabels((current) => ({
                          ...current,
                          [drawKey]: value,
                        }))
                      }
                      onTimingChange={(drawKey, value) =>
                        setDrawTimingDays((current) => ({
                          ...current,
                          [drawKey]: value,
                        }))
                      }
                    />
                  </Section>
                  <Section title="Draw edit reason">
                    <div className="grid gap-2">
                      <Label htmlFor="production-draw-edit-reason">
                        Change reason
                      </Label>
                      <Input
                        id="production-draw-edit-reason"
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Required before saving draw rows"
                        value={reason}
                      />
                      <p className="text-muted-foreground text-xs">
                        Draw schedule edits are audited with this reason.
                      </p>
                    </div>
                  </Section>
                </div>
              ) : (
                <Section title="Draw schedule">
                  <ProposalDrawScheduleSnapshot draws={editableDraws} />
                </Section>
              )}
            </TabsPanel>
          ) : null}

          <TabsPanel
            className={reviewTabPanelClassName}
            data-testid="production-proposal-materials-tab"
            value="materials"
          >
            <MaterialPlanningTab
              actions={materialPlanningActions}
              budgetImpact={{
                borrowerCoPayBps: proposal.borrowerCoPayBps,
                proposalBudgetCents: proposal.totalBudgetCents,
              }}
              budgetTreatmentEnabled
              defaultBudgetTreatment="logOnly"
              items={detail.costItems ?? []}
              milestones={materialPlanningMilestones(detail)}
              readOnly={!materialPlanningActions}
              scopeLabel="Build Proposal"
            />
          </TabsPanel>

          {staff ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-staff-tab"
              value="staff"
            >
              {staff}
            </TabsPanel>
          ) : null}

          <TabsPanel
            className={reviewTabPanelClassName}
            data-testid="production-proposal-packet-tab"
            value="packet"
          >
            <div className="grid gap-4">
              {renderReviewOverview({
                idPrefix: "production-packet-tab",
                includePermitUpload: true,
              })}
              {proposal.selectedPlan ? (
                <Section title="Selected plan">
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{proposal.selectedPlan.name}</Badge>
                      <span className="text-muted-foreground text-sm">
                        Builder-selected proposal plan
                      </span>
                    </div>
                    {proposal.selectedPlan.recommendationReason ? (
                      <p className="text-muted-foreground text-sm">
                        {proposal.selectedPlan.recommendationReason}
                      </p>
                    ) : null}
                    {proposal.selectedPlan.metrics ? (
                      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                        <ProposalPlanMetric
                          label="Duration"
                          value={`${proposal.selectedPlan.metrics.projectedDurationDays} days`}
                        />
                        <ProposalPlanMetric
                          label="Draw fees"
                          value={formatCents(
                            proposal.selectedPlan.metrics.drawFeesCents
                          )}
                        />
                        <ProposalPlanMetric
                          label="Projected interest"
                          value={formatCents(
                            proposal.selectedPlan.metrics.interestCostCents
                          )}
                        />
                        <ProposalPlanMetric
                          label="Borrower starting cash"
                          value={formatCents(
                            proposal.selectedPlan.metrics.startingCashCents
                          )}
                        />
                        {proposal.selectedPlan.metrics
                          .requiredWorkingCapitalCents === undefined ? null : (
                          <ProposalPlanMetric
                            label="Required working capital"
                            value={formatCents(
                              proposal.selectedPlan.metrics
                                .requiredWorkingCapitalCents
                            )}
                          />
                        )}
                      </dl>
                    ) : null}
                  </div>
                </Section>
              ) : null}
              {proposal.status === "draft" && canSubmitProposal ? (
                <Section title="Submit proposal">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Badge variant="outline">Draft</Badge>
                      <p className="mt-2 text-muted-foreground text-sm">
                        {proposal.selectedPlan
                          ? "Submit the builder-selected reimbursement plan for lender review when the packet, milestones, and draw schedule are ready."
                          : "Select a preferred plan before submitting this proposal for lender review."}
                      </p>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      data-testid="production-proposal-submit-cta"
                      disabled={submitPending || !proposal.selectedPlan}
                      onClick={() => void submitProposal()}
                    >
                      <Send />
                      {submitPending ? "Submitting..." : "Submit proposal"}
                    </Button>
                  </div>
                </Section>
              ) : null}
              <ProposalPacketSnapshot
                detail={detail}
                mergedWithReview
                onCreateMilestone={onCreatePacketMilestone}
                onUpdateMilestone={onUpdatePacketMilestone}
                onUpdatePermitDocument={onUploadPermitDocument}
                onUpdateProposedStartDate={onUpdateProposedStartDate}
              />
            </div>
          </TabsPanel>

          {proposal.status === "approved" || proposal.status === "closed" ? (
            <TabsPanel
              className={reviewTabPanelClassName}
              data-testid="production-proposal-closing-tab"
              value="closing"
            >
              <Section title="Offline closing">
                {detail.activeBuild ? (
                  <p className="text-sm">
                    Active build starts {detail.activeBuild.startDate}.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No active build created yet.
                  </p>
                )}
                <div className="mt-3 grid max-w-sm gap-2">
                  <Label htmlFor="production-build-start-date">
                    Build start date
                  </Label>
                  <Input
                    id="production-build-start-date"
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                  <Button
                    disabled={
                      !canRecordClosing ||
                      proposal.status !== "approved" ||
                      !startDate
                    }
                    onClick={() =>
                      onClose?.(startDate, reason || "Loan closed offline.")
                    }
                    size="sm"
                  >
                    <CalendarClock />
                    Record closing
                  </Button>
                </div>
              </Section>
            </TabsPanel>
          ) : null}
        </div>
      </Tabs>
    </section>
  );
}

function productionProposalActionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Review action failed.";
  }
  const message = error.message.trim();
  if (!message) {
    return "Review action failed.";
  }
  const uncaughtMatch = message.match(/Uncaught Error:\s*([^\n]+)/);
  return uncaughtMatch?.[1]?.trim() || message;
}

function ProposalDrawScheduleSnapshot({ draws }: { draws: ProductionDraw[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draw</TableHead>
          <TableHead>Timing</TableHead>
          <TableHead className="text-right">Available</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {draws.map((draw) => (
          <TableRow key={draw.drawKey}>
            <TableCell>{draw.label}</TableCell>
            <TableCell>Day {draw.timingDay}</TableCell>
            <TableCell className="text-right">
              {formatCents(draw.amountCents)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProposalReviewHeaderSummary({
  approvedAmountCents,
  canEditApprovedAmount,
  canEditInterestRate,
  minimumApprovedAmountCents,
  onUpdateApprovedAmount,
  onUpdateInterestRate,
  proposal,
}: {
  approvedAmountCents: number;
  canEditApprovedAmount: boolean;
  canEditInterestRate: boolean;
  minimumApprovedAmountCents: number;
  onUpdateApprovedAmount?: (
    approvedAmountCents: number
  ) => Promise<unknown> | unknown;
  onUpdateInterestRate?: (
    interestAnnualBps: number
  ) => Promise<unknown> | unknown;
  proposal: ProductionProposal;
}) {
  const [optimisticApprovedAmount, setOptimisticApprovedAmount] = useState<{
    previousCents: number;
    valueCents: number;
  } | null>(null);
  const visibleApprovedAmountCents =
    optimisticApprovedAmount?.valueCents ?? approvedAmountCents;
  const approvedAmountDollars = visibleApprovedAmountCents / 100;
  const interestAnnualBps = proposal.interestAnnualBps ?? 925;
  const [approvedAmountPending, setApprovedAmountPending] = useState(false);
  const [interestPending, setInterestPending] = useState(false);

  useEffect(() => {
    if (!optimisticApprovedAmount) {
      return;
    }
    if (
      approvedAmountCents === optimisticApprovedAmount.valueCents ||
      approvedAmountCents !== optimisticApprovedAmount.previousCents
    ) {
      setOptimisticApprovedAmount(null);
    }
  }, [approvedAmountCents, optimisticApprovedAmount]);

  async function saveApprovedAmount(nextApprovedAmountDollars: number) {
    if (!onUpdateApprovedAmount) {
      return;
    }
    const nextApprovedAmountCents = Math.max(
      0,
      Math.round(nextApprovedAmountDollars * 100)
    );
    if (!Number.isFinite(nextApprovedAmountCents)) {
      toast.error("Enter a valid approved amount.");
      return;
    }
    const normalizedApprovedAmountCents = Math.max(
      minimumApprovedAmountCents,
      nextApprovedAmountCents
    );
    setOptimisticApprovedAmount({
      previousCents: approvedAmountCents,
      valueCents: normalizedApprovedAmountCents,
    });
    setApprovedAmountPending(true);
    try {
      await onUpdateApprovedAmount(normalizedApprovedAmountCents);
      toast.success("Approved amount updated.");
    } catch (error) {
      setOptimisticApprovedAmount(null);
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setApprovedAmountPending(false);
    }
  }

  async function saveInterestRate(nextInterestAnnualBps: number) {
    if (!onUpdateInterestRate) {
      return;
    }
    if (!Number.isFinite(nextInterestAnnualBps)) {
      toast.error("Enter a valid interest rate.");
      return;
    }
    setInterestPending(true);
    try {
      await onUpdateInterestRate(nextInterestAnnualBps);
      toast.success("Interest rate updated.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setInterestPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 text-muted-foreground text-xs lg:justify-end">
      <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
      <span className="max-w-48 truncate">{proposal.buildName}</span>
      <span aria-hidden>·</span>
      <span className="max-w-48 truncate">{proposal.location}</span>
      <HeaderFinancialMetric
        label="Total budget"
        value={formatCents(proposal.totalBudgetCents)}
      />
      {canEditApprovedAmount ? (
        <HeaderEditableMetric
          label="Total approved"
          pending={approvedAmountPending}
          value={
            <EditableNumberChip
              ariaLabel="Total approved"
              disabled={approvedAmountPending}
              formatDisplay={(value) => formatCents(value * 100)}
              formatDraft={(value) => String(Math.round(value * 100) / 100)}
              inputMode="decimal"
              inputWidth="5.8rem"
              min={0}
              onCommit={(value) => {
                saveApprovedAmount(value);
              }}
              reserveWidth="7.4rem"
              size="metric-sm"
              step={1000}
              testId="proposal-header-approved-amount-chip"
              tone="light"
              value={approvedAmountDollars}
              weight="semibold"
            />
          }
        />
      ) : (
        <HeaderFinancialMetric
          label="Total approved"
          value={formatCents(visibleApprovedAmountCents)}
        />
      )}
      {canEditInterestRate ? (
        <HeaderEditableMetric
          label="Interest rate"
          pending={interestPending}
          value={
            <EditableNumberChip
              ariaLabel="Interest rate"
              disabled={interestPending}
              formatDisplay={(value) => formatInterestAnnualBps(value)}
              formatDraft={(value) => formatInterestRateDraft(value)}
              inputMode="decimal"
              inputWidth="3.5rem"
              min={0}
              onCommit={(value) => {
                saveInterestRate(value);
              }}
              parseCommit={parseInterestRateDraftToBps}
              reserveWidth="4.8rem"
              size="metric-sm"
              step={0.25}
              testId="proposal-header-interest-rate-chip"
              tone="light"
              value={interestAnnualBps}
              weight="semibold"
            />
          }
        />
      ) : (
        <HeaderFinancialMetric
          label="Interest rate"
          value={formatInterestAnnualBps(interestAnnualBps)}
        />
      )}
    </div>
  );
}

function HeaderEditableMetric({
  label,
  pending,
  value,
}: {
  label: string;
  pending?: boolean;
  value: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="shrink-0">{value}</span>
      {pending ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          Saving
        </span>
      ) : null}
    </span>
  );
}

function HeaderFinancialMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-xs/5">
      <span className="text-muted-foreground">{label}</span>
      <strong className="font-semibold text-foreground tabular-nums">
        {value}
      </strong>
    </span>
  );
}

function BuilderAssignmentSection({
  assignment,
  assignableBrokerages,
  brokerOptionsPending,
  builders,
  onAssignBroker,
  onAssignBuilder,
  onCreateClaimLink,
  onOnboardBuilder,
  onUnassignBuilder,
  proposal,
}: {
  assignment?: ProductionProposalAssignment | null;
  assignableBrokerages: BrokerAssignmentBrokerage[];
  brokerOptionsPending: boolean;
  builders: ProductionBuilderOption[];
  onAssignBroker?: (
    assignedBrokerWorkosUserId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onAssignBuilder?: (builderProfileId: string) => Promise<unknown> | unknown;
  onCreateClaimLink?: () =>
    | Promise<{ claimPath: string; claimToken: string; expiresAt: number }>
    | { claimPath: string; claimToken: string; expiresAt: number };
  onOnboardBuilder?: () => void;
  onUnassignBuilder?: () => Promise<unknown> | unknown;
  proposal: ProductionProposal;
}) {
  const builderAssigned =
    assignment?.builderAssigned ?? Boolean(assignment?.builder);
  const [selectedBuilderId, setSelectedBuilderId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [brokerDialogOpen, setBrokerDialogOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [claimLink, setClaimLink] = useState("");
  const [claimExpiresAt, setClaimExpiresAt] = useState<number | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    onCopy: () => toast.success("Builder claim link copied."),
  });
  const canCreateClaimLink =
    proposal.status === "draft" &&
    !builderAssigned &&
    Boolean(onCreateClaimLink);
  const canManageAssignment =
    proposal.status !== "closed" &&
    !builderAssigned &&
    Boolean(onAssignBuilder || onOnboardBuilder || canCreateClaimLink);
  const canUnassignBuilder =
    proposal.status === "draft" &&
    builderAssigned &&
    Boolean(onUnassignBuilder);
  const canAssignBroker =
    proposal.status !== "closed" &&
    Boolean(onAssignBroker) &&
    Boolean(assignment?.brokerage?._id);
  const brokerAssignmentTarget = {
    _id: assignment?.builder?._id ?? proposal._id ?? "proposal",
    brokerage: assignment?.brokerage?._id
      ? { _id: assignment.brokerage._id }
      : null,
    brokerAssignment: {
      assignedBrokerWorkosUserId: assignment?.broker?.workosUserId,
      broker: assignment?.broker,
    },
    displayName: assignment?.builder?.displayName ?? proposal.buildName,
  };

  useEffect(() => {
    if (builderAssigned) {
      setSelectedBuilderId("");
      setClaimLink("");
      setClaimExpiresAt(null);
    }
  }, [builderAssigned]);

  async function handleAssignBuilder() {
    if (!(onAssignBuilder && selectedBuilderId)) {
      return;
    }
    setAssigning(true);
    try {
      await onAssignBuilder(selectedBuilderId);
      toast.success("Builder assigned.");
      setSelectedBuilderId("");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setAssigning(false);
    }
  }

  async function handleCreateClaimLink() {
    if (!onCreateClaimLink) {
      return;
    }
    setCreatingLink(true);
    try {
      const result = await onCreateClaimLink();
      const url = buildAbsoluteClaimUrl(result.claimPath);
      setClaimLink(url);
      setClaimExpiresAt(result.expiresAt);
      copyToClipboard(url);
      toast.success("Builder claim link created.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleUnassignBuilder() {
    if (!onUnassignBuilder) {
      return;
    }
    setUnassigning(true);
    try {
      await onUnassignBuilder();
      toast.success("Builder unassigned.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setUnassigning(false);
    }
  }

  const builderAccounts = proposalBuilderAccounts(assignment?.builder);

  return (
    <Section
      action={
        builderAssigned && assignment?.builder?.status ? (
          <Badge variant="success">
            {assignment.builder.status === "active"
              ? "Active builder"
              : assignment.builder.status}
          </Badge>
        ) : undefined
      }
      title="Parties & assignment"
    >
      <div className="grid gap-5">
        {assignment?.builder ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10 border">
                  <AvatarFallback className="bg-muted text-foreground">
                    <Building2 aria-hidden className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-base">
                    {assignment.builder.displayName}
                  </p>
                  <p className="truncate text-muted-foreground text-sm">
                    {assignment.builder.legalName ??
                      assignment.builder.ownerEmail ??
                      "Builder organization"}
                  </p>
                </div>
              </div>
              <Badge variant="outline">
                <UsersRound aria-hidden />
                {builderAccounts.length}{" "}
                {builderAccounts.length === 1 ? "member" : "members"}
              </Badge>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-sm">Owner and staff</h3>
                <span className="text-muted-foreground text-xs">
                  Active builder accounts
                </span>
              </div>
              {builderAccounts.length > 0 ? (
                <ul className="grid gap-2">
                  {builderAccounts.map((account) => (
                    <BuilderTeamMember
                      key={account.workosUserId}
                      member={account}
                    />
                  ))}
                </ul>
              ) : (
                <div className="border-border border-y py-4 text-muted-foreground text-sm">
                  No active owner or staff accounts are linked to this builder.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="size-10 border border-dashed">
                <AvatarFallback>
                  <UsersRound
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <p className="font-semibold">No builder attached</p>
                <p className="max-w-[62ch] text-muted-foreground text-sm">
                  Link an onboarded builder, or create a new builder account and
                  attach it to this Build Proposal automatically.
                </p>
              </div>
            </div>

            {canManageAssignment ? (
              <div className="grid gap-3">
                {onAssignBuilder ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="grid gap-1">
                      <Label htmlFor="production-builder-assignee">
                        Existing builder
                      </Label>
                      <BuilderProfileAutocomplete
                        disabled={assigning}
                        id="production-builder-assignee"
                        onValueChange={setSelectedBuilderId}
                        options={builders}
                        value={selectedBuilderId}
                      />
                    </div>
                    <Button
                      disabled={!selectedBuilderId}
                      loading={assigning}
                      onClick={handleAssignBuilder}
                      size="sm"
                    >
                      <Link2 aria-hidden />
                      Link builder
                    </Button>
                  </div>
                ) : null}
                {onOnboardBuilder ? (
                  <Button
                    onClick={onOnboardBuilder}
                    size="sm"
                    variant="outline"
                  >
                    <UserPlus aria-hidden />
                    Onboard new builder
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Builder assignment is locked at this proposal stage.
              </p>
            )}
          </div>
        )}

        {canUnassignBuilder ? (
          <div className="border-t pt-4">
            <Button
              loading={unassigning}
              onClick={handleUnassignBuilder}
              size="sm"
              variant="destructive-outline"
            >
              <UserRoundX aria-hidden />
              Unassign builder
            </Button>
          </div>
        ) : null}

        {canCreateClaimLink ? (
          <div className="grid gap-3 border-t pt-4">
            {onCreateClaimLink ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Builder self-claim link</Label>
                  {assignment?.claimLinkActive && !claimLink ? (
                    <Badge variant="outline">Active link exists</Badge>
                  ) : null}
                </div>
                <Button
                  disabled={!onCreateClaimLink}
                  loading={creatingLink}
                  onClick={handleCreateClaimLink}
                  size="sm"
                  variant="outline"
                >
                  <Link2 aria-hidden />
                  {assignment?.claimLinkActive || claimLink
                    ? "Regenerate self-claim link"
                    : "Create self-claim link"}
                </Button>
                {claimLink ? (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <Input readOnly value={claimLink} />
                      <Button
                        aria-label="Copy builder claim link"
                        onClick={() => copyToClipboard(claimLink)}
                        size="icon"
                        variant="outline"
                      >
                        <Copy aria-hidden />
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {isCopied ? "Copied. " : ""}
                      {claimExpiresAt
                        ? `Expires ${formatDateTime(claimExpiresAt)}.`
                        : "No expiration recorded."}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <dl className="grid gap-3 border-t pt-4 text-sm">
          <AssignmentIdentityRow
            action={
              canAssignBroker ? (
                <Button
                  aria-label={`${assignment?.broker ? "Change" : "Assign"} broker for ${brokerAssignmentTarget.displayName}`}
                  onClick={() => setBrokerDialogOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <UserRoundCog aria-hidden />
                  {assignment?.broker ? "Change broker" : "Assign broker"}
                </Button>
              ) : undefined
            }
            label="Broker"
            secondary={assignment?.broker?.email}
            value={formatProposalIdentity(assignment?.broker)}
          />
          <AssignmentIdentityRow
            label="Brokerage"
            secondary={assignment?.brokerage?.workosOrganizationId}
            value={
              assignment?.brokerage?.displayName ??
              assignment?.brokerage?.legalName ??
              "Unknown brokerage"
            }
          />
        </dl>

        <BrokerAssignmentDialog
          brokerages={assignableBrokerages}
          brokerOptionsPending={brokerOptionsPending}
          description={
            assignment?.builder
              ? "Choose the broker accountable for this Build Proposal and its attached Builder relationship. Existing active assignments are transferred, not deleted."
              : "Choose the broker accountable for this Build Proposal and record the assignment reason."
          }
          onAssign={async ({ assignedBrokerWorkosUserId, reason }) => {
            if (!onAssignBroker) {
              return;
            }
            await onAssignBroker(assignedBrokerWorkosUserId, reason);
          }}
          onAssigned={() => {
            setBrokerDialogOpen(false);
            toast.success(
              assignment?.broker ? "Broker reassigned." : "Broker assigned."
            );
          }}
          onOpenChange={setBrokerDialogOpen}
          open={brokerDialogOpen}
          reasonHelpText="Required. This reason is written to the proposal audit trail and, when attached, the Builder assignment history."
          reasonPlaceholder="Explain why this broker should own this Build Proposal."
          targetLabel={assignment?.builder ? "Builder" : "Build Proposal"}
          targets={[brokerAssignmentTarget]}
        />
      </div>
    </Section>
  );
}

type BuilderTeamMemberIdentity = ProductionProposalIdentity & {
  role?: string;
};

function proposalBuilderAccounts(
  builder: ProductionProposalAssignment["builder"]
): BuilderTeamMemberIdentity[] {
  if (!builder) {
    return [];
  }
  const accounts = [...(builder.accounts ?? [])];
  if (accounts.length === 0 && builder.ownerEmail) {
    accounts.push({
      email: builder.ownerEmail,
      role: "owner",
      workosUserId: `owner:${builder.ownerEmail}`,
    });
  }
  return accounts.sort((left, right) => {
    const roleOrder =
      Number(right.role === "owner") - Number(left.role === "owner");
    if (roleOrder !== 0) {
      return roleOrder;
    }
    return builderTeamMemberName(left).localeCompare(
      builderTeamMemberName(right)
    );
  });
}

function BuilderTeamMember({ member }: { member: BuilderTeamMemberIdentity }) {
  const displayName = builderTeamMemberName(member);
  return (
    <li className="flex min-w-0 items-center gap-3 border-border border-t pt-2 first:border-t-0 first:pt-0">
      <Avatar className="size-8 border">
        <AvatarFallback>
          {builderTeamMemberInitials(displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{displayName}</p>
        <p className="truncate text-muted-foreground text-xs">
          {member.email ?? member.workosUserId}
        </p>
      </div>
      <Badge size="sm" variant={member.role === "owner" ? "info" : "outline"}>
        {member.role === "owner" ? "Owner" : "Staff"}
      </Badge>
    </li>
  );
}

function AssignmentIdentityRow({
  action,
  label,
  secondary,
  value,
}: {
  action?: ReactNode;
  label: string;
  secondary?: string | null;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-start-1 min-w-0">
        <span className="block truncate font-medium">{value}</span>
        {secondary ? (
          <span className="block truncate text-muted-foreground text-xs">
            {secondary}
          </span>
        ) : null}
      </dd>
      {action ? (
        <dd className="col-start-2 row-span-2 row-start-1 self-center">
          {action}
        </dd>
      ) : null}
    </div>
  );
}

function builderTeamMemberName(member: BuilderTeamMemberIdentity) {
  return member.name?.trim() || member.email?.trim() || member.workosUserId;
}

function builderTeamMemberInitials(value: string) {
  const segments = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    segments
      .slice(0, 2)
      .map((segment) => segment[0]?.toUpperCase())
      .join("") || "BT"
  );
}

function BuilderProfileAutocomplete({
  disabled,
  id,
  onValueChange,
  options,
  value,
}: {
  disabled?: boolean;
  id: string;
  onValueChange: (value: string) => void;
  options: ProductionBuilderOption[];
  value: string;
}) {
  const selectedOption = useMemo(
    () => options.find((option) => option._id === value),
    [options, value]
  );
  const [query, setQuery] = useState(() =>
    selectedOption ? formatBuilderOptionInputValue(selectedOption) : ""
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(
      selectedOption ? formatBuilderOptionInputValue(selectedOption) : ""
    );
  }, [selectedOption]);

  const filteredOptions = useMemo(
    () => filterBuilderOptions(options, query),
    [options, query]
  );

  function handleInputValueChange(
    nextQuery: string,
    eventDetails: { reason: string }
  ) {
    setQuery(nextQuery);
    if (eventDetails.reason === "input-change") {
      if (
        selectedOption &&
        nextQuery !== formatBuilderOptionInputValue(selectedOption)
      ) {
        onValueChange("");
      }
      setOpen(!disabled);
    }
  }

  return (
    <Combobox<ProductionBuilderOption>
      autoHighlight
      filter={null}
      inputValue={query}
      items={filteredOptions}
      isItemEqualToValue={(option, currentValue) =>
        option._id === currentValue._id
      }
      itemToStringLabel={formatBuilderOptionInputValue}
      itemToStringValue={(option) => option._id}
      modal={false}
      onInputValueChange={handleInputValueChange}
      onOpenChange={(nextOpen) => setOpen(nextOpen && !disabled)}
      onValueChange={(option) => {
        onValueChange(option?._id ?? "");
        setQuery(option ? formatBuilderOptionInputValue(option) : "");
        setOpen(false);
      }}
      open={open && !disabled}
      openOnInputClick
      value={selectedOption ?? null}
    >
      <ComboboxInput
        aria-label="Builder assignee"
        disabled={disabled}
        id={id}
        onClick={() => setOpen(!disabled)}
        onFocus={() => setOpen(!disabled)}
        placeholder="Search builder name or email..."
        showClear
        showTrigger
        startAddon={<Search aria-hidden />}
      />
      <ComboboxPopup>
        <ComboboxEmpty>
          {options.length === 0
            ? "No active builders are available in this brokerage."
            : "No builders match this search."}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: ProductionBuilderOption) => (
            <ComboboxItem
              className="min-h-12 px-2.5 py-2"
              key={option._id}
              value={option}
            >
              <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {option.displayName}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {option.email ??
                      option.workosUserIds?.[0] ??
                      "Builder profile"}
                  </span>
                </span>
                <Badge className="max-w-28 truncate" variant="outline">
                  Builder
                </Badge>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

function filterBuilderOptions(
  options: ProductionBuilderOption[],
  query: string
) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return options;
  }
  return options.filter((option) => {
    const haystack = normalizeSearch(
      [option.displayName, option.email, ...(option.workosUserIds ?? [])]
        .filter(Boolean)
        .join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  });
}

function formatBuilderOptionInputValue(option: ProductionBuilderOption) {
  return option.email
    ? `${option.displayName} (${option.email})`
    : option.displayName;
}

function formatProposalIdentity(
  identity: ProductionProposalIdentity | null | undefined
) {
  if (!identity) {
    return "Unassigned";
  }
  return (
    identity.name?.trim() || identity.email?.trim() || identity.workosUserId
  );
}

function buildAbsoluteClaimUrl(claimPath: string) {
  if (/^https?:\/\//i.test(claimPath)) {
    return claimPath;
  }
  if (typeof window === "undefined") {
    return claimPath;
  }
  return `${window.location.origin}${claimPath.startsWith("/") ? "" : "/"}${claimPath}`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function materialPlanningMilestones(detail: ProductionProposalDetail) {
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  return (detail.milestones ?? []).map((milestone) => ({
    budgetCents: milestone.budgetCents,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    submilestones: (submilestonesByMilestone.get(milestone.key) ?? [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((submilestone) => ({
        budgetCents: submilestone.budgetCents,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
      })),
  }));
}

function draftDrawsForAvailabilityRecalculation(
  draws: ProposalGanttDrawDraft[]
): ProposalGanttDrawDraft[] {
  return draws.map((draw) => ({
    ...draw,
    amountCents: 0,
  }));
}

function productionProposalDetailToDraftDraws(
  detail: ProductionProposalDetail
): ProposalGanttDrawDraft[] {
  return (detail.draws ?? detail.plannedDraws ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        a.timingDay - b.timingDay ||
        a.drawKey.localeCompare(b.drawKey)
    )
    .map((draw, index) => ({
      amountCents: draw.amountCents,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order ?? index + 1,
      timingDay: draw.timingDay,
    }));
}

function allocateEvenlyCents(totalCents: number, count: number) {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(Math.max(0, Math.round(totalCents)) / count);
  let remainder = Math.max(0, Math.round(totalCents)) - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function ApprovedProposalConfirmation({
  detail,
}: {
  detail: ProductionProposalDetail;
}) {
  const proposal = detail.proposal;
  const drawCount = (detail.draws ?? detail.plannedDraws ?? []).length;
  const milestoneCount = detail.milestones?.length ?? 0;

  return (
    <Section title="Review confirmed">
      <div
        className="grid min-h-[24rem] content-center gap-6 py-6 text-center"
        data-testid="approved-proposal-confirmation"
      >
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success ring-1 ring-success/25">
          <CheckCircle2 aria-hidden className="size-8" />
        </div>
        <div className="mx-auto grid max-w-2xl gap-2">
          <Badge className="mx-auto" variant="success">
            Approved
          </Badge>
          <h2 className="font-semibold text-2xl tracking-tight">
            Proposal approved for closing
          </h2>
          <p className="text-muted-foreground text-sm">
            {proposal.buildName} in {proposal.location} is locked for proposal
            review. Use Closing when the loan is signed and the active build is
            ready to start.
          </p>
        </div>
        <div className="mx-auto grid w-full max-w-3xl gap-4 border-y py-4 text-left sm:grid-cols-3 sm:divide-x">
          <div className="grid gap-1 sm:pr-4">
            <span className="text-muted-foreground text-xs">Milestones</span>
            <strong className="font-semibold text-lg">{milestoneCount}</strong>
          </div>
          <div className="grid gap-1 sm:px-4">
            <span className="text-muted-foreground text-xs">Draw rows</span>
            <strong className="font-semibold text-lg">{drawCount}</strong>
          </div>
          <div className="grid gap-1 sm:pl-4">
            <span className="text-muted-foreground text-xs">Next step</span>
            <strong className="font-semibold text-lg">
              {detail.activeBuild ? "Active build ready" : "Record closing"}
            </strong>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ProposalReviewDecisionPanel({
  idPrefix,
  onReasonChange,
  onReviewDecision,
  pendingDecision,
  proposal,
  reason,
}: {
  idPrefix: string;
  onReasonChange: (value: string) => void;
  onReviewDecision: (
    decision: "approve" | "reject" | "requestChanges"
  ) => Promise<void> | void;
  pendingDecision: "approve" | "reject" | "requestChanges" | null;
  proposal: ProductionProposal;
  reason: string;
}) {
  const reviewAvailable = proposal.status === "submitted";
  const disabled = pendingDecision !== null;
  const reasonId = `${idPrefix}-decision-reason`;
  const reasonHelpId = `${idPrefix}-decision-reason-help`;

  return (
    <Section title={reviewAvailable ? "Review decision" : "Proposal status"}>
      <div className="grid gap-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h2 className="mt-2 font-semibold text-xl tracking-tight">
              {proposal.buildName}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {proposal.location}
            </p>
          </div>
          {reviewAvailable ? (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button
                disabled={disabled}
                onClick={() => void onReviewDecision("requestChanges")}
                size="sm"
                variant="outline"
              >
                {pendingDecision === "requestChanges"
                  ? "Requesting..."
                  : "Request Changes"}
              </Button>
              <Button
                disabled={disabled}
                onClick={() => void onReviewDecision("reject")}
                size="sm"
                variant="destructive"
              >
                {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
              </Button>
              <Button
                data-testid={`${idPrefix}-approve-proposal`}
                disabled={disabled}
                onClick={() => void onReviewDecision("approve")}
                size="sm"
              >
                {pendingDecision === "approve"
                  ? "Approving..."
                  : "Approve Proposal"}
              </Button>
            </div>
          ) : null}
        </div>

        {reviewAvailable ? (
          <div className="grid gap-2">
            <Label htmlFor={reasonId}>Decision reason</Label>
            <Input
              aria-describedby={reasonHelpId}
              id={reasonId}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Required for material decisions"
              value={reason}
            />
            <p className="text-muted-foreground text-xs" id={reasonHelpId}>
              Stored on the audit event for approval, rejection, or requested
              changes.
            </p>
          </div>
        ) : (
          <p className="max-w-[65ch] text-muted-foreground text-sm">
            {proposal.status === "draft"
              ? "Decision controls unlock after the builder submits this proposal for lender review."
              : "This proposal is not currently awaiting a lender review decision."}
          </p>
        )}
      </div>
    </Section>
  );
}

function ProposalReadinessList({
  canRecordPermitWaiverReason = false,
  detail,
  onUploadPermitDocument,
  permitFileName,
  permitViewerDocument,
  permitWaiverReason,
  proposalStatus,
  onPermitWaiverReasonChange,
}: {
  canRecordPermitWaiverReason?: boolean;
  detail: ProductionProposalDetail;
  onUploadPermitDocument?: (file: File) => Promise<unknown> | unknown;
  permitFileName?: string;
  permitViewerDocument?: BuildPermitViewerDocument | null;
  permitWaiverReason: string;
  proposalStatus: ProductionProposal["status"];
  onPermitWaiverReasonChange: (value: string) => void;
}) {
  const milestoneCount = detail.milestones?.length ?? 0;
  const drawCount = (detail.draws ?? detail.plannedDraws ?? []).length;
  const pendingWaiverReason = permitWaiverReason.trim();
  const hasPermit = Boolean(permitFileName || permitViewerDocument);
  const hasRecordedWaiver = Boolean(detail.permitWaiver);
  const permitGateReady =
    hasPermit || hasRecordedWaiver || pendingWaiverReason.length > 0;
  const canUploadPermit =
    Boolean(onUploadPermitDocument) &&
    !hasPermit &&
    proposalStatus !== "closed";

  async function uploadPermitDocument(files: File[]) {
    const file = files[0];
    if (!(file && onUploadPermitDocument)) {
      return;
    }
    try {
      await onUploadPermitDocument(file);
      toast.success("Permit uploaded.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
      throw error;
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      <ul className="grid gap-3">
        <li className="flex gap-2">
          {permitGateReady ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {permitFileName
              ? `Permit PDF linked: ${permitFileName}`
              : detail.permitWaiver
                ? `Permit waiver recorded: ${detail.permitWaiver.reason}`
                : pendingWaiverReason
                  ? "Permit waiver reason ready to record on approval."
                  : "Permit PDF or audited waiver is required before approval."}
          </span>
        </li>
        <li className="flex gap-2">
          {milestoneCount > 0 ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {milestoneCount > 0
              ? `${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"} staged for review.`
              : "At least one milestone is required before submission."}
          </span>
        </li>
        <li className="flex gap-2">
          {drawCount > 0 ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <span>
            {drawCount > 0
              ? `${drawCount} reimbursement draw${drawCount === 1 ? "" : "s"} available in the schedule.`
              : "No reimbursement draw rows are available yet."}
          </span>
        </li>
      </ul>

      <div className="grid gap-3 border-t pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Permit requirement</span>
              <Badge variant={permitGateReady ? "success" : "warning"}>
                {permitGateReady ? "Ready" : "Blocked"}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {hasPermit
                ? "Review the uploaded permit before making the approval decision."
                : hasRecordedWaiver
                  ? "The approval package already includes an audited permit waiver."
                  : "Enter the waiver reason here, then approve to create the audited waiver record."}
            </p>
          </div>
          {hasPermit ? (
            <BuildPermitViewerDrawer
              permit={permitViewerDocument}
              size="sm"
              triggerLabel="View uploaded permit"
              triggerTestId="proposal-review-permit-viewer-trigger"
            />
          ) : null}
        </div>

        {hasPermit ||
        hasRecordedWaiver ||
        !canRecordPermitWaiverReason ? null : (
          <div className="grid gap-2">
            <Label htmlFor="production-permit-waiver-readiness">
              Audited permit waiver
            </Label>
            <Textarea
              aria-describedby="production-permit-waiver-readiness-help"
              id="production-permit-waiver-readiness"
              onChange={(event) =>
                onPermitWaiverReasonChange(event.target.value)
              }
              placeholder="Reason permit approval is waived for this proposal"
              rows={3}
              value={permitWaiverReason}
            />
            <p
              className="text-muted-foreground text-xs"
              id="production-permit-waiver-readiness-help"
            >
              {proposalStatus === "submitted"
                ? "Approval records this waiver reason in the audit trail."
                : "This waiver reason is held in the review form until the submitted proposal is approved."}
            </p>
          </div>
        )}

        {canUploadPermit ? (
          <FileUploader
            accept="application/pdf,.pdf,.png,.jpg,.jpeg"
            actionLabel="Upload permit"
            description="Drop the issued permit or browse from your device."
            helperText="PDF preferred. Images are accepted when the municipality issued the permit as an image."
            inputLabel="Select permit document"
            multiple={false}
            onUpload={uploadPermitDocument}
            title="Permit packet"
          />
        ) : null}
      </div>
    </div>
  );
}

function ProposalPacketSnapshot({
  detail,
  mergedWithReview = false,
  onCreateMilestone,
  onUpdateMilestone,
  onUpdatePermitDocument,
  onUpdateProposedStartDate,
}: {
  detail: ProductionProposalDetail;
  mergedWithReview?: boolean;
  onCreateMilestone?: (
    milestone: PacketMilestoneCreatePayload
  ) => Promise<unknown> | unknown;
  onUpdateMilestone?: (
    milestoneKey: string,
    patch: PacketMilestonePatch
  ) => Promise<unknown> | unknown;
  onUpdatePermitDocument?: (file: File) => Promise<unknown> | unknown;
  onUpdateProposedStartDate?: (
    proposedStartDate: string
  ) => Promise<unknown> | unknown;
}) {
  const proposal = detail.proposal;
  const [dateDisplayMode, setDateDisplayMode] = useState<"relative" | "real">(
    "relative"
  );
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState(
    proposal.proposedStartDate ?? ""
  );
  const [startDatePending, setStartDatePending] = useState(false);
  const [editingMilestoneKey, setEditingMilestoneKey] = useState<string | null>(
    null
  );
  const [pendingMilestoneKey, setPendingMilestoneKey] = useState<string | null>(
    null
  );
  const [milestoneDraft, setMilestoneDraft] =
    useState<PacketMilestoneFormDraft | null>(null);
  const [submilestoneOverlayDraft, setSubmilestoneOverlayDraft] =
    useState<PacketSubmilestoneOverlayDraft | null>(null);
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);
  const canUploadPermit =
    Boolean(onUpdatePermitDocument) && proposal.status !== "closed";
  const draws = detail.draws ?? detail.plannedDraws ?? [];
  const approvedAmountCents = calculateProposalApprovedAmountCents(
    proposal,
    draws
  );
  const totalDrawAmountCents = calculateProposalTotalDrawAmountCents(draws);
  const borrowerCoPayCents =
    proposal.borrowerCoPayCents ??
    Math.max(0, proposal.totalBudgetCents - approvedAmountCents);
  const closingGapCents = Math.max(
    0,
    proposal.totalBudgetCents - approvedAmountCents - borrowerCoPayCents
  );
  const closingState = detail.activeBuild?.startDate
    ? `Closed, starts ${detail.activeBuild.startDate}`
    : proposal.status === "approved"
      ? "Approved, closing pending"
      : "Pre-closing review";
  const satelliteUrl = createGoogleSatelliteMapUrl({
    address: proposal.location,
    markerLabel: "B",
    zoom: 18,
  });
  const milestoneGroups = proposalPacketMilestoneGroups(detail);
  const existingMilestoneKeys = new Set(
    milestoneGroups.map((group) => group.milestone.key)
  );
  const projectDurationDays =
    (detail.milestones ?? []).length > 0
      ? Math.max(
          ...(detail.milestones ?? []).map((milestone) => milestone.dayEnd)
        )
      : 0;
  const canEditMilestones = Boolean(onUpdateMilestone);
  const canCreateMilestones = Boolean(onCreateMilestone);
  const canManageMilestones = canEditMilestones || canCreateMilestones;
  const canEditProposedStartDate = Boolean(onUpdateProposedStartDate);
  const proposedStartDate = proposal.proposedStartDate ?? "";
  const canShowRealDates = isValidProposalStartDate(proposedStartDate);

  useEffect(() => {
    setStartDateDraft(proposal.proposedStartDate ?? "");
    if (!proposal.proposedStartDate) {
      setDateDisplayMode("relative");
    }
  }, [proposal.proposedStartDate]);

  function beginMilestoneEdit(group: PacketMilestoneGroup) {
    setEditingMilestoneKey(group.milestone.key);
    setMilestoneDraft(packetMilestoneFormDraftFromGroup(group));
  }

  function beginMilestoneCreate() {
    setEditingMilestoneKey(null);
    const nextOrder =
      milestoneGroups.reduce(
        (maxOrder, group) => Math.max(maxOrder, group.milestone.order),
        0
      ) + 1;
    const nextStartDay =
      milestoneGroups.length > 0
        ? Math.max(...milestoneGroups.map((group) => group.milestone.dayEnd))
        : 0;
    setMilestoneDraft({
      budgetDollars: "",
      dayEnd: String(nextStartDay + 7),
      dayStart: String(nextStartDay),
      milestoneKey: `milestone-${nextOrder}`,
      mode: "create",
      name: "",
      order: nextOrder,
      submilestones: [],
    });
  }

  function updateMilestoneDraft(patch: Partial<PacketMilestoneFormDraft>) {
    setMilestoneDraft((current) => (current ? { ...current, ...patch } : null));
  }

  function updateSubmilestoneDraft(
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) =>
              submilestone.key === key
                ? { ...submilestone, ...patch }
                : submilestone
            ),
          }
        : null
    );
  }

  function updateSubmilestoneStartDayDraft(key: string, value: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) => {
              if (submilestone.key !== key) {
                return submilestone;
              }
              return {
                ...submilestone,
                startDay: digitDraftValue(value),
              };
            }),
          }
        : null
    );
  }

  function updateSubmilestoneEndDayDraft(key: string, value: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones.map((submilestone) => {
              if (submilestone.key !== key) {
                return submilestone;
              }
              return {
                ...submilestone,
                dayEnd: digitDraftValue(value),
              };
            }),
          }
        : null
    );
  }

  /**
   * Commits a window-only edit (start day + duration) for an individual
   * submilestone by rebuilding the full PacketMilestonePatch from the current
   * group. Mirrors the exclusive-end semantics of the packet table
   * (dayEnd = startDay + durationDays) and reuses ScheduleWindowPicker so the
   * existing-proposal packet surface matches the worksheet-table interaction.
   */
  async function commitSubmilestoneWindow(
    group: PacketMilestoneGroup,
    window: ScheduleWindowValue,
    submilestoneKey: string
  ) {
    if (!onUpdateMilestone) {
      return;
    }
    const nextStartDay = Math.round(window.startDay);
    const nextDurationDays = Math.max(1, Math.round(window.durationDays));
    const milestone = group.milestone;

    const submilestonePatches: PacketSubmilestonePatch[] =
      group.submilestones.map((submilestone, index) => {
        const currentStartDay =
          submilestone.startDay ??
          milestone.dayStart + group.fallbackStartOffsets[index];
        const currentDurationDays =
          submilestone.durationDays ?? group.fallbackDurations[index] ?? 1;
        const budgetCents =
          submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
        if (submilestone.key !== submilestoneKey) {
          return {
            budgetCents,
            durationDays: currentDurationDays,
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order ?? index + 1,
            startDay: currentStartDay,
          };
        }
        return {
          budgetCents,
          durationDays: nextDurationDays,
          key: submilestone.key,
          name: submilestone.name,
          order: submilestone.order ?? index + 1,
          startDay: nextStartDay,
        };
      });

    // The milestone window is always recomputed from the (now-updated)
    // submilestone windows. dayEnd uses exclusive-end semantics to match the
    // packet labels and the save path's validation.
    const windows = submilestonePatches.map((submilestone) => ({
      dayEnd: (submilestone.startDay ?? 0) + (submilestone.durationDays ?? 1),
      dayStart: submilestone.startDay ?? 0,
    }));
    const dayStart = Math.min(...windows.map((w) => w.dayStart));
    const dayEnd = Math.max(...windows.map((w) => w.dayEnd));

    const patch: PacketMilestonePatch = {
      budgetCents: milestone.budgetCents,
      dayEnd,
      dayStart,
      durationDays: Math.max(1, dayEnd - dayStart),
      name: milestone.name,
      submilestones: submilestonePatches,
    };

    setPendingMilestoneKey(milestone.key);
    try {
      await onUpdateMilestone(milestone.key, patch);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  function updateSubmilestoneOverlayStartDay(value: string) {
    setSubmilestoneOverlayDraft((current) => {
      if (!current) {
        return null;
      }
      return {
        ...current,
        startDay: digitDraftValue(value),
      };
    });
  }

  function updateSubmilestoneOverlayEndDay(value: string) {
    setSubmilestoneOverlayDraft((current) =>
      current
        ? {
            ...current,
            dayEnd: digitDraftValue(value),
          }
        : null
    );
  }

  function removeSubmilestoneDraft(key: string) {
    setMilestoneDraft((current) =>
      current
        ? {
            ...current,
            submilestones: current.submilestones
              .filter((submilestone) => submilestone.key !== key)
              .map((submilestone, index) => ({
                ...submilestone,
                order: index + 1,
              })),
          }
        : null
    );
  }

  function openAddSubmilestone(group: PacketMilestoneGroup) {
    const activeDraft =
      milestoneDraft?.mode === "edit" &&
      milestoneDraft.milestoneKey === group.milestone.key
        ? milestoneDraft
        : packetMilestoneFormDraftFromGroup(group);
    if (!activeDraft) {
      return;
    }
    setSubmilestoneOverlayDraft({
      budgetDollars: "",
      dayEnd: String(parseInteger(activeDraft.dayStart) + 1),
      milestoneKey: group.milestone.key,
      name: "",
      order: activeDraft.submilestones.length + 1,
      startDay: activeDraft.dayStart,
    });
  }

  function openAddSubmilestoneForDraft() {
    if (!milestoneDraft) {
      return;
    }
    setSubmilestoneOverlayDraft({
      budgetDollars: "",
      dayEnd: String(parseInteger(milestoneDraft.dayStart) + 1),
      milestoneKey: milestoneDraft.milestoneKey,
      name: "",
      order: milestoneDraft.submilestones.length + 1,
      startDay: milestoneDraft.dayStart,
    });
  }

  async function saveSubmilestoneOverlayDraft() {
    if (!submilestoneOverlayDraft) {
      return;
    }
    const name = submilestoneOverlayDraft.name.trim();
    if (!name) {
      toast.error("Submilestone name is required.");
      return;
    }
    const startDay = parseRequiredInteger(submilestoneOverlayDraft.startDay);
    const dayEnd = parseRequiredInteger(submilestoneOverlayDraft.dayEnd);
    if (startDay === null || startDay < 0) {
      toast.error("Submilestone start day is invalid.");
      return;
    }
    if (dayEnd === null || dayEnd <= startDay) {
      toast.error("Submilestone end day is invalid.");
      return;
    }
    const budgetCents = dollarsInputToOptionalCents(
      submilestoneOverlayDraft.budgetDollars
    );
    if (budgetCents !== undefined && budgetCents < 0) {
      toast.error("Submilestone budget is invalid.");
      return;
    }
    const creatingMilestone =
      milestoneDraft?.mode === "create" &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
        ? milestoneDraft
        : null;
    const targetGroup = milestoneGroups.find(
      (group) => group.milestone.key === submilestoneOverlayDraft.milestoneKey
    );
    let targetDraft = creatingMilestone;
    if (
      !targetDraft &&
      milestoneDraft?.mode === "edit" &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
    ) {
      targetDraft = milestoneDraft;
    }
    if (!targetDraft && targetGroup) {
      targetDraft = packetMilestoneFormDraftFromGroup(targetGroup);
    }
    if (!targetDraft) {
      toast.error("Milestone was not found.");
      return;
    }
    const existingKeys = new Set(
      targetDraft.submilestones.map((submilestone) => submilestone.key)
    );
    const key = uniquePacketKey(name, "submilestone", existingKeys);
    const nextSubmilestones = [
      ...targetDraft.submilestones,
      {
        budgetDollars: submilestoneOverlayDraft.budgetDollars,
        dayEnd: String(dayEnd),
        key,
        name,
        order: targetDraft.submilestones.length + 1,
        startDay: String(startDay),
      },
    ];
    if (
      milestoneDraft &&
      milestoneDraft.milestoneKey === submilestoneOverlayDraft.milestoneKey
    ) {
      updateMilestoneDraft({
        submilestones: nextSubmilestones,
      });
      setSubmilestoneOverlayDraft(null);
      return;
    }
    if (!onUpdateMilestone) {
      return;
    }
    const nextDraft = {
      ...targetDraft,
      submilestones: [...nextSubmilestones],
    };
    const normalized = normalizePacketMilestoneFormDraft(nextDraft);
    if (!normalized) {
      return;
    }
    setPendingMilestoneKey(targetDraft.milestoneKey);
    try {
      await onUpdateMilestone(targetDraft.milestoneKey, normalized);
      setSubmilestoneOverlayDraft(null);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  async function saveMilestoneDraft() {
    if (!milestoneDraft) {
      return;
    }
    const normalized = normalizePacketMilestoneFormDraft(milestoneDraft);
    if (!normalized) {
      return;
    }
    if (milestoneDraft.mode === "edit" && !onUpdateMilestone) {
      return;
    }
    if (milestoneDraft.mode === "create" && !onCreateMilestone) {
      return;
    }
    const pendingKey = milestoneDraft.milestoneKey;
    setPendingMilestoneKey(pendingKey);
    try {
      if (milestoneDraft.mode === "edit") {
        await onUpdateMilestone?.(milestoneDraft.milestoneKey, normalized);
      } else {
        const milestoneKey = uniquePacketKey(
          normalized.name,
          milestoneDraft.milestoneKey,
          existingMilestoneKeys
        );
        await onCreateMilestone?.({
          ...normalized,
          dependencyKeys: [],
          drawAvailabilityCents: normalized.budgetCents,
          evidenceState: "Draft package",
          milestoneKey,
          order: milestoneDraft.order,
          policyState: "Draft policy review",
          x: normalized.dayStart,
        });
      }
      setMilestoneDraft(null);
      setEditingMilestoneKey(null);
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingMilestoneKey(null);
    }
  }

  async function saveProposedStartDate() {
    if (!onUpdateProposedStartDate) {
      return;
    }
    if (!isValidIsoDateOnly(startDateDraft)) {
      toast.error("Enter a valid proposed start date.");
      return;
    }
    setStartDatePending(true);
    try {
      await onUpdateProposedStartDate(startDateDraft);
      setDateDisplayMode("real");
      setEditingStartDate(false);
      toast.success("Proposed start date updated.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setStartDatePending(false);
    }
  }

  async function uploadPermitDocument(files: File[]) {
    const file = files[0];
    if (!(file && onUpdatePermitDocument)) {
      return;
    }
    try {
      await onUpdatePermitDocument(file);
      toast.success("Permit uploaded.");
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
      throw error;
    }
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="grid gap-4">
        <Section title="Build, site, and loan summary">
          <div className="grid gap-4 2xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
            <div className="overflow-hidden rounded-lg border bg-muted">
              {satelliteUrl ? (
                <img
                  alt={`${proposal.buildName} satellite view`}
                  className="aspect-[16/9] w-full object-cover"
                  height={360}
                  src={satelliteUrl}
                  width={640}
                />
              ) : (
                <div className="grid aspect-[16/9] place-items-center p-4 text-center text-muted-foreground text-sm">
                  Satellite image unavailable. Add VITE_GOOGLE_MAPS_API_KEY to
                  render the site view.
                </div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailGrid
                rows={[
                  ...(mergedWithReview
                    ? []
                    : ([
                        ["Build", proposal.buildName],
                        ["Location", proposal.location],
                        ["Status", statusLabel(proposal.status)],
                      ] as [string, ReactNode][])),
                  [
                    "Proposed start date",
                    <PacketProposedStartDateControl
                      canEdit={canEditProposedStartDate}
                      draft={startDateDraft}
                      editing={editingStartDate}
                      onCancel={() => {
                        setStartDateDraft(proposal.proposedStartDate ?? "");
                        setEditingStartDate(false);
                      }}
                      onDraftChange={setStartDateDraft}
                      onEdit={() => setEditingStartDate(true)}
                      onSave={() => void saveProposedStartDate()}
                      pending={startDatePending}
                      value={proposal.proposedStartDate}
                    />,
                  ],
                  ["Planned duration", `${projectDurationDays} days`],
                  ...(mergedWithReview
                    ? ([
                        [
                          "Submilestones",
                          String(detail.submilestones?.length ?? 0),
                        ],
                      ] as [string, ReactNode][])
                    : []),
                ]}
              />
              <DetailGrid
                rows={[
                  ...(mergedWithReview
                    ? []
                    : ([
                        ["Loan principal", formatCents(approvedAmountCents)],
                        [
                          "Interest rate",
                          formatInterestAnnualBps(
                            detail.loanFacility?.interestAnnualBps ??
                              proposal.interestAnnualBps ??
                              925
                          ),
                        ],
                      ] as [string, ReactNode][])),
                  ["Interest trigger", "Funds released"],
                  ["Reimbursement model", "Work complete before release"],
                ]}
              />
            </div>
          </div>
        </Section>

        <Section
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canShowRealDates ? (
                <PacketDateDisplayToggle
                  mode={dateDisplayMode}
                  onModeChange={setDateDisplayMode}
                />
              ) : null}
              {canCreateMilestones ? (
                <Button onClick={beginMilestoneCreate} size="sm">
                  <Plus aria-hidden />
                  Add milestone
                </Button>
              ) : null}
            </div>
          }
          title="Milestone and submilestone worksheet"
        >
          <Table className="table-fixed">
            <colgroup>
              <col className={canManageMilestones ? "w-[54%]" : "w-[58%]"} />
              <col className={canManageMilestones ? "w-[24%]" : "w-[26%]"} />
              <col className={canManageMilestones ? "w-[14%]" : "w-[16%]"} />
              {canManageMilestones ? <col className="w-[8%]" /> : null}
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Window</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                {canManageMilestones ? (
                  <TableHead className="w-24 text-right">Edit</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestoneGroups.map((group) => {
                const pending = pendingMilestoneKey === group.milestone.key;
                const editing =
                  editingMilestoneKey === group.milestone.key &&
                  milestoneDraft?.mode === "edit"
                    ? milestoneDraft
                    : null;
                return (
                  <Fragment key={group.milestone.key}>
                    <TableRow className="h-16">
                      <TableCell className="font-medium">
                        {editing ? (
                          <Input
                            aria-label={`${group.milestone.name} scope`}
                            className="h-8 w-full"
                            onChange={(event) =>
                              updateMilestoneDraft({
                                name: event.currentTarget.value,
                              })
                            }
                            value={editing.name}
                          />
                        ) : (
                          <>
                            {group.milestone.name}
                            <div className="mt-1 text-muted-foreground text-xs">
                              {group.submilestones.length} submilestones
                            </div>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          editing.submilestones.length > 0 ? (
                            <PacketComputedMilestoneValue
                              label="Calculated from submilestones"
                              value={formatPacketWindow({
                                dateDisplayMode,
                                dayEnd:
                                  packetMilestoneDraftPreview(editing).dayEnd,
                                dayStart:
                                  packetMilestoneDraftPreview(editing).dayStart,
                                proposedStartDate,
                              })}
                            />
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Input
                                aria-label={`${group.milestone.name} start day`}
                                className="h-8 w-20"
                                inputMode="numeric"
                                onChange={(event) =>
                                  updateMilestoneDraft({
                                    dayStart: digitDraftValue(
                                      event.currentTarget.value
                                    ),
                                  })
                                }
                                value={editing.dayStart}
                              />
                              <span className="text-muted-foreground text-xs">
                                to
                              </span>
                              <Input
                                aria-label={`${group.milestone.name} end day`}
                                className="h-8 w-20"
                                inputMode="numeric"
                                onChange={(event) =>
                                  updateMilestoneDraft({
                                    dayEnd: digitDraftValue(
                                      event.currentTarget.value
                                    ),
                                  })
                                }
                                value={editing.dayEnd}
                              />
                            </div>
                          )
                        ) : (
                          <>
                            {formatPacketWindow({
                              dateDisplayMode,
                              dayEnd: group.milestone.dayEnd,
                              dayStart: group.milestone.dayStart,
                              proposedStartDate,
                            })}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {editing ? (
                          editing.submilestones.length > 0 ? (
                            <PacketComputedMilestoneValue
                              align="right"
                              label="Calculated from submilestones"
                              value={formatCents(
                                packetMilestoneDraftPreview(editing).budgetCents
                              )}
                            />
                          ) : (
                            <Input
                              aria-label={`${group.milestone.name} budget`}
                              className="ml-auto h-8 w-32 text-right"
                              inputMode="decimal"
                              onChange={(event) =>
                                updateMilestoneDraft({
                                  budgetDollars: event.currentTarget.value,
                                })
                              }
                              value={editing.budgetDollars}
                            />
                          )
                        ) : (
                          formatCents(group.milestone.budgetCents)
                        )}
                      </TableCell>
                      {canManageMilestones ? (
                        <TableCell className="text-right">
                          {editing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                aria-label={`Add submilestone to ${group.milestone.name}`}
                                disabled={pending}
                                onClick={() => openAddSubmilestone(group)}
                                size="icon-xs"
                                title="Add submilestone"
                                variant="ghost"
                              >
                                <Plus aria-hidden />
                              </Button>
                              <Button
                                aria-label={`Save ${group.milestone.name} packet row`}
                                loading={pending}
                                onClick={() => void saveMilestoneDraft()}
                                size="icon-xs"
                                title="Save row"
                              >
                                <Check aria-hidden />
                              </Button>
                              <Button
                                aria-label={`Cancel ${group.milestone.name} packet row edit`}
                                disabled={pending}
                                onClick={() => {
                                  setEditingMilestoneKey(null);
                                  setMilestoneDraft(null);
                                }}
                                size="icon-xs"
                                title="Cancel edit"
                                variant="ghost"
                              >
                                <X aria-hidden />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              {canEditMilestones ? (
                                <Button
                                  aria-label={`Add submilestone to ${group.milestone.name}`}
                                  loading={pending}
                                  onClick={() => openAddSubmilestone(group)}
                                  size="icon-xs"
                                  title="Add submilestone"
                                  variant="ghost"
                                >
                                  <Plus aria-hidden />
                                </Button>
                              ) : null}
                              {canEditMilestones ? (
                                <Button
                                  aria-label={`Edit ${group.milestone.name} packet row`}
                                  loading={pending}
                                  onClick={() => beginMilestoneEdit(group)}
                                  size="icon-xs"
                                  title="Edit row"
                                  variant="ghost"
                                >
                                  <Pencil aria-hidden />
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                    {packetSubmilestoneTableRows(group, editing).map(
                      (submilestone, index) => {
                        const { budgetCents, durationDays, startDay } =
                          submilestone;
                        return (
                          <TableRow
                            className="h-14 bg-muted/30"
                            key={`${group.milestone.key}-${submilestone.key}`}
                          >
                            <TableCell className="pl-8">
                              {editing ? (
                                <Input
                                  aria-label={`${group.milestone.name} submilestone ${index + 1} name`}
                                  className="h-8"
                                  onChange={(event) =>
                                    updateSubmilestoneDraft(submilestone.key, {
                                      name: event.currentTarget.value,
                                    })
                                  }
                                  value={submilestone.name}
                                />
                              ) : (
                                <span className="font-medium">
                                  {submilestone.name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editing ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    aria-label={`${group.milestone.name} submilestone ${index + 1} start day`}
                                    className="h-8 w-20"
                                    inputMode="numeric"
                                    onChange={(event) =>
                                      updateSubmilestoneStartDayDraft(
                                        submilestone.key,
                                        event.currentTarget.value
                                      )
                                    }
                                    value={submilestone.startDayDraft}
                                  />
                                  <span className="text-muted-foreground text-xs">
                                    to
                                  </span>
                                  <Input
                                    aria-label={`${group.milestone.name} submilestone ${index + 1} end day`}
                                    className="h-8 w-20"
                                    inputMode="numeric"
                                    onChange={(event) =>
                                      updateSubmilestoneEndDayDraft(
                                        submilestone.key,
                                        event.currentTarget.value
                                      )
                                    }
                                    value={submilestone.dayEndDraft}
                                  />
                                </div>
                              ) : canEditMilestones && canShowRealDates ? (
                                <PacketSubmilestoneWindowCell
                                  dateDisplayMode={dateDisplayMode}
                                  durationDays={durationDays}
                                  onCommit={(window) =>
                                    void commitSubmilestoneWindow(
                                      group,
                                      window,
                                      submilestone.key
                                    )
                                  }
                                  pending={
                                    pendingMilestoneKey === group.milestone.key
                                  }
                                  proposedStartDate={proposedStartDate}
                                  startDay={startDay}
                                  submilestoneName={submilestone.name}
                                  testId={`packet-submilestone-window-${group.milestone.key}-${submilestone.key}`}
                                />
                              ) : (
                                <>
                                  {formatPacketWindow({
                                    dateDisplayMode,
                                    dayEnd: startDay + durationDays,
                                    dayStart: startDay,
                                    proposedStartDate,
                                  })}
                                  <span className="ml-2 text-muted-foreground text-xs">
                                    {durationDays}d
                                  </span>
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {editing ? (
                                <Input
                                  aria-label={`${group.milestone.name} submilestone ${index + 1} budget`}
                                  className="ml-auto h-8 w-28 text-right"
                                  inputMode="decimal"
                                  onChange={(event) =>
                                    updateSubmilestoneDraft(submilestone.key, {
                                      budgetDollars: event.currentTarget.value,
                                    })
                                  }
                                  value={submilestone.budgetDollars}
                                />
                              ) : (
                                formatCents(budgetCents)
                              )}
                            </TableCell>
                            {canManageMilestones ? (
                              <TableCell className="text-right">
                                {editing ? (
                                  <Button
                                    aria-label={`Remove ${submilestone.name || `submilestone ${index + 1}`}`}
                                    onClick={() =>
                                      removeSubmilestoneDraft(submilestone.key)
                                    }
                                    size="icon-xs"
                                    title="Remove submilestone"
                                    variant="ghost"
                                  >
                                    <Trash2 aria-hidden />
                                  </Button>
                                ) : null}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      }
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Section>

        <Section title="Draw schedule snapshot">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Draw</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draws.map((draw) => (
                <TableRow key={draw.drawKey}>
                  <TableCell>{draw.label}</TableCell>
                  <TableCell>Day {draw.timingDay}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(draw.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
      <PacketMilestoneEditorOverlay
        draft={milestoneDraft?.mode === "create" ? milestoneDraft : null}
        onAddSubmilestone={openAddSubmilestoneForDraft}
        onClose={() => setMilestoneDraft(null)}
        onDraftChange={updateMilestoneDraft}
        onRemoveSubmilestone={removeSubmilestoneDraft}
        onSave={() => void saveMilestoneDraft()}
        onSubmilestoneChange={updateSubmilestoneDraft}
        pending={Boolean(pendingMilestoneKey)}
      />
      <PacketSubmilestoneOverlay
        draft={submilestoneOverlayDraft}
        onClose={() => setSubmilestoneOverlayDraft(null)}
        onDraftChange={(patch) =>
          setSubmilestoneOverlayDraft((current) =>
            current ? { ...current, ...patch } : null
          )
        }
        onEndDayChange={updateSubmilestoneOverlayEndDay}
        onSave={saveSubmilestoneOverlayDraft}
        onStartDayChange={updateSubmilestoneOverlayStartDay}
      />

      <div className="grid gap-4">
        <Section title="Closing financials">
          <PacketClosingFinancialsSummary
            approvedAmountCents={approvedAmountCents}
            borrowerCoPayCents={borrowerCoPayCents}
            borrowerStartingCashCents={proposal.borrowerStartingCashCents}
            closingGapCents={closingGapCents}
            closingState={closingState}
            lenderDrawPolicyLimitCents={proposal.lenderDrawPolicyLimitCents}
            mergedWithReview={mergedWithReview}
            scheduledReimbursementsCents={totalDrawAmountCents}
            totalBudgetCents={proposal.totalBudgetCents}
          />
        </Section>

        {mergedWithReview ? null : (
          <>
            <Section title="Build details">
              <PacketBuildDetailsSummary
                drawCount={draws.length}
                milestoneCount={detail.milestones?.length ?? 0}
                permitFileName={permit?.fileName}
                permitWaiverReason={detail.permitWaiver?.reason}
                projectDurationDays={projectDurationDays}
                submilestoneCount={detail.submilestones?.length ?? 0}
              />
            </Section>

            <Section title="Documents">
              <PacketPermitUploadPanel
                canUpload={canUploadPermit}
                onUpload={uploadPermitDocument}
                permit={permit}
                permitViewerDocument={permitViewerDocument}
                permitWaiverReason={detail.permitWaiver?.reason}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function PacketClosingFinancialsSummary({
  approvedAmountCents,
  borrowerCoPayCents,
  closingGapCents,
  closingState,
  lenderDrawPolicyLimitCents,
  mergedWithReview = false,
  scheduledReimbursementsCents,
  totalBudgetCents,
  borrowerStartingCashCents,
}: {
  approvedAmountCents: number;
  borrowerCoPayCents: number;
  closingGapCents: number;
  closingState: string;
  lenderDrawPolicyLimitCents: number;
  mergedWithReview?: boolean;
  scheduledReimbursementsCents: number;
  totalBudgetCents: number;
  borrowerStartingCashCents: number;
}) {
  return (
    <div className="grid gap-4">
      {mergedWithReview ? null : (
        <div className="grid gap-2 sm:grid-cols-3">
          <PacketSummaryMetric
            icon={<Banknote className="size-4" />}
            label="Budget"
            value={formatCents(totalBudgetCents)}
          />
          <PacketSummaryMetric
            icon={<Landmark className="size-4" />}
            label="Approved principal"
            value={formatCents(approvedAmountCents)}
          />
          <PacketSummaryMetric
            icon={<ReceiptText className="size-4" />}
            label="Scheduled reimbursements"
            value={formatCents(scheduledReimbursementsCents)}
          />
        </div>
      )}

      <div className="grid gap-3">
        <PacketFinancialProgress
          label="Scheduled reimbursements"
          referenceCents={totalBudgetCents}
          valueCents={scheduledReimbursementsCents}
        />
        <PacketFinancialProgress
          label="Borrower Contribution"
          referenceCents={totalBudgetCents}
          valueCents={borrowerCoPayCents}
        />
        {mergedWithReview ? null : (
          <PacketFinancialProgress
            label="Borrower starting cash"
            referenceCents={totalBudgetCents}
            valueCents={borrowerStartingCashCents}
          />
        )}
      </div>

      <dl className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
        <PacketCompactDetail
          label="Draw policy limit"
          value={formatCents(lenderDrawPolicyLimitCents)}
        />
        <PacketCompactDetail
          label="Funding gap"
          value={formatCents(closingGapCents)}
        />
        <PacketCompactDetail label="Closing state" value={closingState} />
      </dl>
    </div>
  );
}

function PacketBuildDetailsSummary({
  drawCount,
  milestoneCount,
  permitFileName,
  permitWaiverReason,
  projectDurationDays,
  submilestoneCount,
}: {
  drawCount: number;
  milestoneCount: number;
  permitFileName?: string;
  permitWaiverReason?: string;
  projectDurationDays: number;
  submilestoneCount: number;
}) {
  const permitStatus = permitFileName
    ? "Permit linked"
    : permitWaiverReason
      ? "Permit waived"
      : "Permit missing";
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PacketSummaryMetric
          icon={<Layers3 className="size-4" />}
          label="Milestones"
          value={String(milestoneCount)}
        />
        <PacketSummaryMetric
          icon={<ClipboardListIcon />}
          label="Submilestones"
          value={String(submilestoneCount)}
        />
        <PacketSummaryMetric
          icon={<WalletCards className="size-4" />}
          label="Draws"
          value={String(drawCount)}
        />
        <PacketSummaryMetric
          icon={<CalendarClock className="size-4" />}
          label="Duration"
          value={`${projectDurationDays} days`}
        />
      </div>
      <div className="flex flex-wrap items-start gap-3 border-t pt-3">
        <div className="min-w-48 flex-1">
          <div className="text-muted-foreground text-xs">Permit</div>
          <div className="mt-1 truncate font-medium text-sm">
            {permitFileName ?? permitWaiverReason ?? "No permit packet linked"}
          </div>
        </div>
        <Badge
          variant={
            permitFileName
              ? "success"
              : permitWaiverReason
                ? "outline"
                : "warning"
          }
        >
          {permitStatus}
        </Badge>
      </div>
    </div>
  );
}

function PacketPermitUploadPanel({
  canUpload,
  onUpload,
  permit,
  permitViewerDocument,
  permitWaiverReason,
}: {
  canUpload: boolean;
  onUpload: (files: File[]) => Promise<void>;
  permit?: ProductionDocument;
  permitViewerDocument?: BuildPermitViewerDocument | null;
  permitWaiverReason?: string;
}) {
  if (permit) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-foreground ring-1 ring-primary/25">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Permit PDF linked</Badge>
              <span className="truncate font-medium text-sm">
                {permit.fileName}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              This packet is available for lender review and closing checks.
            </p>
          </div>
        </div>
        <BuildPermitViewerDrawer permit={permitViewerDocument} size="sm" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/45 p-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background text-warning shadow-xs/5 ring-1 ring-border">
          <AlertTriangle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={permitWaiverReason ? "outline" : "warning"}>
              {permitWaiverReason ? "Permit waived" : "Permit missing"}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Approval requires permit upload or audited waiver.
            </span>
          </div>
          {permitWaiverReason ? (
            <p className="mt-1 text-sm">{permitWaiverReason}</p>
          ) : null}
        </div>
      </div>
      {canUpload ? (
        <FileUploader
          accept="application/pdf,.pdf,.png,.jpg,.jpeg"
          actionLabel="Upload permit"
          description="Drop the issued permit or browse from your device."
          helperText="PDF preferred. Images are accepted when the municipality issued the permit as an image."
          inputLabel="Select permit document"
          multiple={false}
          onUpload={onUpload}
          title="Permit packet"
        />
      ) : null}
    </div>
  );
}

function PacketSummaryMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/45 px-3 py-2 ring-1 ring-border/70">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background text-muted-foreground shadow-xs/5 ring-1 ring-border">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-muted-foreground text-xs">{label}</div>
        <div className="truncate font-semibold text-sm">{value}</div>
      </div>
    </div>
  );
}

function PacketCompactDetail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function PacketFinancialProgress({
  label,
  referenceCents,
  valueCents,
}: {
  label: string;
  referenceCents: number;
  valueCents: number;
}) {
  const percent =
    referenceCents > 0
      ? Math.min(100, Math.max(0, (valueCents / referenceCents) * 100))
      : 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatCents(valueCents)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ClipboardListIcon() {
  return <Database className="size-4" />;
}

function PacketProposedStartDateControl({
  canEdit,
  draft,
  editing,
  onCancel,
  onDraftChange,
  onEdit,
  onSave,
  pending,
  value,
}: {
  canEdit: boolean;
  draft: string;
  editing: boolean;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  pending: boolean;
  value?: string;
}) {
  if (editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          aria-label="Proposed start date"
          className="h-8 w-38"
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          type="date"
          value={draft}
        />
        <Button
          aria-label="Save proposed start date"
          loading={pending}
          onClick={onSave}
          size="icon-xs"
          title="Save proposed start date"
        >
          <Check aria-hidden />
        </Button>
        <Button
          aria-label="Cancel proposed start date edit"
          disabled={pending}
          onClick={onCancel}
          size="icon-xs"
          title="Cancel edit"
          variant="ghost"
        >
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>{value ? formatPacketDate(value) : "Not set"}</span>
      {canEdit ? (
        <Button
          aria-label="Edit proposed start date"
          onClick={onEdit}
          size="icon-xs"
          title="Edit proposed start date"
          variant="ghost"
        >
          <Pencil aria-hidden />
        </Button>
      ) : null}
    </span>
  );
}

function PacketComputedMilestoneValue({
  align = "left",
  label,
  value,
}: {
  align?: "left" | "right";
  label: string;
  value: string;
}) {
  return (
    <div
      className={`grid gap-0.5 ${align === "right" ? "justify-items-end" : ""}`}
    >
      <span>{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

function PacketDateDisplayToggle({
  mode,
  onModeChange,
}: {
  mode: "relative" | "real";
  onModeChange: (mode: "relative" | "real") => void;
}) {
  return (
    <div
      aria-label="Packet date display"
      className="inline-flex rounded-lg border bg-background p-0.5"
      role="group"
    >
      <Button
        aria-pressed={mode === "relative"}
        onClick={() => onModeChange("relative")}
        size="sm"
        variant={mode === "relative" ? "secondary" : "ghost"}
      >
        Relative
      </Button>
      <Button
        aria-pressed={mode === "real"}
        onClick={() => onModeChange("real")}
        size="sm"
        variant={mode === "real" ? "secondary" : "ghost"}
      >
        Real dates
      </Button>
    </div>
  );
}

function PacketMilestoneEditorOverlay({
  draft,
  onAddSubmilestone,
  onClose,
  onDraftChange,
  onRemoveSubmilestone,
  onSave,
  onSubmilestoneChange,
  pending,
}: {
  draft: PacketMilestoneFormDraft | null;
  onAddSubmilestone: () => void;
  onClose: () => void;
  onDraftChange: (patch: Partial<PacketMilestoneFormDraft>) => void;
  onRemoveSubmilestone: (key: string) => void;
  onSave: () => void;
  onSubmilestoneChange: (
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) => void;
  pending: boolean;
}) {
  const isMobile = useIsMobile();
  const open = Boolean(draft);
  const title =
    draft?.mode === "create" ? "Add milestone" : "Edit milestone packet";
  const description =
    draft?.mode === "create"
      ? "Create a packet milestone with its schedule, budget, and submilestones."
      : "Update milestone scope, window, budget, and all submilestone rows.";
  const body = draft ? (
    <PacketMilestoneEditorForm
      draft={draft}
      onAddSubmilestone={onAddSubmilestone}
      onDraftChange={onDraftChange}
      onRemoveSubmilestone={onRemoveSubmilestone}
      onSubmilestoneChange={onSubmilestoneChange}
    />
  ) : null;
  const footer = (
    <>
      {isMobile ? (
        <DrawerClose render={<Button disabled={pending} variant="outline" />}>
          Cancel
        </DrawerClose>
      ) : (
        <SheetClose render={<Button disabled={pending} variant="outline" />}>
          Cancel
        </SheetClose>
      )}
      <Button loading={pending} onClick={onSave}>
        Save milestone
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
        <DrawerPopup className="max-h-[88dvh]" showBar showCloseButton>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerPanel>{body}</DrawerPanel>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerPopup>
      </Drawer>
    );
  }

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetPanel>{body}</SheetPanel>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PacketMilestoneEditorForm({
  draft,
  onAddSubmilestone,
  onDraftChange,
  onRemoveSubmilestone,
  onSubmilestoneChange,
}: {
  draft: PacketMilestoneFormDraft;
  onAddSubmilestone: () => void;
  onDraftChange: (patch: Partial<PacketMilestoneFormDraft>) => void;
  onRemoveSubmilestone: (key: string) => void;
  onSubmilestoneChange: (
    key: string,
    patch: Partial<PacketSubmilestoneFormDraft>
  ) => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="packet-milestone-name">Scope</Label>
          <Input
            id="packet-milestone-name"
            onChange={(event) =>
              onDraftChange({ name: event.currentTarget.value })
            }
            placeholder="Permits, demo & foundation"
            value={draft.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="packet-milestone-start">Start day</Label>
          <Input
            id="packet-milestone-start"
            inputMode="numeric"
            onChange={(event) =>
              onDraftChange({
                dayStart: digitDraftValue(event.currentTarget.value),
              })
            }
            value={draft.dayStart}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="packet-milestone-end">End day</Label>
          <Input
            id="packet-milestone-end"
            inputMode="numeric"
            onChange={(event) =>
              onDraftChange({
                dayEnd: digitDraftValue(event.currentTarget.value),
              })
            }
            value={draft.dayEnd}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="packet-milestone-budget">Budget dollars</Label>
          <Input
            id="packet-milestone-budget"
            inputMode="decimal"
            onChange={(event) =>
              onDraftChange({ budgetDollars: event.currentTarget.value })
            }
            value={draft.budgetDollars}
          />
        </div>
      </div>

      <div className="grid gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm">Submilestones</h3>
            <p className="text-muted-foreground text-xs">
              Edit the full packet breakdown that rolls up to this milestone.
            </p>
          </div>
          <Button onClick={onAddSubmilestone} size="sm" variant="outline">
            <Plus aria-hidden />
            Add submilestone
          </Button>
        </div>

        {draft.submilestones.length > 0 ? (
          <div className="grid gap-3">
            {draft.submilestones.map((submilestone, index) => (
              <div
                className="grid gap-3 rounded-lg border bg-muted/20 p-3"
                key={submilestone.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-xs">
                    Submilestone {index + 1}
                  </span>
                  <Button
                    aria-label={`Remove ${submilestone.name || `submilestone ${index + 1}`}`}
                    onClick={() => onRemoveSubmilestone(submilestone.key)}
                    size="icon-xs"
                    title="Remove submilestone"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_6rem_6rem_8rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={`packet-submilestone-${submilestone.key}`}>
                      Name
                    </Label>
                    <Input
                      id={`packet-submilestone-${submilestone.key}`}
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          name: event.currentTarget.value,
                        })
                      }
                      value={submilestone.name}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-start-${submilestone.key}`}
                    >
                      Start
                    </Label>
                    <Input
                      id={`packet-submilestone-start-${submilestone.key}`}
                      inputMode="numeric"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          startDay: digitDraftValue(event.currentTarget.value),
                        })
                      }
                      value={submilestone.startDay}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-end-${submilestone.key}`}
                    >
                      End
                    </Label>
                    <Input
                      id={`packet-submilestone-end-${submilestone.key}`}
                      inputMode="numeric"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          dayEnd: digitDraftValue(event.currentTarget.value),
                        })
                      }
                      value={submilestone.dayEnd}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`packet-submilestone-budget-${submilestone.key}`}
                    >
                      Budget
                    </Label>
                    <Input
                      id={`packet-submilestone-budget-${submilestone.key}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        onSubmilestoneChange(submilestone.key, {
                          budgetDollars: event.currentTarget.value,
                        })
                      }
                      value={submilestone.budgetDollars}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
            No submilestones yet.
          </div>
        )}
      </div>
    </div>
  );
}

function PacketSubmilestoneOverlay({
  draft,
  onClose,
  onDraftChange,
  onEndDayChange,
  onSave,
  onStartDayChange,
}: {
  draft: PacketSubmilestoneOverlayDraft | null;
  onClose: () => void;
  onDraftChange: (patch: Partial<PacketSubmilestoneOverlayDraft>) => void;
  onEndDayChange: (value: string) => void;
  onSave: () => void;
  onStartDayChange: (value: string) => void;
}) {
  const isMobile = useIsMobile();
  const open = Boolean(draft);
  const body = draft ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="packet-new-submilestone-name">Name</Label>
        <Input
          id="packet-new-submilestone-name"
          onChange={(event) =>
            onDraftChange({ name: event.currentTarget.value })
          }
          placeholder="Excavation and foundation"
          value={draft.name}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="packet-new-submilestone-start">Start day</Label>
        <Input
          id="packet-new-submilestone-start"
          inputMode="numeric"
          onChange={(event) => onStartDayChange(event.currentTarget.value)}
          value={draft.startDay}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="packet-new-submilestone-end">End day</Label>
        <Input
          id="packet-new-submilestone-end"
          inputMode="numeric"
          onChange={(event) => onEndDayChange(event.currentTarget.value)}
          value={draft.dayEnd}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="packet-new-submilestone-budget">Budget dollars</Label>
        <Input
          id="packet-new-submilestone-budget"
          inputMode="decimal"
          onChange={(event) =>
            onDraftChange({ budgetDollars: event.currentTarget.value })
          }
          value={draft.budgetDollars}
        />
      </div>
    </div>
  ) : null;
  const footer = (
    <>
      {isMobile ? (
        <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
      ) : (
        <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
      )}
      <Button onClick={onSave}>Add submilestone</Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
        <DrawerPopup className="max-h-[82dvh]" showBar showCloseButton>
          <DrawerHeader>
            <DrawerTitle>Add submilestone</DrawerTitle>
            <DrawerDescription>
              Add a scoped packet row to the active milestone.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerPanel>{body}</DrawerPanel>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerPopup>
      </Drawer>
    );
  }

  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add submilestone</SheetTitle>
          <SheetDescription>
            Add a scoped packet row to the active milestone.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>{body}</SheetPanel>
        <SheetFooter>{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function packetMilestoneFormDraftFromGroup(
  group: PacketMilestoneGroup
): PacketMilestoneFormDraft {
  return {
    budgetDollars: centsToDollarsInput(group.milestone.budgetCents),
    dayEnd: String(group.milestone.dayEnd),
    dayStart: String(group.milestone.dayStart),
    milestoneKey: group.milestone.key,
    mode: "edit",
    name: group.milestone.name,
    order: group.milestone.order,
    submilestones: group.submilestones.map((submilestone, index) => {
      const budgetCents =
        submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
      const durationDays =
        submilestone.durationDays ?? group.fallbackDurations[index] ?? 1;
      const startDay =
        submilestone.startDay ??
        group.milestone.dayStart + group.fallbackStartOffsets[index];
      return {
        budgetDollars: centsToDollarsInput(budgetCents),
        dayEnd: String(startDay + durationDays),
        key: submilestone.key,
        name: submilestone.name,
        order: submilestone.order ?? index + 1,
        startDay: String(startDay),
      };
    }),
  };
}

function packetSubmilestoneTableRows(
  group: PacketMilestoneGroup,
  draft: PacketMilestoneFormDraft | null
): PacketSubmilestoneTableRow[] {
  if (draft) {
    return draft.submilestones.map((submilestone) => {
      const startDay = parseInteger(submilestone.startDay);
      return {
        budgetCents: dollarsInputToCents(submilestone.budgetDollars),
        budgetDollars: submilestone.budgetDollars,
        dayEndDraft: submilestone.dayEnd,
        durationDays: Math.max(1, parseInteger(submilestone.dayEnd) - startDay),
        key: submilestone.key,
        name: submilestone.name,
        startDay,
        startDayDraft: submilestone.startDay,
      };
    });
  }

  return group.submilestones.map((submilestone, index) => {
    const budgetCents =
      submilestone.budgetCents ?? group.fallbackBudgets[index] ?? 0;
    const durationDays = submilestone.durationDays ?? 1;
    const startDay =
      submilestone.startDay ??
      group.milestone.dayStart + group.fallbackStartOffsets[index];
    return {
      budgetCents,
      budgetDollars: centsToDollarsInput(budgetCents),
      dayEndDraft: String(startDay + durationDays),
      durationDays,
      key: submilestone.key,
      name: submilestone.name,
      startDay,
      startDayDraft: String(startDay),
    };
  });
}

/**
 * Clickable window cell for a packet submilestone row. Holds the transient
 * ScheduleWindowValue while the picker is open and commits the rebuilt
 * PacketMilestonePatch on close. Exclusive-end semantics match the packet
 * labels ("Day X to Y" where Y = start + duration) and the save path.
 */
function PacketSubmilestoneWindowCell({
  dateDisplayMode,
  durationDays,
  onCommit,
  pending,
  proposedStartDate,
  startDay,
  submilestoneName,
  testId,
}: {
  dateDisplayMode: "relative" | "real";
  durationDays: number;
  onCommit: (window: ScheduleWindowValue) => void;
  pending: boolean;
  proposedStartDate: string;
  startDay: number;
  submilestoneName: string;
  testId: string;
}) {
  const pendingWindowRef = useRef<ScheduleWindowValue | null>(null);

  return (
    <ScheduleWindowPicker
      durationDays={durationDays}
      label={submilestoneName}
      minDayOffset={0}
      onCommit={() => {
        const next = pendingWindowRef.current;
        if (next && !pending) {
          onCommit(next);
        }
        pendingWindowRef.current = null;
      }}
      onWindowChange={(next) => {
        pendingWindowRef.current = next;
      }}
      proposedStartDate={proposedStartDate}
      startDay={startDay}
      testId={testId}
      trigger={
        <span className="text-left underline-offset-2 hover:underline">
          {formatPacketWindow({
            dateDisplayMode,
            dayEnd: startDay + durationDays,
            dayStart: startDay,
            proposedStartDate,
          })}
          <span className="ml-1 text-muted-foreground text-xs">
            {durationDays}d
          </span>
        </span>
      }
      triggerClassName="inline-flex items-center gap-1 text-sm tabular-nums rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}

function formatPacketWindow({
  dateDisplayMode,
  dayEnd,
  dayStart,
  proposedStartDate,
}: {
  dateDisplayMode: "relative" | "real";
  dayEnd: number;
  dayStart: number;
  proposedStartDate: string;
}) {
  if (
    dateDisplayMode === "real" &&
    isValidProposalStartDate(proposedStartDate)
  ) {
    return `${formatPacketDate(
      dateFromProposalDayOffset(proposedStartDate, dayStart)
    )} to ${formatPacketDate(
      dateFromProposalDayOffset(proposedStartDate, dayEnd)
    )}`;
  }
  return `Day ${dayStart} to ${dayEnd}`;
}

function formatPacketDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function isValidProposalStartDate(date: string) {
  return Boolean(date) && isValidIsoDateOnly(date);
}

function packetMilestoneDraftPreview(draft: PacketMilestoneFormDraft) {
  const draftDayStart = Math.max(0, parseInteger(draft.dayStart));
  const draftDayEnd = Math.max(draftDayStart, parseInteger(draft.dayEnd));
  const draftBudgetCents = Math.max(
    0,
    dollarsInputToCents(draft.budgetDollars)
  );
  const submilestoneWindows = draft.submilestones
    .map((submilestone) => {
      const startDay = parseRequiredInteger(submilestone.startDay);
      const dayEnd = parseRequiredInteger(submilestone.dayEnd);
      const budgetCents = dollarsInputToOptionalCents(
        submilestone.budgetDollars
      );
      if (startDay === null || dayEnd === null) {
        return null;
      }
      return {
        budgetCents:
          budgetCents === undefined || budgetCents < 0 ? 0 : budgetCents,
        dayEnd: Math.max(startDay + 1, dayEnd),
        dayStart: Math.max(0, startDay),
      };
    })
    .filter(
      (
        submilestone
      ): submilestone is {
        budgetCents: number;
        dayEnd: number;
        dayStart: number;
      } => Boolean(submilestone)
    );

  if (submilestoneWindows.length === 0) {
    return {
      budgetCents: draftBudgetCents,
      dayEnd: draftDayEnd,
      dayStart: draftDayStart,
      durationDays: Math.max(1, draftDayEnd - draftDayStart),
    };
  }

  const dayStart = Math.min(
    ...submilestoneWindows.map((submilestone) => submilestone.dayStart)
  );
  const dayEnd = Math.max(
    ...submilestoneWindows.map((submilestone) => submilestone.dayEnd)
  );
  return {
    budgetCents: submilestoneWindows.reduce(
      (total, submilestone) => total + submilestone.budgetCents,
      0
    ),
    dayEnd,
    dayStart,
    durationDays: Math.max(1, dayEnd - dayStart),
  };
}

function normalizePacketMilestoneFormDraft(
  draft: PacketMilestoneFormDraft
): PacketMilestonePatch | null {
  const name = draft.name.trim();
  const draftDayStart = parseRequiredInteger(draft.dayStart);
  const draftDayEnd = parseRequiredInteger(draft.dayEnd);
  const draftBudgetCents = dollarsInputToCents(draft.budgetDollars);
  if (!name) {
    toast.error("Milestone scope is required.");
    return null;
  }
  if (
    draftDayStart === null ||
    draftDayEnd === null ||
    draftDayStart < 0 ||
    draftDayEnd < draftDayStart
  ) {
    toast.error("Milestone window is invalid.");
    return null;
  }
  if (draftBudgetCents < 0) {
    toast.error("Milestone budget is invalid.");
    return null;
  }
  const submilestones = draft.submilestones
    .map<PacketSubmilestonePatch | null>((submilestone, index) => {
      const submilestoneName = submilestone.name.trim();
      if (!submilestoneName) {
        return null;
      }
      const startDay = parseRequiredInteger(submilestone.startDay);
      const dayEnd = parseRequiredInteger(submilestone.dayEnd);
      const submilestoneBudgetCents = dollarsInputToOptionalCents(
        submilestone.budgetDollars
      );
      if (startDay === null || startDay < 0) {
        toast.error("Submilestone start day is invalid.");
        return null;
      }
      if (dayEnd === null || dayEnd <= startDay) {
        toast.error("Submilestone end day is invalid.");
        return null;
      }
      if (
        submilestoneBudgetCents !== undefined &&
        submilestoneBudgetCents < 0
      ) {
        toast.error("Submilestone budget is invalid.");
        return null;
      }
      return {
        ...(submilestoneBudgetCents === undefined
          ? {}
          : { budgetCents: submilestoneBudgetCents }),
        durationDays: dayEnd - startDay,
        key: submilestone.key,
        name: submilestoneName,
        order: index + 1,
        startDay,
      };
    })
    .filter((submilestone): submilestone is PacketSubmilestonePatch =>
      Boolean(submilestone)
    );
  const submilestoneWindows = submilestones.flatMap((submilestone) => {
    const startDay = submilestone.startDay;
    const durationDays = submilestone.durationDays;
    if (startDay === undefined || durationDays === undefined) {
      return [];
    }
    return [
      {
        budgetCents: submilestone.budgetCents ?? 0,
        dayEnd: startDay + durationDays,
        dayStart: startDay,
      },
    ];
  });
  const computedDayStart =
    submilestoneWindows.length === 0
      ? draftDayStart
      : Math.min(
          ...submilestoneWindows.map((submilestone) => submilestone.dayStart)
        );
  const computedDayEnd =
    submilestoneWindows.length === 0
      ? draftDayEnd
      : Math.max(
          ...submilestoneWindows.map((submilestone) => submilestone.dayEnd)
        );
  const computedBudgetCents =
    submilestoneWindows.length === 0
      ? draftBudgetCents
      : submilestoneWindows.reduce(
          (total, submilestone) => total + submilestone.budgetCents,
          0
        );

  return {
    budgetCents: computedBudgetCents,
    dayEnd: computedDayEnd,
    dayStart: computedDayStart,
    durationDays: Math.max(1, computedDayEnd - computedDayStart),
    name,
    submilestones,
  };
}

function uniquePacketKey(
  value: string,
  fallback: string,
  existingKeys: Set<string>
) {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    fallback
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "item";
  let candidate = base;
  let suffix = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function proposalPacketMilestoneGroups(detail: ProductionProposalDetail) {
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }

  return (detail.milestones ?? [])
    .slice()
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((milestone) => {
      const milestoneDurationDays =
        milestone.durationDays ??
        Math.max(1, Math.round(milestone.dayEnd - milestone.dayStart));
      const persistedSubmilestones = (
        submilestonesByMilestone.get(milestone.key) ?? []
      )
        .slice()
        .sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key)
        );
      const submilestones =
        persistedSubmilestones.length > 0
          ? persistedSubmilestones
          : [
              {
                budgetCents: milestone.budgetCents,
                durationDays: milestoneDurationDays,
                key: `${milestone.key}-scope`,
                milestoneKey: milestone.key,
                name: `${milestone.name} scope`,
                order: 1,
                startDay: milestone.dayStart,
              },
            ];
      const fallbackBudgets = allocateEvenlyCents(
        milestone.budgetCents,
        submilestones.length
      );
      const fallbackDurations = allocateWholeDays(
        milestoneDurationDays,
        submilestones.length
      );
      let elapsedDays = 0;
      const fallbackStartOffsets = fallbackDurations.map((duration) => {
        const offset = elapsedDays;
        elapsedDays += duration;
        return offset;
      });

      return {
        fallbackBudgets,
        fallbackDurations,
        fallbackStartOffsets,
        milestone,
        submilestones,
      };
    });
}

function allocateWholeDays(totalDays: number, count: number) {
  if (count <= 0) {
    return [];
  }
  const normalizedTotal = Math.max(count, Math.round(totalDays));
  const base = Math.floor(normalizedTotal / count);
  let remainder = normalizedTotal - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

export function toTimelineRows(
  cards: ProductionKanbanCard[]
): TimelinePlanRow[] {
  return cards.map((card) => ({
    budgetGovernance: card.budgetGovernance,
    buildName: card.buildName ?? card.title,
    buildStatus: card.buildStatus,
    buildKey: card.activeBuildId,
    builderName: card.builderName,
    drawCount: card.drawCount ?? 0,
    imageUrl: card.imageUrl,
    kind: card.activeBuildId ? "activeBuild" : "proposal",
    location: card.location,
    locationLatitude: card.locationLatitude,
    locationLongitude: card.locationLongitude,
    milestoneCount: card.milestoneCount ?? 0,
    milestonesBehindSchedule: card.milestonesBehindSchedule,
    pendingDrawRequestCount: card.pendingDrawRequestCount,
    pendingModificationRequestCount: card.pendingModificationRequestCount,
    planId: card.proposalId,
    status: card.column === "closed" ? "approved" : card.column,
    totalBudgetCents: card.totalBudgetCents,
    updatedAt: card.updatedAt,
  }));
}

function productionTemplateToWorksheetRows(
  template: ProductionProposalSettings["templates"][number] | undefined
): TimelineMilestoneWorksheetRow[] {
  if (!template) {
    return [];
  }

  return template.milestones.map((milestone, index) => {
    const durationDays =
      milestone.durationDays ??
      Math.max(4, Math.round((milestone.percentageBps / 10_000) * 120));
    const type = milestone.type ?? milestone.archetypeKey ?? milestone.key;

    return {
      baseItemId: milestone.key,
      budgetText: formatBps(milestone.percentageBps),
      dependencyKeys: milestone.dependencyKeys ?? [],
      durationDays,
      durationText: String(durationDays),
      excluded: false,
      icon:
        milestone.icon ?? iconForMilestoneKey(milestone.key, milestone.name),
      key: milestone.key,
      name: milestone.name,
      order: index,
      percentageBps: milestone.percentageBps,
      percentageText: formatBps(milestone.percentageBps),
      siteVisitGuidance: milestone.siteVisitGuidance,
      subMilestoneDetails: milestone.submilestones.map((submilestone) => ({
        budgetText:
          submilestone.budgetCents === undefined
            ? "$0"
            : formatCents(submilestone.budgetCents),
        description: "",
        durationText: String(submilestone.durationDays ?? 1),
        id: submilestone.key,
        name: submilestone.name,
      })),
      subMilestones: milestone.submilestones.map(
        (submilestone) => submilestone.name
      ),
      type,
    };
  });
}

function iconForMilestoneKey(key: string, name?: string): IsometricIconKey {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("frame") || normalized.includes("shell")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior") || normalized.includes("window")) {
    return "exterior";
  }
  if (normalized.includes("finish") || normalized.includes("fixture")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  if (normalized.includes("drywall")) {
    return "drywall";
  }
  return "change";
}

function ProposalPlanMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Section({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b p-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function DetailGrid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([label, value]) => (
        <div className="grid gap-1" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SettingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-semibold text-xl">{value}</div>
    </div>
  );
}

function LabeledInput({
  inputMode,
  label,
  onChange,
  value,
}: {
  inputMode?: "numeric";
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function statusLabel(status: ProductionProposalStatus) {
  return status
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function proposalCompactStageState(status: ProductionProposalStatus) {
  switch (status) {
    case "draft":
      return "Incomplete draft";
    case "submitted":
      return "Editing blocked while submitted";
    case "approved":
      return "Approved";
    case "closed":
      return "Closed";
  }
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatBps(bps: number) {
  return `${(bps / 100).toFixed(2)}% / ${bps} bps`;
}

function calculateProposalApprovedAmountCents(
  proposal: ProductionProposal,
  draws: ProductionDraw[] = []
) {
  const totalDrawnCents = calculateProposalTotalDrawAmountCents(draws);
  return Math.max(0, proposal.lenderDrawPolicyLimitCents, totalDrawnCents);
}

function calculateProposalTotalDrawAmountCents(draws: ProductionDraw[] = []) {
  return draws.reduce(
    (total, draw) => total + Math.max(0, Math.round(draw.amountCents)),
    0
  );
}

function formatInterestAnnualBps(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

function formatInterestRateDraft(value: number) {
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

function parseInterestRateDraftToBps(value: string, fallback: number) {
  const normalized = value.replace(/[%\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(10_000, Math.round(parsed * 100)))
    : fallback;
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRequiredInteger(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  return Number.parseInt(normalized, 10);
}

function digitDraftValue(value: string) {
  return value.replace(/\D/g, "");
}

function centsToDollarsInput(cents: number) {
  return String(Math.round(cents / 100));
}

function dollarsInputToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : -1;
}

function dollarsInputToOptionalCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : -1;
}

function calculateUnapprovedBudgetBps(
  totalBudgetCents: number,
  approvedAmountCents: number
) {
  if (totalBudgetCents <= 0) {
    return 0;
  }
  const normalizedApprovedAmountCents = Math.max(
    0,
    Math.min(totalBudgetCents, approvedAmountCents)
  );
  return Math.max(
    0,
    Math.min(
      10_000,
      Math.round(
        ((totalBudgetCents - normalizedApprovedAmountCents) * 10_000) /
          totalBudgetCents
      )
    )
  );
}

function normalizeDocumentType(
  value: string
): "permit" | "budget" | "plan" | "supporting" {
  if (
    value === "permit" ||
    value === "budget" ||
    value === "plan" ||
    value === "supporting"
  ) {
    return value;
  }
  return "supporting";
}
