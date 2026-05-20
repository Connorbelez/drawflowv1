import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/backoffice/builds/$buildId/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { buildId } = Route.useParams();
  return (
    <div>
      <div>Build ID: {buildId}</div>
      {/*<Outlet />*/}
    </div>
  );
}
