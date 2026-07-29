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
  const notifications = bundle.notificationEffects ?? [];
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
          <p className="text-sm">{bundle.plainText}</p>
          <p className="text-muted-foreground text-xs">
            {bundle.postType} · {bundle.audienceMode}
            {bundle.acknowledgementRequired
              ? " · acknowledgement required"
              : ""}
          </p>
        </ReviewSection>
        <ReviewSection label="Readers and exclusions">
          <p className="text-sm">
            Requested readers: {bundle.requestedReaderIds.length || "none"}
          </p>
          <p className="text-sm">
            Explicit exclusions: {bundle.excludedReaderIds?.length || "none"}
          </p>
        </ReviewSection>
        <ReviewSection label={`References (${references.length})`}>
          {references.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {references.map((reference) => (
                <li key={`${reference.entityKind}:${reference.entityId}`}>
                  {reference.label} · {reference.entityKind}
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
            <p className="text-sm">
              {actionItems.map((item) => item.title).join("; ")}
            </p>
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
                    `${effect.channel}: ${effect.summary} (${effect.recipientWorkosUserIds.length} recipients)`
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
                    `${mutation.operation} ${mutation.entityKind}: ${mutation.summary}`
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
