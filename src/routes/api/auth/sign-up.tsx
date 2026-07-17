import { createFileRoute } from "@tanstack/react-router";
import { getSignUpUrl } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/api/auth/sign-up")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const searchParams = new URL(request.url).searchParams;
        const returnPathname = searchParams.get("returnPathname");
        const organizationId = searchParams.get("organizationId");
        let url: string;
        try {
          url = await getSignUpUrl(
            returnPathname || organizationId
              ? {
                  data: {
                    organizationId: organizationId ?? undefined,
                    returnPathname: returnPathname ?? undefined,
                  },
                }
              : undefined
          );
        } catch {
          return authUnavailableResponse("sign up");
        }

        return new Response(null, {
          headers: { Location: url },
          status: 307,
        });
      },
    },
  },
});

function authUnavailableResponse(action: string): Response {
  return new Response(
    `<!doctype html><html><head><title>Authentication unavailable</title></head><body><main><h1>Authentication unavailable</h1><p>DrawFlow could not start the ${action} flow because AuthKit is not configured for this local environment.</p><p>Configure WorkOS AuthKit environment variables, then reload this page.</p></main></body></html>`,
    {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 503,
    }
  );
}
