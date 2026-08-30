"use client";

import {
  ExternalLink,
} from "lucide-react";
import {
  lazy,
  useMemo,
  useState,
} from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import { contractorPlanningFromProductionDetail } from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import {
  type ContractorPlanningMilestone,
  ContractorPlanningPanel,
} from "#/features/contractors/ContractorPlanningPanel.tsx";
import {
  type ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { ContractorsCard } from "./ContractorsCard";
import {
  type KanbanCardData,
  MilestoneKanban,
} from "./MilestoneKanban";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDocument,
} from "./production-build-detail-contracts.ts";
import { buildProductionKanbanCards } from "./production-build-detail-workspaces.tsx";

export function ProductionDocumentsCard({
  actions,
  documents,
}: {
  actions?: ProductionBuildDetailActions;
  documents: ProductionDocument[];
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"permit" | "budget" | "plan" | "supporting">(
    "supporting"
  );
  const [supersedesDocumentId, setSupersedesDocumentId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const onAdd = async () => {
    if (!(name.trim() && actions?.addDocument) || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await actions.addDocument({
        documentType: kind,
        fileName: name.trim(),
        supersedesDocumentId: supersedesDocumentId || undefined,
      });
      setName("");
      setKind("supporting");
      setSupersedesDocumentId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card data-testid="build-detail-documents" id="documents">
      <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4">
        <CardTitle className="text-sm">Documents</CardTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {documents.length}
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div
          className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(180px,auto)_auto]"
          data-testid="documents-add-form"
        >
          <input
            aria-label="Document name"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Inspection_2026-08.pdf"
            value={name}
          />
          <select
            aria-label="Document kind"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-kind"
            onChange={(event) => setKind(event.target.value as typeof kind)}
            value={kind}
          >
            {["permit", "budget", "plan", "supporting"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Document version relationship"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-supersedes"
            onChange={(event) => {
              const documentId = event.target.value;
              setSupersedesDocumentId(documentId);
              const selected = documents.find(
                (document) => document._id === documentId
              );
              const selectedType = selected?.documentType ?? selected?.kind;
              if (
                selectedType === "permit" ||
                selectedType === "budget" ||
                selectedType === "plan" ||
                selectedType === "supporting"
              ) {
                setKind(selectedType);
              }
            }}
            value={supersedesDocumentId}
          >
            <option value="">New Document</option>
            {documents
              .filter((document) => document.status !== "superseded")
              .map((document) => (
                <option key={document._id} value={document._id}>
                  Supersede {document.name ?? document.fileName} v
                  {document.version ?? 1}
                </option>
              ))}
          </select>
          <button
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50 md:py-1.5"
            data-testid="documents-add"
            disabled={!(name.trim() && actions?.addDocument) || pending}
            onClick={onAdd}
            type="button"
          >
            {pending ? "Adding..." : "Add"}
          </button>
        </div>
        {error ? (
          <p className="mb-2 text-destructive text-xs">{error}</p>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-xs">No documents yet.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => (
              <li
                className="flex flex-col items-start gap-1 rounded-md border border-border bg-background/40 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                data-collaboration-focus={`document:${document._id}`}
                data-testid={`build-detail-document-${document._id}`}
                key={document._id}
              >
                <span className="truncate">
                  {document.name ?? document.fileName}
                </span>
                <div className="flex shrink-0 items-center gap-2 sm:ml-2">
                  <span className="text-muted-foreground text-xs">
                    {document.kind ?? document.documentType}
                    {` · v${document.version ?? 1}`}
                    {document.status ? ` · ${document.status}` : ""}
                    {document.sizeBytes
                      ? ` - ${Math.round(document.sizeBytes / 1024)}KB`
                      : ""}
                  </span>
                  {(document.kind === "permit" ||
                    document.documentType === "permit") &&
                  (document.storageUrl || document.url) ? (
                    <Button
                      render={
                        <a
                          data-testid={`build-detail-document-${document._id}-view`}
                          href={document.storageUrl ?? document.url ?? ""}
                          rel="noreferrer"
                          target="_blank"
                        />
                      }
                      size="xs"
                      variant="outline"
                    >
                      <ExternalLink />
                      View
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductionMilestonesTab({
  currentDay,
  detail,
  onOpenCanonicalTarget,
  onAssignContractor,
  onCardClick,
  onStartWork,
  projection,
  viewerRole,
}: {
  currentDay: number;
  detail: ProductionBuildDetail;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onAssignContractor?: (card: KanbanCardData) => void;
  onCardClick: (card: KanbanCardData) => void;
  onStartWork?: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [showCompletedKanban, setShowCompletedKanban] = useState(false);
  const kanbanCards = useMemo(
    () => buildProductionKanbanCards(detail, projection, currentDay),
    [currentDay, detail, projection]
  );

  return (
    <div className="grid gap-4" data-testid="production-build-milestones">
      <MilestoneKanban
        cards={kanbanCards}
        onAssignContractor={onAssignContractor}
        onCardClick={onCardClick}
        onStartWork={
          onStartWork ? (card) => onStartWork(card.milestoneKey) : undefined
        }
        onSubmilestoneClick={
          onOpenCanonicalTarget
            ? (_card, submilestone) => {
                if (!submilestone.submilestoneId) {
                  return;
                }
                onOpenCanonicalTarget(
                  {
                    kind: "submilestone",
                    submilestoneId: submilestone.submilestoneId,
                  },
                  { selectedTab: "overview" }
                );
              }
            : undefined
        }
        onToggleShowCompleted={() => setShowCompletedKanban((prev) => !prev)}
        showCompleted={showCompletedKanban}
        viewerRole={viewerRole}
      />
    </div>
  );
}

export function ProductionDocumentsTab({
  actions,
  detail,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
}) {
  return (
    <div data-testid="production-build-documents">
      <ProductionDocumentsCard
        actions={actions}
        documents={detail.documents ?? []}
      />
    </div>
  );
}

export function ProductionContractorsTab({
  actions,
  contractorDetailHrefFor,
  detail,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  contractorDetailHrefFor?: (contractorId: string) => string;
  detail: ProductionBuildDetail;
  viewerRole: "builder" | "lender";
}) {
  const planning = useMemo(
    () => contractorPlanningFromProductionDetail(detail),
    [detail]
  );
  const milestones = useMemo(
    () => productionBuildMilestonesForContractors(detail),
    [detail]
  );

  return (
    <div className="space-y-4" data-testid="production-build-contractors">
      <ContractorsCard
        actions={contractorsCardActions(actions)}
        availableContractors={detail.availableContractors ?? []}
        buildId={detail.build._id}
        contractorDetailHrefFor={contractorDetailHrefFor}
        contractors={detail.contractors ?? []}
      />
      <ContractorPlanningPanel
        canMutate={Boolean(
          actions?.assignContractorToMilestone ||
            actions?.removeContractorFromMilestone ||
            actions?.attachAndInviteContractor ||
            actions?.attachContractor ||
            actions?.createAndAttachContractor
        )}
        milestones={milestones}
        onAssignToMilestone={
          actions?.assignContractorToMilestone
            ? async ({
                assignmentCost,
                contractorId,
                milestoneKey,
                role,
                submilestoneKeys,
              }) => {
                await actions.assignContractorToMilestone?.({
                  assignmentCost,
                  contractorId,
                  milestoneKey,
                  role,
                  submilestoneKeys,
                });
              }
            : undefined
        }
        onAttachAndInviteExisting={
          actions?.attachAndInviteContractor
            ? async ({ contractorId, role }) => {
                await actions.attachAndInviteContractor?.({
                  contractorId,
                  role,
                });
              }
            : undefined
        }
        onAttachExisting={
          actions?.attachContractor
            ? async ({ contractorId, role }) => {
                await actions.attachContractor?.({ contractorId, role });
              }
            : undefined
        }
        onCreateAndAttach={
          actions?.createAndAttachContractor
            ? ({ contractor, role }) =>
                actions.createAndAttachContractor?.({
                  contractor,
                  role: role ?? contractor.trades[0] ?? "Contractor",
                })
            : undefined
        }
        onInviteCreatedContractor={
          actions?.inviteContractor
            ? async (contractorId) => {
                await actions.inviteContractor?.(contractorId);
              }
            : undefined
        }
        onRemoveFromMilestone={
          actions?.removeContractorFromMilestone
            ? async (input) => {
                await actions.removeContractorFromMilestone?.(input);
              }
            : undefined
        }
        planning={planning}
        roleLabel={viewerRole}
      />
    </div>
  );
}

function productionBuildMilestonesForContractors(
  detail: ProductionBuildDetail
): ContractorPlanningMilestone[] {
  return [...detail.milestones]
    .sort((a, b) => a.order - b.order)
    .map((milestone) => ({
      milestoneKey: milestone.key,
      name: milestone.name,
      submilestoneSnapshot: (detail.submilestones ?? [])
        .filter((submilestone) => submilestone.milestoneKey === milestone.key)
        .sort((a, b) => a.order - b.order)
        .map((submilestone) => ({
          key: submilestone.key,
          name: submilestone.name,
        })),
    }));
}

export function contractorsCardActions(actions?: ProductionBuildDetailActions) {
  return {
    onAttachAndInviteExisting: actions?.attachAndInviteContractor
      ? async (input: { contractorId: string; role: string }) => {
          await actions.attachAndInviteContractor?.(input);
        }
      : undefined,
    onAttachExisting: actions?.attachContractor
      ? async (input: { contractorId: string; role: string }) => {
          await actions.attachContractor?.(input);
        }
      : undefined,
    onCreateAndAttach: actions?.createAndAttachContractor
      ? (input: { contractor: ContractorProfileDraft; role: string }) =>
          actions.createAndAttachContractor?.(input)
      : undefined,
    onInviteCreatedContractor: actions?.inviteContractor
      ? async (contractorId: string) => {
          await actions.inviteContractor?.(contractorId);
        }
      : undefined,
    sourceLabel: "production_contractors",
  };
}
