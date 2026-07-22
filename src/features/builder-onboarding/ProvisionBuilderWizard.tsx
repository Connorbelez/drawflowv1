import { useAction } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  KeyRound,
  Mail,
  RotateCcw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";
import { cn } from "#/lib/utils.ts";

import { api } from "../../../convex/_generated/api";

const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";
const FAIRLEND_DEFAULT_BROKER_EMAIL = "elie@fairlend.ca";
const FAIRLEND_WORKOS_ORGANIZATION_ID = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;

type WizardStep = 0 | 1 | 2;

const STEPS: { key: string; label: string; hint: string }[] = [
  { hint: "Who is the builder", key: "identity", label: "Builder" },
  { hint: "What gets created", key: "review", label: "Review" },
  { hint: "Account provisioned", key: "done", label: "Invite" },
];

export interface ProvisionResult {
  builderProfileId: string;
  displayName: string;
  invite: { adapter: string; status: string; sync: string };
  operation: "created" | "reactivated";
  ownerEmail: string;
  ownerWorkosUserId: string;
}

export interface ProvisionBuilderWizardProps {
  attachmentName?: string;
  attachToProposal?: boolean;
  onProvisioned?: (result: ProvisionResult) => Promise<void> | void;
  onReturnToProposal?: () => Promise<void> | void;
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  return (
    at > 0 &&
    at === trimmed.lastIndexOf("@") &&
    at < trimmed.length - 1 &&
    trimmed.slice(at + 1).includes(".")
  );
}

export function ProvisionBuilderWizard({
  attachmentName,
  attachToProposal = false,
  onProvisioned,
  onReturnToProposal,
}: ProvisionBuilderWizardProps = {}): React.ReactElement {
  const provisionNewBuilder = useAction(
    api.brokerageProvisioning.provisionNewBuilder
  );
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const [step, setStep] = useState<WizardStep>(0);
  const [displayName, setDisplayName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const trimmedCompany = displayName.trim();
  const emailValid = isValidEmail(ownerEmail);
  const identityValid = trimmedCompany.length > 0 && emailValid;

  const loginHint = useMemo(() => {
    if (!result) {
      return "";
    }
    return `Builder: ${result.displayName}\nLogin email: ${result.ownerEmail}\nWorkOS organization: ${FAIRLEND_BROKERAGE_NAME} (${FAIRLEND_WORKOS_ORGANIZATION_ID})\nWorkspace: /builder`;
  }, [result]);

  function reset(): void {
    setStep(0);
    setDisplayName("");
    setOwnerName("");
    setOwnerEmail("");
    setError(null);
    setResult(null);
    setSubmitting(false);
  }

  async function handleProvision(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (!identityValid || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const provisioned = (await provisionNewBuilder({
        displayName: trimmedCompany,
        ownerEmail: ownerEmail.trim(),
        ownerName: ownerName.trim() || undefined,
      })) as ProvisionResult;
      await onProvisioned?.(provisioned);
      setResult(provisioned);
      setStep(2);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message.replace(CONVEX_ERROR_PREFIX, "")
          : "Could not provision the builder. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_12%_-4%,color-mix(in_oklch,var(--primary)_13%,transparent),transparent_30rem),var(--bg-base)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs/4 uppercase tracking-[0.14em]">
            <UserPlus className="size-3.5" />
            Builder onboarding
          </div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Bring a new builder onto DrawFlow
          </h1>
          <p className="max-w-[60ch] text-muted-foreground text-sm">
            Create the builder&rsquo;s WorkOS account and their brokerage
            workspace in one pass. They&rsquo;ll land in a guided first run that
            takes them to their first draw plan.
          </p>
        </header>

        <StepRail current={step} />

        <Frame>
          {step === 0 ? (
            <FramePanel className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <FrameTitle className="text-base">Builder identity</FrameTitle>
                <FrameDescription>
                  We only need the essentials now. The builder fills in the
                  build details themselves.
                </FrameDescription>
              </div>

              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (identityValid) {
                    setStep(1);
                  }
                }}
              >
                <Field>
                  <FieldLabel htmlFor="builder-company">
                    <Building2 className="size-4 opacity-70" />
                    Builder company name
                  </FieldLabel>
                  <Input
                    autoFocus
                    id="builder-company"
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Northgate Builders"
                    value={displayName}
                  />
                  <FieldDescription>
                    Shown across the builder&rsquo;s workspace and on every
                    Build Proposal.
                  </FieldDescription>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="owner-name">Owner name</FieldLabel>
                    <Input
                      id="owner-name"
                      onChange={(event) => setOwnerName(event.target.value)}
                      placeholder="Jamie Lead (optional)"
                      value={ownerName}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="owner-email">
                      <Mail className="size-4 opacity-70" />
                      Owner email
                    </FieldLabel>
                    <Input
                      aria-invalid={
                        ownerEmail.length > 0 && !emailValid ? true : undefined
                      }
                      id="owner-email"
                      onChange={(event) => setOwnerEmail(event.target.value)}
                      placeholder="lead@northgate.com"
                      type="email"
                      value={ownerEmail}
                    />
                    {ownerEmail.length > 0 && !emailValid ? (
                      <FieldDescription className="text-destructive-foreground">
                        Enter a valid email address.
                      </FieldDescription>
                    ) : (
                      <FieldDescription>
                        Their WorkOS invitation is sent here.
                      </FieldDescription>
                    )}
                  </Field>
                </div>

                <div className="flex justify-end pt-1">
                  <Button disabled={!identityValid} type="submit">
                    Review
                    <ArrowRight />
                  </Button>
                </div>
              </form>
            </FramePanel>
          ) : null}

          {step === 1 ? (
            <FramePanel className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <FrameTitle className="text-base">
                  Confirm what gets created
                </FrameTitle>
                <FrameDescription>
                  Provisioning is idempotent. Re-running for the same builder
                  reactivates their access instead of duplicating it.
                </FrameDescription>
              </div>

              <dl className="flex flex-col divide-y divide-border rounded-xl border bg-muted/40">
                <SummaryRow
                  icon={<Building2 className="size-4" />}
                  label="Builder company"
                  value={trimmedCompany}
                />
                <SummaryRow
                  icon={<Mail className="size-4" />}
                  label="Owner"
                  value={
                    ownerName.trim()
                      ? `${ownerName.trim()} \u00b7 ${ownerEmail.trim()}`
                      : ownerEmail.trim()
                  }
                />
                <SummaryRow
                  hint={FAIRLEND_WORKOS_ORGANIZATION_ID}
                  icon={<ShieldCheck className="size-4" />}
                  label="Brokerage organization"
                  value={`${FAIRLEND_BROKERAGE_NAME}`}
                />
              </dl>

              <ul className="flex flex-col gap-2 text-sm">
                <CreatedItem>
                  WorkOS account invitation with the{" "}
                  <span className="font-medium text-foreground">builder</span>{" "}
                  role
                </CreatedItem>
                <CreatedItem>
                  Builder profile under {FAIRLEND_BROKERAGE_NAME}
                </CreatedItem>
                <CreatedItem>
                  Owner account link so first login resolves their workspace
                </CreatedItem>
                <CreatedItem>
                  Default broker assignment to {FAIRLEND_DEFAULT_BROKER_EMAIL}
                </CreatedItem>
                {attachToProposal ? (
                  <CreatedItem>
                    Automatic attachment to{" "}
                    {attachmentName?.trim() || "the originating Build Proposal"}
                  </CreatedItem>
                ) : null}
              </ul>

              {error ? (
                <p
                  className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-destructive-foreground text-sm"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between pt-1">
                <Button
                  disabled={submitting}
                  onClick={() => setStep(0)}
                  variant="outline"
                >
                  <ArrowLeft />
                  Back
                </Button>
                <Button loading={submitting} onClick={() => handleProvision()}>
                  <KeyRound />
                  Create account &amp; provision
                </Button>
              </div>
            </FramePanel>
          ) : null}

          {step === 2 && result ? (
            <FramePanel className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/16 text-primary-foreground">
                  <Check className="size-5 text-[color:var(--primary-foreground)]" />
                </span>
                <div className="flex flex-col gap-1">
                  <FrameTitle className="text-base">
                    {result.displayName} is{" "}
                    {result.operation === "created"
                      ? "provisioned"
                      : "reactivated"}
                  </FrameTitle>
                  <FrameDescription>
                    The WorkOS invitation is on its way to{" "}
                    <span className="font-medium text-foreground">
                      {result.ownerEmail}
                    </span>
                    . When they accept and sign in, their builder workspace and
                    first-run flow are ready.
                    {attachToProposal
                      ? ` This builder is now attached to ${attachmentName?.trim() || "the Build Proposal"}.`
                      : ""}
                  </FrameDescription>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">Handoff details</span>
                  <Badge variant="success">
                    <ShieldCheck />
                    {result.invite.sync === "waiting-for-webhook"
                      ? "Invite sent"
                      : result.invite.status}
                  </Badge>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-background px-3 py-2 font-sans text-muted-foreground text-xs leading-relaxed">
                  {loginHint}
                </pre>
                <div>
                  <Button
                    onClick={() => copyToClipboard(loginHint)}
                    size="sm"
                    variant="outline"
                  >
                    {isCopied ? <Check /> : <Copy />}
                    {isCopied ? "Copied" : "Copy handoff details"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button onClick={reset} variant="outline">
                  <RotateCcw />
                  Provision another
                </Button>
                {onReturnToProposal ? (
                  <Button onClick={onReturnToProposal}>
                    <ArrowLeft />
                    Return to Build Proposal
                  </Button>
                ) : null}
              </div>
            </FramePanel>
          ) : null}
        </Frame>
      </div>
    </main>
  );
}

function StepRail({ current }: { current: WizardStep }): React.ReactElement {
  return (
    <ol aria-label="Onboarding progress" className="flex items-center gap-2">
      {STEPS.map((s, index) => {
        const state =
          index < current ? "done" : index === current ? "active" : "upcoming";
        return (
          <li className="flex flex-1 items-center gap-2" key={s.key}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-current={state === "active" ? "step" : undefined}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border font-medium text-xs tabular-nums transition-colors",
                  state === "done" &&
                    "border-success/40 bg-success/16 text-success-foreground",
                  state === "active" &&
                    "border-primary bg-primary text-[color:var(--primary-foreground)]",
                  state === "upcoming" &&
                    "border-border bg-muted text-muted-foreground"
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span
                  className={cn(
                    "truncate font-medium text-sm",
                    state === "upcoming" && "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {s.hint}
                </span>
              </div>
            </div>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1 transition-colors",
                  index < current ? "bg-success/40" : "bg-border"
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({
  hint,
  icon,
  label,
  value,
}: {
  hint?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className="opacity-70">{icon}</span>
        {label}
      </dt>
      <dd className="flex min-w-0 flex-col items-end text-right">
        <span className="truncate font-medium text-sm">
          {value || "\u2014"}
        </span>
        {hint ? (
          <span className="truncate text-muted-foreground text-xs">{hint}</span>
        ) : null}
      </dd>
    </div>
  );
}

function CreatedItem({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
      <span>{children}</span>
    </li>
  );
}
