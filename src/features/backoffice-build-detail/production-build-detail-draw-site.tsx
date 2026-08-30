"use client";

import {
  Copy,
  ExternalLink,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  lazy,
  Suspense,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatDate, } from "./format";
import type {
  ProductionEvidenceRow,
  ProductionSiteVisit,
} from "./production-build-detail-contracts.ts";
import {
  formatSiteVisitDateTime,
  siteVisitStateLabel,
  siteVisitTokenStateLabel,
} from "./production-build-detail-projection.ts";
import {
  evidenceStatusLabel,
  evidenceStatusVariant,
} from "./production-build-detail-evidence-utils.ts";
import { EvidenceAssetPackage } from "./production-build-detail-evidence.tsx";

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function EvidenceReviewSummary({ row }: { row: ProductionEvidenceRow }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge variant={evidenceStatusVariant(row.status)}>
        {evidenceStatusLabel(row.status)}
      </Badge>
      <Badge variant={row.locationState === "verified" ? "success" : "warning"}>
        {row.locationState === "verified"
          ? "Location verified"
          : "Location unverified"}
      </Badge>
      <Badge size="sm" variant="outline">
        {row.submittedAt ? formatDate(row.submittedAt) : "Not dated"}
      </Badge>
    </div>
  );
}

function SiteVisitReviewState({
  canCancel,
  canRegenerate,
  onCancel,
  onRegenerate,
  pendingAction,
  visit,
}: {
  canCancel: boolean;
  canRegenerate: boolean;
  onCancel: () => void;
  onRegenerate: () => void;
  pendingAction: string | null;
  visit: ProductionSiteVisit;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const tokenUrl = visit.url;
  const tokenValue = visit.visitId;
  const tokenExpired = Boolean(
    visit.tokenExpiresAt && visit.tokenExpiresAt <= Date.now()
  );
  const canOperateOnToken =
    visit.status !== "complete" &&
    visit.status !== "cancelled" &&
    !visit.tokenConsumedAt;
  const canUseToken = canOperateOnToken && !tokenExpired;

  return (
    <div className="grid gap-3" data-testid="site-visit-token-panel">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <ReviewFact label="State" value={siteVisitStateLabel(visit)} />
        <ReviewFact
          label="Ordered"
          value={formatSiteVisitDateTime(visit.requestedAt)}
        />
        <ReviewFact
          label="Opened"
          value={formatSiteVisitDateTime(visit.tokenOpenedAt)}
        />
        <ReviewFact
          label="Token state"
          value={siteVisitTokenStateLabel(visit)}
        />
        <ReviewFact
          label="Token expires"
          value={formatSiteVisitDateTime(visit.tokenExpiresAt)}
        />
        <ReviewFact
          label="Completed"
          value={formatSiteVisitDateTime(visit.completedAt)}
        />
      </dl>

      <div className="grid gap-3 rounded-md border bg-card p-3">
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs uppercase">Token</p>
          <code
            className="min-w-0 break-all rounded-sm bg-muted px-2 py-1 text-xs"
            data-testid="site-visit-token-value"
          >
            {tokenValue}
          </code>
        </div>
        {tokenUrl ? (
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs uppercase">
              Token link
            </p>
            <code
              className="min-w-0 break-all rounded-sm bg-muted px-2 py-1 text-xs"
              data-testid="site-visit-token-url"
            >
              {tokenUrl}
            </code>
          </div>
        ) : null}
        {visit.requestedTime ? (
          <p className="text-muted-foreground text-xs">
            Requested time: {visit.requestedTime}
          </p>
        ) : null}
        {visit.tokenConsumedAt ? (
          <p className="text-muted-foreground text-xs">
            Token consumed {formatSiteVisitDateTime(visit.tokenConsumedAt)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {tokenUrl && canUseToken ? (
          <Button
            render={
              // biome-ignore lint/a11y/useAnchorContent: Button supplies the rendered anchor text.
              <a
                aria-label="Open site visit token link"
                href={tokenUrl}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" />
            Open token link
          </Button>
        ) : null}
        {canUseToken ? (
          <Button
            onClick={() => copyToClipboard(tokenValue)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            {isCopied ? "Copied" : "Copy token"}
          </Button>
        ) : null}
        {tokenUrl && canUseToken ? (
          <Button
            onClick={() => copyToClipboard(tokenUrl)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            Copy link
          </Button>
        ) : null}
        <Button
          disabled={
            !(canRegenerate && canOperateOnToken) || pendingAction !== null
          }
          loading={pendingAction === "regenerate-site-visit-token"}
          onClick={onRegenerate}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
          Regenerate token
        </Button>
        {canOperateOnToken ? (
          <Button
            disabled={!canCancel || pendingAction !== null}
            loading={pendingAction === "cancel-site-visit"}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            <XCircle aria-hidden="true" />
            Cancel site visit
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CompletedSiteVisitReview({
  onOpenCanonicalTarget,
  rows,
  visit,
}: {
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  rows: ProductionEvidenceRow[];
  visit: ProductionSiteVisit;
}) {
  return (
    <div className="grid gap-3" data-testid="completed-site-visit-review">
      {visit.recordNote ? (
        visit.recordNoteFormat === "html" ? (
          <Suspense fallback={null}>
            <LazyFieldRichTextPreview
              ariaLabel="Completed site visit report"
              value={visit.recordNote}
            />
          </Suspense>
        ) : (
          <p className="rounded-md border bg-card p-3 text-sm">
            {visit.recordNote}
          </p>
        )
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          Site visit is complete, but no report note is attached.
        </p>
      )}
      {rows.length > 0 ? (
        rows.map((row) => {
          const submilestoneId = row.submilestoneId;
          return (
            <div
              className="rounded-md border bg-card p-3"
              data-testid={`milestone-review-site-visit-${row.id}`}
              key={row.id}
            >
              <EvidenceReviewSummary row={row} />
              {submilestoneId && onOpenCanonicalTarget ? (
                <Button
                  aria-label={`Open Sub-milestone evidence for ${row.milestoneName}`}
                  onClick={() =>
                    onOpenCanonicalTarget(
                      {
                        kind: "submilestone",
                        submilestoneId,
                      },
                      { selectedTab: "review" }
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Open sub-milestone review
                </Button>
              ) : null}
              <EvidenceAssetPackage row={row} />
            </div>
          );
        })
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          No site visit files are attached.
        </p>
      )}
    </div>
  );
}
