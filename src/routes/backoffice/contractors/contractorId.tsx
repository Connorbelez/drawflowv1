import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/backoffice/contractors/contractorId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/backoffice/contractors/contractorId"!</div>
}
