"use client";

import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import {
  useConvexConnectionState,
  useQuery,
} from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationMutationGate,
} from "./BuildCollaborationMutationGate.tsx";
import "./build-collaboration.css";
import {
  buildCollaborationScopeArgs,
  type BuildCollaborationFeedProps,
} from "./build-collaboration-feed-contracts.ts";
import { BuildCollaborationFeedContent } from "./build-collaboration-feed-content.tsx";

export {
  buildActionItemQueueHref,
  buildActionItemSheetHref,
  buildDetailTargetQueueHref,
  buildDetailTargetSheetHref,
  minimumScheduledPublicationTimestamp,
} from "./build-collaboration-feed-contracts.ts";
export type { BuildCollaborationFeedProps } from "./build-collaboration-feed-contracts.ts";

export function BuildCollaborationFeed(props: BuildCollaborationFeedProps) {
  const { user } = useAuth();
  const connectionState = useConvexConnectionState();
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  useEffect(() => {
    const markOnline = () => setBrowserOnline(true);
    const markOffline = () => setBrowserOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  // Convex queues writes while disconnected, even when browser networking is
  // reachable. Every shared effect therefore requires a live WebSocket,
  // including the first connection attempt; cold/captive sessions stay private.
  const isOnline = browserOnline && connectionState.isWebSocketConnected;
  const lifecycleState = useQuery(
    api.build_collaboration_lifecycle.getBuildCollaborationLifecycleState,
    buildCollaborationScopeArgs(
      props.buildId as Id<"activeBuilds">,
      props.organizationId
    )
  );
  const collaborationWritable = lifecycleState?.state === "open";
  const sharedMutationsAllowed = isOnline && collaborationWritable;
  const sharedBlockedMessage = isOnline
    ? lifecycleState === undefined
      ? "Collaboration access is still loading. Try again in a moment."
      : "This Build collaboration archive is read-only."
    : "Reconnect before changing shared Build collaboration state. Offline work stays private.";
  return (
    <BuildCollaborationMutationGate
      personalMutationsAllowed={isOnline}
      sharedBlockedMessage={sharedBlockedMessage}
      sharedMutationsAllowed={sharedMutationsAllowed}
    >
      <BuildCollaborationFeedContent
        {...props}
        collaborationState={lifecycleState?.state}
        connectionOnline={isOnline}
        isOnline={sharedMutationsAllowed}
        sessionWorkosUserId={user?.id}
      />
    </BuildCollaborationMutationGate>
  );
}
