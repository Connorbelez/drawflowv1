import { Hammer, Wrench, X } from "lucide-react";
import { InteractiveSiteMap } from "#/components/maps/interactive-site-map.tsx";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  type DrawerKey,
  deriveAddress,
  guidanceSectionsForTargets,
  targetCode,
  type VisitBuild,
  type VisitFile,
  type VisitPermit,
  type VisitTarget,
} from "./site-visit-token-route-contracts";
import {
  formatSiteVisitBytes,
  type SiteVisitLocationAttempt,
} from "./site-visit-token-route-model";
import {
  GuidePanel,
  InfoItem,
  LocationAttemptSummary,
  LocationPanel,
  PermitPanel,
  ScopePanel,
} from "./site-visit-token-route-panels";
import { EvidenceGrid, SectionTitle } from "./site-visit-token-route-shell";

export function DesktopLocationPanel({
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

export function DesktopScopePanel({ targets }: { targets: VisitTarget[] }) {
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

export function DesktopPermitPanel({
  permit,
}: {
  permit?: VisitPermit | null;
}) {
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

export function DesktopUploadedPanel({
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

export function DesktopGuidePanel({ targets }: { targets: VisitTarget[] }) {
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

export function SiteVisitDrawer({
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
