import {
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Hammer,
  LoaderCircle,
  MapPin,
  Play,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { lazy, Suspense, useState } from "react";

import type { DeviceCaptureKind } from "#/components/device-capture-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { SiteVisitStagedEvidence } from "./site-visit-evidence-staging";
import {
  type DrawerKey,
  deriveAddress,
  encodeMilestoneVisitTarget,
  encodeSubmilestoneVisitTarget,
  subCode,
  targetCode,
  targetLabel,
  type VisitBuild,
  type VisitFile,
  type VisitTarget,
  visitSubmilestones,
} from "./site-visit-token-route-contracts";
import { formatSiteVisitBytes } from "./site-visit-token-route-model";

const DeviceCaptureDialog = lazy(() =>
  import("#/components/device-capture-dialog.tsx").then((module) => ({
    default: module.DeviceCaptureDialog,
  }))
);

export function MobileShell({
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

export function SectionTitle({
  right,
  title,
}: {
  right?: string;
  title: string;
}) {
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

export function SiteVisitCapturePanel({
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
                  {subCode(target, subIndex)} · {submilestone.name}
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

export function CaptureButton({
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

export function EvidenceGrid({
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

export function BottomNav({
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

export function NavButton({
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
