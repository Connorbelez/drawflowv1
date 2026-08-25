import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type {
  ComponentProps,
  Dispatch,
  SetStateAction,
} from "react";

import { ProposalLenderAssignmentSection } from "#/features/production-proposals/ProposalLenderAssignmentSection.tsx";
import {
  ProposalRemediationControl,
  type PublishRemediatedProposalCommand,
} from "#/features/production-proposals/ProposalRemediationControl.tsx";
import type { Id } from "../../../convex/_generated/dataModel";

type LenderAssignmentProps = ComponentProps<
  typeof ProposalLenderAssignmentSection
>;
type RemediationProps = ComponentProps<typeof ProposalRemediationControl>;

export interface ProposalApprovalDetail {
  lenderApproval: LenderAssignmentProps["approval"];
  lenderAssignment: LenderAssignmentProps["assignment"];
  lenderAssignmentHistory: LenderAssignmentProps["assignmentHistory"];
  proposal: LenderAssignmentProps["proposal"] & {
    currentProposalRevisionId?: string | null;
    currentProposalRevisionNumber?: number | null;
  };
}

interface AssignExternalLenderCommand {
  lenderOrganizationId: Id<"lenderOrganizations">;
  proposalId: Id<"buildProposals">;
  reason: string;
  workosOrganizationId: string;
}

interface RepairLenderConfirmationCommand {
  expectedAssignmentId: Id<"proposalLenderAssignments">;
  expectedProposalRevisionNumber: number | null;
  idempotencyKey: string;
  proposalId: Id<"buildProposals">;
  reason: string;
  workosOrganizationId: string;
}

interface WithdrawExternalLenderCommand {
  assignmentId: Id<"proposalLenderAssignments">;
  proposalId: Id<"buildProposals">;
  reason: string;
  workosOrganizationId: string;
}

interface PublishProposalRevisionCommand extends PublishRemediatedProposalCommand {
  proposalId: Id<"buildProposals">;
  workosOrganizationId: string;
}

interface ProposalApprovalStatusSurfaceProps {
  assignExternalLender: (
    command: AssignExternalLenderCommand
  ) => Promise<unknown>;
  canManageBrokerAssignment: boolean;
  lenderOrganizationsQuery?: {
    organizations?: LenderAssignmentProps["lenderOrganizations"];
  };
  navigate: ReturnType<typeof useNavigate>;
  planId: string;
  productionDetail: ProposalApprovalDetail;
  proposalId: Id<"buildProposals">;
  proposalRemediationQuery?: RemediationProps["control"];
  publishProposalRevision: (
    command: PublishProposalRevisionCommand
  ) => Promise<unknown>;
  repairMissingLenderConfirmation: (
    command: RepairLenderConfirmationCommand
  ) => Promise<unknown>;
  search: Record<string, unknown>;
  setLenderAssignmentDialogOpen: (open: boolean) => void;
  setProposalConfirmationHistoryLimit: Dispatch<SetStateAction<number>>;
  visualFixtureEnabled: boolean;
  withdrawExternalLender: (
    command: WithdrawExternalLenderCommand
  ) => Promise<unknown>;
  workosOrganizationId: string;
}

export function ProposalApprovalStatusSurface({
  assignExternalLender,
  canManageBrokerAssignment,
  lenderOrganizationsQuery,
  navigate,
  planId,
  productionDetail,
  proposalId,
  proposalRemediationQuery,
  publishProposalRevision,
  repairMissingLenderConfirmation,
  search,
  setLenderAssignmentDialogOpen,
  setProposalConfirmationHistoryLimit,
  visualFixtureEnabled,
  withdrawExternalLender,
  workosOrganizationId,
}: ProposalApprovalStatusSurfaceProps) {
  return !visualFixtureEnabled && canManageBrokerAssignment ? (
    <div className="grid gap-4">
      <ProposalLenderAssignmentSection
        approval={productionDetail.lenderApproval}
        assignment={productionDetail.lenderAssignment}
        assignmentHistory={productionDetail.lenderAssignmentHistory}
        lenderOrganizations={lenderOrganizationsQuery?.organizations ?? []}
        lenderOrganizationsPending={lenderOrganizationsQuery === undefined}
        needsConfirmationRepair={Boolean(
          productionDetail.proposal.status === "approved" &&
            productionDetail.lenderAssignment?.status === "current" &&
            !productionDetail.proposal.currentProposalRevisionId
        )}
        onAssign={(lenderOrganizationId, reason) =>
          assignExternalLender({
            lenderOrganizationId: lenderOrganizationId as Id<
              "lenderOrganizations"
            >,
            proposalId,
            reason,
            workosOrganizationId,
          })
        }
        onDialogOpenChange={setLenderAssignmentDialogOpen}
        onEditReviewPolicy={() => {
          void navigate({
            params: { planId },
            replace: true,
            search: { ...search, tab: "closing" },
            to: "/backoffice/proposals/$planId",
          }).then(() => {
            requestAnimationFrame(() => {
              const policyControl = document.getElementById(
                "proposal-review-policy-control"
              );
              policyControl?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
                block: "start",
              });
              policyControl?.focus({ preventScroll: true });
            });
          });
        }}
        onRepairLenderConfirmation={async (reason) => {
          const assignment = productionDetail.lenderAssignment;
          if (!assignment || assignment.status !== "current") {
            throw new Error("A current lender assignment is required.");
          }
          return await repairMissingLenderConfirmation({
            expectedAssignmentId:
              assignment.assignmentId as Id<"proposalLenderAssignments">,
            expectedProposalRevisionNumber:
              productionDetail.proposal.currentProposalRevisionNumber ?? null,
            idempotencyKey: `backoffice:lender-confirmation-repair:${proposalId}:${assignment.assignmentId}`,
            proposalId,
            reason,
            workosOrganizationId,
          });
        }}
        onWithdraw={(assignmentId, reason) =>
          withdrawExternalLender({
            assignmentId: assignmentId as Id<"proposalLenderAssignments">,
            proposalId,
            reason,
            workosOrganizationId,
          })
        }
        proposal={{
          buildName: productionDetail.proposal.buildName,
          location: productionDetail.proposal.location,
          status: productionDetail.proposal.status,
        }}
      />
      {proposalRemediationQuery ? (
        <ProposalRemediationControl
          control={proposalRemediationQuery}
          onLoadMoreHistory={() =>
            setProposalConfirmationHistoryLimit((current) => current + 20)
          }
          onNavigateToCheckpoint={(checkpoint) => {
            const tab =
              checkpoint === "budget"
                ? "materials"
                : checkpoint === "accessReviewPolicy"
                  ? "closing"
                  : checkpoint === "milestoneCount" ||
                      checkpoint === "scheduleTimeline"
                    ? "milestones"
                    : "review";
            void navigate({
              params: { planId },
              replace: true,
              search: { ...search, tab },
              to: "/backoffice/proposals/$planId",
            });
          }}
          onPublish={(command) =>
            publishProposalRevision({
              ...command,
              proposalId,
              workosOrganizationId,
            })
          }
        />
      ) : productionDetail.proposal.status === "approved" ? (
        <div
          className="flex items-center gap-2 border-t pt-4 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Loading lender confirmation cycle…
        </div>
      ) : null}
    </div>
  ) : undefined;
}
