import type OpenAI from "openai";

import type { AssistantProvider } from "./assistantProvider";

export interface SiteVisitGuidanceInput {
  build: { location?: string; name: string };
  currentGuidance: {
    cameraAngles: string;
    whatToVerify: string;
  };
  milestone: { key: string; name: string };
  submilestones: Array<{ key: string; name: string }>;
}

export function fallbackSiteVisitGuidance(input: SiteVisitGuidanceInput) {
  const scopeNames = input.submilestones.map((item) => item.name);
  const scopeLabel =
    scopeNames.length > 0 ? scopeNames.join(", ") : input.milestone.name;
  const location = input.build.location?.trim();
  return {
    cameraAngles: assistantGuidanceHtml([
      `Wide context view showing the ${input.milestone.name} work within the build site.`,
      `Detail views of visible completion and workmanship for ${scopeLabel}.`,
      `Reference view tying the inspected area to ${location || input.build.name}.`,
    ]),
    whatToVerify: assistantGuidanceHtml([
      `Verify the visible ${input.milestone.name} scope is complete for reimbursement review.`,
      `Check the in-scope work: ${scopeLabel}.`,
      "Record incomplete work, visible defects, access limitations, and other exceptions.",
    ]),
  };
}

export async function draftSiteVisitGuidance({
  client,
  input,
  model,
  provider,
}: {
  client: Pick<OpenAI, "chat">;
  input: SiteVisitGuidanceInput;
  model: string;
  provider: AssistantProvider;
}) {
  const fallback = fallbackSiteVisitGuidance(input);
  try {
    const response = await client.chat.completions.create({
      messages: [
        {
          content:
            "You are DrawFlow's construction field-review assistant. Draft practical inspection instructions for a low-friction evidence visit. Return strict JSON only with two string-array properties: whatToVerify and cameraAngles. Write 3-6 concise, observable bullets per property. Never infer code compliance, certify work, or add scope outside the supplied milestone and submilestones.",
          role: "system",
        },
        {
          content: JSON.stringify({
            build: input.build,
            currentGuidance: input.currentGuidance,
            milestone: input.milestone,
            submilestones: input.submilestones,
          }),
          role: "user",
        },
      ],
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const parsed = parseSiteVisitGuidanceDraft(
      response.choices[0]?.message.content
    );
    return parsed
      ? { ...parsed, source: provider }
      : { ...fallback, source: "fallback" as const };
  } catch (error) {
    console.warn(
      `[assistant] ${provider} site-visit guidance request failed (${providerErrorStatus(error)}); using deterministic fallback.`
    );
    return { ...fallback, source: "fallback" as const };
  }
}

function providerErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return "unknown status";
}

function parseSiteVisitGuidanceDraft(content: string | null | undefined) {
  if (!content) {
    return null;
  }
  try {
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const whatToVerify = assistantGuidanceLines(parsed?.whatToVerify);
    const cameraAngles = assistantGuidanceLines(parsed?.cameraAngles);
    if (!(whatToVerify.length && cameraAngles.length)) {
      return null;
    }
    return {
      cameraAngles: assistantGuidanceHtml(cameraAngles),
      whatToVerify: assistantGuidanceHtml(whatToVerify),
    };
  } catch {
    return null;
  }
}

function assistantGuidanceLines(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function assistantGuidanceHtml(lines: string[]) {
  return `<ul>${lines
    .map(
      (line) =>
        `<li>${line
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")}</li>`
    )
    .join("")}</ul>`;
}
