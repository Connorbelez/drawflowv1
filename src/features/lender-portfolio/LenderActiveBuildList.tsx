import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

type BuildRows = FunctionReturnType<
  typeof api.lender_portal.listLenderActiveBuilds
>;
export type LenderActiveBuildRow = BuildRows[number];
export type LenderBuildListLink =
  | "/lender/builds/$buildId"
  | "/backoffice/builds/$buildId";

const FIRST_CHARACTER_PATTERN = /^./;

export function LenderActiveBuildList({
  builds,
  linkTo,
}: {
  builds: BuildRows | undefined;
  linkTo: LenderBuildListLink;
}) {
  return (
    <Frame>
      <FramePanel className="p-0">
        {builds === undefined ? (
          <p aria-live="polite" className="p-5 text-muted-foreground text-sm">
            Loading active Builds…
          </p>
        ) : builds.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>No active Builds</EmptyTitle>
              <EmptyDescription>
                No active Builds are assigned to this lender organization.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {builds.map((build) => (
              <li key={build.buildId}>
                <Link
                  aria-label={`Open Build ${build.buildName}`}
                  className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  params={{ buildId: build.buildId }}
                  preload="intent"
                  to={linkTo}
                  viewTransition
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {build.buildName}
                      </span>
                      <Badge variant="outline">
                        {formatStatus(build.status)}
                      </Badge>
                    </span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                      {build.location} · Updated {formatDate(build.updatedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    Open Build
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(FIRST_CHARACTER_PATTERN, (character) => character.toUpperCase());
}
