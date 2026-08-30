import { ShieldCheck, TriangleAlert, UserMinus } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export interface LenderMemberDecisionPermissions {
  drawDecisions: boolean;
  milestoneDecisions: boolean;
  proposalReview: boolean;
}

const permissionRows = [
  {
    description:
      "Accept or decline assigned Build Proposals for this lender organization.",
    key: "proposalReview",
    label: "Proposal decisions",
  },
  {
    description:
      "Approve or reject Milestones when the organization policy allows it.",
    key: "milestoneDecisions",
    label: "Milestone decisions",
  },
  {
    description:
      "Approve or reject Draw Requests when the organization policy allows it.",
    key: "drawDecisions",
    label: "Draw Request decisions",
  },
] as const;

function permissionPresentation(input: {
  assigned: boolean;
  draft: boolean;
  organizationCap: boolean;
}) {
  const changed = input.assigned !== input.draft;
  if (input.draft && input.organizationCap) {
    return {
      effective: true,
      label: changed ? "Will be effective" : "Effective",
    };
  }
  if (input.draft) {
    return {
      effective: false,
      label: changed ? "Will be capped" : "Capped",
    };
  }
  return {
    effective: false,
    label: changed ? "Will not be assigned" : "Not assigned",
  };
}

export function LenderMemberPermissionEditor({
  assigned,
  canManage,
  memberName,
  onSave,
  organizationCap,
  pending,
  version,
}: {
  assigned: LenderMemberDecisionPermissions;
  canManage: boolean;
  memberName: string;
  onSave: (input: {
    expectedVersion: number;
    permissions: LenderMemberDecisionPermissions;
    reason: string;
  }) => Promise<void>;
  organizationCap: LenderMemberDecisionPermissions;
  pending: boolean;
  version: number;
}) {
  const reasonId = useId();
  const [draft, setDraft] = useState(assigned);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [stage, setStage] = useState<"edit" | "review">("edit");

  useEffect(() => {
    setDraft(assigned);
    setReason("");
    setReasonError(null);
    setStage("edit");
  }, [assigned]);

  const changed = permissionRows.some(
    (row) => draft[row.key] !== assigned[row.key]
  );
  return (
    <section
      aria-labelledby="member-decision-permissions"
      className="mt-4 border-t pt-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            className="font-heading font-semibold text-sm"
            id="member-decision-permissions"
          >
            Decision permissions
          </h4>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            Assigned grants are capped by the read-only organization policy.
            Effective grants control live decision eligibility.
          </p>
        </div>
        <Badge className="tabular-nums" variant="outline">
          Version {version}
        </Badge>
      </div>

      <div className="mt-3 divide-y">
        {permissionRows.map((row) => {
          const presentation = permissionPresentation({
            assigned: assigned[row.key],
            draft: draft[row.key],
            organizationCap: organizationCap[row.key],
          });
          return (
            <label
              className="flex min-h-14 items-start gap-3 py-3"
              htmlFor={`member-permission-${row.key}`}
              key={row.key}
            >
              <Checkbox
                checked={draft[row.key]}
                disabled={!canManage || pending || stage === "review"}
                id={`member-permission-${row.key}`}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    [row.key]: checked === true,
                  }))
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{row.label}</span>
                  <Badge
                    variant={presentation.effective ? "success" : "outline"}
                  >
                    {presentation.label}
                  </Badge>
                </span>
                <span className="mt-1 block text-muted-foreground text-xs leading-5">
                  {row.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {canManage ? (
        <>
          <Separator className="my-4" />
          {stage === "edit" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={reasonId}>Change reason</Label>
                <Textarea
                  aria-describedby={`${reasonId}-hint${reasonError ? ` ${reasonId}-error` : ""}`}
                  aria-invalid={reasonError ? true : undefined}
                  disabled={pending}
                  id={reasonId}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError(null);
                  }}
                  placeholder="Explain why this member needs these decision grants."
                  value={reason}
                />
                <p
                  className="text-muted-foreground text-xs"
                  id={`${reasonId}-hint`}
                >
                  At least 10 characters. The actor, prior grants, new grants,
                  version, time, and reason are audited.
                </p>
                {reasonError ? (
                  <p
                    className="text-destructive text-xs"
                    id={`${reasonId}-error`}
                    role="alert"
                  >
                    {reasonError}
                  </p>
                ) : null}
              </div>
              <Button
                disabled={!changed || pending}
                onClick={() => {
                  if (reason.trim().length < 10) {
                    setReasonError(
                      "Enter at least 10 characters explaining this change."
                    );
                    return;
                  }
                  setStage("review");
                }}
                size="sm"
              >
                Review permission changes
              </Button>
            </div>
          ) : (
            <div className="space-y-3" role="status">
              <Alert>
                <ShieldCheck />
                <AlertTitle>Review changes for {memberName}</AlertTitle>
                <AlertDescription>
                  {permissionRows
                    .filter((row) => draft[row.key] !== assigned[row.key])
                    .map(
                      (row) =>
                        `${row.label}: ${draft[row.key] ? "grant" : "revoke"}`
                    )
                    .join(" · ")}
                  . Reason: {reason.trim()}
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() => setStage("edit")}
                  size="sm"
                  variant="outline"
                >
                  Back to edit
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    onSave({
                      expectedVersion: version,
                      permissions: draft,
                      reason: reason.trim(),
                    })
                  }
                  size="sm"
                >
                  {pending ? "Saving…" : "Save permissions"}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-muted-foreground text-xs leading-5">
          Your lender role can inspect assigned and effective permissions but
          cannot change them.
        </p>
      )}
    </section>
  );
}

export function LenderMemberDeactivationControl({
  disabledReason,
  error,
  onDeactivate,
  pendingReconciliation,
}: {
  disabledReason?: string;
  error?: string;
  onDeactivate: () => void;
  pendingReconciliation: boolean;
}) {
  return (
    <section aria-labelledby="member-deactivation" className="space-y-3">
      <div>
        <h4
          className="font-heading font-semibold text-sm"
          id="member-deactivation"
        >
          Deactivate member
        </h4>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          Deactivation immediately removes future DrawFlow authority after
          WorkOS accepts the command. Identity, assignment, decision, and audit
          history remain preserved.
        </p>
      </div>
      {pendingReconciliation ? (
        <Alert>
          <ShieldCheck />
          <AlertTitle>Waiting for WorkOS reconciliation</AlertTitle>
          <AlertDescription>
            DrawFlow authority is suspended. The assignment will finalize
            automatically when the webhook projects the membership as inactive
            or deleted.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>WorkOS did not accept the command</AlertTitle>
          <AlertDescription>
            Access was restored. Review the failure and retry safely. {error}
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        disabled={Boolean(disabledReason) || pendingReconciliation}
        onClick={onDeactivate}
        size="sm"
        variant="destructive"
      >
        <UserMinus />
        {error ? "Retry deactivation" : "Review deactivation"}
      </Button>
      {disabledReason ? (
        <p className="text-muted-foreground text-xs leading-5">
          {disabledReason}
        </p>
      ) : null}
    </section>
  );
}
