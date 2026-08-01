import { createOfflineDraftStore } from "#/lib/offline-draft-store.ts";

import type { CollaborationDraftBundle } from "./model.ts";

interface PersistedCollaborationFile {
  blob: Blob;
  lastModified: number;
  name: string;
  type: string;
}

export interface BuildCollaborationOfflineDraft {
  bundle: CollaborationDraftBundle;
  capturedAt: number;
  draftId?: string;
  expectedRevision?: number;
  files: PersistedCollaborationFile[];
  key: string;
  scheduledFor?: number;
  updatedAt: number;
  version: 1;
}

const collaborationDraftStore =
  createOfflineDraftStore<BuildCollaborationOfflineDraft>({
    databaseName: "drawflow-build-collaboration-drafts",
  });

export function buildCollaborationOfflineDraftKey(input: {
  buildId: string;
  organizationId: string;
  workosUserId: string;
}) {
  return `${input.organizationId}:${input.buildId}:${input.workosUserId}`;
}

export async function saveBuildCollaborationOfflineDraft(input: {
  bundle: CollaborationDraftBundle;
  capturedAt: number;
  draftId?: string;
  expectedRevision?: number;
  files: File[];
  key: string;
  scheduledFor?: number;
}) {
  const draft: BuildCollaborationOfflineDraft = {
    bundle: input.bundle,
    capturedAt: input.capturedAt,
    draftId: input.draftId,
    expectedRevision: input.expectedRevision,
    files: input.files.map((file) => ({
      blob: file,
      lastModified: file.lastModified || input.capturedAt,
      name: file.name,
      type: file.type,
    })),
    key: input.key,
    scheduledFor: input.scheduledFor,
    updatedAt: Date.now(),
    version: 1,
  };
  await collaborationDraftStore.save(draft);
  return draft;
}

export async function loadBuildCollaborationOfflineDraft(key: string) {
  return await collaborationDraftStore.load(key);
}

export async function deleteBuildCollaborationOfflineDraft(key: string) {
  await collaborationDraftStore.delete(key);
}

export function filesFromBuildCollaborationOfflineDraft(
  draft: BuildCollaborationOfflineDraft
) {
  return draft.files.map(
    (file) =>
      new File([file.blob], file.name, {
        lastModified: file.lastModified,
        type: file.type,
      })
  );
}
