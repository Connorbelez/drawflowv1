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
    <Button
      disabled={loading}
      render={
        <Link
          reloadDocument
          search={{ returnPathname: location.pathname }}
          to="/api/auth/sign-in"
        />
      }
      size={large ? "lg" : "sm"}
    >
      Sign in {large && "with AuthKit"}
    </Button>
  );
}
