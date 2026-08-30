import { CheckCircle2, FileText, Send, XCircle } from "lucide-react";
import { type ReactNode } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import type { ProductionProposalDetail } from "./production-proposal-surface-contracts";
import {
  Section,
  DetailGrid,
  statusLabel,
  formatCents,
  calculateProposalApprovedAmountCents,
} from "./production-proposal-surface-shared";

export function ProductionProposalPackageSurface({
  action,
  detail,
  onSubmit,
}: {
  action?: ReactNode;
  detail: ProductionProposalDetail;
  onSubmit: () => void;
}) {
  const proposal = detail.proposal;
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
            <h1 className="mt-2 font-semibold text-2xl tracking-tight">
              {proposal.buildName}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {proposal.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {action}
            <Button
              disabled={proposal.status !== "draft"}
              onClick={onSubmit}
              size="sm"
            >
              <Send />
              Submit proposal
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Section title="Proposal identity">
            <DetailGrid
              rows={[
                ["Build", proposal.buildName],
                ["Location", proposal.location],
                ["Status", statusLabel(proposal.status)],
              ]}
            />
          </Section>

          <Section title="Documents">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={permit ? "success" : "warning"}>
                {permit ? "Permit PDF linked" : "Permit missing"}
              </Badge>
              {permit ? (
                <span className="text-sm">{permit.fileName}</span>
              ) : detail.permitWaiver ? (
                <span className="text-sm">
                  Permit waiver: {detail.permitWaiver.reason}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Approval requires permit upload or audited waiver.
                </span>
              )}
              <BuildPermitViewerDrawer
                permit={permitViewerDocument}
                size="sm"
              />
            </div>
          </Section>

          <Section title="Milestone worksheet">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail.milestones ?? []).map((milestone) => (
                  <TableRow key={milestone.key}>
                    <TableCell>{milestone.name}</TableCell>
                    <TableCell>
                      Day {milestone.dayStart} to {milestone.dayEnd}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(milestone.budgetCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Draw schedule">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Draw</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail.draws ?? detail.plannedDraws ?? []).map((draw) => (
                  <TableRow key={draw.drawKey}>
                    <TableCell>{draw.label}</TableCell>
                    <TableCell>Day {draw.timingDay}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(draw.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Budget and capital">
            <DetailGrid
              rows={[
                ["Total budget", formatCents(proposal.totalBudgetCents)],
                [
                  "Borrower starting cash",
                  formatCents(proposal.borrowerStartingCashCents),
                ],
                [
                  "Approved amount",
                  formatCents(
                    calculateProposalApprovedAmountCents(proposal, detail.draws)
                  ),
                ],
              ]}
            />
          </Section>

          <Section title="Template selection">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              Production foundation template snapshot
            </div>
          </Section>

          <Section title="Readiness warnings">
            <ul className="flex flex-col gap-2 text-sm">
              {permit || detail.permitWaiver ? null : (
                <li className="flex gap-2">
                  <XCircle className="size-4 text-warning" />
                  Permit PDF or permit waiver required before approval.
                </li>
              )}
              {(detail.milestones ?? []).length === 0 ? (
                <li className="flex gap-2">
                  <XCircle className="size-4 text-warning" />
                  Add at least one milestone before submission.
                </li>
              ) : (
                <li className="flex gap-2">
                  <CheckCircle2 className="size-4 text-success" />
                  Milestone and draw schedule rows are ready.
                </li>
              )}
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}
