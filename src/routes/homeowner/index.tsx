import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/homeowner/")({
  component: HomeownerBuilds,
});

function HomeownerBuilds() {
  const { organizationId } = Route.useRouteContext();
  const participations = useQuery(
    api.build_participants.listMyActiveBuildParticipations,
    organizationId ? { organizationId } : "skip"
  );

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Homeowner workspace
          </p>
          <h1 className="mt-1 font-semibold text-2xl">My builds</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Follow updates, answer questions, and manage Action Items shared
            with you.
          </p>
        </header>
        {participations === undefined ? (
          <Frame>
            <FramePanel className="animate-pulse text-muted-foreground text-sm">
              Loading builds…
            </FramePanel>
          </Frame>
        ) : null}
        {participations?.length === 0 ? (
          <Frame>
            <FramePanel className="text-muted-foreground text-sm">
              No active Build invitations are available in this organization.
            </FramePanel>
          </Frame>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {participations?.map((participation) => (
            <Card
              key={participation.participantId}
              render={
                <Link
                  params={{ buildId: participation.buildId }}
                  to="/homeowner/builds/$buildId"
                />
              }
            >
              <CardHeader className="font-semibold">
                {participation.buildName}
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {participation.location ?? "Location not provided"}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
