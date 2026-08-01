import { createOfflineDraftStore } from "#/lib/offline-draft-store.ts";
import type { SiteVisitStagedEvidence } from "./site-visit-evidence-staging.ts";
import type { SiteVisitLocationAttempt } from "./site-visit-token-route-model.ts";

const DATABASE_NAME = "drawflow-site-visit-drafts";

export interface PersistedSiteVisitStagedItem {
  evidence: SiteVisitStagedEvidence;
  file: Blob;
  fileLastModified: number;
  fileName: string;
  fileType: string;
  uploadedStorageId?: string;
}

export interface SiteVisitDraft {
  completionObserved: boolean | null;
  key: string;
  locationAttempt: SiteVisitLocationAttempt;
  prerequisiteAcknowledged: boolean;
  prerequisiteReason: string;
  qualityRating: string;
  recommendedOutcome: string;
  reportNotes: string;
  selectedTarget: string;
  stagedItems: PersistedSiteVisitStagedItem[];
  updatedAt: number;
  version: 1;
}

const siteVisitDraftStore = createOfflineDraftStore<SiteVisitDraft>({
  databaseName: DATABASE_NAME,
});

export function siteVisitDraftKey(input: {
  buildId: string;
  source: "demo" | "production";
  token: string;
}) {
  return `${input.source}:${input.buildId}:${input.token}`;
}

export function preventSiteVisitDraftUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = true;
}

export async function loadSiteVisitDraft(
  key: string
): Promise<SiteVisitDraft | null> {
  return await siteVisitDraftStore.load(key);
}

export async function saveSiteVisitDraft(draft: SiteVisitDraft): Promise<void> {
  await siteVisitDraftStore.save(draft);
}

export async function deleteSiteVisitDraft(key: string): Promise<void> {
  await siteVisitDraftStore.delete(key);
}
