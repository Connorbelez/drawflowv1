import { createFileRoute } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderDashboardVariantD } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";

export const Route = createFileRoute("/lender/")({
  component: LenderDashboard,
});

function LenderDashboard() {
  return (
    <LenderShell>
      <main className="flex-1 p-4 sm:p-6">
        <LenderDashboardVariantD />
      </main>
    </LenderShell>
  );
}
