import {
  CalendarClock,
  CheckCircle2,
  Database,
  FileText,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import type { TimelinePlanRow } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import {
  TimelineMilestoneWorksheetTable,
  type TimelineMilestoneWorksheetRow,
} from "#/routes/demo/timeline/-TimelineMilestoneWorksheetTable.tsx";
import type { IsometricIconKey } from "#/routes/demo/timeline/-timeline-share-snapshot.ts";

export type ProductionProposalStatus = "draft" | "submitted" | "approved" | "closed";

interface ProductionProposal {
  buildName: string;
  borrowerCoPayBps: number;
  borrowerWorkingCapitalLimitCents: number;
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
  key: string;
  milestoneKey: string;
  name: string;
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
  milestones?: ProductionMilestone[];
  permitWaiver?: { reason: string } | null;
  plannedDraws?: ProductionDraw[];
  proposal: ProductionProposal;
  submilestones?: ProductionSubmilestone[];
}

export interface ProductionKanbanCard {
  builderName?: string;
  column: ProductionProposalStatus;
  href?: string;
  proposalId: string;
  subtitle?: string;
  title: string;
  totalBudgetCents: number;
  updatedAt: number;
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
  lenderDrawPolicyLimitCents: number;
  location: string;
  documents?: Array<{
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageId?: string;
  }>;
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
    budgetCents: proposal.totalBudgetCents || 100_000_00,
    dayEnd: 30,
    dayStart: 0,
    key: "foundation",
    name: "Foundation",
    order: 1,
  };
  const [buildName, setBuildName] = useState(proposal.buildName);
  const [location, setLocation] = useState(proposal.location);
  const [borrowerCoPayBps, setBorrowerCoPayBps] = useState(
    String(proposal.borrowerCoPayBps),
  );
  const [borrowerWorkingCapitalLimitCents, setBorrowerWorkingCapitalLimitCents] =
    useState(String(proposal.borrowerWorkingCapitalLimitCents));
  const [lenderDrawPolicyLimitCents, setLenderDrawPolicyLimitCents] = useState(
    String(proposal.lenderDrawPolicyLimitCents),
  );
  const [milestoneBudgetCents, setMilestoneBudgetCents] = useState(
    String(initialMilestone.budgetCents),
  );
  const [documentType, setDocumentType] =
    useState<"permit" | "budget" | "plan" | "supporting">("permit");
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
      })) ?? [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function save() {
    onSave({
      borrowerCoPayBps: parseInteger(borrowerCoPayBps),
      borrowerWorkingCapitalLimitCents: parseInteger(
        borrowerWorkingCapitalLimitCents,
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
        error instanceof Error ? error.message : "Document upload failed.",
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
              {!permit && !detail.permitWaiver ? (
                <li className="flex gap-2">
                  <XCircle className="size-4 text-warning" />
                  Permit PDF or permit waiver required before approval.
                </li>
              ) : null}
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
  kanban,
  onOpen,
}: {
  kanban: ProductionKanban;
  onOpen?: (card: ProductionKanbanCard) => void;
}) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="p-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            Proposal kanban
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Production Build Proposals move only through workflow mutations.
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
                <Card
                  className="rounded-lg"
                  key={card.proposalId}
                  render={
                    <button
                      className="w-full text-left"
                      onClick={() => onOpen?.(card)}
                      type="button"
                    />
                  }
                >
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm">{card.title}</CardTitle>
                    <CardDescription>{card.subtitle}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

export function ProductionProposalSettingsSurface({
  onSeed,
  settings,
}: {
  onSeed?: () => void;
  settings: ProductionProposalSettings | undefined;
}) {
  const template = settings?.templates[0];
  const workflowRule = settings?.workflowRules[0];
  const activeScenario = template?.scenarios.find(
    (scenario) => scenario.isDefault,
  );
  const worksheetRows = useMemo(
    () => productionTemplateToWorksheetRows(template),
    [template],
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
              Tenant-scoped templates, milestone archetypes, draw scenarios,
              and workflow rules used by canonical proposal routes.
            </p>
          </div>
          {onSeed ? (
            <Button onClick={onSeed} size="sm" variant="outline">
              <Database />
              Seed production foundation
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
  onApprove,
  onClose,
  onReject,
  onRequestChanges,
  onUpdateDraw,
}: {
  detail: ProductionProposalDetail;
  onApprove: (reason: string, permitWaiverReason?: string) => void;
  onClose: (startDate: string, reason: string) => void;
  onReject: (reason: string) => void;
  onRequestChanges: (reason: string) => void;
  onUpdateDraw?: (
    drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      reason: string;
      timingDay: number;
    },
  ) => void;
}) {
  const [reason, setReason] = useState("");
  const [permitWaiverReason, setPermitWaiverReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [drawAmounts, setDrawAmounts] = useState<Record<string, string>>({});
  const [drawLabels, setDrawLabels] = useState<Record<string, string>>({});
  const [drawTimingDays, setDrawTimingDays] = useState<Record<string, string>>({});
  const proposal = detail.proposal;
  const editableDraws = detail.draws ?? [];
  const canEditDraws =
    !!onUpdateDraw &&
    (proposal.status === "submitted" || proposal.status === "approved") &&
    !!reason.trim();

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h1 className="mt-2 font-semibold text-2xl tracking-tight">
              {proposal.status === "approved"
                ? "Approved proposal"
                : proposal.buildName}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {proposal.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={proposal.status !== "submitted"}
              onClick={() => onRequestChanges(reason)}
              size="sm"
              variant="outline"
            >
              Request changes
            </Button>
            <Button
              disabled={proposal.status !== "submitted"}
              onClick={() => onReject(reason)}
              size="sm"
              variant="destructive"
            >
              Reject
            </Button>
            <Button
              disabled={proposal.status !== "submitted"}
              onClick={() => onApprove(reason, permitWaiverReason || undefined)}
              size="sm"
            >
              Approve
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ProductionProposalPackageSurface
          action={null}
          detail={detail}
          onSubmit={() => undefined}
        />
        <div className="flex flex-col gap-4">
          <Section title="Review decision">
            <Label htmlFor="production-review-reason">Reason</Label>
            <Input
              id="production-review-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for material decisions"
              value={reason}
            />
            <Label htmlFor="production-permit-waiver" className="mt-3">
              Permit waiver reason
            </Label>
            <Input
              id="production-permit-waiver"
              onChange={(event) => setPermitWaiverReason(event.target.value)}
              placeholder="Required if no permit PDF is linked"
              value={permitWaiverReason}
            />
          </Section>

          <Section title="Backoffice draw schedule">
            <div className="grid gap-3">
              {editableDraws.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No proposal draw rows are available for review edits.
                </p>
              ) : null}
              {editableDraws.map((draw) => {
                const amountValue =
                  drawAmounts[draw.drawKey] ?? String(draw.amountCents);
                const labelValue = drawLabels[draw.drawKey] ?? draw.label;
                const timingValue =
                  drawTimingDays[draw.drawKey] ?? String(draw.timingDay);
                return (
                  <div className="grid gap-2 border-b pb-3 last:border-b-0 last:pb-0" key={draw.drawKey}>
                    <Label htmlFor={`draw-label-${draw.drawKey}`}>
                      {draw.drawKey} label
                    </Label>
                    <Input
                      id={`draw-label-${draw.drawKey}`}
                      onChange={(event) =>
                        setDrawLabels((current) => ({
                          ...current,
                          [draw.drawKey]: event.target.value,
                        }))
                      }
                      value={labelValue}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`draw-amount-${draw.drawKey}`}>
                          Amount cents
                        </Label>
                        <Input
                          id={`draw-amount-${draw.drawKey}`}
                          inputMode="numeric"
                          onChange={(event) =>
                            setDrawAmounts((current) => ({
                              ...current,
                              [draw.drawKey]: event.target.value,
                            }))
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
                            setDrawTimingDays((current) => ({
                              ...current,
                              [draw.drawKey]: event.target.value,
                            }))
                          }
                          value={timingValue}
                        />
                      </div>
                    </div>
                    <Button
                      disabled={!canEditDraws}
                      onClick={() =>
                        onUpdateDraw?.(draw.drawKey, {
                          amountCents: parseInteger(amountValue),
                          label: labelValue,
                          reason,
                          timingDay: parseInteger(timingValue),
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Save draw row
                    </Button>
                  </div>
                );
              })}
            </div>
          </Section>

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
            <div className="mt-3 grid gap-2">
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
                onClick={() => onClose(startDate, reason || "Loan closed offline.")}
                size="sm"
              >
                <CalendarClock />
                Record closing
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

export function toTimelineRows(cards: ProductionKanbanCard[]): TimelinePlanRow[] {
  return cards.map((card) => ({
    buildName: card.title,
    drawCount: 0,
    milestoneCount: 0,
    planId: card.proposalId,
    status: card.column === "closed" ? "approved" : card.column,
    totalBudgetCents: card.totalBudgetCents,
    updatedAt: card.updatedAt,
  }));
}

function productionTemplateToWorksheetRows(
  template: ProductionProposalSettings["templates"][number] | undefined,
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
      icon: milestone.icon ?? iconForMilestoneKey(milestone.key, milestone.name),
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
        (submilestone) => submilestone.name,
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

function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
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
  value: string,
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
