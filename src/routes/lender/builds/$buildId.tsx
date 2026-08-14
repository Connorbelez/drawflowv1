import { createFileRoute } from "@tanstack/react-router";
import { Building2, MapPin, ShieldCheck } from "lucide-react";

import { LenderShell } from "#/components/lender-shell.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardContent, CardHeader } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";

export const Route = createFileRoute("/lender/builds/$buildId")({
  component: LenderBuildDetail,
  staticData: {
    breadcrumb: {
      label: "Build detail",
    },
  },
});

// TODO(lender-portal): replace this local view model with the canonical,
// permission-shaped lender Build projection. Do not infer Build facts from
// Back Office or Builder views before that contract is implemented.
const LENDER_BUILD_DETAIL_PLACEHOLDER = {
  location: "Location will appear here.",
  milestoneSummary: "Milestone records are not connected yet.",
  reviewSummary: "No lender review records are connected yet.",
  status: "Data connection pending",
  title: "Build overview",
} as const;

function LenderBuildDetail() {
  const { buildId } = Route.useParams();

  return (
    <LenderShell activeNavigation="Active Builds" pageTitle="Build detail">
      <main className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                Lender Build Detail
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="font-semibold text-2xl">
                  {LENDER_BUILD_DETAIL_PLACEHOLDER.title}
                </h1>
                <Badge variant="outline">
                  {LENDER_BUILD_DETAIL_PLACEHOLDER.status}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                Build reference: <span className="font-mono">{buildId}</span>
              </p>
            </div>
          </header>

          <Frame>
            <FramePanel className="flex gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div>
                <p className="font-medium text-sm">Read-only lender view</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  This production route is ready for the lender Build
                  projection. It does not expose or infer data from other
                  workspaces.
                </p>
              </div>
            </FramePanel>
          </Frame>

          <section
            aria-label="Build overview"
            className="grid gap-4 lg:grid-cols-3"
          >
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center gap-2 font-medium text-sm">
                <Building2
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Build overview
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="text-muted-foreground">
                    {LENDER_BUILD_DETAIL_PLACEHOLDER.location}
                  </span>
                </div>
                <Separator />
                <p className="text-muted-foreground text-sm">
                  The lender-specific Build summary will be available after the
                  canonical projection is connected.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="font-medium text-sm">
                Current review state
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {LENDER_BUILD_DETAIL_PLACEHOLDER.reviewSummary}
              </CardContent>
            </Card>
          </section>

          <section aria-label="Milestone records">
            <Card>
              <CardHeader className="font-medium text-sm">
                Milestone records
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {LENDER_BUILD_DETAIL_PLACEHOLDER.milestoneSummary}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </LenderShell>
  );
}
