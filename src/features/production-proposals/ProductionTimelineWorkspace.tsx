import { useMutation, useQuery } from "convex/react";
import throttle from "lodash.throttle";
import {
  Copy,
  LinkIcon,
  Redo2,
  Radio,
  RadioTower,
  Undo2,
  UserPlus,
  Users,
  WifiOff,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  convexWorkspaceToTimelineState,
  type ConvexTimelineWorkspace,
} from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import {
  TimelineWorkspace,
  type TimelineModificationRequestView,
  type TimelineWorkspacePersistence,
} from "#/features/timeline-workspace/index.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ProductionTimelineWorkspaceProps {
  backofficeHref: string;
  /** Use inside tabbed proposal surfaces so layout width stays with the shell. */
  embedded?: boolean;
  headerActions?: ReactNode;
  initialRole?: "builder" | "lender";
  persistenceMode?: "convex" | "noop";
  prejoinedCollabToken?: string | null;
  proposalHref: string;
  proposalId: Id<"buildProposals">;
  workspace: ConvexTimelineWorkspace & {
    contractorPlanning?: any;
    modificationRequests?: TimelineModificationRequestView[];
    proposal: {
      buildName: string;
      location: string;
      lenderDrawPolicyLimitCents?: number;
      reviewOutcome?: string;
      status: string;
      totalBudgetCents: number;
    };
  };
  workosOrganizationId: string;
}

export function ProductionTimelineWorkspace({
  backofficeHref,
  embedded = false,
  headerActions,
  initialRole = "builder",
  persistenceMode = "convex",
  prejoinedCollabToken = null,
  proposalHref,
  proposalId,
  workspace,
  workosOrganizationId,
}: ProductionTimelineWorkspaceProps) {
  const submitProposal = useMutation(api.production_proposals.submitProposal);
  const updatePlanState = useMutation(
    api.production_proposals.updateProductionTimelinePlanState
  );
  const createMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
  );
  const updateMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const deleteMilestone = useMutation(
    api.production_proposals.deleteProductionTimelineMilestone
  );
  const createDraw = useMutation(
    api.production_proposals.createProductionTimelineDraw
  );
  const updateDraw = useMutation(
    api.production_proposals.updateProductionTimelineDraw
  );
  const deleteDraw = useMutation(
    api.production_proposals.deleteProductionTimelineDraw
  );
  const createCapitalEvent = useMutation(
    api.production_proposals.createProductionTimelineCapitalEvent
  );
  const createCashInfusion = useMutation(
    api.production_proposals.createProductionTimelineCashInfusion
  );
  const updateCapitalEvent = useMutation(
    api.production_proposals.updateProductionTimelineCapitalEvent
  );
  const deleteCapitalEvent = useMutation(
    api.production_proposals.deleteProductionTimelineCapitalEvent
  );
  const generateEvidenceUploadUrl = useMutation(
    api.production_proposals.generateProductionEvidenceUploadUrl
  );
  const createEvidenceAsset = useMutation(
    api.production_proposals.createProductionTimelineEvidenceAsset
  );
  const updateEvidenceAsset = useMutation(
    api.production_proposals.updateProductionTimelineEvidenceAsset
  );
  const deleteEvidenceAsset = useMutation(
    api.production_proposals.deleteProductionTimelineEvidenceAsset
  );
  const requestModification = useMutation(
    api.production_proposals.requestProductionTimelineModification
  );
  const reviewModificationRequest = useMutation(
    api.production_proposals.reviewProductionTimelineModificationRequest
  );
  const collaboration = useProductionProposalCollaboration({
    enabled: persistenceMode === "convex",
    prejoinedShareToken: prejoinedCollabToken,
    proposalId,
    shareTargetHref: buildCollaborationTargetHref(
      initialRole === "lender" ? proposalHref : backofficeHref
    ),
    workosOrganizationId,
  });

  const initialState = useMemo(
    () => convexWorkspaceToTimelineState(workspace),
    [workspace]
  );
  const collaborationCanEdit = collaboration.canEdit;
  const durableStatus = productionTimelineStatus(workspace.proposal);
  const convexPersistence = useMemo<TimelineWorkspacePersistence>(
    () => ({
      createCapitalEvent: (input) =>
        collaborationCanEdit
          ? createCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createCashInfusion: (input) =>
        collaborationCanEdit
          ? createCashInfusion({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createDraw: (input) =>
        collaborationCanEdit
          ? createDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createEvidenceAsset: (input) =>
        collaborationCanEdit
          ? createEvidenceAsset({
              ...input,
              asset: normalizeEvidenceAssetInput(input.asset),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createMilestone: (input) =>
        collaborationCanEdit
          ? createMilestone({
              milestone: normalizeProductionMilestoneInput(input.milestone),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteCapitalEvent: (input) =>
        collaborationCanEdit
          ? deleteCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteDraw: (input) =>
        collaborationCanEdit
          ? deleteDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteEvidenceAsset: (input) =>
        collaborationCanEdit
          ? deleteEvidenceAsset({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteMilestone: (input) =>
        collaborationCanEdit
          ? deleteMilestone({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      generateEvidenceUploadUrl: () =>
        collaborationCanEdit
          ? generateEvidenceUploadUrl({
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      requestModification: (input) =>
        collaborationCanEdit
          ? requestModification({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      reviewModificationRequest: (input) =>
        collaborationCanEdit
          ? reviewModificationRequest({
              ...input,
              requestId:
                input.requestId as Id<"proposalTimelineModificationRequests">,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      submitPlan: () =>
        collaborationCanEdit
          ? submitProposal({
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateCapitalEvent: (input) =>
        collaborationCanEdit
          ? updateCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateDraw: (input) =>
        collaborationCanEdit
          ? updateDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateEvidenceAsset: (input) =>
        collaborationCanEdit
          ? updateEvidenceAsset({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateMilestone: (input) =>
        collaborationCanEdit
          ? updateMilestone({
              ...normalizeProductionMilestonePatch(input),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updatePlanState: (input) =>
        collaborationCanEdit
          ? updatePlanState({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
    }),
    [
      collaborationCanEdit,
      createCapitalEvent,
      createCashInfusion,
      createDraw,
      createEvidenceAsset,
      createMilestone,
      deleteCapitalEvent,
      deleteDraw,
      deleteEvidenceAsset,
      deleteMilestone,
      generateEvidenceUploadUrl,
      proposalId,
      requestModification,
      reviewModificationRequest,
      submitProposal,
      updateCapitalEvent,
      updateDraw,
      updateEvidenceAsset,
      updateMilestone,
      updatePlanState,
      workosOrganizationId,
    ]
  );

  const persistence =
    persistenceMode === "noop"
      ? noopTimelineWorkspacePersistence
      : convexPersistence;

  return (
    <TimelineWorkspace
      allowRoleSwitching={false}
      embedded={embedded}
      collaboration={{
        cursors: collaboration.cursors,
        onCursorChange: collaboration.updateCursor,
        permission: collaboration.permission,
        toolbar: collaboration.toolbar,
      }}
      contractorPlanning={workspace.contractorPlanning}
      durableMeta={{
        backofficeHref,
        proposalHref,
        proposalSlug: String(proposalId),
        status: durableStatus,
      }}
      durablePlanId={proposalId}
      headerActions={headerActions}
      initialRole={initialRole}
      initialState={initialState}
      modificationRequests={workspace.modificationRequests ?? []}
      persistence={persistence}
      shareUrlPath="/proposal-preview"
      timelineSettingsProjection={null}
      workspaceMode="proposal"
    />
  );
}

const noopTimelineWorkspacePersistence: TimelineWorkspacePersistence = {
  createCapitalEvent: async () => undefined,
  createCashInfusion: async () => undefined,
  createDraw: async () => undefined,
  createEvidenceAsset: async () => undefined,
  createMilestone: async () => undefined,
  deleteCapitalEvent: async () => undefined,
  deleteDraw: async () => undefined,
  deleteEvidenceAsset: async () => undefined,
  deleteMilestone: async () => undefined,
  generateEvidenceUploadUrl: async () => "about:blank",
  requestModification: async () => undefined,
  reviewModificationRequest: async () => undefined,
  submitPlan: async () => undefined,
  updateCapitalEvent: async () => undefined,
  updateDraw: async () => undefined,
  updateEvidenceAsset: async () => undefined,
  updateMilestone: async () => undefined,
  updatePlanState: async () => undefined,
};

interface CollaborationParticipant {
  _id: string;
  assignableBuilderProfileId?: string | null;
  displayName?: string;
  inviteEmail?: string;
  permission: "edit" | "view";
  roleSlugs?: string[];
  status: "invited" | "joined" | "revoked";
  workosUserId?: string;
}

interface PresenceRow {
  data?: {
    cursor?: { x: number; y: number } | null;
  };
  name?: string;
  online: boolean;
  userId: string;
}

function useProductionProposalCollaboration({
  enabled,
  prejoinedShareToken,
  proposalId,
  shareTargetHref,
  workosOrganizationId,
}: {
  enabled: boolean;
  prejoinedShareToken?: string | null;
  proposalId: Id<"buildProposals">;
  shareTargetHref: string;
  workosOrganizationId: string;
}) {
  const [shareUrl, setShareUrl] = useState("");
  const [inviteTarget, setInviteTarget] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const browserSessionId = useRef(`tab-${crypto.randomUUID()}`);
  const joinedShareToken = useRef<string | null>(prejoinedShareToken ?? null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const sessionState = useQuery(
    api.proposal_collaboration.getSession,
    enabled ? { proposalId, workosOrganizationId } : "skip"
  );
  const activeSession = sessionState?.activeSession ?? null;
  const roomId = sessionState?.roomId as string | undefined;
  const historyStatus = useQuery(
    api.proposal_collaboration.getTimelineHistoryStatus,
    enabled && activeSession ? { proposalId, workosOrganizationId } : "skip"
  );
  const presenceRows = useQuery(
    api.proposal_collaboration.listPresence,
    roomToken ? { roomToken } : "skip"
  ) as PresenceRow[] | undefined;

  const startSession = useMutation(api.proposal_collaboration.startSession);
  const stopSession = useMutation(api.proposal_collaboration.stopSession);
  const joinSession = useMutation(api.proposal_collaboration.joinSession);
  const inviteParticipant = useMutation(
    api.proposal_collaboration.inviteParticipant
  );
  const setParticipantPermission = useMutation(
    api.proposal_collaboration.setParticipantPermission
  );
  const assignSessionToBuilder = useMutation(
    api.proposal_collaboration.assignSessionToBuilder
  );
  const undoTimeline = useMutation(
    api.proposal_collaboration.undoProposalTimeline
  );
  const redoTimeline = useMutation(
    api.proposal_collaboration.redoProposalTimeline
  );
  const presenceHeartbeat = useMutation(
    api.proposal_collaboration.presenceHeartbeat
  );
  const presenceDisconnect = useMutation(
    api.proposal_collaboration.presenceDisconnect
  );
  const updatePresenceData = useMutation(
    api.proposal_collaboration.updatePresenceData
  );

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  useEffect(() => {
    if (prejoinedShareToken) {
      joinedShareToken.current = prejoinedShareToken;
    }
  }, [prejoinedShareToken]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }
    const shareToken = new URLSearchParams(window.location.search).get(
      "collab"
    );
    if (!shareToken || joinedShareToken.current === shareToken) {
      return;
    }
    joinedShareToken.current = shareToken;
    void joinSession({ shareToken, workosOrganizationId })
      .then(() => toast.success("Joined live collaboration."))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to join.");
      });
  }, [enabled, joinSession, workosOrganizationId]);

  useEffect(() => {
    if (
      !(enabled && activeSession && roomId && sessionState?.currentPermission)
    ) {
      return;
    }
    let cancelled = false;
    const heartbeat = async () => {
      try {
        const result = await presenceHeartbeat({
          interval: 10_000,
          roomId,
          sessionId: browserSessionId.current,
          userId: sessionState.currentWorkosUserId ?? "viewer",
        });
        if (!cancelled) {
          setRoomToken(result.roomToken);
          setSessionToken(result.sessionToken);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Collaboration heartbeat failed", error);
        }
      }
    };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 10_000);
    const handleVisibility = () => {
      if (document.hidden && sessionTokenRef.current) {
        void presenceDisconnect({ sessionToken: sessionTokenRef.current });
      } else if (!document.hidden) {
        void heartbeat();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sessionTokenRef.current) {
        void presenceDisconnect({ sessionToken: sessionTokenRef.current });
      }
    };
  }, [
    activeSession,
    enabled,
    presenceDisconnect,
    presenceHeartbeat,
    roomId,
    sessionState?.currentPermission,
    sessionState?.currentWorkosUserId,
  ]);

  const throttledCursorUpdate = useMemo(
    () =>
      throttle((cursor: { x: number; y: number } | null) => {
        if (!(activeSession && roomId)) {
          return;
        }
        void updatePresenceData({
          cursor: cursor ?? undefined,
          roomId,
          sessionId: activeSession._id,
          workosOrganizationId,
        }).catch((error) => {
          console.error("Collaboration cursor update failed", error);
        });
      }, 90),
    [activeSession, roomId, updatePresenceData, workosOrganizationId]
  );

  useEffect(
    () => () => {
      throttledCursorUpdate.cancel();
    },
    [throttledCursorUpdate]
  );

  const runToolbarAction = useCallback(
    async (key: string, action: () => Promise<unknown>, success: string) => {
      setBusyAction(key);
      try {
        await action();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed.");
      } finally {
        setBusyAction(null);
      }
    },
    []
  );

  const handleStart = useCallback(
    () =>
      runToolbarAction(
        "start",
        async () => {
          const result = await startSession({
            proposalId,
            workosOrganizationId,
          });
          setShareUrl(
            buildCollaborationShareUrl(result.shareToken, {
              targetHref: shareTargetHref,
            })
          );
        },
        "Live collaboration started."
      ),
    [
      proposalId,
      runToolbarAction,
      shareTargetHref,
      startSession,
      workosOrganizationId,
    ]
  );

  const handleStop = useCallback(
    () =>
      activeSession
        ? runToolbarAction(
            "stop",
            () =>
              stopSession({
                reason:
                  "Live collaboration toggled off from proposal timeline.",
                sessionId: activeSession._id,
                workosOrganizationId,
              }),
            "Live collaboration stopped."
          )
        : undefined,
    [activeSession, runToolbarAction, stopSession, workosOrganizationId]
  );

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      await handleStart();
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied.");
  }, [handleStart, shareUrl]);

  const handleInvite = useCallback(() => {
    const target = inviteTarget.trim();
    if (!(activeSession && target)) {
      return;
    }
    void runToolbarAction(
      "invite",
      () =>
        inviteParticipant({
          ...(target.includes("@")
            ? { inviteEmail: target }
            : { targetWorkosUserId: target }),
          permission: "view",
          sessionId: activeSession._id,
          workosOrganizationId,
        }),
      "Participant invited."
    ).then(() => setInviteTarget(""));
  }, [
    activeSession,
    inviteParticipant,
    inviteTarget,
    runToolbarAction,
    workosOrganizationId,
  ]);

  const participants = (sessionState?.participants ??
    []) as CollaborationParticipant[];
  const currentWorkosUserId = sessionState?.currentWorkosUserId as
    | string
    | undefined;
  const cursors = useMemo(
    () =>
      (presenceRows ?? [])
        .filter((row) => row.online && row.userId !== currentWorkosUserId)
        .map((row, index) => ({
          color: collaborationCursorColor(index),
          cursor: row.data?.cursor ?? null,
          name: row.name ?? row.userId,
          userId: row.userId,
        })),
    [currentWorkosUserId, presenceRows]
  );
  const activeCollaborators = useMemo(
    () =>
      (presenceRows ?? [])
        .filter((row) => row.online)
        .map((row) => ({
          name: row.name ?? row.userId,
          userId: row.userId,
        })),
    [presenceRows]
  );
  const onlineCount = activeCollaborators.length;
  const permission = (sessionState?.currentPermission ?? null) as
    | "edit"
    | "view"
    | null;
  const effectivePermission =
    activeSession && permission !== "edit" ? "view" : permission;
  const canEdit = !activeSession || permission === "edit";
  const performUndo = useCallback(
    () =>
      activeSession
        ? runToolbarAction(
            "undo",
            () =>
              undoTimeline({
                proposalId,
                reason: "Timeline undo from collaboration toolbar.",
                sessionId: activeSession._id,
                workosOrganizationId,
              }),
            "Timeline change undone."
          )
        : Promise.resolve(),
    [
      activeSession,
      proposalId,
      runToolbarAction,
      undoTimeline,
      workosOrganizationId,
    ]
  );
  const performRedo = useCallback(
    () =>
      activeSession
        ? runToolbarAction(
            "redo",
            () =>
              redoTimeline({
                proposalId,
                reason: "Timeline redo from collaboration toolbar.",
                sessionId: activeSession._id,
                workosOrganizationId,
              }),
            "Timeline change redone."
          )
        : Promise.resolve(),
    [
      activeSession,
      proposalId,
      redoTimeline,
      runToolbarAction,
      workosOrganizationId,
    ]
  );

  useEffect(() => {
    if (!(activeSession && canEdit)) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey && event.key.toLowerCase() === "z")) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        if (historyStatus?.canRedo) {
          void performRedo();
        }
      } else if (historyStatus?.canUndo) {
        void performUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeSession,
    historyStatus?.canRedo,
    historyStatus?.canUndo,
    performRedo,
    performUndo,
    canEdit,
  ]);

  const toolbar = enabled ? (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="production-collaboration-toolbar"
    >
      <Badge variant={activeSession ? "success" : "outline"}>
        {activeSession ? <RadioTower /> : <WifiOff />}
        {activeSession ? "Live" : "Solo"}
      </Badge>
      {activeSession ? (
        <Badge variant="secondary">
          <Users />
          {onlineCount || 1}
        </Badge>
      ) : null}
      {activeSession && activeCollaborators.length > 0 ? (
        <div
          className="flex max-w-72 items-center gap-1 overflow-hidden"
          data-testid="production-active-collaborators"
        >
          {activeCollaborators.slice(0, 3).map((collaborator) => (
            <Badge
              className="max-w-28 truncate"
              key={collaborator.userId}
              variant="outline"
            >
              {collaborator.name}
            </Badge>
          ))}
          {activeCollaborators.length > 3 ? (
            <Badge variant="outline">+{activeCollaborators.length - 3}</Badge>
          ) : null}
        </div>
      ) : null}
      {activeSession && !canEdit ? (
        <Badge variant="outline">View only</Badge>
      ) : null}
      <Button
        disabled={busyAction === "undo" || !historyStatus?.canUndo || !canEdit}
        onClick={() => void performUndo()}
        size="sm"
        variant="outline"
      >
        <Undo2 />
        Undo
      </Button>
      <Button
        disabled={busyAction === "redo" || !historyStatus?.canRedo || !canEdit}
        onClick={() => void performRedo()}
        size="sm"
        variant="outline"
      >
        <Redo2 />
        Redo
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              data-testid="timeline-live-collaboration-button"
              loading={busyAction === "start"}
              onClick={activeSession ? undefined : handleStart}
              size="sm"
              variant={activeSession ? "outline" : "default"}
            />
          }
        >
          {activeSession ? <LinkIcon /> : <Radio />}
          {activeSession ? "Live link" : "Start live"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80" sideOffset={10}>
          <div className="grid gap-3">
            <div>
              <h2 className="font-semibold text-sm">
                {activeSession ? "Live collaboration" : "Start collaboration"}
              </h2>
              <p className="mt-1 text-muted-foreground text-xs">
                Same-organization proposal participants can join this timeline.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="production-live-share-link">Share link</Label>
              <Input
                id="production-live-share-link"
                readOnly
                value={shareUrl}
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={
                  busyAction === "start" ||
                  Boolean(activeSession && !sessionState?.canManage)
                }
                onClick={handleStart}
                size="sm"
                variant="outline"
              >
                <LinkIcon />
                {activeSession ? "Refresh link" : "Create link"}
              </Button>
              <Button
                disabled={
                  !activeSession || (!shareUrl && !sessionState?.canManage)
                }
                onClick={handleCopyShareUrl}
                size="sm"
              >
                <Copy />
                Copy
              </Button>
              {activeSession && sessionState?.canManage ? (
                <Button
                  disabled={busyAction === "stop"}
                  onClick={handleStop}
                  size="sm"
                  variant="destructive"
                >
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {activeSession && sessionState?.canManage ? (
        <Popover>
          <PopoverTrigger render={<Button size="sm" variant="outline" />}>
            <UserPlus />
            Access
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[420px]" sideOffset={10}>
            <div className="grid gap-4">
              <div>
                <h2 className="font-semibold text-sm">Manage access</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  View-only collaborators can inspect presence and cursors but
                  cannot change the proposal.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  onChange={(event) => setInviteTarget(event.target.value)}
                  placeholder="WorkOS user ID or email"
                  value={inviteTarget}
                />
                <Button
                  disabled={!inviteTarget.trim() || busyAction === "invite"}
                  onClick={handleInvite}
                  size="sm"
                >
                  Invite
                </Button>
              </div>
              <div className="grid gap-2">
                {participants.map((participant) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2 rounded-lg border bg-background p-2"
                    key={participant._id}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {participant.displayName ??
                          participant.inviteEmail ??
                          participant.workosUserId ??
                          "Invited participant"}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {participant.status} ·{" "}
                        {(participant.roleSlugs ?? []).join(", ") || "invite"}
                      </p>
                    </div>
                    <Select
                      disabled={
                        participant.workosUserId === currentWorkosUserId
                      }
                      onValueChange={(value) => {
                        void runToolbarAction(
                          `permission-${participant._id}`,
                          () =>
                            setParticipantPermission({
                              ...(participant.workosUserId
                                ? {
                                    targetWorkosUserId:
                                      participant.workosUserId as string,
                                  }
                                : {
                                    participantId:
                                      participant._id as Id<"proposalCollaborationParticipants">,
                                  }),
                              permission: value as "edit" | "view",
                              reason:
                                "Permission changed from proposal timeline.",
                              sessionId: activeSession._id,
                              workosOrganizationId,
                            }),
                          "Permission updated."
                        );
                      }}
                      value={participant.permission}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectPopup>
                    </Select>
                    {activeSession.initiatorSide === "broker" &&
                    participant.assignableBuilderProfileId ? (
                      <Button
                        onClick={() => {
                          if (!participant.workosUserId) {
                            return;
                          }
                          void runToolbarAction(
                            `assign-${participant._id}`,
                            () =>
                              assignSessionToBuilder({
                                reason: "Assigned from live collaboration.",
                                sessionId: activeSession._id,
                                targetWorkosUserId:
                                  participant.workosUserId as string,
                                workosOrganizationId,
                              }),
                            "Assigned to builder."
                          );
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Assign to builder
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  ) : null;

  return {
    canEdit,
    cursors,
    permission: effectivePermission,
    toolbar,
    updateCursor:
      activeSession && permission ? throttledCursorUpdate : undefined,
  };
}

function collaborationCursorColor(index: number) {
  const colors = [
    "oklch(0.54 0.14 240)",
    "oklch(0.58 0.16 145)",
    "oklch(0.62 0.14 85)",
    "oklch(0.577 0.245 27.325)",
  ];
  return colors[index % colors.length];
}

export function buildCollaborationShareUrl(
  shareToken: string,
  options: { targetHref?: string } = {}
) {
  const href =
    options.targetHref ??
    (typeof window === "undefined" ? "" : window.location.href);

  if (!href) {
    return `?collab=${encodeURIComponent(shareToken)}`;
  }

  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(href);
  const base =
    typeof window === "undefined"
      ? "http://drawflow.local"
      : window.location.origin;
  const url = new URL(href, base);
  url.searchParams.set("collab", shareToken);

  if (typeof window === "undefined" && !isAbsolute) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

export function buildCollaborationTargetHref(href: string) {
  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(href);
  const base =
    typeof window === "undefined"
      ? "http://drawflow.local"
      : window.location.origin;
  const url = new URL(href, base);
  url.searchParams.set("tab", "timeline");

  if (!isAbsolute) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

function productionTimelineStatus(
  proposal: ProductionTimelineWorkspaceProps["workspace"]["proposal"]
) {
  if (proposal.reviewOutcome === "rejected") {
    return "rejected";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "requested_changes";
  }
  return proposal.status;
}

function normalizeProductionMilestoneInput(input: any) {
  const dayStart = Math.max(0, Math.round(input.dayStart ?? input.x ?? 0));
  const durationDays = Math.max(1, Math.round(input.durationDays ?? 1));
  return {
    budgetCents: Math.max(0, Math.round(input.budgetCents ?? 0)),
    dayEnd: Math.max(
      dayStart,
      Math.round(input.dayEnd ?? dayStart + durationDays)
    ),
    dayStart,
    dependencyKeys: input.dependencyKeys ?? [],
    drawAvailabilityCents:
      input.drawAvailabilityCents === undefined
        ? undefined
        : Math.max(0, Math.round(input.drawAvailabilityCents)),
    durationDays,
    evidenceState: input.evidenceState ?? "Draft package",
    icon: input.icon,
    lane: input.lane,
    markerLabel: input.markerLabel,
    milestoneKey: input.milestoneKey,
    name: input.name ?? "Timeline milestone",
    order: Math.max(1, Math.round(input.order ?? 1)),
    policyState: input.policyState ?? "Draft proposal policy",
    status: input.status,
    submilestones: (input.submilestones ?? []).map(normalizeSubmilestoneInput),
    tone: input.tone,
    x: dayStart,
  };
}

function normalizeProductionMilestonePatch(input: any) {
  const normalized = normalizeProductionMilestoneInput({
    ...input,
    dayStart: input.dayStart ?? input.x,
  });
  return {
    budgetCents: normalized.budgetCents,
    dayEnd: normalized.dayEnd,
    dayStart: normalized.dayStart,
    dependencyKeys: normalized.dependencyKeys,
    drawAvailabilityCents: normalized.drawAvailabilityCents,
    durationDays: normalized.durationDays,
    evidenceState: normalized.evidenceState,
    icon: normalized.icon,
    lane: normalized.lane,
    markerLabel: normalized.markerLabel,
    milestoneKey: normalized.milestoneKey,
    name: normalized.name,
    order: normalized.order,
    policyState: normalized.policyState,
    status: normalized.status,
    submilestones: normalized.submilestones,
    tone: normalized.tone,
  };
}

function normalizeSubmilestoneInput(input: any, index: number) {
  return {
    ...(input.budgetCents === undefined
      ? {}
      : { budgetCents: Math.max(0, Math.round(input.budgetCents)) }),
    ...(input.durationDays === undefined
      ? {}
      : { durationDays: Math.max(1, Math.round(input.durationDays)) }),
    key: input.key ?? `sub-${index + 1}`,
    name: input.name ?? "Submilestone",
    order: Math.max(1, Math.round(input.order ?? index + 1)),
    ...(input.startDay === undefined
      ? {}
      : { startDay: Math.max(0, Math.round(input.startDay)) }),
  };
}

function normalizeEvidenceAssetInput(input: any) {
  return {
    evidenceKey: input.evidenceKey,
    fileName: input.fileName,
    label: input.label,
    locationVerified: input.locationVerified,
    milestoneKey: input.milestoneKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    source: input.source,
    storageId: input.storageId as Id<"_storage"> | undefined,
    tag: input.tag,
  };
}
