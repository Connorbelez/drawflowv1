import { useQuery } from "convex/react";
import { LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SubmilestoneDetailSheet } from "../build-submilestone-detail/SubmilestoneDetailSheet.tsx";
import {
  BuildDetailIntegritySheet,
  BuildDetailSheetHost,
} from "../build-detail-targets/BuildDetailSheetHost.tsx";
import {
  type BuildDetailTarget,
  parseBuildDetailFocus,
} from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import { BuildCollaborationFeed } from "./BuildCollaborationFeed.tsx";

export function BuildCollaborationWorkspace({
  buildId,
  detailTab,
  focusedReference,
  organizationId,
  onOpenReference,
  onResolvedDetailTarget,
  viewerCapacity,
}: {
  buildId: string;
  detailTab?: BuildSubmilestoneDetailTab;
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
  const launchElementRef = useRef<HTMLElement | null>(null);
  const [localFocusedReference, setLocalFocusedReference] =
    useState(focusedReference);
  const [detailRetryVersion, setDetailRetryVersion] = useState(0);
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
          className="animate-pulse text-muted-foreground text-sm motion-reduce:animate-none"
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
      detailTab={detailTab}
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
          launchElementRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
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
                  new URL(window.location.href).searchParams.get(
                    "detailTab",
                  ) ?? undefined,
              },
              navigate: !onOpenReference,
            });
          }
          onOpenReference?.(reference);
        };
        const closeDetailTarget = () => {
          const launchElement = launchElementRef.current;
          launchElementRef.current = null;
          setLocalFocusedReference(undefined);
          host.controller.close();
          if (launchElement?.isConnected) {
            requestAnimationFrame(() => launchElement.focus({ preventScroll: true }));
          }
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
            {host.target?.kind === "submilestone" ? (
              <SubmilestoneDetailSheet
                buildId={buildId as Id<"activeBuilds">}
                buildSubmilestoneId={host.target.submilestoneId}
                canGoBack={host.controller.canGoBack}
                canGoForward={host.controller.canGoForward}
                companionActionItemId={host.target.companionId}
                key={`${host.target.submilestoneId}:${detailRetryVersion}`}
                onGoBack={host.controller.back}
                onGoForward={host.controller.forward}
                onOpenChange={(open) => {
                  if (!open) {
                    closeDetailTarget();
                  }
                }}
                onRetry={() => setDetailRetryVersion((version) => version + 1)}
                onSelectedTabChange={host.controller.selectTab}
                open
                organizationId={organizationId}
                readOnly={host.readOnly}
                selectedTab={detailTab}
                viewerCapacity={viewerCapacity}
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
