"use client";

import { ExternalLink, FileText } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Progress } from "#/components/ui/progress.tsx";

export interface SubmilestoneCostDocument {
  _id: string;
  allocationAmountCents: number;
  kind: "invoice" | "receipt";
  pages: Array<{
    assetId: string;
    downloadUrl?: string;
    fileName: string;
    mimeType: string;
  }>;
  subtotalCents?: number;
  taxCents?: number;
  title: string;
}

export function DocumentedCostCoverage({
  budgetCents,
  documents,
  submilestoneName,
}: {
  budgetCents?: number;
  documents: SubmilestoneCostDocument[];
  submilestoneName: string;
}) {
  const documentedCents = documents.reduce(
    (sum, document) => sum + document.allocationAmountCents,
    0
  );
  const coverage = budgetCents
    ? Math.min(100, Math.round((documentedCents / budgetCents) * 100))
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Documented Cost Coverage</span>
        <span className="tabular-nums">
          {budgetCents ? `${coverage}%` : "Budget unavailable"}
        </span>
      </div>
      <Progress
        aria-label={`Documented Cost Coverage for ${submilestoneName}`}
        value={coverage}
      />
      <p className="text-muted-foreground text-xs tabular-nums">
        {formatCents(documentedCents)} documented of {formatCents(budgetCents)}
        {budgetCents === undefined ? " budget unavailable" : " budgeted"}
      </p>
    </div>
  );
}

export function CostDocumentFileList({
  documents,
  onOpenCostDocument,
  onOpenPage,
}: {
  documents: SubmilestoneCostDocument[];
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenPage?: (page: SubmilestoneCostDocument["pages"][number]) => void;
}) {
  if (documents.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No Receipt or Invoice is assigned.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {documents.flatMap((document) =>
        document.pages.map((page) => (
          <li
            className="flex min-w-0 flex-col gap-2 py-1 sm:flex-row sm:items-center"
            key={`${document._id}:${page.assetId}`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              {onOpenCostDocument ? (
                <Button
                  className="h-auto min-w-0 justify-start p-0 text-left"
                  onClick={() => onOpenCostDocument(document._id)}
                  title={`Open ${document.title}`}
                  type="button"
                  variant="link"
                >
                  <span className="truncate">{page.fileName}</span>
                </Button>
              ) : onOpenPage ? (
                <Button
                  className="h-auto p-0"
                  onClick={() => onOpenPage(page)}
                  size="sm"
                  title={`Open or download ${document.title}`}
                  type="button"
                  variant="link"
                >
                  Open / download <ExternalLink aria-hidden="true" />
                </Button>
              ) : (
                <span className="truncate text-sm">{page.fileName}</span>
              )}
              <Badge className="shrink-0" size="sm" variant="outline">
                {humanizeStatus(document.kind)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs tabular-nums sm:justify-end sm:pl-0">
              <span className="text-muted-foreground">
                Subtotal{" "}
                <strong className="font-medium text-foreground">
                  {formatCents(document.subtotalCents, 2)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Tax{" "}
                <strong className="font-medium text-foreground">
                  {formatCents(document.taxCents, 2)}
                </strong>
              </span>
              {page.downloadUrl ? (
                <Button
                  className="h-auto p-0"
                  render={
                    <a
                      aria-label={`Open or download ${document.title}`}
                      download={page.fileName}
                      href={page.downloadUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open / download <ExternalLink aria-hidden="true" />
                    </a>
                  }
                  size="sm"
                  title={`Open or download ${document.title}`}
                  variant="link"
                />
              ) : (
                <Button
                  className="h-auto p-0"
                  disabled={!onOpenCostDocument}
                  onClick={() => onOpenCostDocument?.(document._id)}
                  size="sm"
                  title={`Open or download ${document.title}`}
                  type="button"
                  variant="link"
                >
                  Open / download <ExternalLink aria-hidden="true" />
                </Button>
              )}
            </div>
          </li>
        ))
      )}
    </ul>
  );
}

function formatCents(value?: number, fractionDigits = 0) {
  if (value === undefined) {
    return "Not available";
  }
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(value / 100);
}

function humanizeStatus(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
