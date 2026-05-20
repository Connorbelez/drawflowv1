import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import {
  Camera,
  CheckCircle2,
  FileText,
  MapPinned,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

const tokenConvex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);


const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const dateTime = (value?: number) => {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

export function SiteVisitTokenRoute({
  buildId,
  initialVisitState,
  siteVisitToken,
}: {
  buildId: string;
  initialVisitState?: any;
  siteVisitToken: string;
}) {
  return (
    <ConvexProvider client={tokenConvex}>
      <SiteVisitTokenRouteContent
        buildId={buildId}
        initialVisitState={initialVisitState}
        siteVisitToken={siteVisitToken}
      />
    </ConvexProvider>
  );
}

function SiteVisitTokenRouteContent({
  buildId,
  initialVisitState,
  siteVisitToken,
}: {
  buildId: string;
  initialVisitState?: any;
  siteVisitToken: string;
}) {
  const liveVisitState = useQuery(api.demo_drawflow.demo_getSiteVisitByToken, {
    buildId,
    token: siteVisitToken,
  });
  const visitState = liveVisitState ?? initialVisitState;
  const generateUploadUrl = useMutation(
    api.demo_drawflow.demo_generateSiteVisitUploadUrl
  );
  const registerFile = useMutation(api.demo_drawflow.demo_registerSiteVisitFile);
  const markOpened = useMutation(api.demo_drawflow.demo_markSiteVisitTokenOpened);
  const submitReport = useMutation(
    api.demo_drawflow.demo_submitTokenizedSiteVisitReport
  );
  const openedRef = useRef(false);
  const [selectedTarget, setSelectedTarget] = useState("visit-wide");
  const [reportNotes, setReportNotes] = useState("");
  const [completionObserved, setCompletionObserved] = useState(true);
  const [recommendedOutcome, setRecommendedOutcome] = useState("approve");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const targets = visitState?.available ? visitState.targets : [];
  const files = visitState?.available ? visitState.files : [];
  const selectedTargetLabel = useMemo(() => {
    if (selectedTarget === "visit-wide") {
      return "Visit-wide";
    }
    return (
      targets.find((target: any) => target.milestoneKey === selectedTarget)
        ?.milestoneName ?? "Milestone"
    );
  }, [selectedTarget, targets]);

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

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    setError("");
    setUploadingCount((current) => current + selectedFiles.length);
    try {
      for (const file of selectedFiles) {
        const uploadUrl = await generateUploadUrl({
          buildId,
          token: siteVisitToken,
        });
        const response = await fetch(uploadUrl, {
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(`Unable to upload ${file.name}.`);
        }
        const { storageId } = await response.json();
        await registerFile({
          buildId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          storageId,
          targetMilestoneKey:
            selectedTarget === "visit-wide" ? undefined : selectedTarget,
          token: siteVisitToken,
        });
        setUploadingCount((current) => Math.max(0, current - 1));
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload site visit file."
      );
      setUploadingCount(0);
    }
  };

  const submit = async () => {
    setError("");
    try {
      await submitReport({
        buildId,
        completionObserved,
        recommendedOutcome,
        reportNotes,
        token: siteVisitToken,
      });
      setSubmitted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit site visit report."
      );
    }
  };

  if (visitState === undefined) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-bg-base p-6 text-foreground">
        <div className="rounded-lg border bg-background p-6 text-sm">
          Loading site visit...
        </div>
      </main>
    );
  }

  if (!visitState.available || submitted) {
    const completed = submitted || visitState.status === "completed";
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-bg-base p-6 text-foreground">
        <section className="w-full max-w-xl rounded-lg border bg-background p-6">
          <div className="flex items-start gap-3">
            {completed ? (
              <CheckCircle2 className="mt-1 size-6 text-emerald-600" />
            ) : (
              <ShieldAlert className="mt-1 size-6 text-destructive" />
            )}
            <div>
              <h1 className="font-semibold text-xl">
                {completed ? "Site visit submitted" : "Site visit unavailable"}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm">
                {completed
                  ? "The report is recorded and this token can no longer be used."
                  : visitState.reason === "expired"
                    ? "This token expired after its one-hour access window."
                    : visitState.reason === "consumed"
                      ? "This token has already been used."
                      : "This token does not match an active site visit."}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-bg-base p-3 text-foreground sm:p-5">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <MapPinned className="size-5 text-primary" />
            <h1 className="font-semibold text-lg">Evidence Site Visit</h1>
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            {visitState.build.name} / token expires{" "}
            {dateTime(visitState.visit.tokenExpiresAt)}
          </p>

          <section className="mt-5 grid gap-3">
            <h2 className="font-semibold text-sm">Visit Scope</h2>
            {targets.map((target: any) => (
              <article
                className="rounded-md border bg-muted/20 p-3"
                key={target._id}
              >
                <div className="font-semibold">{target.milestoneName}</div>
                <div className="mt-1 text-muted-foreground text-xs">
                  Milestone {target.milestoneOrder}
                </div>
                {target.submilestones.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {target.submilestones.map((submilestone: string) => (
                      <Badge key={submilestone} variant="secondary">
                        {submilestone}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground text-xs">
                    No submilestones recorded for this demo milestone.
                  </p>
                )}
              </article>
            ))}
          </section>
        </aside>

        <section className="grid gap-4">
          <div className="rounded-lg border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-xl">Field Evidence</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  Upload photos, PDFs, invoices, notes, or inspection media for
                  this visit.
                </p>
              </div>
              <Badge variant="outline">{selectedTargetLabel}</Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-2 text-sm">
                File target
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  onChange={(event) => setSelectedTarget(event.target.value)}
                  value={selectedTarget}
                >
                  <option value="visit-wide">Visit-wide</option>
                  {targets.map((target: any) => (
                    <option key={target._id} value={target.milestoneKey}>
                      {target.milestoneName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid content-end">
                <span className="sr-only">Upload files</span>
                <input
                  className="hidden"
                  multiple
                  onChange={uploadFiles}
                  type="file"
                />
                <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm">
                  <Upload className="size-4" />
                  Upload Files
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-2">
              {files.map((file: any) => (
                <div
                  className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
                  key={file._id}
                >
                  <div className="grid size-10 place-items-center rounded-md bg-background">
                    {file.mimeType.startsWith("image/") ? (
                      <Camera className="size-5 text-primary" />
                    ) : (
                      <FileText className="size-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {file.fileName}
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {file.mimeType} / {formatBytes(file.sizeBytes)}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {file.targetMilestoneKey ?? "visit-wide"}
                  </Badge>
                </div>
              ))}
              {uploadingCount > 0 ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-900 text-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                  Uploading {uploadingCount} file
                  {uploadingCount === 1 ? "" : "s"}...
                </div>
              ) : null}
              {files.length === 0 && uploadingCount === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                  No files have been uploaded for this visit yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4">
            <h2 className="font-semibold text-xl">Site Visit Report</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm">
                Recommendation
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  onChange={(event) => setRecommendedOutcome(event.target.value)}
                  value={recommendedOutcome}
                >
                  <option value="approve">Recommend approval</option>
                  <option value="needs_information">
                    Needs more information
                  </option>
                  <option value="reject">Recommend rejection</option>
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
                Detailed written report
                <Textarea
                  className="min-h-44"
                  onChange={(event) => setReportNotes(event.currentTarget.value)}
                  placeholder="Record observed work, missing items, access constraints, evidence gathered, and recommendation rationale."
                  value={reportNotes}
                />
              </label>
            </div>

            {error ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Button
                disabled={uploadingCount > 0 || reportNotes.trim().length === 0}
                onClick={() => void submit()}
                type="button"
              >
                <CheckCircle2 />
                Submit Report
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
