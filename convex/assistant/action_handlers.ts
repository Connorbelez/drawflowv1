import OpenAI from "openai";

import type { AuthorizedViewer } from "../authz";
import {
  resolveAssistantModel,
  type AssistantProvider,
} from "../assistantProvider";
import type { ActionCtx, Id } from "../types";
import { optionalString, sanitizeForPersistence } from "./inputs";
import { fallbackAssistantPlannerResponse } from "./planning";
import {
  draftSiteVisitGuidance,
  fallbackSiteVisitGuidance,
} from "../siteVisitGuidance";
import { normalizePlannerRecord, parsePlannerJson } from "./shared";

type AuthenticatedActionCtx = ActionCtx & { viewer: AuthorizedViewer };

export async function getProviderStatusHandler(
  _ctx: AuthenticatedActionCtx,
  _args: Record<string, never>
) {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const provider: "openai" | "openrouter" | "unconfigured" = openaiConfigured
    ? "openai"
    : openrouterConfigured
      ? "openrouter"
      : "unconfigured";
  return {
    defaultModel:
      provider === "unconfigured"
        ? (process.env.DRAWFLOW_ASSISTANT_MODEL ?? "gpt-4.1-mini")
        : resolveAssistantModel(provider, process.env.DRAWFLOW_ASSISTANT_MODEL),
    openaiConfigured,
    openrouterConfigured,
    provider,
    readOnly: !(openaiConfigured || openrouterConfigured),
  };
}

export async function generateSiteVisitGuidanceHandler(
  ctx: AuthenticatedActionCtx,
  args: {
    build: { location?: string; name: string };
    currentGuidance: { cameraAngles: string; whatToVerify: string };
    milestone: { key: string; name: string };
    submilestones: Array<{ key: string; name: string }>;
    workosOrganizationId: string;
  }
) {
  if (ctx.viewer.organizationId !== args.workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const fallback = fallbackSiteVisitGuidance(args);
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const provider = openaiKey ? "openai" : openrouterKey ? "openrouter" : null;
  const apiKey = openaiKey ?? openrouterKey;
  if (!(provider && apiKey)) {
    return { ...fallback, source: "fallback" as const };
  }
  const client = new OpenAI({
    apiKey,
    ...(provider === "openrouter"
      ? { baseURL: "https://openrouter.ai/api/v1" }
      : {}),
  });
  return await draftSiteVisitGuidance({
    client,
    input: args,
    model: resolveAssistantModel(
      provider,
      process.env.DRAWFLOW_ASSISTANT_MODEL
    ),
    provider,
  });
}

export async function runAssistantTurnHandler(
  ctx: AuthenticatedActionCtx,
  args: {
    prompt: string;
    routeContext: unknown;
    threadId?: Id<"assistantThreads">;
    workosOrganizationId: string;
  }
) {
  if (ctx.viewer.organizationId !== args.workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const provider: "openai" | "openrouter" = openaiKey ? "openai" : "openrouter";
  const apiKey = openaiKey ?? openrouterKey;
  if (!apiKey) {
    throw new Error("DrawFlow assistant model provider is not configured.");
  }
  const model = resolveAssistantModel(
    provider,
    process.env.DRAWFLOW_ASSISTANT_MODEL
  );
  const client = new OpenAI({
    apiKey,
    ...(provider === "openrouter"
      ? { baseURL: "https://openrouter.ai/api/v1" }
      : {}),
  });
  const response = await client.chat.completions
    .create({
      messages: [
        {
          content:
            "You are the DrawFlow in-product assistant. Do not reveal raw chain-of-thought. Use only the closed DrawFlow action catalog for mutations, and tell the user that data-changing actions require HITL preview and confirmation.",
          role: "system",
        },
        {
          content: `Route context:\n${JSON.stringify(sanitizeForPersistence(args.routeContext))}\n\nUser request:\n${args.prompt}`,
          role: "user",
        },
      ],
      model,
      temperature: 0.2,
    })
    .catch(() => {
      console.warn(
        `[assistant] ${provider} response request failed; returning fail-soft guidance.`
      );
      return null;
    });
  return {
    model,
    provider,
    text:
      response?.choices[0]?.message.content ??
      "The model provider is temporarily unavailable. I can still help with DrawFlow context, navigation, generated forms, and human-reviewed action previews.",
  };
}

export async function planAssistantTurnHandler(
  ctx: AuthenticatedActionCtx,
  args: {
    assistantContext: unknown;
    prompt: string;
    routeContext: unknown;
    siteMap: unknown;
    threadId?: Id<"assistantThreads">;
    workosOrganizationId: string;
  }
) {
  if (ctx.viewer.organizationId !== args.workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const provider: AssistantProvider | null = openaiKey
    ? "openai"
    : openrouterKey
      ? "openrouter"
      : null;
  const apiKey = openaiKey ?? openrouterKey;
  if (!(provider && apiKey)) {
    return {
      source: "fallback",
      ...fallbackAssistantPlannerResponse({
        assistantContext: args.assistantContext,
        prompt: args.prompt,
        routeContext: args.routeContext,
        siteMap: args.siteMap,
      }),
    };
  }
  const model = resolveAssistantModel(
    provider,
    process.env.DRAWFLOW_ASSISTANT_MODEL
  );
  const client = new OpenAI({
    apiKey,
    ...(provider === "openrouter"
      ? { baseURL: "https://openrouter.ai/api/v1" }
      : {}),
  });
  const fallback = fallbackAssistantPlannerResponse({
    assistantContext: args.assistantContext,
    prompt: args.prompt,
    routeContext: args.routeContext,
    siteMap: args.siteMap,
  });
  const response = await client.chat.completions
    .create({
      messages: [
        {
          content:
            "You are the DrawFlow in-product AI operations assistant. Return compact JSON only. You may answer, brief, ask clarifying questions, propose navigation, or prepare HITL actions. Never claim a data-changing action was completed. Use internal DrawFlow context only. If missing details block a safe action, ask concise questions or request a generated form. Do not navigate for a briefing unless the user explicitly asks to open a page. Known-choice inputs must use generated controls, not passive numbered questions. Queue, proposal-review, and risk prompts must include reviewTable UI with action rows. The record_proposal_closing and update_active_build_details actions require a valid IANA timezone in ianaTimezone.",
          role: "system",
        },
        {
          content: JSON.stringify({
            allowedResponseShape: {
              actions:
                "Array of closed-catalog actions to preview; empty if not certain.",
              navigation:
                "Optional {to,label,reason,routeId} from the permitted site map.",
              text: "Short assistant response.",
              uiParts:
                "Array of generated UI parts: briefing, questionnaire, structuredForm, reviewTable.",
            },
            assistantContext: sanitizeForPersistence(args.assistantContext),
            fallbackIntentHint: fallback.intent,
            routeContext: sanitizeForPersistence(args.routeContext),
            siteMap: sanitizeForPersistence(args.siteMap),
            userRequest: args.prompt,
          }),
          role: "user",
        },
      ],
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
    })
    .catch(() => {
      console.warn(
        `[assistant] ${provider} planner request failed; using deterministic fallback.`
      );
      return null;
    });
  if (!response) {
    return { source: "fallback", ...fallback };
  }
  const content = response.choices[0]?.message.content ?? "{}";
  const parsed = parsePlannerJson(content);
  const parsedNavigation = normalizePlannerRecord(parsed.navigation);
  const parsedUiParts = Array.isArray(parsed.uiParts) ? parsed.uiParts : [];
  const deterministicIntent = [
    "briefing",
    "contractor_lookup",
    "content_form",
    "draw_queue",
    "proposal_review_queue",
    "risk_build_queue",
    "site_visit_queue",
  ].includes(String(fallback.intent));
  return {
    actions: deterministicIntent
      ? (fallback.actions ?? [])
      : Array.isArray(parsed.actions)
        ? parsed.actions
        : [],
    intent: deterministicIntent
      ? fallback.intent
      : (optionalString(parsed.intent) ?? fallback.intent),
    model,
    navigation: deterministicIntent
      ? (fallback.navigation ?? null)
      : Object.keys(parsedNavigation).length > 0
        ? parsedNavigation
        : null,
    provider,
    source: "model",
    text: deterministicIntent
      ? fallback.text
      : (optionalString(parsed.text) ??
        fallback.text ??
        "I can help plan this, but I need one more detail."),
    uiParts: deterministicIntent
      ? (fallback.uiParts ?? [])
      : parsedUiParts.length > 0
        ? parsedUiParts
        : [],
  };
}
