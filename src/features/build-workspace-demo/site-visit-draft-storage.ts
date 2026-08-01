import type { SiteVisitStagedEvidence } from "./site-visit-evidence-staging.ts";
import type { SiteVisitLocationAttempt } from "./site-visit-token-route-model.ts";

const DATABASE_NAME = "drawflow-site-visit-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

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
  const database = await openDraftDatabase();
  if (!database) {
    return null;
  }
  try {
    return await new Promise<SiteVisitDraft | null>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () =>
        resolve((request.result as SiteVisitDraft | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveSiteVisitDraft(draft: SiteVisitDraft): Promise<void> {
  const database = await openDraftDatabase();
  if (!database) {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore(STORE_NAME).put(draft);
    });
  } finally {
    database.close();
  }
}

export async function deleteSiteVisitDraft(key: string): Promise<void> {
  const database = await openDraftDatabase();
  if (!database) {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore(STORE_NAME).delete(key);
    });
  } finally {
    database.close();
  }
}

async function openDraftDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
