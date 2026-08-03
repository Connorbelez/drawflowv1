import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { QuoteFieldLedger } from "#/features/quote-solicitation/QuoteFieldLedger.tsx";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type QuoteInvitationAccessResult = FunctionReturnType<
  typeof api.quote_invitation_access.exchangeQuoteInvitationAccess
>;
type ClaimedDraftResult = FunctionReturnType<
  typeof api.quote_response_drafts.getClaimedQuoteInvitationResponseDraft
>;

const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;

export function quoteInvitationIsReadOnly(
  access: Extract<
    QuoteInvitationAccessResult,
    { status: "available" }
  >["access"],
  deadlineReached: boolean
) {
  return access.roundState !== "open" || deadlineReached;
}

export const Route = createFileRoute("/quote-invitation/$magicToken")({
  ssr: false,
  component: QuoteInvitationRoute,
});

/**
 * The public route exchanges a reusable bearer link only for a bounded browser
 * lease. Once a recipient claims the invitation, the same route can recover
 * its server-authoritative draft without retaining or exposing the raw link.
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
  const [claiming, setClaiming] = useState(false);
  const sessionStorageKey = useMemo(
    () => `drawflow.quote-invitation.session.${magicToken}`,
    [magicToken]
  );
  const invitationStorageKey = useMemo(
    () => `drawflow.quote-invitation.id.${magicToken}`,
    [magicToken]
  );
  const [storedInvitationId, setStoredInvitationId] = useState<
    Id<"quoteRoundInvitations"> | undefined
  >(() => readStoredInvitationId(invitationStorageKey));
  const [recoveryPresentationNow] = useState(() => Date.now());
  const claimedRecovery = useQuery(
    api.quote_response_drafts.getClaimedQuoteInvitationResponseDraft,
    context.userId && storedInvitationId
      ? {
          presentationNow: recoveryPresentationNow,
          quoteRoundInvitationId: storedInvitationId,
        }
      : "skip"
  );

  useEffect(() => {
    setStoredInvitationId(readStoredInvitationId(invitationStorageKey));
  }, [invitationStorageKey]);

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
          window.sessionStorage.setItem(
            invitationStorageKey,
            result.access.invitationId
          );
          setStoredInvitationId(result.access.invitationId);
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
  }, [
    exchangeQuoteInvitationAccess,
    invitationStorageKey,
    magicToken,
    sessionStorageKey,
  ]);

  const reopenInvitation = () => {
    window.location.reload();
  };

  const claim = async () => {
    if (!(accessResult?.status === "available" && context.userId)) {
      return;
    }
    setClaiming(true);
    try {
      const result = await claimQuoteInvitationProfile({
        sessionToken: accessResult.sessionToken,
      });
      window.sessionStorage.setItem(invitationStorageKey, result.invitationId);
      setStoredInvitationId(result.invitationId);
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

  const accountClaimActions = (
    <QuoteInvitationClaimActions
      claiming={claiming}
      hasAuthenticatedUser={Boolean(context.userId)}
      magicToken={magicToken}
      onClaim={claim}
    />
  );
  const resumableClaimedDraft = isReadableClaimedDraft(claimedRecovery)
    ? claimedRecovery
    : null;

  if (accessResult === undefined) {
    return <QuoteInvitationLoading title="Opening private Quote Package…" />;
  }

  if (
    accessResult.status !== "available" &&
    context.userId &&
    storedInvitationId &&
    claimedRecovery === undefined
  ) {
    return (
      <QuoteInvitationLoading title="Checking your claimed Field Ledger…" />
    );
  }

  if (accessResult.status !== "available" && resumableClaimedDraft) {
    return (
      <QuoteFieldLedger
        access={resumableClaimedDraft.access}
        accountClaimActions={accountClaimActions}
        hasAuthenticatedUser
        onReopenInvitation={reopenInvitation}
      />
    );
  }

  if (
    accessResult.status !== "available" &&
    claimedRecovery?.status === "superseded"
  ) {
    return (
      <QuoteInvitationState
        description="This package revision was replaced. Use the newest invitation supplied by the issuing team; no previous draft content is shown here."
        title="Package replaced"
      />
    );
  }

  if (accessResult.status === "unavailable") {
    return (
      <QuoteInvitationState
        description="This secure invitation is invalid or no longer available. Ask the issuing team for a fresh invitation if you still need to respond."
        title="Quote invitation unavailable"
      />
    );
  }

  if (accessResult.status === "expired") {
    return (
      <QuoteInvitationState
        description={`The magic-link access window ended ${formatDateTime(accessResult.expiresAt)}. The package itself is intentionally not shown without active browser or claimed-account access.`}
        title="Access window expired"
      />
    );
  }

  return (
    <QuoteFieldLedger
      access={accessResult.access}
      accountClaimActions={accountClaimActions}
      hasAuthenticatedUser={Boolean(context.userId)}
      onReopenInvitation={reopenInvitation}
      sessionToken={accessResult.sessionToken}
    />
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

function QuoteInvitationLoading({ title }: { title: string }) {
  return (
    <QuoteInvitationShell>
      <FramePanel className="grid min-h-60 place-items-center">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {title}
        </div>
      </FramePanel>
    </QuoteInvitationShell>
  );
}

function QuoteInvitationState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <QuoteInvitationShell>
      <FrameHeader>
        <Badge variant="outline">Private invitation</Badge>
        <FrameTitle className="mt-3 text-xl">{title}</FrameTitle>
        <FrameDescription className="mt-2">{description}</FrameDescription>
      </FrameHeader>
    </QuoteInvitationShell>
  );
}

function QuoteInvitationShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4">
      <Frame className="w-full max-w-4xl">{children}</Frame>
    </main>
  );
}

function isReadableClaimedDraft(
  result: ClaimedDraftResult | undefined
): result is Extract<
  ClaimedDraftResult,
  { status: "available" | "read_only" }
> {
  return result?.status === "available" || result?.status === "read_only";
}

function readStoredInvitationId(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }
  const stored = window.sessionStorage.getItem(storageKey);
  return stored ? (stored as Id<"quoteRoundInvitations">) : undefined;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
