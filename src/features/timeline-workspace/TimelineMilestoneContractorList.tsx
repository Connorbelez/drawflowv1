import { Badge } from "#/components/ui/badge.tsx";
import { initialsFor } from "#/features/backoffice-build-detail/format.ts";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";

function formatAssignmentCost(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function contractorsForMilestone(
  planning: ContractorPlanningModel | null | undefined,
  milestoneKey: string
) {
  return (planning?.milestoneAssignments ?? []).filter(
    (assignment) => assignment.milestoneKey === milestoneKey
  );
}

export function TimelineMilestoneContractorList({
  milestoneKey,
  planning,
  testIdPrefix = "timeline-milestone-contractor",
}: {
  milestoneKey: string;
  planning?: ContractorPlanningModel | null;
  testIdPrefix?: string;
}) {
  const assignments = contractorsForMilestone(planning, milestoneKey);
  const profileByContractorId = new Map(
    (planning?.proposalContractors ?? []).map((contractor) => [
      contractor.contractorId,
      contractor,
    ])
  );

  return (
    <section
      className="grid gap-2 border-border border-t pt-3"
      data-testid={`${testIdPrefix}-section`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
          Contractors
        </h3>
        <Badge variant="outline">{assignments.length}</Badge>
      </div>

      {assignments.length === 0 ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid={`${testIdPrefix}-empty`}
        >
          No contractors assigned to this milestone yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {assignments.map((assignment) => {
            const profile = profileByContractorId.get(assignment.contractorId);
            const roleLabel = assignment.submilestoneName
              ? `${assignment.role} · ${assignment.submilestoneName}`
              : assignment.role;
            const trades = profile?.trades?.filter(Boolean) ?? [];

            return (
              <li
                className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background/60 p-2.5"
                data-testid={`${testIdPrefix}-${assignment._id}`}
                key={assignment._id}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary text-xs"
                >
                  {initialsFor(assignment.contractorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-snug">
                    {assignment.contractorName}
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {roleLabel}
                  </p>
                  {trades.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/90">
                      {trades.join(" · ")}
                    </p>
                  ) : null}
                  {assignment.estimatedCostCents !== undefined ||
                  assignment.estimatedHours !== undefined ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                      {assignment.estimatedCostCents === undefined
                        ? null
                        : formatAssignmentCost(assignment.estimatedCostCents)}
                      {assignment.estimatedCostCents !== undefined &&
                      assignment.estimatedHours !== undefined
                        ? " · "
                        : null}
                      {assignment.estimatedHours === undefined
                        ? null
                        : `${assignment.estimatedHours}h est.`}
                    </p>
                  ) : null}
                </div>
                {assignment.status ? (
                  <Badge className="shrink-0 capitalize" variant="outline">
                    {assignment.status}
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
