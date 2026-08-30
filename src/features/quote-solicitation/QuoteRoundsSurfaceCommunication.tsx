import { useMutation } from "convex/react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuoteRoundRegisterRow } from "./QuoteRoundsSurfaceContracts.ts";
import {
  communicationSummary,
  DETAIL_UNAVAILABLE_TITLE,
  deliveryLabel,
  formatLastActivity,
} from "./QuoteRoundsSurfaceContracts.ts";

export function RecipientDisclosure({
  buildId,
  id,
  onOpen,
  organizationId,
  readOnly,
  row,
}: {
  buildId: string;
  id: string;
  onOpen?: (roundId: string) => void;
  organizationId: string;
  readOnly: boolean;
  row: QuoteRoundRegisterRow;
}) {
  const recipientDelivery = row.recipientDelivery ?? [];
  return (
    <section
      aria-label={`${row.title} recipient activity`}
      className="grid grid-cols-[15rem_1fr_1fr_1fr_8rem] gap-4 border-t bg-muted/18 px-10 py-3 text-xs"
      id={id}
    >
      <div>
        <p className="font-medium">Recipient activity</p>
        <p className="mt-1 text-muted-foreground">
          {row.recipients.active} active · {row.recipients.revoked} revoked
        </p>
        <p className="mt-1 text-muted-foreground">
          {communicationSummary(row)}
        </p>
        {recipientDelivery.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-muted-foreground">
            {recipientDelivery.slice(0, 6).map((recipient, index) => (
              <li key={recipient.invitationId}>
                Recipient {index + 1}: {recipient.latestStatus ?? "not sent"}
                {recipient.actionRequired ? " · action required" : ""}
                {recipient.reminderEligible ? " · reminder eligible" : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <p className="font-medium">Delivery</p>
        <p className="mt-1 text-muted-foreground">{deliveryLabel(row)}</p>
      </div>
      <div>
        <p className="font-medium">Access</p>
        <p className="mt-1 text-muted-foreground">
          {row.access.active} active credential · {row.access.expired} expired
        </p>
      </div>
      <div>
        <p className="font-medium">Last activity</p>
        <p className="mt-1 text-muted-foreground">
          {formatLastActivity(row.lastActivityAt)}
        </p>
      </div>
      <Button
        aria-label={
          onOpen ? undefined : "Open detail (quote detail unavailable)"
        }
        disabled={!onOpen}
        onClick={() => onOpen?.(row._id)}
        size="sm"
        title={onOpen ? undefined : DETAIL_UNAVAILABLE_TITLE}
        variant="ghost"
      >
        Open detail <ChevronRight />
      </Button>
      <RecipientCommunicationHistory
        buildId={buildId}
        organizationId={organizationId}
        readOnly={readOnly}
        row={row}
      />
    </section>
  );
}

export function RecipientCommunicationHistory({
  buildId,
  organizationId,
  readOnly,
  row,
}: {
  buildId: string;
  organizationId: string;
  readOnly: boolean;
  row: QuoteRoundRegisterRow;
}) {
  const recipientDelivery = row.recipientDelivery ?? [];
  const retryDelivery = useMutation(
    api.quote_notifications.retryCommunicationDelivery
  );
  const [retryError, setRetryError] = useState<string>();
  const [retryingIntentId, setRetryingIntentId] = useState<string>();
  const [retryReasons, setRetryReasons] = useState<Record<string, string>>({});
  const retryIdempotencyKeys = useRef(new Map<string, string>());

  const retry = async (communicationIntentId: Id<"communicationIntents">) => {
    const key = String(communicationIntentId);
    const reason = retryReasons[key]?.trim();
    if (!(reason && !retryingIntentId)) {
      return;
    }
    let idempotencyKey = retryIdempotencyKeys.current.get(key);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      retryIdempotencyKeys.current.set(key, idempotencyKey);
    }
    setRetryError(undefined);
    setRetryingIntentId(key);
    try {
      await retryDelivery({
        buildId: buildId as Id<"activeBuilds">,
        communicationIntentId,
        idempotencyKey,
        reason,
        workosOrganizationId: organizationId,
      });
      retryIdempotencyKeys.current.delete(key);
      setRetryReasons((current) => ({ ...current, [key]: "" }));
    } catch (cause) {
      setRetryError(
        cause instanceof Error
          ? cause.message
          : "Communication delivery retry failed."
      );
    } finally {
      setRetryingIntentId(undefined);
    }
  };
  return (
    <details
      className="col-span-full border-t pt-3"
      data-testid="quote-recipient-communication-history"
    >
      <summary className="cursor-pointer font-medium text-xs">
        Communication history · {communicationSummary(row)}
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {recipientDelivery.length === 0 ? (
          <p className="text-muted-foreground">
            No communication intents recorded.
          </p>
        ) : (
          recipientDelivery.map((recipient, index) => (
            <RecipientCommunicationCard
              index={index}
              key={recipient.invitationId}
              onReasonChange={(intentId, value) =>
                setRetryReasons((current) => ({
                  ...current,
                  [String(intentId)]: value,
                }))
              }
              onRetry={retry}
              readOnly={readOnly}
              reason={
                recipient.recoveryIntentId
                  ? (retryReasons[String(recipient.recoveryIntentId)] ?? "")
                  : ""
              }
              recipient={recipient}
              retryingIntentId={retryingIntentId}
            />
          ))
        )}
      </div>
      {retryError ? (
        <p className="mt-3 text-destructive text-xs" role="alert">
          {retryError}
        </p>
      ) : null}
    </details>
  );
}

function RecipientCommunicationCard({
  index,
  onReasonChange,
  onRetry,
  readOnly,
  reason,
  recipient,
  retryingIntentId,
}: {
  index: number;
  onReasonChange: (intentId: Id<"communicationIntents">, value: string) => void;
  onRetry: (intentId: Id<"communicationIntents">) => Promise<void>;
  readOnly: boolean;
  reason: string;
  recipient: QuoteRoundRegisterRow["recipientDelivery"][number];
  retryingIntentId?: string;
}) {
  const intentId = recipient.recoveryIntentId;
  return (
    <Card className="gap-0 rounded-lg p-3 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Recipient {index + 1}</p>
          <p className="mt-1 text-muted-foreground">
            Latest: {recipient.latestStatus ?? "not sent"}
            {recipient.latestOutcomeAt
              ? ` · ${formatLastActivity(recipient.latestOutcomeAt)}`
              : ""}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">
          {recipient.attemptCount} attempt
          {recipient.attemptCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-2 text-muted-foreground">
        Recovery: {recipient.recoveryState}
        {recipient.actionRequired ? " · action required" : ""}
        {recipient.reminderEligible ? " · reminder eligible" : ""}
        {recipient.cooldownUntil
          ? ` · cooldown until ${formatLastActivity(recipient.cooldownUntil)}`
          : ""}
      </p>
      <ol className="mt-2 grid gap-1 border-t pt-2 text-muted-foreground">
        {recipient.history.map((entry) => (
          <li
            className="grid gap-0.5 text-[0.6875rem]"
            key={`${entry.createdAt}:${entry.lastOutcomeAt ?? "none"}:${entry.kind}:${entry.status}:${entry.detail ?? "none"}`}
          >
            <span>
              {formatLastActivity(entry.createdAt)} · {entry.kind} ·{" "}
              {entry.status}
            </span>
            {entry.detail ? <span>{entry.detail}</span> : null}
          </li>
        ))}
      </ol>
      {!readOnly && intentId ? (
        <div className="mt-3 grid gap-2 border-t pt-3">
          <Input
            aria-label={`Retry reason for recipient ${index + 1}`}
            onChange={(event) => onReasonChange(intentId, event.target.value)}
            placeholder="Reason for retrying this failed delivery"
            value={reason}
          />
          <Button
            disabled={!reason.trim() || Boolean(retryingIntentId)}
            onClick={() => onRetry(intentId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw />
            {retryingIntentId === String(intentId)
              ? "Retrying delivery…"
              : "Retry delivery"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
