import { Link, linkOptions } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import WorkOSHeader from "./workos-user.tsx";

const navItems = linkOptions([
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
]);

const demoItems = linkOptions([
  { to: "/demo/tanstack-query", label: "TanStack Query" },
  { to: "/demo/workos", label: "WorkOS" },
  { to: "/demo/convex", label: "Convex" },
  { to: "/demo/drawflow/active", label: "DrawFlow Workspace" },
  { to: "/demo/drawflow/proposal", label: "DrawFlow Proposal" },
  { to: "/demo/drawflow/builder-dashboard", label: "Builder Dashboard" },
  { to: "/demo/drawflow/new-proposal", search: {}, label: "New Proposal" },
]);

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 py-3">
        <Link className="no-underline" to="/">
          <Badge className="h-7 gap-2 px-3 text-foreground" variant="outline">
            <span className="size-2 rounded-full bg-primary" />
            drawFlow
          </Badge>
        </Link>

        <div className="order-3 flex w-full flex-wrap items-center gap-1 font-medium text-sm sm:order-2 sm:w-auto">
          {navItems.map((item) => (
            <Link
              className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-2 font-medium text-xs/relaxed outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:hover:bg-muted/50"
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}

          <div className="group relative">
            <Button aria-haspopup="menu" size="sm" variant="ghost">
              Demos
            </Button>
            <div
              className="absolute top-full left-0 z-50 mt-1 hidden min-w-48 gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 group-focus-within:grid group-hover:grid"
              role="menu"
            >
              {demoItems.map(({ label, ...item }) => (
                <Link
                  className="rounded-md px-2 py-1 text-xs/relaxed outline-hidden hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                  key={item.to}
                  role="menuitem"
                  {...item}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <WorkOSHeader />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
