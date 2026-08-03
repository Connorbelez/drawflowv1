import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { api } from "../../convex/_generated/api";

type QuoteInvitationAccessResult = FunctionReturnType<
  typeof api.quote_invitation_access.exchangeQuoteInvitationAccess
>;

const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function quoteInvitationIsReadOnly(
  access: Extract<
    QuoteInvitationAccessResult,
    { status: "available" }
  >["access"],
  deadlineReached: boolean
) {
  return access.roundState !== "open" || deadlineReached;
}

function useDeadlineReached(deadline: number | undefined) {
  const [observedAt, setObservedAt] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === undefined || observedAt >= deadline) {
      return;
    }
    const timer = window.setTimeout(
      () => setObservedAt(Date.now()),
      Math.min(deadline - observedAt, MAX_TIMEOUT_MS)
    );
    return () => window.clearTimeout(timer);
  }, [deadline, observedAt]);

  return deadline !== undefined && observedAt >= deadline;
}

export const Route = createFileRoute("/quote-invitation/$magicToken")({
  ssr: false,
  component: QuoteInvitationRoute,
});

/**
 * The recipient-facing route intentionally exchanges a reusable bearer
 * credential only for a verifier-backed browser lease. It renders the frozen
 * package returned by Convex and never reads a live Build, recipient roster,
 * or internal quote-management query.
 */
function QuoteInvitationRoute() {
  const { magicToken } = Route.useParams();
  const context = Route.useRouteContext();
  const exchangeQuoteInvitationAccess = useMutation(
    api.quote_invitation_access.exchangeQuoteInvitationAccess
  );
  const claimQuoteInvitationProfile = useMutation(
    api.quote_invitation_access.claimQuoteInvitationProfile
  );
  const [accessResult, setAccessResult] = useState<
    QuoteInvitationAccessResult | undefined
  >();
  const deadlineReached = useDeadlineReached(
    accessResult?.status === "available"
      ? accessResult.access.package.responseDeadline
      : undefined
  );
  const [claiming, setClaiming] = useState(false);
  const sessionStorageKey = useMemo(
    () => `drawflow.quote-invitation.session.${magicToken}`,
    [magicToken]
  );

  useEffect(() => {
    let mounted = true;
    async function exchange() {
      try {
        const result = await exchangeQuoteInvitationAccess({
          magicToken,
          sessionToken:
            window.sessionStorage.getItem(sessionStorageKey) ?? undefined,
        });
        if (!mounted) {
          return;
        }
        if (result.status === "available") {
          window.sessionStorage.setItem(sessionStorageKey, result.sessionToken);
        } else {
          window.sessionStorage.removeItem(sessionStorageKey);
        }
        setAccessResult(result);
      } catch {
        if (mounted) {
          // Public access failures deliberately collapse to the same generic
          // unavailable screen as an unknown or revoked credential.
          setAccessResult({ status: "unavailable" });
        }
      }
    }
    exchange().catch(() => {
      if (mounted) {
        setAccessResult({ status: "unavailable" });
      }
    });
    return () => {
      mounted = false;
    };
  }, [exchangeQuoteInvitationAccess, magicToken, sessionStorageKey]);

  const claim = async () => {
    if (!(accessResult?.status === "available" && context.userId)) {
      return;
    }
    setClaiming(true);
    try {
      const result = await claimQuoteInvitationProfile({
        sessionToken: accessResult.sessionToken,
      });
      toast.success(
        result.status === "claimed"
          ? "Quote invitation claimed for this WorkOS account."
          : "This WorkOS account already owns this quote invitation."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message.replace(CONVEX_ERROR_PREFIX, "")
          : "We could not claim this quote invitation."
      );
    } finally {
      setClaiming(false);
    }
  };

  if (accessResult === undefined) {
    return (
      <QuoteInvitationShell>
        <FramePanel className="grid min-h-60 place-items-center">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Opening private Quote Package…
          </div>
        </FramePanel>
      </QuoteInvitationShell>
    );
  }

  if (accessResult.status === "unavailable") {
    return (
      <QuoteInvitationShell>
        <FrameHeader>
          <Badge variant="outline">Private invitation</Badge>
          <FrameTitle className="mt-3 text-xl">
            Quote invitation unavailable
          </FrameTitle>
          <FrameDescription className="mt-2">
            This secure invitation is invalid or no longer available.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="pt-0">
          <p className="text-muted-foreground text-sm">
            Ask the issuing team for a fresh invitation if you still need to
            respond.
          </p>
        </FramePanel>
      </QuoteInvitationShell>
    );
  }

  if (accessResult.status === "expired") {
    return (
      <QuoteInvitationShell>
        <FrameHeader>
          <Badge variant="outline">Private invitation</Badge>
          <FrameTitle className="mt-3 text-xl">
            Access window expired
          </FrameTitle>
          <FrameDescription className="mt-2">
            {accessResult.issuerName} issued this invitation. Its access window
            ended {formatDateTime(accessResult.expiresAt)}.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="pt-0">
          <p className="text-muted-foreground text-sm">
            The package itself is intentionally not shown after this access
            window. Contact the issuing team to request operator-approved fresh
            access.
          </p>
        </FramePanel>
      </QuoteInvitationShell>
    );
  }

  const { access } = accessResult;
  const readOnly = quoteInvitationIsReadOnly(access, deadlineReached);
  return (
    <QuoteInvitationShell>
      <FrameHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant={readOnly ? "outline" : "success"}>
              {readOnly ? "Read-only package" : "Private quote package"}
            </Badge>
            <FrameTitle className="mt-3 text-2xl">
              {access.recipientName}
            </FrameTitle>
            <FrameDescription className="mt-1">
              Issued by {access.issuerName} · Package revision{" "}
              {access.package.revision}
            </FrameDescription>
          </div>
          <div className="grid size-12 place-items-center rounded-md border bg-muted">
            <LockKeyhole className="size-5 text-muted-foreground" />
          </div>
        </div>
        {readOnly ? (
          <Alert variant="warning">
            <CalendarClock />
            <AlertTitle>Response window has closed</AlertTitle>
            <AlertDescription>
              You can inspect this frozen package until{" "}
              {formatDateTime(access.accessExpiresAt)}, but it no longer accepts
              a Quote Response.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="info">
            <ShieldCheck />
            <AlertTitle>
              Review the immutable package before responding
            </AlertTitle>
            <AlertDescription>
              The response deadline is{" "}
              {formatDateTime(access.package.responseDeadline)}. Opening this
              invitation does not create a draft or submit a quote.
            </AlertDescription>
          </Alert>
        )}
      </FrameHeader>
      <FramePanel className="space-y-4 pt-0">
        <div className="grid gap-3 sm:grid-cols-3">
          <PackageMetric
            label="Response deadline"
            value={formatDateTime(access.package.responseDeadline)}
          />
          <PackageMetric
            label="Magic-link access"
            value={formatDateTime(access.accessExpiresAt)}
          />
          <PackageMetric
            label="Timeline starts"
            value={formatDate(access.package.timelineStartDate)}
          />
        </div>

        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <MapPinned className="size-4 text-primary" />
              <CardTitle>Exact project location</CardTitle>
            </div>
            <CardDescription>{access.package.siteAddress}</CardDescription>
          </CardHeader>
          <CardPanel className="p-4 pt-1">
            <Button
              render={
                <a
                  aria-label="Open project map"
                  href={access.package.siteMapUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="sr-only">Open project map</span>
                </a>
              }
              size="sm"
              variant="outline"
            >
              Open map
              <ExternalLink />
            </Button>
          </CardPanel>
        </Card>

        {access.package.labourLines.length ? (
          <PackageLinesCard
            lines={access.package.labourLines.map((line) => ({
              detail: line.scopeOfWorkTiptapJson,
              meta: [
                line.startDay === undefined
                  ? undefined
                  : `Start day ${line.startDay}`,
                line.durationDays === undefined
                  ? undefined
                  : `${line.durationDays} day${line.durationDays === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · "),
              title: `${line.milestoneName} · ${line.submilestoneName}`,
            }))}
            title="Labour scope"
          />
        ) : null}

        {access.package.materialLines.length ? (
          <PackageLinesCard
            lines={access.package.materialLines.map((line) => ({
              detail: line.specificationTiptapJson,
              meta: `${line.quantity} ${line.unit} · delivery days ${line.deliveryStartDay}–${line.deliveryEndDay}`,
              title: line.title,
            }))}
            title="Material scope"
          />
        ) : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <CardTitle>Package documents and response contract</CardTitle>
            </div>
            <CardDescription>
              {access.package.attachments.length} frozen document
              {access.package.attachments.length === 1 ? "" : "s"} ·{" "}
              {access.package.responseFields.length} response field
              {access.package.responseFields.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-3 p-4 pt-1">
            {access.package.attachments.length ? (
              <ul className="grid gap-2 text-sm">
                {access.package.attachments.map((attachment) => (
                  <li
                    className="flex items-center justify-between gap-3"
                    key={`${attachment.kind}:${attachment.fileName}`}
                  >
                    <span className="min-w-0 truncate">
                      {attachment.fileName}
                    </span>
                    <Badge variant="outline">{attachment.kind}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No package documents.
              </p>
            )}
            <ul className="grid gap-2 text-sm">
              {access.package.responseFields.map((field) => (
                <li
                  className="flex items-center justify-between gap-3"
                  key={field.fieldKey}
                >
                  <span>{field.label}</span>
                  <Badge variant={field.required ? "success" : "outline"}>
                    {field.required ? "Required" : "Optional"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardPanel>
        </Card>

        <Frame>
          <FrameHeader>
            <FrameTitle className="text-base">
              Optional account claim
            </FrameTitle>
            <FrameDescription>
              Claiming adds authenticated access only to this recipient
              profile’s Quote Invitations. It does not enroll you as a partner,
              assign you to this Build, or change this response.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <QuoteInvitationClaimActions
              claiming={claiming}
              hasAuthenticatedUser={Boolean(context.userId)}
              magicToken={magicToken}
              onClaim={claim}
            />
            <span className="text-muted-foreground text-xs">
              Magic-link access stays active until its stated expiry.
            </span>
          </FramePanel>
        </Frame>
      </FramePanel>
    </QuoteInvitationShell>
  );
}

export function quoteInvitationAuthHrefs(magicToken: string) {
  const returnPathname = `/quote-invitation/${encodeURIComponent(magicToken)}`;
  const encodedReturnPathname = encodeURIComponent(returnPathname);
  return {
    signInHref: `/api/auth/sign-in?returnPathname=${encodedReturnPathname}`,
    signUpHref: `/api/auth/sign-up?returnPathname=${encodedReturnPathname}`,
  };
}

export function QuoteInvitationClaimActions({
  claiming,
  hasAuthenticatedUser,
  magicToken,
  onClaim,
}: {
  claiming: boolean;
  hasAuthenticatedUser: boolean;
  magicToken: string;
  onClaim: () => void;
}) {
  if (hasAuthenticatedUser) {
    return (
      <Button loading={claiming} onClick={onClaim} variant="outline">
        <CheckCircle2 />
        Claim this invitation
      </Button>
    );
  }
  const { signInHref, signUpHref } = quoteInvitationAuthHrefs(magicToken);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        render={
          <a aria-label="Create account to claim" href={signUpHref}>
            <span className="sr-only">Create account to claim</span>
          </a>
        }
      >
        Create account to claim
        <ArrowRight />
      </Button>
      <Button
        render={
          <a aria-label="Sign in to claim" href={signInHref}>
            <span className="sr-only">Sign in to claim</span>
          </a>
        }
        variant="outline"
      >
        Sign in to claim
      </Button>
    </div>
  );
}

function QuoteInvitationShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4">
      <Frame className="w-full max-w-4xl">{children}</Frame>
    </main>
  );
}

function PackageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <strong className="font-semibold text-sm">{value}</strong>
    </div>
  );
}

function PackageLinesCard({
  lines,
  title,
}: {
  lines: Array<{ detail: string; meta: string; title: string }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-4 p-4 pt-1">
        {lines.map((line) => (
          <section className="space-y-1.5" key={`${title}:${line.title}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-sm">{line.title}</p>
              {line.meta ? <Badge variant="outline">{line.meta}</Badge> : null}
            </div>
            <FieldRichTextPreview
              ariaLabel={`${title}: ${line.title}`}
              value={line.detail}
            />
          </section>
        ))}
      </CardPanel>
    </Card>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        parsed
      );
}
