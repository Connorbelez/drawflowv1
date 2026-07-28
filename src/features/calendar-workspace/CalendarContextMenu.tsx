"use client";

import {
  CalendarPlus,
  Copy,
  ExternalLink,
  MoreHorizontal,
  MousePointer2,
} from "lucide-react";
import type React from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import type { CalendarAction, CalendarActionContext } from "./calendarTypes";

export function visibleCalendarActions(
  actions: CalendarAction[],
  appliesTo: CalendarAction["appliesTo"],
  context: CalendarActionContext
): CalendarAction[] {
  return actions.filter(
    (action) =>
      action.appliesTo === appliesTo &&
      action.availability.state !== "hidden" &&
      (action.isVisible?.(context) ?? true)
  );
}

export function CalendarContextMenu({
  actions,
  children,
  context,
  label,
  target,
}: {
  actions: CalendarAction[];
  children: React.ReactNode;
  context: CalendarActionContext;
  label: string;
  target?: CalendarAction["appliesTo"];
}) {
  const inferredTarget = context.event
    ? "event"
    : context.dateRange
      ? "dateRange"
      : context.events?.length
        ? "selection"
        : "date";
  const visible = visibleCalendarActions(
    actions,
    target ?? inferredTarget,
    context
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        <CalendarContextMenuItems
          actions={visible}
          context={context}
          label={label}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function CalendarOverflowMenu({
  actions,
  context,
  label,
  target,
}: {
  actions: CalendarAction[];
  context: CalendarActionContext;
  label: string;
  target?: CalendarAction["appliesTo"];
}) {
  const inferredTarget = context.event
    ? "event"
    : context.dateRange
      ? "dateRange"
      : context.events?.length
        ? "selection"
        : "date";
  const visible = visibleCalendarActions(
    actions,
    target ?? inferredTarget,
    context
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`${label} actions`}
            className="size-7 shrink-0"
            size="icon"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <CalendarDropdownMenuItems
          actions={visible}
          context={context}
          label={label}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CalendarContextMenuItems({
  actions,
  context,
  label,
}: {
  actions: CalendarAction[];
  context: CalendarActionContext;
  label: string;
}) {
  return (
    <ContextMenuGroup>
      <ContextMenuLabel>{label}</ContextMenuLabel>
      <ContextMenuSeparator />
      {actions.length === 0 ? (
        <ContextMenuItem disabled>
          <MousePointer2 />
          No actions available
        </ContextMenuItem>
      ) : (
        actions.map((action) => (
          <ContextMenuItem
            disabled={action.availability.state === "disabled"}
            key={action.id}
            onClick={(event) => {
              event.preventDefault();
              if (action.availability.state === "enabled") {
                void action.onSelect(context);
              }
            }}
            variant={action.tone === "destructive" ? "destructive" : "default"}
          >
            {action.icon ?? defaultActionIcon(action)}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{action.label}</span>
              {action.availability.state === "disabled" ? (
                <span className="block truncate text-muted-foreground">
                  {action.availability.reason}
                </span>
              ) : action.description ? (
                <span className="block truncate text-muted-foreground">
                  {action.description}
                </span>
              ) : null}
            </span>
          </ContextMenuItem>
        ))
      )}
    </ContextMenuGroup>
  );
}

function CalendarDropdownMenuItems({
  actions,
  context,
  label,
}: {
  actions: CalendarAction[];
  context: CalendarActionContext;
  label: string;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {actions.length === 0 ? (
        <DropdownMenuItem disabled>
          <MousePointer2 />
          No actions available
        </DropdownMenuItem>
      ) : (
        actions.map((action) => (
          <DropdownMenuItem
            disabled={action.availability.state === "disabled"}
            key={action.id}
            onClick={(event) => {
              event.preventDefault();
              if (action.availability.state === "enabled") {
                void action.onSelect(context);
              }
            }}
            variant={action.tone === "destructive" ? "destructive" : "default"}
          >
            {action.icon ?? defaultActionIcon(action)}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{action.label}</span>
              {action.availability.state === "disabled" ? (
                <span className="block truncate text-muted-foreground">
                  {action.availability.reason}
                </span>
              ) : action.description ? (
                <span className="block truncate text-muted-foreground">
                  {action.description}
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))
      )}
    </DropdownMenuGroup>
  );
}

function defaultActionIcon(action: CalendarAction) {
  if (action.id.includes("copy")) {
    return <Copy />;
  }
  if (action.id.includes("open") || action.id.includes("jump")) {
    return <ExternalLink />;
  }
  return <CalendarPlus />;
}
