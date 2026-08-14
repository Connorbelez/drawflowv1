import { createFileRoute } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderMilestoneQueueVariantC } from "../lender.milestones-prototype.tsx";

export const Route = createFileRoute("/lender/milestones")({
  component: LenderMilestoneQueue,
});
function LenderMilestoneQueue() {
  return (
    <LenderShell activeNavigation="Milestones" pageTitle="Milestone queue">
      <main className="flex-1 p-4 sm:p-6">
        <LenderMilestoneQueueVariantC />
      </main>
    </LenderShell>
  );
}
