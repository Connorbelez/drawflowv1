import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export const Route = createFileRoute('/demo/tanstack-query')({
  component: TanStackQueryDemo,
})

function TanStackQueryDemo() {
  const { data } = useQuery({
    queryKey: ['todos'],
    queryFn: () =>
      Promise.resolve([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]),
    initialData: [],
  })

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Card className="p-2">
        <CardHeader className="p-6">
          <Badge variant="secondary" className="w-fit">
            TanStack Query
          </Badge>
          <CardTitle className="text-3xl font-semibold">Cached query demo</CardTitle>
          <CardDescription>Simple async data rendered through shadcn card primitives.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-6 pb-6">
          {data.map((todo) => (
            <div key={todo.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <span className="font-medium">{todo.name}</span>
              <Badge variant="outline">#{todo.id}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
