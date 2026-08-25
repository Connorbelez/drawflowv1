import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuoteAccess } from "./QuoteFieldLedgerContracts";
import {
  isReadableDraft,
  isReadableLifecycle,
  ledgerIsReadOnly,
} from "./QuoteFieldLedgerUtils";

export function useQuoteFieldLedgerAccess({
  hasAuthenticatedUser,
  initialAccess,
  observedAt,
  sessionToken,
}: {
  hasAuthenticatedUser: boolean;
  initialAccess: QuoteAccess;
  observedAt: number;
  sessionToken?: string;
}) {
  const browserDraft = useQuery(
    api.quote_response_drafts.getQuoteInvitationResponseDraft,
    sessionToken
      ? {
          presentationNow: observedAt,
          quoteRoundInvitationId: initialAccess.invitationId,
          sessionToken,
        }
      : "skip"
  );
  const claimedDraft = useQuery(
    api.quote_response_drafts.getClaimedQuoteInvitationResponseDraft,
    hasAuthenticatedUser
      ? {
          presentationNow: observedAt,
          quoteRoundInvitationId: initialAccess.invitationId,
        }
      : "skip"
  );
  const readableClaimed = isReadableDraft(claimedDraft) ? claimedDraft : null;
  const readableBrowser = isReadableDraft(browserDraft) ? browserDraft : null;
  const activeRead = readableClaimed ??
    readableBrowser ?? {
      access: initialAccess,
      draft: null,
      status: ledgerIsReadOnly(initialAccess, observedAt)
        ? ("read_only" as const)
        : ("available" as const),
    };
  const serverUnavailable =
    !(readableClaimed || readableBrowser) &&
    (browserDraft?.status === "unavailable" ||
      claimedDraft?.status === "unavailable");
  const serverSuperseded =
    claimedDraft?.status === "superseded" ||
    browserDraft?.status === "superseded";
  return {
    activeRead,
    readOnly:
      activeRead.status === "read_only" ||
      ledgerIsReadOnly(activeRead.access, observedAt),
    serverSuperseded,
    serverUnavailable,
    usingClaimedAccess: Boolean(readableClaimed),
  };
}

export function useQuoteResponseLifecycle({
  hasAuthenticatedUser,
  quoteRoundInvitationId,
  sessionToken,
}: {
  hasAuthenticatedUser: boolean;
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  sessionToken?: string;
}) {
  const browserLifecycle = useQuery(
    api.quote_response_submissions.getQuoteInvitationResponseLifecycle,
    sessionToken ? { quoteRoundInvitationId, sessionToken } : "skip"
  );
  const claimedLifecycle = useQuery(
    api.quote_response_submissions.getClaimedQuoteInvitationResponseLifecycle,
    hasAuthenticatedUser ? { quoteRoundInvitationId } : "skip"
  );
  if (isReadableLifecycle(claimedLifecycle)) {
    return { result: claimedLifecycle, usingClaimedAccess: true };
  }
  if (isReadableLifecycle(browserLifecycle)) {
    return { result: browserLifecycle, usingClaimedAccess: false };
  }
  return null;
}
