import {
  Building2,
  CheckCircle2,
  Circle,
  FileText,
  ListTodo,
  Mail,
  MessageCircle,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { DrawWorkflowStatus } from "#/features/draw-workflow/drawWorkflow.ts";

const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});
const NAME_PARTS_PATTERN = /\s+/;
const PHONE_LINK_CLEANUP_PATTERN = /[^+\d]/g;

export interface DrawReviewDetail {
  label: string;
  value: string;
}

export interface DrawReviewBuilder {
  contactName?: string;
  displayName: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface DrawReviewFundingSummary {
  availableAfterRequestCents?: number;
  drawAvailabilityCents: number;
  drawnCents: number;
  receiptCoverageCents?: number;
  totalApprovedCents: number;
}

export interface DrawReviewEvidenceItem {
  amountLabel?: string;
  detail?: string;
  id: string;
  label: string;
  stateLabel?: string;
  type: "document" | "invoice" | "other";
}

export interface DrawReviewPolicyGate {
  label: string;
  state: "pending" | "satisfied";
  stateLabel: string;
}

export type DrawReviewViewerRole = "backoffice" | "builder" | "lender";

export function DrawReviewSheet({
  actions,
  amountCents,
  builder,
  buildLabel,
  collaborationAction,
  contextBadge,
  details,
  displayId,
  drawLabel,
  evidence = [],
  funding,
  location,
  onClose,
  open,
  policyGates = [],
  privateDetails = [],
  requestNote,
  reviewNote,
  status,
  submittedAt,
  viewerRole = "backoffice",
}: {
  actions?: ReactNode;
  amountCents: number;
  builder?: DrawReviewBuilder;
  buildLabel: string;
  collaborationAction?: ReactNode;
  contextBadge?: ReactNode;
  details: DrawReviewDetail[];
  displayId: string;
  drawLabel: string;
  evidence?: DrawReviewEvidenceItem[];
  funding?: DrawReviewFundingSummary;
  location?: string;
  onClose: () => void;
  open: boolean;
  policyGates?: DrawReviewPolicyGate[];
  privateDetails?: DrawReviewDetail[];
  requestNote?: string;
  reviewNote?: {
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  };
  status: DrawWorkflowStatus;
  submittedAt?: string;
  viewerRole?: DrawReviewViewerRole;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const canViewDecision = viewerRole !== "builder";

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetPopup
        className="w-[calc(100%-1rem)] max-w-[76rem] sm:w-[calc(100%-2rem)]"
        variant="inset"
      >
        <SheetHeader className="shrink-0 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <Badge variant={drawStatusBadgeVariant(status)}>
              {drawStatusLabel(status)}
            </Badge>
            {contextBadge}
            <span className="text-muted-foreground text-xs">
              Canonical Draw Request · history retained
            </span>
          </div>
          <SheetTitle className="pr-10">
            {displayId} · {formatCad(amountCents)}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5" /> {buildLabel}
            </span>
            {submittedAt ? <span>Submitted {submittedAt}</span> : null}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <div className="shrink-0 border-b px-4 pt-1 sm:px-6">
            <TabsList
              aria-label="Draw review detail sections"
              className="w-full max-w-full justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="overview">Overview</TabsTab>
              <TabsTab value="collaboration">Collaboration</TabsTab>
              <TabsTab value="actions">Action Items</TabsTab>
              <TabsTab value="decision">
                {canViewDecision ? "Decision" : "Review status"}
              </TabsTab>
            </TabsList>
          </div>

          <SheetPanel className="min-h-0 pb-[env(safe-area-inset-bottom)]">
            <TabsPanel className="space-y-5 pt-4" value="overview">
              <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                <FundingSummary
                  funding={funding}
                  requestAmountCents={amountCents}
                />
                <BuilderContact builder={builder} />
              </div>
              <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
                <RequestContext
                  amountCents={amountCents}
                  details={details}
                  displayId={displayId}
                  drawLabel={drawLabel}
                  location={location}
                  requestNote={requestNote}
                />
                <EvidenceList evidence={evidence} />
              </div>
              <PolicyState gates={policyGates} status={status} />
            </TabsPanel>

            <TabsPanel className="pt-4" value="collaboration">
              <CollaborationPanel action={collaborationAction} />
            </TabsPanel>

            <TabsPanel className="pt-4" value="actions">
              <ActionItemsPanel action={collaborationAction} />
            </TabsPanel>

            <TabsPanel className="pt-4" value="decision">
              <DecisionPanel
                canViewDecision={canViewDecision}
                details={privateDetails}
                reviewNote={reviewNote}
                status={status}
              />
            </TabsPanel>
          </SheetPanel>
        </Tabs>

        {actions ? <SheetFooter>{actions}</SheetFooter> : null}
      </SheetPopup>
    </Sheet>
  );
}

function FundingSummary({
  funding,
  requestAmountCents,
}: {
  funding?: DrawReviewFundingSummary;
  requestAmountCents: number;
}) {
  if (!funding) {
    return (
      <Frame>
        <FramePanel className="p-5">
          <h2 className="font-semibold text-sm">Draw funding summary</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            The canonical funding snapshot is not available in this view.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FramePanel className="grid gap-6 p-5 md:grid-cols-[13rem_1fr] md:items-center">
        <CoverageRing funding={funding} />
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
            <Metric
              label="Total approved"
              value={formatCad(funding.totalApprovedCents)}
            />
            <Metric
              label="Drawn amount"
              value={formatCad(funding.drawnCents)}
            />
            <Metric
              label="Draw availability"
              value={formatCad(funding.drawAvailabilityCents)}
            />
            <Metric
              label="This request"
              value={formatCad(requestAmountCents)}
            />
            <Metric
              label="After this request"
              value={
                funding.availableAfterRequestCents === undefined
                  ? "Not available"
                  : formatCad(funding.availableAfterRequestCents)
              }
            />
            <Metric
              label="Coverage amount"
              value={
                funding.receiptCoverageCents === undefined
                  ? "Not linked"
                  : formatCad(funding.receiptCoverageCents)
              }
            />
          </div>
          <Separator className="my-5" />
          <p className="text-muted-foreground text-sm">
            Total approved is the amount unlocked to date. Draw availability is
            pooled and can be used when needed; it is not reserved to a
            Milestone or Draw Group in this review surface.
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function CoverageRing({ funding }: { funding: DrawReviewFundingSummary }) {
  const hasCoverage = funding.receiptCoverageCents !== undefined;
  const percentage = hasCoverage
    ? funding.totalApprovedCents > 0
      ? Math.min(
          100,
          ((funding.receiptCoverageCents ?? 0) / funding.totalApprovedCents) *
            100
        )
      : 0
    : undefined;
  const circumference = 2 * Math.PI * 43;
  const dash = ((percentage ?? 0) / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="relative size-40 shrink-0">
        <svg
          aria-label={
            percentage === undefined
              ? "Receipt and invoice coverage is not linked"
              : `${percentage.toFixed(1)}% receipt and invoice coverage`
          }
          className="size-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            className="stroke-muted"
            cx="50"
            cy="50"
            fill="none"
            r="43"
            strokeWidth="8"
          />
          {percentage === undefined ? null : (
            <circle
              className="stroke-primary"
              cx="50"
              cy="50"
              fill="none"
              r="43"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
              strokeWidth="8"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold text-3xl tabular-nums">
            {percentage === undefined ? "—" : `${percentage.toFixed(1)}%`}
          </span>
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {percentage === undefined ? "not linked" : "covered"}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-medium text-sm">Receipt and invoice coverage</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {funding.receiptCoverageCents === undefined
            ? "No canonical Draw Request coverage link is available."
            : `${formatCad(funding.receiptCoverageCents)} of ${formatCad(funding.totalApprovedCents)} total unlocked funds`}
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 font-semibold text-base tabular-nums">{value}</p>
    </div>
  );
}

function BuilderContact({ builder }: { builder?: DrawReviewBuilder }) {
  const displayName = builder?.displayName ?? "Builder unavailable";
  const initials =
    displayName
      .split(NAME_PARTS_PATTERN)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "B";

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-11">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder
            </p>
            <CardTitle className="truncate text-base">{displayName}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {builder?.contactName ? (
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{builder.contactName}</p>
              {builder.role ? (
                <p className="text-muted-foreground text-xs">{builder.role}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {builder?.email || builder?.phone ? (
          <div className="grid gap-2">
            {builder.email ? (
              <Button
                render={
                  <a
                    aria-label={`Email ${builder.contactName ?? builder.displayName}`}
                    href={`mailto:${builder.email}`}
                  >
                    <Mail /> {builder.email}
                  </a>
                }
                size="sm"
                variant="outline"
              />
            ) : null}
            {builder.phone ? (
              <Button
                render={
                  <a
                    aria-label={`Call ${builder.contactName ?? builder.displayName}`}
                    href={`tel:${builder.phone.replace(PHONE_LINK_CLEANUP_PATTERN, "")}`}
                  >
                    <Phone /> {builder.phone}
                  </a>
                }
                size="sm"
                variant="outline"
              />
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            No Builder contact information is available for this Build.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RequestContext({
  amountCents,
  details,
  displayId,
  drawLabel,
  location,
  requestNote,
}: {
  amountCents: number;
  details: DrawReviewDetail[];
  displayId: string;
  drawLabel: string;
  location?: string;
  requestNote?: string;
}) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-sm">Submitted Draw Request</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            {displayId} · {drawLabel}
            {location ? ` · ${location}` : ""}
          </p>
        </div>
        {requestNote ? (
          <p className="text-sm leading-6">{requestNote}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No submission note was recorded.
          </p>
        )}
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground text-sm">Requested</span>
          <span className="font-semibold text-lg tabular-nums">
            {formatCad(amountCents)}
          </span>
        </div>
        {details.length > 0 ? (
          <dl className="grid gap-3 border-t pt-4 text-sm">
            {details.map((detail) => (
              <div className="grid gap-0.5" key={detail.label}>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {detail.label}
                </dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-muted-foreground text-xs">
          This request draws from pooled availability unlocked by approved
          progress. The review does not assign it to a Milestone or Draw Group.
        </p>
      </FramePanel>
    </Frame>
  );
}

function EvidenceList({ evidence }: { evidence: DrawReviewEvidenceItem[] }) {
  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm">Attached Evidence</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Request-level evidence · no Milestone grouping
            </p>
          </div>
          <Badge variant="secondary">
            {evidence.length} linked {evidence.length === 1 ? "item" : "items"}
          </Badge>
        </div>
        {evidence.length > 0 ? (
          <div className="divide-y">
            {evidence.map((item) => {
              const Icon = item.type === "invoice" ? ReceiptText : FileText;
              return (
                <div
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4"
                  key={item.id}
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{item.label}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {[item.detail, item.id].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    {item.amountLabel ? (
                      <p className="font-medium text-sm tabular-nums">
                        {item.amountLabel}
                      </p>
                    ) : null}
                    {item.stateLabel ? (
                      <p className="text-muted-foreground text-xs">
                        {item.stateLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="font-medium text-sm">No request-linked evidence</p>
            <p className="mx-auto mt-1 max-w-md text-muted-foreground text-xs">
              Build and Milestone evidence is not inferred here. Evidence will
              appear only when the canonical Draw Request link is available.
            </p>
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

function PolicyState({
  gates,
  status,
}: {
  gates: DrawReviewPolicyGate[];
  status: DrawWorkflowStatus;
}) {
  const satisfied = gates.filter((gate) => gate.state === "satisfied").length;
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-sm">Approval policy</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Required groups are peers and may complete in either order.
            </p>
          </div>
          {gates.length > 0 ? (
            <Badge variant={satisfied === gates.length ? "success" : "warning"}>
              {satisfied} of {gates.length} gates satisfied
            </Badge>
          ) : (
            <Badge variant="outline">Policy details unavailable</Badge>
          )}
        </div>
        {gates.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {gates.map((gate) => (
              <div
                className="flex items-center gap-3 border-muted border-l-2 pl-3"
                key={gate.label}
              >
                {gate.state === "satisfied" ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium text-sm">{gate.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {gate.stateLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Canonical status: {drawStatusLabel(status)}. This request does not
            expose a persisted approval-group snapshot yet, so no group order,
            quorum, or deadline is inferred.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          There is no review priority or per-review deadline unless a canonical
          policy record explicitly provides one.
        </p>
      </FramePanel>
    </Frame>
  );
}

function CollaborationPanel({ action }: { action?: ReactNode }) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <MessageCircle className="size-4" /> Collaboration
            </h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Comments are owned by the canonical Draw System Post.
            </p>
          </div>
          <Badge variant="outline">Synced projection</Badge>
        </div>
        <Separator />
        <p className="text-muted-foreground text-sm">
          Open the Draw System Post to read or add role-permitted collaboration.
          This sheet does not create a second comment thread.
        </p>
        {action ?? (
          <p className="text-muted-foreground text-xs">
            The Draw System Post is not available from this route.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function ActionItemsPanel({ action }: { action?: ReactNode }) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <ListTodo className="size-4" /> Linked Action Items
            </h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Canonical Action Items associated through the Draw System Post
            </p>
          </div>
          <Badge variant="secondary">Coordination only</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Linked Action Items never gate, approve, release, or mutate the Draw
          Request. Open the Draw System Post to work with them in context.
        </p>
        {action ?? (
          <p className="text-muted-foreground text-xs">
            Linked Action Items are not available from this route.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function DecisionPanel({
  canViewDecision,
  details,
  reviewNote,
  status,
}: {
  canViewDecision: boolean;
  details: DrawReviewDetail[];
  reviewNote?: {
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  };
  status: DrawWorkflowStatus;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Frame>
        <FramePanel className="space-y-5 p-5">
          <div>
            <h2 className="font-semibold text-base">
              {canViewDecision ? "Draw decision" : "Review status"}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {canViewDecision
                ? "Use only the role-permitted actions in the footer. Every decision remains on the canonical Draw Request."
                : `Current state: ${drawStatusLabel(status)}. Reviewer identity, private rationale, and internal approval details are not shown.`}
            </p>
          </div>
          {canViewDecision && reviewNote ? (
            <div className="grid gap-2">
              <Label htmlFor="draw-review-note">Private review note</Label>
              <Textarea
                disabled={reviewNote.disabled}
                id="draw-review-note"
                onChange={(event) => reviewNote.onChange(event.target.value)}
                placeholder="Document the decision rationale…"
                rows={4}
                value={reviewNote.value}
              />
              <p className="text-muted-foreground text-xs">
                A rejection reason is required and remains private from the
                Builder. Rejection returns this same record for correction and
                preserves its history.
              </p>
            </div>
          ) : null}
          {details.length > 0 ? (
            <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              {details.map((detail) => (
                <div className="grid gap-0.5" key={detail.label}>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    {detail.label}
                  </dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function formatCad(cents: number) {
  return CAD_FORMATTER.format(cents / 100);
}

function drawStatusLabel(status: DrawWorkflowStatus): string {
  switch (status) {
    case "approved_for_release":
      return "Approved for release";
    case "cancelled":
      return "Cancelled";
    case "in_review":
      return "In review";
    case "planned":
      return "Planned";
    case "ready_for_admin":
      return "Ready for admin";
    case "rejected":
      return "Rejected";
    case "released":
      return "Released";
    case "requested":
      return "Requested";
    case "withdrawn":
      return "Withdrawn";
  }
}

function drawStatusBadgeVariant(
  status: DrawWorkflowStatus
): NonNullable<ComponentProps<typeof Badge>["variant"]> {
  if (status === "released") {
    return "success";
  }
  if (status === "requested" || status === "ready_for_admin") {
    return "warning";
  }
  if (status === "in_review" || status === "approved_for_release") {
    return "info";
  }
  if (status === "rejected" || status === "cancelled") {
    return "destructive";
  }
  return "outline";
}
