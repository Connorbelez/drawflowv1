import { useRouter } from "@tanstack/react-router";
import {
  useAccessToken,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import { ConvexProviderWithAuth } from "convex/react";
import { useCallback, useMemo } from "react";

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { convexQueryClient } = useRouter().options.context;

  return (
    <ConvexProviderWithAuth
      client={convexQueryClient.convexClient}
      useAuth={convexAuthSession}
    >
      {children}
    </ConvexProviderWithAuth>
  );
}

// This adapter is passed to ConvexProviderWithAuth as a VALUE (it is never called
// directly here), so it deliberately does not start with "use". "use no memo"
// keeps the Compiler from treating the hook calls inside it as memoizable.
function convexAuthSession() {
  const { loading, user } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
      if (!user) {
        return null;
      }

      if (forceRefreshToken) {
        return (await refresh()) ?? null;
      }

      return (await getAccessToken()) ?? null;
    },
    [getAccessToken, refresh, user]
  );

  return useMemo(
    () => ({
      fetchAccessToken,
      isAuthenticated: !!user,
      isLoading: loading,
    }),
    [fetchAccessToken, loading, user]
  );
}
