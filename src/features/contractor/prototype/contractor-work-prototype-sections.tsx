import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  FileCheck2,
  HelpCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  FramePanel,
} from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";

export type AssignmentKind = "build" | "proposal";
export type AcknowledgementState =
  | "pending"
  | "accepted"
  | "clarification"
  | "declined";
export type EvidenceState =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "changes_requested"
  | "accepted"
  | "not_required";
export type IssueState = "none" | "open" | "waiting_on_builder" | "resolved";

export interface Assignment {
  acknowledgement: AcknowledgementState;
  assignmentLabel: string;
  buildId: string;
  changedFields?: string[];
  dateBucket: "today" | "next" | "later";
  evidence: EvidenceState;
  evidenceDetail: string;
  id: string;
  issue: IssueState;
  issueDetail?: string;
  milestone: string;
  nextAction: string;
  role: string;
  scope: string;
  stale?: boolean;
  subMilestone: string;
  window: string;
}

export interface WorkGroup {
  address: string;
  assignments: Assignment[];
  builderContact: string;
  id: string;
  kind: AssignmentKind;
  name: string;
  permit?: string;
  plannedDateRange: string;
  revision: string;
}

export function AssignmentDetail({
  acknowledgement,
  assignment,
  compact = false,
  group,
  onRespond,
}: {
  acknowledgement: AcknowledgementState;
  assignment: Assignment;
  compact?: boolean;
  group: WorkGroup;
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState,
  ) => void;
}) {
  return (
    <FramePanel className={cn(compact ? "p-0 shadow-none" : "p-5 sm:p-6")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ObjectBadge kind={group.kind} />
            <AcknowledgementBadge state={acknowledgement} />
            {assignment.stale ? (
              <Badge variant="warning">
                <AlertTriangle className="size-3" /> Plan changed
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 font-semibold text-xl tracking-[-0.02em] sm:text-2xl">
            {assignment.subMilestone}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {assignment.milestone} · {group.name}
          </p>
        </div>
        <Button size="sm" variant="outline">
          Open Build collaboration <ArrowUpRight className="size-4" />
        </Button>
      </div>

      {acknowledgement === "pending" ? (
        <div className="mt-5 rounded-xl border border-info/25 bg-info/7 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-info" />
            <div>
              <p className="font-semibold text-sm">Your response is required</p>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Accepting activates this exact {assignment.assignmentLabel.toLowerCase()}.
                It does not approve a Milestone, release a Draw, or change the
                current Budget or Roadmap.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={() => onRespond(assignment, "accepted")}>
              <Check className="size-4" /> Accept assignment
            </Button>
            <Button
              onClick={() => onRespond(assignment, "clarification")}
              variant="outline"
            >
              <HelpCircle className="size-4" /> Request clarification
            </Button>
            <Button
              onClick={() => onRespond(assignment, "declined")}
              variant="outline"
            >
              <X className="size-4" /> Decline or dispute scope
            </Button>
          </div>
        </div>
      ) : null}

      {assignment.stale ? (
        <div className="mt-5 rounded-xl border border-warning/25 bg-warning/7 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                Plan changed after this assignment was accepted
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Your assignment remains visible and active. Review the changed
                fields against the accepted plan snapshot.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {assignment.changedFields?.map((field) => (
                  <Badge key={field} variant="warning">
                    {field}
                  </Badge>
                ))}
              </div>
              <Button className="mt-4" size="sm" variant="outline">
                Compare current plan to accepted snapshot
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Separator className="my-5" />

      <div className="grid gap-5 lg:grid-cols-3">
        <DetailSection icon={<BriefcaseBusiness />} title="Scope basis">
          <p>{assignment.scope}</p>
          <DetailLine label="Assignment" value={assignment.assignmentLabel} />
          <DetailLine label="Your role" value={assignment.role} />
          <DetailLine label="Plan record" value={group.revision} />
        </DetailSection>
        <DetailSection icon={<CalendarClock />} title="Execution record">
          <DetailLine label="Work window" value={assignment.window} />
          <DetailLine label="Evidence" value={assignment.evidenceDetail} />
          <DetailLine
            label="Permit"
            value={group.permit ? group.permit : "Not issued during proposal planning"}
          />
        </DetailSection>
        <DetailSection icon={<MessageSquareText />} title="Response record">
          <DetailLine
            label="Acknowledgement"
            value={acknowledgementLabel(acknowledgement)}
          />
          <DetailLine
            label="Issue"
            value={assignment.issueDetail ?? issueLabel(assignment.issue)}
          />
          <DetailLine label="Contact" value={group.builderContact} />
        </DetailSection>
      </div>

      {acknowledgement === "accepted" ? (
        <div className="mt-5 flex flex-col gap-2 border-border/70 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Supporting evidence informs Builder and Backoffice review. It does
            not determine Milestone completion.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm">
              <FileCheck2 className="size-4" />
              {assignment.evidence === "not_started"
                ? "Add supporting evidence"
                : "Open evidence"}
            </Button>
            <Button size="sm" variant="outline">
              Request clarification
            </Button>
          </div>
        </div>
      ) : null}
    </FramePanel>
  );
}

function DetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 font-semibold text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]">
        {label}
      </p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

export function LedgerMobileField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em] lg:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

export function ObjectBadge({ kind }: { kind: AssignmentKind }) {
  return kind === "build" ? (
    <Badge variant="success">
      <Building2 className="size-3" /> Active Build
    </Badge>
  ) : (
    <Badge variant="warning">
      <BriefcaseBusiness className="size-3" /> Proposal planning
    </Badge>
  );
}

export function AcknowledgementBadge({
  state,
}: {
  state: AcknowledgementState;
}) {
  const meta: Record<
    AcknowledgementState,
    { icon: ReactNode; label: string; variant: BadgeProps["variant"] }
  > = {
    pending: {
      icon: <CircleAlert className="size-3" />,
      label: "Response required",
      variant: "info",
    },
    accepted: {
      icon: <CircleCheck className="size-3" />,
      label: "Accepted",
      variant: "success",
    },
    clarification: {
      icon: <HelpCircle className="size-3" />,
      label: "Clarification requested",
      variant: "warning",
    },
    declined: {
      icon: <X className="size-3" />,
      label: "Declined",
      variant: "destructive",
    },
  };
  return (
    <Badge variant={meta[state].variant}>
      {meta[state].icon}
      {meta[state].label}
    </Badge>
  );
}

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  const labels: Record<EvidenceState, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    submitted: "Submitted",
    changes_requested: "Changes requested",
    accepted: "Accepted",
    not_required: "Not required yet",
  };
  const variants: Record<EvidenceState, BadgeProps["variant"]> = {
    not_started: "secondary",
    in_progress: "info",
    submitted: "info",
    changes_requested: "warning",
    accepted: "success",
    not_required: "secondary",
  };
  return (
    <Badge variant={variants[state]}>
      <FileCheck2 className="size-3" /> {labels[state]}
    </Badge>
  );
}

export function IssueBadge({
  compact = false,
  issue,
}: {
  compact?: boolean;
  issue: IssueState;
}) {
  const variants: Record<IssueState, BadgeProps["variant"]> = {
    none: "secondary",
    open: "destructive",
    waiting_on_builder: "warning",
    resolved: "success",
  };
  return (
    <Badge variant={variants[issue]}>
      {issue === "none" ? (
        <CircleCheck className="size-3" />
      ) : (
        <CircleAlert className="size-3" />
      )}
      {compact && issue === "none" ? "Clear" : issueLabel(issue)}
    </Badge>
  );
}

function issueLabel(issue: IssueState) {
  switch (issue) {
    case "none":
      return "No issue";
    case "open":
      return "Open issue";
    case "waiting_on_builder":
      return "Waiting on Builder";
    case "resolved":
      return "Resolved";
  }
}

function acknowledgementLabel(state: AcknowledgementState) {
  switch (state) {
    case "pending":
      return "Pending contractor response";
    case "accepted":
      return "Accepted and assignment active";
    case "clarification":
      return "Clarification requested before acceptance";
    case "declined":
      return "Declined and returned for review";
  }
}
