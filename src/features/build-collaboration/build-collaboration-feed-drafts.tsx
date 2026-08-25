import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import { BuildCollaborationApprovalReview } from "./BuildCollaborationApprovalReview.tsx";
import {
  type CollaborationDraftSummary,
  formatTimestamp,
  parseDraftBundle,
} from "./model.ts";

type DraftId = CollaborationDraftSummary["_id"];
type DraftMutationArgs = {
  buildId: Id<"activeBuilds">;
  draftId: DraftId;
  organizationId: string;
};

export interface BuildCollaborationDraftSurfaceProps {
  activeBuildId: Id<"activeBuilds">;
  discardDraft: (args: DraftMutationArgs) => Promise<unknown>;
  drafts?: CollaborationDraftSummary[] | null;
  isOnline: boolean;
  loadDraftIntoComposer: (draft: CollaborationDraftSummary) => void;
  organizationId: string;
  publishDraft: (args: DraftMutationArgs) => Promise<unknown>;
  publishing: boolean;
  reviewingDraftId: DraftId | null;
  scheduleDraft: (
    args: DraftMutationArgs & {
      expectedRevision: number;
      scheduledFor: number;
    },
  ) => Promise<unknown>;
  schedulingCapabilities?: { canSchedule?: boolean } | null;
  setPublishing: (publishing: boolean) => void;
  setReviewingDraftId: (draftId: DraftId | null) => void;
}

export function BuildCollaborationDraftSurface({
  activeBuildId,
  discardDraft,
  drafts,
  isOnline,
  loadDraftIntoComposer,
  organizationId,
  publishDraft,
  publishing,
  reviewingDraftId,
  scheduleDraft,
  schedulingCapabilities,
  setPublishing,
  setReviewingDraftId,
}: BuildCollaborationDraftSurfaceProps) {
  if (!drafts || drafts.length === 0) {
    return null;
  }

  return (
    <Frame data-testid="build-collaboration-drafts">
      <FramePanel className="space-y-3">
        <div>
          <p className="font-medium text-sm">Drafts awaiting you</p>
          <p className="text-muted-foreground text-xs">
            Assistant-prepared drafts require your approval. Your own drafts
            can publish directly under your name.
          </p>
        </div>
        <div className="space-y-2">
          {drafts.map((draft) => {
            const bundle = parseDraftBundle(draft.bundleJson);
            const requiresExactReview =
              draft.preparedByAgent || Boolean(draft.scheduledFor);
            const scheduled = draft.state === "scheduled";
            return (
              <Card key={draft._id}>
                <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-sm">
                        {bundle?.plainText ?? "Invalid draft"}
                      </p>
                      {draft.preparedByAgent ? (
                        <Badge variant="outline">Agent prepared</Badge>
                      ) : null}
                      {scheduled ? (
                        <Badge variant="secondary">
                          <CalendarClock
                            aria-hidden="true"
                            className="size-3"
                          />
                          Scheduled
                        </Badge>
                      ) : null}
                      {draft.scheduleConflictReason ? (
                        <Badge variant="destructive">Renew approval</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Revision {draft.revision} · saved{" "}
                      {formatTimestamp(draft.updatedAt)}
                      {draft.scheduledFor
                        ? ` · target ${formatTimestamp(draft.scheduledFor)}`
                        : ""}
                    </p>
                    {draft.scheduleConflictReason ? (
                      <p className="mt-1 text-destructive text-xs">
                        {draft.scheduleConflictReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draft.preparedByAgent || scheduled ? null : (
                      <Button
                        onClick={() => loadDraftIntoComposer(draft)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                    )}
                    {!scheduled && requiresExactReview ? (
                      <Button
                        disabled={
                          Boolean(draft.scheduledFor) &&
                          !schedulingCapabilities?.canSchedule
                        }
                        onClick={() => setReviewingDraftId(draft._id)}
                        size="sm"
                        type="button"
                      >
                        Review exact bundle
                      </Button>
                    ) : scheduled ? null : (
                      <Button
                        disabled={publishing || !isOnline}
                        onClick={async () => {
                          setPublishing(true);
                          try {
                            await publishDraft({
                              buildId: activeBuildId,
                              draftId: draft._id,
                              organizationId,
                            });
                            toast.success("Draft published.");
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Unable to publish draft.",
                            );
                          } finally {
                            setPublishing(false);
                          }
                        }}
                        size="sm"
                        type="button"
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      onClick={async () => {
                        try {
                          await discardDraft({
                            buildId: activeBuildId,
                            draftId: draft._id,
                            organizationId,
                          });
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Unable to discard draft.",
                          );
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Discard
                    </Button>
                  </div>
                </CardPanel>
                {reviewingDraftId === draft._id && bundle ? (
                  <CardPanel className="border-t p-3">
                    <BuildCollaborationApprovalReview
                      approveLabel={
                        draft.scheduledFor
                          ? "Approve exact bundle & schedule"
                          : undefined
                      }
                      buildId={activeBuildId}
                      bundle={bundle}
                      onApprove={async () => {
                        if (publishing) {
                          return;
                        }
                        setPublishing(true);
                        try {
                          if (draft.scheduledFor) {
                            await scheduleDraft({
                              buildId: activeBuildId,
                              draftId: draft._id,
                              expectedRevision: draft.revision,
                              organizationId,
                              scheduledFor: draft.scheduledFor,
                            });
                            toast.success(
                              "Exact bundle approved and scheduled under your name.",
                            );
                          } else {
                            await publishDraft({
                              buildId: activeBuildId,
                              draftId: draft._id,
                              organizationId,
                            });
                            toast.success(
                              "Draft approved and published under your name.",
                            );
                          }
                          setReviewingDraftId(null);
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Unable to publish draft.",
                          );
                        } finally {
                          setPublishing(false);
                        }
                      }}
                      onCancel={() => setReviewingDraftId(null)}
                      organizationId={organizationId}
                      publishing={publishing}
                      scheduledFor={draft.scheduledFor}
                    />
                  </CardPanel>
                ) : null}
              </Card>
            );
          })}
        </div>
      </FramePanel>
    </Frame>
  );
}
