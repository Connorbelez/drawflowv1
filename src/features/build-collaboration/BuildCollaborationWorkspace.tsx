import { useQuery } from "convex/react";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BuildCollaborationFeed } from "./BuildCollaborationFeed.tsx";

export function BuildCollaborationWorkspace({
  buildId,
  focusedReference,
  organizationId,
  onOpenReference,
}: {
  buildId: string;
  focusedReference?: string;
  organizationId?: string;
  onOpenReference?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
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
      : "skip"
  );

  if (!organizationId) {
    return (
      <CollaborationUnavailableState description="Organization context is required before this Build’s collaboration workspace can load." />
    );
  }

  if (rollout === undefined) {
    return (
      <Frame data-testid="build-collaboration-rollout-loading">
        <FramePanel className="animate-pulse text-muted-foreground text-sm">
          Checking collaboration availability…
        </FramePanel>
      </Frame>
    );
  }

  if (!rollout.available) {
    return (
      <CollaborationUnavailableState description="Collaboration has not been activated for this lender organization. Build Overview remains available." />
    );
  }

  const openReference =
    onOpenReference ??
    ((reference: { entityId: string; entityKind: string; href: string }) => {
      setLocalFocusedReference(`${reference.entityKind}:${reference.entityId}`);
      window.history.replaceState(window.history.state, "", reference.href);
    });

  return (
    <BuildCollaborationFeed
      buildId={buildId}
      focusedReference={localFocusedReference}
      onOpenReference={openReference}
      organizationId={organizationId}
    />
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
