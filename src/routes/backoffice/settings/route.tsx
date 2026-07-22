import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      {/*<h1>Settings</h1>*/}
      <Outlet />
    </>
  );
}
