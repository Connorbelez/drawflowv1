import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell.tsx";

export const Route = createFileRoute("/backoffice")({
	staticData: {
		breadcrumb: {
			label: "Backoffice",
			to: "/backoffice",
		},
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
