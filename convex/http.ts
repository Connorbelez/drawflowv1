import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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

export default http;
