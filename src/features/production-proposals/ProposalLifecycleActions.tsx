import { useMutation } from "convex/react";
import { ArrowRight, Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  type ClosingConfirmationInput,
  ProposalActivationDialog,
  ProposalClosingDialog,
} from "#/features/production-proposals/ProposalLifecycleDialogs.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ProposalLifecycleActionCapabilities {
  canActivateClosedProposal: boolean;
  canRecordClosing: boolean;
}

export function ProposalLifecycleActions({
  capabilities,
  embedded = false,
  onActivated,
  proposal,
  testId = "proposal-lifecycle-actions",
  workosOrganizationId,
}: {
  capabilities: ProposalLifecycleActionCapabilities;
  embedded?: boolean;
  onActivated: (buildId: string) => Promise<void> | void;
  proposal: {
    _id: string;
    buildName: string;
    interestAnnualBps?: number;
    principalCents?: number;
  };
  testId?: string;
  workosOrganizationId: string;
}) {
  const recordClosing = useMutation(
    api.production_proposals.recordProposalClosing
  );
  const activateClosedProposal = useMutation(
    api.production_proposals.activateClosedProposal
  );
  const [dialog, setDialog] = useState<"activation" | "closing" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (
    !(capabilities.canRecordClosing || capabilities.canActivateClosedProposal)
  ) {
    return null;
  }

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The lifecycle action failed.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const handleClosing = async (input: ClosingConfirmationInput) => {
    await run(async () => {
      await recordClosing({
        buildStartDate: input.buildStartDate,
        ianaTimezone: input.ianaTimezone,
        loanFacility: {
          interestAnnualBps: input.interestAnnualBps,
          principalCents: input.principalCents,
        },
        proposalId: proposal._id as Id<"buildProposals">,
        reason: input.reason,
        workosOrganizationId,
      });
      setDialog(null);
      toast.success("Closing recorded. Build activation remains separate.");
    });
  };

  const handleActivation = async (reason: string) => {
    await run(async () => {
      const result = await activateClosedProposal({
        proposalId: proposal._id as Id<"buildProposals">,
        reason,
        workosOrganizationId,
      });
      setDialog(null);
      toast.success("Build activated.");
      await onActivated(String(result.buildId));
    });
  };

  const actions = (
    <LifecycleActionPanel
      capabilities={capabilities}
      onOpen={(nextDialog) => {
        setError(undefined);
        setDialog(nextDialog);
      }}
      testId={testId}
    />
  );

  return (
    <>
      {embedded ? (
        actions
      ) : (
        <Frame>
          <FramePanel className="p-5">{actions}</FramePanel>
        </Frame>
      )}
      <ProposalClosingDialog
        error={dialog === "closing" ? error : undefined}
        onConfirm={handleClosing}
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialog(null);
          }
        }}
        open={dialog === "closing"}
        pending={pending}
        proposal={{
          buildName: proposal.buildName,
          interestAnnualBps: proposal.interestAnnualBps,
          principalCents: proposal.principalCents,
        }}
      />
      <ProposalActivationDialog
        buildName={proposal.buildName}
        error={dialog === "activation" ? error : undefined}
        onConfirm={handleActivation}
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialog(null);
          }
        }}
        open={dialog === "activation"}
        pending={pending}
      />
    </>
  );
}

function LifecycleActionPanel({
  capabilities,
  onOpen,
  testId,
}: {
  capabilities: ProposalLifecycleActionCapabilities;
  onOpen: (dialog: "activation" | "closing") => void;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={testId}
    >
      <div className="flex min-w-0 gap-3">
        <Landmark
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div>
          <h2 className="font-medium text-sm">Closing and activation</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {capabilities.canRecordClosing
              ? "All approval prerequisites are complete. Record the offline closing before activating the Build."
              : "The closing is recorded. Activation creates the live Build workspace."}
          </p>
        </div>
      </div>
      {capabilities.canRecordClosing ? (
        <Button className="shrink-0" onClick={() => onOpen("closing")}>
          Record closing <ArrowRight aria-hidden />
        </Button>
      ) : null}
      {capabilities.canActivateClosedProposal ? (
        <Button className="shrink-0" onClick={() => onOpen("activation")}>
          Activate Build <ArrowRight aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
