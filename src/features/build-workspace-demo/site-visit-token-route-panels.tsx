import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Hammer,
  LoaderCircle,
  MapPin,
  Wrench,
} from "lucide-react";

import { InteractiveSiteMap } from "#/components/maps/interactive-site-map.tsx";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  deriveAddress,
  deriveCityLine,
  deriveStreetLine,
  guidanceSectionsForTargets,
  permitDisplayName,
  permitSourceUrl,
  subCode,
  targetCode,
  type VisitBuild,
  type VisitPermit,
  type VisitTarget,
  visitSubmilestones,
} from "./site-visit-token-route-contracts";
import {
  formatSiteVisitBytes,
  type SiteVisitLocationAttempt,
} from "./site-visit-token-route-model";

export function LocationAttemptSummary({
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

export function LocationPanel({
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

export function ScopePanel({ targets }: { targets: VisitTarget[] }) {
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

export function GuidePanel({ targets }: { targets: VisitTarget[] }) {
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

export function PermitPanel({
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
                src={viewerUrl ?? undefined}
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
                src={sourceUrl ?? undefined}
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

export function PermitMeta({ permit }: { permit: VisitPermit }) {
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

export function OutcomeCard({
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

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-primary text-xs uppercase tracking-[0.16em]">
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
