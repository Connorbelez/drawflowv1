import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { History, Save } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  ReviewRequirementsPolicyFields,
  reviewRequirementsPoliciesEqual,
  validateReviewRequirementsPolicy,
} from "#/features/production-proposals/ReviewRequirementsPolicyFields.tsx";
import type { api } from "../../../convex/_generated/api";

type DefaultReviewPolicy = FunctionReturnType<
  typeof api.lenderOrganizationReviewPolicies.getLenderOrganizationDefaultReviewPolicy
>;
type SaveDefaultCommand = Omit<
  FunctionArgs<
    typeof api.lenderOrganizationReviewPolicies.saveLenderOrganizationDefaultReviewPolicy
  >,
  "lenderOrganizationId"
>;

export function LenderOrganizationDefaultReviewPolicy({
  defaultReviewPolicy,
  onSave,
}: {
  defaultReviewPolicy: DefaultReviewPolicy;
  onSave: (command: SaveDefaultCommand) => Promise<unknown> | unknown;
}) {
  const [policy, setPolicy] = useState(defaultReviewPolicy.policy);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const changed = !reviewRequirementsPoliciesEqual(
    policy,
    defaultReviewPolicy.policy
  );
  const validationMessages = validateReviewRequirementsPolicy(policy, {
    eligibleCounts: defaultReviewPolicy.eligibleCounts,
    lenderEligibilityIssue: defaultReviewPolicy.validationIssue ?? undefined,
    lenderScopeAvailable: true,
  });
  const auditReason = reason.trim();
  const canSave = Boolean(
    changed && auditReason && validationMessages.length === 0 && !pending
  );

  const save = async () => {
    if (!canSave) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSave({
        expectedVersion: defaultReviewPolicy.version,
        idempotencyKey: organizationDefaultIdempotencyKey({
          expectedVersion: defaultReviewPolicy.version,
          lenderOrganizationId: defaultReviewPolicy.lenderOrganizationId,
          policy,
          reason: auditReason,
        }),
        policy,
        reason: auditReason,
      });
      setAnnouncement("Organization review default saved.");
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? organizationDefaultErrorMessage(caught.message)
          : "The organization review default could not be saved."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="default-review-requirements-heading"
      className="grid gap-4"
    >
      <Frame>
        <FramePanel className="grid gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className="font-semibold text-base text-wrap-balance"
                id="default-review-requirements-heading"
              >
                Default review requirements
              </h3>
              <p className="mt-1 max-w-3xl text-pretty text-muted-foreground text-sm">
                Future Proposal assignments inherit this version. Existing
                assigned Proposals and active Builds keep their current policy.
              </p>
            </div>
            <Badge className="tabular-nums" variant="secondary">
              {defaultReviewPolicy.version === null
                ? "System baseline"
                : `Default v${defaultReviewPolicy.version}`}
            </Badge>
          </div>
          <Separator />
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <PolicyFact
              label="Effective provenance"
              value={
                defaultReviewPolicy.provenance === "organization_default"
                  ? `Organization default v${defaultReviewPolicy.version}`
                  : "Back Office system baseline"
              }
            />
            <PolicyFact
              label="Last changed by"
              value={
                defaultReviewPolicy.configuredByDisplayName ?? "Not customized"
              }
            />
            <PolicyFact
              label="Last changed"
              value={formatPolicyTimestamp(defaultReviewPolicy.configuredAt)}
            />
          </dl>
          {defaultReviewPolicy.reason ? (
            <p className="text-pretty text-muted-foreground text-xs">
              Change reason: {defaultReviewPolicy.reason}
            </p>
          ) : null}
        </FramePanel>
      </Frame>

      <ReviewRequirementsPolicyFields
        badgeLabel={
          defaultReviewPolicy.version === null
            ? "System baseline"
            : `Default v${defaultReviewPolicy.version}`
        }
        description="Set the Milestone, Draw, lender quorum, Site Visit, and receipt / invoice requirements copied at future assignment."
        disabled={pending}
        eligibleCounts={defaultReviewPolicy.eligibleCounts}
        lenderScopeAvailable
        onChange={setPolicy}
        policy={policy}
        title="Review requirements"
      />

      <Frame>
        <FramePanel className="grid gap-4 p-5">
          <div className="grid gap-2">
            <Label htmlFor="organization-review-default-reason">
              Change reason
            </Label>
            <Textarea
              aria-describedby="organization-review-default-reason-hint"
              disabled={pending}
              id="organization-review-default-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why future assignments need this default."
              value={reason}
            />
            <p
              className="text-pretty text-muted-foreground text-xs"
              id="organization-review-default-reason-hint"
            >
              The saved version, actor, time, and reason are retained in the
              Lender Organization audit history.
            </p>
          </div>

          {validationMessages.length > 0 ? (
            <Alert variant="warning">
              <AlertTitle>Default is not currently satisfiable</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 ps-4">
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert role="alert" variant="error">
              <AlertTitle>
                Default review requirements were not saved
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <History aria-hidden className="size-4" />
              Saving creates immutable version{" "}
              {defaultReviewPolicy.version === null
                ? 1
                : defaultReviewPolicy.version + 1}
              .
            </p>
            <Button disabled={!canSave} onClick={save}>
              <Save />
              {pending ? "Saving..." : "Save new default version"}
            </Button>
          </div>
        </FramePanel>
      </Frame>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function formatPolicyTimestamp(value: number | null) {
  if (value === null) {
    return "Not customized";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const CONVEX_ERROR_PREFIX = /^Uncaught Error:\s*/;

function organizationDefaultErrorMessage(message: string) {
  return message.replace(CONVEX_ERROR_PREFIX, "").trim();
}

export function organizationDefaultIdempotencyKey(input: {
  expectedVersion: number | null;
  lenderOrganizationId: string;
  policy: DefaultReviewPolicy["policy"];
  reason: string;
}) {
  const payload = JSON.stringify(input);
  let hash = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 33 + payload.charCodeAt(index)) % 2_147_483_647;
  }
  return `backoffice:lender-organization-review-default:${hash.toString(36)}`;
}
