import { Link, linkOptions } from '@tanstack/react-router'

import ThemeToggle from './ThemeToggle'
import WorkOSHeader from './workos-user.tsx'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

const navItems = linkOptions([
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
])

const demoItems = linkOptions([
  { to: '/demo/tanstack-query', label: 'TanStack Query' },
  { to: '/demo/workos', label: 'WorkOS' },
  { to: '/demo/convex', label: 'Convex' },
])

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 py-3">
        <Link to="/" className="no-underline">
          <Badge variant="outline" className="h-7 gap-2 px-3 text-foreground">
            <span className="size-2 rounded-full bg-primary" />
            drawFlow
          </Badge>
        </Link>

        <div className="order-3 flex w-full flex-wrap items-center gap-1 text-sm font-medium sm:order-2 sm:w-auto">
          {navItems.map((item) => (
            <Button key={item.to} variant="ghost" size="sm" render={<Link to={item.to} />}>
              {item.label}
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              Demos
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {demoItems.map((item) => (
                <DropdownMenuItem key={item.to} render={<Link {...item} />}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <WorkOSHeader />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
