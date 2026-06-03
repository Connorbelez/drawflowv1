import type { ReactNode } from "react";
import { cn } from "#/lib/utils.ts";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx";
import { AppHeader } from "#/components/app-header.tsx";
import { AppSidebar, type AppSidebarProps } from "#/components/app-sidebar.tsx";
import { DecorIcon } from "#/components/decor-icon.tsx";

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
      </SidebarInset>
    </SidebarProvider>
  );
}
