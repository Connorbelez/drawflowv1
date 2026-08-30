import { useMutation, useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { useMediaQuery } from "#/hooks/use-media-query.ts";
import { evidenceMimeTypeForFile } from "#/lib/evidence-image-normalization.ts";
import {
  richTextHtmlHasText,
  richTextHtmlToPlainText,
} from "#/lib/rich-text-html.ts";
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
  uploadSiteVisitStagedEvidence,
} from "./site-visit-evidence-staging";
import {
  contractorIdsForEvidenceTarget,
  contractorRatingTargetsForScope,
  createEvidencePreviewUrl,
  type DrawerKey,
  deriveBuildCode,
  focusSiteVisitSection,
  parseQualityRating,
  parseSelectedVisitTarget,
  reportSubmissionBlockers,
  revokeEvidencePreviewUrl,
  type StagedItem,
  type SubmittedSummary,
  type VisitState,
} from "./site-visit-token-route-contracts";
import {
  DesktopGuidePanel,
  DesktopLocationPanel,
  DesktopPermitPanel,
  DesktopScopePanel,
  DesktopUploadedPanel,
  SiteVisitDrawer,
} from "./site-visit-token-route-desktop";
import {
  locationAttemptFromError,
  locationAttemptFromPosition,
  type SiteVisitLocationAttempt,
} from "./site-visit-token-route-model";
import { LocationAttemptSummary } from "./site-visit-token-route-panels";
import {
  BottomNav,
  EvidenceGrid,
  MobileShell,
  SectionTitle,
  SiteVisitCapturePanel,
} from "./site-visit-token-route-shell";
import {
  SiteVisitLoadingState,
  SiteVisitSubmittedState,
  SiteVisitUnavailableState,
} from "./site-visit-token-route-status";
import {
  useSiteVisitConnectivity,
  useSiteVisitReplacementRequest,
} from "./site-visit-token-route-workflow";

export function SiteVisitTokenRouteContent({
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
  const [replacementReason, setReplacementReason] = useState(
    "A new site visit is required for this Build."
  );
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
  const isOnline = useSiteVisitConnectivity();
  const {
    replacementError,
    replacementReference,
    requestingReplacement,
    requestNewLink,
  } = useSiteVisitReplacementRequest({
    buildId,
    requestReplacement,
    siteVisitToken,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
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
    return <SiteVisitLoadingState buildId={buildId} />;
  }

  if (submittedSummary) {
    return (
      <SiteVisitSubmittedState
        buildId={buildId}
        initialBuild={visitState.build ?? initialVisitState?.build ?? null}
        submittedSummary={submittedSummary}
      />
    );
  }

  if (!visitState.available) {
    return (
      <SiteVisitUnavailableState
        buildId={buildId}
        onReplacementReasonChange={setReplacementReason}
        onRequestNewLink={() => requestNewLink(replacementReason)}
        replacementError={replacementError}
        replacementReason={replacementReason}
        replacementReference={replacementReference}
        requestingReplacement={requestingReplacement}
        visitState={visitState}
      />
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
