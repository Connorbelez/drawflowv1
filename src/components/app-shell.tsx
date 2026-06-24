import { useRouter, useRouterState } from "@tanstack/react-router";
import { Bot, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "#/components/app-header.tsx";
import { AppSidebar, type AppSidebarProps } from "#/components/app-sidebar.tsx";
import { DecorIcon } from "#/components/decor-icon.tsx";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "#/components/ui/command.tsx";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx";
import {
  dispatchAssistantClientAction,
  queueAssistantClientActions,
  type AssistantClientAction,
} from "#/features/assistant/assistantClientActionBridge.ts";
import { buildAssistantRouteContext } from "#/features/assistant/assistantRouteContext.ts";
import { DrawFlowAssistant } from "#/features/assistant/DrawFlowAssistant.tsx";
import { cn } from "#/lib/utils.ts";

type AppShellAuthContext = {
  organizationId?: string | null;
  role?: string | null;
  roles?: string[];
  token?: string | null;
  userId?: string | null;
};

type AppShellRouteMatch = {
  context?: AppShellAuthContext;
  id?: string;
  params?: Record<string, string | undefined>;
  routeId?: string;
  search?: Record<string, unknown>;
};

export type AppShellProps = {
  children: ReactNode;
  /** Applied to the scroll/content wrapper inside the app shell. */
  contentClassName?: string;
  /** Forwarded to `AppSidebar` — override navigation, brand, or footer per route. */
  sidebar?: AppSidebarProps;
};

export function AppShell({
  children,
  contentClassName,
  sidebar,
}: AppShellProps) {
  const router = useRouter();
  const routerState = useRouterState({
    select: (state) => ({
      location: state.location,
      matches: state.matches.map((match) => ({
        id: match.id,
        params: match.params,
        routeId: match.routeId,
        search: match.search,
        context: pickAssistantAuthContext(
          (match as { context?: unknown }).context
        ),
      })),
    }),
  });
  const assistantAuthContext = useMemo(
    () =>
      resolveAssistantAuthContext(
        routerState.matches,
        router.options.context
      ),
    [routerState.matches, router.options.context]
  );
  const { organizationId, role, roles, token, userId } = assistantAuthContext;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const routeContext = useMemo(
    () =>
      buildAssistantRouteContext({
        organizationId,
        role,
        roles,
        routerState,
        token,
        userId,
      }),
    [organizationId, role, roles, routerState, token, userId]
  );

  const openAssistant = useCallback(() => {
    setCommandOpen(false);
    setAssistantOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      if (key === "j") {
        event.preventDefault();
        openAssistant();
      }
      if (key === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAssistant]);

  useEffect(() => {
    const onReadonlyAction = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (!action) {
        return;
      }
      if (action.actionKey !== "open_route") {
        dispatchAssistantClientAction(action as AssistantClientAction);
        return;
      }
      if (!action.to) {
        return;
      }
      const afterNavigationActions = Array.isArray(action.afterNavigationActions)
        ? (action.afterNavigationActions as AssistantClientAction[])
        : [];
      queueAssistantClientActions(
        afterNavigationActions.map((queuedAction) => ({
          ...queuedAction,
          route: queuedAction.route ?? action.to,
        }))
      );
      void router.navigate({ to: action.to as never });
    };
    window.addEventListener(
      "drawflow-assistant:readonly-action",
      onReadonlyAction
    );
    return () =>
      window.removeEventListener(
        "drawflow-assistant:readonly-action",
        onReadonlyAction
      );
  }, [router]);

  return (
    <SidebarProvider>
      <AppSidebar {...sidebar} />
      <SidebarInset>
        <AppHeader />
        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col p-0",
            contentClassName
          )}
        >
          {children}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-14 z-[54] hidden border-border border-t md:block"
          data-testid="app-shell-junction-rule"
        />
        {/* Junction mark sits above the shared shell hairline so the seam never breaks. */}
        <DecorIcon position="junction" />
        <DrawFlowCommandPalette
          onAssistantOpen={openAssistant}
          onOpenChange={setCommandOpen}
          open={commandOpen}
        />
        <DrawFlowAssistant
          onOpenChange={setAssistantOpen}
          open={assistantOpen}
          routeContext={routeContext}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function resolveAssistantAuthContext(
  matches: AppShellRouteMatch[],
  fallback: unknown
): AppShellAuthContext {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const context = matches[index]?.context;
    if (context && hasAssistantAuthContext(context)) {
      return context;
    }
  }
  return pickAssistantAuthContext(fallback);
}

function hasAssistantAuthContext(context: AppShellAuthContext) {
  return Boolean(
    context.organizationId ||
      context.role ||
      context.token ||
      context.userId ||
      context.roles?.length
  );
}

function pickAssistantAuthContext(value: unknown): AppShellAuthContext {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    organizationId: optionalString(record.organizationId),
    role: optionalString(record.role),
    roles: Array.isArray(record.roles)
      ? record.roles.filter((item): item is string => typeof item === "string")
      : undefined,
    token: optionalString(record.token),
    userId: optionalString(record.userId),
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function DrawFlowCommandPalette({
  onAssistantOpen,
  onOpenChange,
  open,
}: {
  onAssistantOpen: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandDialogPopup data-testid="drawflow-command-palette">
        <Command>
          <CommandInput placeholder="Search DrawFlow commands..." />
          <CommandPanel>
            <CommandList>
              <CommandEmpty>No command found.</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel>Assistant</CommandGroupLabel>
                <CommandItem
                  onClick={onAssistantOpen}
                  value="open-drawflow-ai-assistant"
                >
                  <Bot className="size-4" />
                  <span>Open DrawFlow AI assistant</span>
                  <CommandShortcut>⌘J</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandGroup>
                <CommandGroupLabel>Navigation</CommandGroupLabel>
                <CommandItem value="search-current-workspace">
                  <Search className="size-4" />
                  <span>Search current workspace</span>
                  <CommandShortcut>⌘K</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span>DrawFlow command surface</span>
            <span>Enter to run</span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
