import { formatCents, normalizePlannerRecord } from "./shared";
import { optionalString } from "./inputs";

export type WorkflowStepPatch = {
  error?: string;
  result?: unknown;
  status: string;
  stepId: string;
};

export function normalizeWorkflowSteps(steps: unknown[]) {
  return steps
    .map((step, index) => {
      const row = normalizePlannerRecord(step);
      return {
        ...row,
        id:
          typeof row.id === "string" && row.id
            ? row.id
            : `assistant-step-${index + 1}`,
        kind: typeof row.kind === "string" && row.kind ? row.kind : "answer",
        label:
          typeof row.label === "string" && row.label
            ? row.label
            : `Assistant step ${index + 1}`,
        status: isWorkflowStepStatus(row.status) ? row.status : "pending",
      };
    })
    .slice(0, 40);
}

export function updateWorkflowStepList(
  steps: unknown[],
  patch: WorkflowStepPatch
) {
  return normalizeWorkflowSteps(steps).map((step) =>
    step.id === patch.stepId
      ? {
          ...step,
          ...(patch.error === undefined ? {} : { error: patch.error }),
          ...(patch.result === undefined ? {} : { result: patch.result }),
          status: patch.status,
        }
      : step
  );
}

export function firstOpenWorkflowStepId(steps: unknown[]) {
  const next = normalizeWorkflowSteps(steps).find((step) =>
    ["pending", "running", "needs_input"].includes(String(step.status))
  );
  return typeof next?.id === "string" ? next.id : undefined;
}

export function workflowRunStatusFromSteps(
  steps: unknown[],
  latestStatus: string
) {
  const normalized = normalizeWorkflowSteps(steps);
  if (latestStatus === "failed") {
    return "failed";
  }
  if (normalized.some((step) => step.status === "needs_input")) {
    return "needs_input";
  }
  if (
    normalized.length > 0 &&
    normalized.every((step) =>
      ["succeeded", "skipped"].includes(String(step.status))
    )
  ) {
    return "succeeded";
  }
  return "running";
}

export function isWorkflowStepStatus(value: unknown) {
  return (
    value === "pending" ||
    value === "running" ||
    value === "needs_input" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "skipped"
  );
}

export function fallbackAssistantPlannerResponse(input: {
  assistantContext: unknown;
  prompt: string;
  routeContext: unknown;
  siteMap: unknown;
}) {
  const prompt = input.prompt.toLowerCase();
  const context = normalizePlannerRecord(input.assistantContext);
  if (hasDrawQueueIntent(prompt)) {
    const drawQueue = normalizePlannerRecord(
      normalizePlannerRecord(context.queues).drawQueue
    );
    const summary = normalizePlannerRecord(drawQueue.summary);
    const rows = Array.isArray(drawQueue.rows) ? drawQueue.rows : [];
    return {
      actions: [],
      intent: "draw_queue",
      navigation: {
        label: "Draw queue",
        reason: "Review reimbursement draw status and next actions.",
        routeId: "backoffice.draws",
        to: "/backoffice/draws",
      },
      text:
        `Draw queue summary: ${Number(summary.requested ?? 0)} requested, ${Number(summary.approved ?? 0)} approved, ${Number(summary.planned ?? 0)} planned, ${Number(summary.released ?? 0)} released. ` +
        nextBestActionText(rows, "Open the highest-priority draw row."),
      uiParts: [
        {
          columns: ["Build", "Draw", "Status", "Amount", "Next action"],
          rows: rows
            .slice(0, 12)
            .map((row) => drawQueueUiRow(normalizePlannerRecord(row))),
          title: "Draw queue next actions",
          type: "reviewTable",
        },
      ],
    };
  }
  if (hasSiteVisitQueueIntent(prompt)) {
    const siteVisitQueue = normalizePlannerRecord(
      normalizePlannerRecord(context.queues).siteVisitQueue
    );
    const summary = normalizePlannerRecord(siteVisitQueue.summary);
    const rows = Array.isArray(siteVisitQueue.rows) ? siteVisitQueue.rows : [];
    return {
      actions: [],
      intent: "site_visit_queue",
      navigation: {
        label: "Site visit queue",
        reason:
          "Review expired, geofence-flagged, and report-ready site visits.",
        routeId: "backoffice.site-visits",
        to: "/backoffice/site-visits",
      },
      text:
        `Site visit queue summary: ${Number(summary.expired ?? 0)} expired, ${Number(summary.requested ?? 0)} requested, ${Number(summary.geofenceFlagged ?? 0)} geofence-flagged, ${Number(summary.complete ?? 0)} complete. ` +
        nextBestActionText(rows, "Open the top ranked site visit."),
      uiParts: [
        {
          columns: ["Build", "Milestone", "Status", "Flags", "Next action"],
          rows: rows
            .slice(0, 12)
            .map((row) => siteVisitQueueUiRow(normalizePlannerRecord(row))),
          title: "Site visit queue ranking",
          type: "reviewTable",
        },
      ],
    };
  }
  if (hasProposalReviewIntent(prompt)) {
    const proposalQueue = normalizePlannerRecord(
      normalizePlannerRecord(context.queues).proposalReviewQueue
    );
    const rows = Array.isArray(proposalQueue.rows) ? proposalQueue.rows : [];
    const top = normalizePlannerRecord(rows[0]);
    return {
      actions: [],
      intent: "proposal_review_queue",
      navigation: top.href
        ? {
            label: "Submitted proposal review",
            reason:
              "Open the oldest submitted Build Proposal and continue with the review checklist.",
            routeId: "backoffice.proposal.review",
            to: String(top.href),
          }
        : {
            label: "Proposal review queue",
            reason: "Review submitted Build Proposals.",
            routeId: "backoffice.proposals",
            to: "/backoffice/proposals",
          },
      text:
        rows.length > 0
          ? `I selected ${String(top.buildName ?? "the oldest submitted proposal")} first because it has been waiting longest. Review checklist: confirm borrower working capital, lender draw policy limit, milestone dependencies, budget evidence, permits, and reimbursement-only draw feasibility.`
          : "There are no submitted Build Proposals waiting for review.",
      uiParts: [
        {
          columns: ["Proposal", "Location", "Budget", "Review checklist"],
          rows: rows
            .slice(0, 12)
            .map((row) => proposalReviewUiRow(normalizePlannerRecord(row))),
          title: "Submitted proposal review order",
          type: "reviewTable",
        },
      ],
    };
  }
  if (hasRiskBuildIntent(prompt)) {
    const riskQueue = normalizePlannerRecord(
      normalizePlannerRecord(context.queues).riskBuildQueue
    );
    const rows = Array.isArray(riskQueue.rows) ? riskQueue.rows : [];
    const top = normalizePlannerRecord(rows[0]);
    return {
      actions: [],
      intent: "risk_build_queue",
      navigation: top.href
        ? {
            label: "Highest-risk build",
            reason: "Open the highest ranked active Build for lender triage.",
            routeId: "backoffice.build.risk",
            to: String(top.href),
          }
        : {
            label: "Active builds",
            reason: "Review active Build risk.",
            routeId: "backoffice.builds",
            to: "/backoffice/builds",
          },
      text:
        rows.length > 0
          ? `Highest-risk build: ${String(top.buildName ?? "active build")} with score ${Number(top.score ?? 0)}. First action: ${riskBuildNextAction(top)}.`
          : "No active Build currently has risk signals in the assistant context.",
      uiParts: [
        {
          columns: [
            "Build",
            "Score",
            "Overdue",
            "Claims",
            "Draws",
            "Visits",
            "Next action",
          ],
          rows: rows
            .slice(0, 12)
            .map((row) => riskBuildUiRow(normalizePlannerRecord(row))),
          title: "Highest-risk active builds",
          type: "reviewTable",
        },
      ],
    };
  }
  if (hasBriefingIntent(prompt)) {
    const briefing = normalizePlannerRecord(context.operationalBriefing);
    return {
      actions: [],
      intent: "briefing",
      navigation: null,
      text: "Here is the current operational briefing. I checked live workflow state, not just notifications.",
      uiParts: [
        {
          sections: Array.isArray(briefing.sections) ? briefing.sections : [],
          summary: briefing.summary ?? {},
          title: "Operational briefing",
          type: "briefing",
        },
      ],
    };
  }
  if (hasReminderIntent(prompt)) {
    return {
      actions: [],
      intent: "reminder",
      navigation: null,
      text: "I can prepare that reminder. Choose the Build Proposal or live Build it belongs to, then I will draft the HITL calendar action.",
      uiParts: [
        {
          emptyText: "No Build Proposal or live Build matches that search.",
          selectorKind: "reminderTarget",
          title: "Choose reminder target",
          type: "selector",
        },
      ],
    };
  }
  if (hasContentFillIntent(prompt)) {
    const target = normalizePlannerRecord(context.target);
    const route = normalizePlannerRecord(context.route);
    const targetKind =
      target.kind === "activeBuild" || route.activeBuildId
        ? "activeBuild"
        : target.kind === "proposal" || route.proposalId
          ? "proposal"
          : null;
    if (!targetKind) {
      return {
        actions: [],
        intent: "content_interview",
        navigation: null,
        text: "I can help fill this out, but I need to know which Build Proposal or live Build to use first.",
        uiParts: [
          {
            questions: [
              "Which Build Proposal or live Build should I use?",
              "Which milestone or section are we filling?",
              "Are these materials, equipment, or contractor scope items?",
            ],
            title: "Build content interview",
            type: "questionnaire",
          },
        ],
      };
    }
    const materialDraft = extractCostItemDraftFromPrompt(
      input.prompt,
      normalizePlannerRecord(target),
      route,
      targetKind
    );
    return {
      actions: [],
      intent: "content_form",
      navigation: null,
      text: "I drafted the material entry from the prompt. Review the structured fields, correct anything off, then prepare the confirmable HITL action batch.",
      uiParts: [
        {
          defaults: materialDraft.defaults,
          fields: [
            "milestoneKey",
            "title",
            "itemType",
            "quantity",
            "unit",
            "costCents",
            "supplier",
            "description",
          ],
          formKind: "costItem",
          milestoneOptions: milestoneOptions(normalizePlannerRecord(target)),
          target: {
            buildId: route.activeBuildId ?? target.buildId,
            kind: targetKind,
            proposalId: route.proposalId ?? target.proposalId,
          },
          title:
            targetKind === "activeBuild"
              ? "Draft live-build material item"
              : "Draft proposal material item",
          type: "structuredForm",
        },
      ],
    };
  }
  if (hasContractorIntent(prompt)) {
    const contractors = Array.isArray(context.contractors)
      ? context.contractors
      : [];
    const ranked = rankPlannerContractors(contractors, prompt).slice(0, 8);
    return {
      actions: [],
      intent: "contractor_lookup",
      navigation: null,
      text:
        ranked.length > 0
          ? "I found internal DrawFlow contractor candidates and ranked them by trade, location, and readiness. Use the action row to review assignment next steps."
          : "I checked the internal contractor roster and did not find a strong match.",
      uiParts: [
        {
          columns: [
            "Candidate",
            "Confidence",
            "Trade match",
            "Location",
            "Availability",
            "Next step",
          ],
          rows: ranked.map((rankedContractor) =>
            contractorUiRow(
              normalizePlannerRecord(rankedContractor.contractor),
              rankedContractor,
              targetAssignmentHref(context)
            )
          ),
          title: "Contractor matches",
          type: "reviewTable",
        },
      ],
    };
  }
  const navigation = fallbackNavigation(input.siteMap, prompt);
  if (navigation) {
    return {
      actions: [],
      intent: "navigation",
      navigation,
      text: `I can take you to ${navigation.label}: ${navigation.reason}`,
      uiParts: [
        {
          label: navigation.label,
          reason: navigation.reason,
          to: navigation.to,
          type: "navigation",
        },
      ],
    };
  }
  return {
    actions: [],
    intent: "clarify_or_answer",
    navigation: null,
    text: "I can help plan that. Tell me the target build/proposal and the outcome you want, or ask for a briefing, contractor match, materials form, reminder, or navigation.",
    uiParts: [
      {
        questions: [
          "Which build or proposal should I use?",
          "What should change or what decision are you trying to make?",
          "Should I draft a form, prepare a HITL action batch, or just brief you?",
        ],
        title: "Clarify the task",
        type: "questionnaire",
      },
    ],
  };
}

export function hasBriefingIntent(prompt: string) {
  return (
    prompt.includes("briefing") ||
    prompt.includes("tasks for today") ||
    prompt.includes("what are my tasks") ||
    prompt.includes("what do i need to do") ||
    prompt.includes("what needs my attention")
  );
}

export function hasContractorIntent(prompt: string) {
  return (
    prompt.includes("contractor") ||
    prompt.includes("trade") ||
    prompt.includes("who can") ||
    prompt.includes("stucco") ||
    prompt.includes("exterior") ||
    prompt.includes("envelope") ||
    prompt.includes("finish") ||
    prompt.includes("masonry") ||
    prompt.includes("framer") ||
    prompt.includes("electrician") ||
    prompt.includes("plumber")
  );
}

export function hasContentFillIntent(prompt: string) {
  return (
    prompt.includes("fill out") ||
    prompt.includes("fill in") ||
    prompt.includes("help me fill") ||
    prompt.includes("materials") ||
    prompt.includes("material") ||
    prompt.includes("content for")
  );
}

export function hasReminderIntent(prompt: string) {
  return (
    prompt.includes("reminder") ||
    prompt.includes("remind me") ||
    prompt.includes("calendar reminder")
  );
}

export function hasDrawQueueIntent(prompt: string) {
  return (
    prompt.includes("draw queue") ||
    prompt.includes("draws need") ||
    prompt.includes("draw requests") ||
    prompt.includes("draws should") ||
    prompt.includes("draws are waiting")
  );
}

export function hasSiteVisitQueueIntent(prompt: string) {
  return (
    prompt.includes("site visit queue") ||
    prompt.includes("site visits") ||
    prompt.includes("inspection queue") ||
    prompt.includes("inspections")
  );
}

export function hasProposalReviewIntent(prompt: string) {
  return (
    prompt.includes("submitted proposal") ||
    prompt.includes("proposal review") ||
    prompt.includes("proposal needs review") ||
    prompt.includes("proposal should i review")
  );
}

export function hasRiskBuildIntent(prompt: string) {
  return (
    prompt.includes("highest risk") ||
    prompt.includes("highest-risk") ||
    prompt.includes("most at risk") ||
    prompt.includes("at-risk") ||
    prompt.includes("behind schedule") ||
    prompt.includes("risk build")
  );
}

export type RankedPlannerContractor = {
  availability: string;
  confidence: string;
  contractor: unknown;
  score: number;
  tradeMatch: string;
};

export function rankPlannerContractors(
  contractors: unknown[],
  prompt: string
): RankedPlannerContractor[] {
  const terms = prompt
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length > 2 &&
        !["who", "can", "for", "the", "and", "with", "need"].includes(term)
    );
  return contractors
    .map((contractor) => {
      const row = normalizePlannerRecord(contractor);
      const trades = Array.isArray(row.trades)
        ? row.trades.map((trade) => String(trade))
        : [];
      const haystack = [
        row.name,
        row.city,
        row.serviceAreaPrimaryCity,
        ...trades,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const directHits = terms.filter((term) => haystack.includes(term)).length;
      const adjacentHits = contractorAdjacentTradeScore(prompt, trades);
      const readiness =
        row.onboardingStatus === "account_linked" ||
        row.status === "active" ||
        row.onboardingStatus === "active"
          ? 1
          : 0;
      const score = directHits * 4 + adjacentHits * 2 + readiness;
      const confidence =
        directHits > 0
          ? score >= 7
            ? "High"
            : "Medium"
          : adjacentHits > 0
            ? "Adjacent"
            : "Low";
      return {
        availability:
          row.onboardingStatus === "account_linked"
            ? "Account linked"
            : String(row.onboardingStatus ?? row.status ?? "Profile only"),
        confidence,
        contractor,
        score,
        tradeMatch:
          directHits > 0
            ? "Direct"
            : adjacentHits > 0
              ? "Adjacent envelope/exterior"
              : "General roster",
      } satisfies RankedPlannerContractor;
    })
    .filter((row) => row.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score);
}

export function contractorAdjacentTradeScore(prompt: string, trades: string[]) {
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedTrades = trades.join(" ").toLowerCase();
  if (
    /(stucco|siding|exterior|envelope|masonry|cladding|finish)/.test(
      normalizedPrompt
    )
  ) {
    return [
      "stucco",
      "siding",
      "exterior",
      "envelope",
      "masonry",
      "cladding",
      "concrete",
      "foundation",
      "framing",
      "roof",
    ].filter((term) => normalizedTrades.includes(term)).length;
  }
  return 0;
}

export function contractorUiRow(
  contractor: Record<string, any>,
  ranked: RankedPlannerContractor,
  href: string
) {
  const name = String(contractor.name ?? "Unknown contractor");
  const trades = Array.isArray(contractor.trades)
    ? contractor.trades.join(", ")
    : "Trade not set";
  const location = String(
    contractor.serviceAreaPrimaryCity ?? contractor.city ?? "Location not set"
  );
  return {
    actions: [
      {
        kind: "contractorAssignment",
        label: "Review assignment",
        reason: `Review whether ${name} should be assigned to the visible milestone or scope.`,
        to: href,
      },
    ],
    id: String(contractor.contractorId ?? contractor.id ?? name),
    values: [
      name,
      ranked.confidence,
      `${ranked.tradeMatch}: ${trades}`,
      location,
      ranked.availability,
      "Review assignment scope, rate, and milestone fit",
    ],
  };
}

export function targetAssignmentHref(context: Record<string, any>) {
  const route = normalizePlannerRecord(context.route);
  const viewer = normalizePlannerRecord(context.viewer);
  const workspace = viewer.workspace === "builder" ? "builder" : "backoffice";
  if (route.activeBuildId) {
    return `/${workspace}/builds/${String(route.activeBuildId)}`;
  }
  if (route.proposalId) {
    return `/${workspace}/proposals/${String(route.proposalId)}`;
  }
  return "/backoffice/contractors";
}

export function nextBestActionText(rows: unknown[], fallback: string) {
  const top = normalizePlannerRecord(rows[0]);
  return top.actionLabel
    ? `Next best action: ${String(top.actionLabel)} for ${String(top.buildName ?? top.label ?? top.id)}.`
    : fallback;
}

export function drawQueueUiRow(row: Record<string, any>) {
  return {
    actions: row.href
      ? [
          {
            kind: "drawQueueAction",
            label: String(row.actionLabel ?? "Open draw"),
            reason: `Open ${String(row.label ?? "draw")} on ${String(row.buildName ?? "build")}.`,
            to: String(row.href),
          },
        ]
      : [],
    id: String(row.id ?? row.drawKey ?? row.label),
    values: [
      row.buildName ?? "Unknown build",
      row.label ?? row.drawKey ?? "Draw",
      row.status ?? "unknown",
      typeof row.amountCents === "number" ? formatCents(row.amountCents) : "",
      row.actionLabel ?? "Open draw",
    ],
  };
}

export function siteVisitQueueUiRow(row: Record<string, any>) {
  const flags = [
    row.expired ? "expired" : null,
    row.geofenceFlagged ? "geofence flagged" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    actions: row.href
      ? [
          {
            kind: "siteVisitQueueAction",
            label: String(row.actionLabel ?? "Open visit"),
            reason: `Open site visit ${String(row.visitId ?? row.id)} on ${String(row.buildName ?? "build")}.`,
            to: String(row.href),
          },
        ]
      : [],
    id: String(row.id ?? row.visitId ?? row.milestoneKey),
    values: [
      row.buildName ?? "Unknown build",
      row.milestoneKey ?? "Milestone",
      row.status ?? "unknown",
      flags || "none",
      row.actionLabel ?? "Open visit",
    ],
  };
}

export function proposalReviewUiRow(row: Record<string, any>) {
  return {
    actions: row.href
      ? [
          {
            kind: "proposalReviewAction",
            label: String(row.actionLabel ?? "Open review"),
            reason: "Open the submitted Build Proposal review checklist.",
            to: String(row.href),
          },
        ]
      : [],
    id: String(row.id ?? row.buildName),
    values: [
      row.buildName ?? "Build Proposal",
      row.location ?? "Location not set",
      typeof row.proposedBudget === "number"
        ? formatCents(row.proposedBudget)
        : "Budget not set",
      "Capital, policy, dependencies, permits, evidence, draw feasibility",
    ],
  };
}

export function riskBuildUiRow(row: Record<string, any>) {
  const nextAction = riskBuildNextAction(row);
  return {
    actions: row.href
      ? [
          {
            kind: "riskBuildAction",
            label: String(row.actionLabel ?? "Open build review"),
            reason: nextAction,
            to: String(row.href),
          },
        ]
      : [],
    id: String(row.id ?? row.buildName),
    values: [
      row.buildName ?? "Active Build",
      row.score ?? 0,
      row.overdueMilestones ?? 0,
      row.claimedMilestones ?? 0,
      row.requestedDraws ?? 0,
      row.expiredVisits ?? 0,
      nextAction,
    ],
  };
}

export function riskBuildNextAction(row: Record<string, any>) {
  if (Number(row.claimedMilestones ?? 0) > 0) {
    return "Review the first pending milestone completion claim";
  }
  if (Number(row.requestedDraws ?? 0) > 0) {
    return "Review the requested reimbursement draw";
  }
  if (Number(row.expiredVisits ?? 0) > 0) {
    return "Review or reschedule the top expired site visit";
  }
  if (Number(row.overdueMilestones ?? 0) > 0) {
    return "Open the overdue milestone controls";
  }
  return "Open the active Build review controls";
}

export function extractCostItemDraftFromPrompt(
  rawPrompt: string,
  target: Record<string, any>,
  route: Record<string, any>,
  targetKind: "activeBuild" | "proposal"
) {
  const prompt = rawPrompt.toLowerCase();
  const quantity = extractMaterialQuantity(rawPrompt);
  const unitPriceCents = extractUnitPriceCents(rawPrompt);
  const title = inferCostItemTitle(prompt);
  const unit = quantity.unit;
  const milestoneKey =
    inferMilestoneKeyFromPrompt(prompt, target, route) ??
    route.selectedMilestoneKey ??
    firstMilestoneKey(target);
  const itemType = prompt.includes("equipment") ? "equipment" : "material";
  const supplier = prompt.includes("supplier")
    ? "Unspecified supplier"
    : undefined;
  const quantityText = quantity.value
    ? `${quantity.value}${unit ? ` ${unit}` : ""}`
    : "Material quantity";
  const priceText = unitPriceCents
    ? `${formatCents(unitPriceCents)}${unit ? ` per ${singularizeUnit(unit)}` : ""}`
    : "unit price not supplied";
  return {
    defaults: {
      costCents: unitPriceCents,
      description: `${quantityText} ${title.toLowerCase()} at ${priceText}.`,
      itemType,
      milestoneKey,
      quantity: quantity.value ?? 1,
      supplier,
      title,
      unit,
    },
    targetKind,
  };
}

export function extractMaterialQuantity(prompt: string) {
  const match =
    /\b(?<quantity>\d+(?:\.\d+)?)\s*(?<unit>bags?|sacks?|boxes?|pieces?|pcs|sheets?|rolls?|yards?|yds?|tons?|loads?|units?)\b/i.exec(
      prompt
    );
  if (!match?.groups?.quantity) {
    return { unit: undefined, value: undefined };
  }
  return {
    unit: normalizeMaterialUnit(match.groups.unit),
    value: Number(match.groups.quantity),
  };
}

export function extractUnitPriceCents(prompt: string) {
  const match = /\$(?<dollars>\d+(?:\.\d{1,2})?)/.exec(prompt);
  if (!match?.groups?.dollars) {
    return;
  }
  return Math.max(1, Math.round(Number(match.groups.dollars) * 100));
}

export function inferCostItemTitle(prompt: string) {
  if (prompt.includes("stucco")) {
    return "Stucco mix";
  }
  if (prompt.includes("drywall")) {
    return "Drywall materials";
  }
  if (prompt.includes("concrete")) {
    return "Concrete materials";
  }
  if (prompt.includes("lumber") || prompt.includes("framing")) {
    return "Framing materials";
  }
  return "Material item";
}

export function inferMilestoneKeyFromPrompt(
  prompt: string,
  target: Record<string, any>,
  route: Record<string, any>
) {
  const milestones = Array.isArray(target.milestones)
    ? target.milestones.map(normalizePlannerRecord)
    : [];
  const scored = milestones
    .map((milestone) => {
      const key = String(milestone.key ?? "");
      const name = String(milestone.name ?? "");
      const haystack = `${key} ${name}`.toLowerCase();
      let score = prompt.includes(key.toLowerCase()) ? 4 : 0;
      for (const token of prompt
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 3)) {
        if (haystack.includes(token)) {
          score += 1;
        }
      }
      if (
        /(stucco|siding|exterior|envelope|cladding|finish)/.test(prompt) &&
        /(exterior|envelope|finish|siding|cladding)/.test(haystack)
      ) {
        score += 4;
      }
      return { key, score };
    })
    .filter((row) => row.key && row.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.key ?? optionalString(route.selectedMilestoneKey);
}

export function normalizeMaterialUnit(unit: string | undefined) {
  if (!unit) {
    return;
  }
  const normalized = unit.toLowerCase();
  if (normalized === "sack" || normalized === "sacks") {
    return "bags";
  }
  if (normalized === "pcs") {
    return "pieces";
  }
  if (normalized === "yd" || normalized === "yds") {
    return "yards";
  }
  return normalized;
}

export function singularizeUnit(unit: string) {
  return unit.endsWith("s") ? unit.slice(0, -1) : unit;
}

export function fallbackNavigation(siteMap: unknown, prompt: string) {
  const entries = Array.isArray(siteMap)
    ? siteMap.map(normalizePlannerRecord)
    : [];
  const scored = entries
    .map((entry) => {
      const haystack = [
        entry.id,
        entry.label,
        entry.pathTemplate,
        entry.purpose,
        ...(Array.isArray(entry.synonyms) ? entry.synonyms : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return {
        entry,
        score: prompt
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 2)
          .reduce(
            (total, token) => total + (haystack.includes(token) ? 1 : 0),
            0
          ),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const match = scored[0]?.entry;
  if (!match || typeof match.to !== "string") {
    return null;
  }
  return {
    label: String(match.label ?? match.to),
    reason: String(match.purpose ?? "Permitted DrawFlow route"),
    routeId: String(match.id ?? match.to),
    to: match.to,
  };
}

export function firstMilestoneKey(target: Record<string, any>) {
  return Array.isArray(target.milestones)
    ? normalizePlannerRecord(target.milestones[0]).key
    : undefined;
}

export function milestoneOptions(target: Record<string, any>) {
  return Array.isArray(target.milestones)
    ? target.milestones
        .map((milestone: unknown) => {
          const row = normalizePlannerRecord(milestone);
          const key = typeof row.key === "string" ? row.key : undefined;
          if (!key) {
            return null;
          }
          return {
            key,
            label:
              typeof row.name === "string" && row.name
                ? `${row.name} (${key})`
                : key,
            name: typeof row.name === "string" ? row.name : key,
          };
        })
        .filter((row: unknown) => row !== null)
    : [];
}
