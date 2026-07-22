import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/contractor/builds/$buildId")({
  staticData: {
    breadcrumb: { label: "Build", to: "/contractor/builds" },
  },
  validateSearch: (search: Record<string, unknown>) => ({
    assignmentId:
      typeof search.assignmentId === "string" ? search.assignmentId : undefined,
  }),
  component: ContractorBuildDetail,
});

type ResponseKind = "clarification" | "dispute";
type ContractorScope = {
  acknowledgement: { state: string } | null;
  assignmentId: Id<"milestoneContractorAssignments">;
  milestoneKey: string;
  milestoneName: string;
  role: string;
  status: string;
  submilestoneKey: string | null;
};

type ContractorPermitDocument = {
  _id: string;
  fileName: string;
};

/**
 * Active build detail (PRD §8.5). Scope-limited; raw ratings and financing
 * never reach the contractor (backend-enforced redaction).
 */
export function ContractorBuildDetail() {
  const { buildId } = Route.useParams();
  const { assignmentId } = Route.useSearch();
  const detail = useQuery(api.contractorWorkspace.getContractorBuildDetail, {
    buildId: buildId as Id<"activeBuilds">,
  });
  const acknowledge = useMutation(
    api.contractorEvidence.acknowledgeContractorAssignment
  );
  const requestClarification = useMutation(
    api.contractorEvidence.requestContractorScopeClarification
  );
  const disputeScope = useMutation(
    api.contractorEvidence.flagContractorScopeMismatch
  );
  const [response, setResponse] = useState<{
    assignmentId: string;
    kind: ResponseKind;
  } | null>(null);
  const [responseText, setResponseText] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <p className="text-muted-foreground text-sm">Loading build…</p>
      </main>
    );
  }

  if (!detail.build) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/30 p-4 sm:p-6">
        <Frame className="w-full max-w-lg">
          <FramePanel className="space-y-4 p-5">
            <div>
              <p className="font-semibold">Assignment unavailable</p>
              <p className="mt-1 text-muted-foreground text-sm">
                {detail.availability.message}
              </p>
            </div>
            <p className="font-mono text-muted-foreground text-xs">
              Support reference: {detail.availability.reference}
            </p>
            <Button render={<Link to="/contractor/work" />} variant="outline">
              Return to current work
            </Button>
          </FramePanel>
        </Frame>
      </main>
    );
  }

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
        "We could not acknowledge this assignment. Retry or contact the Builder."
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
        "Describe the clarification or scope concern before sending."
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
          : "Scope concern sent."
      );
      setResponse(null);
      setResponseText("");
    } catch {
      setErrorMessage(
        "We could not send this response. Retry or contact the Builder."
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
                        selected && "bg-accent/40 ring-2 ring-ring ring-inset"
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
                      )
                    )}
                  </ul>
                )}
              </FramePanel>
            </Frame>
          </div>
        </div>
      </div>
    </main>
  );
}
