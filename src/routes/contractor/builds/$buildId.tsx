import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
} from "#/features/backoffice-build-detail/MilestoneStartDialog.tsx";
import { BuildCollaborationWorkspace } from "#/features/build-collaboration/BuildCollaborationWorkspace.tsx";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import { CostDocumentBatchWorkspace } from "#/features/cost-documents/CostDocumentBatchWorkspace.tsx";
import {
  type CostDocumentDetail,
  CostDocumentDetailSheet,
} from "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx";
import { normalizeCostDocumentSearch } from "#/features/cost-documents/costDocumentRouteState.ts";
import {
  type BuildSubmilestoneDetailTab,
  normalizeBuildSubmilestoneDetailTab,
} from "#/features/build-detail-targets/buildDetailTab.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ContractorBuildSearch {
  assignmentId?: string;
  costBatch?: string;
  costDocument?: string;
  costDocumentDraft?: string;
  detailTab?: BuildSubmilestoneDetailTab;
  focus?: string;
}

export const Route = createFileRoute("/contractor/builds/$buildId")({
  staticData: {
    breadcrumb: { label: "Build", to: "/contractor/builds" },
  },
  validateSearch: (search: Record<string, unknown>): ContractorBuildSearch => {
    const assignmentId =
      typeof search.assignmentId === "string" ? search.assignmentId : undefined;
    const costDocumentSearch = normalizeCostDocumentSearch(search);
    const focus = normalizeBuildCollaborationFocus(search.focus);
    const detailTab = normalizeBuildSubmilestoneDetailTab(search.detailTab);
    return {
      ...(assignmentId ? { assignmentId } : {}),
      ...costDocumentSearch,
      ...(detailTab ? { detailTab } : {}),
      ...(focus ? { focus } : {}),
    };
  },
  component: ContractorBuildDetail,
});

type ResponseKind = "clarification" | "dispute";
interface ContractorScope {
  acknowledgement: { state: string } | null;
  actualStartedAt: number | null;
  assignmentId: Id<"milestoneContractorAssignments">;
  buildSubmilestoneId: Id<"buildSubmilestones"> | null;
  costDocumentCaptureEligible: boolean;
  dependencyBlockers: Array<{
    milestoneKey: string;
    milestoneName: string;
    status: "in_progress" | "planned";
  }>;
  milestoneKey: string;
  milestoneName: string;
  role: string;
  status: string;
  submilestoneKey: string | null;
  submilestoneName: string | null;
  workStatus: "complete" | "in_progress" | "planned" | null;
}

interface ContractorPermitDocument {
  _id: string;
  fileName: string;
}

/**
 * Active build detail (PRD §8.5). Scope-limited; raw ratings and financing
 * never reach the contractor (backend-enforced redaction).
 */
function ContractorBuildDetail() {
  const { buildId } = Route.useParams();
  const {
    assignmentId,
    costBatch,
    costDocument,
    costDocumentDraft,
    detailTab,
    focus,
  } = Route.useSearch();
  const navigate = useNavigate();
  const routeContext = Route.useRouteContext();
  const participationScope = useQuery(
    api.build_participants.getMyBuildParticipationScope,
    {
      buildId: buildId as Id<"activeBuilds">,
      organizationId: routeContext.organizationId ?? undefined,
      workspaceRole: "contractor",
    },
  );
  const hasLegacyContractorProfile =
    participationScope?.legacyContractorProfileLinked === true;
  const detail = useQuery(
    api.contractorWorkspace.getContractorBuildDetail,
    hasLegacyContractorProfile
      ? {
          buildId: buildId as Id<"activeBuilds">,
        }
      : "skip",
  );
  const acknowledge = useMutation(
    api.contractorEvidence.acknowledgeContractorAssignment,
  );
  const requestClarification = useMutation(
    api.contractorEvidence.requestContractorScopeClarification,
  );
  const disputeScope = useMutation(
    api.contractorEvidence.flagContractorScopeMismatch,
  );
  const startAssignedSubmilestone = useMutation(
    api.contractorWorkspace.startAssignedSubmilestone,
  );
  const [response, setResponse] = useState<{
    assignmentId: string;
    kind: ResponseKind;
  } | null>(null);
  const [responseText, setResponseText] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startRequest, setStartRequest] = useState<{
    request: MilestoneStartDialogRequest;
    scope: ContractorScope;
  } | null>(null);

  if (
    participationScope === undefined ||
    (hasLegacyContractorProfile && detail === undefined)
  ) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <p className="text-muted-foreground text-sm">Loading build…</p>
      </main>
    );
  }

  if (!participationScope) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame className="mx-auto w-full max-w-5xl">
          <FramePanel>
            <p className="font-medium text-sm">Build unavailable</p>
            <p className="mt-1 text-muted-foreground text-sm">
              This Build is not assigned to your contractor workspace. Return to
              your Build list and choose an assigned Build.
            </p>
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (!hasLegacyContractorProfile) {
    return (
      <ContractorCollaborationSurface
        buildId={buildId}
        buildName={participationScope.buildName}
        detailTab={detailTab}
        focus={focus}
        organizationId={participationScope.organizationId}
      />
    );
  }

  if (!detail) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame className="mx-auto w-full max-w-5xl">
          <FramePanel>
            <p className="font-medium text-sm">Build unavailable</p>
            <p className="mt-1 text-muted-foreground text-sm">
              This contractor assignment could not be loaded. Return to your
              Build list and try again.
            </p>
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (!detail.build) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <Frame>
            <FramePanel className="space-y-4 p-5">
              <div>
                <p className="font-semibold">Assignment unavailable</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {detail.availability.message}
                </p>
              </div>
              <p className="font-medium text-muted-foreground text-xs">
                Support reference: {detail.availability.reference}
              </p>
              <Button render={<Link to="/contractor/work" />} variant="outline">
                Return to current work
              </Button>
            </FramePanel>
          </Frame>
          <BuildCollaborationSection
            buildId={buildId}
            detailTab={detailTab}
            focus={focus}
            organizationId={participationScope.organizationId}
          />
        </div>
      </main>
    );
  }

  // This route receives only the contractor-safe Build projection. The server
  // is the authority for every write, but keeping this list to currently
  // active assigned Sub-milestones makes stale/deep-linked capture recover in
  // first-party context without exposing unrelated Build scope.
  const costDocumentSubmilestones = [
    ...new Map(
      detail.assignedScope
        .filter(
          (scope: ContractorScope) =>
            scope.status === "active" &&
            scope.costDocumentCaptureEligible &&
            scope.buildSubmilestoneId,
        )
        .map((scope: ContractorScope) => [
          String(scope.buildSubmilestoneId),
          {
            id: scope.buildSubmilestoneId as Id<"buildSubmilestones">,
            label: `${scope.milestoneName} · ${
              scope.submilestoneName ?? scope.submilestoneKey ?? "Sub-milestone"
            }`,
            milestoneKey: scope.milestoneKey,
            milestoneName: scope.milestoneName,
          },
        ]),
    ).values(),
  ];

  const acknowledgeAssignment = async (scope: ContractorScope) => {
    const actionKey = `acknowledge:${scope.assignmentId}`;
    setPendingAction(actionKey);
    setErrorMessage(null);
    try {
      await acknowledge({
        assignmentType: "build",
        buildAssignmentId:
          scope.assignmentId as Id<"milestoneContractorAssignments">,
        kind: "assignment",
        workosOrganizationId: detail.build.organizationId,
      });
      toast.success("Assignment acknowledged.");
    } catch {
      setErrorMessage(
        "We could not acknowledge this assignment. Retry or contact the Builder.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const submitResponse = async (scope: ContractorScope) => {
    if (!response || response.assignmentId !== String(scope.assignmentId)) {
      return;
    }
    const summary = responseText.trim();
    if (!summary) {
      setErrorMessage(
        "Describe the clarification or scope concern before sending.",
      );
      return;
    }
    const actionKey = `${response.kind}:${scope.assignmentId}`;
    setPendingAction(actionKey);
    setErrorMessage(null);
    const input = {
      assignmentType: "build" as const,
      buildAssignmentId:
        scope.assignmentId as Id<"milestoneContractorAssignments">,
      milestoneKey: scope.milestoneKey,
      summary,
      submilestoneKey: scope.submilestoneKey ?? undefined,
      workosOrganizationId: detail.build.organizationId,
    };
    try {
      if (response.kind === "clarification") {
        await requestClarification(input);
      } else {
        await disputeScope(input);
      }
      toast.success(
        response.kind === "clarification"
          ? "Clarification requested."
          : "Scope concern sent.",
      );
      setResponse(null);
      setResponseText("");
    } catch {
      setErrorMessage(
        "We could not send this response. Retry or contact the Builder.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Active build
          </p>
          <h1 className="mt-1 font-semibold text-2xl">
            {detail.build.buildName}
          </h1>
          {detail.build.location ? (
            <p className="mt-1 text-muted-foreground text-sm">
              {detail.build.location}
            </p>
          ) : null}
        </header>

        {errorMessage ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          <Frame className="lg:col-span-2">
            <FramePanel className="p-0">
              <div className="border-b p-4">
                <h2 className="font-semibold text-sm">Your assigned scope</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Acknowledge each assignment or send a scoped response to the
                  Builder.
                </p>
              </div>
              <ul className="divide-y">
                {detail.assignedScope.map((scope: ContractorScope) => {
                  const selected = assignmentId === String(scope.assignmentId);
                  const responseOpen =
                    response?.assignmentId === String(scope.assignmentId);
                  const acknowledged =
                    scope.acknowledgement?.state === "acknowledged";
                  return (
                    <li
                      className={cn(
                        "space-y-3 p-4",
                        selected && "bg-accent/40 ring-2 ring-ring ring-inset",
                      )}
                      id={`assignment-${scope.assignmentId}`}
                      key={scope.assignmentId}
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {scope.milestoneName}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {scope.role} · {scope.status}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Acknowledgement:{" "}
                          {scope.acknowledgement?.state ?? "pending"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {scope.submilestoneKey &&
                        scope.workStatus === "planned" &&
                        !scope.actualStartedAt ? (
                          <Button
                            data-testid={`contractor-start-work-${scope.submilestoneKey}`}
                            onClick={() =>
                              setStartRequest({
                                request: {
                                  action: "start",
                                  buildName: detail.build.buildName,
                                  dependencyBlockers: scope.dependencyBlockers,
                                  milestoneKey: scope.milestoneKey,
                                  milestoneName: scope.milestoneName,
                                  plannedStartDate:
                                    detail.build.startDate ??
                                    new Date().toISOString(),
                                  scope: "submilestone",
                                  source: "submilestone_detail",
                                  startParent: false,
                                  submilestoneKey:
                                    scope.submilestoneKey ?? undefined,
                                  submilestoneName:
                                    scope.submilestoneName ??
                                    scope.submilestoneKey ??
                                    undefined,
                                },
                                scope,
                              })
                            }
                            size="sm"
                          >
                            Start work
                          </Button>
                        ) : null}
                        <Button
                          disabled={
                            acknowledged ||
                            pendingAction ===
                              `acknowledge:${scope.assignmentId}`
                          }
                          loading={
                            pendingAction ===
                            `acknowledge:${scope.assignmentId}`
                          }
                          onClick={() => acknowledgeAssignment(scope)}
                          size="sm"
                        >
                          {acknowledged ? "Acknowledged" : "Acknowledge"}
                        </Button>
                        <Button
                          onClick={() => {
                            setErrorMessage(null);
                            setResponse({
                              assignmentId: String(scope.assignmentId),
                              kind: "clarification",
                            });
                            setResponseText("");
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Request clarification
                        </Button>
                        <Button
                          onClick={() => {
                            setErrorMessage(null);
                            setResponse({
                              assignmentId: String(scope.assignmentId),
                              kind: "dispute",
                            });
                            setResponseText("");
                          }}
                          size="sm"
                          variant="destructive-outline"
                        >
                          Dispute scope
                        </Button>
                      </div>
                      {responseOpen ? (
                        <div className="space-y-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`assignment-response-${scope.assignmentId}`}
                          >
                            {response.kind === "clarification"
                              ? "Clarification needed"
                              : "Scope concern"}
                          </label>
                          <Textarea
                            id={`assignment-response-${scope.assignmentId}`}
                            onChange={(event) =>
                              setResponseText(event.target.value)
                            }
                            placeholder="Describe the exact assignment detail that needs review."
                            value={responseText}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              loading={
                                pendingAction ===
                                `${response.kind}:${scope.assignmentId}`
                              }
                              onClick={() => submitResponse(scope)}
                              size="sm"
                            >
                              Send response
                            </Button>
                            <Button
                              onClick={() => {
                                setResponse(null);
                                setResponseText("");
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </FramePanel>
          </Frame>

          <div className="flex flex-col gap-5">
            <Frame>
              <FramePanel className="flex flex-col gap-2 p-4">
                <h2 className="font-semibold text-sm">Builder contact</h2>
                {detail.builderContact ? (
                  <div className="text-sm">
                    <p className="font-medium">
                      {detail.builderContact.displayName}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No builder contact available.
                  </p>
                )}
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel className="flex flex-col gap-2 p-4">
                <h2 className="font-semibold text-sm">Permit documents</h2>
                {detail.permitDocuments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No permit documents shared yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detail.permitDocuments.map(
                      (doc: ContractorPermitDocument) => (
                        <li className="text-sm" key={doc._id}>
                          {doc.fileName}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </FramePanel>
            </Frame>
          </div>
        </div>
        <ContractorCostDocumentSection
          batchId={costBatch}
          buildId={buildId as Id<"activeBuilds">}
          costDocumentId={costDocument}
          draftId={costDocumentDraft}
          onBatchIdChange={(nextBatchId) =>
            navigate({
              params: { buildId },
              replace: Boolean(costBatch) || !nextBatchId,
              search: {
                assignmentId,
                costBatch: nextBatchId,
                costDocument: undefined,
                costDocumentDraft: undefined,
                focus,
              },
              to: "/contractor/builds/$buildId",
            } as never)
          }
          onCostDocumentIdChange={(nextCostDocumentId) =>
            navigate({
              params: { buildId },
              replace: !nextCostDocumentId,
              search: {
                assignmentId,
                costBatch: undefined,
                costDocument: nextCostDocumentId,
                costDocumentDraft: undefined,
                focus,
              },
              to: "/contractor/builds/$buildId",
            } as never)
          }
          organizationId={detail.build.organizationId}
          submilestones={costDocumentSubmilestones}
        />
        <BuildCollaborationSection
          buildId={buildId}
          detailTab={detailTab}
          focus={focus}
          organizationId={participationScope.organizationId}
        />
      </div>
      {startRequest ? (
        <MilestoneStartDialog
          onClose={() => setStartRequest(null)}
          onConfirm={async (input) => {
            if (
              input.action !== "start" ||
              input.actualStartedAt === undefined ||
              !startRequest.scope.submilestoneKey
            ) {
              throw new Error(
                "A valid assigned submilestone start is required.",
              );
            }
            await startAssignedSubmilestone({
              actualStartedAt: input.actualStartedAt,
              buildId: buildId as Id<"activeBuilds">,
              dependencyOverrideReason: input.dependencyOverrideReason,
              idempotencyKey: input.idempotencyKey,
              milestoneKey: input.milestoneKey,
              source: input.source as
                | "guided_field_workflow"
                | "submilestone_detail"
                | "submilestone_ledger",
              submilestoneKey: startRequest.scope.submilestoneKey,
              workosOrganizationId: detail.build.organizationId,
            });
            toast.success("Work start recorded.");
          }}
          request={startRequest.request}
        />
      ) : null}
    </main>
  );
}

function ContractorCostDocumentSection({
  batchId,
  buildId,
  costDocumentId,
  draftId,
  onBatchIdChange,
  onCostDocumentIdChange,
  organizationId,
  submilestones,
}: {
  batchId?: string;
  buildId: Id<"activeBuilds">;
  costDocumentId?: string;
  draftId?: string;
  onBatchIdChange: (batchId?: string) => void;
  onCostDocumentIdChange: (costDocumentId?: string) => void;
  organizationId: string;
  submilestones: Array<{
    id: Id<"buildSubmilestones">;
    label: string;
  }>;
}) {
  if (submilestones.length === 0) {
    return (
      <ContractorCostDocumentRecovery
        buildId={buildId}
        costDocumentId={costDocumentId}
        onCostDocumentIdChange={onCostDocumentIdChange}
        organizationId={organizationId}
      />
    );
  }

  return (
    <section
      aria-labelledby="contractor-cost-documents"
      className="min-w-0 space-y-3"
      data-testid="contractor-cost-documents"
    >
      <div>
        <h2 className="font-semibold text-lg" id="contractor-cost-documents">
          Invoices & receipts
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Capture an Invoice or Receipt only for your assigned Sub-milestones.
        </p>
      </div>
      <CostDocumentBatchWorkspace
        actorCapacity="contractor"
        batchId={batchId}
        buildId={buildId}
        draftId={draftId}
        onBatchIdChange={onBatchIdChange}
        organizationId={organizationId}
        submilestones={submilestones}
      />
      <ContractorSubmittedCostDocumentHistory
        buildId={buildId}
        costDocumentId={costDocumentId}
        onCostDocumentIdChange={onCostDocumentIdChange}
        organizationId={organizationId}
      />
    </section>
  );
}

function ContractorCostDocumentRecovery({
  buildId,
  costDocumentId,
  onCostDocumentIdChange,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  costDocumentId?: string;
  onCostDocumentIdChange: (costDocumentId?: string) => void;
  organizationId: string;
}) {
  return (
    <section
      aria-labelledby="contractor-cost-documents"
      className="min-w-0"
      data-testid="contractor-cost-documents-recovery"
    >
      <Frame>
        <FramePanel className="space-y-2 p-4 sm:p-5">
          <h2 className="font-semibold text-lg" id="contractor-cost-documents">
            Invoices & receipts unavailable
          </h2>
          <p className="text-muted-foreground text-sm">
            New Cost Documents are available only while you have a current
            assigned Sub-milestone. Return to current work to review your active
            scope.
          </p>
          <Button
            className="min-h-11"
            render={<Link to="/contractor/work" />}
            size="sm"
            variant="outline"
          >
            Return to current work
          </Button>
        </FramePanel>
      </Frame>
      <ContractorSubmittedCostDocumentHistory
        buildId={buildId}
        className="mt-3"
        costDocumentId={costDocumentId}
        onCostDocumentIdChange={onCostDocumentIdChange}
        organizationId={organizationId}
      />
    </section>
  );
}

function ContractorSubmittedCostDocumentHistory({
  buildId,
  className,
  costDocumentId,
  onCostDocumentIdChange,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  className?: string;
  costDocumentId?: string;
  onCostDocumentIdChange: (costDocumentId?: string) => void;
  organizationId: string;
}) {
  const submittedCostDocuments = usePaginatedQuery(
    api.cost_documents.listCostDocuments,
    { actorCapacity: "contractor", buildId, organizationId } as never,
    { initialNumItems: 20 },
  );
  const selectedDocument = useQuery(
    api.cost_documents.getCostDocument,
    costDocumentId
      ? ({
          actorCapacity: "contractor",
          buildId,
          costDocumentId,
          organizationId,
        } as never)
      : "skip",
  ) as CostDocumentDetail | null | undefined;
  const ownSubmittedDocuments = submittedCostDocuments.results;
  const submittedDocumentsLoading =
    submittedCostDocuments.status === "LoadingFirstPage";
  const canLoadMoreSubmittedDocuments =
    submittedCostDocuments.status === "CanLoadMore";
  const loadingMoreSubmittedDocuments =
    submittedCostDocuments.status === "LoadingMore";
  const shouldShowEmptyState =
    ownSubmittedDocuments.length === 0 &&
    !canLoadMoreSubmittedDocuments &&
    !loadingMoreSubmittedDocuments;

  return (
    <Frame
      className={className}
      data-testid="contractor-submitted-cost-documents"
    >
      <FramePanel className="space-y-3 p-4 sm:p-5">
        <div>
          <h3 className="font-semibold text-sm">
            Your submitted Cost Documents
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Submitted records remain available after normal assignment
            completion. Access is rechecked for every record and download.
          </p>
        </div>
        {submittedDocumentsLoading ? (
          <p className="text-muted-foreground text-sm">
            Loading your submitted Cost Documents…
          </p>
        ) : shouldShowEmptyState ? (
          <p className="text-muted-foreground text-sm">
            No submitted Cost Documents are available under your current Build
            access.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {ownSubmittedDocuments.map((document) => (
                <Button
                  aria-pressed={document._id === costDocumentId}
                  className="min-h-11 justify-start text-left"
                  key={document._id}
                  onClick={() => onCostDocumentIdChange(String(document._id))}
                  variant={
                    document._id === costDocumentId ? "secondary" : "outline"
                  }
                >
                  <span className="truncate">{document.title}</span>
                </Button>
              ))}
            </div>
            {costDocumentId ? (
              <CostDocumentDetailSheet
                actorCapacity="contractor"
                buildId={buildId}
                document={selectedDocument}
                interactionMode="read-only"
                onClose={() => onCostDocumentIdChange(undefined)}
                organizationId={organizationId}
              />
            ) : null}
            {canLoadMoreSubmittedDocuments || loadingMoreSubmittedDocuments ? (
              <Button
                className="min-h-11 w-full"
                disabled={loadingMoreSubmittedDocuments}
                onClick={() => submittedCostDocuments.loadMore(20)}
                variant="outline"
              >
                {loadingMoreSubmittedDocuments
                  ? "Loading more submitted Cost Documents…"
                  : "Load more submitted Cost Documents"}
              </Button>
            ) : null}
          </>
        )}
      </FramePanel>
    </Frame>
  );
}

function ContractorCollaborationSurface({
  buildId,
  buildName,
  detailTab,
  focus,
  organizationId,
}: {
  buildId: string;
  buildName: string;
  detailTab?: BuildSubmilestoneDetailTab;
  focus?: string;
  organizationId: string;
}) {
  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Active build
          </p>
          <h1 className="mt-1 font-semibold text-2xl">{buildName}</h1>
        </header>
        <BuildCollaborationSection
          buildId={buildId}
          detailTab={detailTab}
          focus={focus}
          organizationId={organizationId}
        />
      </div>
    </main>
  );
}

function BuildCollaborationSection({
  buildId,
  detailTab,
  focus,
  organizationId,
}: {
  buildId: string;
  detailTab?: BuildSubmilestoneDetailTab;
  focus?: string;
  organizationId: string;
}) {
  return (
    <section aria-labelledby="contractor-build-collaboration">
      <h2
        className="mb-3 font-semibold text-lg"
        id="contractor-build-collaboration"
      >
        Build collaboration
      </h2>
      <BuildCollaborationWorkspace
        buildId={buildId}
        detailTab={detailTab}
        focusedReference={focus}
        organizationId={organizationId}
        viewerCapacity="contractor"
      />
    </section>
  );
}
