"use client";

import type { JSONContent } from "@tiptap/react";
import {
  useQuery,
} from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type BuildCollaborationAssetSummary,
} from "./BuildCollaborationAssetList.tsx";
import {
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";
import "./build-collaboration.css";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";
import {
  type BuildCollaborationOfflineDraft,
  buildCollaborationOfflineDraftKey,
  deleteBuildCollaborationOfflineDraft,
  filesFromBuildCollaborationOfflineDraft,
  loadBuildCollaborationOfflineDraft,
  saveBuildCollaborationOfflineDraft,
} from "./build-collaboration-offline-drafts.ts";
import {
  type CollaborationTagReference,
} from "./CollaborationRichTextEditor.tsx";
import {
  type AudienceMode,
  type CollaborationDraftBundle,
  type CollaborationDraftSummary,
  composerActionItems,
  emptyDocument,
  escapeHtml,
  type PostType,
  parseDocument,
  parseDraftBundle,
  plainTextFromDocument,
  toBackendReferenceKind,
  toEditorReferenceKind,
} from "./model.ts";
import {
  buildCollaborationScopeArgs,
  type CollaborationPublicationBundle,
  ensureComposerDraftId,
  toLocalDateTimeInput,
} from "./build-collaboration-feed-contracts.ts";

export type BuildCollaborationComposerProps = Record<string, any>;

export function useBuildCollaborationComposer({
  activeBuildId,
  isOnline,
  organizationId,
  referenceByKey,
  sessionWorkosUserId,
}: BuildCollaborationComposerProps) {
  const drafts = useQuery(
    api.build_collaboration_drafts.listMyBuildCollaborationDrafts,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const draftIdentity = useQuery(
    api.build_collaboration_drafts.getMyBuildCollaborationDraftIdentity,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );
  const schedulingCapabilities = useQuery(
    api.build_collaboration_scheduling
      .getBuildCollaborationSchedulingCapabilities,
    buildCollaborationScopeArgs(activeBuildId, organizationId)
  );

  const saveDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.saveMyBuildCollaborationDraft
  );
  const publishHumanPost = useBuildCollaborationMutation(
    api.build_collaboration.approveAndPublishBuildCollaborationBundle
  );
  const publishDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.approveAndPublishBuildCollaborationDraft
  );
  const discardDraft = useBuildCollaborationMutation(
    api.build_collaboration_drafts.discardMyBuildCollaborationDraft
  );
  const scheduleDraft = useBuildCollaborationMutation(
    api.build_collaboration_scheduling.approveAndScheduleBuildCollaborationDraft
  );
  const beginAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerAssetUpload = useBuildCollaborationMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScanAsset = useBuildCollaborationAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useBuildCollaborationMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerExtrasOpen, setComposerExtrasOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("update");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("build_wide");
  const [requestedReaderIds, setRequestedReaderIds] = useState<string[]>([]);
  const [html, setHtml] = useState("");
  const [document, setDocument] = useState<JSONContent>(emptyDocument());
  const [references, setReferences] = useState<CollaborationTagReference[]>([]);
  const [actionTitle, setActionTitle] = useState("");
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [attachmentAssetIds, setAttachmentAssetIds] = useState<
    Id<"buildCollaborationAssets">[]
  >([]);
  const composerAssetStatuses = useQuery(
    api.build_collaboration_assets.listBuildCollaborationAssetStatuses,
    attachmentAssetIds.length > 0 && organizationId
      ? {
          assetIds: attachmentAssetIds,
          buildId: activeBuildId,
          organizationId,
        }
      : "skip"
  );
  const composerAssetStatusById = new Map(
    (composerAssetStatuses ?? []).map((asset) => [asset._id, asset])
  );
  const composerAssets: BuildCollaborationAssetSummary[] =
    attachmentAssetIds.map((assetId) => {
      const asset = composerAssetStatusById.get(assetId);
      return asset
        ? {
            assetId: asset._id,
            contentHashSha256: asset.contentHashSha256,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            scanMessage: asset.scanMessage,
            scanState: asset.scanState,
            sizeBytes: asset.sizeBytes,
            state: asset.state,
            version: asset.version,
          }
        : {
            assetId,
            fileName: "Unavailable governed attachment",
            mimeType: "Metadata unavailable",
            sizeBytes: 0,
            state: "rejected",
            version: 1,
          };
    });
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [editingHumanDraftId, setEditingHumanDraftId] =
    useState<Id<"buildCollaborationDrafts"> | null>(null);
  const [editingHumanDraftRevision, setEditingHumanDraftRevision] = useState<
    number | null
  >(null);
  const [scheduledForInput, setScheduledForInput] = useState("");
  const [offlineCapturedAt, setOfflineCapturedAt] = useState<number | null>(
    null
  );
  const [offlineDraft, setOfflineDraft] =
    useState<BuildCollaborationOfflineDraft | null>(null);
  const [draftConflictMessage, setDraftConflictMessage] = useState<
    string | null
  >(null);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "error" | "idle" | "saved" | "saving"
  >("idle");
  const [reviewingDraftId, setReviewingDraftId] =
    useState<Id<"buildCollaborationDrafts"> | null>(null);
  const offlineDraftKey =
    organizationId && sessionWorkosUserId
      ? buildCollaborationOfflineDraftKey({
          buildId: activeBuildId,
          organizationId,
          workosUserId: sessionWorkosUserId,
        })
      : null;
  useEffect(() => {
    let active = true;
    if (!offlineDraftKey) {
      setOfflineDraft(null);
      return;
    }
    loadBuildCollaborationOfflineDraft(offlineDraftKey)
      .then((draft) => {
        if (active) {
          setOfflineDraft(draft);
        }
      })
      .catch(() => {
        if (active) {
          toast.error("Unable to open the private offline draft store.");
        }
      });
    return () => {
      active = false;
    };
  }, [offlineDraftKey]);
  const latestEditingDraft = editingHumanDraftId
    ? drafts?.find((draft) => draft._id === editingHumanDraftId)
    : undefined;
  const latestEditingDraftBundle = latestEditingDraft
    ? parseDraftBundle(latestEditingDraft.bundleJson)
    : null;

  const resetComposer = () => {
    setHtml("");
    setDocument(emptyDocument());
    setReferences([]);
    setActionTitle("");
    setAttachmentAssetIds([]);
    setComposerFiles([]);
    setAcknowledgementRequired(false);
    setRequestedReaderIds([]);
    setPostType("update");
    setAudienceMode("build_wide");
    setEditingHumanDraftId(null);
    setEditingHumanDraftRevision(null);
    setScheduledForInput("");
    setOfflineCapturedAt(null);
    setDraftConflictMessage(null);
    setAutosaveStatus("idle");
    setComposerExtrasOpen(false);
    setComposerOpen(false);
  };

  const buildComposerBundle = (
    assets = attachmentAssetIds
  ): CollaborationPublicationBundle | null => {
    const plainText = plainTextFromDocument(document);
    if (!plainText) {
      return null;
    }
    return {
      acknowledgementRequired,
      actionItems: composerActionItems(actionTitle),
      attachmentAssetIds: assets,
      audienceMode,
      excludedReaderIds: [],
      notificationEffects: [],
      plainText,
      postType,
      references: references.map((reference, index) => ({
        entityId: reference.id,
        entityKind: toBackendReferenceKind(reference.kind),
        label: reference.label,
        primary:
          index ===
          references.findIndex((candidate) => candidate.kind !== "participant"),
        summary: reference.summary,
      })),
      requestedReaderIds: audienceMode === "custom" ? requestedReaderIds : [],
      sharedMutations: [],
      tiptapJson: JSON.stringify(document),
    };
  };

  const reportComposerFailure = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    if (message.includes("Draft revision conflict")) {
      setDraftConflictMessage(message);
    }
    toast.error(message);
  };

  const hasVerifiedServerDraftIdentity = () => {
    if (
      !(sessionWorkosUserId && draftIdentity) ||
      draftIdentity.workosUserId !== sessionWorkosUserId
    ) {
      toast.error(
        "Your authenticated collaboration identity is still being verified."
      );
      return false;
    }
    return true;
  };

  const preserveConflictedComposer = async (
    error: unknown,
    bundle: CollaborationPublicationBundle | null
  ) => {
    const message = error instanceof Error ? error.message : "";
    if (
      !(
        message.includes("Draft revision conflict") &&
        bundle &&
        offlineDraftKey
      )
    ) {
      return;
    }
    const capturedAt = offlineCapturedAt ?? Date.now();
    try {
      const preserved = await saveBuildCollaborationOfflineDraft({
        bundle,
        capturedAt,
        draftId: editingHumanDraftId ?? undefined,
        expectedRevision: editingHumanDraftRevision ?? undefined,
        files: composerFiles,
        key: offlineDraftKey,
        scheduledFor: scheduledForInput
          ? new Date(scheduledForInput).getTime()
          : undefined,
      });
      setOfflineCapturedAt(capturedAt);
      setOfflineDraft(preserved);
    } catch {
      toast.error(
        "The server rejected the stale revision and the private device copy could not be refreshed. Keep this composer open while resolving the conflict."
      );
    }
  };

  const autosaveBundle = buildComposerBundle();
  const autosaveFingerprint = autosaveBundle
    ? JSON.stringify({
        bundle: autosaveBundle,
        files: composerFiles.map((file) => ({
          lastModified: file.lastModified,
          name: file.name,
          size: file.size,
          type: file.type,
        })),
        scheduledForInput,
      })
    : "";
  const lastAutosavedFingerprintRef = useRef("");
  const autosaveInFlightRef = useRef(false);
  const autosaveNowRef = useRef<() => Promise<void>>(async () => undefined);
  autosaveNowRef.current = async () => {
    if (
      !(
        autosaveBundle &&
        autosaveFingerprint &&
        offlineDraftKey &&
        organizationId
      ) ||
      autosaveInFlightRef.current ||
      autosaveFingerprint === lastAutosavedFingerprintRef.current
    ) {
      return;
    }
    autosaveInFlightRef.current = true;
    setAutosaveStatus("saving");
    const capturedAt = Date.now();
    try {
      const privateDraft = await saveBuildCollaborationOfflineDraft({
        bundle: autosaveBundle,
        capturedAt,
        draftId: editingHumanDraftId ?? undefined,
        expectedRevision: editingHumanDraftRevision ?? undefined,
        files: composerFiles,
        key: offlineDraftKey,
        scheduledFor: scheduledForInput
          ? new Date(scheduledForInput).getTime()
          : undefined,
      });
      setOfflineCapturedAt(capturedAt);
      if (!isOnline) {
        setOfflineDraft(privateDraft);
      }
      if (
        isOnline &&
        sessionWorkosUserId &&
        draftIdentity?.workosUserId === sessionWorkosUserId
      ) {
        const saved = await saveDraft({
          ...autosaveBundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId ?? undefined,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          offlineCapturedAt: capturedAt,
          organizationId,
          preparedByAgent: false,
          scheduledFor: scheduledForInput
            ? new Date(scheduledForInput).getTime()
            : undefined,
        });
        setEditingHumanDraftId(saved.draftId);
        setEditingHumanDraftRevision(saved.revision);
      }
      lastAutosavedFingerprintRef.current = autosaveFingerprint;
      setAutosaveStatus("saved");
    } catch (error) {
      await preserveConflictedComposer(error, autosaveBundle);
      setAutosaveStatus("error");
    } finally {
      autosaveInFlightRef.current = false;
    }
  };
  useEffect(() => {
    if (!(composerOpen && autosaveFingerprint) || publishing) {
      return;
    }
    const timer = window.setTimeout(() => {
      void autosaveNowRef.current();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveFingerprint, composerOpen, publishing]);
  useEffect(() => {
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") {
        void autosaveNowRef.current();
      }
    };
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    return () =>
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
  }, []);

  const publishComposerPost = async () => {
    if (!isOnline) {
      toast.error("Reconnect before publishing. Offline work stays private.");
      return;
    }
    if (!(buildComposerBundle() && organizationId) || publishing) {
      toast.error("Write an update before publishing.");
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    setPublishing(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(
        composerFiles,
        {
          abandonAssets,
          beginUpload: beginAssetUpload,
          buildId: activeBuildId,
          contextKind: editingHumanDraftId ? "draft" : "composer",
          contextRecordId: editingHumanDraftId ?? undefined,
          finalizeAndScan: finalizeAndScanAsset,
          organizationId,
          registerUpload: registerAssetUpload,
        }
      );
      const bundle = buildComposerBundle([
        ...new Set([...attachmentAssetIds, ...uploadedAssetIds]),
      ]);
      if (!bundle) {
        throw new Error("Write an update before publishing.");
      }
      if (editingHumanDraftId) {
        const saved = await saveDraft({
          ...bundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          offlineCapturedAt: offlineCapturedAt ?? undefined,
          organizationId,
          preparedByAgent: false,
        });
        setEditingHumanDraftRevision(saved.revision);
        await publishDraft({
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          organizationId,
        });
      } else {
        await publishHumanPost({
          ...bundle,
          buildId: activeBuildId,
          organizationId,
        });
      }
      toast.success("Update published.");
      resetComposer();
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId: activeBuildId,
        organizationId,
        reason: "Post publication failed after asset upload.",
      });
      await preserveConflictedComposer(error, buildComposerBundle());
      reportComposerFailure(error, "Unable to publish update.");
    } finally {
      setPublishing(false);
    }
  };

  const removeComposerAttachment = async (
    asset: BuildCollaborationAssetSummary
  ) => {
    if (publishing) {
      return;
    }
    const retainedAssetIds = attachmentAssetIds.filter(
      (assetId) => assetId !== asset.assetId
    );
    setPublishing(true);
    try {
      if (editingHumanDraftId) {
        const bundle = buildComposerBundle(retainedAssetIds);
        if (!bundle) {
          throw new Error(
            "The draft content must remain valid while removing an attachment."
          );
        }
        const saved = await saveDraft({
          ...bundle,
          buildId: activeBuildId,
          draftId: editingHumanDraftId,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          organizationId,
          preparedByAgent: false,
        });
        setEditingHumanDraftRevision(saved.revision);
      } else {
        await abandonGovernedCollaborationAssets({
          abandonAssets,
          assetIds: [asset.assetId],
          buildId: activeBuildId,
          organizationId,
          reason: "Removed from the unpublished composer.",
        });
      }
      setAttachmentAssetIds(retainedAssetIds);
      toast.success(`${asset.fileName} removed.`);
    } catch (error) {
      reportComposerFailure(error, "Unable to remove the attachment.");
    } finally {
      setPublishing(false);
    }
  };

  const persistComposerDraft = async (
    input: { scheduledFor?: number } = {}
  ) => {
    if (!organizationId) {
      throw new Error("The Build organization is unavailable.");
    }
    const bundle = buildComposerBundle();
    if (!bundle) {
      throw new Error("Write an update before saving the draft.");
    }
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      let saved = await ensureComposerDraftId({
        activeBuildId,
        bundle,
        editingHumanDraftId,
        editingHumanDraftRevision,
        offlineCapturedAt,
        organizationId,
        saveDraft,
        scheduledFor: input.scheduledFor,
      });
      uploadedAssetIds = await uploadGovernedCollaborationAssets(
        composerFiles,
        {
          abandonAssets,
          beginUpload: beginAssetUpload,
          buildId: activeBuildId,
          contextKind: "draft",
          contextRecordId: saved.draftId,
          finalizeAndScan: finalizeAndScanAsset,
          organizationId,
          registerUpload: registerAssetUpload,
        }
      );
      if (uploadedAssetIds.length > 0) {
        const finalBundle = buildComposerBundle([
          ...new Set([...attachmentAssetIds, ...uploadedAssetIds]),
        ]);
        if (!finalBundle) {
          throw new Error("The collaboration draft became invalid.");
        }
        saved = await saveDraft({
          ...finalBundle,
          buildId: activeBuildId,
          draftId: saved.draftId,
          expectedRevision: saved.revision,
          offlineCapturedAt: offlineCapturedAt ?? undefined,
          organizationId,
          preparedByAgent: false,
          scheduledFor: input.scheduledFor,
        });
      }
      return saved;
    } catch (error) {
      await abandonGovernedCollaborationAssets({
        abandonAssets,
        assetIds: uploadedAssetIds,
        buildId: activeBuildId,
        organizationId,
        reason: "Draft persistence failed after asset upload.",
      });
      throw error;
    }
  };

  const saveCurrentDraft = async () => {
    if (!(organizationId && !publishing)) {
      return;
    }
    const bundle = buildComposerBundle();
    if (!bundle) {
      toast.error("Write an update before saving the draft.");
      return;
    }
    if (!isOnline) {
      if (!offlineDraftKey) {
        toast.error("Your private offline draft identity is still loading.");
        return;
      }
      const capturedAt = offlineCapturedAt ?? Date.now();
      try {
        const savedOfflineDraft = await saveBuildCollaborationOfflineDraft({
          bundle,
          capturedAt,
          draftId: editingHumanDraftId ?? undefined,
          expectedRevision: editingHumanDraftRevision ?? undefined,
          files: composerFiles,
          key: offlineDraftKey,
          scheduledFor: scheduledForInput
            ? new Date(scheduledForInput).getTime()
            : undefined,
        });
        setOfflineCapturedAt(capturedAt);
        setOfflineDraft(savedOfflineDraft);
        toast.success("Private offline draft saved on this device.");
      } catch (error) {
        reportComposerFailure(error, "Unable to save the offline draft.");
      }
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    setPublishing(true);
    try {
      await persistComposerDraft();
      if (offlineDraftKey) {
        await deleteBuildCollaborationOfflineDraft(offlineDraftKey);
      }
      setOfflineDraft(null);
      toast.success("Draft saved.");
      resetComposer();
    } catch (error) {
      await preserveConflictedComposer(error, bundle);
      reportComposerFailure(error, "Unable to save draft.");
    } finally {
      setPublishing(false);
    }
  };

  const prepareScheduledPublication = async () => {
    if (!(isOnline && schedulingCapabilities?.canSchedule)) {
      toast.error("Reconnect with a coordinating role before scheduling.");
      return;
    }
    if (!(postType === "update" || postType === "announcement")) {
      toast.error("Only Updates and Announcements can be scheduled.");
      return;
    }
    if (!hasVerifiedServerDraftIdentity()) {
      return;
    }
    const scheduledFor = new Date(scheduledForInput).getTime();
    if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() + 60_000) {
      toast.error("Choose a publication time at least one minute from now.");
      return;
    }
    setPublishing(true);
    try {
      const saved = await persistComposerDraft({ scheduledFor });
      if (offlineDraftKey) {
        await deleteBuildCollaborationOfflineDraft(offlineDraftKey);
      }
      setOfflineDraft(null);
      setReviewingDraftId(saved.draftId);
      resetComposer();
      toast.success("Private draft ready for exact human approval.");
    } catch (error) {
      await preserveConflictedComposer(error, buildComposerBundle());
      reportComposerFailure(error, "Unable to prepare the scheduled draft.");
    } finally {
      setPublishing(false);
    }
  };

  const loadBundleIntoComposer = (bundle: CollaborationDraftBundle) => {
    setAcknowledgementRequired(bundle.acknowledgementRequired ?? false);
    setActionTitle(bundle.actionItems[0]?.title ?? "");
    setAttachmentAssetIds(
      (bundle.attachmentAssetIds ?? []) as Id<"buildCollaborationAssets">[]
    );
    setComposerFiles([]);
    setAudienceMode(bundle.audienceMode);
    setDocument(parseDocument(bundle.tiptapJson));
    setHtml(`<p>${escapeHtml(bundle.plainText)}</p>`);
    setPostType(bundle.postType);
    setReferences(
      bundle.references.map((reference) => {
        const option = referenceByKey.get(
          `${reference.entityKind}:${reference.entityId}`
        );
        return {
          eyebrow: option?.eyebrow ?? "Build reference",
          id: reference.entityId,
          kind: option?.kind ?? toEditorReferenceKind(reference.entityKind),
          label: reference.label,
          summary: reference.summary ?? option?.summary ?? "",
        };
      })
    );
    setRequestedReaderIds(bundle.requestedReaderIds);
    setComposerExtrasOpen(
      Boolean(
        bundle.acknowledgementRequired ||
          bundle.actionItems.length > 0 ||
          (bundle.attachmentAssetIds?.length ?? 0) > 0
      )
    );
    setDraftConflictMessage(null);
    setComposerOpen(true);
  };

  const loadDraftIntoComposer = (draft: CollaborationDraftSummary) => {
    const bundle = parseDraftBundle(draft.bundleJson);
    if (!bundle) {
      toast.error("This draft is invalid and cannot be opened.");
      return;
    }
    loadBundleIntoComposer(bundle);
    setEditingHumanDraftId(draft._id);
    setEditingHumanDraftRevision(draft.revision);
    setOfflineCapturedAt(draft.offlineCapturedAt ?? null);
    setScheduledForInput(
      draft.scheduledFor ? toLocalDateTimeInput(draft.scheduledFor) : ""
    );
  };

  const loadOfflineDraftIntoComposer = () => {
    if (!offlineDraft) {
      return;
    }
    loadBundleIntoComposer(offlineDraft.bundle);
    setComposerFiles(filesFromBuildCollaborationOfflineDraft(offlineDraft));
    setOfflineCapturedAt(offlineDraft.capturedAt);
    setEditingHumanDraftId(
      (offlineDraft.draftId as Id<"buildCollaborationDrafts"> | undefined) ??
        null
    );
    setEditingHumanDraftRevision(offlineDraft.expectedRevision ?? null);
    setScheduledForInput(
      offlineDraft.scheduledFor
        ? toLocalDateTimeInput(offlineDraft.scheduledFor)
        : ""
    );
  };

  const composerExtraCount =
    attachmentAssetIds.length +
    composerFiles.length +
    Number(Boolean(actionTitle.trim())) +
    Number(Boolean(scheduledForInput)) +
    Number(acknowledgementRequired);


  return {
    actionTitle,
    acknowledgementRequired,
    attachmentAssetIds,
    audienceMode,
    autosaveStatus,
    composerAssets,
    composerExtraCount,
    composerFiles,
    composerExtrasOpen,
    composerOpen,
    document,
    discardDraft,
    draftConflictMessage,
    drafts,
    editingHumanDraftId,
    html,
    latestEditingDraft,
    latestEditingDraftBundle,
    loadDraftIntoComposer,
    loadOfflineDraftIntoComposer,
    offlineDraft,
    postType,
    prepareScheduledPublication,
    publishComposerPost,
    publishDraft,
    publishing,
    removeComposerAttachment,
    requestedReaderIds,
    resetComposer,
    reviewingDraftId,
    saveCurrentDraft,
    scheduleDraft,
    schedulingCapabilities,
    scheduledForInput,
    setAcknowledgementRequired,
    setActionTitle,
    setAudienceMode,
    setComposerExtrasOpen,
    setComposerFiles,
    setComposerOpen,
    setDocument,
    setHtml,
    setPostType,
    setPublishing,
    setReferences,
    setRequestedReaderIds,
    setReviewingDraftId,
    setScheduledForInput,
  };
}
