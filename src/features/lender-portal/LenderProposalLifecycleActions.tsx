import {
  type ProposalLifecycleActionCapabilities,
  ProposalLifecycleActions,
} from "#/features/production-proposals/ProposalLifecycleActions.tsx";

export type LenderProposalLifecycleCapabilities =
  ProposalLifecycleActionCapabilities;

export function LenderProposalLifecycleActions({
  capabilities,
  onActivated,
  proposal,
  workosOrganizationId,
}: {
  capabilities: LenderProposalLifecycleCapabilities;
  onActivated: (buildId: string) => Promise<void> | void;
  proposal: {
    _id: string;
    buildName: string;
    interestAnnualBps?: number;
    principalCents?: number;
  };
  workosOrganizationId: string;
}) {
  return (
    <ProposalLifecycleActions
      capabilities={capabilities}
      onActivated={onActivated}
      proposal={{
        _id: proposal._id,
        buildName: proposal.buildName,
        interestAnnualBps: proposal.interestAnnualBps,
        principalCents: proposal.principalCents,
      }}
      testId="lender-proposal-lifecycle-actions"
      workosOrganizationId={workosOrganizationId}
    />
  );
}
