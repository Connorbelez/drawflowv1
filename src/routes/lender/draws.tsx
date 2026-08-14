import { createFileRoute } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderDrawQueueVariantD } from "../lender.draws-prototype.tsx";

export const Route = createFileRoute("/lender/draws")({
  component: LenderDrawQueue,
});
function LenderDrawQueue() {
  return (
    <LenderShell activeNavigation="Draws" pageTitle="Draw queue">
      <main className="flex-1 p-4 sm:p-6">
        <LenderDrawQueueVariantD />
      </main>
    </LenderShell>
  );
}
