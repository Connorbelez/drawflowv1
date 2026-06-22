import { useRouter, useRouterState } from "@tanstack/react-router";
import { Bot, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "#/lib/utils.ts";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx";
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
import { DrawFlowAssistant } from "#/features/assistant/DrawFlowAssistant.tsx";
import { buildAssistantRouteContext } from "#/features/assistant/assistantRouteContext.ts";

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
      })),
    }),
  });
  const { organizationId, role, roles, userId } = router.options.context;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const routeContext = useMemo(
    () =>
      buildAssistantRouteContext({
        organizationId,
        role,
        roles,
        routerState,
        userId,
      }),
    [organizationId, role, roles, routerState, userId],
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
        {/* Junction mark sits above scroll surfaces so it stays visible after load. */}
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
