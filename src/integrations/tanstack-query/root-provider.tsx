import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'

export function getContext() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error('Missing VITE_CONVEX_URL environment variable')
  }

  const queryClient = new QueryClient()
  const convexQueryClient = new ConvexQueryClient(convexUrl)
  convexQueryClient.connect(queryClient)

  return {
    convexClient: convexQueryClient.convexClient,
    convexQueryClient,
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
