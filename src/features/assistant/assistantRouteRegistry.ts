import { normalizeRoleSlugs, type RoleSlug } from "#/lib/auth/rbac.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";

export type AssistantWorkspace = "backoffice" | "builder" | "builder-staff";

export type AssistantRouteRegistryEntry = {
  id: string;
  label: string;
  pathTemplate: string;
  purpose: string;
  requiredParams: string[];
  roles: RoleSlug[];
  synonyms: string[];
  workspace: AssistantWorkspace;
};

export type AssistantRouteMatch = {
  entry: AssistantRouteRegistryEntry;
  params: Record<string, string>;
  to: string;
};

export const assistantRouteRegistry: AssistantRouteRegistryEntry[] = [
  {
    id: "backoffice.new-build",
    label: "New Build",
    pathTemplate: "/backoffice/proposals/new",
    purpose:
      "Start a lender-admin Build Proposal workflow that becomes a new Build after approval and closing.",
    requiredParams: [],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: [
      "create a new build",
      "new build",
      "start a build",
      "start new build workflow",
      "create build proposal",
      "new proposal",
    ],
    workspace: "backoffice",
  },
  {
    id: "builder.new-build",
    label: "New Build",
    pathTemplate: "/builder/proposals/new",
    purpose:
      "Start a builder Build Proposal package with site, budget, roadmap, documents, and draw planning.",
    requiredParams: [],
    roles: ["admin", "builder"],
    synonyms: [
      "create a new build",
      "new build",
      "start a build",
      "start build proposal",
      "create build proposal",
      "new proposal",
    ],
    workspace: "builder",
  },
  {
    id: "builder-staff.proposals",
    label: "Builder Staff Proposals",
    pathTemplate: "/builder-staff/proposals",
    purpose:
      "Review builder-staff accessible proposal work without starting a new borrower-owned proposal.",
    requiredParams: [],
    roles: ["admin", "builder-staff"],
    synonyms: ["proposal list", "builder staff proposals", "open proposals"],
    workspace: "builder-staff",
  },
  {
    id: "backoffice.proposals",
    label: "Backoffice Proposals",
    pathTemplate: "/backoffice/proposals",
    purpose: "Open lender proposal intake, review, assignment, and closing queues.",
    requiredParams: [],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["proposals", "proposal queue", "review proposals"],
    workspace: "backoffice",
  },
  {
    id: "backoffice.builds",
    label: "Backoffice Builds",
    pathTemplate: "/backoffice/builds",
    purpose: "Open the lender active-build roster and execution workspaces.",
    requiredParams: [],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["builds", "active builds", "build roster"],
    workspace: "backoffice",
  },
  {
    id: "backoffice.site-visits",
    label: "Site Visits",
    pathTemplate: "/backoffice/site-visits",
    purpose: "Open lender site visit scheduling and review operations.",
    requiredParams: [],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["site visits", "inspections", "visit queue"],
    workspace: "backoffice",
  },
  {
    id: "backoffice.draws",
    label: "Draws",
    pathTemplate: "/backoffice/draws",
    purpose: "Open lender draw request, approval, and release operations.",
    requiredParams: [],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["draws", "draw queue", "draw releases"],
    workspace: "backoffice",
  },
  {
    id: "builder.proposals",
    label: "Builder Proposals",
    pathTemplate: "/builder/proposals",
    purpose: "Open builder proposal status and Build Proposal authoring work.",
    requiredParams: [],
    roles: ["admin", "builder", "builder-staff"],
    synonyms: ["my proposals", "proposal list", "builder proposals"],
    workspace: "builder",
  },
  {
    id: "builder.build",
    label: "Builder Build Workspace",
    pathTemplate: "/builder/builds/:buildId",
    purpose:
      "Open a builder-facing active Build Workspace for roadmap, evidence, draw, and calendar context.",
    requiredParams: ["buildId"],
    roles: ["admin", "builder", "builder-staff"],
    synonyms: ["this build", "build workspace", "active build"],
    workspace: "builder",
  },
  {
    id: "backoffice.build",
    label: "Backoffice Build Workspace",
    pathTemplate: "/backoffice/builds/:buildId",
    purpose:
      "Open a lender active Build Workspace with operations, site visits, draws, and audit context.",
    requiredParams: ["buildId"],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["this build", "build workspace", "active build"],
    workspace: "backoffice",
  },
  {
    id: "builder.proposal",
    label: "Builder Proposal",
    pathTemplate: "/builder/proposals/:proposalId",
    purpose: "Open a builder Build Proposal package and its calendar/detail tabs.",
    requiredParams: ["proposalId"],
    roles: ["admin", "builder", "builder-staff"],
    synonyms: ["this proposal", "proposal detail", "build proposal"],
    workspace: "builder",
  },
  {
    id: "backoffice.proposal",
    label: "Backoffice Proposal",
    pathTemplate: "/backoffice/proposals/:proposalId",
    purpose: "Open lender Build Proposal review, calendar, and closing context.",
    requiredParams: ["proposalId"],
    roles: ["admin", "principle-broker", "broker", "broker-staff"],
    synonyms: ["this proposal", "proposal detail", "review this proposal"],
    workspace: "backoffice",
  },
];

export function reachableAssistantRoutes(
  context: DrawFlowAssistantRouteContext
): AssistantRouteRegistryEntry[] {
  const roles = normalizeRoleSlugs([context.role, ...context.roles]);
  return assistantRouteRegistry.filter((entry) =>
    entry.roles.some((role) => roles.includes(role))
  );
}

export function findAssistantRouteMatch(
  prompt: string,
  context: DrawFlowAssistantRouteContext
): AssistantRouteMatch | null {
  const normalized = normalizePrompt(prompt);
  const reachable = reachableAssistantRoutes(context);
  const preferredWorkspace = workspaceFromPath(context.pathname);
  const ranked = reachable
    .filter((entry) =>
      assistantRouteEntryMatchesPrompt(entry, normalized)
    )
    .sort((a, b) => workspaceScore(b, preferredWorkspace) - workspaceScore(a, preferredWorkspace));

  for (const entry of ranked) {
    const params = resolveRouteParams(entry, context);
    if (!params) {
      continue;
    }
    return {
      entry,
      params,
      to: interpolatePath(entry.pathTemplate, params),
    };
  }
  return null;
}

export function assistantRouteSitemapSummary(
  context: DrawFlowAssistantRouteContext
): string {
  return reachableAssistantRoutes(context)
    .map((entry) => `${entry.label}: ${entry.purpose} (${entry.pathTemplate})`)
    .join("\n");
}

function resolveRouteParams(
  entry: AssistantRouteRegistryEntry,
  context: DrawFlowAssistantRouteContext
) {
  const params: Record<string, string> = {};
  for (const param of entry.requiredParams) {
    const value =
      param === "proposalId"
        ? context.proposalId
        : param === "buildId"
          ? context.activeBuildId
          : undefined;
    if (!value) {
      return null;
    }
    params[param] = value;
  }
  return params;
}

function interpolatePath(pathTemplate: string, params: Record<string, string>) {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, value),
    pathTemplate
  );
}

function workspaceFromPath(pathname: string): AssistantWorkspace | null {
  if (pathname.startsWith("/backoffice")) {
    return "backoffice";
  }
  if (pathname.startsWith("/builder-staff")) {
    return "builder-staff";
  }
  if (pathname.startsWith("/builder")) {
    return "builder";
  }
  return null;
}

function workspaceScore(entry: AssistantRouteRegistryEntry, workspace: AssistantWorkspace | null) {
  return workspace && entry.workspace === workspace ? 1 : 0;
}

function assistantRouteEntryMatchesPrompt(
  entry: AssistantRouteRegistryEntry,
  normalizedPrompt: string
) {
  if (
    entry.synonyms.some((synonym) =>
      normalizedPrompt.includes(normalizePrompt(synonym))
    )
  ) {
    return true;
  }
  return entry.id.endsWith(".new-build") && hasNewBuildCreationIntent(normalizedPrompt);
}

function hasNewBuildCreationIntent(normalizedPrompt: string) {
  const tokens = new Set(
    normalizedPrompt
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );
  const hasBuildTarget =
    tokens.has("build") ||
    tokens.has("proposal") ||
    normalizedPrompt.includes("build proposal");
  if (!hasBuildTarget) {
    return false;
  }
  const hasCreationVerb = [
    "begin",
    "create",
    "launch",
    "new",
    "start",
    "wanted",
    "want",
  ].some((token) => tokens.has(token));
  if (!hasCreationVerb) {
    return false;
  }
  return !(
    normalizedPrompt.includes("active builds") ||
    normalizedPrompt.includes("build roster") ||
    normalizedPrompt.includes("build workspace") ||
    normalizedPrompt.includes("this build")
  );
}

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
