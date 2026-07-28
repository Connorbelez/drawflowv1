export type AssistantProvider = "openai" | "openrouter";

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export function resolveAssistantModel(
  provider: AssistantProvider,
  configuredModel?: string
) {
  const model = configuredModel?.trim() || DEFAULT_OPENAI_MODEL;
  if (provider === "openrouter" && !model.includes("/")) {
    return `openai/${model}`;
  }
  return model;
}
