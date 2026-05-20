import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();

  return (
    <div>
      <div>{buildId}</div>
      <Outlet />
    </div>
  );
}
