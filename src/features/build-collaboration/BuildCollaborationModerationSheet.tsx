"use client";

import { useMutation, useQuery } from "convex/react";
import { Gavel, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
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
import { CollaborationRichTextPreview } from "./CollaborationRichTextEditor.tsx";
import { formatTimestamp, roleLabel } from "./model.ts";

export type BuildCollaborationModerationEntity =
  | {
      entityId: Id<"buildCollaborationComments">;
      entityKind: "comment";
      expectedRevision: number;
    }
  | {
      entityId: Id<"buildCollaborationPosts">;
      entityKind: "post";
      expectedRevision: number;
    };

type ModerationOperation = "appeal" | "moderate" | "restore" | "retain";
type ModerationControl = "appeal" | "moderate" | "resolve";

interface ModerationContext {
  canAppeal: boolean;
  canModerate: boolean;
  canResolveAppeal: boolean;
  caseId?: Id<"buildCollaborationModerationCases">;
  currentReason?: string;
  events: Array<{
    actorRole:
      | "admin"
      | "principle-broker"
      | "broker"
      | "builder"
      | "broker-staff"
      | "builder-staff"
      | "homeowner"
      | "contractor";
    createdAt: number;
    eventType: "appealed" | "moderated" | "restored" | "retained";
    reason: string;
  }>;
  evidence?: {
    attachments: Array<{
      attachmentKind: "collaborationAsset" | "document" | "evidenceAsset";
      href?: string;
      label: string;
      summary?: string;
    }>;
    plainText: string;
    receipts: Array<{
      displayNameSnapshot: string;
      firstViewedAt: number;
      lastViewedAt: number;
      viewerRole:
        | "admin"
        | "principle-broker"
        | "broker"
        | "builder"
        | "broker-staff"
        | "builder-staff"
        | "homeowner"
        | "contractor";
      workosUserId: string;
    }>;
    references: Array<{
      entityKind:
        | "participant"
        | "milestone"
        | "submilestone"
        | "draw"
        | "evidencePackage"
        | "evidenceAsset"
        | "siteVisit"
        | "document"
        | "material"
        | "actionItem";
      href: string;
      label: string;
      summary: string;
    }>;
    tiptapJson: string;
  };
  status?: "appealed" | "final_retained" | "moderated" | "restored";
}

function moderationControl(
  context: ModerationContext | undefined
): ModerationControl | null {
  if (context?.canModerate) {
    return "moderate";
  }
  if (context?.canAppeal) {
    return "appeal";
  }
  return context?.canResolveAppeal ? "resolve" : null;
}

export function BuildCollaborationModerationSheet({
  buildId,
  entity,
  onOpenChange,
  open,
  organizationId,
}: {
  buildId: Id<"activeBuilds">;
  entity: BuildCollaborationModerationEntity | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
}) {
  const context = useQuery(
    api.build_collaboration_moderation.getBuildCollaborationModerationContext,
    entity && open
      ? {
          buildId,
          entityId: entity.entityId,
          entityKind: entity.entityKind,
          organizationId,
        }
      : "skip"
  );
  const moderate = useMutation(
    api.build_collaboration_moderation.moderateBuildCollaborationContent
  );
  const appeal = useMutation(
    api.build_collaboration_moderation.appealBuildCollaborationModeration
  );
  const resolveAppeal = useMutation(
    api.build_collaboration_moderation.resolveBuildCollaborationModerationAppeal
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const submit = async (operation: ModerationOperation) => {
    if (!(entity && context) || submitting) {
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      await executeModerationOperation({
        appeal,
        buildId,
        context,
        entity,
        moderate,
        operation,
        organizationId,
        reason,
        resolveAppeal,
      });
      toast.success(moderationSuccessMessage(operation));
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update moderation."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const operation = moderationControl(context);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup>
        <SheetHeader>
          <SheetTitle>Content moderation</SheetTitle>
          <SheetDescription>
            Moderation follows the Build role hierarchy and preserves the
            original evidence and revision ledger.
          </SheetDescription>
        </SheetHeader>
        <ModerationPanel
          context={context}
          operation={operation}
          reason={reason}
          setReason={setReason}
        />
        <ModerationFooter
          operation={operation}
          submit={submit}
          submitting={submitting}
        />
      </SheetPopup>
    </Sheet>
  );
}

async function executeModerationOperation(input: {
  appeal: (args: {
    buildId: Id<"activeBuilds">;
    caseId: Id<"buildCollaborationModerationCases">;
    organizationId: string;
    reason: string;
  }) => Promise<unknown>;
  buildId: Id<"activeBuilds">;
  context: ModerationContext;
  entity: BuildCollaborationModerationEntity;
  moderate: (args: {
    buildId: Id<"activeBuilds">;
    entityId: string;
    entityKind: "comment" | "post";
    expectedRevision: number;
    organizationId: string;
    reason: string;
  }) => Promise<unknown>;
  operation: ModerationOperation;
  organizationId: string;
  reason: string;
  resolveAppeal: (args: {
    buildId: Id<"activeBuilds">;
    caseId: Id<"buildCollaborationModerationCases">;
    organizationId: string;
    outcome: "restore" | "retain";
    reason: string;
  }) => Promise<unknown>;
}) {
  if (input.operation === "moderate") {
    return await input.moderate({
      buildId: input.buildId,
      entityId: input.entity.entityId,
      entityKind: input.entity.entityKind,
      expectedRevision: input.entity.expectedRevision,
      organizationId: input.organizationId,
      reason: input.reason,
    });
  }
  const caseId = input.context.caseId;
  if (!caseId) {
    throw new Error("The moderation case is no longer available.");
  }
  if (input.operation === "appeal") {
    return await input.appeal({
      buildId: input.buildId,
      caseId,
      organizationId: input.organizationId,
      reason: input.reason,
    });
  }
  return await input.resolveAppeal({
    buildId: input.buildId,
    caseId,
    organizationId: input.organizationId,
    outcome: input.operation === "restore" ? "restore" : "retain",
    reason: input.reason,
  });
}

function ModerationPanel({
  context,
  operation,
  reason,
  setReason,
}: {
  context: ModerationContext | undefined;
  operation: ModerationControl | null;
  reason: string;
  setReason: (value: string) => void;
}) {
  if (!context) {
    return (
      <SheetPanel>
        <p className="text-muted-foreground text-sm">
          Loading moderation authority…
        </p>
      </SheetPanel>
    );
  }
  return (
    <SheetPanel className="space-y-4">
      {context.status ? <ModerationCaseSummary context={context} /> : null}
      {context.evidence ? (
        <ModerationEvidenceDossier evidence={context.evidence} />
      ) : null}
      {operation ? (
        <div className="space-y-2">
          <Label htmlFor="collaboration-moderation-reason">
            {reasonLabel(operation)}
          </Label>
          <Textarea
            id="collaboration-moderation-reason"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            placeholder={reasonPlaceholder(operation)}
            value={reason}
          />
          <p className="text-muted-foreground text-xs">
            This reason is retained in the immutable audit trail.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No moderation action is available to your current role.
        </p>
      )}
      <ModerationHistory events={context.events ?? []} />
    </SheetPanel>
  );
}

function ModerationEvidenceDossier({
  evidence,
}: {
  evidence: NonNullable<ModerationContext["evidence"]>;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="font-semibold text-sm">Evidence under review</h3>
        <p className="text-muted-foreground text-xs">
          Immutable publication evidence, projected through your current
          permissions.
        </p>
      </div>
      <Frame>
        <FramePanel className="space-y-3 p-3">
          <CollaborationRichTextPreview
            ariaLabel="Moderated content evidence"
            className="border-0 bg-transparent [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
            tagOptions={[]}
            value={evidence.tiptapJson}
          />
          {evidence.references.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Referenced work</p>
              {evidence.references.map((reference) => (
                <a
                  className="block text-primary text-sm hover:underline"
                  href={reference.href}
                  key={`${reference.entityKind}:${reference.href}`}
                >
                  {reference.label}
                  <span className="block text-muted-foreground text-xs">
                    {reference.summary}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {evidence.attachments.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Attachments</p>
              {evidence.attachments.map((attachment) =>
                attachment.href ? (
                  <a
                    className="block text-primary text-sm hover:underline"
                    href={attachment.href}
                    key={`${attachment.attachmentKind}:${attachment.href}`}
                  >
                    {attachment.label}
                    {attachment.summary ? (
                      <span className="block text-muted-foreground text-xs">
                        {attachment.summary}
                      </span>
                    ) : null}
                  </a>
                ) : (
                  <div
                    className="text-sm"
                    key={`${attachment.attachmentKind}:${attachment.label}`}
                  >
                    {attachment.label}
                    {attachment.summary ? (
                      <span className="block text-muted-foreground text-xs">
                        {attachment.summary}
                      </span>
                    ) : null}
                  </div>
                )
              )}
            </div>
          ) : null}
          {evidence.receipts.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">
                Seen by {evidence.receipts.length} visible participant
                {evidence.receipts.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-1">
                {evidence.receipts.map((receipt) => (
                  <li
                    className="text-muted-foreground text-xs"
                    key={`${receipt.workosUserId}:${receipt.firstViewedAt}`}
                  >
                    <span className="font-medium text-foreground">
                      {receipt.displayNameSnapshot}
                    </span>{" "}
                    · {roleLabel(receipt.viewerRole)} ·{" "}
                    {receipt.firstViewedAt === receipt.lastViewedAt ? (
                      <>seen {formatTimestamp(receipt.lastViewedAt)}</>
                    ) : (
                      <>
                        first seen {formatTimestamp(receipt.firstViewedAt)} ·
                        last seen {formatTimestamp(receipt.lastViewedAt)}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </FramePanel>
      </Frame>
    </section>
  );
}

function ModerationCaseSummary({ context }: { context: ModerationContext }) {
  if (!context.status) {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-sm">Current case</span>
          <Badge variant="secondary">
            {moderationStatusLabel(context.status)}
          </Badge>
        </div>
        {context.currentReason ? (
          <p className="text-muted-foreground text-sm">
            {context.currentReason}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function ModerationHistory({
  events,
}: {
  events: ModerationContext["events"];
}) {
  if (events.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-sm">Case history</h3>
      <div className="space-y-2">
        {events.map((event) => (
          <Frame
            key={`${event.eventType}:${event.createdAt}:${event.actorRole}`}
          >
            <FramePanel className="space-y-1 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">
                  {moderationEventLabel(event.eventType)}
                </span>
                <span className="text-muted-foreground">
                  {roleLabel(event.actorRole)} ·{" "}
                  {formatTimestamp(event.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground text-sm">{event.reason}</p>
            </FramePanel>
          </Frame>
        ))}
      </div>
    </section>
  );
}

function ModerationFooter({
  operation,
  submit,
  submitting,
}: {
  operation: ModerationControl | null;
  submit: (operation: ModerationOperation) => Promise<void>;
  submitting: boolean;
}) {
  if (!operation) {
    return null;
  }
  return (
    <SheetFooter>
      {operation === "resolve" ? (
        <>
          <Button
            disabled={submitting}
            onClick={() => submit("retain")}
            type="button"
            variant="outline"
          >
            <ShieldAlert aria-hidden="true" className="size-4" />
            Retain moderation
          </Button>
          <Button
            disabled={submitting}
            onClick={() => submit("restore")}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Restore content
          </Button>
        </>
      ) : (
        <Button
          disabled={submitting}
          onClick={() => submit(operation)}
          type="button"
          variant={operation === "moderate" ? "destructive" : "default"}
        >
          <Gavel aria-hidden="true" className="size-4" />
          {operation === "moderate" ? "Moderate content" : "Submit appeal"}
        </Button>
      )}
    </SheetFooter>
  );
}

function moderationEventLabel(
  event: "appealed" | "moderated" | "restored" | "retained"
) {
  switch (event) {
    case "moderated":
      return "Content moderated";
    case "appealed":
      return "Appeal submitted";
    case "restored":
      return "Content restored";
    case "retained":
      return "Moderation retained";
  }
}

function moderationStatusLabel(
  status: "appealed" | "final_retained" | "moderated" | "restored"
) {
  switch (status) {
    case "moderated":
      return "Moderated";
    case "appealed":
      return "Appeal awaiting review";
    case "restored":
      return "Restored";
    case "final_retained":
      return "Moderation final";
  }
}

function moderationSuccessMessage(
  operation: "appeal" | "moderate" | "restore" | "retain"
) {
  switch (operation) {
    case "moderate":
      return "Content moderated and the author was notified.";
    case "appeal":
      return "Appeal submitted to the next eligible role tier.";
    case "restore":
      return "Content restored.";
    case "retain":
      return "Moderation retained.";
  }
}

function reasonLabel(operation: "appeal" | "moderate" | "resolve") {
  switch (operation) {
    case "moderate":
      return "Moderation reason";
    case "appeal":
      return "Appeal reason";
    case "resolve":
      return "Decision reason";
  }
}

function reasonPlaceholder(operation: "appeal" | "moderate" | "resolve") {
  switch (operation) {
    case "moderate":
      return "Explain the policy, safety, or project-governance issue.";
    case "appeal":
      return "Explain why this content should be restored.";
    case "resolve":
      return "Record the basis for the appeal decision.";
  }
}
