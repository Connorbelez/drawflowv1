"use client";

import { FileText } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Progress } from "#/components/ui/progress.tsx";

export interface SubmilestoneCostDocument {
  _id: string;
  allocationAmountCents: number;
  kind: "invoice" | "receipt";
  pages: Array<{
    assetId: string;
    fileName: string;
    mimeType: string;
  }>;
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
}: {
  documents: SubmilestoneCostDocument[];
  onOpenCostDocument?: (costDocumentId: string) => void;
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
            className="flex min-w-0 items-center gap-2"
            key={`${document._id}:${page.assetId}`}
          >
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            <Button
              className="h-auto min-w-0 justify-start p-0 text-left"
              disabled={!onOpenCostDocument}
              onClick={() => onOpenCostDocument?.(document._id)}
              title={`Open ${document.title}`}
              type="button"
              variant="link"
            >
              <span className="truncate">{page.fileName}</span>
            </Button>
            <Badge className="shrink-0" size="sm" variant="outline">
              {humanizeStatus(document.kind)}
            </Badge>
          </li>
        ))
      )}
    </ul>
  );
}

function formatCents(value?: number) {
  if (value === undefined) {
    return "Not available";
  }
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function humanizeStatus(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
