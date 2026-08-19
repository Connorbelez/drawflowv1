import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { LenderShell } from "#/components/lender-shell.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { LenderBuildDetailOverview } from "#/features/lender-portal/LenderBuildDetailOverview.tsx";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/lender/builds/$buildId")({
  component: LenderBuildDetail,
  staticData: {
    breadcrumb: {
      label: "Build detail",
      params: (match) => ({ buildId: match.params.buildId }),
      to: "/lender/builds/$buildId",
    },
  },
});

function LenderBuildDetail() {
  const { buildId } = Route.useParams();
  const detail = useQuery(api.lender_portal.getLenderBuildDetail, {
    buildId: buildId as Id<"activeBuilds">,
  });

  return (
    <LenderShell
      activeNavigation="Active Builds"
      pageTitle={detail?.build.buildName ?? "Build detail"}
    >
      {detail ? (
        <LenderBuildDetailOverview detail={detail} />
      ) : (
        <Frame className="mx-auto mt-6 max-w-6xl">
          <FramePanel
            aria-live="polite"
            className="flex items-center gap-3 p-5"
            role="status"
          >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            Loading the lender Build projection…
          </FramePanel>
        </Frame>
      )}
    </LenderShell>
  );
}
