"use client";

import type { ComponentProps, ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/utils.ts";
import { LogoIcon } from "#/components/logo.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";
import {
	footerNavLinks as defaultFooterLinks,
	isNavItemActive,
	navGroups as defaultNavGroups,
	type SidebarNavGroup,
	type SidebarNavItem,
	type SidebarNavTo,
} from "#/components/app-shared.tsx";
import { LatestChange } from "#/components/latest-change.tsx";
import { NavGroup } from "#/components/nav-group.tsx";

export type AppSidebarBrand = {
	label: string;
	to: SidebarNavTo;
};

export type AppSidebarProps = ComponentProps<typeof Sidebar> & {
	/** Brand mark + label shown in the sidebar header. */
	brand?: AppSidebarBrand;
	/** Top-level navigation groups. */
	groups?: SidebarNavGroup[];
	/** Compact links rendered above the footer copyright. */
	footerLinks?: SidebarNavItem[];
	/** Optional changelog/announcement block above the footer. */
	showLatestChange?: boolean;
	/** Override footer line (defaults to `© {year} DrawFlow`). */
	footerText?: ReactNode;
};

const DEFAULT_BRAND: AppSidebarBrand = { label: "DrawFlow", to: "/backoffice" };

export function AppSidebar({
	brand = DEFAULT_BRAND,
	groups = defaultNavGroups,
	footerLinks = defaultFooterLinks,
	showLatestChange = true,
	footerText,
	className,
	collapsible = "icon",
	variant = "sidebar",
	...sidebarProps
}: AppSidebarProps = {}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<Sidebar
			className={cn(
				"*:data-[slot=sidebar-inner]:bg-background",
				"*:data-[slot=sidebar-inner]:dark:bg-[radial-gradient(60%_18%_at_10%_0%,--theme(--color-foreground/.08),transparent)]",
				"**:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75",
				className
			)}
			collapsible={collapsible}
			variant={variant}
			{...sidebarProps}
		>
			<SidebarHeader className="h-14 justify-center px-2">
				<SidebarMenuButton
					render={<Link to={brand.to} preload="intent" viewTransition />}
				>
					<LogoIcon />
					<span className="font-medium text-foreground!">{brand.label}</span>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{groups.map((group, index) => (
					<NavGroup key={group.label ?? `sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				{showLatestChange ? <LatestChange /> : null}
				{footerLinks.length > 0 ? (
					<SidebarMenu className="border-t p-2">
						{footerLinks.map((item) => (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									className="text-muted-foreground"
									isActive={isNavItemActive(item, pathname)}
									size="sm"
									render={<Link to={item.to} preload="intent" viewTransition />}
								>
									{item.icon}
									<span>{item.title}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				) : null}
				<div className="px-4 pt-4 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
					<p className="text-nowrap text-[9px] text-muted-foreground">
						{footerText ?? <>© {new Date().getFullYear()} DrawFlow</>}
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
