"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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
type RecipientDelivery = NonNullable<
  ReturnType<typeof useRecipientInbox>
>["deliveries"][number];

export function NotificationInbox({
  workosOrganizationId,
}: {
  workosOrganizationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inbox = useRecipientInbox(open ? workosOrganizationId : null);
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

  const runDeliveryMutation = async (operation: () => Promise<unknown>) => {
    setErrorMessage(null);
    try {
      await operation();
    } catch {
      setErrorMessage("Unable to update this notification. Try again.");
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
        disabled={!workosOrganizationId}
        render={<Button size="icon-sm" variant="outline" />}
      >
        <HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 font-semibold text-[10px] text-destructive-foreground"
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
        <SheetHeader>
          <div className="flex items-start justify-between gap-6 pr-8">
            <div>
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription id="recipient-inbox-description">
                Recipient-scoped updates and legal next actions.
              </SheetDescription>
            </div>
            {inbox.loaded ? (
              <Badge
                variant={inbox.actionRequiredCount > 0 ? "warning" : "outline"}
              >
                {inbox.actionRequiredCount}
                {inbox.countsComplete ? "" : "+"} require action
              </Badge>
            ) : null}
          </div>
        </SheetHeader>
        <SheetPanel className="grid content-start gap-4">
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
            <p
              aria-live="polite"
              className="rounded-lg bg-destructive/10 p-3 text-destructive-foreground text-sm"
            >
              {errorMessage}
            </p>
          ) : null}

          <InboxDeliveries
            deliveries={deliveries}
            filter={filter}
            inboxLoaded={inbox.loaded}
            onDismiss={(delivery) =>
              workosOrganizationId
                ? runDeliveryMutation(() =>
                    dismiss({
                      deliveryId: delivery._id,
                      workosOrganizationId,
                    })
                  )
                : undefined
            }
            onOpen={(delivery) =>
              workosOrganizationId && delivery.status === "unread"
                ? runDeliveryMutation(() =>
                    markRead({
                      deliveryId: delivery._id,
                      workosOrganizationId,
                    })
                  )
                : undefined
            }
            onResolve={(delivery) =>
              workosOrganizationId
                ? runDeliveryMutation(() =>
                    resolve({
                      deliveryId: delivery._id,
                      workosOrganizationId,
                    })
                  )
                : undefined
            }
            organizationSelected={Boolean(workosOrganizationId)}
          />
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}

function useRecipientInbox(workosOrganizationId?: string | null) {
  const inbox = usePaginatedQuery(
    api.build_collaboration_inbox.listRecipientInbox,
    workosOrganizationId ? { workosOrganizationId } : "skip",
    { initialNumItems: 100 }
  );
  useEffect(() => {
    if (workosOrganizationId && inbox.status === "CanLoadMore") {
      inbox.loadMore(100);
    }
  }, [inbox.loadMore, inbox.status, workosOrganizationId]);
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
}: {
  deliveries: RecipientDelivery[];
  filter: InboxFilter;
  inboxLoaded: boolean;
  onDismiss: (delivery: RecipientDelivery) => void;
  onOpen: (delivery: RecipientDelivery) => void;
  onResolve: (delivery: RecipientDelivery) => void;
  organizationSelected: boolean;
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
}: {
  delivery: RecipientDelivery;
  onDismiss: () => void;
  onOpen: () => void;
  onResolve: () => void;
}) {
  return (
    <article
      className={cn(
        "grid gap-3 rounded-xl border p-4",
        delivery.status === "unread" ? "bg-primary/5" : "bg-background"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm">{delivery.title}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {delivery.entityLabel}
          </p>
        </div>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatDeliveryAge(delivery.createdAt)}
        </span>
      </div>
      <p className="text-sm">{delivery.body}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        <span>{delivery.sourceLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{delivery.actionRequired ? "Action required" : "Update"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid={`recipient-delivery-open-${delivery._id}`}
          onClick={onOpen}
          render={
            <a href={delivery.href}>
              <span className="sr-only">{delivery.actionLabel}</span>
            </a>
          }
          size="sm"
        >
          {delivery.actionLabel}
        </Button>
        {delivery.resolutionMode === "recipient" ? (
          <Button
            data-testid={`recipient-delivery-resolve-${delivery._id}`}
            onClick={onResolve}
            size="sm"
            variant="outline"
          >
            Resolve
          </Button>
        ) : null}
        <Button
          data-testid={`recipient-delivery-dismiss-${delivery._id}`}
          onClick={onDismiss}
          size="sm"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
    </article>
  );
}

function InboxState({ message }: { message: string }) {
  return (
    <p
      aria-live="polite"
      className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm"
    >
      {message}
    </p>
  );
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
