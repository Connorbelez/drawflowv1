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
  Lightbulb,
  LoaderCircle,
  Lock,
  MapPin,
  Play,
  Upload,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  DeviceCaptureDialog,
  type DeviceCaptureKind,
} from "#/components/device-capture-dialog.tsx";
import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Drawer,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  plainTextToRichTextHtml,
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
  assertPackageWithinCap,
  buildStagedEvidence,
  evidenceMimeTypeForFile,
  packageTotalBytes,
  type SiteVisitStagedEvidence,
  uploadSiteVisitStagedEvidence,
} from "./site-visit-evidence-staging";
import {
  formatSiteVisitBytes,
  resolveSiteVisitUnavailableCopy,
} from "./site-visit-token-route-model";

const tokenConvex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

type VisitTarget = {
  _id: string;
  contractors?: VisitTargetContractor[];
  guidance?: {
    cameraAngles?: string | string[];
    whatToVerify?: string | string[];
  };
  milestoneKey: string;
  milestoneName: string;
  milestoneOrder: number;
  submilestones: VisitSubmilestone[];
};

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
  key: string;
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
  reason?: "consumed" | "expired" | "not_found" | null;
  status: "completed" | "expired" | "invalid";
  targets?: VisitTarget[];
  visit?: VisitRecord | null;
};

type VisitState = ActiveVisitState | UnavailableVisitState;
type DrawerKey =
  | "capture"
  | "guide"
  | "location"
  | "permit"
  | "scope"
  | "uploaded";

type StagedItem = {
  evidence: SiteVisitStagedEvidence;
  file: File;
};

type SubmittedSummary = {
  completedAt: number;
  fileCount: number;
  recommendation: string;
  totalBytes: number;
  visitId: string;
};

const DEFAULT_REPORT_NOTES = plainTextToRichTextHtml(
  "Observed requested milestone scope on site. Evidence package attached for lender admin review."
);

type GuideSection = {
  html: string;
  title: string;
};

const FALLBACK_GUIDE_SECTIONS: GuideSection[] = [
  {
    html: guidanceLinesToHtml([
      "All exterior load-bearing walls erected, sheathed, and braced.",
      "Roof trusses set on bearing walls with hurricane strapping visible.",
      "Interior partition layout matches stamped plan revision.",
      "No daylight visible at sheathing seams or plate connections.",
    ]),
    title: "M-04 · Framing — What to verify",
  },
  {
    html: guidanceLinesToHtml([
      "Wide shot per elevation showing full frame.",
      "Close-up of straps, hold-downs, or hardware called out on plan.",
      "Header or king-stud detail at large openings.",
      "Roof from interior showing truss bottom chords and bridging.",
    ]),
    title: "Required photo angles",
  },
  {
    html: guidanceLinesToHtml([
      "Plumbing supply lines pressurized; gauge holding at test stub.",
      "DWV vent stack runs through to roof penetration.",
      "Electrical boxes set plumb at code-correct heights.",
      "No mechanical conflicts at chase intersections.",
    ]),
    title: "M-05 · Rough-in — What to verify",
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
  const openedRef = useRef(false);
  const [selectedTarget, setSelectedTarget] = useState("visit-wide");
  const [reportNotes, setReportNotes] = useState(DEFAULT_REPORT_NOTES);
  const [completionObserved, setCompletionObserved] = useState(true);
  const [recommendedOutcome, setRecommendedOutcome] = useState("approve");
  const [qualityRating, setQualityRating] = useState("");
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [drawer, setDrawer] = useState<DrawerKey | null>(null);
  const [error, setError] = useState("");
  const [submittedSummary, setSubmittedSummary] =
    useState<SubmittedSummary | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

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
    const expired = visitState.reason === "expired";
    return (
      <MobileShell
        build={build}
        buildCode={deriveBuildCode(buildId, build)}
        status="expired"
        statusText={expired ? "Expired" : "Invalid"}
        timeText="Token void"
      >
        <OutcomeCard
          body={copy.body}
          detailItems={
            expired
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
                  ["Reason", "Window elapsed"],
                ]
              : [
                  ["Reason", "Build / token mismatch"],
                  ["Token tail", tokenTail(siteVisitToken)],
                  ["Build", deriveBuildCode(buildId, build)],
                  ["Support", "ops@drawflow.app"],
                ]
          }
          icon={
            expired ? (
              <Clock3 className="size-6" />
            ) : (
              <Lock className="size-6" />
            )
          }
          stamp={copy.stamp}
          title={copy.title}
          tone="danger"
        />
      </MobileShell>
    );
  }

  const { build, files, permit, targets, visit } = visitState;
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

    const nextItems = selectedFiles.map((file) => ({
      evidence: buildStagedEvidence({
        id: `${Date.now()}-${file.name}-${file.size}`,
        mimeType: evidenceMimeTypeForFile(file),
        name: file.name,
        sizeBytes: file.size,
        targetMilestoneKey: selectedMilestoneKey,
        targetSubmilestoneKey: selectedSubmilestoneKey,
      }),
      file,
    }));

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

  const uploadStagedFiles = async () => {
    if (stagedItems.length === 0) {
      return;
    }
    setError("");
    setUploadingCount(stagedItems.length);
    try {
      await uploadSiteVisitStagedEvidence({
        buildId,
        generateUploadUrl,
        onUploadedItem: () =>
          setUploadingCount((current) => Math.max(0, current - 1)),
        registerFile: (input) => {
          if (source !== "production") {
            return registerFile(input);
          }
          return registerFile({
            ...input,
            contractorIds: contractorIdsForEvidenceTarget(
              targets,
              input.targetMilestoneKey,
              input.targetSubmilestoneKey
            ),
          });
        },
        stagedItems,
        token: siteVisitToken,
        upload: async (url, file, mimeType) =>
          await fetch(url, {
            body: file,
            headers: {
              "Content-Type": mimeType,
            },
            method: "POST",
          }),
      });
      setStagedItems([]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload site visit evidence."
      );
      setUploadingCount(0);
      throw uploadError;
    }
  };

  const submit = async () => {
    setError("");
    try {
      const stagedCount = stagedItems.length;
      if (stagedCount > 0) {
        await uploadStagedFiles();
      }
      const rating = parseQualityRating(qualityRating);
      const reportNoteText = richTextHtmlToPlainText(reportNotes);
      const reportPayload: Record<string, unknown> = {
        buildId,
        completionObserved,
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
      setSubmittedSummary({
        completedAt: Date.now(),
        fileCount: files.length + stagedCount,
        recommendation: recommendedOutcome,
        totalBytes: totalPackageBytes,
        visitId: siteVisitToken.slice(-6).toUpperCase(),
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit site visit report."
      );
    }
  };

  return (
    <MobileShell
      build={build}
      buildCode={deriveBuildCode(buildId, build)}
      footer={
        <BottomNav
          filesCount={files.length}
          onOpen={setDrawer}
          scopeCount={targets.length}
          stagedCount={stagedItems.length}
        />
      }
      status="active"
      statusText="Active"
      timeText={`${expiresInMinutes} min left`}
    >
      <section className="grid gap-5 pb-28 md:pb-8 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] lg:items-start">
        <aside className="hidden min-w-0 gap-4 lg:grid">
          <DesktopLocationPanel
            build={build}
            buildCode={deriveBuildCode(buildId, build)}
          />
          <DesktopPermitPanel permit={permit} />
          <DesktopScopePanel targets={targets} />
        </aside>

        <div className="grid min-w-0 gap-4">
          <SectionTitle
            code="B.01"
            right="Local to Convex"
            title="Capture evidence"
          />

          <Frame>
            <FramePanel className="p-3 sm:p-4 lg:p-5">
              <SiteVisitCapturePanel
                onStageCapturedFile={(file) => stageSelectedFiles([file])}
                onStageFiles={stageFiles}
                onUploadStaged={() => void uploadStagedFiles()}
                selectedTarget={selectedTarget}
                setSelectedTarget={setSelectedTarget}
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
            code="B.02"
            right={`${stagedItems.length} items`}
            title="Locally staged"
          />
          <EvidenceGrid
            files={stagedItems.map((item) => item.evidence)}
            onRemove={(id) =>
              setStagedItems((current) =>
                current.filter((item) => item.evidence.id !== id)
              )
            }
            targets={targets}
            variant="staged"
          />
        </div>

        <aside className="grid min-w-0 gap-4 lg:sticky lg:top-6">
          <Frame>
            <FramePanel className="p-4">
              <SectionTitle code="E.09" title="Report" />
              <div className="mt-4 grid gap-4 lg:gap-3">
                <label className="grid gap-2 text-sm">
                  Recommendation
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    onChange={(event) =>
                      setRecommendedOutcome(event.target.value)
                    }
                    value={recommendedOutcome}
                  >
                    <option value="approve">Approve</option>
                    <option value="needs_information">Needs information</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={completionObserved}
                    onChange={(event) =>
                      setCompletionObserved(event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  Completion observed on site
                </label>
                <label className="grid gap-2 text-sm">
                  Work quality
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    onChange={(event) => setQualityRating(event.target.value)}
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
                    editorMinHeightClass="[&_.ProseMirror]:min-h-36 lg:[&_.ProseMirror]:min-h-28"
                    imageMaxHeightClass="[&_.ProseMirror_img]:max-h-48"
                    onChange={setReportNotes}
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
              <Button
                className="mt-4 w-full"
                disabled={
                  uploadingCount > 0 ||
                  !richTextHtmlHasText(reportNotes) ||
                  files.length + stagedItems.length === 0
                }
                onClick={() => void submit()}
                type="button"
              >
                <CheckCircle2 />
                Submit report
              </Button>
            </FramePanel>
          </Frame>

          <DesktopUploadedPanel files={files} targets={targets} />
          <DesktopGuidePanel targets={targets} />
        </aside>
      </section>

      <SiteVisitDrawer
        build={build}
        buildCode={deriveBuildCode(buildId, build)}
        files={files}
        onClose={() => setDrawer(null)}
        onStageFiles={stageFiles}
        onStageCapturedFile={(file) => stageSelectedFiles([file])}
        onUploadStaged={() => void uploadStagedFiles()}
        open={drawer !== null}
        permit={permit}
        selectedTarget={selectedTarget}
        setSelectedTarget={setSelectedTarget}
        stagedBytes={stagedBytes}
        stagedCount={stagedItems.length}
        targets={targets}
        totalPackageBytes={totalPackageBytes}
        type={drawer ?? "location"}
        uploadedBytes={uploadedBytes}
        uploadingCount={uploadingCount}
      />
    </MobileShell>
  );
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
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "complete"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : status === "expired"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-muted text-muted-foreground border-border";

  return (
    <main className="min-h-svh bg-bg-base text-foreground">
      <div className="mx-auto w-full max-w-6xl lg:max-w-[1480px]">
        <header className="border-b bg-background px-4 pt-5 pb-5 sm:px-6 lg:px-8 lg:pt-6 lg:pb-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-primary text-xs uppercase tracking-[0.24em]">
            <Badge variant="outline">SV-01</Badge>
            <span className="font-semibold">Evidence visit</span>
            <span className="min-w-0 truncate">{buildCode}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-balance font-semibold text-4xl leading-none tracking-tight sm:text-5xl lg:mt-3 lg:text-4xl">
            {build?.name ?? "Site visit"}
          </h1>
          <p className="mt-2 max-w-2xl text-lg text-muted-foreground lg:text-base">
            {deriveAddress(build)} {deriveCityLine(build)}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 lg:mt-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold text-sm uppercase tracking-[0.18em] ${statusClass}`}
            >
              <span className="size-2 rounded-full bg-current" />
              {statusText}
            </span>
            <span className="inline-flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-[0.18em]">
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

function SectionTitle({
  code,
  right,
  title,
}: {
  code: string;
  right?: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Badge className="shrink-0 rounded-full px-3 py-1" variant="outline">
        {code}
      </Badge>
      <h2 className="min-w-0 flex-1 text-wrap font-semibold text-sm uppercase tracking-[0.18em] sm:tracking-[0.22em]">
        {title}
      </h2>
      {right ? (
        <span className="shrink-0 text-muted-foreground text-xs uppercase tracking-[0.18em]">
          {right}
        </span>
      ) : null}
    </div>
  );
}

function SiteVisitCapturePanel({
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
  variant = "page",
}: {
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
  variant?: "drawer" | "page";
}) {
  const [captureKind, setCaptureKind] = useState<DeviceCaptureKind | null>(null);

  return (
    <>
      {variant === "page" ? (
        <div className="mb-4 border-b pb-3">
          <p className="font-semibold text-sm uppercase tracking-[0.22em]">
            Capture
          </p>
          <p className="text-muted-foreground text-sm">
            Phone / tablet stage before upload
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 min-[360px]:grid-cols-3">
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
        <CaptureButton
          icon={<Camera className="size-7" />}
          label="Take Photo"
          meta="JPG to WEBP"
          onActivate={() => setCaptureKind("photo")}
        />
      </div>

      <DeviceCaptureDialog
        kind={captureKind ?? "photo"}
        onCapture={onStageCapturedFile}
        onOpenChange={(open) => {
          if (!open) {
            setCaptureKind(null);
          }
        }}
        open={captureKind !== null}
      />

      <div className="mt-5">
        <h2 className="font-semibold text-primary text-sm uppercase tracking-[0.22em]">
          Tag next capture to
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <TargetButton
            active={selectedTarget === "visit-wide"}
            onClick={() => setSelectedTarget("visit-wide")}
          >
            Visit-wide
          </TargetButton>
          {targets.map((target, index) => {
            const milestoneTarget = encodeMilestoneVisitTarget(
              target.milestoneKey
            );
            return (
              <TargetButton
                active={selectedTarget === milestoneTarget}
                key={target._id}
                onClick={() => setSelectedTarget(milestoneTarget)}
              >
                {targetCode(target, index)} {target.milestoneName}
              </TargetButton>
            );
          })}
          {targets.flatMap((target, targetIndex) =>
            visitSubmilestones(target)
              .slice(0, 6)
              .map((submilestone, subIndex) => {
                const subTarget = encodeSubmilestoneVisitTarget(
                  target.milestoneKey,
                  submilestone.key
                );
                return (
                  <TargetButton
                    active={selectedTarget === subTarget}
                    key={`${target._id}-${submilestone.key}`}
                    onClick={() => setSelectedTarget(subTarget)}
                  >
                    {subCode(target, subIndex, targetIndex)} {submilestone.name}
                  </TargetButton>
                );
              })
          )}
        </div>
      </div>

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
        className="mt-4 w-full"
        disabled={stagedCount === 0 || uploadingCount > 0}
        onClick={onUploadStaged}
        type="button"
      >
        {uploadingCount > 0 ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Upload />
        )}
        Upload staged to Convex
      </Button>
    </>
  );
}

function CaptureButton({
  accept,
  icon,
  label,
  meta,
  multiple = false,
  onActivate,
  onChange,
}: {
  accept?: string;
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
      className="grid min-h-28 cursor-pointer place-items-center p-2 text-center transition-colors hover:border-primary/40 hover:bg-accent/5 sm:min-h-32 lg:min-h-24"
      data-testid={`site-visit-capture-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={onActivate}
      render={
        onActivate ? <button type="button" /> : <label role="button" />
      }
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
      <span className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
        {meta}
      </span>
    </Card>
  );
}

function TargetButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full border px-3 py-2 text-sm ${
        active
          ? "border-foreground bg-foreground text-background"
          : "bg-background text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function EvidenceGrid({
  files,
  onRemove,
  targets,
  variant,
}: {
  files: (SiteVisitStagedEvidence | VisitFile)[];
  onRemove?: (id: string) => void;
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
        const url = "url" in file ? file.url : undefined;
        const isVideo = mimeType.startsWith("video/");
        const isImage = mimeType.startsWith("image/");
        return (
          <Card
            className="relative min-h-40 overflow-hidden rounded-lg border bg-muted"
            key={id}
          >
            {url && isImage ? (
              <img
                alt=""
                className="absolute inset-0 size-full object-cover"
                src={url}
              />
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
              <button
                aria-label={`Remove ${name}`}
                className="absolute right-2 bottom-9 grid size-8 place-items-center rounded-full border bg-background"
                onClick={() => onRemove(id)}
                type="button"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function BottomNav({
  filesCount,
  onOpen,
  scopeCount,
  stagedCount,
}: {
  filesCount: number;
  onOpen: (key: DrawerKey) => void;
  scopeCount: number;
  stagedCount: number;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-6 border-t bg-background/95 px-1 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur md:inset-x-auto md:top-1/2 md:right-4 md:bottom-auto md:w-24 md:max-w-none md:-translate-y-1/2 md:grid-cols-1 md:gap-3 md:rounded-xl md:border md:px-2 md:py-3 lg:hidden">
      <NavButton
        icon={<MapPin />}
        label="Location"
        onClick={() => onOpen("location")}
      />
      <NavButton
        icon={<FileText />}
        label="Permit"
        onClick={() => onOpen("permit")}
      />
      <NavButton
        badge={scopeCount}
        icon={<Hammer />}
        label="Scope"
        onClick={() => onOpen("scope")}
      />
      <NavButton
        badge={stagedCount > 0 ? stagedCount : undefined}
        icon={<Camera />}
        label="Capture"
        onClick={() => onOpen("capture")}
        testId="site-visit-nav-capture"
      />
      <NavButton
        badge={filesCount}
        icon={<Upload />}
        label="Files"
        onClick={() => onOpen("uploaded")}
      />
      <NavButton
        icon={<Lightbulb />}
        label="Guide"
        onClick={() => onOpen("guide")}
      />
    </nav>
  );
}

function NavButton({
  badge,
  icon,
  label,
  onClick,
  testId,
}: {
  badge?: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      className="relative grid place-items-center gap-1 text-muted-foreground text-xs"
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <span className="relative">
        {icon}
        {badge === undefined ? null : (
          <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-muted-foreground text-[10px] text-background">
            {badge}
          </span>
        )}
      </span>
      <span className="whitespace-nowrap font-medium text-[10px] uppercase tracking-[0.06em] min-[380px]:text-[11px] min-[380px]:tracking-[0.1em]">
        {label}
      </span>
    </button>
  );
}

function DesktopLocationPanel({
  build,
  buildCode,
}: {
  build: VisitBuild;
  buildCode: string;
}) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle code="A.01" title="Location" />
        <div className="mt-4 grid min-h-32 place-items-center rounded-md border bg-muted/40 text-center text-muted-foreground">
          <div>
            <MapPin className="mx-auto mb-2 size-6 text-primary" />
            <p className="font-medium text-sm">Site plan pending</p>
            <p className="text-xs">27.84 / -82.71</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <InfoItem label="Build" value={buildCode} />
          <InfoItem label="Address" value={deriveAddress(build)} />
          <InfoItem label="County" value="Pinellas" />
        </dl>
      </FramePanel>
    </Frame>
  );
}

function DesktopScopePanel({ targets }: { targets: VisitTarget[] }) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <SectionTitle code="C.05" right={`${targets.length}`} title="Scope" />
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
        <SectionTitle
          code="A.02"
          right={permit ? "Attached" : "Missing"}
          title="Permit"
        />
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
        <SectionTitle code="B.04" right={`${files.length}`} title="Uploaded" />
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
        <SectionTitle code="D.07" title="Guide" />
        <div className="mt-4 grid gap-4">
          {sections.slice(0, 4).map((section) => (
            <section key={section.title}>
              <h3 className="font-semibold text-primary text-xs uppercase tracking-[0.14em]">
                {section.title}
              </h3>
              <FieldRichTextPreview
                ariaLabel={section.title}
                className="mt-2 border-0 bg-transparent text-xs [&_.ProseMirror]:max-h-24 [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
                imageMaxHeightClass="[&_.ProseMirror_img]:max-h-16"
                value={section.html}
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
  files,
  onClose,
  onStageCapturedFile,
  onStageFiles,
  onUploadStaged,
  open,
  permit,
  selectedTarget,
  setSelectedTarget,
  stagedBytes,
  stagedCount,
  targets,
  totalPackageBytes,
  type,
  uploadedBytes,
  uploadingCount,
}: {
  build: VisitBuild;
  buildCode: string;
  files: VisitFile[];
  onClose: () => void;
  onStageCapturedFile: (file: File) => void;
  onStageFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadStaged: () => void;
  open: boolean;
  permit?: VisitPermit | null;
  selectedTarget: string;
  setSelectedTarget: (target: string) => void;
  stagedBytes: number;
  stagedCount: number;
  targets: VisitTarget[];
  totalPackageBytes: number;
  type: DrawerKey;
  uploadedBytes: number;
  uploadingCount: number;
}) {
  const title = {
    capture: "Capture evidence",
    guide: "Field Guidance",
    location: "Site Location",
    permit: "Build Permit",
    scope: "Visit Scope",
    uploaded: "Uploaded Evidence",
  }[type];

  return (
    <Drawer
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      open={open}
      position="bottom"
    >
      <DrawerPopup className="max-h-[82svh] md:mx-auto md:max-w-2xl" showBar>
        <header className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <DrawerTitle>{title}</DrawerTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              {type === "location"
                ? `${buildCode} · ${deriveAddress(build)}`
                : type === "permit"
                  ? permit
                    ? permitDisplayName(permit)
                    : "No permit attached"
                  : type === "scope"
                    ? `${targets.length} milestones`
                    : type === "uploaded"
                      ? `${files.length} files · ${formatSiteVisitBytes(files.reduce((sum, file) => sum + file.sizeBytes, 0))}`
                      : type === "capture"
                        ? `${stagedCount} staged · ${formatSiteVisitBytes(totalPackageBytes)} package`
                        : "Inspection checklist"}
            </p>
          </div>
          <Button onClick={onClose} size="icon" type="button" variant="ghost">
            <X />
          </Button>
        </header>
        <DrawerPanel className="p-4" scrollFade={false}>
          {type === "location" ? (
            <LocationPanel build={build} buildCode={buildCode} />
          ) : type === "permit" ? (
            <PermitPanel permit={permit} />
          ) : type === "scope" ? (
            <ScopePanel targets={targets} />
          ) : type === "uploaded" ? (
            <EvidenceGrid files={files} targets={targets} variant="uploaded" />
          ) : type === "capture" ? (
            <SiteVisitCapturePanel
              onStageCapturedFile={onStageCapturedFile}
              onStageFiles={onStageFiles}
              onUploadStaged={onUploadStaged}
              selectedTarget={selectedTarget}
              setSelectedTarget={setSelectedTarget}
              stagedBytes={stagedBytes}
              stagedCount={stagedCount}
              targets={targets}
              totalPackageBytes={totalPackageBytes}
              uploadedBytes={uploadedBytes}
              uploadingCount={uploadingCount}
              variant="drawer"
            />
          ) : (
            <GuidePanel targets={targets} />
          )}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}

function LocationPanel({
  build,
  buildCode,
}: {
  build: VisitBuild;
  buildCode: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid min-h-56 place-items-center rounded-lg border bg-muted text-center text-muted-foreground">
        <div>
          <MapPin className="mx-auto mb-2 size-8 text-primary" />
          <p className="font-medium">Satellite image under construction</p>
          <p className="text-xs">02 / Site plan A.01</p>
        </div>
      </div>
      <Frame>
        <FramePanel className="p-4">
          <div className="flex justify-between gap-3 text-xs uppercase tracking-[0.16em]">
            <span>Parcel · {buildCode}</span>
            <span>Lat 27.84 / Lon -82.71</span>
          </div>
          <h3 className="mt-4 font-semibold text-primary text-sm uppercase tracking-[0.18em]">
            Site address
          </h3>
          <p className="mt-2 font-semibold text-2xl">{deriveAddress(build)}</p>
          <p className="text-muted-foreground">{deriveCityLine(build)} 33781</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <InfoItem label="Build" value={buildCode} />
            <InfoItem label="Parcel" value="19-30-16-00000-110-0700" />
            <InfoItem label="County" value="Pinellas" />
            <InfoItem label="Zone" value="R-2" />
          </dl>
          <Button className="mt-5 w-full" disabled variant="outline">
            Open directions — under construction
          </Button>
        </FramePanel>
      </Frame>
    </div>
  );
}

function ScopePanel({ targets }: { targets: VisitTarget[] }) {
  return (
    <div className="grid gap-4">
      {targets.map((target, index) => (
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
            <div className="divide-y">
              {(visitSubmilestones(target).length
                ? visitSubmilestones(target)
                : [
                    {
                      key: "exterior-wall-framing",
                      name: "Exterior wall framing & sheathing",
                    },
                    {
                      key: "roof-trusses",
                      name: "Roof trusses set & strapped",
                    },
                  ]
              )
                .slice(0, 4)
                .map((submilestone, subIndex) => (
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
          </FramePanel>
        </Frame>
      ))}
    </div>
  );
}

function GuidePanel({ targets }: { targets: VisitTarget[] }) {
  const sections = guidanceSectionsForTargets(targets);
  return (
    <div className="grid gap-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.18em]">
            {section.title}
          </h3>
          <div className="mt-3">
            <FieldRichTextPreview
              ariaLabel={section.title}
              value={section.html}
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
  body,
  detailItems = [],
  icon,
  stamp,
  title,
  tone,
}: {
  body: string;
  detailItems?: [string, string][];
  icon: React.ReactNode;
  stamp?: string;
  title: string;
  tone: "danger" | "neutral" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-900"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
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
  const subtitle = build?.subtitle ?? "";
  const [address] = subtitle.split("·").map((part) => part.trim());
  return address || "1428 Shoreline Ave";
}

function deriveCityLine(build?: VisitBuild | null) {
  const address = deriveAddress(build);
  if (address.includes(",")) {
    return address;
  }
  return "Pinellas Park, FL";
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
    const label = shortMilestoneLabel(target.milestoneName);
    const guidance = normalizedGuidance(target);
    return [
      {
        html: guidance.whatToVerify,
        title: `${code} · ${label} — What to verify`,
      },
      {
        html: guidance.cameraAngles,
        title: `${code} · ${label} — Required photo angles`,
      },
    ].filter((section) => section.html.trim().length > 0);
  });

  return sections.length > 0 ? sections : FALLBACK_GUIDE_SECTIONS;
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

function tokenTail(token: string) {
  return `...${token.slice(-4).toUpperCase()}`;
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
