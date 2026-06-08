import { useAuth } from "@workos/authkit-tanstack-react-start/client";
import { cn } from "#/lib/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { RouteBreadcrumbs } from "#/components/route-breadcrumbs.tsx";
import { CustomSidebarTrigger } from "#/components/custom-sidebar-trigger.tsx";
import { NavUser } from "#/components/nav-user.tsx";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigation03Icon, Notification03Icon } from "@hugeicons/core-free-icons";

export function AppHeader() {
	const { user } = useAuth();
	const navUser = user
		? {
			name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
			email: user.email,
			avatar: user.profilePictureUrl ?? "",
		}
		: { name: "", email: "", avatar: "" };
	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 overflow-visible px-4 md:px-6",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<RouteBreadcrumbs />
			</div>
			<div className="flex items-center gap-3">
				<Button size="icon-sm" variant="outline">
					<HugeiconsIcon icon={Navigation03Icon} strokeWidth={2} />
				</Button>
				<Button aria-label="Notifications" size="icon-sm" variant="outline">
					<HugeiconsIcon icon={Notification03Icon} strokeWidth={2} />
				</Button>
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser user={navUser} />
			</div>
		</header>
	);
}
