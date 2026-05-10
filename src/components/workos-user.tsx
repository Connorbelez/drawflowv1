import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@workos/authkit-tanstack-react-start/client";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

export default function SignInButton({ large }: { large?: boolean }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();

  if (user) {
    const initials = [user.firstName, user.lastName]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join("")
      .toUpperCase();

    return (
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarImage src={user.profilePictureUrl ?? undefined} />
          <AvatarFallback>
            {initials || user.email[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <Button
          onClick={() => signOut({ returnTo: "/" })}
          size={large ? "lg" : "sm"}
          variant="outline"
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Link
      aria-disabled={loading}
      className={[
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent bg-primary bg-clip-padding font-medium text-primary-foreground text-xs/relaxed outline-none transition-all hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        large ? "h-8 gap-1 px-2.5" : "h-6 gap-1 px-2",
        loading ? "pointer-events-none opacity-50" : "",
      ].join(" ")}
      reloadDocument
      search={{ returnPathname: location.pathname }}
      to="/api/auth/sign-in"
    >
      Sign in {large && "with AuthKit"}
    </Link>
  );
}
