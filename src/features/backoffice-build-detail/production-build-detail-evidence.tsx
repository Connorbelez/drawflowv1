"use client";

import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FileText,
  ImageIcon,
  MessageSquare,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import type * as React from "react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import {
  convertHeicEvidenceBlobToJpeg,
  isBrowserPreviewableImageMime,
  isHeicLikeEvidenceImage,
} from "#/lib/evidence-image-normalization.ts";
import { cn } from "#/lib/utils.ts";
import type { ActiveBuildTimelineWorkspaceProps } from "./ActiveBuildTimelineWorkspace";
import {
  BuildDetailTabFallback,
  LazyActiveBuildTimelineWorkspace,
} from "./lazy-build-detail-tabs.tsx";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatCents, formatDate, } from "./format";
import {
  type SiteVisitOrderRequest,
} from "./SiteVisitOrderDialog.tsx";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionEvidenceAsset,
  ProductionEvidenceRow,
} from "./production-build-detail-contracts.ts";
import {
  buildBuilderEvidenceRows,
  buildCompletedSiteVisitRows,
  evidenceImagePreviewUrl,
  evidenceImageSourceUrl,
  evidenceStatusLabel,
  evidenceStatusVariant,
  formatBytes,
  isUsableEvidenceUrl,
} from "./production-build-detail-evidence-utils.ts";

export function ProductionTimelineTab({
  activeBuildId,
  actions,
  detail,
  onOpenCanonicalTarget,
  onRequestSiteVisit,
  timelineWorkspace,
  viewerRole,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  if (
    !(activeBuildId && workosOrganizationId) ||
    timelineWorkspace === undefined
  ) {
    return (
      <Frame data-testid="production-build-timeline-loading">
        <FramePanel className="grid min-h-[28rem] place-items-center p-6 text-muted-foreground text-sm">
          Loading production timeline workspace...
        </FramePanel>
      </Frame>
    );
  }
  if (timelineWorkspace === null) {
    return (
      <Frame data-testid="production-build-timeline-unavailable">
        <FramePanel className="p-4 text-sm">
          Production timeline workspace is unavailable for this build.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div data-testid="production-build-timeline">
      <Suspense fallback={<BuildDetailTabFallback label="timeline" />}>
        <LazyActiveBuildTimelineWorkspace
          appPermissions={detail.appPermissions}
          backofficeHref="/backoffice"
          buildHref={`/backoffice/builds/${detail.build._id}`}
          buildId={activeBuildId as any}
          canApproveMilestones={Boolean(actions?.approveMilestone)}
          canRecordSiteVisits={Boolean(actions?.reviewEvidence)}
          canRequestMilestoneInfo={Boolean(actions?.requestMilestoneInfo)}
          canRequestSiteVisits={Boolean(actions?.assignSiteVisit)}
          canReviewDraws={Boolean(actions?.approveDraw && actions?.rejectDraw)}
          initialRole={viewerRole}
          onOpenCanonicalTarget={onOpenCanonicalTarget}
          onRequestSiteVisit={onRequestSiteVisit}
          workosOrganizationId={workosOrganizationId}
          workspace={timelineWorkspace}
        />
      </Suspense>
    </div>
  );
}

export function ProductionEvidenceTab({
  actions,
  detail,
  focusedReference,
  onOpenMilestone,
  onOpenCanonicalTarget,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  onOpenMilestone: (milestoneKey: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  projection: ProductionBuildProjection;
}) {
  const builderEvidence = useMemo(
    () => buildBuilderEvidenceRows(detail, projection),
    [detail, projection]
  );
  const completedSiteVisits = useMemo(
    () => buildCompletedSiteVisitRows(detail, projection),
    [detail, projection]
  );
  const locationUnverifiedCount = builderEvidence.filter(
    (row) => row.locationState === "unverified"
  ).length;
  const totalEvidence = builderEvidence.length + completedSiteVisits.length;

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="production-build-evidence"
    >
      <Frame>
        <FramePanel className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Unified evidence</Badge>
                {locationUnverifiedCount > 0 ? (
                  <Badge variant="warning">
                    {locationUnverifiedCount} location unverified
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-3 font-semibold text-lg">Evidence</h2>
              <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
                Builder milestone evidence and completed site visits are grouped
                here with source labels, review state, and milestone context.
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 text-sm lg:min-w-[24rem]">
              <EvidenceSummaryStat
                icon={<FileCheck2 aria-hidden="true" className="size-4" />}
                label="Builder"
                value={builderEvidence.length}
              />
              <EvidenceSummaryStat
                icon={<ClipboardCheck aria-hidden="true" className="size-4" />}
                label="Site visits"
                value={completedSiteVisits.length}
              />
              <EvidenceSummaryStat
                icon={<CheckCircle2 aria-hidden="true" className="size-4" />}
                label="Total"
                value={totalEvidence}
              />
            </div>
          </div>
        </FramePanel>
      </Frame>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <EvidenceSourcePanel
          actions={actions}
          emptyLabel="No builder-submitted milestone evidence yet."
          focusedReference={focusedReference}
          onOpenCanonicalTarget={onOpenCanonicalTarget}
          onOpenMilestone={onOpenMilestone}
          rows={builderEvidence}
          title="Builder Submitted Evidence"
        />
        <EvidenceSourcePanel
          emptyLabel="No completed site visits yet."
          focusedReference={focusedReference}
          onOpenCanonicalTarget={onOpenCanonicalTarget}
          onOpenMilestone={onOpenMilestone}
          rows={completedSiteVisits}
          title="Completed Site Visits"
        />
      </section>
    </div>
  );
}

function EvidenceSummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/70 px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 font-semibold text-lg tabular-nums">{value}</p>
    </div>
  );
}

function EvidenceSourcePanel({
  actions,
  emptyLabel,
  focusedReference,
  onOpenCanonicalTarget,
  onOpenMilestone,
  rows,
  title,
}: {
  actions?: ProductionBuildDetailActions;
  emptyLabel: string;
  focusedReference?: string;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenMilestone: (milestoneKey: string) => void;
  rows: ProductionEvidenceRow[];
  title: string;
}) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(
    rows[0]?.id ?? null
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (expandedRowId && rows.some((row) => row.id === expandedRowId)) {
      return;
    }
    setExpandedRowId(rows[0]?.id ?? null);
  }, [expandedRowId, rows]);

  useEffect(() => {
    if (!focusedReference) {
      return;
    }
    const focusedRow = rows.find((row) =>
      row.assets.some(
        (asset) =>
          focusedReference === `evidenceAsset:${asset._id}` ||
          focusedReference === `evidencePackage:${asset.evidenceKey}`
      )
    );
    if (focusedRow) {
      setExpandedRowId(focusedRow.id);
    }
  }, [focusedReference, rows]);

  const reviewEvidence = async (
    row: ProductionEvidenceRow,
    accepted: boolean
  ) => {
    if (!actions?.reviewEvidence || pendingAction) {
      return;
    }
    const actionKey = `${accepted ? "approve" : "request-info"}:${row.id}`;
    setPendingAction(actionKey);
    try {
      await actions.reviewEvidence({
        accepted,
        milestoneKey: row.milestoneKey,
        note: accepted
          ? "Evidence approved from build evidence tab."
          : "More information requested from build evidence tab.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-semibold text-sm">{title}</h3>
          <Badge size="sm" variant={rows.length > 0 ? "secondary" : "outline"}>
            {rows.length}
          </Badge>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <EvidenceRowItem
                actions={actions}
                expanded={expandedRowId === row.id}
                key={row.id}
                onOpenCanonicalTarget={onOpenCanonicalTarget}
                onOpenMilestone={onOpenMilestone}
                onReviewEvidence={reviewEvidence}
                onToggleExpanded={() =>
                  setExpandedRowId((current) =>
                    current === row.id ? null : row.id
                  )
                }
                pendingAction={pendingAction}
                row={row}
              />
            ))}
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

function EvidenceRowItem({
  actions,
  expanded,
  onOpenCanonicalTarget,
  onOpenMilestone,
  onReviewEvidence,
  onToggleExpanded,
  pendingAction,
  row,
}: {
  actions?: ProductionBuildDetailActions;
  expanded: boolean;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenMilestone: (milestoneKey: string) => void;
  onReviewEvidence: (
    row: ProductionEvidenceRow,
    accepted: boolean
  ) => Promise<void>;
  onToggleExpanded: () => void;
  pendingAction: string | null;
  row: ProductionEvidenceRow;
}) {
  const evidenceDate = row.submittedAt ?? row.completedAt;
  const submittedLabel =
    evidenceDate === undefined ? "Not dated" : formatDate(evidenceDate);
  const statusAlreadyReportsLocation = row.status
    .toLowerCase()
    .includes("location");
  const approveActionKey = `approve:${row.id}`;
  const requestInfoActionKey = `request-info:${row.id}`;

  return (
    <div
      className="px-4 py-4"
      data-testid={`production-evidence-row-${row.id}`}
    >
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.source === "builder" ? "info" : "success"}>
              {row.source === "builder" ? (
                <FileCheck2 aria-hidden="true" className="size-3" />
              ) : (
                <UserCheck aria-hidden="true" className="size-3" />
              )}
              {row.source === "builder" ? "Builder submitted" : "Site visit"}
            </Badge>
            <Badge variant={evidenceStatusVariant(row.status)}>
              {evidenceStatusLabel(row.status)}
            </Badge>
            {row.locationState === "unverified" &&
            !statusAlreadyReportsLocation ? (
              <Badge variant="warning">Location unverified</Badge>
            ) : row.locationState === "verified" ? (
              <Badge variant="success">Location verified</Badge>
            ) : null}
            <Badge size="sm" variant="outline">
              {row.assets.length} file{row.assets.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <h4 className="mt-2 font-semibold text-sm">{row.milestoneName}</h4>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Milestone</dt>
              <dd className="font-medium">{row.milestoneKey}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {row.source === "builder" ? "Submitted" : "Completed"}
              </dt>
              <dd className="font-medium tabular-nums">{submittedLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Availability</dt>
              <dd className="font-medium tabular-nums">
                {row.amountCents === undefined
                  ? "Not set"
                  : formatCents(row.amountCents)}
              </dd>
            </div>
          </dl>
          {row.note ? (
            row.noteFormat === "html" ? (
              <Suspense fallback={null}>
                <LazyFieldRichTextPreview
                  ariaLabel={`${row.milestoneName} field report`}
                  className="mt-3 max-w-3xl"
                  value={row.note}
                />
              </Suspense>
            ) : (
              <p className="mt-3 max-w-3xl text-muted-foreground text-xs">
                {row.note}
              </p>
            )
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 2xl:justify-end">
          <Button
            onClick={onToggleExpanded}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180"
              )}
            />
            {expanded ? "Hide evidence" : "View evidence"}
          </Button>
          <Button
            onClick={() => {
              if (row.submilestoneId && onOpenCanonicalTarget) {
                onOpenCanonicalTarget(
                  {
                    kind: "submilestone",
                    submilestoneId: row.submilestoneId,
                  },
                  { selectedTab: "evidence" }
                );
                return;
              }
              onOpenMilestone(row.milestoneKey);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {row.submilestoneId ? "Open sub-milestone" : "Open milestone"}
          </Button>
          {row.source === "builder" && actions?.reviewEvidence ? (
            <>
              <Button
                loading={pendingAction === approveActionKey}
                onClick={() => void onReviewEvidence(row, true)}
                size="sm"
                type="button"
                variant="default"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Approve evidence
              </Button>
              <Button
                loading={pendingAction === requestInfoActionKey}
                onClick={() => void onReviewEvidence(row, false)}
                size="sm"
                type="button"
                variant="outline"
              >
                <MessageSquare aria-hidden="true" className="size-4" />
                Request info
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {expanded ? <EvidenceAssetPackage row={row} /> : null}
    </div>
  );
}

export function EvidenceAssetPackage({ row }: { row: ProductionEvidenceRow }) {
  return (
    <div
      className="mt-4 rounded-lg border bg-background/60 p-3"
      data-testid={`production-evidence-package-${row.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Evidence package</p>
          <p className="text-muted-foreground text-xs">
            Files attached to {row.milestoneName}
          </p>
        </div>
        <Badge variant={row.assets.length > 0 ? "secondary" : "outline"}>
          {row.assets.length} file{row.assets.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {row.assets.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          No files are attached to this evidence package yet. The milestone
          claim is still visible for review, but there are no uploaded assets to
          inspect.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {row.assets.map((asset) => (
            <EvidenceAssetTile asset={asset} key={asset.evidenceKey} />
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceAssetTile({ asset }: { asset: ProductionEvidenceAsset }) {
  const canOpenAsset = isUsableEvidenceUrl(asset.previewUrl);
  return (
    <div
      className="min-w-0 rounded-lg border bg-card p-3"
      data-collaboration-focus={
        asset._id ? `evidenceAsset:${asset._id}` : undefined
      }
      data-testid={`production-evidence-asset-${asset.evidenceKey}`}
    >
      <div
        className="overflow-hidden rounded-md border bg-background"
        data-collaboration-focus={`evidencePackage:${asset.evidenceKey}`}
      >
        <EvidenceAssetPreview asset={asset} canOpenAsset={canOpenAsset} />
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate font-medium text-sm">{asset.label}</p>
        <p className="truncate text-muted-foreground text-xs">
          {asset.fileName}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="truncate">{asset.mimeType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tag</dt>
            <dd className="truncate">{asset.tag}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{asset.locationVerified ? "Verified" : "Unverified"}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canOpenAsset ? (
          <Button
            render={
              <a
                href={asset.previewUrl ?? ""}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Open file
          </Button>
        ) : (
          <Button disabled size="sm" type="button" variant="outline">
            <ExternalLink aria-hidden="true" className="size-4" />
            File unavailable
          </Button>
        )}
      </div>
    </div>
  );
}

function EvidenceAssetPreview({
  asset,
  canOpenAsset,
}: {
  asset: ProductionEvidenceAsset;
  canOpenAsset: boolean;
}) {
  const isImage = asset.mimeType.startsWith("image/");
  const canRenderDirectly = isBrowserPreviewableImageMime(asset.mimeType);
  const needsHeicConversion = isHeicLikeEvidenceImage({
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  });
  const shouldAutoPrepareHeic = needsHeicConversion && canOpenAsset;
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(shouldAutoPrepareHeic);
  const [heicPreviewRequested, setHeicPreviewRequested] = useState(
    shouldAutoPrepareHeic
  );
  const [heicPreviewUrl, setHeicPreviewUrl] = useState<string | null>(null);
  const heicPreviewAbortRef = useRef<AbortController | null>(null);
  const heicObjectUrlRef = useRef<string | null>(null);
  const displayUrl =
    needsHeicConversion && canOpenAsset && heicPreviewRequested
      ? heicPreviewUrl
      : canRenderDirectly && canOpenAsset
        ? asset.previewUrl
        : null;

  useEffect(
    () => () => {
      heicPreviewAbortRef.current?.abort();
      if (heicObjectUrlRef.current) {
        URL.revokeObjectURL(heicObjectUrlRef.current);
      }
    },
    []
  );

  const requestHeicPreview = useCallback(async () => {
    heicPreviewAbortRef.current?.abort();
    if (heicObjectUrlRef.current) {
      URL.revokeObjectURL(heicObjectUrlRef.current);
      heicObjectUrlRef.current = null;
    }
    const controller = new AbortController();
    heicPreviewAbortRef.current = controller;
    setImageFailed(false);
    setImageLoading(true);
    setHeicPreviewRequested(true);
    setHeicPreviewUrl(null);

    try {
      const sourceProxyUrl = evidenceImageSourceUrl(asset.previewUrl);
      if (!sourceProxyUrl) {
        throw new Error("HEIC source proxy is unavailable.");
      }
      const response = await fetch(sourceProxyUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Unable to download the original HEIC image.");
      }
      const jpegBlob = await convertHeicEvidenceBlobToJpeg(
        await response.blob(),
        asset.fileName
      );
      if (controller.signal.aborted) {
        return;
      }
      const objectUrl = URL.createObjectURL(jpegBlob);
      heicObjectUrlRef.current = objectUrl;
      setHeicPreviewUrl(objectUrl);
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      const serverFallbackUrl = evidenceImagePreviewUrl(asset.previewUrl);
      if (serverFallbackUrl) {
        setHeicPreviewUrl(serverFallbackUrl);
        return;
      }
      setImageFailed(true);
      setImageLoading(false);
    }
  }, [asset.fileName, asset.previewUrl]);

  useEffect(() => {
    if (shouldAutoPrepareHeic) {
      void requestHeicPreview();
    }
  }, [requestHeicPreview, shouldAutoPrepareHeic]);

  if (needsHeicConversion && canOpenAsset && !heicPreviewRequested) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-4 text-center">
        <ImageIcon
          aria-hidden="true"
          className="size-8 text-muted-foreground"
        />
        <div>
          <p className="font-medium text-sm">HEIC preview converts on demand</p>
          <p className="mt-1 max-w-52 text-muted-foreground text-xs">
            The original file is ready. Load the browser preview only when you
            need to inspect it.
          </p>
        </div>
        <Button
          onClick={() => {
            void requestHeicPreview();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <ImageIcon aria-hidden="true" className="size-4" />
          Load preview
        </Button>
      </div>
    );
  }

  if (needsHeicConversion && imageLoading && !displayUrl) {
    return (
      <div
        aria-live="polite"
        className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center text-muted-foreground"
      >
        <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
        <p className="text-xs">Preparing HEIC preview…</p>
      </div>
    );
  }

  if (isImage && displayUrl && !imageFailed) {
    return (
      <div className="relative aspect-[4/3]">
        <img
          alt={asset.label}
          className={cn(
            "h-full w-full object-cover transition-opacity",
            imageLoading && "opacity-0"
          )}
          decoding="async"
          loading="lazy"
          onError={() => {
            setImageFailed(true);
            setImageLoading(false);
          }}
          onLoad={() => setImageLoading(false)}
          src={displayUrl}
        />
        {imageLoading ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center text-muted-foreground"
          >
            <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
            <p className="text-xs">Converting HEIC preview…</p>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
      {isImage ? (
        <ImageIcon aria-hidden="true" className="size-8" />
      ) : (
        <FileText aria-hidden="true" className="size-8" />
      )}
      {needsHeicConversion ? (
        <>
          <div className="max-w-52 text-xs">
            The HEIC preview could not be converted. You can retry or open the
            original file.
          </div>
          {canOpenAsset ? (
            <Button
              onClick={() => {
                void requestHeicPreview();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry preview
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
