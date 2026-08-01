"use node";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { v } from "convex/values";

import { buildCollaborationWebhookEventTypeValidator } from "./build_collaboration_webhook_contracts";
import { assertPublicWebhookIpAddress } from "./build_collaboration_webhook_network";
import { internalAction } from "./fluent";

const DELIVERY_TIMEOUT_MS = 10_000;

const deliveryResultValidator = v.object({
  responseCode: v.optional(v.number()),
  safeError: v.optional(v.string()),
  status: v.union(v.literal("delivered"), v.literal("failed")),
});

interface DeliveryResult {
  responseCode?: number;
  safeError?: string;
  status: "delivered" | "failed";
}

export const sendBuildCollaborationWebhookRequest = internalAction
  .input({
    body: v.string(),
    deliveryId: v.string(),
    endpointUrl: v.string(),
    eventType: buildCollaborationWebhookEventTypeValidator,
    sequence: v.number(),
    signature: v.string(),
    timestamp: v.string(),
    version: v.string(),
  })
  .returns(deliveryResultValidator)
  .handler(async (_ctx, args) => {
    try {
      const endpoint = new URL(args.endpointUrl);
      if (endpoint.protocol !== "https:") {
        throw new Error("Webhook transport requires HTTPS.");
      }
      const addresses = await resolvePublicWebhookAddresses(endpoint.hostname);
      return await sendPinnedHttpsRequest(
        endpoint,
        args.body,
        {
          "Content-Type": "application/json",
          "X-DrawFlow-Delivery": args.deliveryId,
          "X-DrawFlow-Event": args.eventType,
          "X-DrawFlow-Sequence": String(args.sequence),
          "X-DrawFlow-Signature": args.signature,
          "X-DrawFlow-Timestamp": args.timestamp,
          "X-DrawFlow-Version": args.version,
        },
        addresses[0]
      );
    } catch (error) {
      return {
        safeError:
          error instanceof Error && error.name === "AbortError"
            ? "Endpoint timed out before acknowledging delivery."
            : error instanceof Error && error.message.includes("non-public")
              ? "Webhook destination did not resolve exclusively to public IP addresses."
              : "Endpoint could not be reached. No response content was stored.",
        status: "failed",
      };
    }
  })
  .internal();

export async function resolvePublicWebhookAddresses(
  hostname: string,
  resolver: typeof lookup = lookup
) {
  const resolved = await resolver(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error("Webhook destination did not resolve.");
  }
  return resolved.map(({ address, family }) => {
    if (family !== 4 && family !== 6) {
      throw new Error(
        "Webhook destination resolved to an unsupported address."
      );
    }
    assertPublicWebhookIpAddress(address);
    return { address, family } as const;
  });
}

function sendPinnedHttpsRequest(
  endpoint: URL,
  body: string,
  headers: Record<string, string>,
  target: { address: string; family: 4 | 6 }
) {
  return new Promise<DeliveryResult>((resolve) => {
    let settled = false;
    const settle = (result: DeliveryResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const outbound = request(endpoint, {
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body).toString(),
      },
      lookup: (_hostname, _options, callback) => {
        callback(null, target.address, target.family);
      },
      method: "POST",
    });
    outbound.setTimeout(DELIVERY_TIMEOUT_MS, () => {
      const timeoutError = new Error("Webhook delivery timed out.");
      timeoutError.name = "AbortError";
      outbound.destroy(timeoutError);
    });
    outbound.on("response", (response) => {
      const result = responseResult(response.statusCode ?? 0);
      response.destroy();
      settle(result);
    });
    outbound.on("error", (error) => {
      settle({
        safeError:
          error.name === "AbortError"
            ? "Endpoint timed out before acknowledging delivery."
            : "Endpoint could not be reached. No response content was stored.",
        status: "failed",
      });
    });
    outbound.end(body);
  });
}

function responseResult(responseCode: number): DeliveryResult {
  return responseCode >= 200 && responseCode < 300
    ? { responseCode, status: "delivered" }
    : {
        responseCode,
        safeError: `Endpoint returned HTTP ${responseCode}. Response content was not stored.`,
        status: "failed",
      };
}
