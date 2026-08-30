import { AlertTriangle, Search, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  deriveProposalDrawGroups,
  normalizeProposalDrawRows,
  ProductionProposalGanttWorkspace,
  type ProposalGanttDrawDraft,
  type ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspace.tsx";
import { productionProposalDetailToDraftMilestones } from "./productionMilestoneWorksheetAdapter.ts";
import type {
  ProductionProposalDetail,
  ProductionProposalDraftSavePayload,
} from "./production-proposal-surface-contracts";
import {
  draftDrawsForAvailabilityRecalculation,
  productionProposalDetailToDraftDraws,
  Section,
  LabeledInput,
  statusLabel,
  formatCents,
  parseInteger,
  calculateUnapprovedBudgetBps,
  normalizeDocumentType,
} from "./production-proposal-surface-shared";

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
