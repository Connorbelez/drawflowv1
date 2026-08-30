const API_BASE_URL = "https://api.agentmail.to";

export const ONBOARDING_QA_INBOXES = [
  {
    address: "drawflow-builder-1@agentmail.to",
    clientId: "drawflow-onboarding-qa-builder-new-owner-v1",
    displayName: "DrawFlow QA - new builder owner",
    persona: "builder_new_owner",
  },
  {
    address: "drawflow-builder-existing-1@agentmail.to",
    clientId: "drawflow-onboarding-qa-builder-existing-owner-v1",
    displayName: "DrawFlow QA - existing builder owner",
    persona: "builder_existing_owner",
  },
  {
    address: "drawflow-contractor-1@agentmail.to",
    clientId: "drawflow-onboarding-qa-contractor-v1",
    displayName: "DrawFlow QA - contractor",
    persona: "contractor",
  },
] as const;

type AgentMailInbox = {
  created_at?: string;
  display_name?: string;
  email: string;
  inbox_id: string;
  metadata?: Record<string, string>;
  updated_at?: string;
};

type AgentMailMessage = {
  created_at?: string;
  extracted_html?: string;
  extracted_text?: string;
  from?: string | string[];
  html?: string;
  message_id?: string;
  received_at?: string;
  subject?: string;
  text?: string;
  to?: string[];
};

function apiKey(): string {
  const value = Bun.env.AGENTMAIL_API_KEY?.trim();
  if (!value) {
    throw new Error("AGENTMAIL_API_KEY is required.");
  }
  return value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `AgentMail ${response.status} ${response.statusText}: ${body.slice(0, 500)}`
    );
  }
  return body ? (JSON.parse(body) as T) : (undefined as T);
}

export async function listInboxes(): Promise<AgentMailInbox[]> {
  const response = await request<{ inboxes: AgentMailInbox[] }>(
    "/inboxes?limit=100"
  );
  return response.inboxes ?? [];
}

export async function ensureInbox(
  definition: (typeof ONBOARDING_QA_INBOXES)[number]
): Promise<AgentMailInbox> {
  const existing = (await listInboxes()).find(
    (inbox) => inbox.email.toLowerCase() === definition.address
  );
  if (existing) {
    return existing;
  }

  return await request<AgentMailInbox>("/inboxes", {
    body: JSON.stringify({
      client_id: definition.clientId,
      display_name: definition.displayName,
      domain: "agentmail.to",
      metadata: {
        drawflowQa: "onboarding",
        persona: definition.persona,
      },
      username: definition.address.split("@")[0],
    }),
    method: "POST",
  });
}

export async function listMessages(
  address: string,
  limit = 100
): Promise<AgentMailMessage[]> {
  const response = await request<{ messages: AgentMailMessage[] }>(
    `/inboxes/${encodeURIComponent(address)}/messages?limit=${limit}`
  );
  return response.messages ?? [];
}

export async function getMessage(
  address: string,
  messageId: string
): Promise<AgentMailMessage> {
  return await request<AgentMailMessage>(
    `/inboxes/${encodeURIComponent(address)}/messages/${encodeURIComponent(messageId)}`
  );
}

function requiredInbox(address: string) {
  const normalized = address.trim().toLowerCase();
  if (!/^drawflow-[a-z0-9]+(?:-[a-z0-9]+)*@agentmail\.to$/.test(normalized)) {
    throw new Error(
      "This QA helper only reads drawflow-*@agentmail.to inboxes."
    );
  }
  return normalized;
}

async function ensureAll() {
  const inboxes = [];
  for (const definition of ONBOARDING_QA_INBOXES) {
    inboxes.push(await ensureInbox(definition));
  }
  console.log(
    JSON.stringify(
      inboxes.map((inbox) => ({
        address: inbox.email,
        displayName: inbox.display_name,
        inboxId: inbox.inbox_id,
      })),
      null,
      2
    )
  );
}

async function printMessages(address: string) {
  const normalizedAddress = requiredInbox(address);
  const messages = await listMessages(normalizedAddress);
  const completeMessages = await Promise.all(
    messages.map((message) =>
      message.message_id
        ? getMessage(normalizedAddress, message.message_id)
        : message
    )
  );
  console.log(
    JSON.stringify(
      completeMessages.map((message) => ({
        createdAt: message.created_at,
        from: message.from,
        html: message.extracted_html ?? message.html ?? "",
        messageId: message.message_id,
        receivedAt: message.received_at,
        subject: message.subject,
        text: message.extracted_text ?? message.text ?? "",
        to: message.to,
      })),
      null,
      2
    )
  );
}

async function waitForMessage(address: string, subjectPattern: string) {
  const deadline = Date.now() + Number(Bun.env.QA_EMAIL_TIMEOUT_MS ?? 90_000);
  const pattern = new RegExp(subjectPattern, "i");
  const normalizedAddress = requiredInbox(address);
  while (Date.now() < deadline) {
    const messages = await listMessages(normalizedAddress);
    const match = messages.find((message) =>
      pattern.test(message.subject ?? "")
    );
    if (match) {
      const completeMessage = match.message_id
        ? await getMessage(normalizedAddress, match.message_id)
        : match;
      console.log(
        JSON.stringify(
          {
            address,
            message: {
              from: completeMessage.from,
              html:
                completeMessage.extracted_html ?? completeMessage.html ?? "",
              messageId: completeMessage.message_id,
              subject: completeMessage.subject,
              text: completeMessage.extracted_text ?? completeMessage.text ?? "",
              to: completeMessage.to,
            },
          },
          null,
          2
        )
      );
      return;
    }
    await Bun.sleep(2_000);
  }
  throw new Error(
    `No AgentMail message matching /${subjectPattern}/ arrived at ${address} before the timeout.`
  );
}

async function printMessage(address: string, messageId: string) {
  const normalizedAddress = requiredInbox(address);
  const message = await getMessage(normalizedAddress, messageId);
  console.log(
    JSON.stringify(
      {
        address: normalizedAddress,
        message: {
          from: message.from,
          html: message.extracted_html ?? message.html ?? "",
          messageId: message.message_id,
          receivedAt: message.received_at,
          subject: message.subject,
          text: message.extracted_text ?? message.text ?? "",
          to: message.to,
        },
      },
      null,
      2
    )
  );
}

if (import.meta.main) {
  const [command, address, subjectPattern] = Bun.argv.slice(2);
  if (command === "ensure") {
    await ensureAll();
  } else if (command === "list") {
    console.log(JSON.stringify(await listInboxes(), null, 2));
  } else if (command === "messages") {
    await printMessages(address ?? ONBOARDING_QA_INBOXES[0].address);
  } else if (command === "message") {
    if (!subjectPattern) {
      throw new Error(
        "Usage: bun scripts/qa/agentmail.ts message <drawflow-...@agentmail.to> <message-id>"
      );
    }
    await printMessage(
      address ?? ONBOARDING_QA_INBOXES[0].address,
      subjectPattern
    );
  } else if (command === "wait") {
    if (!subjectPattern) {
      throw new Error(
        "Usage: bun scripts/qa/agentmail.ts wait <drawflow-...@agentmail.to> <subject-regex>"
      );
    }
    await waitForMessage(
      address ?? ONBOARDING_QA_INBOXES[0].address,
      subjectPattern
    );
  } else {
    throw new Error(
      "Usage: bun scripts/qa/agentmail.ts <ensure|list|messages|message|wait> [address] [subject-regex-or-message-id]"
    );
  }
}
