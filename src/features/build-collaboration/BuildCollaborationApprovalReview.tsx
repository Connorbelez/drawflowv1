import type { JSONContent } from "@tiptap/react";
import type React from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { CollaborationRichTextPreview } from "./CollaborationRichTextEditor.tsx";
import type { CollaborationDraftBundle } from "./model.ts";

export function BuildCollaborationApprovalReview({
  bundle,
  onApprove,
  onCancel,
  publishing,
}: {
  bundle: CollaborationDraftBundle;
  onApprove: () => void;
  onCancel: () => void;
  publishing: boolean;
}) {
  const references = bundle.references ?? [];
  const actionItems = bundle.actionItems ?? [];
  const assets = bundle.attachmentAssetIds ?? [];
  const notifications =
    bundle.effectiveNotificationEffects ?? bundle.notificationEffects ?? [];
  const sharedMutations = bundle.sharedMutations ?? [];

  return (
    <Card data-testid="build-collaboration-approval-review">
      <CardHeader>
        <div>
          <CardTitle>Human approval checkpoint</CardTitle>
          <CardDescription>
            Confirm the exact shared bundle. Any edit invalidates this review.
          </CardDescription>
        </div>
        <Badge variant="outline">You will be the author</Badge>
      </CardHeader>
      <CardPanel className="space-y-4">
        <ReviewSection label="Publication">
          <CollaborationRichTextPreview
            ariaLabel="Exact publication content"
            className="bg-background"
            tagOptions={[]}
            value={parseBundleDocument(bundle.tiptapJson)}
          />
          <p className="text-muted-foreground text-xs">
            {bundle.postType} · {bundle.audienceMode}
            {bundle.acknowledgementRequired
              ? " · acknowledgement required"
              : ""}
          </p>
        </ReviewSection>
        <ReviewSection label="Readers and exclusions">
          <p className="text-sm">
            Effective readers:{" "}
            {formatValues(bundle.effectiveReaderIds, "pending server review")}
          </p>
          <p className="text-sm">
            Mandatory readers:{" "}
            {formatValues(bundle.mandatoryReaderIds, "pending server review")}
          </p>
          <p className="text-sm">
            Requested readers: {formatValues(bundle.requestedReaderIds, "none")}
          </p>
          <p className="text-sm">
            Explicit exclusions:{" "}
            {formatValues(bundle.excludedReaderIds, "none")}
          </p>
        </ReviewSection>
        <ReviewSection label={`References (${references.length})`}>
          {references.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {references.map((reference) => (
                <li key={`${reference.entityKind}:${reference.entityId}`}>
                  {reference.label} · {reference.entityKind} · ID{" "}
                  {reference.entityId}
                  {reference.primary ? " · primary" : ""}
                  {reference.summary ? ` · ${reference.summary}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No references.</p>
          )}
        </ReviewSection>
        <ReviewSection label={`Assets (${assets.length})`}>
          <p className="text-sm">
            {assets.length > 0 ? assets.join(", ") : "No attached assets."}
          </p>
        </ReviewSection>
        <ReviewSection label={`Action Items (${actionItems.length})`}>
          {actionItems.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {actionItems.map((item) => (
                <li
                  className="space-y-1"
                  key={[
                    item.title,
                    item.assigneeWorkosUserId,
                    item.dueAt,
                    item.descriptionTiptapJson,
                  ].join(":")}
                >
                  <p>
                    {item.title} · assignee{" "}
                    {item.assigneeWorkosUserId ?? "unassigned"} ·{" "}
                    {item.effectiveAssignmentState ?? "pending server review"} ·{" "}
                    {item.priority ?? "no priority"}
                    {item.dueAt
                      ? ` · due ${new Date(item.dueAt).toLocaleString()}`
                      : ""}
                    {item.requiresAcceptance ? " · acceptance required" : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Plain description: {item.descriptionPlainText || "none"}
                  </p>
                  {item.descriptionTiptapJson ? (
                    <CollaborationRichTextPreview
                      ariaLabel={`Exact Action Item description for ${item.title}`}
                      className="bg-background"
                      tagOptions={[]}
                      value={parseBundleDocument(item.descriptionTiptapJson)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No Action Items.</p>
          )}
        </ReviewSection>
        <ReviewSection label={`Notification effects (${notifications.length})`}>
          {notifications.length > 0 ? (
            <p className="text-sm">
              {notifications
                .map(
                  (effect) =>
                    `${effect.channel}: ${effect.summary} → ${formatValues(effect.recipientWorkosUserIds, "none")}`
                )
                .join("; ")}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Default role-aware publication notifications only.
            </p>
          )}
        </ReviewSection>
        <ReviewSection
          label={`Other shared mutations (${sharedMutations.length})`}
        >
          {sharedMutations.length > 0 ? (
            <p className="text-sm">
              {sharedMutations
                .map(
                  (mutation) =>
                    `${mutation.operation} ${mutation.entityKind} ${mutation.entityId ? `(${mutation.entityId})` : "(no entity ID)"}: ${mutation.summary}`
                )
                .join("; ")}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              No additional shared mutations.
            </p>
          )}
        </ReviewSection>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="ghost">
            Back to editing
          </Button>
          <Button disabled={publishing} onClick={onApprove} type="button">
            {publishing ? "Publishing…" : "Approve exact bundle & publish"}
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}

function parseBundleDocument(tiptapJson: string): JSONContent {
  try {
    const document = JSON.parse(tiptapJson);
    return document && document.type === "doc"
      ? document
      : { content: [], type: "doc" };
  } catch {
    return { content: [], type: "doc" };
  }
}

function formatValues(values: string[] | undefined, fallback: string) {
  return values?.length ? values.join(", ") : fallback;
}

function ReviewSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0">
      <h4 className="font-medium text-xs uppercase tracking-wide">{label}</h4>
      {children}
    </section>
  );
}
