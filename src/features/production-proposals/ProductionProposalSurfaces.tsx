import {
  CalendarClock,
  CheckCircle2,
  Database,
  FileText,
  Send,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundX,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import type { TimelinePlanRow } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import {
  MaterialPlanningTab,
  type MaterialPlanningActions,
  type MaterialPlanningItem,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  type TimelineMilestoneWorksheetRow,
  TimelineMilestoneWorksheetTable,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

export type ProductionProposalStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "closed";

interface ProductionProposal {
  borrowerCoPayBps: number;
  borrowerWorkingCapitalLimitCents: number;
  buildName: string;
  lenderDrawPolicyLimitCents: number;
  location: string;
  status: ProductionProposalStatus;
  totalBudgetCents: number;
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
  key: string;
  milestoneKey: string;
  name: string;
  order?: number;
}

interface ProductionDraw {
  amountCents: number;
  drawKey: string;
  label: string;
  milestoneKey?: string;
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
  documents?: ProductionDocument[];
  draws?: ProductionDraw[];
  loanFacility?: { interestAnnualBps?: number; principalCents?: number } | null;
  costItems?: MaterialPlanningItem[];
  milestones?: ProductionMilestone[];
  permitWaiver?: { reason: string } | null;
  plannedDraws?: ProductionDraw[];
  proposal: ProductionProposal;
  submilestones?: ProductionSubmilestone[];
}

type ProductionReviewTab =
  | "closing"
  | "contractors"
  | "draws"
  | "materials"
  | "packet"
  | "review"
  | "timeline";

export interface ProductionKanbanCard {
  activeBuildId?: string;
  builderAssigned?: boolean;
  builderName?: string;
  column: ProductionProposalStatus;
  href?: string;
  proposalId: string;
  subtitle?: string;
  title: string;
  totalBudgetCents: number;
  updatedAt: number;
}

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
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
        cameraAngles: string[];
        whatToVerify: string[];
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
  borrowerWorkingCapitalLimitCents: number;
  buildName: string;
  documents?: Array<{
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageId?: string;
  }>;
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
  const initialMilestone = detail.milestones?.[0] ?? {
    budgetCents: proposal.totalBudgetCents || 10_000_000,
    dayEnd: 30,
    dayStart: 0,
    key: "foundation",
    name: "Foundation",
    order: 1,
  };
  const [buildName, setBuildName] = useState(proposal.buildName);
  const [location, setLocation] = useState(proposal.location);
  const [borrowerCoPayBps, setBorrowerCoPayBps] = useState(
    String(proposal.borrowerCoPayBps)
  );
  const [
    borrowerWorkingCapitalLimitCents,
    setBorrowerWorkingCapitalLimitCents,
  ] = useState(String(proposal.borrowerWorkingCapitalLimitCents));
  const [lenderDrawPolicyLimitCents, setLenderDrawPolicyLimitCents] = useState(
    String(proposal.lenderDrawPolicyLimitCents)
  );
  const [milestoneBudgetCents, setMilestoneBudgetCents] = useState(
    String(initialMilestone.budgetCents)
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

  function save() {
    onSave({
      borrowerCoPayBps: parseInteger(borrowerCoPayBps),
      borrowerWorkingCapitalLimitCents: parseInteger(
        borrowerWorkingCapitalLimitCents
      ),
      buildName,
      documents,
      lenderDrawPolicyLimitCents: parseInteger(lenderDrawPolicyLimitCents),
      location,
      milestones: [
        {
          budgetCents: parseInteger(milestoneBudgetCents),
          dayEnd: initialMilestone.dayEnd,
          dayStart: initialMilestone.dayStart,
          dependencyKeys: initialMilestone.dependencyKeys ?? [],
          durationDays:
            initialMilestone.durationDays ??
            Math.max(1, initialMilestone.dayEnd - initialMilestone.dayStart),
          key: initialMilestone.key,
          name: initialMilestone.name,
          order: initialMilestone.order,
          submilestones: [],
        },
      ],
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Proposal identity">
          <div className="grid gap-3">
            <LabeledInput
              label="Build name"
              onChange={setBuildName}
              value={buildName}
            />
            <LabeledInput
              label="Build location"
              onChange={setLocation}
              value={location}
            />
          </div>
        </Section>
        <Section title="Budget and capital">
          <div className="grid gap-3">
            <LabeledInput
              inputMode="numeric"
              label="Borrower co-pay bps"
              onChange={setBorrowerCoPayBps}
              value={borrowerCoPayBps}
            />
            <LabeledInput
              inputMode="numeric"
              label="Builder working capital cents"
              onChange={setBorrowerWorkingCapitalLimitCents}
              value={borrowerWorkingCapitalLimitCents}
            />
            <LabeledInput
              inputMode="numeric"
              label="Lender draw policy limit cents"
              onChange={setLenderDrawPolicyLimitCents}
              value={lenderDrawPolicyLimitCents}
            />
          </div>
        </Section>
        <Section title="Milestone worksheet">
          <LabeledInput
            inputMode="numeric"
            label={`${initialMilestone.name} budget`}
            onChange={setMilestoneBudgetCents}
            value={milestoneBudgetCents}
          />
        </Section>
        <Section title="Draw schedule">
          <p className="text-muted-foreground text-sm">
            Draw availability recalculates from milestone budget and borrower
            co-pay bps on save.
          </p>
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
                  "Builder working capital",
                  formatCents(proposal.borrowerWorkingCapitalLimitCents),
                ],
                [
                  "Lender draw policy limit",
                  formatCents(proposal.lenderDrawPolicyLimitCents),
                ],
                ["Borrower co-pay", formatBps(proposal.borrowerCoPayBps)],
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
  kanban,
  onAssignBuilder,
  onDeleteDraft,
  onOpen,
}: {
  builders?: ProductionBuilderOption[];
  kanban: ProductionKanban;
  onAssignBuilder?: (
    card: ProductionKanbanCard,
    builderProfileId: string
  ) => Promise<void> | void;
  onDeleteDraft?: (card: ProductionKanbanCard) => Promise<void> | void;
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
            <span className="flex min-w-0 items-center gap-1.5 text-foreground text-xs">
              <UserRound
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="truncate font-medium">{card.builderName}</span>
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
  ) => Promise<void> | void;
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
  onDelete?: (card: ProductionKanbanCard) => Promise<void> | void;
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
  detail,
  materialPlanningActions,
  onApprove,
  onClose,
  onReject,
  onRequestChanges,
  onUpdateDraw,
  contractors,
  timeline,
}: {
  contractors?: ReactNode;
  detail: ProductionProposalDetail;
  materialPlanningActions?: MaterialPlanningActions;
  onApprove: (
    reason: string,
    permitWaiverReason?: string
  ) => Promise<unknown> | unknown;
  onClose: (startDate: string, reason: string) => Promise<unknown> | unknown;
  onReject: (reason: string) => Promise<unknown> | unknown;
  onRequestChanges: (reason: string) => Promise<unknown> | unknown;
  onUpdateDraw?: (
    drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      reason: string;
      timingDay: number;
    }
  ) => void;
  timeline?: ReactNode;
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
  const proposal = detail.proposal;
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const reviewReason = reason.trim();
  const permitWaiverReviewReason = permitWaiverReason.trim();
  const editableDraws = detail.draws ?? [];
  const canEditDraws =
    !!onUpdateDraw &&
    (proposal.status === "submitted" || proposal.status === "approved") &&
    !!reviewReason;
  const tabs = useMemo(() => {
    const nextTabs: { label: string; value: ProductionReviewTab }[] = [];
    if (timeline) {
      nextTabs.push({ label: "Timeline", value: "timeline" });
    }
    if (contractors) {
      nextTabs.push({ label: "Contractors", value: "contractors" });
    }
    nextTabs.push({ label: "Review", value: "review" });
    if (editableDraws.length > 0) {
      nextTabs.push({ label: "Draw schedule", value: "draws" });
    }
    nextTabs.push({ label: "Materials", value: "materials" });
    nextTabs.push({ label: "Packet", value: "packet" });
    if (proposal.status === "approved" || proposal.status === "closed") {
      nextTabs.push({ label: "Closing", value: "closing" });
    }
    return nextTabs;
  }, [contractors, editableDraws.length, proposal.status, timeline]);
  const [activeTab, setActiveTab] = useState<ProductionReviewTab>(
    timeline ? "timeline" : "review"
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(tabs[0]?.value ?? "review");
    }
  }, [activeTab, tabs]);

  const runReviewDecision = async (
    decision: "approve" | "reject" | "requestChanges"
  ) => {
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
    if (decision === "approve" && !(permit || detail.permitWaiver)) {
      if (!permitWaiverReviewReason) {
        toast.error("Permit waiver reason required.", {
          description:
            "No permit PDF is linked, so approval needs a recorded waiver reason.",
        });
        return;
      }
    }

    setPendingDecision(decision);
    try {
      if (decision === "approve") {
        await onApprove(reviewReason, permitWaiverReviewReason || undefined);
      } else if (decision === "reject") {
        await onReject(reviewReason);
      } else {
        await onRequestChanges(reviewReason);
      }
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <section
      className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-1 flex-col bg-muted/30 p-0 md:p-5"
      data-testid="production-proposal-review-tabs"
    >
      <Tabs
        className="mx-auto max-w-full gap-4"
        onValueChange={(value) => setActiveTab(value as ProductionReviewTab)}
        value={activeTab}
      >
        <Frame>
          <FramePanel className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList
              aria-label="Proposal workspace sections"
              className="max-w-full justify-start overflow-x-auto"
              variant="underline"
            >
              {tabs.map((tab) => (
                <TabsTab key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTab>
              ))}
            </TabsList>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
              <span className="truncate">{proposal.buildName}</span>
              <span aria-hidden>·</span>
              <span className="truncate">{proposal.location}</span>
            </div>
          </FramePanel>
        </Frame>

        {timeline ? (
          <TabsPanel
            className="min-w-0"
            data-testid="production-proposal-timeline-tab"
            value="timeline"
          >
            {timeline}
          </TabsPanel>
        ) : null}

        {contractors ? (
          <TabsPanel
            className="min-w-0"
            data-testid="production-proposal-contractors-tab"
            value="contractors"
          >
            {contractors}
          </TabsPanel>
        ) : null}

        <TabsPanel
          className="min-w-0"
          data-testid="production-proposal-review-tab"
          value="review"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            {proposal.status === "approved" ? (
              <ApprovedProposalConfirmation detail={detail} />
            ) : (
              <Section title="Review decision">
                <div className="grid gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Badge variant="outline">
                        {statusLabel(proposal.status)}
                      </Badge>
                      <h2 className="mt-2 font-semibold text-xl tracking-tight">
                        {proposal.buildName}
                      </h2>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {proposal.location}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        disabled={
                          proposal.status !== "submitted" ||
                          pendingDecision !== null
                        }
                        onClick={() => void runReviewDecision("requestChanges")}
                        size="sm"
                        variant="outline"
                      >
                        {pendingDecision === "requestChanges"
                          ? "Requesting..."
                          : "Request changes"}
                      </Button>
                      <Button
                        disabled={
                          proposal.status !== "submitted" ||
                          pendingDecision !== null
                        }
                        onClick={() => void runReviewDecision("reject")}
                        size="sm"
                        variant="destructive"
                      >
                        {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
                      </Button>
                      <Button
                        disabled={
                          proposal.status !== "submitted" ||
                          pendingDecision !== null
                        }
                        onClick={() => void runReviewDecision("approve")}
                        size="sm"
                      >
                        {pendingDecision === "approve" ? "Approving..." : "Approve"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="production-review-reason">
                        Decision reason
                      </Label>
                      <Input
                        aria-describedby="production-review-reason-help"
                        id="production-review-reason"
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Required for material decisions"
                        value={reason}
                      />
                      <p
                        className="text-muted-foreground text-xs"
                        id="production-review-reason-help"
                      >
                        Stored on the audit event for approval, rejection, or
                        requested changes.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="production-permit-waiver">
                        Permit waiver reason
                      </Label>
                      <Input
                        aria-describedby="production-permit-waiver-help"
                        id="production-permit-waiver"
                        onChange={(event) =>
                          setPermitWaiverReason(event.target.value)
                        }
                        placeholder="Required if no permit PDF is linked"
                        value={permitWaiverReason}
                      />
                      <p
                        className="text-muted-foreground text-xs"
                        id="production-permit-waiver-help"
                      >
                        Only needed when approval relies on an audited permit
                        waiver.
                      </p>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            <div className="grid gap-4">
              <Section title="Review snapshot">
                <DetailGrid
                  rows={[
                    ["Total budget", formatCents(proposal.totalBudgetCents)],
                    [
                      "Builder working capital",
                      formatCents(proposal.borrowerWorkingCapitalLimitCents),
                    ],
                    [
                      "Lender draw policy limit",
                      formatCents(proposal.lenderDrawPolicyLimitCents),
                    ],
                    ["Borrower co-pay", formatBps(proposal.borrowerCoPayBps)],
                  ]}
                />
              </Section>

              <Section title="Readiness">
                <ProposalReadinessList
                  detail={detail}
                  permitFileName={permit?.fileName}
                />
              </Section>
            </div>
          </div>
        </TabsPanel>

        {editableDraws.length > 0 ? (
          <TabsPanel
            className="min-w-0"
            data-testid="production-proposal-draws-tab"
            value="draws"
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <Section title="Backoffice draw schedule">
                <DrawScheduleEditor
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
                  onCommit={(drawKey, patch) =>
                    onUpdateDraw?.(drawKey, { ...patch, reason })
                  }
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
          </TabsPanel>
        ) : null}

        <TabsPanel
          className="min-w-0"
          data-testid="production-proposal-materials-tab"
          value="materials"
        >
          <MaterialPlanningTab
            actions={materialPlanningActions}
            items={detail.costItems ?? []}
            milestones={materialPlanningMilestones(detail)}
            readOnly={!materialPlanningActions}
            scopeLabel="Build Proposal"
          />
        </TabsPanel>

        <TabsPanel
          className="min-w-0"
          data-testid="production-proposal-packet-tab"
          value="packet"
        >
          <ProposalPacketSnapshot detail={detail} />
        </TabsPanel>

        {proposal.status === "approved" || proposal.status === "closed" ? (
          <TabsPanel
            className="min-w-0"
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
                  disabled={proposal.status !== "approved" || !startDate}
                  onClick={() =>
                    onClose(startDate, reason || "Loan closed offline.")
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
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
      })),
  }));
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
          <CheckCircle2 className="size-8" aria-hidden />
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

function ProposalReadinessList({
  detail,
  permitFileName,
}: {
  detail: ProductionProposalDetail;
  permitFileName?: string;
}) {
  const milestoneCount = detail.milestones?.length ?? 0;
  const drawCount = (detail.draws ?? detail.plannedDraws ?? []).length;

  return (
    <ul className="grid gap-3 text-sm">
      <li className="flex gap-2">
        {permitFileName || detail.permitWaiver ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <span>
          {permitFileName
            ? `Permit PDF linked: ${permitFileName}`
            : detail.permitWaiver
              ? `Permit waiver recorded: ${detail.permitWaiver.reason}`
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
  );
}

function DrawScheduleEditor({
  canEditDraws,
  drawAmounts,
  drawLabels,
  draws,
  drawTimingDays,
  onAmountChange,
  onCommit,
  onLabelChange,
  onTimingChange,
}: {
  canEditDraws: boolean;
  drawAmounts: Record<string, string>;
  drawLabels: Record<string, string>;
  draws: ProductionDraw[];
  drawTimingDays: Record<string, string>;
  onAmountChange: (drawKey: string, value: string) => void;
  onCommit: (
    drawKey: string,
    patch: { amountCents: number; label: string; timingDay: number }
  ) => void;
  onLabelChange: (drawKey: string, value: string) => void;
  onTimingChange: (drawKey: string, value: string) => void;
}) {
  if (draws.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No proposal draw rows are available for review edits.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {draws.map((draw) => {
        const amountValue =
          drawAmounts[draw.drawKey] ?? String(draw.amountCents);
        const labelValue = drawLabels[draw.drawKey] ?? draw.label;
        const timingValue =
          drawTimingDays[draw.drawKey] ?? String(draw.timingDay);

        return (
          <fieldset
            className="grid gap-3 border-b pb-4 last:border-b-0 last:pb-0"
            key={draw.drawKey}
          >
            <legend className="mb-1 font-medium text-sm">{draw.drawKey}</legend>
            <div className="grid gap-2">
              <Label htmlFor={`draw-label-${draw.drawKey}`}>
                {draw.drawKey} label
              </Label>
              <Input
                id={`draw-label-${draw.drawKey}`}
                onChange={(event) =>
                  onLabelChange(draw.drawKey, event.target.value)
                }
                value={labelValue}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`draw-amount-${draw.drawKey}`}>
                  Amount cents
                </Label>
                <Input
                  id={`draw-amount-${draw.drawKey}`}
                  inputMode="numeric"
                  onChange={(event) =>
                    onAmountChange(draw.drawKey, event.target.value)
                  }
                  value={amountValue}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`draw-timing-${draw.drawKey}`}>
                  Timing day
                </Label>
                <Input
                  id={`draw-timing-${draw.drawKey}`}
                  inputMode="numeric"
                  onChange={(event) =>
                    onTimingChange(draw.drawKey, event.target.value)
                  }
                  value={timingValue}
                />
              </div>
            </div>
            <div>
              <Button
                disabled={!canEditDraws}
                onClick={() =>
                  onCommit(draw.drawKey, {
                    amountCents: parseInteger(amountValue),
                    label: labelValue,
                    timingDay: parseInteger(timingValue),
                  })
                }
                size="sm"
                variant="outline"
              >
                Save draw row
              </Button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function ProposalPacketSnapshot({
  detail,
}: {
  detail: ProductionProposalDetail;
}) {
  const proposal = detail.proposal;
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const draws = detail.draws ?? detail.plannedDraws ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid gap-4">
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

      <div className="grid gap-4">
        <Section title="Proposal identity">
          <DetailGrid
            rows={[
              ["Build", proposal.buildName],
              ["Location", proposal.location],
              ["Status", statusLabel(proposal.status)],
            ]}
          />
        </Section>

        <Section title="Budget and capital">
          <DetailGrid
            rows={[
              ["Total budget", formatCents(proposal.totalBudgetCents)],
              [
                "Builder working capital",
                formatCents(proposal.borrowerWorkingCapitalLimitCents),
              ],
              [
                "Lender draw policy limit",
                formatCents(proposal.lenderDrawPolicyLimitCents),
              ],
              ["Borrower co-pay", formatBps(proposal.borrowerCoPayBps)],
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
          </div>
        </Section>
      </div>
    </div>
  );
}

export function toTimelineRows(
  cards: ProductionKanbanCard[]
): TimelinePlanRow[] {
  return cards.map((card) => ({
    buildName: card.title,
    buildKey: card.activeBuildId,
    drawCount: 0,
    milestoneCount: 0,
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

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
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

function parseInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
