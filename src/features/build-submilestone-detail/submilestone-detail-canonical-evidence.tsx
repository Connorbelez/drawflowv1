"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ClipboardCheck,
  FileImage,
  MapPinCheck,
  MapPinOff,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { api as apiRef } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type SiteVisitOrderConfirmation,
  SiteVisitOrderDialog,
} from "../backoffice-build-detail/SiteVisitOrderDialog.tsx";
import { SubmilestoneSiteVisitWorkspace } from "./SubmilestoneSiteVisitWorkspace.tsx";
import type {
  CanonicalWorkspaceBootstrap,
  CanonicalWorkspaceCollection,
  NavigationProps,
  PreparedEvidenceUpload,
  RetryAction,
} from "./submilestone-detail-canonical-contracts.ts";
import {
  arrayValue,
  BACKOFFICE_EVIDENCE_CAPACITIES,
  booleanValue,
  CANONICAL_SOURCE_VALUES,
  canMutate,
  capability,
  collectionRows,
  commandKey,
  errorMessage,
  evidenceUploadTimeoutMs,
  isStaleConflict,
  milestoneKeyFor,
  milestoneNameFor,
  numberValue,
  object,
  optionalNumber,
  overviewFor,
  proposalSubmilestoneIdFor,
  revisionFor,
  statusLabel,
  stringValue,
  submilestoneKeyFor,
  submilestoneNameFor,
} from "./submilestone-detail-canonical-contracts.ts";
import { CommandError } from "./submilestone-detail-canonical-command.tsx";
import { Metric } from "./submilestone-detail-canonical-overview.tsx";

function captureLocationAttempt() {
  const attemptedAt = Date.now();
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      attempted: true,
      attemptedAt,
      failureReason:
        "Browser location is unavailable; evidence is retained for lender review.",
      permissionOutcome: "unavailable" as const,
      verified: false,
    });
  }
  return new Promise<{
    accuracyMeters?: number;
    attempted: boolean;
    attemptedAt?: number;
    failureReason?: string;
    latitude?: number;
    longitude?: number;
    permissionOutcome: "denied" | "granted" | "unavailable";
    verified: boolean;
  }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          accuracyMeters: Math.max(0, Math.round(position.coords.accuracy)),
          attempted: true,
          attemptedAt,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          permissionOutcome: "granted",
          verified: false,
        }),
      (error) =>
        resolve({
          attempted: true,
          attemptedAt,
          failureReason:
            error.code === 1
              ? "Browser location permission was denied."
              : "Browser location could not be verified.",
          permissionOutcome: error.code === 1 ? "denied" : "unavailable",
          verified: false,
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  });
}

export function CanonicalEvidencePanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  requirementsCollection,
  historyCollection: _historyCollection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
  requirementsCollection?: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection | undefined;
}) {
  const generateUploadUrl = useMutation(
    apiRef.production_proposals.generateActiveBuildEvidenceUploadUrl
  );
  const addEvidence = useMutation(
    apiRef.production_proposals.addActiveBuildSubmilestoneEvidence
  );
  const scheduleSiteVisit = useMutation(
    apiRef.production_proposals.scheduleActiveBuildSiteVisit
  );
  const details = overviewFor(bootstrap);
  const proposalSubmilestoneId = proposalSubmilestoneIdFor(bootstrap);
  const canReadSiteVisits = Boolean(
    viewerCapacity && BACKOFFICE_EVIDENCE_CAPACITIES.has(viewerCapacity)
  );
  const fieldGuidance = useQuery(
    apiRef.submilestone_field_guidance.getSubmilestoneFieldGuidance,
    proposalSubmilestoneId
      ? {
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          workosOrganizationId: organizationId,
        }
      : "skip"
  );
  const siteVisits = useQuery(
    apiRef.production_proposals.listBrokerageSiteVisits,
    canReadSiteVisits
      ? {
          buildId,
          milestoneKey: milestoneKeyFor(bootstrap),
          submilestoneId: buildSubmilestoneId,
          workosOrganizationId: organizationId,
        }
      : "skip"
  );
  const evidence = object(bootstrap.evidence);
  const requirements = [
    ...arrayValue(evidence.requirements).map(object),
    ...collectionRows(requirementsCollection),
  ]
    .filter((requirement) => evidenceRequirementKey(requirement).length > 0)
    .filter(
      (requirement, index, all) =>
        all.findIndex(
          (candidate) =>
            stringValue(
              candidate.requirementKey ?? candidate.key ?? candidate.id
            ) ===
            stringValue(
              requirement.requirementKey ?? requirement.key ?? requirement.id
            )
        ) === index
    );
  const assets = arrayValue(evidence.assets).map(object);
  const rows = collectionRows(collection);
  const canonicalAssets = [...assets, ...rows]
    .filter((asset) => isCanonicalEvidenceAsset(asset))
    .filter(
      (asset) =>
        stringValue(asset.sourceKind ?? asset.source).toLowerCase() !==
        "site_visit"
    )
    .filter((asset, index, all) => {
      const id = evidenceAssetIdentity(asset);
      if (!id) {
        return true;
      }
      return (
        all.findIndex(
          (candidate) => evidenceAssetIdentity(candidate) === id
        ) === index
      );
    });
  const [requirementKey, setRequirementKey] = useState(
    evidenceRequirementKey(requirements[0])
  );
  const requirementCount =
    optionalNumber(evidence.requirementCount) ?? requirements.length;
  const requirementsAvailable = requirements.length > 0;
  const requirementsReady =
    requirementsAvailable &&
    (requirementCount <= 1 || requirements.length >= requirementCount);
  const selectedRequirementKey = requirementKey.trim();
  const availableRequirementKeys = new Set(
    requirements.map((requirement) => evidenceRequirementKey(requirement))
  );
  const requirementSelectionRequired = requirementCount > 1;
  const requirementSelectionMissing =
    requirementSelectionRequired &&
    !(
      selectedRequirementKey &&
      availableRequirementKeys.has(selectedRequirementKey)
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [siteVisitBusy, setSiteVisitBusy] = useState(false);
  const [siteVisitOpen, setSiteVisitOpen] = useState(false);
  const retryRef = useRef<RetryAction | null>(null);
  const uploadKeyRef = useRef<string | null>(null);
  const uploadFileRef = useRef<File | null>(null);
  const preparedUploadRef = useRef<PreparedEvidenceUpload | null>(null);
  useEffect(() => {
    setRequirementKey("");
    setBusy(false);
    setError("");
    setPendingFile(null);
    setSiteVisitBusy(false);
    setSiteVisitOpen(false);
    retryRef.current = null;
    uploadKeyRef.current = null;
    uploadFileRef.current = null;
    preparedUploadRef.current = null;
  }, [buildId, buildSubmilestoneId]);
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const uploadCapability = capability(bootstrap, "uploadEvidence");
  const siteVisitOrderCapability = object(
    object(object(bootstrap.capabilities).siteVisit).order
  );
  const backofficeUpload = Boolean(
    viewerCapacity && BACKOFFICE_EVIDENCE_CAPACITIES.has(viewerCapacity)
  );
  const builderUploadAllowed =
    hasRevision &&
    details.actualStartedAt !== undefined &&
    canMutate(bootstrap, readOnly, "uploadEvidence") &&
    requirementsReady &&
    !requirementSelectionMissing;
  const backofficeUploadAllowed =
    hasRevision &&
    !readOnly &&
    backofficeUpload &&
    uploadCapability.allowed &&
    (requirementCount === 0 || requirementsReady) &&
    !requirementSelectionMissing;
  const uploadAllowed = builderUploadAllowed || backofficeUploadAllowed;
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const packageStatus = stringValue(
    evidence.packageState ?? evidence.evidencePackageStatus,
    "draft"
  );
  const locationAttempt = () => captureLocationAttempt();
  const uploadUnavailableReason =
    readOnly || !uploadCapability.allowed
      ? (uploadCapability.reason ?? "Evidence is read-only for this viewer.")
      : hasRevision
        ? details.actualStartedAt === undefined && !backofficeUpload
          ? "Start this Sub-milestone before adding evidence to the canonical package."
          : requirementsAvailable
            ? requirementsReady
              ? "Select an evidence requirement before adding evidence."
              : "Evidence requirements are still loading; refresh before adding evidence."
            : backofficeUpload
              ? "Evidence upload is unavailable for this Sub-milestone."
              : "No keyed evidence requirement is available. Refresh or ask the Builder to configure the Evidence Package."
        : "Refresh this Sub-milestone before adding evidence to the package; its current version is unavailable.";
  const canOrderSiteVisit =
    !readOnly && booleanValue(siteVisitOrderCapability.allowed);
  const visibleSiteVisits = siteVisits
    ? {
        ...siteVisits,
        visits: siteVisits.visits.filter(
          (visit) => visit.operationalStatus !== "cancelled"
        ),
      }
    : undefined;

  useEffect(() => {
    if (!requirementKey && requirements.length > 0) {
      setRequirementKey(evidenceRequirementKey(requirements[0]));
    }
  }, [requirementKey, requirements]);

  const upload = async (file: File) => {
    if (!uploadAllowed) {
      if (!readOnly && uploadCapability.allowed && !hasRevision) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before adding evidence."
        );
      }
      return;
    }
    if (
      requirementSelectionMissing ||
      !(backofficeUploadAllowed || requirementsReady)
    ) {
      setError(
        requirementSelectionRequired
          ? "Select an evidence requirement before adding this asset."
          : "Evidence requirements are still loading. Refresh before retrying."
      );
      return;
    }
    if (uploadFileRef.current !== file) {
      uploadFileRef.current = file;
      uploadKeyRef.current = null;
      preparedUploadRef.current = null;
    }
    const idempotencyKey =
      uploadKeyRef.current ?? commandKey("submilestone-evidence");
    uploadKeyRef.current = idempotencyKey;
    setPendingFile(file);
    setBusy(true);
    setError("");
    const action = async () => {
      let preparedUpload = preparedUploadRef.current;
      if (!preparedUpload) {
        const normalized = await normalizeEvidenceFileForUpload(file);
        const location = backofficeUploadAllowed
          ? undefined
          : await locationAttempt();
        const uploadUrl = await generateUploadUrl({
          buildId,
          workosOrganizationId: organizationId,
        });
        const response = await fetch(uploadUrl, {
          body: normalized,
          headers: {
            "Content-Type": normalized.type || "application/octet-stream",
          },
          method: "POST",
          signal: AbortSignal.timeout(evidenceUploadTimeoutMs(normalized.size)),
        });
        if (!response.ok) {
          throw new Error(
            "Evidence upload failed. The file remains available to retry."
          );
        }
        const result = object(await response.json());
        const storageId = result.storageId;
        if (typeof storageId !== "string" || !storageId) {
          throw new Error("Evidence upload did not return a storage id.");
        }
        preparedUpload = {
          fileName: normalized.name,
          locationAttempt: location,
          mimeType: normalized.type || "application/octet-stream",
          sizeBytes: normalized.size,
          storageId: storageId as Id<"_storage">,
        };
        preparedUploadRef.current = preparedUpload;
      }
      await addEvidence({
        buildId,
        evidence: {
          fileName: preparedUpload.fileName,
          label: preparedUpload.fileName,
          locationAttempt: preparedUpload.locationAttempt,
          mimeType: preparedUpload.mimeType,
          requirementKey: selectedRequirementKey || undefined,
          sizeBytes: preparedUpload.sizeBytes,
          storageId: preparedUpload.storageId,
        },
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        submilestoneKey,
        uploadedOnBehalfOfBuilder: backofficeUploadAllowed || undefined,
        workosOrganizationId: organizationId,
      });
    };
    const retryAction: RetryAction = async () => {
      setBusy(true);
      setError("");
      try {
        await action();
        setPendingFile(null);
        uploadKeyRef.current = null;
        uploadFileRef.current = null;
        preparedUploadRef.current = null;
        retryRef.current = null;
      } catch (caught) {
        const message = errorMessage(caught);
        if (isStaleConflict(caught) && !onRetry) {
          // The prepared command carries the stale workflow revision. Without
          // a refresh callback, do not expose a retry that would submit it
          // again; require a fresh canonical read first.
          setError(
            `${message} Refresh this Sub-milestone before retrying this evidence upload.`
          );
          retryRef.current = null;
          uploadKeyRef.current = null;
          uploadFileRef.current = null;
          preparedUploadRef.current = null;
        } else {
          setError(message);
          if (isStaleConflict(caught) && onRetry) {
            retryRef.current = async () => {
              onRetry();
            };
          }
        }
      } finally {
        setBusy(false);
      }
    };
    retryRef.current = retryAction;
    await retryAction();
  };

  const orderSiteVisit = async (input: SiteVisitOrderConfirmation) => {
    setSiteVisitBusy(true);
    setError("");
    try {
      await scheduleSiteVisit({
        buildId,
        idempotencyKey: commandKey("site-visit-order"),
        milestoneKey: input.milestoneKey,
        ...(input.note ? { note: input.note } : {}),
        requestedDay: input.requestedDay ?? 0,
        ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
        siteVisitGuidance: input.siteVisitGuidance,
        submilestoneGuidanceSections: input.submilestoneGuidanceSections.map(
          (section) => ({
            ...section,
            buildSubmilestoneId:
              section.buildSubmilestoneId as Id<"buildSubmilestones">,
            proposalSubmilestoneId:
              section.proposalSubmilestoneId as Id<"proposalSubmilestones">,
          })
        ),
        submilestoneKeys: input.submilestoneKeys,
        workosOrganizationId: organizationId,
      });
      setSiteVisitOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSiteVisitBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="submilestone-evidence-collection">
      <Frame>
        <FramePanel className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileImage
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <p className="font-medium text-sm">Canonical Evidence Package</p>
            </div>
            <Badge variant={packageStatus === "frozen" ? "success" : "outline"}>
              {statusLabel(packageStatus)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Only assets in the canonical Evidence Package are shown here.
            Collaboration attachments are not completion evidence.
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Metric
              label="Package revision"
              value={String(
                optionalNumber(evidence.evidencePackageRevision) ??
                  "Not created"
              )}
            />
            <Metric label="Requirements" value={String(requirementCount)} />
            <Metric
              label="Assets"
              value={String(
                numberValue(evidence.assetCount, canonicalAssets.length)
              )}
            />
          </div>
          {requirementSelectionRequired ? (
            <Label className="space-y-1 text-xs">
              <span>Evidence requirement</span>
              <NativeSelect
                aria-label="Evidence requirement"
                onChange={(event) => setRequirementKey(event.target.value)}
                value={requirementKey}
              >
                {requirements.map((requirement) => {
                  const key = evidenceRequirementKey(requirement);
                  if (!key) {
                    return null;
                  }
                  return (
                    <NativeSelectOption key={key} value={key}>
                      {stringValue(requirement.label ?? requirement.title, key)}
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </Label>
          ) : null}
        </FramePanel>
      </Frame>
      <section aria-labelledby="builder-evidence-heading" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="flex items-center gap-2 font-semibold text-sm"
              id="builder-evidence-heading"
            >
              <ClipboardCheck aria-hidden="true" className="size-4" />
              Builder Evidence
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              Photos and documents submitted for this Sub-milestone.
            </p>
          </div>
          <Badge variant="outline">
            {canonicalAssets.length} asset
            {canonicalAssets.length === 1 ? "" : "s"}
          </Badge>
        </div>
        {canonicalAssets.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-10 md:py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileImage aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No Builder evidence yet</EmptyTitle>
              <EmptyDescription>
                Builder photos and supporting documents tagged to this
                Sub-milestone will appear here for review.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-lg">
              {uploadAllowed ? (
                <CanonicalEvidenceUploader
                  backofficeUpload={backofficeUploadAllowed}
                  busy={busy}
                  onUpload={upload}
                  submilestoneName={stringValue(
                    object(bootstrap.submilestone).name,
                    submilestoneKey
                  )}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {uploadUnavailableReason}
                </p>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {canonicalAssets.map((asset, index) => (
                <EvidenceAssetCard
                  asset={asset}
                  key={evidenceAssetIdentity(asset) || `evidence-${index}`}
                />
              ))}
            </div>
            {uploadAllowed ? (
              <CanonicalEvidenceUploader
                backofficeUpload={backofficeUploadAllowed}
                busy={busy}
                compact
                onUpload={upload}
                submilestoneName={stringValue(
                  object(bootstrap.submilestone).name,
                  submilestoneKey
                )}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {uploadUnavailableReason}
              </p>
            )}
          </>
        )}
        {pendingFile && error ? (
          <p className="text-muted-foreground text-xs">
            Draft file retained: {pendingFile.name}
          </p>
        ) : null}
        {error ? <CommandError error={error} retry={retryRef.current} /> : null}
      </section>
      <Separator />
      <section
        aria-labelledby="evidence-site-visits-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="flex items-center gap-2 font-semibold text-sm"
              id="evidence-site-visits-heading"
            >
              <MapPinCheck aria-hidden="true" className="size-4" />
              Site Visits
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              Field requests, reports, and canonical Visit history for this
              Sub-milestone.
            </p>
          </div>
          {visibleSiteVisits ? (
            <Badge variant="outline">
              {visibleSiteVisits.visits.length} Visit
              {visibleSiteVisits.visits.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {canReadSiteVisits ? (
          <SubmilestoneSiteVisitWorkspace
            canCancel={false}
            canOrder={canOrderSiteVisit}
            guidanceReady={fieldGuidance !== undefined}
            onCancelVisit={() => Promise.resolve()}
            onOrder={() => setSiteVisitOpen(true)}
            pending={siteVisitBusy}
            siteVisits={visibleSiteVisits}
          />
        ) : (
          <p className="py-6 text-center text-muted-foreground text-sm">
            Site Visit history is available to the authorized lender team.
          </p>
        )}
      </section>
      <SiteVisitOrderDialog
        build={{
          location: stringValue(object(bootstrap.build).location),
          name: stringValue(object(bootstrap.build).buildName, "Build"),
        }}
        milestone={{ key: milestoneKey, name: milestoneNameFor(bootstrap) }}
        onConfirm={orderSiteVisit}
        onOpenChange={setSiteVisitOpen}
        open={siteVisitOpen}
        request={siteVisitOpen ? { milestoneKey } : null}
        submilestones={
          proposalSubmilestoneId
            ? [
                {
                  _id: String(buildSubmilestoneId),
                  fieldGuidance: fieldGuidance?.guidance ?? null,
                  key: submilestoneKey,
                  name: submilestoneNameFor(bootstrap),
                  proposalSubmilestoneId,
                },
              ]
            : []
        }
      />
    </div>
  );
}

function CanonicalEvidenceUploader({
  backofficeUpload,
  busy,
  compact = false,
  onUpload,
  submilestoneName,
}: {
  backofficeUpload: boolean;
  busy: boolean;
  compact?: boolean;
  onUpload: (file: File) => Promise<void>;
  submilestoneName: string;
}) {
  return (
    <FileUploader
      actionLabel="Upload to Evidence Package"
      className="w-full"
      description={
        backofficeUpload
          ? `Add a photo or document to ${submilestoneName} on the Builder's behalf.`
          : `Add a photo or document to ${submilestoneName}.`
      }
      disabled={busy}
      helperText={
        backofficeUpload
          ? "The audit trail records you as the uploader and keeps the evidence location unverified."
          : "The file remains tagged to this canonical Sub-milestone."
      }
      inputLabel="Choose evidence file"
      inputTestId="canonical-evidence-input"
      multiple={false}
      onUpload={async (files) => {
        const file = files[0];
        if (file) {
          await onUpload(file);
        }
      }}
      title={
        backofficeUpload
          ? "Upload evidence for the Builder"
          : "Add evidence to the package"
      }
      variant={compact ? "compact" : "default"}
    />
  );
}

export function isCanonicalEvidenceAsset(asset: Record<string, unknown>) {
  const source = stringValue(asset.sourceKind ?? asset.source).toLowerCase();
  if (!source) {
    return true;
  }
  if (CANONICAL_SOURCE_VALUES.has(source)) {
    return true;
  }
  return !(
    source.includes("collaboration") ||
    source.includes("comment") ||
    source.includes("attachment")
  );
}

function evidenceRequirementKey(
  requirement: Record<string, unknown> | undefined
) {
  return stringValue(requirement?.requirementKey ?? requirement?.key);
}

export function evidenceAssetIdentity(asset: Record<string, unknown>) {
  return (
    stringValue(asset.id) ||
    stringValue(asset._id) ||
    stringValue(asset.evidenceAssetId)
  );
}

export function EvidenceAssetCard({
  asset,
  footer,
}: {
  asset: Record<string, unknown>;
  footer?: ReactNode;
}) {
  const locationVerified = booleanValue(
    asset.locationVerified ?? asset.verified,
    false
  );
  const previewUrl = stringValue(asset.previewUrl ?? asset.url);
  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words text-sm">
              {stringValue(
                asset.title ?? asset.label ?? asset.fileName,
                "Evidence asset"
              )}
            </CardTitle>
            <CardDescription className="break-words">
              {stringValue(
                asset.fileName ?? asset.detail,
                "Canonical package asset"
              )}
            </CardDescription>
          </div>
          <Badge
            className="shrink-0"
            variant={locationVerified ? "success" : "warning"}
          >
            {locationVerified ? "Location verified" : "Location unverified"}
          </Badge>
        </div>
      </CardHeader>
      {previewUrl ? (
        <div className="aspect-[4/3] overflow-hidden bg-muted">
          <img
            alt={stringValue(
              asset.title ?? asset.label ?? asset.fileName,
              "Evidence preview"
            )}
            className="h-full w-full object-cover"
            height={600}
            loading="lazy"
            src={previewUrl}
            width={800}
          />
        </div>
      ) : null}
      <CardPanel className="space-y-2 p-3 pt-0 text-xs">
        {asset.locationVerified === false || asset.verified === false ? (
          <p className="flex items-center gap-1 text-warning">
            <MapPinOff aria-hidden="true" className="size-3.5" />
            Retained for lender review; location was not verified.
          </p>
        ) : null}
        {stringValue(asset.kind ?? asset.tag) ? (
          <p className="text-muted-foreground">
            {statusLabel(asset.kind ?? asset.tag)}
          </p>
        ) : null}
      </CardPanel>
      {footer ? (
        <CardFooter className="border-t bg-muted/30 p-3">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
