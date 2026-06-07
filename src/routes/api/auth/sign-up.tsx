import { createFileRoute } from '@tanstack/react-router'
import { getSignUpUrl } from '@workos/authkit-tanstack-react-start'

export const Route = createFileRoute('/api/auth/sign-up')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const searchParams = new URL(request.url).searchParams
        const returnPathname = searchParams.get('returnPathname')
        const organizationId = searchParams.get('organizationId')
        const url = await getSignUpUrl(
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
