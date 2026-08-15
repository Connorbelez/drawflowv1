import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderActiveBuildList } from "#/features/lender-portfolio/LenderActiveBuildList.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/lender/builds/")({
  component: LenderBuilds,
  staticData: {
    breadcrumb: {
      label: "Active Builds",
      to: "/lender/builds",
    },
  },
});

function LenderBuilds() {
  const builds = useQuery(api.lender_portal.listLenderActiveBuilds, {});

  return (
    <LenderShell activeNavigation="Active Builds" pageTitle="Active build list">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-20">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 md:p-6">
          <header>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Assigned portfolio
            </p>
            <h1 className="mt-2 font-heading font-semibold text-2xl">
              Active Builds
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              Review live Builds created from proposals assigned to this lender
              organization.
            </p>
          </header>

          <LenderActiveBuildList
            builds={builds}
            linkTo="/lender/builds/$buildId"
          />
        </div>
      </main>
    </LenderShell>
  );
}
