import { Link, linkOptions } from "@tanstack/react-router";
import { ArrowUpRightIcon, MenuIcon } from "lucide-react";
import { useState } from "react";

import ThemeToggle from "./ThemeToggle";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import WorkOSHeader from "./workos-user.tsx";

const navItems = linkOptions([
  { to: "/", label: "Home" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/about", label: "About" },
]);

const marketingItems = linkOptions([
  { to: "/backoffice", label: "Backoffice" },
  { to: "/builder", label: "Builder dashboard" },
  { to: "/builder/proposals/new", label: "Builder onboarding" },
  { to: "/backoffice/onboard-builder", label: "Broker intake" },
]);

export default function Header({
  enableLandingMobileMenu = false,
}: {
  enableLandingMobileMenu?: boolean;
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

          {marketingItems.map(({ label, ...item }) => (
            <Link
              className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-2 font-medium text-xs/relaxed outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:hover:bg-muted/50"
              key={item.to}
              {...item}
            >
              {label}
            </Link>
          ))}
        </div>

        <Link
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-2.5 font-medium text-xs outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:hidden dark:hover:bg-muted/50"
          to="/builder/proposals/new"
        >
          Start
        </Link>

        {enableLandingMobileMenu ? <MobileLandingMenu /> : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <WorkOSHeader />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

function MobileLandingMenu() {
  const [open, setOpen] = useState(false);
  const linkClassName =
    "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 font-medium text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30";

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open site navigation"
        className="sm:hidden"
        render={<Button size="icon-sm" variant="outline" />}
      >
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent className="sm:max-w-sm" side="right">
        <SheetHeader>
          <SheetTitle>Site navigation</SheetTitle>
        </SheetHeader>
        <SheetPanel className="grid gap-5">
          <nav aria-label="Mobile site navigation" className="grid gap-5">
            <div className="grid gap-2">
              <p className="px-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
                Main
              </p>
              {navItems.map(({ label, ...item }) => (
                <Link
                  className={linkClassName}
                  key={`main-${item.to}`}
                  onClick={() => setOpen(false)}
                  {...item}
                >
                  <span>{label}</span>
                  <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </Link>
              ))}
            </div>
            <div className="grid gap-2 border-t pt-5">
              <p className="px-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.12em]">
                Workspaces
              </p>
              {marketingItems.map(({ label, ...item }) => (
                <Link
                  className={linkClassName}
                  key={`workspace-${item.to}`}
                  onClick={() => setOpen(false)}
                  {...item}
                >
                  <span>{label}</span>
                  <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </Link>
              ))}
            </div>
          </nav>
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}
