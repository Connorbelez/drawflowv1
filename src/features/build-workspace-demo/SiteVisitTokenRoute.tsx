import type { JSONContent } from "@tiptap/react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import {
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Hammer,
  LoaderCircle,
  Lock,
  MapPin,
  Play,
  Upload,
  Video,
  Wrench,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import type { DeviceCaptureKind } from "#/components/device-capture-dialog.tsx";
import { InteractiveSiteMap } from "#/components/maps/interactive-site-map.tsx";
import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { evidenceMimeTypeForFile } from "#/lib/evidence-image-normalization.ts";
import {
  richTextHtmlHasText,
  richTextHtmlToPlainText,
} from "#/lib/rich-text-html.ts";
import {
  coerceSiteVisitGuidance,
  guidanceLinesToHtml,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import { api } from "../../../convex/_generated/api";
import {
  deleteSiteVisitDraft,
  loadSiteVisitDraft,
  preventSiteVisitDraftUnload,
  saveSiteVisitDraft,
  siteVisitDraftKey,
} from "./site-visit-draft-storage";
import {
  assertPackageWithinCap,
  buildStagedEvidence,
  fetchSiteVisitEvidenceWithTimeout,
  packageTotalBytes,
  type SiteVisitStagedEvidence,
  uploadSiteVisitStagedEvidence,
} from "./site-visit-evidence-staging";
import {
  formatSiteVisitBytes,
  locationAttemptFromError,
  locationAttemptFromPosition,
  resolveSiteVisitUnavailableCopy,
  type SiteVisitLocationAttempt,
} from "./site-visit-token-route-model";

const tokenConvex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const DeviceCaptureDialog = lazy(() =>
  import("#/components/device-capture-dialog.tsx").then((module) => ({
    default: module.DeviceCaptureDialog,
  }))
);

type VisitTarget = {
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

interface VisitGuidanceSnapshotSection {
  buildSubmilestoneId: string;
  cameraAnglesTiptapJson: string;
  capturedAt: number;
  order: number;
  proposalSubmilestoneId: string;
  submilestoneKey: string;
  submilestoneName: string;
  whatToVerifyTiptapJson: string;
}

type VisitSubmilestone =
  | string
  | {
      key: string;
      name: string;
    };

type VisitTargetContractor = {
  _id: string;
  assignmentId?: string;
  name: string;
  role?: string;
  submilestoneKey?: string;
};

type VisitFile = {
  _id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
  uploadedAt: number;
  url?: string | null;
};

type VisitBuild = {
  address?: string;
  key: string;
  locationLatitude?: number;
  locationLongitude?: number;
  name: string;
  subtitle?: string;
};

type VisitPermit = {
  _id?: string;
  fileName?: string;
  kind?: string;
  mimeType?: string;
  name?: string;
  sizeBytes?: number;
  storageUrl?: string | null;
  url?: string | null;
};

type VisitRecord = {
  completedAt?: number;
  createdAt: number;
  milestoneKey: string;
  recommendedOutcome?: string;
  requestReason?: string;
  status: string;
  tokenConsumedAt?: number;
  tokenExpiresAt?: number;
};

type ActiveVisitState = {
  available: true;
  build: VisitBuild;
  files: VisitFile[];
  permit?: VisitPermit | null;
  targets: VisitTarget[];
  visit: VisitRecord;
};

type UnavailableVisitState = {
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

type VisitState = ActiveVisitState | UnavailableVisitState;
type DrawerKey = "location" | "scope" | "uploaded";

type StagedItem = {
  evidence: SiteVisitStagedEvidence;
  file: File;
  uploadedStorageId?: string;
};

type SubmittedSummary = {
  completedAt: number;
  fileCount: number;
  recommendation: string;
  totalBytes: number;
  visitId: string;
};

type GuideSection = {
  id: string;
  value: string | JSONContent;
  title: string;
};

const FALLBACK_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "fallback:visit-guidance",
    value: guidanceLinesToHtml([
      "No lender guidance was attached to this visit.",
      "Inspect only the assigned milestone scope and document any uncertainty in the field note.",
    ]),
    title: "Visit guidance",
  },
];

export function SiteVisitTokenRoute({
  buildId,
  initialVisitState,
  siteVisitToken,
  source = "demo",
}: {
  buildId: string;
  initialVisitState?: VisitState;
  siteVisitToken: string;
  source?: "demo" | "production";
}) {
  useEffect(() => {
    document.body.classList.add("bg-bg-base");
    return () => document.body.classList.remove("bg-bg-base");
  }, []);

  return (
    <ConvexProvider client={tokenConvex}>
      <SiteVisitTokenRouteContent
        buildId={buildId}
        initialVisitState={initialVisitState}
        siteVisitToken={siteVisitToken}
        source={source}
      />
    </ConvexProvider>
  );
}

function SiteVisitTokenRouteContent({
  buildId,
  initialVisitState,
  siteVisitToken,
  source,
}: {
  buildId: string;
  initialVisitState?: VisitState;
  siteVisitToken: string;
  source: "demo" | "production";
}) {
  const visitApi =
    source === "production"
      ? (api as any).production_proposals.getActiveBuildSiteVisitByToken
      : api.demo_drawflow.demo_getSiteVisitByToken;
  const liveVisitState = useQuery(visitApi, {
    buildId,
    token: siteVisitToken,
  }) as VisitState | undefined;
  const visitState = liveVisitState ?? initialVisitState;
  const generateUploadUrl = useMutation(
    source === "production"
      ? (api as any).production_proposals.generateActiveBuildSiteVisitUploadUrl
      : api.demo_drawflow.demo_generateSiteVisitUploadUrl
  );
  const registerFile = useMutation(
    source === "production"
      ? (api as any).production_proposals.registerActiveBuildSiteVisitFile
      : api.demo_drawflow.demo_registerSiteVisitFile
  );
  const markOpened = useMutation(
    source === "production"
      ? (api as any).production_proposals.markActiveBuildSiteVisitTokenOpened
      : api.demo_drawflow.demo_markSiteVisitTokenOpened
  );
  const submitReport = useMutation(
    source === "production"
      ? (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport
      : api.demo_drawflow.demo_submitTokenizedSiteVisitReport
  );
  const requestReplacement = useMutation(
    source === "production"
      ? (api as any).production_proposals
          .requestActiveBuildSiteVisitReplacementLink
      : (api as any).demo_drawflow.demo_requestSiteVisitReplacementLink
  );
  const openedRef = useRef(false);
  const automaticLocationAttemptRef = useRef(false);
  const localEditsStartedRef = useRef(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("visit-wide");
  const [reportNotes, setReportNotes] = useState("");
  const [completionObserved, setCompletionObserved] = useState<boolean | null>(
    null
  );
  const [recommendedOutcome, setRecommendedOutcome] = useState("");
  const [qualityRating, setQualityRating] = useState("");
  const [locationAttempt, setLocationAttempt] =
    useState<SiteVisitLocationAttempt>({
      attempted: false,
      failureReason: "Location verification was not attempted.",
      permissionOutcome: "not_requested",
      verified: false,
    });
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [prerequisiteAcknowledged, setPrerequisiteAcknowledged] =
    useState(false);
  const [prerequisiteReason, setPrerequisiteReason] = useState("");
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKey | null>(null);
  const [error, setError] = useState("");
  const [requestingReplacement, setRequestingReplacement] = useState(false);
  const [replacementError, setReplacementError] = useState("");
  const [replacementReason, setReplacementReason] = useState(
    "A new site visit is required for this Build."
  );
  const [replacementReference, setReplacementReference] = useState("");
  const [submittedSummary, setSubmittedSummary] =
    useState<SubmittedSummary | null>(null);
  const [now, setNow] = useState(Date.now());
  const isDesktopLayout = useMediaQuery("lg");
  const draftKey = siteVisitDraftKey({
    buildId,
    source,
    token: siteVisitToken,
  });
  const [draftPersistenceEnabled, setDraftPersistenceEnabled] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "loading" | "saved" | "saving" | "error"
  >("loading");
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateConnectivity = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadSiteVisitDraft(draftKey)
      .then((draft) => {
        if (!active) {
          return;
        }
        if (draft && !localEditsStartedRef.current) {
          setCompletionObserved(draft.completionObserved);
          setLocationAttempt(draft.locationAttempt);
          setPrerequisiteAcknowledged(draft.prerequisiteAcknowledged);
          setPrerequisiteReason(draft.prerequisiteReason);
          setQualityRating(draft.qualityRating);
          setRecommendedOutcome(draft.recommendedOutcome);
          setReportNotes(draft.reportNotes);
          setSelectedTarget(draft.selectedTarget);
          setStagedItems(
            draft.stagedItems.map((item) => ({
              evidence: {
                ...item.evidence,
                previewUrl: createEvidencePreviewUrl(item.file, item.fileType),
              },
              file: new File([item.file], item.fileName, {
                lastModified: item.fileLastModified,
                type: item.fileType,
              }),
              uploadedStorageId: item.uploadedStorageId,
            }))
          );
        }
        setDraftPersistenceEnabled(true);
        setDraftStatus("saved");
      })
      .catch(() => {
        if (active) {
          setDraftPersistenceEnabled(true);
          setDraftStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftPersistenceEnabled) {
      return;
    }
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      void saveSiteVisitDraft({
        completionObserved,
        key: draftKey,
        locationAttempt,
        prerequisiteAcknowledged,
        prerequisiteReason,
        qualityRating,
        recommendedOutcome,
        reportNotes,
        selectedTarget,
        stagedItems: stagedItems.map((item) => {
          const { previewUrl: _previewUrl, ...evidence } = item.evidence;
          return {
            evidence,
            file: item.file,
            fileLastModified: item.file.lastModified,
            fileName: item.file.name,
            fileType: item.file.type,
            uploadedStorageId: item.uploadedStorageId,
          };
        }),
        updatedAt: Date.now(),
        version: 1,
      })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("error"));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    completionObserved,
    draftKey,
    draftPersistenceEnabled,
    locationAttempt,
    prerequisiteAcknowledged,
    prerequisiteReason,
    qualityRating,
    recommendedOutcome,
    reportNotes,
    selectedTarget,
    stagedItems,
  ]);

  useEffect(() => {
    if (!(draftPersistenceEnabled && stagedItems.length > 0)) {
      return;
    }
    window.addEventListener("beforeunload", preventSiteVisitDraftUnload);
    return () =>
      window.removeEventListener("beforeunload", preventSiteVisitDraftUnload);
  }, [draftPersistenceEnabled, stagedItems.length]);

  useEffect(
    () => () => {
      uploadAbortControllerRef.current?.abort();
    },
    []
  );

  const requestNewLink = async () => {
    setReplacementError("");
    setRequestingReplacement(true);
    try {
      const result = (await requestReplacement({
        buildId,
        reason: replacementReason,
        token: siteVisitToken,
      })) as { reference: string; requested: true };
      setReplacementReference(result.reference);
    } catch {
      setReplacementError(
        "The replacement-link request could not be recorded. Contact the requester and share the Build identity shown below."
      );
    } finally {
      setRequestingReplacement(false);
    }
  };

  useEffect(() => {
    if (
      openedRef.current ||
      !visitState?.available ||
      visitState.visit.status !== "requested"
    ) {
      return;
    }
    openedRef.current = true;
    void markOpened({ buildId, token: siteVisitToken }).catch(() => {
      openedRef.current = false;
    });
  }, [buildId, markOpened, siteVisitToken, visitState]);

  const activeBuild = visitState?.available ? visitState.build : null;
  const captureCurrentLocation =
    useCallback(async (): Promise<SiteVisitLocationAttempt> => {
      setCheckingLocation(true);
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        const attempt = locationAttemptFromError({ code: 2 }, Date.now());
        setLocationAttempt(attempt);
        setCheckingLocation(false);
        return attempt;
      }
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const siteCoordinates =
              typeof activeBuild?.locationLatitude === "number" &&
              typeof activeBuild.locationLongitude === "number"
                ? {
                    latitude: activeBuild.locationLatitude,
                    longitude: activeBuild.locationLongitude,
                  }
                : null;
            const attempt = locationAttemptFromPosition(
              position.coords,
              Date.now(),
              siteCoordinates
            );
            setLocationAttempt(attempt);
            setCheckingLocation(false);
            resolve(attempt);
          },
          (locationError) => {
            const attempt = locationAttemptFromError(locationError, Date.now());
            setLocationAttempt(attempt);
            setCheckingLocation(false);
            resolve(attempt);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
        );
      });
    }, [activeBuild?.locationLatitude, activeBuild?.locationLongitude]);
  const verifyLocation = useCallback(() => {
    void captureCurrentLocation();
  }, [captureCurrentLocation]);

  useEffect(() => {
    if (automaticLocationAttemptRef.current || !visitState?.available) {
      return;
    }
    automaticLocationAttemptRef.current = true;
    verifyLocation();
  }, [verifyLocation, visitState]);

  if (visitState === undefined) {
    return (
      <MobileShell
        build={null}
        buildCode={deriveBuildCode(buildId)}
        status="loading"
        statusText="Loading"
        timeText="Resolving"
      >
        <OutcomeCard
          body="Resolving the tokenized visit packet."
          icon={<LoaderCircle className="size-6 animate-spin" />}
          title="Loading site visit"
          tone="neutral"
        />
      </MobileShell>
    );
  }

  if (submittedSummary) {
    const submittedBuild = visitState.build ?? initialVisitState?.build ?? null;
    return (
      <MobileShell
        build={submittedBuild}
        buildCode={deriveBuildCode(buildId, submittedBuild)}
        status="complete"
        statusText="Complete"
        timeText={`Submitted ${formatVisitTime(submittedSummary.completedAt)}`}
      >
        <OutcomeCard
          body={`Your report and ${submittedSummary.fileCount} evidence files are now visible to the lender admin. This token has been consumed.`}
          detailItems={[
            ["Visit ID", `SVT_${submittedSummary.visitId}`],
            [
              "Submitted",
              `${formatVisitTime(submittedSummary.completedAt)} · ${formatVisitDay(
                submittedSummary.completedAt
              )}`,
            ],
            ["Recommendation", submittedSummary.recommendation],
            [
              "Files stored",
              `${submittedSummary.fileCount} · ${formatSiteVisitBytes(
                submittedSummary.totalBytes
              )}`,
            ],
          ]}
          icon={<Check className="size-6" />}
          title="Site visit recorded"
          tone="success"
        />
      </MobileShell>
    );
  }

  if (!visitState.available) {
    const copy = resolveSiteVisitUnavailableCopy(visitState);
    const build = visitState.build ?? null;
    const consumed = visitState.reason === "consumed";
    const expired = visitState.reason === "expired";
    const detailItems: [string, string][] = consumed
      ? [
          ["Report status", "Submitted · read only"],
          [
            "Submitted",
            `${formatVisitTime(visitState.visit?.completedAt)} · ${formatVisitDay(visitState.visit?.completedAt)}`,
          ],
          ["Build", deriveBuildCode(buildId, build)],
          ["Milestone", visitState.visit?.milestoneKey ?? "Assigned visit"],
        ]
      : expired
        ? [
            [
              "Token issued",
              `${formatVisitTime(visitState.visit?.createdAt)} · ${formatVisitDay(visitState.visit?.createdAt)}`,
            ],
            [
              "Expired at",
              `${formatVisitTime(visitState.visit?.tokenExpiresAt)} · ${formatVisitDay(visitState.visit?.tokenExpiresAt)}`,
            ],
            ["Build", deriveBuildCode(buildId, build)],
            ["Reason", "Visit window elapsed"],
          ]
        : [
            ["Reason", "Build and assignment do not match"],
            ["Build", deriveBuildCode(buildId, build)],
            [
              "Next action",
              "Return to the assignment or contact the requester",
            ],
            ["Support", "ops@drawflow.app"],
          ];
    return (
      <MobileShell
        build={build}
        buildCode={deriveBuildCode(buildId, build)}
        status={consumed ? "complete" : "expired"}
        statusText={consumed ? "Complete" : expired ? "Expired" : "Invalid"}
        timeText={consumed ? "Read only" : "Token void"}
      >
        <OutcomeCard
          actions={
            copy.canRequestReplacement ? (
              <div className="mt-6 grid gap-3 border-t pt-5 text-left">
                {replacementReference ? (
                  <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
                    <p className="font-medium">New-link request recorded</p>
                    <p className="mt-1">
                      Reference {replacementReference}. The requester has an
                      auditable task to issue a separate link.
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="grid gap-2 text-sm">
                      Reason for another link
                      <textarea
                        className="min-h-20 rounded-md border bg-background p-2 text-foreground"
                        onChange={(event) =>
                          setReplacementReason(event.currentTarget.value)
                        }
                        value={replacementReason}
                      />
                    </label>
                    <Button
                      disabled={
                        requestingReplacement || !replacementReason.trim()
                      }
                      onClick={() => void requestNewLink()}
                      type="button"
                    >
                      {requestingReplacement ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ExternalLink />
                      )}
                      Request a new link
                    </Button>
                  </>
                )}
                {replacementError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {replacementError}
                  </p>
                ) : null}
              </div>
            ) : null
          }
          body={copy.body}
          detailItems={detailItems}
          icon={
            consumed ? (
              <CheckCircle2 className="size-6" />
            ) : expired ? (
              <Clock3 className="size-6" />
            ) : (
              <Lock className="size-6" />
            )
          }
          stamp={copy.stamp}
          title={copy.title}
          tone={consumed ? "neutral" : "danger"}
        />
      </MobileShell>
    );
  }

  const { build, files, permit, targets, visit } = visitState;
  const missingPrerequisites = permit ? [] : (["permit"] as const);
  const selectedScope = parseSelectedVisitTarget(selectedTarget);
  const selectedMilestoneKey = selectedScope.milestoneKey;
  const selectedSubmilestoneKey = selectedScope.submilestoneKey;
  const qualityRatingTargets = contractorRatingTargetsForScope(
    targets,
    selectedMilestoneKey,
    selectedSubmilestoneKey
  );
  const uploadedBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const stagedBytes = packageTotalBytes(
    stagedItems.map((item) => item.evidence)
  );
  const totalPackageBytes = uploadedBytes + stagedBytes;
  const expiresInMinutes = Math.max(
    0,
    Math.ceil(((visit.tokenExpiresAt ?? now) - now) / 60_000)
  );

  const stageSelectedFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) {
      return;
    }
    localEditsStartedRef.current = true;

    const nextItems = selectedFiles.map((file) => ({
      evidence: buildStagedEvidence({
        id:
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        mimeType: evidenceMimeTypeForFile(file),
        name: file.name,
        sizeBytes: file.size,
        targetMilestoneKey: selectedMilestoneKey,
        targetSubmilestoneKey: selectedSubmilestoneKey,
      }),
      file,
    }));
    for (const item of nextItems) {
      item.evidence.previewUrl = createEvidencePreviewUrl(
        item.file,
        item.evidence.mimeType
      );
    }

    try {
      const next = [...stagedItems, ...nextItems];
      assertPackageWithinCap(next.map((item) => item.evidence));
      setStagedItems(next);
      setError("");
    } catch (stageError) {
      setError(
        stageError instanceof Error
          ? stageError.message
          : "Unable to stage selected evidence."
      );
    }
  };

  const stageFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    stageSelectedFiles(selectedFiles);
  };

  const removeStagedItem = (id: string) => {
    if (uploadingCount > 0) {
      return;
    }
    const removedIndex = stagedItems.findIndex(
      (item) => item.evidence.id === id
    );
    const removedItem = stagedItems[removedIndex];
    if (!removedItem) {
      return;
    }
    toast.info("Evidence removed", {
      action: {
        label: "Undo",
        onClick: () =>
          setStagedItems((latest) => {
            const next = [...latest];
            next.splice(Math.min(removedIndex, next.length), 0, {
              ...removedItem,
              evidence: {
                ...removedItem.evidence,
                previewUrl: createEvidencePreviewUrl(
                  removedItem.file,
                  removedItem.evidence.mimeType
                ),
              },
            });
            return next;
          }),
      },
      description: `${removedItem.evidence.name} remains recoverable until this message closes.`,
    });
    revokeEvidencePreviewUrl(removedItem.evidence.previewUrl);
    setStagedItems((current) =>
      current.filter((item) => item.evidence.id !== id)
    );
  };

  const uploadStagedFiles = async (uploadLocationAttempt = locationAttempt) => {
    if (stagedItems.length === 0) {
      return true;
    }
    if (!isOnline) {
      toast.warning("Evidence queued on this device", {
        description:
          "Reconnect to upload. Your staged evidence and report draft remain saved locally.",
      });
      return false;
    }
    if (expiresInMinutes < 2) {
      toast.warning("Visit link expires too soon", {
        description:
          "Request a replacement link before starting this upload. Your draft remains saved on this device.",
      });
      return false;
    }
    setError("");
    setUploadingCount(stagedItems.length);
    try {
      await uploadSiteVisitStagedEvidence({
        buildId,
        generateUploadUrl,
        onUploadedItem: (uploadedItem) => {
          revokeEvidencePreviewUrl(uploadedItem.evidence.previewUrl);
          setUploadingCount((current) => Math.max(0, current - 1));
          setStagedItems((current) =>
            current.filter(
              (item) => item.evidence.id !== uploadedItem.evidence.id
            )
          );
        },
        onStorageUploaded: (uploadedItem, storageId) => {
          setStagedItems((current) =>
            current.map((item) =>
              item.evidence.id === uploadedItem.evidence.id
                ? { ...item, uploadedStorageId: storageId }
                : item
            )
          );
        },
        registerFile: (input) => {
          if (source !== "production") {
            const { clientEvidenceId: _clientEvidenceId, ...demoInput } = input;
            return registerFile(demoInput);
          }
          return registerFile({
            ...input,
            contractorIds: contractorIdsForEvidenceTarget(
              targets,
              input.targetMilestoneKey,
              input.targetSubmilestoneKey
            ),
            locationAttempt: uploadLocationAttempt,
          });
        },
        stagedItems,
        token: siteVisitToken,
        upload: async (url, file, mimeType) => {
          const controller = new AbortController();
          uploadAbortControllerRef.current = controller;
          try {
            return await fetchSiteVisitEvidenceWithTimeout({
              controller,
              file,
              mimeType,
              url,
            });
          } finally {
            if (uploadAbortControllerRef.current === controller) {
              uploadAbortControllerRef.current = null;
            }
          }
        },
      });
      setStagedItems([]);
      return true;
    } catch (uploadError) {
      if (
        uploadError instanceof DOMException &&
        uploadError.name === "AbortError"
      ) {
        setUploadingCount(0);
        return false;
      }
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload site visit evidence.";
      setError(message);
      setUploadingCount(0);
      toast.error("Evidence upload stopped", {
        description: `${message} Successfully uploaded files were preserved. Retry the remaining evidence.`,
      });
      return false;
    }
  };

  const cancelUpload = () => {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    setUploadingCount(0);
    toast.info("Upload cancelled", {
      description:
        "Remaining evidence is still saved on this device and can be retried.",
    });
  };

  const submissionBlockers = reportSubmissionBlockers({
    completionObserved,
    evidenceCount: files.length + stagedItems.length,
    hasReportNotes: richTextHtmlHasText(reportNotes),
    locationAttempted: locationAttempt.attempted,
    missingPermit: missingPrerequisites.length > 0,
    prerequisiteAcknowledged,
    prerequisiteReason,
    recommendedOutcome,
    uploadingCount,
  });

  const submit = async () => {
    setError("");
    if (submissionBlockers.length > 0) {
      toast.warning("Report not ready", {
        description: `${submissionBlockers.length} requirement${
          submissionBlockers.length === 1 ? "" : "s"
        } remain: ${submissionBlockers.join(" • ")}`,
        duration: 10_000,
      });
      return;
    }

    setSubmittingReport(true);
    try {
      const submissionLocationAttempt = await captureCurrentLocation();
      const stagedCount = stagedItems.length;
      if (stagedCount > 0) {
        const uploaded = await uploadStagedFiles(submissionLocationAttempt);
        if (!uploaded) {
          return;
        }
      }
      const rating = parseQualityRating(qualityRating);
      const reportNoteText = richTextHtmlToPlainText(reportNotes);
      const reportPayload: Record<string, unknown> = {
        buildId,
        completionObserved: completionObserved === true,
        locationAttempt: submissionLocationAttempt,
        missingPrerequisites,
        ...(missingPrerequisites.length > 0
          ? {
              prerequisiteException: {
                acknowledged: prerequisiteAcknowledged,
                reason: prerequisiteReason,
              },
            }
          : {}),
        recommendedOutcome,
        reportNotes,
        token: siteVisitToken,
      };
      if (source === "production" && rating !== undefined) {
        reportPayload.contractorRatings = qualityRatingTargets.map(
          (target) => ({
            contractorId: target._id,
            milestoneKey: target.milestoneKey,
            note: reportNoteText,
            rating,
            submilestoneKey: target.submilestoneKey,
          })
        );
      }
      await submitReport(reportPayload);
      setDraftPersistenceEnabled(false);
      await deleteSiteVisitDraft(draftKey);
      setSubmittedSummary({
        completedAt: Date.now(),
        fileCount: files.length + stagedCount,
        recommendation: recommendedOutcome,
        totalBytes: totalPackageBytes,
        visitId: siteVisitToken.slice(-6).toUpperCase(),
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit site visit report.";
      setError(message);
      toast.error("Report submission failed", { description: message });
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <MobileShell
      build={build}
      buildCode={deriveBuildCode(buildId, build)}
      footer={
        <BottomNav
          activeDrawer={drawer}
          filesCount={files.length}
          onCapture={() => focusSiteVisitSection("site-visit-capture")}
          onOpen={setDrawer}
          onReport={() => focusSiteVisitSection("site-visit-report")}
          scopeCount={targets.length}
          stagedCount={stagedItems.length}
        />
      }
      status="active"
      statusText="Active"
      timeText={`${expiresInMinutes} min left`}
    >
      <section className="grid gap-5 pb-28 md:pb-8 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:items-start">
        <div
          aria-live="polite"
          className="flex items-center justify-between gap-3 border-b pb-3 text-sm lg:hidden"
          role="status"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <span
              className={`size-2 rounded-full ${
                isOnline
                  ? draftStatus === "error"
                    ? "bg-destructive"
                    : "bg-success"
                  : "bg-warning"
              }`}
            />
            {isOnline
              ? draftStatus === "saving"
                ? "Saving draft"
                : draftStatus === "error"
                  ? "Draft save needs attention"
                  : "Draft saved on this device"
              : "Offline, draft saved on this device"}
          </span>
          <span className="text-muted-foreground">
            {submissionBlockers.length} remaining
          </span>
        </div>
        {isDesktopLayout ? (
          <aside className="grid min-w-0 gap-4">
            <DesktopLocationPanel
              build={build}
              buildCode={deriveBuildCode(buildId, build)}
              checking={checkingLocation}
              locationAttempt={locationAttempt}
              onVerify={verifyLocation}
            />
            <DesktopPermitPanel permit={permit} />
            <DesktopScopePanel targets={targets} />
          </aside>
        ) : null}

        <div className="grid min-w-0 gap-4">
          <SectionTitle right="Saved on this device" title="Capture evidence" />

          <Frame
            className="scroll-mt-40 lg:scroll-mt-6"
            id="site-visit-capture"
            tabIndex={-1}
          >
            <FramePanel className="p-3 sm:p-4 lg:p-5">
              <SiteVisitCapturePanel
                onCancelUpload={cancelUpload}
                onStageCapturedFile={(file) => stageSelectedFiles([file])}
                onStageFiles={stageFiles}
                onUploadStaged={() => void uploadStagedFiles()}
                selectedTarget={selectedTarget}
                setSelectedTarget={(target) => {
                  localEditsStartedRef.current = true;
                  setSelectedTarget(target);
                }}
                stagedBytes={stagedBytes}
                stagedCount={stagedItems.length}
                targets={targets}
                totalPackageBytes={totalPackageBytes}
                uploadedBytes={uploadedBytes}
                uploadingCount={uploadingCount}
              />
            </FramePanel>
          </Frame>

          <SectionTitle
            right={`${stagedItems.length} items`}
            title="Locally staged"
          />
          <EvidenceGrid
            files={stagedItems.map((item) => item.evidence)}
            onRemove={removeStagedItem}
            removalDisabled={uploadingCount > 0}
            targets={targets}
            variant="staged"
          />
        </div>

        <aside className="grid min-w-0 gap-4 lg:sticky lg:top-6">
          <Frame
            className="scroll-mt-40 lg:scroll-mt-6"
            id="site-visit-report"
            tabIndex={-1}
          >
            <FramePanel className="p-4">
              <SectionTitle title="Report" />
              <div className="mt-4 grid gap-4 lg:gap-3">
                <label className="grid gap-2 text-sm">
                  Recommendation
                  <select
                    className="h-11 rounded-md border bg-background px-3 text-base sm:h-10 sm:text-sm"
                    onChange={(event) => {
                      localEditsStartedRef.current = true;
                      setRecommendedOutcome(event.target.value);
                    }}
                    value={recommendedOutcome}
                  >
                    <option value="">Select a recommendation</option>
                    <option value="approve">Recommend approval</option>
                    <option value="needs_information">
                      Recommend more information
                    </option>
                    <option value="reject">Recommend rejection</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Completion observation
                  <select
                    className="h-11 rounded-md border bg-background px-3 text-base sm:h-10 sm:text-sm"
                    onChange={(event) => {
                      localEditsStartedRef.current = true;
                      setCompletionObserved(
                        event.target.value === ""
                          ? null
                          : event.target.value === "observed"
                      );
                    }}
                    value={
                      completionObserved === null
                        ? ""
                        : completionObserved
                          ? "observed"
                          : "not_observed"
                    }
                  >
                    <option value="">Select an observation</option>
                    <option value="observed">Completion observed</option>
                    <option value="not_observed">
                      Completion not observed
                    </option>
                  </select>
                </label>
                <LocationAttemptSummary
                  attempt={locationAttempt}
                  checking={checkingLocation}
                  onVerify={verifyLocation}
                  variant="inline"
                />
                {missingPrerequisites.length > 0 ? (
                  <div className="grid gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                    <p className="font-medium">Permit prerequisite missing</p>
                    <p>
                      Evidence and notes stay available, but submission requires
                      an acknowledgement and reason.
                    </p>
                    <label className="flex items-start gap-2">
                      <input
                        checked={prerequisiteAcknowledged}
                        className="mt-1"
                        onChange={(event) => {
                          localEditsStartedRef.current = true;
                          setPrerequisiteAcknowledged(
                            event.currentTarget.checked
                          );
                        }}
                        type="checkbox"
                      />
                      I acknowledge the permit was unavailable for this visit.
                    </label>
                    <label className="grid gap-2">
                      Exception reason
                      <textarea
                        className="min-h-24 rounded-md border bg-background p-3 text-base text-foreground sm:min-h-20 sm:p-2 sm:text-sm"
                        onChange={(event) => {
                          localEditsStartedRef.current = true;
                          setPrerequisiteReason(event.currentTarget.value);
                        }}
                        placeholder="Describe the alternate verification performed."
                        value={prerequisiteReason}
                      />
                    </label>
                  </div>
                ) : null}
                <label className="grid gap-2 text-sm">
                  Work quality
                  <select
                    className="h-11 rounded-md border bg-background px-3 text-base sm:h-10 sm:text-sm"
                    onChange={(event) => {
                      localEditsStartedRef.current = true;
                      setQualityRating(event.target.value);
                    }}
                    value={qualityRating}
                  >
                    <option value="">Not rated</option>
                    <option value="5">5 · Excellent</option>
                    <option value="4">4 · Good</option>
                    <option value="3">3 · Acceptable</option>
                    <option value="2">2 · Needs rework</option>
                    <option value="1">1 · Deficient</option>
                  </select>
                  <span className="text-muted-foreground text-xs">
                    {qualityRatingTargets.length > 0
                      ? `${qualityRatingTargets.length} assigned contractor scope${
                          qualityRatingTargets.length === 1 ? "" : "s"
                        }`
                      : "No contractor assignment on this scope"}
                  </span>
                </label>
                <div className="grid gap-2 text-sm">
                  <span className="font-medium">Field note</span>
                  <FieldRichTextEditor
                    ariaLabel="Field note"
                    className="[&_button]:min-h-11 [&_button]:min-w-11 sm:[&_button]:min-h-8 sm:[&_button]:min-w-8"
                    editorMinHeightClass="[&_.ProseMirror]:min-h-36 lg:[&_.ProseMirror]:min-h-28"
                    imageMaxHeightClass="[&_.ProseMirror_img]:max-h-48"
                    onChange={(value) => {
                      localEditsStartedRef.current = true;
                      setReportNotes(value);
                    }}
                    placeholder="Document observed completion, exceptions, and evidence references..."
                    testId="site-visit-report-note"
                    value={reportNotes}
                  />
                </div>
              </div>
              {error ? (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
                  {error}
                </div>
              ) : null}
              <div
                aria-live="polite"
                className={`mt-4 border-t pt-4 text-sm ${
                  submissionBlockers.length === 0
                    ? "border-success/30 text-success"
                    : "border-warning/30 text-warning"
                }`}
                role="status"
              >
                <p className="font-medium">
                  {submissionBlockers.length === 0
                    ? "Ready to submit"
                    : `${submissionBlockers.length} requirement${
                        submissionBlockers.length === 1 ? "" : "s"
                      } remaining`}
                </p>
                {submissionBlockers.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {submissionBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button
                className="mt-4 h-11 w-full sm:h-9"
                disabled={submittingReport}
                loading={submittingReport}
                onClick={() => void submit()}
                type="button"
              >
                <CheckCircle2 />
                Submit recommendation
              </Button>
            </FramePanel>
          </Frame>

          {isDesktopLayout ? (
            <>
              <DesktopUploadedPanel files={files} targets={targets} />
              <DesktopGuidePanel targets={targets} />
            </>
          ) : null}
        </aside>
      </section>

      <SiteVisitDrawer
        build={build}
        buildCode={deriveBuildCode(buildId, build)}
        checkingLocation={checkingLocation}
        files={files}
        locationAttempt={locationAttempt}
        onClose={() => setDrawer(null)}
        onVerifyLocation={verifyLocation}
        open={drawer !== null}
        permit={permit}
        targets={targets}
        type={drawer ?? "location"}
      />
    </MobileShell>
  );
}

function reportSubmissionBlockers({
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

function focusSiteVisitSection(id: string) {
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

function MobileShell({
  build,
  buildCode,
  children,
  footer,
  status,
  statusText,
  timeText,
}: {
  build: VisitBuild | null;
  buildCode: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  status: "active" | "complete" | "expired" | "loading";
  statusText: string;
  timeText: string;
}) {
  const statusClass =
    status === "active"
      ? "border-success/30 bg-success/10 text-success"
      : status === "complete"
        ? "border-info/30 bg-info/10 text-info"
        : status === "expired"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";

  return (
    <main className="min-h-svh bg-bg-base text-foreground">
      <div className="mx-auto w-full max-w-6xl lg:max-w-[1480px]">
        <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:static lg:z-auto lg:bg-background lg:px-8 lg:py-5 lg:backdrop-blur-none">
          <div className="flex min-w-0 flex-nowrap items-center gap-x-2 text-primary text-xs lg:gap-x-3">
            <span className="shrink-0 font-semibold">Site visit</span>
            <span className="min-w-0 truncate">{buildCode}</span>
          </div>
          <h1 className="mt-2 max-w-3xl truncate font-semibold text-xl leading-tight tracking-tight sm:text-balance sm:text-2xl lg:mt-3 lg:text-4xl lg:leading-none">
            {build?.name ?? "Site visit"}
          </h1>
          <p className="mt-1 max-w-2xl truncate text-muted-foreground text-sm sm:text-base lg:mt-2">
            {deriveAddress(build)}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 lg:mt-4 lg:gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-semibold text-xs uppercase tracking-[0.12em] lg:px-3 lg:py-1.5 lg:text-sm lg:tracking-[0.16em] ${statusClass}`}
            >
              <span className="size-2 rounded-full bg-current" />
              {statusText}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs uppercase tabular-nums tracking-[0.12em] lg:gap-2 lg:text-sm lg:tracking-[0.16em]">
              <Clock3 className="size-4" />
              {timeText}
            </span>
          </div>
        </header>
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
      </div>
      {footer}
    </main>
  );
}

function SectionTitle({ right, title }: { right?: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="min-w-0 flex-1 text-wrap font-semibold text-base">
        {title}
      </h2>
      {right ? (
        <span className="shrink-0 text-muted-foreground text-xs">{right}</span>
      ) : null}
    </div>
  );
}

function SiteVisitCapturePanel({
  onCancelUpload,
  onStageCapturedFile,
  onStageFiles,
  onUploadStaged,
  selectedTarget,
  setSelectedTarget,
  stagedBytes,
  stagedCount,
  targets,
  totalPackageBytes,
  uploadedBytes,
  uploadingCount,
}: {
  onCancelUpload: () => void;
  onStageCapturedFile: (file: File) => void;
  onStageFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadStaged: () => void;
  selectedTarget: string;
  setSelectedTarget: (target: string) => void;
  stagedBytes: number;
  stagedCount: number;
  targets: VisitTarget[];
  totalPackageBytes: number;
  uploadedBytes: number;
  uploadingCount: number;
}) {
  const [captureKind, setCaptureKind] = useState<DeviceCaptureKind | null>(
    null
  );

  return (
    <>
      <div className="mb-4 border-b pb-3">
        <p className="font-semibold text-sm uppercase tracking-[0.22em]">
          Capture
        </p>
        <p className="text-muted-foreground text-sm">
          Review on this device before uploading
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <CaptureButton
          className="col-span-2 sm:order-3 sm:col-span-1"
          icon={<Camera className="size-7" />}
          label="Take photo"
          meta="Optimized automatically"
          onActivate={() => setCaptureKind("photo")}
        />
        <CaptureButton
          accept="image/*,video/*,application/pdf"
          icon={<FileText className="size-7" />}
          label="Files"
          meta="PDF / IMG"
          multiple
          onChange={onStageFiles}
        />
        <CaptureButton
          icon={<Video className="size-7" />}
          label="Record"
          meta="Optional"
          onActivate={() => setCaptureKind("video")}
        />
      </div>

      {captureKind ? (
        <Suspense
          fallback={
            <p aria-live="polite" className="sr-only" role="status">
              Opening device capture
            </p>
          }
        >
          <DeviceCaptureDialog
            kind={captureKind}
            onCapture={onStageCapturedFile}
            onOpenChange={(open) => {
              if (!open) {
                setCaptureKind(null);
              }
            }}
            open
          />
        </Suspense>
      ) : null}

      <label className="mt-5 grid gap-2 text-sm">
        <span className="font-semibold text-primary uppercase tracking-[0.18em]">
          Capture target
        </span>
        <select
          className="min-h-11 rounded-md border bg-background px-3"
          onChange={(event) => setSelectedTarget(event.target.value)}
          value={selectedTarget}
        >
          <option value="visit-wide">Entire visit</option>
          {targets.map((target, targetIndex) => (
            <optgroup
              key={target._id}
              label={`${targetCode(target, targetIndex)} · ${target.milestoneName}`}
            >
              <option value={encodeMilestoneVisitTarget(target.milestoneKey)}>
                Entire milestone
              </option>
              {visitSubmilestones(target).map((submilestone, subIndex) => (
                <option
                  key={`${target._id}-${submilestone.key}`}
                  value={encodeSubmilestoneVisitTarget(
                    target.milestoneKey,
                    submilestone.key
                  )}
                >
                  {subCode(target, subIndex, targetIndex)} · {submilestone.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="text-muted-foreground text-xs">
          Every new photo, video, or file is attached to this scope.
        </span>
      </label>

      <div className="mt-5 grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <span className="font-medium">Package size after compression</span>
          <span className="font-semibold">
            {formatSiteVisitBytes(totalPackageBytes)} / 1 GB
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{
              width: `${Math.min(100, (totalPackageBytes / 1_000_000_000) * 100)}%`,
            }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span>Uploaded {formatSiteVisitBytes(uploadedBytes)}</span>
          <span>Staged {formatSiteVisitBytes(stagedBytes)}</span>
        </div>
      </div>

      <Button
        className="mt-4 h-11 w-full sm:h-9"
        disabled={stagedCount === 0 && uploadingCount === 0}
        onClick={uploadingCount > 0 ? onCancelUpload : onUploadStaged}
        type="button"
        variant={uploadingCount > 0 ? "outline" : "default"}
      >
        {uploadingCount > 0 ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Upload />
        )}
        {uploadingCount > 0 ? "Cancel upload" : "Upload evidence"}
      </Button>
    </>
  );
}

function CaptureButton({
  accept,
  className,
  icon,
  label,
  meta,
  multiple = false,
  onActivate,
  onChange,
}: {
  accept?: string;
  className?: string;
  icon: React.ReactNode;
  label: string;
  meta: string;
  multiple?: boolean;
  onActivate?: () => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Card
      aria-label={label}
      className={`grid min-h-24 cursor-pointer place-items-center p-2 text-center transition-colors hover:border-primary/40 hover:bg-accent/5 sm:min-h-32 lg:min-h-24 ${className ?? ""}`}
      data-testid={`site-visit-capture-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onActivate}
      render={onActivate ? <button type="button" /> : <label role="button" />}
    >
      {accept && onChange ? (
        <input
          accept={accept}
          className="sr-only"
          multiple={multiple}
          onChange={onChange}
          type="file"
        />
      ) : null}
      <span className="text-primary">{icon}</span>
      <strong className="text-sm">{label}</strong>
      <span className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
        {meta}
      </span>
    </Card>
  );
}

function EvidenceGrid({
  files,
  onRemove,
  removalDisabled = false,
  targets,
  variant,
}: {
  files: (SiteVisitStagedEvidence | VisitFile)[];
  onRemove?: (id: string) => void;
  removalDisabled?: boolean;
  targets: VisitTarget[];
  variant: "staged" | "uploaded";
}) {
  if (files.length === 0) {
    return (
      <Frame className="bg-transparent p-0">
        <FramePanel className="border-dashed p-4 text-center text-muted-foreground text-sm">
          No {variant === "staged" ? "local evidence staged" : "files uploaded"}
          .
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 min-[360px]:grid-cols-2">
      {files.map((file) => {
        const id = "_id" in file ? file._id : file.id;
        const name = "fileName" in file ? file.fileName : file.name;
        const size =
          "sizeBytes" in file ? file.sizeBytes : file.compressedBytes;
        const mimeType = file.mimeType;
        const url =
          "url" in file
            ? file.url
            : "previewUrl" in file
              ? file.previewUrl
              : undefined;
        const isVideo = mimeType.startsWith("video/");
        const isImage = mimeType.startsWith("image/");
        return (
          <Card
            className="relative min-h-40 overflow-hidden rounded-lg border bg-muted"
            key={id}
          >
            {url && (isImage || isVideo) ? (
              <a
                aria-label={`Review ${name}`}
                className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                href={url}
                rel="noreferrer"
                target="_blank"
              >
                {isImage ? (
                  <img
                    alt={`Evidence preview: ${name}`}
                    className="size-full object-cover"
                    src={url}
                  />
                ) : (
                  <video
                    aria-label={`Video evidence preview: ${name}`}
                    className="size-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    src={url}
                  />
                )}
              </a>
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                {isVideo ? (
                  <Play className="size-10 text-primary" />
                ) : isImage ? (
                  <Camera className="size-10 text-primary" />
                ) : (
                  <FileText className="size-10 text-primary" />
                )}
              </div>
            )}
            <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
              <Badge variant="secondary">
                {targetLabel(
                  targets,
                  file.targetMilestoneKey,
                  file.targetSubmilestoneKey
                )}
              </Badge>
              <Badge variant="outline">
                {variant === "uploaded" ? "Stored" : "Ready"}
              </Badge>
            </div>
            <footer className="absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-background/90 p-2 text-xs">
              <span className="truncate">{name}</span>
              <span className="shrink-0">{formatSiteVisitBytes(size)}</span>
            </footer>
            {onRemove ? (
              <Button
                aria-label={`Remove ${name}`}
                className="absolute right-2 bottom-10 rounded-full"
                disabled={removalDisabled}
                onClick={() => onRemove(id)}
                size="icon"
                type="button"
                variant="outline"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function BottomNav({
  activeDrawer,
  filesCount,
  onCapture,
  onOpen,
  onReport,
  scopeCount,
  stagedCount,
}: {
  activeDrawer: DrawerKey | null;
  filesCount: number;
  onCapture: () => void;
  onOpen: (key: DrawerKey) => void;
  onReport: () => void;
  scopeCount: number;
  stagedCount: number;
}) {
  return (
    <nav
      aria-label="Site visit tools"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-5 border-t bg-background/95 px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] backdrop-blur md:inset-x-auto md:top-1/2 md:right-4 md:bottom-auto md:w-24 md:max-w-none md:-translate-y-1/2 md:grid-cols-1 md:gap-2 md:rounded-xl md:border md:px-2 md:py-3 lg:hidden"
    >
      <NavButton
        active={activeDrawer === "location"}
        icon={<MapPin />}
        label="Map"
        onClick={() => onOpen("location")}
      />
      <NavButton
        active={activeDrawer === "scope"}
        badge={scopeCount}
        icon={<Hammer />}
        label="Packet"
        onClick={() => onOpen("scope")}
      />
      <NavButton
        badge={stagedCount > 0 ? stagedCount : undefined}
        icon={<Camera />}
        label="Capture"
        onClick={onCapture}
        testId="site-visit-nav-capture"
      />
      <NavButton
        active={activeDrawer === "uploaded"}
        badge={filesCount}
        icon={<Upload />}
        label="Files"
        onClick={() => onOpen("uploaded")}
      />
      <NavButton icon={<CheckCircle2 />} label="Report" onClick={onReport} />
    </nav>
  );
}

function NavButton({
  active = false,
  badge,
  icon,
  label,
  onClick,
  testId,
}: {
  active?: boolean;
  badge?: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={`relative grid min-h-12 min-w-12 place-items-center gap-0.5 rounded-lg px-1 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <span className="relative">
        {icon}
        {badge === undefined ? null : (
          <span className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-muted-foreground font-semibold text-background text-xs">
            {badge}
          </span>
        )}
      </span>
      <span className="whitespace-nowrap font-medium text-xs">{label}</span>
    </button>
  );
}

function DesktopLocationPanel({
  build,
  buildCode,
  checking,
  locationAttempt,
  onVerify,
}: {
  build: VisitBuild;
  buildCode: string;
  checking: boolean;
  locationAttempt: SiteVisitLocationAttempt;
  onVerify: () => void;
}) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle title="Location" />
        <div className="mt-4">
          <LocationAttemptSummary
            attempt={locationAttempt}
            checking={checking}
            onVerify={onVerify}
          />
        </div>
        <InteractiveSiteMap
          address={deriveAddress(build)}
          className="mt-4 [&_iframe]:h-40"
          latitude={build.locationLatitude}
          longitude={build.locationLongitude}
        />
        <dl className="mt-4 grid gap-3 text-sm">
          <InfoItem label="Build" value={buildCode} />
          <InfoItem label="Address" value={deriveAddress(build)} />
          <InfoItem
            label="Geofence"
            value={
              locationAttempt.verified
                ? "Within site boundary"
                : "Review required"
            }
          />
        </dl>
      </FramePanel>
    </Frame>
  );
}

function DesktopScopePanel({ targets }: { targets: VisitTarget[] }) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle right={`${targets.length}`} title="Scope" />
        <div className="mt-4 grid gap-3">
          {targets.map((target, index) => (
            <div className="rounded-md border p-3" key={target._id}>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{targetCode(target, index)}</Badge>
                {target.milestoneName.toLowerCase().includes("rough") ? (
                  <Wrench className="size-4 text-primary" />
                ) : (
                  <Hammer className="size-4 text-primary" />
                )}
              </div>
              <h3 className="mt-2 font-semibold text-sm">
                {target.milestoneName}
              </h3>
              <p className="mt-1 text-muted-foreground text-xs uppercase tracking-[0.12em]">
                {index === 0 ? "Lender-required" : "Bundled visit"}
              </p>
            </div>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function DesktopPermitPanel({ permit }: { permit?: VisitPermit | null }) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle right={permit ? "Attached" : "Missing"} title="Permit" />
        <div className="mt-4">
          <PermitPanel permit={permit} variant="desktop" />
        </div>
      </FramePanel>
    </Frame>
  );
}

function DesktopUploadedPanel({
  files,
  targets,
}: {
  files: VisitFile[];
  targets: VisitTarget[];
}) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle right={`${files.length}`} title="Uploaded" />
        <div className="mt-4">
          <EvidenceGrid
            files={files.slice(0, 4)}
            targets={targets}
            variant="uploaded"
          />
        </div>
      </FramePanel>
    </Frame>
  );
}

function DesktopGuidePanel({ targets }: { targets: VisitTarget[] }) {
  const sections = guidanceSectionsForTargets(targets);
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle title="Guide" />
        <div className="mt-4 grid gap-4">
          {sections.map((section) => (
            <section key={section.id}>
              <h3 className="font-semibold text-primary text-xs uppercase tracking-[0.14em]">
                {section.title}
              </h3>
              <FieldRichTextPreview
                ariaLabel={section.title}
                className="mt-2 border-0 bg-transparent text-xs [&_.ProseMirror]:max-h-24 [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
                imageMaxHeightClass="[&_.ProseMirror_img]:max-h-16"
                value={section.value}
              />
            </section>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function SiteVisitDrawer({
  build,
  buildCode,
  checkingLocation,
  files,
  locationAttempt,
  onClose,
  onVerifyLocation,
  open,
  permit,
  targets,
  type,
}: {
  build: VisitBuild;
  buildCode: string;
  checkingLocation: boolean;
  files: VisitFile[];
  locationAttempt: SiteVisitLocationAttempt;
  onClose: () => void;
  onVerifyLocation: () => void;
  open: boolean;
  permit?: VisitPermit | null;
  targets: VisitTarget[];
  type: DrawerKey;
}) {
  const title = {
    location: "Site map",
    scope: "Visit packet",
    uploaded: "Uploaded Evidence",
  }[type];

  return (
    <Drawer
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      open={open}
      position="bottom"
    >
      <DrawerPopup
        allowContentTouch={type === "location"}
        className="max-h-[88svh] md:mx-auto md:max-w-2xl"
        showBar
      >
        <header className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="mt-1">
              {type === "location"
                ? `${buildCode} · ${deriveAddress(build)}`
                : type === "scope"
                  ? `${targets.length} assigned milestone${targets.length === 1 ? "" : "s"}`
                  : type === "uploaded"
                    ? `${files.length} files · ${formatSiteVisitBytes(files.reduce((sum, file) => sum + file.sizeBytes, 0))}`
                    : "Inspection checklist"}
            </DrawerDescription>
          </div>
          <DrawerClose
            aria-label={`Close ${title} drawer`}
            render={
              <Button
                className="size-11"
                onClick={onClose}
                size="icon"
                type="button"
                variant="ghost"
              />
            }
          >
            <X />
          </DrawerClose>
        </header>
        <DrawerPanel className="p-4" scrollFade={false}>
          {type === "location" ? (
            <LocationPanel
              build={build}
              buildCode={buildCode}
              checking={checkingLocation}
              locationAttempt={locationAttempt}
              onVerify={onVerifyLocation}
            />
          ) : type === "scope" ? (
            <div className="grid gap-6">
              <ScopePanel targets={targets} />
              <PermitPanel permit={permit} />
              <GuidePanel targets={targets} />
            </div>
          ) : type === "uploaded" ? (
            <EvidenceGrid files={files} targets={targets} variant="uploaded" />
          ) : null}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}

function LocationAttemptSummary({
  attempt,
  checking,
  onVerify,
  variant = "panel",
}: {
  attempt: SiteVisitLocationAttempt;
  checking: boolean;
  onVerify: () => void;
  variant?: "inline" | "panel";
}) {
  return (
    <div
      className={`grid gap-3 text-sm ${
        variant === "panel"
          ? "rounded-md border bg-muted/30 p-3"
          : "border-y py-3"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-background">
          {checking ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : attempt.verified ? (
            <Check className="size-4 text-success" />
          ) : (
            <MapPin className="size-4 text-warning" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {checking
              ? "Checking site location"
              : attempt.verified
                ? "Location verified"
                : attempt.failureReason?.includes("accuracy overlaps")
                  ? "Location needs review"
                  : attempt.distanceMeters === undefined
                    ? attempt.attempted
                      ? "Location attempt unverified"
                      : "Location not attempted"
                    : "Outside site geofence"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {attempt.verified
              ? `Within ${attempt.geofenceRadiusMeters ?? 250} m of the Build site · ±${attempt.accuracyMeters ?? 0} m accuracy.`
              : attempt.failureReason?.includes("accuracy overlaps")
                ? `${attempt.distanceMeters ?? 0} m from the Build site with ±${attempt.accuracyMeters ?? 0} m accuracy. The boundary cannot be verified confidently.`
                : attempt.distanceMeters === undefined
                  ? attempt.failureReason
                  : `${attempt.distanceMeters} m from the Build site · ${attempt.geofenceRadiusMeters ?? 250} m limit.`}
          </p>
        </div>
      </div>
      <Button
        className="h-11 w-full sm:h-8 sm:w-auto"
        disabled={checking}
        onClick={onVerify}
        size="sm"
        type="button"
        variant="outline"
      >
        <MapPin />
        {attempt.attempted ? "Retry location" : "Verify location"}
      </Button>
    </div>
  );
}

function LocationPanel({
  build,
  buildCode,
  checking,
  locationAttempt,
  onVerify,
}: {
  build: VisitBuild;
  buildCode: string;
  checking: boolean;
  locationAttempt: SiteVisitLocationAttempt;
  onVerify: () => void;
}) {
  return (
    <div className="grid gap-4">
      <LocationAttemptSummary
        attempt={locationAttempt}
        checking={checking}
        onVerify={onVerify}
      />
      <Frame>
        <FramePanel className="p-4">
          <InteractiveSiteMap
            address={deriveAddress(build)}
            className="mb-5"
            latitude={build.locationLatitude}
            longitude={build.locationLongitude}
          />
          <div className="flex justify-between gap-3 text-xs uppercase tracking-[0.16em]">
            <span>Build · {buildCode}</span>
            <span>
              {locationAttempt.verified
                ? "Location verified"
                : "Location unverified"}
            </span>
          </div>
          <h3 className="mt-4 font-semibold text-primary text-sm uppercase tracking-[0.18em]">
            Site address
          </h3>
          <p className="mt-2 font-semibold text-2xl">
            {deriveStreetLine(build)}
          </p>
          <p className="text-muted-foreground">{deriveCityLine(build)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <InfoItem label="Build" value={buildCode} />
            <InfoItem
              label="Attempt"
              value={locationAttempt.attempted ? "Recorded" : "Not attempted"}
            />
            <InfoItem
              label="Verification"
              value={locationAttempt.verified ? "Verified" : "Unverified"}
            />
            <InfoItem
              label="Accuracy"
              value={
                locationAttempt.accuracyMeters === undefined
                  ? "Unavailable"
                  : `±${locationAttempt.accuracyMeters} m`
              }
            />
          </dl>
        </FramePanel>
      </Frame>
    </div>
  );
}

function ScopePanel({ targets }: { targets: VisitTarget[] }) {
  return (
    <div className="grid gap-4">
      {targets.map((target, index) => {
        const submilestones = visitSubmilestones(target);
        return (
          <Frame key={target._id}>
            <FramePanel className="p-0">
              <header className="flex items-center gap-3 border-b p-4">
                <Badge variant="outline">{targetCode(target, index)}</Badge>
                {target.milestoneName.toLowerCase().includes("rough") ? (
                  <Wrench className="size-5 text-primary" />
                ) : (
                  <Hammer className="size-5 text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">
                    {target.milestoneName}
                  </h3>
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                    {index === 0 ? "Lender-required visit" : "Bundled visit"}
                  </p>
                </div>
              </header>
              {submilestones.length > 0 ? (
                <div className="divide-y">
                  {submilestones.map((submilestone, subIndex) => (
                    <div
                      className="grid grid-cols-[3rem_1fr_auto] gap-3 p-3 text-sm"
                      key={submilestone.key}
                    >
                      <span className="font-medium text-primary">
                        {subCode(target, subIndex)}
                      </span>
                      <span>{submilestone.name}</span>
                      <span className="text-muted-foreground">
                        {subIndex > 1 ? "OBS" : "REQ"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-muted-foreground text-sm">
                  No submilestone checklist was attached. Use the lender
                  guidance and milestone scope shown for this visit.
                </p>
              )}
            </FramePanel>
          </Frame>
        );
      })}
    </div>
  );
}

function GuidePanel({ targets }: { targets: VisitTarget[] }) {
  const sections = guidanceSectionsForTargets(targets);
  return (
    <div className="grid gap-5">
      {sections.map((section) => (
        <section key={section.id}>
          <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.18em]">
            {section.title}
          </h3>
          <div className="mt-3">
            <FieldRichTextPreview
              ariaLabel={section.title}
              value={section.value}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function PermitPanel({
  permit,
  variant = "drawer",
}: {
  permit?: VisitPermit | null;
  variant?: "desktop" | "drawer";
}) {
  const sourceUrl = permitSourceUrl(permit);
  const fileName = permitDisplayName(permit);
  const mimeType = permit?.mimeType ?? "";
  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = mimeType.startsWith("image/");
  const viewerUrl =
    sourceUrl && isPdf
      ? `${sourceUrl}#toolbar=1&navpanes=1&scrollbar=1`
      : sourceUrl;

  if (!permit) {
    return (
      <Frame className="bg-transparent p-0">
        <FramePanel className="border-dashed p-4 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No build permit attached</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Continue the site visit, but note any permit-specific uncertainty in
            the field note.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  if (!sourceUrl) {
    return (
      <Frame className="bg-transparent p-0">
        <FramePanel className="p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted">
              <FileText className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{fileName}</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Permit metadata is present, but no preview URL is available.
                Record any permit check as location-unverified context.
              </p>
            </div>
          </div>
          <PermitMeta permit={permit} />
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="grid gap-4">
      <Frame>
        <FramePanel className="p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{fileName}</h3>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                {isPdf ? "PDF permit" : mimeType || "Permit document"}
              </p>
            </div>
            <Badge variant={isPdf ? "success" : "outline"}>
              {isPdf ? "PDF" : "Preview"}
            </Badge>
          </div>
          <div
            className={
              variant === "desktop"
                ? "overflow-hidden rounded-md border bg-muted"
                : "overflow-hidden rounded-lg border bg-muted"
            }
          >
            {isPdf ? (
              <iframe
                className={
                  variant === "desktop"
                    ? "h-72 w-full border-0"
                    : "h-[58svh] w-full border-0"
                }
                data-testid="site-visit-permit-frame"
                src={viewerUrl}
                title={`Build permit viewer for ${fileName}`}
              />
            ) : isImage ? (
              <img
                alt={`Build permit ${fileName}`}
                className={
                  variant === "desktop"
                    ? "h-72 w-full object-contain"
                    : "max-h-[58svh] w-full object-contain"
                }
                src={sourceUrl}
              />
            ) : (
              <div className="grid min-h-56 place-items-center p-6 text-center">
                <div>
                  <FileText className="mx-auto mb-3 size-10 text-primary" />
                  <p className="font-semibold">Preview unavailable</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Open the document in a new tab to inspect it.
                  </p>
                </div>
              </div>
            )}
          </div>
          <PermitMeta permit={permit} />
        </FramePanel>
      </Frame>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          render={
            <a download={fileName} href={sourceUrl}>
              <Download />
              Download
            </a>
          }
          variant="outline"
        />
        <Button
          render={
            <a href={sourceUrl} rel="noreferrer" target="_blank">
              <ExternalLink />
              Open permit
            </a>
          }
        />
      </div>
    </div>
  );
}

function PermitMeta({ permit }: { permit: VisitPermit }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <InfoItem label="File" value={permitDisplayName(permit)} />
      <InfoItem
        label="Type"
        value={permit.mimeType ?? permit.kind ?? "Permit document"}
      />
      <InfoItem
        label="Size"
        value={
          permit.sizeBytes === undefined
            ? "Not recorded"
            : formatSiteVisitBytes(permit.sizeBytes)
        }
      />
      <InfoItem
        label="Status"
        value={permitSourceUrl(permit) ? "Viewable" : "URL missing"}
      />
    </dl>
  );
}

function OutcomeCard({
  actions,
  body,
  detailItems = [],
  icon,
  stamp,
  title,
  tone,
}: {
  actions?: React.ReactNode;
  body: string;
  detailItems?: [string, string][];
  icon: React.ReactNode;
  stamp?: string;
  title: string;
  tone: "danger" | "neutral" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "success"
        ? "border-success/30 bg-success/10 text-success"
        : "border-border bg-background text-foreground";
  return (
    <Frame className="mx-auto w-full max-w-2xl">
      <FramePanel className={`p-6 text-center ${toneClass}`}>
        <div className="mx-auto grid size-16 place-items-center rounded-full border bg-background/60">
          {icon}
        </div>
        {stamp ? (
          <p className="mt-4 font-semibold text-sm uppercase tracking-[0.2em]">
            {stamp}
          </p>
        ) : null}
        <h2 className="mt-3 font-semibold text-3xl tracking-tight">{title}</h2>
        <p className="mt-3 text-balance text-muted-foreground">{body}</p>
        {detailItems.length > 0 ? (
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-5 text-sm">
            {detailItems.map(([label, value]) => (
              <InfoItem key={label} label={label} value={value} />
            ))}
          </dl>
        ) : null}
        {actions}
      </FramePanel>
    </Frame>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-primary text-xs uppercase tracking-[0.16em]">
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function deriveBuildCode(buildId: string, build?: VisitBuild | null) {
  const key = build?.key ?? buildId;
  if (/^bld[-_]/i.test(key)) {
    return key.toUpperCase().replaceAll("_", "-");
  }
  const match = key.match(/(\d{3,})/);
  return match
    ? `BLD-${match[1]}`
    : key.replace(/^demo-timeline-/, "BLD-").toUpperCase();
}

function deriveAddress(build?: VisitBuild | null) {
  const storedAddress = build?.address?.trim();
  if (storedAddress) {
    return storedAddress;
  }
  const subtitle = build?.subtitle ?? "";
  const [address] = subtitle.split("·").map((part) => part.trim());
  return address || "Site address unavailable";
}

function deriveStreetLine(build?: VisitBuild | null) {
  return (
    deriveAddress(build).split(",")[0]?.trim() || "Site address unavailable"
  );
}

function deriveCityLine(build?: VisitBuild | null) {
  const address = deriveAddress(build);
  const [, ...localityParts] = address.split(",");
  return localityParts.join(",").trim() || "Municipality not recorded";
}

function createEvidencePreviewUrl(file: Blob, mimeType: string) {
  if (
    !(mimeType.startsWith("image/") || mimeType.startsWith("video/")) ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  return URL.createObjectURL(file);
}

function revokeEvidencePreviewUrl(previewUrl?: string) {
  if (previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(previewUrl);
  }
}

function permitDisplayName(permit?: VisitPermit | null) {
  return permit?.fileName ?? permit?.name ?? "Build permit.pdf";
}

function permitSourceUrl(permit?: VisitPermit | null) {
  return permit?.storageUrl ?? permit?.url ?? null;
}

function targetCode(target: VisitTarget, fallbackIndex = 0) {
  return `M-${String(target.milestoneOrder || fallbackIndex + 1).padStart(2, "0")}`;
}

function guidanceSectionsForTargets(targets: VisitTarget[]): GuideSection[] {
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

function snapshotRichTextValue(value: string): string | JSONContent {
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

function richTextValueHasContent(value: string | JSONContent) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return tiptapValueHasSemanticContent(value);
}

function tiptapValueHasSemanticContent(node: JSONContent): boolean {
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

function normalizedGuidance(target: VisitTarget): SiteVisitGuidanceHtml {
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

function shortMilestoneLabel(value: string) {
  const [first] = value.split("&");
  return first?.trim() || value;
}

function subCode(target: VisitTarget, index: number) {
  return `${String(target.milestoneOrder || 1).padStart(2, "0")}${String.fromCharCode(
    97 + index
  )}`;
}

function targetLabel(
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

function visitSubmilestones(
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

function encodeMilestoneVisitTarget(milestoneKey: string) {
  return `milestone:${milestoneKey}`;
}

function encodeSubmilestoneVisitTarget(
  milestoneKey: string,
  submilestoneKey: string
) {
  return `submilestone:${milestoneKey}:${submilestoneKey}`;
}

function parseSelectedVisitTarget(value: string) {
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

function contractorRatingTargetsForScope(
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

function contractorIdsForEvidenceTarget(
  targets: VisitTarget[],
  milestoneKey?: string,
  submilestoneKey?: string
) {
  return contractorRatingTargetsForScope(targets, milestoneKey, submilestoneKey)
    .map((target) => target._id)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function parseQualityRating(value: string) {
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

function slugifyTargetKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "scope"
  );
}

function formatVisitTime(value?: number) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatVisitDay(value?: number) {
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
