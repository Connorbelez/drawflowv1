import { useAccessToken } from "@workos/authkit-tanstack-react-start/client";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Download,
  FileText,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "#/features/build-collaboration/build-collaboration-asset-upload.ts";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";
const MAX_COST_DOCUMENT_PAGES = 50;
const CAD_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const TRAILING_SLASH_PATTERN = /\/$/;

export interface CostDocumentSubmilestoneOption {
  id: Id<"buildSubmilestones">;
  label: string;
}

export function SingleCostDocumentCapture({
  buildId,
  organizationId,
  submilestones,
}: {
  buildId: Id<"activeBuilds">;
  organizationId: string;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const { getAccessToken } = useAccessToken();
  const beginUpload = useMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerUpload = useMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScan = useAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const submitCostDocument = useMutation(api.cost_documents.submitCostDocument);
  const [submittedId, setSubmittedId] = useState<Id<"costDocuments"> | null>(
    null
  );
  const submitted = useQuery(
    api.cost_documents.getCostDocument,
    submittedId
      ? { buildId, costDocumentId: submittedId, organizationId }
      : "skip"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<"invoice" | "receipt">("invoice");
  const [category, setCategory] = useState<"labour" | "materials">("materials");
  const [title, setTitle] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [grossTotal, setGrossTotal] = useState("");
  const [submilestoneId, setSubmilestoneId] = useState(
    submilestones[0]?.id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] =
    useState<Id<"buildCollaborationAssets"> | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      if (files.length === 0) {
        throw new Error("Choose at least one Invoice or Receipt page.");
      }
      if (files.length > MAX_COST_DOCUMENT_PAGES) {
        throw new Error(
          `A Cost Document supports at most ${MAX_COST_DOCUMENT_PAGES} pages.`
        );
      }
      if (!submilestoneId) {
        throw new Error("Choose a Sub-milestone allocation.");
      }
      const grossTotalCents = parseCadCents(grossTotal);
      uploadedAssetIds = await uploadGovernedCollaborationAssets(files, {
        abandonAssets,
        beginUpload,
        buildId,
        contextKind: "composer",
        finalizeAndScan,
        organizationId,
        registerUpload,
      });
      const id = await submitCostDocument({
        allocations: [
          {
            amountCents: grossTotalCents,
            buildSubmilestoneId: submilestoneId as Id<"buildSubmilestones">,
          },
        ],
        buildId,
        category,
        currency: "CAD",
        description: description.trim() || undefined,
        documentDate,
        grossTotalCents,
        kind,
        organizationId,
        pageAssetIds: uploadedAssetIds,
        title,
        vendorName,
      });
      setSubmittedId(id);
    } catch (cause) {
      if (uploadedAssetIds.length > 0) {
        await abandonGovernedCollaborationAssets({
          abandonAssets,
          assetIds: uploadedAssetIds,
          buildId,
          organizationId,
          reason: "Cost Document submission did not commit.",
        }).catch(() => undefined);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit Cost Document."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPage = async (page: {
    assetId: Id<"buildCollaborationAssets">;
    fileName: string;
  }) => {
    setError(null);
    setDownloadingAssetId(page.assetId);
    try {
      if (!submittedId) {
        throw new Error("The committed Cost Document is unavailable.");
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in again to download this private page.");
      }
      const response = await fetch(
        costDocumentPageDownloadUrl({
          assetId: page.assetId,
          buildId,
          costDocumentId: submittedId,
          organizationId,
        }),
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) {
        throw new Error("This Cost Document page is no longer available.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.download = page.fileName;
      anchor.href = objectUrl;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to download this Cost Document page."
      );
    } finally {
      setDownloadingAssetId(null);
    }
  };

  if (submittedId) {
    return (
      <Frame data-testid="cost-document-submitted">
        <FrameHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success-foreground">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <FrameTitle>Cost Document frozen</FrameTitle>
              <FrameDescription>
                The durable record and upload receipt committed together.
              </FrameDescription>
            </div>
          </div>
        </FrameHeader>
        <FramePanel className="space-y-4">
          {submitted ? (
            <div className="space-y-3">
              <Card>
                <CardPanel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">{submitted.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {submitted.vendorName} ·{" "}
                      {formatCad(submitted.grossTotalCents)}
                    </p>
                  </div>
                  <Badge variant="secondary">Submitted</Badge>
                </CardPanel>
              </Card>
              <Card>
                <CardPanel className="space-y-3 p-4">
                  <div>
                    <p className="font-semibold">Source pages</p>
                    <p className="text-muted-foreground text-sm">
                      Ordered immutable pages. Access is checked again for every
                      private download.
                    </p>
                  </div>
                  <ol className="divide-y">
                    {submitted.pages.map((page) => (
                      <li
                        className="flex min-w-0 items-center justify-between gap-3 py-3"
                        key={page.assetId}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm">
                            {page.order}. {page.fileName}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {page.mimeType}
                          </p>
                        </div>
                        <Button
                          aria-label={`Download page ${page.order}: ${page.fileName}`}
                          disabled={downloadingAssetId === page.assetId}
                          onClick={() => downloadPage(page)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Download />
                          {downloadingAssetId === page.assetId
                            ? "Checking…"
                            : "Download"}
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {submitted.receipt ? (
                    <p className="text-muted-foreground text-xs">
                      Upload receipt: {submitted.receipt.status} to{" "}
                      {submitted.receipt.recipientEmail}
                    </p>
                  ) : null}
                </CardPanel>
              </Card>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Reading the committed record…
            </p>
          )}
          <Alert>
            <ShieldCheck />
            <AlertTitle>Supporting cost context</AlertTitle>
            <AlertDescription>{SUPPORTING_CONTEXT_DISCLOSURE}</AlertDescription>
          </Alert>
          {error ? (
            <Alert variant="error">
              <AlertTitle>Download unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame data-testid="single-cost-document-capture">
      <FrameHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FrameTitle>New cost document</FrameTitle>
              <Badge variant="secondary">Private until submitted</Badge>
            </div>
            <FrameDescription>
              Capture one multi-page Invoice or Receipt, balance every cent,
              then freeze the immutable source record.
            </FrameDescription>
          </div>
          <Badge variant="outline">CAD</Badge>
        </div>
        <ol
          aria-label="Submission steps"
          className="grid gap-2 text-xs sm:grid-cols-3"
        >
          {["Capture & confirm", "Balance & allocate", "Freeze"].map(
            (step, index) => (
              <li className="flex items-center gap-2" key={step}>
                <span className="grid size-6 place-items-center rounded-full bg-primary/15 font-semibold text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            )
          )}
        </ol>
      </FrameHeader>
      <FramePanel>
        <form className="space-y-6" onSubmit={submit}>
          <section aria-labelledby="cost-source-heading" className="space-y-3">
            <div>
              <h3 className="font-semibold" id="cost-source-heading">
                Source pages
              </h3>
              <p className="text-muted-foreground text-sm">
                Add every page from this one source document, in order.
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="cost-document-pages">
                Invoice or Receipt pages
              </FieldLabel>
              <Input
                accept="application/pdf,image/*"
                id="cost-document-pages"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  if (selected.length > MAX_COST_DOCUMENT_PAGES) {
                    setFiles([]);
                    setError(
                      `A Cost Document supports at most ${MAX_COST_DOCUMENT_PAGES} pages.`
                    );
                    event.currentTarget.value = "";
                    return;
                  }
                  setError(null);
                  setFiles(selected);
                }}
                type="file"
              />
              <FieldDescription>
                Files are hash-verified and security-scanned before submission.
              </FieldDescription>
            </Field>
            {files.length > 0 ? (
              <div className="grid gap-2">
                {files.map((file, index) => (
                  <Card key={`${file.name}:${file.lastModified}`}>
                    <CardPanel className="flex items-center gap-3 p-3">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {file.name}
                      </span>
                      <Badge variant="outline">Page {index + 1}</Badge>
                    </CardPanel>
                  </Card>
                ))}
              </div>
            ) : null}
          </section>

          <section
            aria-label="Document facts"
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field>
              <FieldLabel htmlFor="cost-document-kind">
                Document kind
              </FieldLabel>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                id="cost-document-kind"
                onChange={(event) =>
                  setKind(event.target.value as "invoice" | "receipt")
                }
                value={kind}
              >
                <option value="invoice">Invoice</option>
                <option value="receipt">Receipt</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-document-category">
                Classification
              </FieldLabel>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                id="cost-document-category"
                onChange={(event) =>
                  setCategory(event.target.value as "labour" | "materials")
                }
                value={category}
              >
                <option value="materials">Materials</option>
                <option value="labour">Labour</option>
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-document-title">Title</FieldLabel>
              <Input
                id="cost-document-title"
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-document-vendor">Vendor</FieldLabel>
              <Input
                id="cost-document-vendor"
                onChange={(event) => setVendorName(event.target.value)}
                required
                value={vendorName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-document-date">
                Document date
              </FieldLabel>
              <Input
                id="cost-document-date"
                onChange={(event) => setDocumentDate(event.target.value)}
                required
                type="date"
                value={documentDate}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="cost-document-description">
                Description
              </FieldLabel>
              <Textarea
                id="cost-document-description"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </Field>
          </section>

          <section
            aria-label="Balance and allocation"
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field>
              <FieldLabel htmlFor="cost-document-total">
                Gross Document Total (CAD)
              </FieldLabel>
              <Input
                className="h-14 font-semibold text-xl"
                id="cost-document-total"
                inputMode="decimal"
                onChange={(event) => setGrossTotal(event.target.value)}
                placeholder="0.00"
                required
                value={grossTotal}
              />
              <FieldDescription>
                Tax-inclusive; stored in integer cents.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-document-allocation">
                Allocate the exact total to
              </FieldLabel>
              <select
                className="h-14 rounded-md border border-input bg-background px-3 text-sm"
                id="cost-document-allocation"
                onChange={(event) =>
                  setSubmilestoneId(
                    event.target.value as Id<"buildSubmilestones">
                  )
                }
                required
                value={submilestoneId}
              >
                <option disabled value="">
                  Choose a Sub-milestone
                </option>
                {submilestones.map((submilestone) => (
                  <option key={submilestone.id} value={submilestone.id}>
                    {submilestone.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                This first tracer bullet allocates the complete total to one
                authorized Sub-milestone.
              </FieldDescription>
            </Field>
          </section>

          <Alert>
            <LockKeyhole />
            <AlertTitle>Freeze is atomic</AlertTitle>
            <AlertDescription>
              Source pages, facts, total, allocation, provenance, audit
              activity, and your upload receipt either commit together or not at
              all.
            </AlertDescription>
          </Alert>
          {error ? (
            <Alert variant="error">
              <AlertTitle>Cost Document not submitted</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">
              {SUPPORTING_CONTEXT_DISCLOSURE}
            </p>
            <Button disabled={submitting} size="lg" type="submit">
              {submitting ? (
                <UploadCloud className="animate-pulse" />
              ) : (
                <ShieldCheck />
              )}
              {submitting ? "Verifying and freezing…" : "Submit Cost Document"}
            </Button>
          </div>
        </form>
      </FramePanel>
    </Frame>
  );
}

export function parseCadCents(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!CAD_AMOUNT_PATTERN.test(normalized)) {
    throw new Error("Gross Document Total must be a positive CAD amount.");
  }
  const [dollars, fraction = ""] = normalized.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Gross Document Total must be a positive CAD amount.");
  }
  return cents;
}

export function formatCad(amountCents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(amountCents / 100);
}

export function costDocumentPageDownloadUrl(input: {
  assetId: Id<"buildCollaborationAssets">;
  buildId: Id<"activeBuilds">;
  costDocumentId: Id<"costDocuments">;
  organizationId: string;
}) {
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL?.replace(
    TRAILING_SLASH_PATTERN,
    ""
  );
  if (!siteUrl) {
    throw new Error("Private Cost Document downloads are not configured.");
  }
  const search = new URLSearchParams({
    assetId: input.assetId,
    buildId: input.buildId,
    costDocumentId: input.costDocumentId,
    organizationId: input.organizationId,
  });
  return `${siteUrl}/api/cost-documents/page?${search.toString()}`;
}
