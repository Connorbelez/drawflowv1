import { Link, linkOptions } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import WorkOSHeader from "./workos-user.tsx";

const navItems = linkOptions([
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
]);

const demoItems = linkOptions([
  { to: "/demo/tanstack-query", label: "TanStack Query" },
  { to: "/demo/workos", label: "WorkOS" },
  { to: "/demo/convex", label: "Convex" },
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
            <Button
              key={item.to}
              render={<Link to={item.to} />}
              size="sm"
              variant="ghost"
            >
              {item.label}
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
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
  );
}
