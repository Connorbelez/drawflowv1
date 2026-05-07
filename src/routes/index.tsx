import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Database, RouteIcon, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

export const Route = createFileRoute('/')({ component: App })

const features = [
  {
    title: 'Typed routes',
    description: 'TanStack Router keeps navigation and route params checked at build time.',
    icon: RouteIcon,
  },
  {
    title: 'Convex data',
    description: 'Reactive functions and synced data are ready for product workflows.',
    icon: Database,
  },
  {
    title: 'WorkOS auth',
    description: 'AuthKit sign-in is wired with shadcn-styled controls.',
    icon: ShieldCheck,
  },
  {
    title: 'shadcn/ui shell',
    description: 'Global tokens and primitives now drive page layout and interaction states.',
    icon: Sparkles,
  },
]

function App() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="relative overflow-hidden p-2">
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <CardHeader className="gap-4 p-6 sm:p-8">
            <Badge className="w-fit" variant="secondary">
              drawFlow app shell
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                Build authenticated flows on clean shadcn primitives.
              </h1>
              <CardDescription className="max-w-2xl text-base leading-7 sm:text-lg">
                Template theme classes are gone. Pages now use global shadcn tokens, reusable UI primitives, and compact product-ready layout.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 px-6 pb-6 sm:px-8 sm:pb-8">
            <Button size="lg" render={<Link to="/demo/workos" />}>
              Test sign in
              <ArrowRight />
            </Button>
            <Button variant="outline" size="lg" render={<Link to="/about" />}>
              View setup
            </Button>
          </CardContent>
        </Card>

        <Card className="justify-between p-2">
          <CardHeader className="p-6">
            <CardTitle>Current stack</CardTitle>
            <CardDescription>Router, auth, data, and components are installed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-6 pb-6">
            {['TanStack Start', 'Convex', 'WorkOS AuthKit', 'shadcn/ui'].map((item) => (
              <Badge key={item} variant="outline" className="justify-start rounded-md py-1.5">
                {item}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <Card key={feature.title}>
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </section>
    </main>
  )
}
