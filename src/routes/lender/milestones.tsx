import { createFileRoute } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderMilestoneQueueVariantC } from "../lender.milestones-prototype.tsx";

export const Route = createFileRoute("/lender/milestones")({
  component: LenderMilestoneQueue,
  staticData: {
    breadcrumb: {
      label: "Milestones",
      to: "/lender/milestones",
    },
  },
});
function LenderMilestoneQueue() {
  return (
    <LenderShell activeNavigation="Milestones" pageTitle="Milestone queue">
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
        <main className="mx-auto min-w-0 max-w-[1440px] p-4">
          <LenderMilestoneQueueVariantC />
        </main>
      </div>
    </LenderShell>
  );
}
