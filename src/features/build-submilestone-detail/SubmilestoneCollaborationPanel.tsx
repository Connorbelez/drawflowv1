"use client";

import type { JSONContent } from "@tiptap/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  FileUp,
  History,
  MessageCircle,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  ActionItemCommentCard,
  ActionItemStructurePanel,
  ActivityHistory,
  BuildActionItemDetailSheet,
  type BuildActionItemStructureCapabilities,
  RevisionHistory,
  type BuildActionItemDetail,
  type VisibleBuildActionItemDetail,
} from "../build-collaboration/BuildActionItemDetailSheet.tsx";
import {
  BuildCollaborationAssetList,
  type BuildCollaborationAssetSummary,
} from "../build-collaboration/BuildCollaborationAssetList.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "../build-collaboration/BuildCollaborationMutationGate.tsx";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "../build-collaboration/build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextEditor,
  type CollaborationTagOption,
  type CollaborationTagReference,
} from "../build-collaboration/CollaborationRichTextEditor.tsx";
import {
  emptyDocument,
  plainTextFromDocument,
  toBackendReferenceKind,
  toCollaborationTagOption,
} from "../build-collaboration/model.ts";

type RawCollaborationTagOption = FunctionReturnType<
  typeof api.build_collaboration_references.listBuildCollaborationTagOptions
>[number];

type CollaborationState = {
  code?: string;
  message?: string;
  state: "available" | "degraded";
};

interface SubmilestoneCollaborationPanelProps {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  canonicalWorkflowRevision: number;
  collaboration: CollaborationState;
  collaborationCapabilities?: {
    addAttachment?: boolean;
    comment?: boolean;
  };
  companionActionItemId?: Id<"buildActionItems">;
  structureCapabilities?: BuildActionItemStructureCapabilities;
  evidencePackageRevision?: number;
  evidenceRequirements?: Array<{
    label: string;
    requirementKey: string;
  }>;
  expectedReviewRound?: number;
  milestoneKey: string;
  organizationId: string;
  onReferenceOpen?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  readOnly: boolean;
  submilestoneKey: string;
  superseded: boolean;
  promoteEvidenceAllowed?: boolean;
}

export function SubmilestoneCollaborationPanel({
  buildId,
  buildSubmilestoneId,
  canonicalWorkflowRevision,
  collaboration,
  collaborationCapabilities,
  companionActionItemId,
  structureCapabilities,
  evidencePackageRevision,
  evidenceRequirements = [],
  expectedReviewRound,
  milestoneKey,
  organizationId,
  onReferenceOpen,
  readOnly,
  submilestoneKey,
  superseded,
  promoteEvidenceAllowed = false,
}: SubmilestoneCollaborationPanelProps) {
  const companionReadOnly =
    readOnly || superseded || collaboration.state !== "available";
  const detail = useQuery(
    api.build_action_item_details.getBuildActionItemDetail,
    collaboration.state === "available" && companionActionItemId
      ? { actionItemId: companionActionItemId, buildId, organizationId }
      : "skip",
  ) as BuildActionItemDetail | undefined;
  const rawTagOptions = useQuery(
    api.build_collaboration_references.listBuildCollaborationTagOptions,
    collaboration.state === "available" ? { buildId, organizationId } : "skip",
  ) as RawCollaborationTagOption[] | undefined;
  const tagOptions = useMemo<CollaborationTagOption[]>(
    () => (rawTagOptions ?? []).map(toCollaborationTagOption),
    [rawTagOptions],
  );

  if (collaboration.state === "degraded") {
    return <CollaborationDegradedPanel collaboration={collaboration} />;
  }
  if (!companionActionItemId) {
    return <CompanionUnavailablePanel />;
  }
  if (detail === undefined) {
    return <CompanionLoadingPanel />;
  }
  if (detail.state === "revoked") {
    return <CompanionUnavailablePanel />;
  }

  return (
    <VisibleSubmilestoneCollaboration
      buildId={buildId}
      buildSubmilestoneId={buildSubmilestoneId}
      canonicalWorkflowRevision={canonicalWorkflowRevision}
      collaborationCapabilities={collaborationCapabilities}
      detail={detail}
      evidencePackageRevision={evidencePackageRevision}
      evidenceRequirements={evidenceRequirements}
      expectedReviewRound={expectedReviewRound}
      milestoneKey={milestoneKey}
      organizationId={organizationId}
      onReferenceOpen={onReferenceOpen}
      promoteEvidenceAllowed={promoteEvidenceAllowed}
      readOnly={companionReadOnly}
      structureCapabilities={structureCapabilities}
      submilestoneKey={submilestoneKey}
      superseded={superseded}
      tagOptions={tagOptions}
    />
  );
}

function VisibleSubmilestoneCollaboration({
  buildId,
  buildSubmilestoneId,
  canonicalWorkflowRevision,
  collaborationCapabilities,
  detail,
  evidencePackageRevision,
  evidenceRequirements,
  expectedReviewRound,
  milestoneKey,
  organizationId,
  onReferenceOpen,
  promoteEvidenceAllowed,
  readOnly,
  structureCapabilities,
  submilestoneKey,
  superseded,
  tagOptions,
}: {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  canonicalWorkflowRevision: number;
  collaborationCapabilities?: {
    addAttachment?: boolean;
    comment?: boolean;
  };
  detail: VisibleBuildActionItemDetail;
  evidencePackageRevision?: number;
  evidenceRequirements: Array<{ label: string; requirementKey: string }>;
  expectedReviewRound?: number;
  milestoneKey: string;
  organizationId: string;
  onReferenceOpen?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  promoteEvidenceAllowed: boolean;
  readOnly: boolean;
  structureCapabilities?: BuildActionItemStructureCapabilities;
  submilestoneKey: string;
  superseded: boolean;
  tagOptions: CollaborationTagOption[];
}) {
  const canComment = collaborationCapabilities?.comment ?? true;
  const canAddAttachment =
    collaborationCapabilities?.addAttachment ?? canComment;
  const collaborationReadOnly = readOnly || !canComment;
  const addComment = useBuildCollaborationMutation(
    api.build_action_item_details.addBuildActionItemComment,
  );
  const toggleCommentReaction = useBuildCollaborationMutation(
    api.build_action_item_details.toggleBuildActionItemCommentReaction,
  );
  const beginUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload,
  );
  const registerUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage,
  );
  const finalizeAndScan = useBuildCollaborationAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload,
  );
  const abandonAssets = useBuildCollaborationMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets,
  );
  const promoteEvidence = useBuildCollaborationMutation(
    api.production_proposals.promoteActiveBuildDiscussionAttachmentToEvidence,
  );
  const [commentHtml, setCommentHtml] = useState("");
  const [commentDocument, setCommentDocument] = useState<JSONContent>(
    emptyDocument(),
  );
  const [commentReferences, setCommentReferences] = useState<
    CollaborationTagReference[]
  >([]);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [replyingTo, setReplyingTo] = useState<
    Id<"buildActionItemComments"> | undefined
  >();
  const [commentBusy, setCommentBusy] = useState(false);
  const [promotionBusy, setPromotionBusy] = useState<string | null>(null);
  const [promotionRequirementKey, setPromotionRequirementKey] = useState(
    evidenceRequirements.length === 1
      ? evidenceRequirements[0]?.requirementKey ?? ""
      : "",
  );
  const [childHistory, setChildHistory] = useState<
    Id<"buildActionItems">[]
  >([]);
  const commandKeys = useRef(new Map<string, string>());

  useEffect(() => {
    commandKeys.current.clear();
    setCommentHtml("");
    setCommentDocument(emptyDocument());
    setCommentReferences([]);
    setCommentFiles([]);
    setReplyingTo(undefined);
    setPromotionBusy(null);
    setPromotionRequirementKey("");
    setChildHistory([]);
  }, [
    buildId,
    buildSubmilestoneId,
    detail.item.actionItemId,
    milestoneKey,
    submilestoneKey,
  ]);

  useEffect(() => {
    setPromotionRequirementKey((current) => {
      if (evidenceRequirements.length === 1) {
        return evidenceRequirements[0]?.requirementKey ?? "";
      }
      return evidenceRequirements.some(
        (requirement) => requirement.requirementKey === current,
      )
        ? current
        : "";
    });
  }, [
    evidenceRequirements
      .map((requirement) => requirement.requirementKey)
      .join("\u001f"),
  ]);

  const childTarget = childHistory.at(-1);
  const childIndex = childTarget
    ? childHistory.length - 1
    : -1;
  const openChild = (actionItemId: Id<"buildActionItems">) => {
    setChildHistory((current) =>
      current.at(-1) === actionItemId
        ? current
        : [...current.slice(0, childIndex + 1), actionItemId],
    );
  };
  const closeChild = () => setChildHistory([]);
  const openReference = (reference: CollaborationTagReference) => {
    if (reference.kind === "action_item") {
      if (onReferenceOpen) {
        const url = new URL(globalThis.location.href);
        url.searchParams.set("focus", `actionItem:${reference.id}`);
        onReferenceOpen({
          entityId: reference.id,
          entityKind: "actionItem",
          href: `${url.pathname}${url.search}`,
        });
        return;
      }
      openChild(reference.id as Id<"buildActionItems">);
    }
  };
  const childBack = () => {
    setChildHistory((current) => current.slice(0, -1));
  };
  const childForward = () => undefined;
  const commandKey = (scope: string) => {
    const existing = commandKeys.current.get(scope);
    if (existing) {
      return existing;
    }
    const generated = `${scope}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    commandKeys.current.set(scope, generated);
    return generated;
  };

  const comment = async () => {
    if (
      collaborationReadOnly ||
      !(plainTextFromDocument(commentDocument) || commentFiles.length)
    ) {
      return;
    }
    setCommentBusy(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(commentFiles, {
        abandonAssets,
        beginUpload,
        buildId,
        contextKind: "actionItem",
        contextRecordId: detail.item.actionItemId,
        finalizeAndScan,
        organizationId,
        registerUpload,
      });
      await addComment({
        actionItemId: detail.item.actionItemId,
        attachmentAssetIds: uploadedAssetIds,
        buildId,
        organizationId,
        parentCommentId: replyingTo,
        references: commentReferences.map((reference, index) => ({
          entityId: reference.id,
          entityKind: toBackendReferenceKind(reference.kind),
          label: reference.label,
          primary: index === 0,
          summary: reference.summary,
        })),
        tiptapJson: JSON.stringify(commentDocument),
      });
      setCommentDocument(emptyDocument());
      setCommentHtml("");
      setCommentReferences([]);
      setCommentFiles([]);
      setReplyingTo(undefined);
      toast.success(replyingTo ? "Reply added." : "Comment added.");
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId,
        organizationId,
        reason: "Sub-milestone companion comment failed after asset upload.",
      });
      toast.error(
        error instanceof Error ? error.message : "Unable to add comment.",
      );
    } finally {
      setCommentBusy(false);
    }
  };

  const promote = async (asset: BuildCollaborationAssetSummary) => {
    if (
      readOnly ||
      !promoteEvidenceAllowed ||
      (asset.scanState && asset.scanState !== "clean") ||
      asset.state !== "available" ||
      promotionBusy
    ) {
      return;
    }
    const selectedRequirementKey =
      promotionRequirementKey || evidenceRequirements[0]?.requirementKey;
    if (!selectedRequirementKey) {
      toast.error("No canonical Evidence requirement is available.");
      return;
    }
    setPromotionBusy(asset.assetId);
    try {
      await promoteEvidence({
        assetId: asset.assetId,
        buildId,
        evidenceKey: `companion-${asset.assetId}-${asset.version}`,
        expectedPackageRevision: evidencePackageRevision ?? 0,
        expectedRevision: canonicalWorkflowRevision,
        expectedReviewRound: expectedReviewRound ?? 0,
        idempotencyKey: commandKey(
          `promote:${asset.assetId}:${asset.version}:${selectedRequirementKey}`,
        ),
        label: asset.fileName,
        milestoneKey,
        requirementKey: selectedRequirementKey,
        submilestoneKey,
        tag: "Completion evidence",
        workosOrganizationId: organizationId,
      });
      toast.success("Discussion attachment promoted to canonical Evidence.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to promote this attachment to Evidence.",
      );
    } finally {
      setPromotionBusy(null);
    }
  };

  const parentComments = detail.comments.filter(
    (entry) => !entry.parentCommentId,
  );
  const promotionAssets = Array.from(
    new Map(
      [
        ...detail.attachments,
        ...detail.comments.flatMap((entry) => entry.attachments),
      ].map((asset) => [asset.assetId, asset] as const),
    ).values(),
  ) as BuildCollaborationAssetSummary[];

  return (
    <div className="space-y-5" data-testid="submilestone-collaboration-panel">
      <Frame>
        <FramePanel className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Generated companion</Badge>
            <Badge variant="outline">Canonical-first</Badge>
            <span className="text-muted-foreground text-xs">
              Revision {detail.item.currentRevision}
            </span>
          </div>
          <p className="text-sm">
            Coordinate this Sub-milestone here. Canonical execution, Evidence,
            and review state remain authoritative in the other tabs.
          </p>
          <p className="text-muted-foreground text-xs" role="note">
            Structure is informational in V1 and does not gate canonical
            workflow.
          </p>
          {superseded ? (
            <p className="text-warning-foreground text-xs">
              This companion is historical. Collaboration changes are disabled.
            </p>
          ) : null}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <FileUp aria-hidden="true" className="size-4 text-primary" />
            <div>
              <h3 className="font-semibold text-base leading-snug">
                Companion attachments
              </h3>
              <p className="text-muted-foreground text-xs">
                Governed collaboration files stay here until explicitly
                promoted to canonical Evidence.
              </p>
            </div>
          </div>
          <BuildCollaborationAssetList
            assets={promotionAssets}
            buildId={buildId}
            organizationId={organizationId}
          />
          {promoteEvidenceAllowed && promotionAssets.length > 0 ? (
            <div className="space-y-2">
              {evidenceRequirements.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Canonical Evidence has no available requirement for promotion
                  yet.
                </p>
              ) : null}
              {evidenceRequirements.length > 1 ? (
                <NativeSelect
                  aria-label="Evidence requirement for promotion"
                  disabled={readOnly}
                  onChange={(event) =>
                    setPromotionRequirementKey(event.target.value)
                  }
                  value={promotionRequirementKey}
                >
                  <NativeSelectOption value="">
                    Select Evidence requirement
                  </NativeSelectOption>
                  {evidenceRequirements.map((requirement) => (
                    <NativeSelectOption
                      key={requirement.requirementKey}
                      value={requirement.requirementKey}
                    >
                      {requirement.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {promotionAssets.map((asset) => (
                  <Card key={`promote-${asset.assetId}`}>
                    <CardPanel className="flex items-center justify-between gap-3 p-3">
                      <span className="min-w-0 truncate text-xs">
                        {asset.fileName}
                      </span>
                      <Button
                        disabled={
                          readOnly ||
                          promotionBusy !== null ||
                          !(
                            promotionRequirementKey ||
                            evidenceRequirements[0]?.requirementKey
                          ) ||
                          asset.state !== "available" ||
                          (asset.scanState !== undefined &&
                            asset.scanState !== "clean")
                        }
                        onClick={() => void promote(asset)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {promotionBusy === asset.assetId
                          ? "Promoting…"
                          : "Promote to Evidence"}
                      </Button>
                    </CardPanel>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <MessageCircle
              aria-hidden="true"
              className="size-4 text-primary"
            />
            <h3 className="font-semibold text-base leading-snug">
              Discussion
            </h3>
            <Badge className="ml-auto" variant="outline">
              {detail.comments.length}
            </Badge>
          </div>
          {parentComments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No discussion yet. Add the field context that should travel with
              this Sub-milestone.
            </p>
          ) : (
            parentComments.map((entry) => (
              <div className="space-y-2" key={entry.commentId}>
                <ActionItemCommentCard
                  buildId={buildId}
                  entry={entry}
                  onReact={async (reaction) => {
                    await toggleCommentReaction({
                      actionItemId: detail.item.actionItemId,
                      buildId,
                      commentId: entry.commentId,
                      organizationId,
                      reaction,
                    });
                  }}
                  onReferenceOpen={openReference}
                  onReply={() => setReplyingTo(entry.commentId)}
                  organizationId={organizationId}
                  readOnly={collaborationReadOnly}
                  tagOptions={tagOptions}
                />
                {detail.comments
                  .filter((reply) => reply.parentCommentId === entry.commentId)
                  .map((reply) => (
                    <div className="ml-5 border-l pl-3" key={reply.commentId}>
                      <ActionItemCommentCard
                        buildId={buildId}
                        entry={reply}
                        onReact={async (reaction) => {
                          await toggleCommentReaction({
                            actionItemId: detail.item.actionItemId,
                            buildId,
                            commentId: reply.commentId,
                            organizationId,
                            reaction,
                          });
                        }}
                        onReferenceOpen={openReference}
                        onReply={() => setReplyingTo(entry.commentId)}
                        organizationId={organizationId}
                        readOnly={collaborationReadOnly}
                        tagOptions={tagOptions}
                      />
                    </div>
                  ))}
              </div>
            ))
          )}
          {replyingTo ? (
            <div className="flex items-center justify-between bg-muted px-3 py-2 text-xs">
              <span>Replying in thread</span>
              <Button
                onClick={() => setReplyingTo(undefined)}
                size="xs"
                type="button"
                variant="ghost"
              >
                Cancel reply
              </Button>
            </div>
          ) : null}
          {collaborationReadOnly ? null : (
            <CollaborationRichTextEditor
              ariaLabel="Comment on Sub-milestone companion"
              editorMinHeightClass="[&_.ProseMirror]:min-h-24"
              onChange={(nextHtml, nextReferences) => {
                setCommentHtml(nextHtml);
                setCommentReferences(nextReferences);
              }}
              onDocumentChange={setCommentDocument}
              placeholder="Add field context. Type @ to reference Build work."
              tagOptions={tagOptions}
              value={commentHtml}
            />
          )}
          {collaborationReadOnly || !canAddAttachment ? null : (
            <Input
              aria-label="Attach files to Sub-milestone companion comment"
              multiple
              nativeInput
              onChange={(event) =>
                setCommentFiles(Array.from(event.target.files ?? []))
              }
              type="file"
            />
          )}
          {collaborationReadOnly ? null : (
            <Button disabled={commentBusy} onClick={() => void comment()} size="sm">
              {commentBusy
                ? "Publishing…"
                : replyingTo
                  ? "Add reply"
                  : "Add comment"}
            </Button>
          )}
        </FramePanel>
      </Frame>

      <ActionItemStructurePanel
        capabilities={structureCapabilities}
        buildId={buildId}
        detail={detail}
        onReferenceOpen={openReference}
        organizationId={organizationId}
        overrideReason=""
        readOnly={readOnly}
        tagOptions={tagOptions}
      />

      <Frame>
        <FramePanel className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4 text-primary" />
            <h3 className="font-semibold text-base leading-snug">
              Companion history
            </h3>
          </div>
          <RevisionHistory detail={detail} />
          <Separator />
          <ActivityHistory detail={detail} />
        </FramePanel>
      </Frame>

      <BuildActionItemDetailSheet
        buildId={buildId}
        canGoBack={childIndex > 0}
        canGoForward={false}
        onGoBack={childBack}
        onGoForward={childForward}
        onOpenChange={(open) => {
          if (!open) {
            closeChild();
          }
        }}
        onReferenceOpen={openReference}
        open={Boolean(childTarget)}
        organizationId={organizationId}
        readOnly={readOnly}
        tagOptions={tagOptions}
        target={childTarget ? { actionItemId: childTarget, kind: "detail" } : null}
      />
    </div>
  );
}

function CollaborationDegradedPanel({
  collaboration,
}: {
  collaboration: CollaborationState;
}) {
  return (
    <Frame
      aria-live="polite"
      data-testid="submilestone-collaboration-degraded"
      role="status"
    >
      <FramePanel className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-4 text-warning"
          />
          <div className="space-y-1">
            <p className="font-medium">
              Generated collaboration companion unavailable
            </p>
            <p className="text-muted-foreground">
              Canonical facts remain available in the other tabs.
            </p>
          </div>
        </div>
        <Separator />
        <div className="space-y-1">
          <p>
            {collaboration.message ?? "Collaboration companion is unavailable."}
          </p>
          <p className="break-all font-mono text-muted-foreground text-xs">
            Code: {collaboration.code ?? "COLLABORATION_DEGRADED"}
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function CompanionLoadingPanel() {
  return (
    <Frame aria-live="polite" role="status">
      <FramePanel className="text-muted-foreground text-sm">
        Loading generated companion collaboration…
      </FramePanel>
    </Frame>
  );
}

function CompanionUnavailablePanel() {
  return (
    <Frame aria-live="polite" role="status">
      <FramePanel className="space-y-2 text-sm">
        <p className="font-medium">Companion collaboration unavailable</p>
        <p className="text-muted-foreground">
          The canonical Sub-milestone remains available in the other tabs.
        </p>
      </FramePanel>
    </Frame>
  );
}
