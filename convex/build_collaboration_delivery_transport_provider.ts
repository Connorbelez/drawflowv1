export interface BuildCollaborationExternalPayload {
  channel: "email" | "push";
  contact:
    | { email: string }
    | {
        subscriptions: Array<{
          auth: string;
          endpoint: string;
          p256dh: string;
        }>;
      };
  idempotencyKey: string;
  items: Array<{
    actionHref: string;
    body: string;
    occurredAt: number;
    title: string;
  }>;
  recipientWorkosUserId: string;
}

export async function sendBuildCollaborationExternalPayload(
  payload: BuildCollaborationExternalPayload
) {
  const endpoint =
    payload.channel === "email"
      ? process.env.BUILD_COLLABORATION_EMAIL_DELIVERY_URL?.trim()
      : process.env.BUILD_COLLABORATION_PUSH_DELIVERY_URL?.trim();
  if (!endpoint) {
    throw new Error(`${payload.channel} delivery endpoint is not configured.`);
  }
  const token = process.env.BUILD_COLLABORATION_DELIVERY_BEARER_TOKEN?.trim();
  const response = await fetch(endpoint, {
    body: JSON.stringify(payload),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      "idempotency-key": payload.idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new BuildCollaborationDeliveryTransportError(response.status);
  }
  return {
    providerMessageId:
      response.headers.get("x-message-id") ??
      response.headers.get("x-request-id") ??
      undefined,
    responseCode: response.status,
  };
}

export class BuildCollaborationDeliveryTransportError extends Error {
  readonly responseCode: number;

  constructor(responseCode: number) {
    super(`External delivery failed with HTTP ${responseCode}.`);
    this.name = "BuildCollaborationDeliveryTransportError";
    this.responseCode = responseCode;
  }
}
