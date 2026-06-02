import type { ReactNode } from "react";
import { cn } from "#/lib/utils.ts";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx";
import { AppHeader } from "#/components/app-header.tsx";
import { AppSidebar, type AppSidebarProps } from "#/components/app-sidebar.tsx";

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
            "flex w-full flex-1 flex-col px-1 py-0 md:p-0",
            contentClassName
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
