import { useQuery } from "convex/react";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildDetailIntegritySheet,
  BuildDetailSheetHost,
} from "../build-detail-targets/BuildDetailSheetHost.tsx";
import {
  type BuildDetailTarget,
  parseBuildDetailFocus,
} from "../build-detail-targets/buildDetailTarget.ts";
import { BuildCollaborationFeed } from "./BuildCollaborationFeed.tsx";

export function BuildCollaborationWorkspace({
  buildId,
  focusedReference,
  organizationId,
  onOpenReference,
  onResolvedDetailTarget,
  viewerCapacity,
}: {
  buildId: string;
  focusedReference?: string;
  organizationId?: string;
  onOpenReference?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  onResolvedDetailTarget?: (target: BuildDetailTarget | undefined) => void;
  viewerCapacity?:
    | "admin"
    | "broker"
    | "broker-staff"
    | "builder"
    | "builder-staff"
    | "contractor"
    | "homeowner"
    | "principle-broker";
}) {
  const [localFocusedReference, setLocalFocusedReference] =
    useState(focusedReference);
  useEffect(() => {
    setLocalFocusedReference(focusedReference);
  }, [focusedReference]);
  const rollout = useQuery(
    api.build_collaboration_rollout.getBuildCollaborationRolloutState,
    organizationId
      ? {
          buildId: buildId as Id<"activeBuilds">,
          organizationId,
        }
      : "skip",
  );

  if (!organizationId) {
    return (
      <CollaborationUnavailableState description="Organization context is required before this Build’s collaboration workspace can load." />
    );
  }

  if (rollout === undefined) {
    return (
      <Frame data-testid="build-collaboration-rollout-loading">
        <FramePanel
          aria-live="polite"
          className="animate-pulse text-muted-foreground text-sm"
          role="status"
        >
          Checking collaboration availability…
        </FramePanel>
      </Frame>
    );
  }

  if (!rollout.available) {
    return (
      <CollaborationUnavailableState description="Collaboration has not been activated for this lender organization. Contact an organization admin to activate it." />
    );
  }

  return (
    <BuildDetailSheetHost
      buildId={buildId as Id<"activeBuilds">}
      focus={localFocusedReference}
      onTargetResolved={onResolvedDetailTarget}
      organizationId={organizationId}
      viewerCapacity={viewerCapacity}
    >
      {(host) => {
        const openReference = (reference: {
          entityId: string;
          entityKind: string;
          href: string;
        }) => {
          const focus = `${reference.entityKind}:${reference.entityId}`;
          setLocalFocusedReference(focus);
          if (parseBuildDetailFocus(focus)) {
            host.controller.openFocus(focus, {
              context: {
                focusSelector:
                  document.activeElement instanceof HTMLElement &&
                  document.activeElement.id
                    ? `#${document.activeElement.id}`
                    : undefined,
                scrollY: window.scrollY,
                selectedTab:
                  new URL(window.location.href).searchParams.get("tab") ??
                  undefined,
              },
              navigate: !onOpenReference,
            });
          }
          onOpenReference?.(reference);
        };
        const closeDetailTarget = () => {
          setLocalFocusedReference(undefined);
          host.controller.close();
        };
        return (
          <>
            <BuildCollaborationFeed
              buildId={buildId}
              detailCanGoBack={host.controller.canGoBack}
              detailCanGoForward={host.controller.canGoForward}
              detailResolutionState={host.resolutionState}
              focusedReference={localFocusedReference}
              onCloseDetailTarget={closeDetailTarget}
              onDetailGoBack={host.controller.back}
              onDetailGoForward={host.controller.forward}
              onOpenReference={openReference}
              organizationId={organizationId}
              resolvedDetailTarget={host.target}
            />
            {host.integrityError ? (
              <BuildDetailIntegritySheet
                error={host.integrityError}
                onClose={closeDetailTarget}
              />
            ) : null}
          </>
        );
      }}
    </BuildDetailSheetHost>
  );
}

function CollaborationUnavailableState({
  description,
}: {
  description: string;
}) {
  return (
    <Frame data-testid="build-collaboration-unavailable">
      <FramePanel className="flex min-h-28 items-center gap-3 p-4 text-sm">
        <LockKeyhole
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <div>
          <p className="font-medium">Collaboration is unavailable</p>
          <p className="mt-1 text-muted-foreground">{description}</p>
        </div>
      </FramePanel>
    </Frame>
  );
}
