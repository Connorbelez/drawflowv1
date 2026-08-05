import { spawn } from "bun";

const RESEND_API_BASE_URL = "https://api.resend.com";
const RESEND_WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.failed",
] as const;

interface ResendWebhook {
  endpoint: string;
  events: string[];
  id: string;
  signing_secret?: string;
  status: "enabled" | "disabled";
}

const siteUrl = process.env.VITE_CONVEX_SITE_URL?.trim();
if (!siteUrl) {
  throw new Error("VITE_CONVEX_SITE_URL is not configured.");
}
const endpoint = new URL("/resend-webhook", siteUrl).toString();
const apiKey = await readConvexEnvironmentValue("RESEND_API_KEY");

const list = await resendRequest<{ data: ResendWebhook[] }>(
  "/webhooks",
  apiKey
);
const existing = list.data.find((webhook) => webhook.endpoint === endpoint);
let webhook: ResendWebhook;
if (existing) {
  await resendRequest(`/webhooks/${existing.id}`, apiKey, {
    body: JSON.stringify({
      endpoint,
      events: RESEND_WEBHOOK_EVENTS,
      status: "enabled",
    }),
    method: "PATCH",
  });
  webhook = await resendRequest<ResendWebhook>(
    `/webhooks/${existing.id}`,
    apiKey
  );
} else {
  webhook = await resendRequest<ResendWebhook>("/webhooks", apiKey, {
    body: JSON.stringify({ endpoint, events: RESEND_WEBHOOK_EVENTS }),
    method: "POST",
  });
}

if (!webhook.signing_secret) {
  throw new Error("Resend did not return the webhook signing secret.");
}
await setConvexEnvironmentValue(
  "RESEND_WEBHOOK_SECRET",
  webhook.signing_secret
);
console.info(`Resend webhook enabled for ${endpoint}.`);

async function resendRequest<T>(
  path: string,
  apiKeyValue: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${RESEND_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKeyValue}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Resend API ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

async function readConvexEnvironmentValue(name: string) {
  const result = await runConvex(["env", "get", name]);
  const value = result.trim();
  if (!value) {
    throw new Error(`${name} is not configured in the Convex deployment.`);
  }
  return value;
}

async function setConvexEnvironmentValue(name: string, value: string) {
  await runConvex(["env", "set", name, value]);
}

async function runConvex(args: string[]) {
  const process = spawn(["bun", "x", "convex", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Convex command failed: ${stderr.trim() || stdout.trim() || exitCode}`
    );
  }
  return stdout;
}
