"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../convex/_generated/api";

type InboxFilter = "actionRequired" | "all";
interface PendingDeliveryAction {
  action: "dismiss" | "resolve";
  deliveryId: string;
}
type RecipientDelivery = NonNullable<
  ReturnType<typeof useRecipientInbox>
>["deliveries"][number];

export function NotificationInbox({
  authReady = true,
  workosOrganizationId,
}: {
  /**
   * Convex queries must remain skipped until AuthKit has supplied the
   * authenticated viewer. AppShell can render before the client auth
   * handshake completes, and issuing the recipient query in that window
   * produces an avoidable Unauthorized error.
   */
  authReady?: boolean;
  workosOrganizationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<PendingDeliveryAction | null>(null);
  const inbox = useRecipientInbox(workosOrganizationId, open, authReady);
  const markRead = useMutation(
    api.production_proposals.markRecipientDeliveryRead
  );
  const dismiss = useMutation(
    api.production_proposals.dismissRecipientDelivery
  );
  const resolve = useMutation(
    api.production_proposals.resolveRecipientDelivery
  );
  const unreadCount = inbox?.unreadCount ?? 0;
  const deliveries =
    inbox?.deliveries.filter(
      (delivery) => filter === "all" || delivery.actionRequired
    ) ?? [];

  const runDeliveryMutation = async (
    nextPendingAction: PendingDeliveryAction | null,
    operation: () => Promise<unknown>
  ) => {
    setErrorMessage(null);
    if (nextPendingAction) {
      setPendingAction(nextPendingAction);
    }
    try {
      await operation();
    } catch {
      setErrorMessage("Unable to update this notification. Try again.");
    } finally {
      if (nextPendingAction) {
        setPendingAction(null);
      }
    }
  };

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative size-11 md:size-8"
        disabled={!(workosOrganizationId && authReady)}
        render={<Button size="icon-sm" variant="outline" />}
      >
        <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 font-semibold text-destructive-foreground text-xs tabular-nums"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent
        aria-describedby="recipient-inbox-description"
        className="sm:max-w-lg"
        data-testid="recipient-notification-inbox"
        side="right"
      >
        <SheetHeader className="px-4 sm:px-6">
          <div className="flex flex-col items-start gap-3 pr-8 sm:flex-row sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription id="recipient-inbox-description">
                Updates and actions for your current organization.
              </SheetDescription>
            </div>
            {inbox.loaded ? (
              <Badge
                className="shrink-0 tabular-nums"
                variant={inbox.actionRequiredCount > 0 ? "warning" : "outline"}
              >
                {formatActionRequiredCount(
                  inbox.actionRequiredCount,
                  inbox.countsComplete
                )}
              </Badge>
            ) : null}
          </div>
        </SheetHeader>
        <SheetPanel className="grid content-start gap-4 px-4 sm:px-6">
          <fieldset className="flex gap-2">
            <legend className="sr-only">Notification filters</legend>
            <Button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              size="sm"
              variant={filter === "all" ? "secondary" : "outline"}
            >
              All
            </Button>
            <Button
              aria-pressed={filter === "actionRequired"}
              onClick={() => setFilter("actionRequired")}
              size="sm"
              variant={filter === "actionRequired" ? "secondary" : "outline"}
            >
              Action required
            </Button>
          </fieldset>

          {errorMessage ? (
            <Alert aria-live="polite" variant="error">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <InboxDeliveries
            deliveries={deliveries}
            filter={filter}
            inboxLoaded={inbox.loaded}
            onDismiss={(delivery) =>
              workosOrganizationId
                ? runDeliveryMutation(
                    { action: "dismiss", deliveryId: delivery._id },
                    () =>
                      dismiss({
                        deliveryId: delivery._id,
                        workosOrganizationId,
                      })
                  )
                : undefined
            }
            onOpen={(delivery) =>
              workosOrganizationId && delivery.status === "unread"
                ? runDeliveryMutation(null, () =>
                    markRead({
                      deliveryId: delivery._id,
                      workosOrganizationId,
                    })
                  )
                : undefined
            }
            onResolve={(delivery) =>
              workosOrganizationId
                ? runDeliveryMutation(
                    { action: "resolve", deliveryId: delivery._id },
                    () =>
                      resolve({
                        deliveryId: delivery._id,
                        workosOrganizationId,
                      })
                  )
                : undefined
            }
            organizationSelected={Boolean(workosOrganizationId)}
            pendingAction={pendingAction}
          />
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}

function useRecipientInbox(
  workosOrganizationId?: string | null,
  exhaustPages = false,
  authReady = true
) {
  const inbox = usePaginatedQuery(
    api.build_collaboration_inbox.listRecipientInbox,
    workosOrganizationId && authReady ? { workosOrganizationId } : "skip",
    { initialNumItems: 100 }
  );
  useEffect(() => {
    if (
      exhaustPages &&
      workosOrganizationId &&
      inbox.status === "CanLoadMore"
    ) {
      inbox.loadMore(100);
    }
  }, [exhaustPages, inbox.loadMore, inbox.status, workosOrganizationId]);
  return useMemo(() => {
    const deliveries = inbox.results;
    return {
      actionRequiredCount: deliveries.filter(
        (delivery) =>
          delivery.actionRequired &&
          delivery.status !== "dismissed" &&
          delivery.status !== "resolved"
      ).length,
      countsComplete: inbox.status === "Exhausted",
      deliveries,
      loaded: inbox.status !== "LoadingFirstPage",
      unreadCount: deliveries.filter((delivery) => delivery.status === "unread")
        .length,
    };
  }, [inbox.results, inbox.status]);
}

function InboxDeliveries({
  deliveries,
  filter,
  inboxLoaded,
  onDismiss,
  onOpen,
  onResolve,
  organizationSelected,
  pendingAction,
}: {
  deliveries: RecipientDelivery[];
  filter: InboxFilter;
  inboxLoaded: boolean;
  onDismiss: (delivery: RecipientDelivery) => void;
  onOpen: (delivery: RecipientDelivery) => void;
  onResolve: (delivery: RecipientDelivery) => void;
  organizationSelected: boolean;
  pendingAction: PendingDeliveryAction | null;
}) {
  if (!organizationSelected) {
    return (
      <InboxState message="Choose an organization to view notifications." />
    );
  }
  if (!inboxLoaded) {
    return <InboxState message="Loading notifications…" />;
  }
  if (deliveries.length === 0) {
    return (
      <InboxState
        message={
          filter === "actionRequired"
            ? "No notifications require action."
            : "No notifications yet."
        }
      />
    );
  }
  return (
    <ol className="grid gap-3">
      {deliveries.map((delivery) => (
        <li key={delivery._id}>
          <RecipientDeliveryCard
            delivery={delivery}
            onDismiss={() => onDismiss(delivery)}
            onOpen={() => onOpen(delivery)}
            onResolve={() => onResolve(delivery)}
            pendingAction={pendingAction}
          />
        </li>
      ))}
    </ol>
  );
}

function RecipientDeliveryCard({
  delivery,
  onDismiss,
  onOpen,
  onResolve,
  pendingAction,
}: {
  delivery: RecipientDelivery;
  onDismiss: () => void;
  onOpen: () => void;
  onResolve: () => void;
  pendingAction: PendingDeliveryAction | null;
}) {
  const titleId = `recipient-delivery-title-${delivery._id}`;
  const createdAt = new Date(delivery.createdAt);
  const actionsDisabled = pendingAction !== null;
  const pendingActionForDelivery =
    pendingAction?.deliveryId === delivery._id ? pendingAction.action : null;

  return (
    <Card
      aria-labelledby={titleId}
      className={cn(
        "grid gap-3 p-4 shadow-none",
        delivery.status === "unread" ? "bg-muted/40" : undefined
      )}
      render={<article />}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-balance font-semibold text-sm" id={titleId}>
            {delivery.title}
          </h3>
          <p className="mt-1 break-words text-muted-foreground text-xs">
            {delivery.entityLabel}
          </p>
        </div>
        <time
          className="shrink-0 text-muted-foreground text-xs tabular-nums"
          dateTime={createdAt.toISOString()}
          title={createdAt.toLocaleString()}
        >
          {formatDeliveryAge(delivery.createdAt)}
        </time>
      </div>
      <p className="text-pretty break-words text-sm">{delivery.body}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        {delivery.status === "unread" ? (
          <>
            <span className="font-medium text-foreground">Unread</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>{delivery.sourceLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{delivery.actionRequired ? "Action required" : "Update"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          aria-label={`${delivery.actionLabel}: ${delivery.title}`}
          data-testid={`recipient-delivery-open-${delivery._id}`}
          onClick={onOpen}
          render={<a href={delivery.href}>{delivery.actionLabel}</a>}
          size="sm"
          variant="outline"
        />
        {delivery.resolutionMode === "recipient" ? (
          <Button
            aria-label={`Resolve ${delivery.title}`}
            data-testid={`recipient-delivery-resolve-${delivery._id}`}
            disabled={actionsDisabled}
            loading={pendingActionForDelivery === "resolve"}
            onClick={onResolve}
            size="sm"
            variant="secondary"
          >
            Resolve
          </Button>
        ) : null}
        <Button
          aria-label={`Dismiss ${delivery.title}`}
          data-testid={`recipient-delivery-dismiss-${delivery._id}`}
          disabled={actionsDisabled}
          loading={pendingActionForDelivery === "dismiss"}
          onClick={onDismiss}
          size="sm"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}

function InboxState({ message }: { message: string }) {
  return (
    <p
      aria-live="polite"
      className="p-8 text-center text-muted-foreground text-sm"
    >
      {message}
    </p>
  );
}

function formatActionRequiredCount(count: number, countsComplete: boolean) {
  if (!countsComplete) {
    return count > 0 ? `${count}+ actions required` : "Counting actions…";
  }
  return `${count} ${count === 1 ? "action" : "actions"} required`;
}

function formatDeliveryAge(createdAt: number) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - createdAt) / 60_000)
  );
  if (elapsedMinutes < 1) {
    return "Just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }
  return `${Math.floor(elapsedHours / 24)}d ago`;
}
