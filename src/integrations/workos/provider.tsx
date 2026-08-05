import { useRouterState } from "@tanstack/react-router";
import { AuthKitProvider } from "@workos/authkit-tanstack-react-start/client";
import type { ComponentProps } from "react";

type AuthKitInitialAuth = ComponentProps<typeof AuthKitProvider>["initialAuth"];

export default function AppWorkOSProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Seed the provider from the root route's server-resolved auth context so
  // the client never mounts in a loading/unauthenticated window. Without the
  // seed, useAuth reports loading=true with user=null on every page load and
  // Convex queries fire before the access token is available.
  const initialAuth = useRouterState({
    select: (state) =>
      (
        state.matches.find((match) => match.routeId === "__root__")?.context as
          | { initialAuth?: AuthKitInitialAuth | null }
          | undefined
      )?.initialAuth,
  });

  return (
    <AuthKitProvider initialAuth={initialAuth ?? undefined}>
      {children}
    </AuthKitProvider>
  );
}
