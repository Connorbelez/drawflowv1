import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  History,
  ImageIcon,
  Link2,
  ListChecks,
  LockKeyhole,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
  type SubmilestoneReviewSummary,
} from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";
import { SubmilestoneDiscussionThread } from "#/features/build-submilestone-detail/SubmilestoneCollaborationPanel.tsx";
import { EvidenceAssetCard } from "#/features/build-submilestone-detail/SubmilestoneDetailCanonical.tsx";
import { CostDocumentFileList } from "#/features/cost-documents/SubmilestoneCostDocuments.tsx";
import type { Id } from "../../../convex/_generated/dataModel";

export const LENDER_MILESTONE_REVIEW_VARIANTS = [
  { key: "A", name: "Canonical sheet + lender layer" },
  { key: "B", name: "Evidence desk + gate rail" },
  { key: "C", name: "Guided gate sequence" },
  { key: "D", name: "Decision ledger" },
] as const;

export type LenderMilestoneReviewVariant =
  (typeof LENDER_MILESTONE_REVIEW_VARIANTS)[number]["key"];

export function isLenderMilestoneReviewVariant(
  value: unknown
): value is LenderMilestoneReviewVariant {
  return LENDER_MILESTONE_REVIEW_VARIANTS.some(
    (variant) => variant.key === value
  );
}

type DecisionPreview = "approve" | "reject" | null;

const milestone: MilestoneSheetData = {
  actualStartedAt: Date.parse("2026-07-17T13:30:00-04:00"),
  canStartWork: false,
  column: "Milestone 04 · Completion review",
  contractors: [
    { initials: "GC", name: "General contractor", role: "Framing" },
    { initials: "RC", name: "Roofing contractor", role: "Roof framing" },
  ],
  currentDay: 103,
  drawGroupKey: "draw-03",
  milestoneKey: "ms-04",
  name: "Framing & structural shell",
  plannedBudgetCents: 8_240_000,
  plannedEndDate: "2026-08-08",
  plannedStartDate: "2026-07-17",
  recentEvents: [
    {
      _id: "event-submitted",
      actor: "Builder",
      createdAt: Date.parse("2026-08-12T14:18:00-04:00"),
      title: "Completion resubmitted on the same request record",
    },
    {
      _id: "event-correction",
      actor: "Builder",
      createdAt: Date.parse("2026-08-12T13:42:00-04:00"),
      title: "Documented total corrected to match actual cost",
    },
    {
      _id: "event-visit",
      actor: "Back Office site visitor",
      createdAt: Date.parse("2026-08-11T16:05:00-04:00"),
      title: "Site Visit report completed with three photos",
    },
    {
      _id: "event-rejected",
      actor: "Lender reviewer",
      createdAt: Date.parse("2026-08-10T11:26:00-04:00"),
      title:
        "Prior submission rejected · documented total did not match actual cost",
    },
  ],
  requestedAmountCents: 8_240_000,
  status: "complete",
  submittedAt: Date.parse("2026-08-12T14:18:00-04:00"),
  submilestones: [
    {
      actualCostCents: 5_300_000,
      actualStartedAt: Date.parse("2026-07-17T13:30:00-04:00"),
      assignments: [
        {
          actualCostCents: 5_300_000,
          contractorId: "contractor-general",
          estimatedCostCents: 5_300_000,
          name: "General contractor",
          role: "Framing",
          status: "complete",
        },
      ],
      budgetCents: 5_300_000,
      completedAt: Date.parse("2026-08-08T17:00:00-04:00"),
      costDocuments: [
        {
          _id: "invoice-framing",
          allocationAmountCents: 5_300_000,
          kind: "invoice",
          pages: [
            {
              assetId: "asset-invoice-framing",
              downloadUrl:
                "data:application/pdf;base64,JVBERi0xLjQKJSBUaHJvd2F3YXkgcHJvdG90eXBlIGRvY3VtZW50Cg==",
              fileName: "framing-progress-invoice.pdf",
              mimeType: "application/pdf",
            },
          ],
          subtotalCents: 4_690_265,
          taxCents: 609_735,
          title: "Framing progress invoice",
        },
      ],
      description:
        "Complete structural wall framing, beams, floor assemblies, and rough openings to the approved scope.",
      endDate: "2026-08-08",
      evidence: [
        {
          createdAt: Date.parse("2026-08-08T16:40:00-04:00"),
          evidenceKey: "framing-north",
          fileName: "north-elevation-framing.jpg",
          label: "North elevation",
          locationVerified: true,
          mimeType: "image/jpeg",
          previewUrl:
            "/assets/fairlend-multiplex-gta/source/section-06-draw-planning-framing-source.png",
          sizeBytes: 2_410_000,
          source: "builder",
          tag: "completion",
        },
        {
          createdAt: Date.parse("2026-08-08T16:42:00-04:00"),
          evidenceKey: "framing-interior",
          fileName: "interior-bearing-walls.jpg",
          label: "Bearing walls",
          locationVerified: true,
          mimeType: "image/jpeg",
          previewUrl:
            "/assets/fairlend-investors/imagery/project-types-construction-draw.webp",
          sizeBytes: 2_080_000,
          source: "builder",
          tag: "completion",
        },
      ],
      fieldNote: "Confirm rough openings and engineered beam locations.",
      key: "sub-04-01",
      materials: [],
      name: "Structural framing",
      order: 1,
      review: {
        backOfficeApproved: true,
        backOfficeRequired: true,
        lenderApprovals: 2,
        lenderQuorumRequired: true,
        lenderQuorumSize: 2,
        state: "approved",
      },
      siteVisits: [
        {
          completedAt: "2026-08-11T16:05:00-04:00",
          note: "Report complete · 3 photos",
          requestedAt: "2026-08-09T09:15:00-04:00",
          status: "complete",
          visitId: "SV-0142",
        },
      ],
      startDate: "2026-07-17",
      status: "complete",
      submilestoneId:
        "prototype-structural-framing" as Id<"buildSubmilestones">,
      workflowRevision: 7,
    },
    {
      actualCostCents: 2_940_000,
      actualStartedAt: Date.parse("2026-07-28T08:15:00-04:00"),
      assignments: [
        {
          actualCostCents: 2_940_000,
          contractorId: "contractor-roofing",
          estimatedCostCents: 2_940_000,
          name: "Roofing contractor",
          role: "Roof framing",
          status: "complete",
        },
      ],
      budgetCents: 2_940_000,
      completedAt: Date.parse("2026-08-08T17:12:00-04:00"),
      costDocuments: [
        {
          _id: "receipt-sheathing",
          allocationAmountCents: 2_940_000,
          kind: "receipt",
          pages: [
            {
              assetId: "asset-receipt-sheathing",
              downloadUrl:
                "data:application/pdf;base64,JVBERi0xLjQKJSBUaHJvd2F3YXkgcHJvdG90eXBlIGRvY3VtZW50Cg==",
              fileName: "roof-sheathing-receipt.pdf",
              mimeType: "application/pdf",
            },
          ],
          subtotalCents: 2_601_770,
          taxCents: 338_230,
          title: "Roof sheathing receipt",
        },
      ],
      description:
        "Complete roof framing, structural sheathing, and required connections to the approved scope.",
      endDate: "2026-08-08",
      evidence: [
        {
          createdAt: Date.parse("2026-08-08T16:58:00-04:00"),
          evidenceKey: "roof-sheathing",
          fileName: "roof-sheathing-complete.jpg",
          label: "Roof sheathing",
          locationVerified: true,
          mimeType: "image/jpeg",
          previewUrl: "/assets/fairlend-press-kit/company-building-photo.webp",
          sizeBytes: 2_770_000,
          source: "builder",
          tag: "completion",
        },
      ],
      fieldNote: "Confirm structural connections before concealment.",
      key: "sub-04-02",
      materials: [],
      name: "Roof framing & sheathing",
      order: 2,
      review: {
        backOfficeApproved: true,
        backOfficeRequired: true,
        lenderApprovals: 1,
        lenderQuorumRequired: true,
        lenderQuorumSize: 2,
        state: "pending_review",
      },
      siteVisits: [],
      startDate: "2026-07-28",
      status: "complete",
      submilestoneId: "prototype-roof-framing" as Id<"buildSubmilestones">,
      workflowRevision: 7,
    },
  ],
};

type SubmilestoneReviewMap = Record<string, SubmilestoneReviewSummary>;

function initialSubmilestoneReviews(): SubmilestoneReviewMap {
  return Object.fromEntries(
    (milestone.submilestones ?? []).flatMap((submilestone) =>
      submilestone.review
        ? [[submilestone.key, { ...submilestone.review }]]
        : []
    )
  );
}

type PrototypeDiscussionComments = ComponentProps<
  typeof SubmilestoneDiscussionThread
>["comments"];

function commentDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

const prototypeCommentsBySubmilestone: Record<
  string,
  PrototypeDiscussionComments
> = {
  "sub-04-01": [
    {
      attachments: [],
      authorDisplayName: "Builder team",
      authorRole: "builder",
      commentId:
        "prototype-comment-structural-builder" as Id<"buildActionItemComments">,
      createdAt: Date.parse("2026-08-12T13:42:00-04:00"),
      plainText:
        "The corrected framing invoice now matches actual cost. North elevation and bearing-wall photos are linked in Evidence.",
      reactions: [
        {
          count: 1,
          reaction: "acknowledged",
          viewerHasReacted: false,
        },
      ],
      references: [],
      tiptapJson: commentDocument(
        "The corrected framing invoice now matches actual cost. North elevation and bearing-wall photos are linked in Evidence."
      ),
    },
    {
      attachments: [],
      authorDisplayName: "Back Office team",
      authorRole: "broker-staff",
      commentId:
        "prototype-comment-structural-backoffice" as Id<"buildActionItemComments">,
      createdAt: Date.parse("2026-08-12T14:02:00-04:00"),
      plainText:
        "Site Visit SV-0142 is complete. Its report and three photos cover this Sub-milestone.",
      reactions: [],
      references: [],
      tiptapJson: commentDocument(
        "Site Visit SV-0142 is complete. Its report and three photos cover this Sub-milestone."
      ),
    },
  ] as PrototypeDiscussionComments,
  "sub-04-02": [
    {
      attachments: [],
      authorDisplayName: "Builder team",
      authorRole: "builder",
      commentId:
        "prototype-comment-roof-builder" as Id<"buildActionItemComments">,
      createdAt: Date.parse("2026-08-12T14:08:00-04:00"),
      plainText:
        "The roof sheathing receipt and completion photo are attached to this Sub-milestone.",
      reactions: [],
      references: [],
      tiptapJson: commentDocument(
        "The roof sheathing receipt and completion photo are attached to this Sub-milestone."
      ),
    },
  ] as PrototypeDiscussionComments,
};

const decisionFacts = {
  actualCost: "$82,400.00",
  approvalMode: "Back Office + lender quorum",
  backOfficeApproval: "Recorded",
  builderState: "Under lender review",
  documentedTotal: "$82,400.00",
  lenderApprovals: "1 of 2 recorded",
  requestRecord: "Same request · resubmitted",
  siteVisit: "Complete report · 3 photos",
} as const;

const gateRows = [
  {
    detail: "2 of 2 sub-milestones complete",
    label: "Canonical scope",
    source: "Milestone scope",
    status: "ready",
  },
  {
    detail: "$82,400.00 documented = $82,400.00 actual",
    label: "Receipts & invoices",
    source: "2 attached cost documents",
    status: "ready",
  },
  {
    detail: "Completed report with 3 photos",
    label: "Required Site Visit",
    source: "Back Office Site Visit SV-0142",
    status: "ready",
  },
  {
    detail: "Back Office recorded · lender quorum 1 of 2",
    label: "Approval policy",
    source: "Locked Build policy",
    status: "waiting",
  },
] as const;

const reviewEvidence = [
  {
    detail: "3 builder completion photos",
    icon: ImageIcon,
    label: "Completion evidence",
  },
  {
    detail: "Complete report · 3 Site Visit photos",
    icon: MapPinCheck,
    label: "Site Visit package",
  },
  {
    detail: "Framing progress invoice · $53,000.00",
    icon: FileText,
    label: "Invoice",
  },
  {
    detail: "Roof sheathing receipt · $29,400.00",
    icon: ReceiptText,
    label: "Receipt",
  },
] as const;

export function LenderMilestoneReviewPrototype({
  variant,
}: {
  variant: LenderMilestoneReviewVariant;
}) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-8">
      <PrototypeNotice />
      {variant === "A" ? <VariantA /> : null}
      {variant === "B" ? <VariantB /> : null}
      {variant === "C" ? <VariantC /> : null}
      {variant === "D" ? <VariantD /> : null}
    </div>
  );
}

function PrototypeNotice() {
  return (
    <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-center font-medium text-amber-950 text-xs tracking-wide dark:bg-amber-950/40 dark:text-amber-100">
      THROWAWAY PROTOTYPE · REPRESENTATIVE READ-ONLY DATA · NO DECISION IS SAVED
    </div>
  );
}

export function VariantA() {
  const [sheetOpen, setSheetOpen] = useState(true);
  const [lastAction, setLastAction] = useState(
    "Representative review state loaded. No action is saved."
  );
  const [reviews, setReviews] = useState<SubmilestoneReviewMap>(
    initialSubmilestoneReviews
  );
  const milestoneWithReviews: MilestoneSheetData = {
    ...milestone,
    submilestones: (milestone.submilestones ?? []).map((submilestone) => ({
      ...submilestone,
      review: reviews[submilestone.key] ?? submilestone.review,
    })),
  };

  const approveSubmilestone = (submilestoneKey: string) => {
    setReviews((current) => {
      const review = current[submilestoneKey];
      if (!review) {
        return current;
      }
      const lenderApprovals = Math.min(
        review.lenderQuorumSize,
        review.lenderApprovals + 1
      );
      const approved =
        (!review.backOfficeRequired || review.backOfficeApproved) &&
        (!review.lenderQuorumRequired ||
          lenderApprovals >= review.lenderQuorumSize);
      return {
        ...current,
        [submilestoneKey]: {
          ...review,
          lenderApprovals,
          state: approved ? "approved" : "pending_review",
        },
      };
    });
    setLastAction(
      "Lender approval recorded in prototype memory. Required policy gates were recalculated."
    );
  };

  const rejectSubmilestone = (submilestoneKey: string) => {
    setReviews((current) => {
      const review = current[submilestoneKey];
      if (!review) {
        return current;
      }
      return {
        ...current,
        [submilestoneKey]: {
          ...review,
          backOfficeApproved: false,
          lenderApprovals: 0,
          state: "rejected",
        },
      };
    });
    setLastAction(
      "Sub-milestone rejected in prototype memory. The same request returns for correction and all required approvals reset."
    );
  };

  return (
    <main className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
      <PageHeading
        eyebrow="Variant A · Canonical adaptation"
        summary="The existing Back Office Milestone detail sheet remains the canonical record. A lender review layer is embedded after its scope and evidence sections."
      />
      <Frame>
        <FramePanel className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
          <ClipboardCheck className="size-8 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Canonical Milestone sheet</h2>
            <p className="mt-1 max-w-lg text-muted-foreground text-sm">
              Scope, lifecycle, evidence, Site Visits, cost documents, and
              activity stay in the existing shared surface.
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)}>
            Open Milestone review
          </Button>
        </FramePanel>
      </Frame>
      {sheetOpen ? (
        <MilestoneDetailSheet
          data={milestoneWithReviews}
          onClose={() => setSheetOpen(false)}
          onOpenCanonicalTarget={(_target, context) =>
            setLastAction(
              `Canonical Sub-milestone ${context?.selectedTab ?? "overview"} tab selected in prototype.`
            )
          }
          prototypeAggregateTabs={{
            collaboration: <AggregateCollaborationTab />,
            evidence: <AggregateEvidenceTab />,
            receiptsInvoices: <AggregateCostDocumentsTab />,
          }}
          prototypeReviewLayer={
            <CanonicalLenderReviewLayer activity={lastAction} />
          }
          prototypeSubmilestoneReviewActions={{
            onApprove: approveSubmilestone,
            onReject: rejectSubmilestone,
          }}
        />
      ) : null}
    </main>
  );
}

function CanonicalLenderReviewLayer({ activity }: { activity: string }) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-primary text-xs uppercase tracking-wider">
              Lender review layer
            </p>
            <h2 className="mt-1 font-semibold text-base">Decision readiness</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Build policy requires Back Office approval and a lender quorum.
            </p>
          </div>
          <Badge variant="warning">Lender decision required</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {gateRows.map((gate) => (
            <div className="flex items-start gap-2" key={gate.label}>
              {gate.status === "ready" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-600" />
              )}
              <div>
                <p className="font-medium text-sm">{gate.label}</p>
                <p className="text-muted-foreground text-xs">{gate.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <Separator />
        <DecisionComposer compact />
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {activity}
        </p>
      </FramePanel>
    </Frame>
  );
}

function AggregateEvidenceTab() {
  const [openedSubmilestone, setOpenedSubmilestone] = useState<string | null>(
    null
  );
  const evidence = (milestone.submilestones ?? []).flatMap((submilestone) =>
    submilestone.evidence
      .filter((asset) => asset.source !== "site_visit")
      .map((asset) => ({ asset, submilestone }))
  );

  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Builder evidence</h2>
            <p className="text-muted-foreground text-sm">
              All Builder-submitted evidence attached to this Milestone's
              canonical Sub-milestones.
            </p>
          </div>
          <Badge variant="outline">{evidence.length} assets</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {evidence.map(({ asset, submilestone }) => (
            <EvidenceAssetCard
              asset={{ ...asset }}
              footer={
                <Button
                  className="h-auto min-w-0 justify-start p-0 text-left"
                  onClick={() => setOpenedSubmilestone(submilestone.name)}
                  size="sm"
                  variant="link"
                >
                  <Link2 aria-hidden="true" />
                  <span className="truncate">{submilestone.name}</span>
                </Button>
              }
              key={`${submilestone.key}:${asset.evidenceKey}`}
            />
          ))}
        </div>
        <p aria-live="polite" className="min-h-4 text-muted-foreground text-xs">
          {openedSubmilestone
            ? `${openedSubmilestone} selected · canonical Sub-milestone link preview.`
            : "Each photo stays linked to its canonical Sub-milestone."}
        </p>
      </FramePanel>
    </Frame>
  );
}

function AggregateCostDocumentsTab() {
  const [openedSubmilestone, setOpenedSubmilestone] = useState<string | null>(
    null
  );
  const rows = milestone.submilestones ?? [];
  return (
    <Frame>
      <FramePanel className="space-y-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Receipts / invoices</h2>
            <p className="text-muted-foreground text-sm">
              Cost documents aggregated across every canonical Sub-milestone.
            </p>
          </div>
          <Badge variant="success">$82,400 documented</Badge>
        </div>
        <div className="space-y-5">
          {rows.map((submilestone, index) => (
            <section className="space-y-3" key={submilestone.key}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-sm">{submilestone.name}</h3>
                  <p className="text-muted-foreground text-xs">
                    {submilestone.costDocuments?.length ?? 0} linked cost
                    document
                  </p>
                </div>
                <Button
                  className="h-auto p-0"
                  onClick={() => setOpenedSubmilestone(submilestone.name)}
                  size="sm"
                  variant="link"
                >
                  <Link2 aria-hidden="true" /> Open Sub-milestone
                </Button>
              </div>
              <CostDocumentFileList
                documents={submilestone.costDocuments ?? []}
              />
            </section>
          ))}
        </div>
        <p aria-live="polite" className="min-h-4 text-muted-foreground text-xs">
          {openedSubmilestone
            ? `${openedSubmilestone} selected · canonical Receipts / invoices tab preview.`
            : "Each cost document stays linked to its canonical Sub-milestone."}
        </p>
      </FramePanel>
    </Frame>
  );
}

function AggregateCollaborationTab() {
  const [openedSubmilestone, setOpenedSubmilestone] = useState<string | null>(
    null
  );
  const rows = milestone.submilestones ?? [];
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Collaboration</h2>
            <p className="text-muted-foreground text-sm">
              Canonical comment threads aggregated across every Sub-milestone.
              This lender prototype is read-only.
            </p>
          </div>
          <Badge variant="outline">{rows.length} Sub-milestones</Badge>
        </div>
        <div className="space-y-5">
          {rows.map((submilestone, index) => (
            <section className="space-y-3" key={submilestone.key}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm">{submilestone.name}</h3>
                  <p className="text-muted-foreground text-xs">
                    Canonical Sub-milestone comment thread
                  </p>
                </div>
                <Button
                  className="h-auto p-0"
                  onClick={() => setOpenedSubmilestone(submilestone.name)}
                  size="sm"
                  variant="link"
                >
                  <Link2 aria-hidden="true" /> Open full collaboration
                </Button>
              </div>
              <SubmilestoneDiscussionThread
                buildId={"prototype-build" as Id<"activeBuilds">}
                comments={
                  prototypeCommentsBySubmilestone[submilestone.key] ?? []
                }
                onReact={async () => undefined}
                onReferenceOpen={() => undefined}
                onReply={() => undefined}
                organizationId="prototype-organization"
                readOnly
                tagOptions={[]}
              />
            </section>
          ))}
        </div>
        <p aria-live="polite" className="min-h-4 text-muted-foreground text-xs">
          {openedSubmilestone
            ? `${openedSubmilestone} selected · canonical Collaboration tab preview.`
            : "Each comment thread stays linked to its canonical Sub-milestone."}
        </p>
      </FramePanel>
    </Frame>
  );
}

export function VariantB() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
      <PageHeading
        eyebrow="Variant B · Evidence desk"
        summary="Review evidence in a broad dossier while a narrow rail keeps policy gates and the decision action visible."
      />
      <MilestoneSummaryStrip />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Frame>
            <FramePanel className="space-y-5 p-5">
              <SectionHeading
                description="Only evidence attached to this Milestone review is shown."
                icon={Eye}
                title="Reviewer evidence dossier"
              />
              <div className="grid gap-3 md:grid-cols-2">
                {reviewEvidence.map((item) => (
                  <Card key={item.label}>
                    <CardHeader className="pb-3">
                      <item.icon className="size-5 text-muted-foreground" />
                      <CardTitle className="text-sm">{item.label}</CardTitle>
                      <CardDescription>{item.detail}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button size="sm" variant="outline">
                        Review attachment <ArrowRight />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </FramePanel>
          </Frame>
          <ScopeAndLifecycle />
          <AuditHistory />
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20">
          <Frame>
            <FramePanel className="space-y-4 p-4">
              <SectionHeading
                description="Locked Build policy · both groups required"
                icon={ShieldCheck}
                title="Decision gates"
              />
              <div className="space-y-4">
                {gateRows.map((gate, index) => (
                  <div className="flex gap-3" key={gate.label}>
                    <div className="flex flex-col items-center">
                      <span className="grid size-7 place-items-center rounded-full bg-muted font-semibold text-xs">
                        {index + 1}
                      </span>
                      {index < gateRows.length - 1 ? (
                        <span className="mt-1 h-full w-px bg-border" />
                      ) : null}
                    </div>
                    <div className="pb-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{gate.label}</p>
                        <Badge
                          variant={
                            gate.status === "ready" ? "success" : "warning"
                          }
                        >
                          {gate.status === "ready" ? "Ready" : "Waiting"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {gate.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </FramePanel>
          </Frame>
          <Frame>
            <FramePanel className="p-4">
              <DecisionComposer />
            </FramePanel>
          </Frame>
        </aside>
      </div>
    </main>
  );
}

export function VariantC() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeading
        eyebrow="Variant C · Guided gate sequence"
        summary="The reviewer moves through the policy gates in order, with the relevant evidence attached to each checkpoint."
      />
      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Review readiness</p>
              <p className="text-muted-foreground text-sm">
                Three evidence gates satisfied · lender decision remains
              </p>
            </div>
            <Badge variant="warning">Step 4 of 4</Badge>
          </div>
          <Progress value={75} />
        </FramePanel>
      </Frame>
      <div className="relative space-y-4 before:absolute before:top-6 before:bottom-6 before:left-[1.35rem] before:w-px before:bg-border sm:before:left-[1.6rem]">
        <GuidedGate
          index={1}
          status="complete"
          summary="Both Sub-milestones are complete and the completion request is the current version of the same durable record."
          title="Confirm canonical scope and lifecycle"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact label="Structural framing" value="Complete · $53,000.00" />
            <Fact
              label="Roof framing & sheathing"
              value="Complete · $29,400.00"
            />
          </div>
        </GuidedGate>
        <GuidedGate
          index={2}
          status="complete"
          summary="The policy-required documented total equals the Builder's entered actual cost."
          title="Reconcile receipts and invoices"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label="Actual cost" value={decisionFacts.actualCost} />
            <Fact
              label="Documented total"
              value={decisionFacts.documentedTotal}
            />
            <Fact label="Variance" value="$0.00" />
          </div>
        </GuidedGate>
        <GuidedGate
          index={3}
          status="complete"
          summary="A Back Office Site Visit satisfies the gate because its report is complete and includes three photos."
          title="Validate the required Site Visit"
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Report complete</Badge>
            <Badge variant="success">3 photos</Badge>
            <Badge variant="outline">Completed by Back Office</Badge>
          </div>
        </GuidedGate>
        <GuidedGate
          index={4}
          status="current"
          summary="Back Office approval is recorded. One additional lender approval is needed to complete the locked policy."
          title="Record the lender decision"
        >
          <DecisionComposer />
        </GuidedGate>
      </div>
      <AuditHistory />
    </main>
  );
}

function GuidedGate({
  children,
  index,
  status,
  summary,
  title,
}: {
  children: ReactNode;
  index: number;
  status: "complete" | "current";
  summary: string;
  title: string;
}) {
  return (
    <div className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[3.25rem_minmax(0,1fr)]">
      <div
        className={`z-10 grid size-11 place-items-center rounded-full border-4 border-muted/30 font-semibold text-sm sm:size-13 ${
          status === "complete"
            ? "bg-emerald-600 text-white"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {status === "complete" ? <Check className="size-5" /> : index}
      </div>
      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-base">{title}</h2>
              <Badge variant={status === "complete" ? "success" : "warning"}>
                {status === "complete" ? "Verified" : "Decision required"}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">{summary}</p>
          </div>
          <Separator />
          {children}
        </FramePanel>
      </Frame>
    </div>
  );
}

export function VariantD() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
      <PageHeading
        eyebrow="Variant D · Decision ledger"
        summary="A dense ledger puts policy, evidence source, and gate state in one scan, with private reviewer history alongside it."
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Frame>
            <FramePanel className="p-0">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <SectionHeading
                  description="Framing & structural shell · current submission"
                  icon={ListChecks}
                  title="Milestone decision ledger"
                />
                <Badge variant="warning">Lender action required</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-y bg-muted/60 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-5 py-3 font-medium">Requirement</th>
                      <th className="px-5 py-3 font-medium">Evidence</th>
                      <th className="px-5 py-3 font-medium">
                        Canonical source
                      </th>
                      <th className="px-5 py-3 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {gateRows.map((gate) => (
                      <tr key={gate.label}>
                        <td className="px-5 py-4 font-medium">{gate.label}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {gate.detail}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {gate.source}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant={
                              gate.status === "ready" ? "success" : "warning"
                            }
                          >
                            {gate.status === "ready" ? "Satisfied" : "Open"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 border-t p-5 sm:grid-cols-3">
                <Fact label="Request continuity" value="Same durable record" />
                <Fact
                  label="Current Builder state"
                  value="Under lender review"
                />
                <Fact label="Approval mode" value="Back Office + quorum" />
              </div>
            </FramePanel>
          </Frame>
          <div className="grid gap-5 lg:grid-cols-2">
            <ScopeAndLifecycle />
            <Frame>
              <FramePanel className="space-y-4 p-5">
                <SectionHeading
                  description="Attachments relevant to this Milestone review"
                  icon={FileCheck2}
                  title="Attached review evidence"
                />
                <div className="divide-y">
                  {reviewEvidence.map((item) => (
                    <div
                      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      key={item.label}
                    >
                      <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </FramePanel>
            </Frame>
          </div>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-20">
          <Frame>
            <FramePanel className="space-y-4 p-5">
              <SectionHeading
                description="Visible to authorized reviewers and Back Office"
                icon={UserRoundCheck}
                title="Private reviewer record"
              />
              <DecisionComposer />
            </FramePanel>
          </Frame>
          <BuilderVisibility />
          <AuditHistory compact />
        </aside>
      </div>
    </main>
  );
}

function PageHeading({
  eyebrow,
  summary,
}: {
  eyebrow: string;
  summary: string;
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="font-medium text-primary text-xs uppercase tracking-wider">
          {eyebrow}
        </p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight">
          Framing & structural shell
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">{summary}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">MS-04</Badge>
        <Badge variant="warning">Lender review required</Badge>
      </div>
    </header>
  );
}

function MilestoneSummaryStrip() {
  return (
    <Frame>
      <FramePanel className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Completion request" value={decisionFacts.requestRecord} />
        <Fact label="Approval policy" value={decisionFacts.approvalMode} />
        <Fact label="Cost reconciliation" value="$82,400.00 · matched" />
        <Fact label="Required Site Visit" value={decisionFacts.siteVisit} />
      </FramePanel>
    </Frame>
  );
}

function SectionHeading({
  description,
  icon: Icon,
  title,
}: {
  description?: string;
  icon: typeof Eye;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <h2 className="font-semibold text-base">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

function ScopeAndLifecycle() {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <SectionHeading
          description="Read-only projection of the shared Milestone record"
          icon={ClipboardCheck}
          title="Canonical scope & lifecycle"
        />
        <div className="divide-y">
          <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
            <div>
              <p className="font-medium text-sm">Structural framing</p>
              <p className="text-muted-foreground text-xs">
                Framing, beams, floor assemblies, rough openings
              </p>
            </div>
            <Badge variant="success">Complete</Badge>
          </div>
          <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
            <div>
              <p className="font-medium text-sm">Roof framing & sheathing</p>
              <p className="text-muted-foreground text-xs">
                Roof structure, sheathing, required connections
              </p>
            </div>
            <Badge variant="success">Complete</Badge>
          </div>
        </div>
        <Separator />
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Planned" value="Jul 17 – Aug 8" />
          <Fact label="Completed" value="Aug 8, 2026" />
          <Fact label="Submitted" value="Aug 12, 2026" />
        </div>
      </FramePanel>
    </Frame>
  );
}

function AuditHistory({ compact = false }: { compact?: boolean }) {
  const events = compact
    ? milestone.recentEvents.slice(0, 3)
    : milestone.recentEvents;
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <SectionHeading
          description="Prior cycles remain attached to this request"
          icon={History}
          title="Decision & audit history"
        />
        <ol className="space-y-4">
          {events.map((event, index) => (
            <li className="flex gap-3" key={event._id}>
              <div className="flex flex-col items-center">
                <span className="mt-1 size-2 rounded-full bg-primary" />
                {index < events.length - 1 ? (
                  <span className="mt-1 h-full w-px bg-border" />
                ) : null}
              </div>
              <div className="pb-1">
                <p className="font-medium text-sm">{event.title}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {event.actor} · {formatPrototypeDate(event.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </FramePanel>
    </Frame>
  );
}

function BuilderVisibility() {
  return (
    <Frame>
      <FramePanel className="space-y-3 p-5">
        <SectionHeading
          description="High-level requirements and state only"
          icon={Eye}
          title="Builder-visible projection"
        />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Requirement</span>
            <span className="text-right font-medium">Both groups approve</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">State</span>
            <span className="text-right font-medium">
              {decisionFacts.builderState}
            </span>
          </div>
        </div>
        <Separator />
        <div className="flex items-start gap-2 text-muted-foreground text-xs">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          Reviewer identity and rejection rationale remain private.
        </div>
      </FramePanel>
    </Frame>
  );
}

function DecisionComposer({ compact = false }: { compact?: boolean }) {
  const [preview, setPreview] = useState<DecisionPreview>(null);
  const [reason, setReason] = useState("");
  const [rejectionReady, setRejectionReady] = useState(false);

  const reset = () => {
    setPreview(null);
    setReason("");
    setRejectionReady(false);
  };

  return (
    <div className="space-y-4" data-testid="lender-decision-composer">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Lender decision</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {decisionFacts.lenderApprovals} · {decisionFacts.backOfficeApproval}
            {" Back Office approval"}
          </p>
        </div>
        <Badge variant="outline">Private reviewer action</Badge>
      </div>

      {preview === null ? (
        <div className={`grid gap-2 ${compact ? "sm:grid-cols-2" : ""}`}>
          <Button onClick={() => setPreview("approve")}>
            <CheckCircle2 /> Approve milestone
          </Button>
          <Button onClick={() => setPreview("reject")} variant="outline">
            <X /> Review rejection
          </Button>
        </div>
      ) : null}

      {preview === "approve" ? (
        <Frame>
          <FramePanel className="space-y-3 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-sm">Approval selected</p>
                <p className="text-muted-foreground text-xs">
                  This would record the current lender reviewer's approval. The
                  lender quorum would then be complete.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setPreview(null)}
                size="sm"
                variant="outline"
              >
                <ArrowLeft /> Back
              </Button>
              <Button disabled size="sm">
                Prototype only · not saved
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {preview === "reject" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`rejection-reason-${compact ? "compact" : "full"}`}>
              Private rejection reason <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={`rejection-reason-${compact ? "compact" : "full"}`}
              onChange={(event) => {
                setReason(event.target.value);
                setRejectionReady(false);
              }}
              placeholder="Required before rejection"
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              Visible to authorized reviewers and Back Office, not the Builder.
            </p>
          </div>
          <Frame>
            <FramePanel className="flex items-start gap-2 p-3">
              <RotateCcw className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-muted-foreground text-xs">
                Rejection returns this same request to Builder correction. On
                resubmission, all policy-required approvals reset and history
                remains.
              </p>
            </FramePanel>
          </Frame>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset} size="sm" variant="outline">
              <ArrowLeft /> Back
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() => setRejectionReady(true)}
              size="sm"
              variant="destructive"
            >
              Reject milestone
            </Button>
          </div>
          {rejectionReady ? (
            <p
              aria-live="polite"
              className="font-medium text-destructive text-xs"
            >
              Prototype state: rejection is ready, but nothing was saved.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatPrototypeDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}
