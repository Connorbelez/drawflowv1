import { createFileRoute } from '@tanstack/react-router'

import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <Card className="p-2">
        <CardHeader className="gap-4 p-6 sm:p-8">
          <Badge variant="secondary" className="w-fit">
            About
          </Badge>
          <div className="space-y-3">
            <CardTitle className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Product shell ready for app-specific flows.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              This starter now uses shadcn/ui tokens and primitives instead of the original themed TanStack template styling. Keep extending pages through existing components in <code>src/components/ui</code>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-6 pb-6 sm:grid-cols-3 sm:px-8 sm:pb-8">
          {['Global CSS tokens', 'Reusable UI primitives', 'Auth and data demos'].map((item) => (
            <div key={item} className="rounded-lg border bg-muted/30 p-4 text-sm font-medium">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
