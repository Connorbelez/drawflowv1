import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authKit } from "./auth";

const http = httpRouter();
authKit.registerRoutes(http);
http.route({
  handler: httpAction(async (ctx, request) => {
    const requestUrl = new URL(request.url);
    const sourceUrl = requestUrl.searchParams.get("url");
    if (!sourceUrl) {
      return new Response("Missing evidence source URL.", { status: 400 });
    }

    try {
      const previewBytes = await ctx.runAction(
        (internal as any).evidence_preview.convertEvidenceImagePreview,
        { sourceUrl },
      );
      return new Response(new Uint8Array(previewBytes), {
        headers: {
          "Cache-Control": "public, max-age=86400",
          "Content-Type": "image/jpeg",
        },
        status: 200,
      });
    } catch {
      return new Response("Unable to convert evidence image preview.", {
        status: 415,
      });
    }
  }),
  method: "GET",
  path: "/evidence-image-preview",
});
http.route({
  handler: httpAction(async (ctx, request) => {
    const requestUrl = new URL(request.url);
    const match = requestUrl.pathname.match(/\/api\/calendar\/([^/]+)\.ics$/);
    const subscriptionKey = match?.[1];
    if (!subscriptionKey) {
      return new Response("Missing calendar subscription key.", {
        status: 400,
      });
    }
    try {
      const ics = await ctx.runQuery(
        (api as any).production_proposals.getCalendarSubscriptionIcs,
        { subscriptionKey },
      );
      return new Response(ics, {
        headers: {
          "Cache-Control": "public, max-age=300",
          "Content-Disposition": `inline; filename="${subscriptionKey}.ics"`,
          "Content-Type": "text/calendar;charset=utf-8",
        },
        status: 200,
      });
    } catch {
      return new Response("Calendar subscription not found.", {
        status: 404,
      });
    }
  }),
  method: "GET",
  pathPrefix: "/api/calendar/",
});

export default http;
