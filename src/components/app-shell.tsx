import type { ReactNode } from "react";
import { cn } from "#/lib/utils.ts";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar.tsx";
import { AppHeader } from "#/components/app-header.tsx";
import { AppSidebar, type AppSidebarProps } from "#/components/app-sidebar.tsx";

export type AppShellProps = {
	children: ReactNode;
	/** Forwarded to `AppSidebar` — override navigation, brand, or footer per route. */
	sidebar?: AppSidebarProps;
};

export function AppShell({ children, sidebar }: AppShellProps) {
	return (
		<SidebarProvider className={cn("[--app-wrapper-max-width:80rem]")}>
			<AppSidebar {...sidebar} />
			<SidebarInset>
				<AppHeader />
				<div
					className={cn(
						"flex flex-1 flex-col p-4 md:p-6",
						"mx-auto w-full max-w-(--app-wrapper-max-width)"
					)}
				>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
