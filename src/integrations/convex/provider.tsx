import { useCallback, useMemo } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useAccessToken, useAuth } from '@workos/authkit-tanstack-react-start/client'
import { ConvexProviderWithAuth } from 'convex/react'

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { convexQueryClient } = useRouter().options.context

  return (
    <ConvexProviderWithAuth client={convexQueryClient.convexClient} useAuth={useAuthFromAuthKit}>
      {children}
    </ConvexProviderWithAuth>
  )
}

function useAuthFromAuthKit() {
  const { loading, user } = useAuth()
  const { getAccessToken, refresh } = useAccessToken()

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
      if (!user) {
        return null
      }

      if (forceRefreshToken) {
        return (await refresh()) ?? null
      }

      return (await getAccessToken()) ?? null
    },
    [getAccessToken, refresh, user],
  )

  return useMemo(
    () => ({
      fetchAccessToken,
      isAuthenticated: !!user,
      isLoading: loading,
    }),
    [fetchAccessToken, loading, user],
  )
}
