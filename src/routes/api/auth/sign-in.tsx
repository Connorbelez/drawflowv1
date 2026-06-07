import { createFileRoute } from '@tanstack/react-router'
import { getSignInUrl } from '@workos/authkit-tanstack-react-start'

export const Route = createFileRoute('/api/auth/sign-in')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const searchParams = new URL(request.url).searchParams
        const returnPathname = searchParams.get('returnPathname')
        const organizationId = searchParams.get('organizationId')
        const url = await getSignInUrl(
          returnPathname || organizationId
            ? { data: { organizationId: organizationId ?? undefined, returnPathname: returnPathname ?? undefined } }
            : undefined,
        )

        return new Response(null, {
          headers: { Location: url },
          status: 307,
        })
      },
    },
  },
})
