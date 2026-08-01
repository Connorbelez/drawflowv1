import type { JSONContent } from "@tiptap/react";
import { useQuery } from "convex/react";
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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import { CollaborationRichTextPreview } from "./CollaborationRichTextEditor.tsx";
import type { CollaborationDraftBundle } from "./model.ts";

export function BuildCollaborationApprovalReview({
  approveLabel,
  bundle,
  buildId,
  onApprove,
  onCancel,
  organizationId,
  publishing,
  scheduledFor,
}: {
  approveLabel?: string;
  bundle: CollaborationDraftBundle;
  buildId: Id<"activeBuilds">;
  onApprove: () => void;
  onCancel: () => void;
  organizationId: string;
  publishing: boolean;
  scheduledFor?: number;
}) {
  const references = bundle.references ?? [];
  const actionItems = bundle.actionItems ?? [];
  const assets = bundle.attachmentAssetIds ?? [];
  const notifications =
    bundle.effectiveNotificationEffects ?? bundle.notificationEffects ?? [];
  const sharedMutations = bundle.sharedMutations ?? [];
  const assetReview = useGovernedAssetReview({
    assetIds: assets,
    buildId,
    organizationId,
  });

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
          {scheduledFor ? (
            <p className="font-medium text-sm">
              Scheduled for {new Date(scheduledFor).toLocaleString()}
            </p>
          ) : null}
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
          <GovernedAssetReview
            buildId={buildId}
            organizationId={organizationId}
            review={assetReview}
          />
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
          <Button
            disabled={publishing || !assetReview.ready}
            onClick={onApprove}
            type="button"
          >
            {publishing
              ? scheduledFor
                ? "Scheduling…"
                : "Publishing…"
              : (approveLabel ?? "Approve exact bundle & publish")}
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}

interface GovernedAssetReviewState {
  assets: BuildCollaborationAssetSummary[];
  loading: boolean;
  ready: boolean;
  requestedCount: number;
}

function useGovernedAssetReview(input: {
  assetIds: string[];
  buildId: Id<"activeBuilds">;
  organizationId: string;
}): GovernedAssetReviewState {
  const statuses = useQuery(
    api.build_collaboration_assets.listBuildCollaborationAssetStatuses,
    input.assetIds.length > 0
      ? {
          assetIds: input.assetIds as Id<"buildCollaborationAssets">[],
          buildId: input.buildId,
          organizationId: input.organizationId,
        }
      : "skip"
  );
  const assets =
    statuses?.map((asset) => ({
      assetId: asset._id,
      contentHashSha256: asset.contentHashSha256,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      scanMessage: asset.scanMessage,
      scanState: asset.scanState,
      sizeBytes: asset.sizeBytes,
      state: asset.state,
      version: asset.version,
    })) ?? [];
  const ready =
    input.assetIds.length === 0 ||
    (statuses !== undefined &&
      assets.length === input.assetIds.length &&
      assets.every(
        (asset) =>
          asset.scanState === "clean" &&
          (asset.state === "available" || asset.state === "superseded")
      ));
  return {
    assets,
    loading: input.assetIds.length > 0 && statuses === undefined,
    ready,
    requestedCount: input.assetIds.length,
  };
}

function GovernedAssetReview({
  buildId,
  organizationId,
  review,
}: {
  buildId: Id<"activeBuilds">;
  organizationId: string;
  review: GovernedAssetReviewState;
}) {
  if (review.requestedCount === 0) {
    return <p className="text-sm">No attached assets.</p>;
  }
  if (review.loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Loading governed asset review…
      </p>
    );
  }
  if (review.assets.length !== review.requestedCount) {
    return (
      <p className="text-destructive text-sm">
        One or more governed assets are unavailable. Return to editing before
        publishing.
      </p>
    );
  }
  return (
    <BuildCollaborationAssetList
      assets={review.assets}
      buildId={buildId}
      organizationId={organizationId}
    />
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
