"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, Megaphone, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useBuildCollaborationMutation } from "./BuildCollaborationMutationGate.tsx";
import { formatTimestamp, postTypeLabel, roleLabel } from "./model.ts";

type CollaborationRole =
  | "admin"
  | "principle-broker"
  | "broker"
  | "builder"
  | "broker-staff"
  | "builder-staff"
  | "homeowner"
  | "contractor";

interface ThreadContext {
  acceptedCommentId?: Id<"buildCollaborationComments">;
  announcementExpiresAt?: number;
  answerOptions: Array<{
    authorDisplayName: string;
    commentId: Id<"buildCollaborationComments">;
    plainText: string;
  }>;
  canManageAnnouncementExpiration: boolean;
  canReopen: boolean;
  canResolve: boolean;
  decisionOutcome?: string;
  decisionOwnerWorkosUserId?: string;
  decisionRevisions: Array<{
    changedByRole: CollaborationRole;
    changedByWorkosUserId: string;
    createdAt: number;
    outcome: string;
    ownerDisplayNameSnapshot: string;
    ownerWorkosUserId: string;
    reason?: string;
    revision: number;
  }>;
  hasLinkedWork: boolean;
  participants: Array<{
    displayName: string;
    role: CollaborationRole;
    workosUserId: string;
  }>;
  postType: "update" | "question" | "decision" | "issue" | "announcement";
  resolutionSummary?: string;
  resolvedAt?: number;
  resolvedByWorkosUserId?: string;
  threadRevision: number;
  threadState: "open" | "resolved";
  updatedAt: number;
}

export function BuildCollaborationThreadSheet({
  buildId,
  onOpenChange,
  open,
  organizationId,
  postId,
  readOnly = false,
}: {
  buildId: Id<"activeBuilds">;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  postId: Id<"buildCollaborationPosts"> | null;
  readOnly?: boolean;
}) {
  const context = useQuery(
    api.build_collaboration_resolution.getBuildCollaborationThreadContext,
    open && postId ? { buildId, organizationId, postId } : "skip"
  ) as ThreadContext | undefined;
  const resolveThread = useBuildCollaborationMutation(
    api.build_collaboration_resolution.resolveBuildCollaborationThread
  );
  const reopenThread = useBuildCollaborationMutation(
    api.build_collaboration_resolution.reopenBuildCollaborationThread
  );
  const setAnnouncementExpiration = useBuildCollaborationMutation(
    api.build_collaboration_resolution
      .setBuildCollaborationAnnouncementExpiration
  );
  const [acceptedCommentId, setAcceptedCommentId] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState("");
  const [decisionOwnerWorkosUserId, setDecisionOwnerWorkosUserId] =
    useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [expirationInput, setExpirationInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!(open && context)) {
      return;
    }
    setAcceptedCommentId(context.acceptedCommentId ?? "");
    setDecisionOutcome(context.decisionOutcome ?? "");
    setDecisionOwnerWorkosUserId(context.decisionOwnerWorkosUserId ?? "");
    setResolutionSummary(context.resolutionSummary ?? "");
    setReopenReason("");
    setExpirationInput(
      context.announcementExpiresAt
        ? localDateTimeValue(context.announcementExpiresAt)
        : ""
    );
  }, [context, open]);

  const resolve = async () => {
    if (!(context && postId) || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await resolveThread({
        buildId,
        expectedThreadRevision: context.threadRevision,
        organizationId,
        postId,
        ...intentResolutionInput(context.postType, {
          acceptedCommentId,
          decisionOutcome,
          decisionOwnerWorkosUserId,
          resolutionSummary,
        }),
      });
      toast.success(
        context.postType === "question"
          ? "Answer accepted and thread resolved."
          : "Thread resolved."
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to resolve thread."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const reopen = async () => {
    if (!(context && postId) || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await reopenThread({
        buildId,
        expectedThreadRevision: context.threadRevision,
        organizationId,
        postId,
        reason: reopenReason,
      });
      toast.success("Thread reopened.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to reopen thread."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveExpiration = async (clear = false) => {
    if (!(context && postId) || submitting) {
      return;
    }
    const expiresAt = clear
      ? undefined
      : expirationInput
        ? new Date(expirationInput).getTime()
        : undefined;
    setSubmitting(true);
    try {
      await setAnnouncementExpiration({
        buildId,
        expectedThreadRevision: context.threadRevision,
        expiresAt,
        organizationId,
        postId,
      });
      toast.success(
        expiresAt === undefined
          ? "Announcement prominence restored."
          : "Announcement expiration saved."
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update Announcement expiration."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup>
        <SheetHeader>
          <SheetTitle>Thread outcome</SheetTitle>
          <SheetDescription>
            Resolve the operational record without changing linked Build work.
          </SheetDescription>
        </SheetHeader>
        <ThreadSheetPanel
          acceptedCommentId={acceptedCommentId}
          context={context}
          decisionOutcome={decisionOutcome}
          decisionOwnerWorkosUserId={decisionOwnerWorkosUserId}
          expirationInput={expirationInput}
          onAcceptedCommentChange={setAcceptedCommentId}
          onDecisionOutcomeChange={setDecisionOutcome}
          onDecisionOwnerChange={setDecisionOwnerWorkosUserId}
          onExpirationChange={setExpirationInput}
          onReopenReasonChange={setReopenReason}
          onResolutionSummaryChange={setResolutionSummary}
          reopenReason={reopenReason}
          readOnly={readOnly}
          resolutionSummary={resolutionSummary}
        />
        <ThreadSheetActions
          context={context}
          expirationInput={expirationInput}
          onClose={() => onOpenChange(false)}
          onReopen={reopen}
          onResolve={resolve}
          onSaveExpiration={saveExpiration}
          readOnly={readOnly}
          submitting={submitting}
        />
      </SheetPopup>
    </Sheet>
  );
}

function ThreadSheetPanel({
  acceptedCommentId,
  context,
  decisionOutcome,
  decisionOwnerWorkosUserId,
  expirationInput,
  onAcceptedCommentChange,
  onDecisionOutcomeChange,
  onDecisionOwnerChange,
  onExpirationChange,
  onReopenReasonChange,
  onResolutionSummaryChange,
  reopenReason,
  readOnly,
  resolutionSummary,
}: {
  acceptedCommentId: string;
  context: ThreadContext | undefined;
  decisionOutcome: string;
  decisionOwnerWorkosUserId: string;
  expirationInput: string;
  onAcceptedCommentChange: (value: string) => void;
  onDecisionOutcomeChange: (value: string) => void;
  onDecisionOwnerChange: (value: string) => void;
  onExpirationChange: (value: string) => void;
  onReopenReasonChange: (value: string) => void;
  onResolutionSummaryChange: (value: string) => void;
  reopenReason: string;
  readOnly: boolean;
  resolutionSummary: string;
}) {
  if (!context) {
    return (
      <SheetPanel>
        <Frame>
          <FramePanel className="text-muted-foreground text-sm">
            Loading thread controls…
          </FramePanel>
        </Frame>
      </SheetPanel>
    );
  }
  return (
    <SheetPanel className="space-y-4">
      <ThreadStateSummary context={context} />
      {!readOnly && context.threadState === "open" && context.canResolve ? (
        <ResolutionFields
          acceptedCommentId={acceptedCommentId}
          context={context}
          decisionOutcome={decisionOutcome}
          decisionOwnerWorkosUserId={decisionOwnerWorkosUserId}
          onAcceptedCommentChange={onAcceptedCommentChange}
          onDecisionOutcomeChange={onDecisionOutcomeChange}
          onDecisionOwnerChange={onDecisionOwnerChange}
          onResolutionSummaryChange={onResolutionSummaryChange}
          resolutionSummary={resolutionSummary}
        />
      ) : null}
      {!readOnly && context.threadState === "resolved" && context.canReopen ? (
        <div className="space-y-2">
          <Label htmlFor="thread-reopen-reason">Reopening reason</Label>
          <Textarea
            id="thread-reopen-reason"
            onChange={(event) => onReopenReasonChange(event.target.value)}
            placeholder="Explain why this operational thread is open again."
            value={reopenReason}
          />
        </div>
      ) : null}
      {!readOnly && context.canManageAnnouncementExpiration ? (
        <AnnouncementExpiration
          expiresAt={context.announcementExpiresAt}
          onChange={onExpirationChange}
          value={expirationInput}
        />
      ) : null}
      {context.decisionRevisions.length > 0 ? (
        <DecisionRevisionLedger revisions={context.decisionRevisions} />
      ) : null}
    </SheetPanel>
  );
}

function ThreadSheetActions({
  context,
  expirationInput,
  onClose,
  onReopen,
  onResolve,
  onSaveExpiration,
  readOnly,
  submitting,
}: {
  context: ThreadContext | undefined;
  expirationInput: string;
  onClose: () => void;
  onReopen: () => void;
  onResolve: () => void;
  onSaveExpiration: (clear?: boolean) => void;
  readOnly: boolean;
  submitting: boolean;
}) {
  return (
    <SheetFooter className="gap-2">
      <Button onClick={onClose} type="button" variant="ghost">
        Close
      </Button>
      {!readOnly && context?.canManageAnnouncementExpiration ? (
        <>
          {context.announcementExpiresAt ? (
            <Button
              disabled={submitting}
              onClick={() => onSaveExpiration(true)}
              type="button"
              variant="outline"
            >
              Keep prominent
            </Button>
          ) : null}
          <Button
            disabled={submitting || !expirationInput}
            onClick={() => onSaveExpiration()}
            type="button"
            variant="outline"
          >
            Save expiration
          </Button>
        </>
      ) : null}
      {!readOnly && context?.threadState === "open" && context.canResolve ? (
        <Button disabled={submitting} onClick={onResolve} type="button">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {context.postType === "question" ? "Accept answer" : "Resolve thread"}
        </Button>
      ) : null}
      {!readOnly && context?.threadState === "resolved" && context.canReopen ? (
        <Button disabled={submitting} onClick={onReopen} type="button">
          <RotateCcw aria-hidden="true" className="size-4" />
          Reopen thread
        </Button>
      ) : null}
    </SheetFooter>
  );
}

function ThreadStateSummary({ context }: { context: ThreadContext }) {
  const owner = context.participants.find(
    (participant) =>
      participant.workosUserId === context.decisionOwnerWorkosUserId
  );
  return (
    <Frame>
      <FramePanel className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={context.threadState === "resolved" ? "default" : "outline"}
          >
            {context.threadState === "resolved" ? "Resolved" : "Open"}
          </Badge>
          <Badge variant="outline">{postTypeLabel(context.postType)}</Badge>
          {context.postType === "announcement" ? (
            <Badge variant="secondary">
              <Megaphone aria-hidden="true" className="size-3" />
              {context.announcementExpiresAt &&
              context.announcementExpiresAt <= Date.now()
                ? "Prominence expired"
                : "Prominent"}
            </Badge>
          ) : null}
        </div>
        {context.decisionOutcome ? (
          <div>
            <p className="font-medium text-sm">{context.decisionOutcome}</p>
            <p className="text-muted-foreground text-xs">
              Owner: {owner?.displayName ?? "Former Build participant"}
            </p>
          </div>
        ) : null}
        {context.resolutionSummary && context.postType !== "decision" ? (
          <p className="text-muted-foreground text-sm">
            {context.resolutionSummary}
          </p>
        ) : null}
        {context.resolvedAt ? (
          <p className="text-muted-foreground text-xs">
            Resolved {formatTimestamp(context.resolvedAt)}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function ResolutionFields({
  acceptedCommentId,
  context,
  decisionOutcome,
  decisionOwnerWorkosUserId,
  onAcceptedCommentChange,
  onDecisionOutcomeChange,
  onDecisionOwnerChange,
  onResolutionSummaryChange,
  resolutionSummary,
}: {
  acceptedCommentId: string;
  context: ThreadContext;
  decisionOutcome: string;
  decisionOwnerWorkosUserId: string;
  onAcceptedCommentChange: (value: string) => void;
  onDecisionOutcomeChange: (value: string) => void;
  onDecisionOwnerChange: (value: string) => void;
  onResolutionSummaryChange: (value: string) => void;
  resolutionSummary: string;
}) {
  if (context.postType === "question") {
    return (
      <div className="space-y-2">
        <Label htmlFor="accepted-answer">Accepted answer</Label>
        {context.answerOptions.length > 0 ? (
          <Select
            onValueChange={onAcceptedCommentChange}
            value={acceptedCommentId}
          >
            <SelectTrigger id="accepted-answer">
              <SelectValue placeholder="Choose a visible reply" />
            </SelectTrigger>
            <SelectContent>
              {context.answerOptions.map((option) => (
                <SelectItem key={option.commentId} value={option.commentId}>
                  {option.authorDisplayName}: {option.plainText}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Frame>
            <FramePanel className="text-muted-foreground text-sm">
              Add a visible reply before resolving this Question.
            </FramePanel>
          </Frame>
        )}
      </div>
    );
  }
  if (context.postType === "decision") {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="decision-outcome">Decision outcome</Label>
          <Textarea
            id="decision-outcome"
            onChange={(event) => onDecisionOutcomeChange(event.target.value)}
            placeholder="State the decision concisely."
            value={decisionOutcome}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="decision-owner">Decision owner</Label>
          <Select
            onValueChange={onDecisionOwnerChange}
            value={decisionOwnerWorkosUserId}
          >
            <SelectTrigger id="decision-owner">
              <SelectValue placeholder="Choose a Build participant" />
            </SelectTrigger>
            <SelectContent>
              {context.participants.map((participant) => (
                <SelectItem
                  key={participant.workosUserId}
                  value={participant.workosUserId}
                >
                  {participant.displayName} · {roleLabel(participant.role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="decision-reason">Decision note (optional)</Label>
          <Textarea
            id="decision-reason"
            onChange={(event) => onResolutionSummaryChange(event.target.value)}
            value={resolutionSummary}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="resolution-summary">
        {context.postType === "issue"
          ? "Issue disposition"
          : "Resolution note (optional)"}
      </Label>
      {context.postType === "issue" ? (
        <p className="text-muted-foreground text-xs">
          {context.hasLinkedWork
            ? "Linked Build work is present. Resolving this thread will not change its status."
            : "Link a Build entity or Action Item before resolving this Issue / Blocker."}
        </p>
      ) : null}
      <Textarea
        id="resolution-summary"
        onChange={(event) => onResolutionSummaryChange(event.target.value)}
        placeholder={
          context.postType === "issue"
            ? "Record how the blocker was disposed."
            : "Add concise closure context."
        }
        value={resolutionSummary}
      />
    </div>
  );
}

function AnnouncementExpiration({
  expiresAt,
  onChange,
  value,
}: {
  expiresAt?: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Frame>
      <FramePanel className="space-y-2 p-3">
        <div>
          <p className="font-medium text-sm">Announcement prominence</p>
          <p className="text-muted-foreground text-xs">
            Expiration removes prominence only. The historical post remains.
          </p>
        </div>
        <Label htmlFor="announcement-expiration">Prominent until</Label>
        <Input
          id="announcement-expiration"
          onChange={(event) => onChange(event.target.value)}
          type="datetime-local"
          value={value}
        />
        {expiresAt ? (
          <p className="text-muted-foreground text-xs">
            Current expiration: {formatTimestamp(expiresAt)}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function DecisionRevisionLedger({
  revisions,
}: {
  revisions: ThreadContext["decisionRevisions"];
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className="font-medium text-sm">Decision outcome history</p>
        <p className="text-muted-foreground text-xs">
          Previous resolved outcomes remain immutable.
        </p>
      </div>
      {revisions.map((revision) => (
        <Frame key={revision.revision}>
          <FramePanel className="space-y-1 p-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline">Revision {revision.revision}</Badge>
              <time className="text-muted-foreground text-xs">
                {formatTimestamp(revision.createdAt)}
              </time>
            </div>
            <p className="font-medium text-sm">{revision.outcome}</p>
            <p className="text-muted-foreground text-xs">
              Owner: {revision.ownerDisplayNameSnapshot} · changed by{" "}
              {roleLabel(revision.changedByRole)}
            </p>
            {revision.reason ? (
              <p className="text-muted-foreground text-xs">{revision.reason}</p>
            ) : null}
          </FramePanel>
        </Frame>
      ))}
    </section>
  );
}

function localDateTimeValue(timestamp: number) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function intentResolutionInput(
  postType: ThreadContext["postType"],
  values: {
    acceptedCommentId: string;
    decisionOutcome: string;
    decisionOwnerWorkosUserId: string;
    resolutionSummary: string;
  }
) {
  if (postType === "question") {
    return {
      acceptedCommentId: values.acceptedCommentId
        ? (values.acceptedCommentId as Id<"buildCollaborationComments">)
        : undefined,
    };
  }
  if (postType === "decision") {
    return {
      decisionOutcome: values.decisionOutcome,
      decisionOwnerWorkosUserId: values.decisionOwnerWorkosUserId,
      resolutionSummary: values.resolutionSummary,
    };
  }
  return { resolutionSummary: values.resolutionSummary };
}
