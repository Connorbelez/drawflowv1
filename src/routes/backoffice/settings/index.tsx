import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/backoffice/settings/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/backoffice/settings/"!</div>
}
