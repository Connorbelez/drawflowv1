"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  Layers3,
  LockKeyhole,
  type LucideIcon,
  Mail,
  MapPin,
  PackageCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import type {
  QuoteRoundComposerData,
  QuoteRoundLabourSubmilestone,
  QuoteRoundMaterialRow,
  QuoteRoundMode,
  QuoteRoundRecipientSelection,
  QuoteRoundTemplateVersion,
} from "./QuoteRoundComposer.tsx";

function formatDayWindow(item: QuoteRoundLabourSubmilestone) {
  if (item.startDay === undefined) {
    return "Schedule pending";
  }
  const endDay = item.startDay + Math.max(0, (item.durationDays ?? 1) - 1);
  return `Construction days ${item.startDay}–${endDay}`;
}

function materialDisplayRow(
  data: QuoteRoundComposerData,
  row: QuoteRoundMaterialRow
) {
  const source = data.materialCostItems.find(
    (item) => item._id === row.sourceBuildCostItemId
  );
  return {
    quantity: row.quantity ?? source?.quantity ?? 1,
    title: row.title ?? source?.title ?? "Canonical Build material",
    unit: row.unit ?? source?.unit ?? "package",
  };
}

function modeCapabilityLabel(mode: QuoteRoundMode) {
  return mode === "mixed"
    ? "Contractor + supplier"
    : mode === "labour"
      ? "Contractor"
      : "Supplier";
}

export function QuoteRoundDisclosureProof({
  data,
  materialRows,
  selectedLabour,
}: {
  data: QuoteRoundComposerData;
  materialRows: QuoteRoundMaterialRow[];
  selectedLabour: QuoteRoundLabourSubmilestone[];
}) {
  const scheduleSummary = selectedLabour.length
    ? `${selectedLabour.length} selected sub-milestone${selectedLabour.length === 1 ? "" : "s"} · individual date windows`
    : "No labour schedule windows selected";
  const rows: [string, string, LucideIcon][] = [
    [
      "Building permit",
      data.permit?.fileName ?? "No permit selected",
      FileCheck2,
    ],
    [
      "Exact site location",
      data.build.location ?? "Location unavailable",
      MapPin,
    ],
    ["Timeline and dates", scheduleSummary, CalendarDays],
    [
      "Planning specifications",
      `${selectedLabour.filter((item) => item.scopeOfWorkTiptapJson).length} inherited labour specifications`,
      Layers3,
    ],
    [
      "Material assignments",
      `${materialRows.length} typed material pricing line${materialRows.length === 1 ? "" : "s"}`,
      PackageCheck,
    ],
  ];

  return (
    <div className="space-y-3" data-testid="quote-disclosure-proof">
      {rows.map(([label, meta, Icon]) => (
        <Card key={label}>
          <CardPanel className="flex items-center gap-3 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{label}</p>
              <p className="truncate text-muted-foreground text-xs">{meta}</p>
            </div>
            <CheckCircle2 className="size-4 shrink-0 text-success-foreground" />
          </CardPanel>
        </Card>
      ))}
      <Card>
        <CardPanel className="flex min-h-28 items-center justify-center p-3 text-center">
          <div>
            <span className="mx-auto grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <MapPin className="size-4" />
            </span>
            <p className="mt-2 font-medium text-xs">
              {data.build.location ?? "Build location"}
            </p>
            <p className="text-muted-foreground text-xs">
              Recipient-visible location disclosure
            </p>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}

export function QuoteRoundPackageProofFrame({
  labourCount,
  materialCount,
  recipientCount,
  template,
}: {
  labourCount: number;
  materialCount: number;
  recipientCount: number;
  template?: QuoteRoundTemplateVersion;
}) {
  const rows: [LucideIcon, string, string][] = [
    [Layers3, "Scope", `${labourCount} labour · ${materialCount} materials`],
    [FileCheck2, "Disclosures", "Publisher proof ready"],
    [Users, "Recipients", `${recipientCount} private identities`],
    [
      ClipboardCheck,
      "Response",
      template
        ? `${template.name} · v${template.version}`
        : "Published version required",
    ],
    [Clock3, "Access", "Deadline required before open"],
  ];

  return (
    <Frame
      className="hidden self-start 2xl:flex"
      data-testid="quote-package-proof"
    >
      <FrameHeader>
        <FrameTitle>Package proof</FrameTitle>
        <FrameDescription>Read-only publication state.</FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-3 p-3">
        {rows.map(([Icon, label, value]) => (
          <div className="flex items-center gap-3" key={label}>
            <span className="grid size-8 place-items-center rounded-lg bg-muted">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="truncate font-medium text-sm">{value}</p>
            </div>
            <CheckCircle2 className="size-4 text-success-foreground" />
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

export function QuoteRoundRecipientExperience({
  data,
  materialRows,
  recipients,
  selectedLabour,
}: {
  data: QuoteRoundComposerData;
  materialRows: QuoteRoundMaterialRow[];
  recipients: QuoteRoundRecipientSelection[];
  selectedLabour: QuoteRoundLabourSubmilestone[];
}) {
  const [recipientKey, setRecipientKey] = useState(
    recipients[0]?.recipientKey ?? ""
  );

  useEffect(() => {
    if (
      !recipients.some((recipient) => recipient.recipientKey === recipientKey)
    ) {
      setRecipientKey(recipients[0]?.recipientKey ?? "");
    }
  }, [recipientKey, recipients]);

  const selection =
    recipients.find((recipient) => recipient.recipientKey === recipientKey) ??
    recipients[0];
  const candidate = data.compatibleRecipients.find(
    (item) => item.recipientKey === selection?.recipientKey
  );

  if (!selection) {
    return (
      <Frame
        className="self-start xl:sticky xl:top-[7.7rem]"
        data-testid="quote-recipient-experience"
      >
        <FrameHeader>
          <FrameTitle>Recipient experience</FrameTitle>
          <FrameDescription>
            Select a recipient to preview their invitation.
          </FrameDescription>
        </FrameHeader>
      </Frame>
    );
  }

  return (
    <Frame
      className="self-start xl:sticky xl:top-[7.7rem]"
      data-testid="quote-recipient-experience"
    >
      <FrameHeader className="gap-2">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <FrameTitle>Recipient experience</FrameTitle>
        </div>
        <FrameDescription>
          Live private-invitation preview from the same draft state.
        </FrameDescription>
        <NativeSelect
          aria-label="Preview recipient"
          className="w-full [&_select]:min-h-11 sm:[&_select]:min-h-7"
          onChange={(event) => setRecipientKey(event.target.value)}
          value={selection.recipientKey}
        >
          {recipients.map((recipient) => {
            const label =
              data.compatibleRecipients.find(
                (item) => item.recipientKey === recipient.recipientKey
              )?.displayName ?? recipient.recipientKey;
            return (
              <NativeSelectOption
                key={recipient.recipientKey}
                value={recipient.recipientKey}
              >
                {label}
              </NativeSelectOption>
            );
          })}
        </NativeSelect>
      </FrameHeader>
      <FramePanel className="max-h-[calc(100vh-13rem)] overflow-y-auto bg-muted/40 p-3">
        <Card className="overflow-hidden">
          <div className="border-b bg-neutral-950 p-4 text-white">
            <p className="text-white/55 text-xs uppercase tracking-[0.18em]">
              Private quote invitation
            </p>
            <h3 className="mt-1 font-semibold text-base">
              {data.build.buildName}
            </h3>
            <p className="truncate text-white/65 text-xs">
              Prepared for {candidate?.displayName ?? "selected recipient"}
            </p>
          </div>
          <CardPanel className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  candidate?.capabilities.includes("contractor")
                    ? "info"
                    : "warning"
                }
              >
                {candidate?.capabilities.join(" + ") ?? "Unavailable"}
              </Badge>
              <Badge variant="outline">
                {selectedLabour.length + materialRows.length} pricing lines
              </Badge>
            </div>
            <div>
              <p className="font-semibold text-sm">Site and schedule</p>
              <Card className="mt-2">
                <CardPanel className="p-3">
                  <p className="text-muted-foreground text-xs">
                    Exact location
                  </p>
                  <p className="mt-1 font-medium text-sm">
                    {data.build.location ?? "Build location"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Individual selected schedule windows are included below.
                  </p>
                </CardPanel>
              </Card>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Scope to price</p>
                <span className="text-muted-foreground text-xs">
                  {selectedLabour.length + materialRows.length} required
                </span>
              </div>
              {selectedLabour.map((item, index) => (
                <Card key={item._id}>
                  <CardPanel className="flex items-start gap-2 p-2.5 text-xs">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-muted-foreground text-xs">
                        {formatDayWindow(item)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">$0.00</span>
                  </CardPanel>
                </Card>
              ))}
              {materialRows.map((row, index) => {
                const material = materialDisplayRow(data, row);
                return (
                  <Card key={row.rowKey}>
                    <CardPanel className="flex items-start gap-2 p-2.5 text-xs">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted">
                        {selectedLabour.length + index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{material.title}</span>
                        <span className="block text-muted-foreground text-xs">
                          {material.quantity} {material.unit} ·{" "}
                          {row.assignedSubmilestoneIds.length} assigned context
                          {row.assignedSubmilestoneIds.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="text-muted-foreground">$0.00</span>
                    </CardPanel>
                  </Card>
                );
              })}
            </div>
            <Card className="border-primary/20 bg-primary/5">
              <CardPanel className="p-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  <p className="font-medium text-sm">
                    Complete planning package
                  </p>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Permit · location · individual schedule windows · inherited
                  specifications
                </p>
              </CardPanel>
            </Card>
          </CardPanel>
        </Card>
      </FramePanel>
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Badge variant="success">Live draft</Badge>
        <span className="text-muted-foreground">
          Capability and scope remain explicit.
        </span>
      </div>
    </Frame>
  );
}

export function QuoteRoundDispatchStage({
  data,
  deadline,
  mode,
  onDeadlineChange,
  recipients,
  template,
}: {
  data: QuoteRoundComposerData;
  deadline: string;
  mode: QuoteRoundMode;
  onDeadlineChange: (value: string) => void;
  recipients: QuoteRoundRecipientSelection[];
  template?: QuoteRoundTemplateVersion;
}) {
  return (
    <div className="space-y-5" data-testid="quote-dispatch-stage">
      <label className="grid gap-1.5 text-sm" htmlFor="quote-response-deadline">
        <span className="font-medium">Response deadline</span>
        <Input
          aria-label="Response deadline"
          id="quote-response-deadline"
          inputClassName="min-h-11 sm:min-h-7.5"
          onChange={(event) => onDeadlineChange(event.target.value)}
          type="datetime-local"
          value={deadline}
        />
        <span className="text-muted-foreground text-xs">
          Recipients can respond until this timestamp; publish rejects a missing
          or past deadline.
        </span>
      </label>
      <Alert variant="info">
        <LockKeyhole />
        <AlertTitle>Atomic publication</AlertTitle>
        <AlertDescription>
          Publish will create the immutable package revision, active invitation
          records, and verifier-only access credentials together. No invitation
          opens if any admission check fails.
        </AlertDescription>
      </Alert>
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-semibold text-sm">Invitation review</p>
          <Badge variant={recipients.length ? "success" : "outline"}>
            {recipients.length} ready
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {recipients.map((selection) => {
            const candidate = data.compatibleRecipients.find(
              (item) => item.recipientKey === selection.recipientKey
            );
            return (
              <Card key={selection.recipientKey}>
                <CardPanel className="flex items-center gap-3 p-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-sm">
                      {candidate?.displayName ?? selection.recipientKey}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {candidate?.capabilities.join(" + ") ?? "Unavailable"} ·{" "}
                      {modeCapabilityLabel(mode)} required
                    </span>
                  </span>
                  <Eye className="size-4 text-muted-foreground" />
                </CardPanel>
              </Card>
            );
          })}
        </div>
      </div>
      <Card>
        <CardPanel className="flex items-start gap-3 p-3">
          <ClipboardCheck className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium text-sm">Pinned response version</p>
            <p className="text-muted-foreground text-xs">
              {template
                ? `${template.name} · published v${template.version}`
                : "A published response template is required."}
            </p>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
