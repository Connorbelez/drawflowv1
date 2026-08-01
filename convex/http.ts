import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authKit } from "./auth";
import { resendClient } from "./email_transport";

const ALLOWED_CONVEX_STORAGE_HOST_SUFFIXES = [
  ".convex.cloud",
  ".convex.site",
] as const;
const CALENDAR_SUBSCRIPTION_PATH = /\/api\/calendar\/([^/]+)\.ics$/;
const BUILD_COLLABORATION_EXPORT_ASSET_PATH =
  "/api/build-collaboration/export-asset";
const BUILD_COLLABORATION_EXPORT_ARCHIVE_CHUNK_PATH =
  "/api/build-collaboration/export-archive-chunk";
const DEFAULT_BUILD_COLLABORATION_APP_ORIGINS = [
  "https://drawflow.fairlend.ca",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

const http = httpRouter();
authKit.registerRoutes(http);
http.route({
  handler: httpAction(async (ctx, request) => {
    try {
      return await resendClient().handleResendEventWebhook(ctx, request);
    } catch {
      console.warn("Rejected an invalid Resend webhook request.");
      return new Response("Invalid Resend webhook.", { status: 400 });
    }
  }),
  method: "POST",
  path: "/resend-webhook",
});
http.route({
  handler: httpAction(async (_ctx, request) => {
    const requestUrl = new URL(request.url);
    const sourceUrl = parseAllowedEvidenceStorageUrl(
      requestUrl.searchParams.get("url")
    );
    if (!sourceUrl) {
      return new Response("Unsupported evidence source URL.", { status: 400 });
    }

    try {
      const sourceResponse = await fetch(sourceUrl);
      if (!(sourceResponse.ok && sourceResponse.body)) {
        return new Response("Unable to read evidence image.", { status: 404 });
      }
      return new Response(sourceResponse.body, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control":
            "public, max-age=31536000, s-maxage=31536000, immutable",
          "Content-Type":
            sourceResponse.headers.get("Content-Type") ??
            "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
        status: 200,
      });
    } catch {
      return new Response("Unable to read evidence image.", { status: 502 });
    }
  }),
  method: "GET",
  path: "/evidence-image-source",
});
http.route({
  handler: httpAction((_ctx, request) => {
    const corsHeaders = buildCollaborationExportCorsHeaders(request);
    if (!corsHeaders) {
      return Promise.resolve(
        new Response("Build Collaboration export origin denied.", {
          status: 403,
        })
      );
    }
    return Promise.resolve(
      new Response(null, { headers: corsHeaders, status: 204 })
    );
  }),
  method: "OPTIONS",
  path: BUILD_COLLABORATION_EXPORT_ASSET_PATH,
});
http.route({
  handler: httpAction((_ctx, request) => {
    const corsHeaders = buildCollaborationExportCorsHeaders(request);
    if (!corsHeaders) {
      return Promise.resolve(
        new Response("Build Collaboration export origin denied.", {
          status: 403,
        })
      );
    }
    return Promise.resolve(
      new Response(null, { headers: corsHeaders, status: 204 })
    );
  }),
  method: "OPTIONS",
  path: BUILD_COLLABORATION_EXPORT_ARCHIVE_CHUNK_PATH,
});
http.route({
  handler: httpAction(async (ctx, request) => {
    const corsHeaders = buildCollaborationExportCorsHeaders(request);
    if (!corsHeaders) {
      return new Response("Build Collaboration export origin denied.", {
        status: 403,
      });
    }
    const requestUrl = new URL(request.url);
    const assetId = requestUrl.searchParams.get("assetId");
    const buildId = requestUrl.searchParams.get("buildId");
    const exportId = requestUrl.searchParams.get("exportId");
    const organizationId = requestUrl.searchParams.get("organizationId");
    const token = requestUrl.searchParams.get("token");
    if (!(assetId && buildId && exportId && organizationId && token)) {
      return new Response("Missing collaboration export asset credentials.", {
        status: 400,
      });
    }
    try {
      const authorized = await ctx.runMutation(
        api.build_collaboration_exports
          .authorizeBuildCollaborationExportAssetDownload,
        {
          assetId: assetId as never,
          buildId: buildId as never,
          exportId: exportId as never,
          organizationId,
          token,
        }
      );
      if (authorized.expiresAt <= Date.now()) {
        return new Response("Collaboration export link has expired.", {
          status: 410,
        });
      }
      const storageUrl = await ctx.storage.getUrl(authorized.storageId);
      if (!storageUrl) {
        return new Response("Collaboration export asset is unavailable.", {
          status: 404,
        });
      }
      const sourceResponse = await fetch(storageUrl);
      if (!(sourceResponse.ok && sourceResponse.body)) {
        return new Response("Collaboration export asset is unavailable.", {
          status: 404,
        });
      }
      return new Response(sourceResponse.body, {
        headers: {
          ...corsHeaders,
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(authorized.fileName)}`,
          "Content-Type": authorized.mimeType,
          "X-Content-Type-Options": "nosniff",
        },
        status: 200,
      });
    } catch {
      return new Response("Collaboration export asset access denied.", {
        status: 403,
      });
    }
  }),
  method: "GET",
  path: BUILD_COLLABORATION_EXPORT_ASSET_PATH,
});
http.route({
  handler: httpAction(async (ctx, request) => {
    const corsHeaders = buildCollaborationExportCorsHeaders(request);
    if (!corsHeaders) {
      return new Response("Build Collaboration export origin denied.", {
        status: 403,
      });
    }
    const requestUrl = new URL(request.url);
    const buildId = requestUrl.searchParams.get("buildId");
    const chunkIndexValue = requestUrl.searchParams.get("chunkIndex");
    const exportId = requestUrl.searchParams.get("exportId");
    const organizationId = requestUrl.searchParams.get("organizationId");
    const token = requestUrl.searchParams.get("token");
    const chunkIndex = Number(chunkIndexValue);
    if (
      !(
        buildId &&
        chunkIndexValue &&
        Number.isInteger(chunkIndex) &&
        chunkIndex >= 0 &&
        exportId &&
        organizationId &&
        token
      )
    ) {
      return new Response("Missing collaboration archive credentials.", {
        status: 400,
      });
    }
    try {
      const authorized = await ctx.runMutation(
        api.build_collaboration_exports
          .authorizeBuildCollaborationExportArchiveChunkDownload,
        {
          buildId: buildId as never,
          chunkIndex,
          exportId: exportId as never,
          organizationId,
          token,
        }
      );
      if (authorized.expiresAt <= Date.now()) {
        return new Response("Collaboration export link has expired.", {
          status: 410,
        });
      }
      if (authorized.content) {
        return new Response(authorized.content, {
          headers: {
            ...corsHeaders,
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Type": "application/x-ndjson",
            "X-Content-SHA256": authorized.contentHashSha256,
            "X-Content-Type-Options": "nosniff",
          },
          status: 200,
        });
      }
      if (!authorized.storageId) {
        return new Response("Collaboration archive chunk is unavailable.", {
          status: 404,
        });
      }
      const storageUrl = await ctx.storage.getUrl(authorized.storageId);
      if (!storageUrl) {
        return new Response("Collaboration archive chunk is unavailable.", {
          status: 404,
        });
      }
      const sourceResponse = await fetch(storageUrl);
      if (!(sourceResponse.ok && sourceResponse.body)) {
        return new Response("Collaboration archive chunk is unavailable.", {
          status: 404,
        });
      }
      return new Response(sourceResponse.body, {
        headers: {
          ...corsHeaders,
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Type": "application/x-ndjson",
          "X-Content-SHA256": authorized.contentHashSha256,
          "X-Content-Type-Options": "nosniff",
        },
        status: 200,
      });
    } catch {
      return new Response("Collaboration archive access denied.", {
        status: 403,
      });
    }
  }),
  method: "GET",
  path: BUILD_COLLABORATION_EXPORT_ARCHIVE_CHUNK_PATH,
});
http.route({
  handler: httpAction(async (ctx, request) => {
    const requestUrl = new URL(request.url);
    const sourceUrl = requestUrl.searchParams.get("url");
    if (!sourceUrl) {
      return new Response("Missing evidence source URL.", { status: 400 });
    }

    try {
      const previewBytes = await ctx.runAction(
        internal.evidence_preview.convertEvidenceImagePreview,
        { sourceUrl }
      );
      return new Response(new Uint8Array(previewBytes), {
        headers: {
          "Cache-Control":
            "public, max-age=31536000, s-maxage=31536000, immutable",
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
    const match = requestUrl.pathname.match(CALENDAR_SUBSCRIPTION_PATH);
    const subscriptionKey = match?.[1];
    if (!subscriptionKey) {
      return new Response("Missing calendar subscription key.", {
        status: 400,
      });
    }
    try {
      const ics = await ctx.runQuery(
        api.production_proposals.getCalendarSubscriptionIcs,
        { subscriptionKey }
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

function parseAllowedEvidenceStorageUrl(sourceUrl: string | null) {
  if (!sourceUrl) {
    return null;
  }
  try {
    const parsed = new URL(sourceUrl);
    if (
      parsed.protocol !== "https:" ||
      !parsed.pathname.includes("/api/storage/") ||
      !ALLOWED_CONVEX_STORAGE_HOST_SUFFIXES.some((suffix) =>
        parsed.hostname.endsWith(suffix)
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildCollaborationExportCorsHeaders(
  request: Request
): Record<string, string> | null {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return {};
  }
  const configuredOrigins = (process.env.DRAWFLOW_APP_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    ![
      ...DEFAULT_BUILD_COLLABORATION_APP_ORIGINS,
      ...configuredOrigins,
    ].includes(origin)
  ) {
    return null;
  }
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export default http;
