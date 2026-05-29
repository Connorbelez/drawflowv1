import { Link, linkOptions } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import WorkOSHeader from "./workos-user.tsx";

const navItems = linkOptions([
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
]);

const marketingItems = linkOptions([
  { to: "/builder/proposals/new", label: "Builder onboarding" },
  { to: "/backoffice/onboard-builder", label: "Broker intake" },
]);

const demoItems = linkOptions([
  { to: "/demo/tanstack-query", label: "TanStack Query" },
  { to: "/demo/workos", label: "WorkOS" },
  { to: "/demo/convex", label: "Convex" },
  { to: "/demo/timeline", label: "Timeline" },
  { to: "/demo/drawflow/active", label: "DrawFlow Workspace" },
  { to: "/demo/drawflow/proposal", label: "DrawFlow Proposal" },
  { to: "/demo/drawflow/builder-dashboard", label: "Builder Dashboard" },
  {
    to: "/demo/drawflow/new-proposal",
    search: { draftId: undefined },
    label: "New Proposal",
  },
]);

export default function Header({
  mode = "marketing",
}: {
  mode?: "marketing" | "demo";
}) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
      <nav className="mx-auto flex max-w-6xl flex-nowrap items-center gap-2 py-2 sm:flex-wrap sm:gap-3 sm:py-3">
        <Link className="min-w-0 shrink-0 no-underline" to="/">
          <Badge className="h-7 gap-2 px-3 text-foreground" variant="outline">
            <span className="size-2 rounded-full bg-primary" />
            drawFlow
          </Badge>
        </Link>

        <div className="hidden items-center gap-1 font-medium text-sm sm:flex">
          {navItems.map((item) => (
            <Link
              className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-2 font-medium text-xs/relaxed outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:hover:bg-muted/50"
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}

          {mode === "demo" ? (
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
          ) : (
            marketingItems.map(({ label, ...item }) => (
              <Link
                className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-2 font-medium text-xs/relaxed outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:hover:bg-muted/50"
                key={item.to}
                {...item}
              >
                {label}
              </Link>
            ))
          )}
        </div>

        {mode === "demo" ? (
          <Link
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2.5 font-medium text-xs outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:hidden dark:hover:bg-muted/50"
            to="/demo/timeline"
          >
            Demos
          </Link>
        ) : (
          <Link
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2.5 font-medium text-xs outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:hidden dark:hover:bg-muted/50"
            to="/builder/proposals/new"
          >
            Start
          </Link>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <WorkOSHeader />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
