import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sourceCoverage,
  validationGaps,
} from "./core-workflow-manifest-metadata";
import {
  type Entry,
  type ParentWorkflow,
  type PersonaCode,
  personas,
} from "./core-workflow-manifest-model";
import { workflowsPart01 } from "./core-workflow-manifest-workflows-01";
import { workflowsPart02 } from "./core-workflow-manifest-workflows-02";
import { workflowsPart03 } from "./core-workflow-manifest-workflows-03";
import { workflowsPart04 } from "./core-workflow-manifest-workflows-04";
import { workflowsPart05 } from "./core-workflow-manifest-workflows-05";
import { workflowsPart06 } from "./core-workflow-manifest-workflows-06";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "docs/core-product-workflow-manifest.md");
const workflows: ParentWorkflow[] = [
  ...workflowsPart01,
  ...workflowsPart02,
  ...workflowsPart03,
  ...workflowsPart04,
  ...workflowsPart05,
  ...workflowsPart06,
];
const PARENT_WORKFLOW_ID_PATTERN = /^WF-[A-Z]{3}-\d{3}$/;
const STEP_ID_PATTERN =
  /^WF-[A-Z]{3}-\d{3}\.(?:PARENT\.00|[A-Z]{3,4}\.\d{2})\.STEP-\d{2}$/;

function stepId(entry: Entry, index: number): string {
  const base = entry.persona === "CROSS" ? `${entry.id}.PARENT.00` : entry.id;
  return `${base}.STEP-${String(index + 1).padStart(2, "0")}`;
}

function allEntries(): Entry[] {
  return workflows.flatMap((workflow) => [workflow, ...workflow.segments]);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one manifest validator reports every independent contract defect
function validate(): string[] {
  const errors: string[] = [];
  const entries = allEntries();
  const workflowIds = new Set(entries.map((entry) => entry.id));
  const parentIds = new Set(workflows.map((workflow) => workflow.id));
  const handoffs = workflows.flatMap((workflow) => workflow.handoffDefinitions);
  const handoffIds = new Set(handoffs.map((handoff) => handoff.id));
  const allIds: string[] = [
    ...entries.map((entry) => entry.id),
    ...handoffs.map((handoff) => handoff.id),
    ...entries.flatMap((entry) =>
      entry.steps.map((_, index) => stepId(entry, index))
    ),
  ];
  const duplicates = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  if (duplicates.length) {
    errors.push(
      `Duplicate identifiers: ${[...new Set(duplicates)].join(", ")}`
    );
  }
  const normalizedNames = entries.map((entry) =>
    entry.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
  const duplicateNames = normalizedNames.filter(
    (name, index) => normalizedNames.indexOf(name) !== index
  );
  if (duplicateNames.length) {
    errors.push(
      `Duplicate workflow entry names: ${[...new Set(duplicateNames)].join(", ")}`
    );
  }
  const idSet = new Set(allIds);
  const referencedIds =
    JSON.stringify({ workflows, validationGaps, sourceCoverage }).match(
      /WF-[A-Z]{3}-\d{3}(?:\.(?:[A-Z]{3,4}\.\d{2}|HO-\d{2})(?:\.STEP-\d{2})?)?/g
    ) ?? [];
  for (const reference of referencedIds) {
    if (!idSet.has(reference)) {
      errors.push(`Free-text/data reference does not exist: ${reference}`);
    }
  }

  for (const workflow of workflows) {
    if (!PARENT_WORKFLOW_ID_PATTERN.test(workflow.id)) {
      errors.push(`Invalid parent ID: ${workflow.id}`);
    }
    const normalized = workflow.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (
      workflows.some(
        (other) =>
          other !== workflow &&
          other.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim() === normalized
      )
    ) {
      errors.push(`Duplicate parent workflow name: ${workflow.name}`);
    }
    for (const segmentEntry of workflow.segments) {
      if (
        !new RegExp(
          `^${workflow.id.replace(/-/g, "\\-")}\\.[A-Z]{3,4}\\.\\d{2}$`
        ).test(segmentEntry.id)
      ) {
        errors.push(`Invalid segment ID: ${segmentEntry.id}`);
      }
      if (segmentEntry.parentWorkflowId !== workflow.id) {
        errors.push(
          `${segmentEntry.id} has wrong parent ${segmentEntry.parentWorkflowId}`
        );
      }
      if (
        !workflow.participants.includes(segmentEntry.persona as PersonaCode)
      ) {
        errors.push(
          `${segmentEntry.id} persona absent from parent participants`
        );
      }
    }
    for (const handoff of workflow.handoffDefinitions) {
      if (
        !new RegExp(`^${workflow.id.replace(/-/g, "\\-")}\\.HO-\\d{2}$`).test(
          handoff.id
        )
      ) {
        errors.push(`Invalid handoff ID: ${handoff.id}`);
      }
      const fromRefs = workflow.segments.filter(
        (entry) =>
          entry.persona === handoff.from && entry.handoffs.includes(handoff.id)
      );
      const toRefs = workflow.segments.filter(
        (entry) =>
          entry.persona === handoff.to && entry.handoffs.includes(handoff.id)
      );
      if (!fromRefs.length) {
        errors.push(
          `${handoff.id} missing sender-side reference (${handoff.from})`
        );
      }
      if (!toRefs.length) {
        errors.push(
          `${handoff.id} missing receiver-side reference (${handoff.to})`
        );
      }
      if (
        ![handoff.trigger, handoff.artifacts, handoff.acknowledgement].every(
          Boolean
        )
      ) {
        errors.push(`${handoff.id} missing required handoff detail`);
      }
    }
  }

  const requiredArrayFields: (keyof Entry)[] = [
    "preconditions",
    "steps",
    "inputs",
    "outputs",
    "states",
    "gates",
    "exceptions",
    "permissions",
    "events",
    "success",
    "failure",
    "sources",
  ];
  for (const entry of entries) {
    if (!(entry.name && entry.category && entry.purpose && entry.trigger)) {
      errors.push(`${entry.id} missing required scalar field`);
    }
    for (const field of requiredArrayFields) {
      if (
        !Array.isArray(entry[field]) ||
        (entry[field] as string[]).length === 0
      ) {
        errors.push(`${entry.id} missing ${field}`);
      }
    }
    for (const dependency of [...entry.upstream, ...entry.downstream]) {
      if (!workflowIds.has(dependency)) {
        errors.push(`${entry.id} references missing dependency ${dependency}`);
      }
    }
    for (const handoffId of entry.handoffs) {
      if (!handoffIds.has(handoffId)) {
        errors.push(`${entry.id} references missing handoff ${handoffId}`);
      }
    }
    entry.steps.forEach((_, index) => {
      const id = stepId(entry, index);
      if (!STEP_ID_PATTERN.test(id)) {
        errors.push(`Invalid step ID: ${id}`);
      }
    });
    if (entry.status === "NEEDS_VALIDATION" && !entry.validationNote) {
      errors.push(`${entry.id} lacks NEEDS_VALIDATION reasoning`);
    }
    for (const source of entry.sources) {
      const path = source.split(" ")[0].replaceAll("`", "");
      if (!existsSync(resolve(ROOT, path))) {
        errors.push(`${entry.id} source path does not exist: ${path}`);
      }
    }
  }

  for (const workflow of workflows) {
    if (
      !workflow.participants.every((code) =>
        workflow.segments.some((entry) => entry.persona === code)
      )
    ) {
      errors.push(`${workflow.id} participant has no persona-specific segment`);
    }
    if (!parentIds.has(workflow.id)) {
      errors.push(`Missing parent registry entry ${workflow.id}`);
    }
  }
  for (const coverage of sourceCoverage) {
    for (const workflowId of coverage.workflows) {
      if (!parentIds.has(workflowId)) {
        errors.push(`Coverage map references missing parent ${workflowId}`);
      }
    }
    const path = coverage.source.split(" ")[0];
    if (!existsSync(resolve(ROOT, path))) {
      errors.push(`Coverage source path does not exist: ${path}`);
    }
  }
  return errors;
}

function bullets(values: string[]): string {
  return values.map((value) => `  - ${value}`).join("\n");
}

function renderEntry(entry: Entry, parent?: ParentWorkflow): string {
  const status = entry.status ?? "SUPPORTED";
  const lines = [
    `### ${entry.id} — ${entry.name}`,
    "",
    `1. **Unique workflow ID:** \`${entry.id}\``,
    `2. **Workflow name:** ${entry.name}`,
    `3. **Persona:** ${entry.persona === "CROSS" ? "Cross-persona parent workflow" : `${personas[entry.persona].name} (\`${entry.persona}\`)`}`,
    `4. **Functional category:** ${entry.category}`,
    `5. **Parent workflow ID:** ${entry.parentWorkflowId ? `\`${entry.parentWorkflowId}\`` : "Not applicable — this is the parent workflow."}`,
    `6. **Purpose and intended outcome:** ${entry.purpose}`,
    "7. **Preconditions:**",
    bullets(entry.preconditions),
    `8. **Trigger:** ${entry.trigger}`,
    "9. **Ordered workflow steps:**",
    ...entry.steps.map(
      (value, index) => `  ${index + 1}. \`${stepId(entry, index)}\` — ${value}`
    ),
    "10. **Inputs and required artifacts:**",
    bullets(entry.inputs),
    "11. **Outputs and generated artifacts:**",
    bullets(entry.outputs),
    "12. **System states and state transitions:**",
    bullets(entry.states),
    "13. **Decisions, validations, and approval gates:**",
    bullets(entry.gates),
    "14. **Exceptions, rejection paths, and recovery flows:**",
    bullets(entry.exceptions),
    "15. **Permissions and role constraints:**",
    bullets(entry.permissions),
    "16. **Upstream and downstream workflow dependencies:**",
    `  - Upstream: ${entry.upstream.length ? entry.upstream.map((id) => `\`${id}\``).join(", ") : "None."}`,
    `  - Downstream: ${entry.downstream.length ? entry.downstream.map((id) => `\`${id}\``).join(", ") : "None."}`,
    "17. **Cross-persona handoffs:**",
  ];
  if (entry.persona === "CROSS") {
    const workflow = entry as ParentWorkflow;
    lines.push(
      ...workflow.handoffDefinitions.map(
        (handoff) =>
          `  - \`${handoff.id}\` — **${personas[handoff.from].name} → ${personas[handoff.to].name}.** Trigger: ${handoff.trigger} Artifacts: ${handoff.artifacts} Required acknowledgement/next action: ${handoff.acknowledgement}`
      )
    );
  } else {
    if (!entry.handoffs.length) {
      lines.push(
        "  - None directly in this segment; related cross-persona routing is owned by the parent workflow or an explicitly referenced dependency."
      );
    }
    lines.push(
      ...entry.handoffs.map((id) => {
        const handoff = parent?.handoffDefinitions.find(
          (candidate) => candidate.id === id
        );
        const direction = handoff
          ? `${personas[handoff.from].name} → ${personas[handoff.to].name}`
          : "See parent";
        return `  - \`${id}\` — ${direction}; see parent handoff registry for the shared trigger, artifacts, and acknowledgement contract.`;
      })
    );
  }
  lines.push(
    "18. **Audit, notification, and integration events:**",
    bullets(entry.events),
    "19. **Terminal success and failure states:**",
    "  - Success:",
    bullets(entry.success).replace(/^ {2}/gm, "    "),
    "  - Failure:",
    bullets(entry.failure).replace(/^ {2}/gm, "    "),
    "20. **Source references:**",
    bullets(entry.sources.map((source) => `\`${source}\``)),
    `**Support status:** \`${status}\`${entry.validationNote ? ` — ${entry.validationNote}` : ""}`,
    ""
  );
  return lines.join("\n");
}

function render(): string {
  const entries = allEntries();
  const summaryRows = entries
    .slice()
    .sort((a, b) => {
      const personaA = a.persona === "CROSS" ? "00" : personas[a.persona].name;
      const personaB = b.persona === "CROSS" ? "00" : personas[b.persona].name;
      return (
        personaA.localeCompare(personaB) ||
        a.category.localeCompare(b.category) ||
        a.id.localeCompare(b.id)
      );
    })
    .map((entry) => {
      const parent = entry.parentWorkflowId
        ? workflows.find((workflow) => workflow.id === entry.parentWorkflowId)
        : (entry as ParentWorkflow);
      if (!parent) {
        throw new Error(`Missing parent workflow for ${entry.id}.`);
      }
      const persona =
        entry.persona === "CROSS"
          ? "Cross-persona parent"
          : personas[entry.persona].name;
      return `| \`${entry.id}\` | ${entry.name} | ${persona} | ${entry.category} | ${entry.parentWorkflowId ? `\`${entry.parentWorkflowId}\`` : "—"} | ${parent.participants.map((code) => personas[code].name).join("; ")} | \`${entry.status ?? "SUPPORTED"}\` |`;
    });

  const personaSections: string[] = [];
  for (const [code, persona] of Object.entries(personas) as [
    PersonaCode,
    (typeof personas)[PersonaCode],
  ][]) {
    const segments = workflows
      .flatMap((workflow) =>
        workflow.segments.map((entry) => ({ entry, workflow }))
      )
      .filter(({ entry }) => entry.persona === code);
    if (!segments.length) {
      continue;
    }
    personaSections.push(
      `## Persona: ${persona.name} (\`${code}\`)`,
      "",
      persona.definition,
      ""
    );
    const categories = [
      ...new Set(segments.map(({ entry }) => entry.category)),
    ].sort();
    for (const category of categories) {
      personaSections.push(`### Functional category: ${category}`, "");
      for (const { entry, workflow } of segments
        .filter(({ entry }) => entry.category === category)
        .sort((a, b) => a.entry.id.localeCompare(b.entry.id))) {
        personaSections.push(renderEntry(entry, workflow));
      }
    }
  }

  return [
    "# DrawFlow Core Product Workflow Manifest",
    "",
    "> Canonical, source-backed workflow inventory. Generated by `scripts/core-workflow-manifest.ts`; do not edit the generated file by hand.",
    "",
    "## Scope and conventions",
    "",
    "This manifest models reimbursement-only DrawFlow workflows from tenant provisioning through build execution, evidence verification, draw release, receipt, notifications, and integrations. Parent workflows are end-to-end processes; persona segments are the only persona-specific views of those parents. Shared handoff IDs are defined once on the parent and referenced by both sending and receiving segments.",
    "",
    "Identifiers use `WF-{DOMAIN}-{NNN}` for parents, `WF-{DOMAIN}-{NNN}.{PERSONA}.{NN}` for segments, `WF-{DOMAIN}-{NNN}.HO-{NN}` for handoffs, and `{workflow-or-segment}.STEP-{NN}` for steps. `SUPPORTED` means directly supported by cited documentation. `NEEDS_VALIDATION` means the source is incomplete or conflicting; the exact gap is stated and no unsupported behavior is silently asserted.",
    "",
    "### Domain invariants applied throughout",
    "",
    "- V1 is reimbursement-only: work is completed, evidenced, reviewed, approved, and only then released.",
    "- Interest starts only after funds are released; request and approval do not start interest.",
    "- Borrower Working Capital Limit and Lender Draw Policy Limit are distinct constraints and are never collapsed.",
    "- Lender Operations may review, inspect, report, prepare, and recommend; Lender Admin/Principal Broker retains final milestone and release authority.",
    "- Geofence failure, low confidence, or suspected spoofed location never discards evidence; it creates an explicit review/override path.",
    "- Approved Budgets are versioned, never overwritten.",
    "- Material decisions/overrides capture actor, role, timestamp, prior/new state, warnings, and reason where applicable.",
    "- Every domain record and workflow action is organization-scoped; WorkOS projection tables remain webhook-owned.",
    "",
    "## Persona catalog",
    "",
    "| Code | Persona | Boundary |",
    "|---|---|---|",
    ...Object.entries(personas).map(
      ([code, persona]) =>
        `| \`${code}\` | ${persona.name} | ${persona.definition} |`
    ),
    "",
    "# Part 1 — Summary matrix",
    "",
    "| Workflow ID | Workflow | Persona | Functional category | Parent workflow | Participating personas | Status |",
    "|---|---|---|---|---|---|---|",
    ...summaryRows,
    "",
    "## Authoritative source coverage map",
    "",
    "| Source workflow section | Canonical parent workflow(s) |",
    "|---|---|",
    ...sourceCoverage.map(
      (row) =>
        `| \`${row.source}\` | ${row.workflows.map((id) => `\`${id}\``).join(", ")} |`
    ),
    "",
    "# Part 2 — Detailed workflow manifest",
    "",
    "## Cross-persona parent workflows",
    "",
    ...workflows.map((workflow) => renderEntry(workflow)),
    "# Persona-indexed workflow segments",
    "",
    ...personaSections,
    "# Unresolved gaps and explicitly excluded unsupported workflows",
    "",
    ...validationGaps.map((gap) => `- ${gap}`),
    "",
    "# Validation contract",
    "",
    "Run `bun run scripts/core-workflow-manifest.ts --check`. The validator proves unique IDs; valid identifier formats; existing parent, dependency, and handoff references; both sender and receiver references for every handoff; parent/segment traceability; nonempty required fields; unique parent names; source-file existence; and exact generated-file parity.",
    "",
    `**Last generated validation result:** ${workflows.length} parent workflows, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} persona segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs, and ${allEntries().reduce((count, entry) => count + entry.steps.length, 0)} unique workflow steps passed all invariants.`,
    "",
  ].join("\n");
}

const errors = validate();
if (errors.length) {
  console.error(
    `Workflow manifest validation failed (${errors.length}):\n- ${errors.join("\n- ")}`
  );
  process.exit(1);
}

const generated = render();
if (process.argv.includes("--write")) {
  writeFileSync(OUTPUT, generated);
  console.log(
    `Wrote ${OUTPUT} (${workflows.length} parents, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs).`
  );
} else if (process.argv.includes("--check")) {
  if (!existsSync(OUTPUT)) {
    console.error(`Generated manifest is missing: ${OUTPUT}`);
    process.exit(1);
  }
  const current = readFileSync(OUTPUT, "utf8");
  if (current !== generated) {
    console.error(
      "Generated manifest is stale. Run: bun run scripts/core-workflow-manifest.ts --write"
    );
    process.exit(1);
  }
  console.log(
    `Validated ${workflows.length} parents, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} persona segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs, and ${allEntries().reduce((count, entry) => count + entry.steps.length, 0)} uniquely identified steps.`
  );
} else {
  console.log(generated);
}
