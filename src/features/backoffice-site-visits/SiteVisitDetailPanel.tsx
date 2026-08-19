"use client";

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

import {
  absoluteSiteVisitUrl,
  formatTokenCountdown,
  operationalStatusBadgeVariant,
  operationalStatusLabel,
  tokenStateLabel,
} from "./site-visit-format.ts";
import type { BrokerageSiteVisitRow } from "./site-visit-types.ts";

export interface SiteVisitCancellationInput {
  buildId: string;
  reason: string;
  visitId: string;
}

export function SiteVisitDetailSheet({
  now,
  onCancel,
  onClose,
  onCopyLink,
  open,
  showBuildLink = true,
  showFieldLink = true,
  visit,
}: {
  now: number;
  onCancel?: (visit: BrokerageSiteVisitRow) => void;
  onClose: () => void;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  open: boolean;
  showBuildLink?: boolean;
  showFieldLink?: boolean;
  visit: BrokerageSiteVisitRow | null;
}) {
  if (!visit) {
    return null;
  }

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Site Visit · {visit.milestoneName}</SheetTitle>
          <SheetDescription>
            {visit.buildName} · {visit.buildDisplayId}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-4">
          <SiteVisitDetailPanel
            now={now}
            onCancel={onCancel}
            onCopyLink={onCopyLink}
            showBuildLink={showBuildLink}
            showFieldLink={showFieldLink}
            visit={visit}
          />
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}

export function SiteVisitDetailPanel({
  now,
  onCancel,
  onCopyLink,
  showBuildLink = true,
  showFieldLink = true,
  visit,
}: {
  now: number;
  onCancel?: (visit: BrokerageSiteVisitRow) => void;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  showBuildLink?: boolean;
  showFieldLink?: boolean;
  visit: BrokerageSiteVisitRow;
}) {
  const msRemaining = Math.max(0, visit.tokenExpiresAt - now);
  const canCancel =
    onCancel !== undefined &&
    (visit.operationalStatus === "open" ||
      visit.operationalStatus === "in_field" ||
      visit.operationalStatus === "expired");

  return (
    <div className="flex flex-col gap-4" data-testid="site-visit-detail-panel">
      <div className="flex flex-wrap gap-2">
        <Badge variant={operationalStatusBadgeVariant(visit.operationalStatus)}>
          {operationalStatusLabel(visit.operationalStatus)}
        </Badge>
        {showFieldLink ? (
          <Badge variant="outline">{tokenStateLabel(visit.tokenState)}</Badge>
        ) : null}
        {visit.geofenceFlagged ? (
          <Badge variant="warning">
            <AlertTriangle aria-hidden="true" />
            Location unverified evidence
          </Badge>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <DetailFact label="Visit ID" value={visit.visitId} />
        <DetailFact label="Builder" value={visit.builderName} />
        <DetailFact
          label="Site"
          value={visit.location || "No address on file"}
        />
        <DetailFact label="Scheduled" value={visit.scheduledDateLabel} />
        {showFieldLink &&
        (visit.operationalStatus === "open" ||
          visit.operationalStatus === "in_field") ? (
          <DetailFact
            label="Token expires in"
            tabular
            value={formatTokenCountdown(msRemaining)}
          />
        ) : null}
        {visit.completedAt ? (
          <DetailFact
            label="Completed"
            value={new Date(visit.completedAt).toLocaleString()}
          />
        ) : null}
      </dl>

      {visit.note ? (
        <DetailSection label="Request note">{visit.note}</DetailSection>
      ) : null}
      <DetailSection label="Field report">
        {visit.recordNote ? (
          visit.recordNoteFormat === "html" ? (
            <FieldRichTextPreview
              ariaLabel="Field report"
              className="mt-1"
              value={visit.recordNote}
            />
          ) : (
            visit.recordNote
          )
        ) : (
          <span className="text-muted-foreground">
            No field report has been submitted.
          </span>
        )}
      </DetailSection>
      {visit.recommendedOutcome ? (
        <DetailSection label="Recommended outcome">
          <span className="capitalize">{visit.recommendedOutcome}</span>
        </DetailSection>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showFieldLink ? (
          <Button
            onClick={() => onCopyLink(visit)}
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            Copy field link
          </Button>
        ) : null}
        {showBuildLink ? (
          <Button
            render={
              <Link
                params={{ buildId: String(visit.buildId) }}
                search={{ milestone: visit.milestoneKey }}
                to="/backoffice/builds/$buildId"
              />
            }
          >
            Open build workspace
            <ExternalLink aria-hidden="true" />
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            onClick={() => onCancel(visit)}
            type="button"
            variant="destructive"
          >
            <XCircle aria-hidden="true" />
            Cancel visit
          </Button>
        ) : null}
      </div>

      {visit.operationalStatus === "complete" ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Site Visit complete</AlertTitle>
          <AlertDescription>
            Milestone decisions and Draw release stay in the Build Workspace.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function SiteVisitCancellationDialog({
  onCancelVisit,
  onOpenChange,
  visit,
}: {
  onCancelVisit: (input: SiteVisitCancellationInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  visit: BrokerageSiteVisitRow | null;
}) {
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!visit) {
      setPending(false);
      setReason("");
    }
  }, [visit]);

  const handleCancel = async () => {
    if (!visit || reason.trim().length < 3) {
      return;
    }
    setPending(true);
    try {
      await onCancelVisit({
        buildId: String(visit.buildId),
        reason: reason.trim(),
        visitId: visit.visitId,
      });
      toast.success("Site visit cancelled");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!(open || pending)) {
          onOpenChange(false);
        }
      }}
      open={visit !== null}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel site visit</AlertDialogTitle>
          <AlertDialogDescription>
            Cancelling is audited. Provide a reason the lender team can defend
            in the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 px-6 pb-6">
          <Label htmlFor="site-visit-cancel-reason">Reason</Label>
          <Textarea
            autoFocus
            disabled={pending}
            id="site-visit-cancel-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this Visit being cancelled?"
            rows={3}
            value={reason}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogClose
            disabled={pending}
            render={<Button type="button" variant="ghost" />}
          >
            Keep visit
          </AlertDialogClose>
          <Button
            disabled={reason.trim().length < 3 || pending}
            onClick={handleCancel}
            type="button"
            variant="destructive"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <XCircle aria-hidden="true" />
            )}
            Cancel visit
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

async function copySiteVisitLink(visit: BrokerageSiteVisitRow) {
  try {
    await navigator.clipboard.writeText(absoluteSiteVisitUrl(visit.url));
    toast.success("Site visit link copied");
  } catch {
    toast.error("Could not copy link");
  }
}

export { copySiteVisitLink };

function DetailFact({
  label,
  tabular = false,
  value,
}: {
  label: string;
  tabular?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          tabular ? "mt-1 font-medium tabular-nums" : "mt-1 font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function DetailSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <h4 className="text-muted-foreground text-xs">{label}</h4>
      <div>{children}</div>
    </div>
  );
}
