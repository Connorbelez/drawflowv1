import type { JSONContent } from "@tiptap/react";
import {
  coerceSiteVisitGuidance,
  guidanceLinesToHtml,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import type { SiteVisitStagedEvidence } from "./site-visit-evidence-staging";

export function subscribeToConnectivity(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

export function readBrowserConnectivity() {
  return navigator.onLine;
}

export function readServerConnectivity() {
  return true;
}

export type VisitTarget = {
  _id: string;
  contractors?: VisitTargetContractor[];
  guidance?: {
    cameraAngles?: string | string[];
    whatToVerify?: string | string[];
  };
  guidanceSections?: VisitGuidanceSnapshotSection[];
  milestoneKey: string;
  milestoneName: string;
  milestoneOrder: number;
  submilestones: VisitSubmilestone[];
};

export interface VisitGuidanceSnapshotSection {
  buildSubmilestoneId: string;
  cameraAnglesTiptapJson: string;
  capturedAt: number;
  order: number;
  proposalSubmilestoneId: string;
  submilestoneKey: string;
  submilestoneName: string;
  whatToVerifyTiptapJson: string;
}

export type VisitSubmilestone =
  | string
  | {
      key: string;
      name: string;
    };

export type VisitTargetContractor = {
  _id: string;
  assignmentId?: string;
  name: string;
  role?: string;
  submilestoneKey?: string;
};

export type VisitFile = {
  _id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
  uploadedAt: number;
  url?: string | null;
};

export type VisitBuild = {
  address?: string;
  key: string;
  locationLatitude?: number;
  locationLongitude?: number;
  name: string;
  subtitle?: string;
};

export type VisitPermit = {
  _id?: string;
  fileName?: string;
  kind?: string;
  mimeType?: string;
  name?: string;
  sizeBytes?: number;
  storageUrl?: string | null;
  url?: string | null;
};

export type VisitRecord = {
  completedAt?: number;
  createdAt: number;
  milestoneKey: string;
  recommendedOutcome?: string;
  requestReason?: string;
  status: string;
  tokenConsumedAt?: number;
  tokenExpiresAt?: number;
};

export type ActiveVisitState = {
  available: true;
  build: VisitBuild;
  files: VisitFile[];
  permit?: VisitPermit | null;
  targets: VisitTarget[];
  visit: VisitRecord;
};

export type UnavailableVisitState = {
  available: false;
  build?: VisitBuild | null;
  files?: VisitFile[];
  permit?: VisitPermit | null;
  reason?:
    | "consumed"
    | "expired"
    | "guidance_sections_overflow"
    | "not_found"
    | null;
  status: "completed" | "expired" | "invalid";
  targets?: VisitTarget[];
  visit?: VisitRecord | null;
};

export type VisitState = ActiveVisitState | UnavailableVisitState;
export type DrawerKey = "location" | "scope" | "uploaded";

export type StagedItem = {
  evidence: SiteVisitStagedEvidence;
  file: File;
  uploadedStorageId?: string;
};

export type SubmittedSummary = {
  completedAt: number;
  fileCount: number;
  recommendation: string;
  totalBytes: number;
  visitId: string;
};

export type GuideSection = {
  id: string;
  value: string | JSONContent;
  title: string;
};

export const FALLBACK_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "fallback:visit-guidance",
    value: guidanceLinesToHtml([
      "No lender guidance was attached to this visit.",
      "Inspect only the assigned milestone scope and document any uncertainty in the field note.",
    ]),
    title: "Visit guidance",
  },
];

export function reportSubmissionBlockers({
  completionObserved,
  evidenceCount,
  hasReportNotes,
  locationAttempted,
  missingPermit,
  prerequisiteAcknowledged,
  prerequisiteReason,
  recommendedOutcome,
  uploadingCount,
}: {
  completionObserved: boolean | null;
  evidenceCount: number;
  hasReportNotes: boolean;
  locationAttempted: boolean;
  missingPermit: boolean;
  prerequisiteAcknowledged: boolean;
  prerequisiteReason: string;
  recommendedOutcome: string;
  uploadingCount: number;
}) {
  const blockers: string[] = [];
  if (uploadingCount > 0) {
    blockers.push(
      `Wait for ${uploadingCount} evidence upload${
        uploadingCount === 1 ? "" : "s"
      } to finish.`
    );
  }
  if (!hasReportNotes) {
    blockers.push(
      "Add a field note describing observed completion and exceptions."
    );
  }
  if (completionObserved === null) {
    blockers.push("Select whether completion was observed on site.");
  }
  if (!recommendedOutcome) {
    blockers.push("Select a recommendation for lender review.");
  }
  if (evidenceCount === 0) {
    blockers.push("Add at least one evidence photo or video.");
  }
  if (!locationAttempted) {
    blockers.push("Wait for the site location attempt to finish.");
  }
  if (missingPermit && !prerequisiteAcknowledged) {
    blockers.push("Acknowledge that the permit was unavailable.");
  }
  if (missingPermit && !prerequisiteReason.trim()) {
    blockers.push(
      "Add the alternate-verification reason for the missing permit."
    );
  }
  return blockers;
}

export function focusSiteVisitSection(id: string) {
  const section = document.getElementById(id);
  section?.focus({ preventScroll: true });
  section?.scrollIntoView({
    behavior:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    block: "start",
  });
}

export function deriveBuildCode(buildId: string, build?: VisitBuild | null) {
  const key = build?.key ?? buildId;
  if (/^bld[-_]/i.test(key)) {
    return key.toUpperCase().replaceAll("_", "-");
  }
  const match = key.match(/(\d{3,})/);
  return match
    ? `BLD-${match[1]}`
    : key.replace(/^demo-timeline-/, "BLD-").toUpperCase();
}

export function deriveAddress(build?: VisitBuild | null) {
  const storedAddress = build?.address?.trim();
  if (storedAddress) {
    return storedAddress;
  }
  const subtitle = build?.subtitle ?? "";
  const [address] = subtitle.split("·").map((part) => part.trim());
  return address || "Site address unavailable";
}

export function deriveStreetLine(build?: VisitBuild | null) {
  return (
    deriveAddress(build).split(",")[0]?.trim() || "Site address unavailable"
  );
}

export function deriveCityLine(build?: VisitBuild | null) {
  const address = deriveAddress(build);
  const [, ...localityParts] = address.split(",");
  return localityParts.join(",").trim() || "Municipality not recorded";
}

export function createEvidencePreviewUrl(file: Blob, mimeType: string) {
  if (
    !(mimeType.startsWith("image/") || mimeType.startsWith("video/")) ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  return URL.createObjectURL(file);
}

export function revokeEvidencePreviewUrl(previewUrl?: string) {
  if (previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(previewUrl);
  }
}

export function permitDisplayName(permit?: VisitPermit | null) {
  return permit?.fileName ?? permit?.name ?? "Build permit.pdf";
}

export function permitSourceUrl(permit?: VisitPermit | null) {
  return permit?.storageUrl ?? permit?.url ?? null;
}

export function targetCode(target: VisitTarget, fallbackIndex = 0) {
  return `M-${String(target.milestoneOrder || fallbackIndex + 1).padStart(2, "0")}`;
}

export function guidanceSectionsForTargets(
  targets: VisitTarget[]
): GuideSection[] {
  const sections = targets.flatMap((target, index) => {
    const code = targetCode(target, index);
    const snapshotSections = target.guidanceSections
      ?.slice()
      .sort((left, right) => left.order - right.order);
    if (snapshotSections && snapshotSections.length > 0) {
      return snapshotSections.flatMap((snapshot, snapshotIndex) => {
        const verification = snapshotRichTextValue(
          snapshot.whatToVerifyTiptapJson
        );
        const cameraAngles = snapshotRichTextValue(
          snapshot.cameraAnglesTiptapJson
        );
        const titlePrefix = `${code} · ${snapshot.submilestoneName}`;
        const snapshotIdentity =
          snapshot.buildSubmilestoneId ||
          snapshot.proposalSubmilestoneId ||
          snapshot.submilestoneKey ||
          `index-${snapshotIndex}`;
        const sectionPrefix = `${target._id}:snapshot:${snapshot.order}:${snapshotIdentity}`;
        return [
          {
            id: `${sectionPrefix}:verification`,
            value: verification,
            title: `${titlePrefix} — What to verify`,
          },
          {
            id: `${sectionPrefix}:camera-angles`,
            value: cameraAngles,
            title: `${titlePrefix} — Required photo angles`,
          },
        ].filter((section) => richTextValueHasContent(section.value));
      });
    }

    const label = shortMilestoneLabel(target.milestoneName);
    const guidance = normalizedGuidance(target);
    return [
      {
        id: `${target._id}:legacy:verification`,
        value: guidance.whatToVerify,
        title: `${code} · ${label} — What to verify`,
      },
      {
        id: `${target._id}:legacy:camera-angles`,
        value: guidance.cameraAngles,
        title: `${code} · ${label} — Required photo angles`,
      },
    ].filter((section) => richTextValueHasContent(section.value));
  });

  return sections.length > 0 ? sections : FALLBACK_GUIDE_SECTIONS;
}

export function snapshotRichTextValue(value: string): string | JSONContent {
  try {
    const parsed = JSON.parse(value) as JSONContent;
    if (parsed && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    // A malformed historical section should not prevent the rest of the Visit
    // packet from rendering. The backend validates new snapshots; this keeps
    // the token route tolerant of older data.
  }
  return "";
}

export function richTextValueHasContent(value: string | JSONContent) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return tiptapValueHasSemanticContent(value);
}

export function tiptapValueHasSemanticContent(node: JSONContent): boolean {
  if (typeof node.text === "string" && node.text.trim()) {
    return true;
  }
  if (
    node.type === "image" &&
    node.attrs &&
    typeof node.attrs.src === "string" &&
    node.attrs.src.trim()
  ) {
    return true;
  }
  if (node.type === "horizontalRule") {
    return true;
  }
  return node.content?.some(tiptapValueHasSemanticContent) ?? false;
}

export function normalizedGuidance(target: VisitTarget): SiteVisitGuidanceHtml {
  const guidance = coerceSiteVisitGuidance(target.guidance);
  if (guidance.whatToVerify || guidance.cameraAngles) {
    return guidance;
  }
  return {
    cameraAngles: guidanceLinesToHtml([
      "Wide shot showing the full milestone work area.",
      "Close-up of the highest-risk connection, fixture, or finish.",
    ]),
    whatToVerify: guidanceLinesToHtml(
      (visitSubmilestones(target).length
        ? visitSubmilestones(target).map((submilestone) => submilestone.name)
        : [target.milestoneName]
      )
        .slice(0, 4)
        .map(
          (checkpoint) =>
            `${checkpoint} is complete, visible, and consistent with the approved scope.`
        )
    ),
  };
}

export function shortMilestoneLabel(value: string) {
  const [first] = value.split("&");
  return first?.trim() || value;
}

export function subCode(target: VisitTarget, index: number) {
  return `${String(target.milestoneOrder || 1).padStart(2, "0")}${String.fromCharCode(
    97 + index
  )}`;
}

export function targetLabel(
  targets: VisitTarget[],
  milestoneKey?: string,
  submilestoneKey?: string
) {
  if (!milestoneKey) {
    return "Visit-wide";
  }
  const target = targets.find((item) => item.milestoneKey === milestoneKey);
  if (!target) {
    return milestoneKey;
  }
  if (!submilestoneKey) {
    return targetCode(target);
  }
  const submilestone = visitSubmilestones(target).find(
    (item) => item.key === submilestoneKey
  );
  return submilestone
    ? `${targetCode(target)} · ${submilestone.name}`
    : `${targetCode(target)} · ${submilestoneKey}`;
}

export function visitSubmilestones(
  target: VisitTarget
): Array<{ key: string; name: string }> {
  const snapshotSections = target.guidanceSections
    ?.slice()
    .sort((left, right) => left.order - right.order);
  if (snapshotSections && snapshotSections.length > 0) {
    return snapshotSections.map((section) => ({
      key: section.submilestoneKey,
      name: section.submilestoneName,
    }));
  }
  return target.submilestones.map((submilestone) =>
    typeof submilestone === "string"
      ? { key: slugifyTargetKey(submilestone), name: submilestone }
      : submilestone
  );
}

export function encodeMilestoneVisitTarget(milestoneKey: string) {
  return `milestone:${milestoneKey}`;
}

export function encodeSubmilestoneVisitTarget(
  milestoneKey: string,
  submilestoneKey: string
) {
  return `submilestone:${milestoneKey}:${submilestoneKey}`;
}

export function parseSelectedVisitTarget(value: string) {
  if (value.startsWith("milestone:")) {
    return { milestoneKey: value.slice("milestone:".length) };
  }
  if (value.startsWith("submilestone:")) {
    const rest = value.slice("submilestone:".length);
    const [milestoneKey, ...subParts] = rest.split(":");
    return {
      milestoneKey: milestoneKey || undefined,
      submilestoneKey: subParts.join(":") || undefined,
    };
  }
  return value === "visit-wide" ? {} : { milestoneKey: value };
}

export function contractorRatingTargetsForScope(
  targets: VisitTarget[],
  milestoneKey?: string,
  submilestoneKey?: string
) {
  const matches = targets.flatMap((target) => {
    if (milestoneKey && target.milestoneKey !== milestoneKey) {
      return [];
    }
    return (target.contractors ?? [])
      .filter(
        (contractor) =>
          !submilestoneKey ||
          contractor.submilestoneKey === submilestoneKey ||
          !contractor.submilestoneKey
      )
      .map((contractor) => ({
        ...contractor,
        milestoneKey: target.milestoneKey,
        submilestoneKey: contractor.submilestoneKey ?? submilestoneKey,
      }));
  });
  const seen = new Set<string>();
  return matches.filter((target) => {
    const key = `${target._id}:${target.milestoneKey}:${
      target.submilestoneKey ?? ""
    }`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function contractorIdsForEvidenceTarget(
  targets: VisitTarget[],
  milestoneKey?: string,
  submilestoneKey?: string
) {
  return contractorRatingTargetsForScope(targets, milestoneKey, submilestoneKey)
    .map((target) => target._id)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

export function parseQualityRating(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return;
  }
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

export function slugifyTargetKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "scope"
  );
}

export function formatVisitTime(value?: number) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatVisitDay(value?: number) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
  })
    .format(new Date(value))
    .replace(",", "")
    .toUpperCase();
}
