import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const repositoryRoot = process.cwd();
const ledgerPath = resolve(
  repositoryRoot,
  "docs/lender-portal-mvp-execution/traceability.json"
);
const HEADING_LEVEL_PATTERN = /^#+/;
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+/;
const NUMBERED_LIST_ORDINAL_PATTERN = /^(\d+)\.\s/;
const NUMBERED_HEADING_ORDINAL_PATTERN = /^###\s+(\d+)\./;
const E2E_HEADING_ORDINAL_PATTERN = /^###\s+E2E-(\d+)\s/;
const RANGE_ENDPOINT_PATTERN = /^(.*?)(\d+)$/;
const PACKET_SELECTOR_PATTERN = /^[-*]\s+`?([^`]+?)`?\s*$/;

const generatedCatalogSchema = z.object({
  count: z.number().int().positive(),
  heading: z.string().min(1).optional(),
  kind: z.enum([
    "explicit",
    "numbered-list",
    "numbered-headings",
    "e2e-headings",
  ]),
  name: z.string().min(1),
  prefix: z.string().min(1),
  source: z.string().min(1),
  width: z.number().int().positive(),
});

const explicitCatalogSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  kind: z.literal("explicit-values"),
  name: z.string().min(1),
  source: z.string().min(1),
});

const statusSchema = z.enum([
  "planned",
  "ready",
  "in-progress",
  "implementation-complete",
  "verified",
]);
const evidenceSchema = z.object({
  acceptedSha: z.string().regex(/^[a-f0-9]{40}$/),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const ledgerSchema = z.object({
  schemaVersion: z.literal("lender-portal-mvp-traceability/v1"),
  preparationBaseline: z.object({
    branch: z.string().min(1),
    headSha: z.string().regex(/^[a-f0-9]{40}$/),
    preparedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    workingTreePolicy: z.literal("dirty-authorized"),
  }),
  sources: z
    .array(
      z.object({
        authority: z.string().min(1),
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
    )
    .min(1),
  catalogs: z
    .array(z.union([generatedCatalogSchema, explicitCatalogSchema]))
    .min(1),
  coverageGroups: z
    .array(
      z.object({
        id: z.string().min(1),
        journeys: z.array(z.string().min(1)),
        phase: z.number().int().min(0).max(9),
        requirementSelectors: z.array(z.string().min(1)).min(1),
        status: statusSchema,
        verification: z.array(z.string().min(1)).min(1),
        workPackages: z.array(z.string().min(1)),
      })
    )
    .min(1),
  workPackages: z
    .array(
      z.object({
        dependsOn: z.array(z.string().min(1)),
        evidence: evidenceSchema.nullable(),
        id: z.string().min(1),
        path: z.string().min(1),
        phase: z.number().int().min(1).max(9),
        status: statusSchema,
      })
    )
    .min(1),
});

type Catalog = z.infer<typeof ledgerSchema>["catalogs"][number];

function fail(message: string): never {
  throw new Error(message);
}

function generatedIds(catalog: Extract<Catalog, { prefix: string }>) {
  return Array.from({ length: catalog.count }, (_, index) => {
    const number = String(index + 1).padStart(catalog.width, "0");
    return `${catalog.prefix}${number}`;
  });
}

function catalogIds(catalog: Catalog) {
  return catalog.kind === "explicit-values"
    ? catalog.ids
    : generatedIds(catalog);
}

function markdownSection(markdown: string, heading: string) {
  const lines = markdown.split("\n");
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapedHeading}\\s*$`);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) {
    fail(`Missing heading "${heading}"`);
  }
  const level = lines[start].match(HEADING_LEVEL_PATTERN)?.[0].length ?? 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(MARKDOWN_HEADING_PATTERN);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

function validateCatalog(catalog: Catalog, sourceText: string) {
  const ids = catalogIds(catalog);
  if (catalog.kind === "explicit-values" || catalog.kind === "explicit") {
    for (const id of ids) {
      if (!sourceText.includes(id)) {
        fail(`${catalog.name}: source is missing ${id}`);
      }
    }
    return;
  }

  if (!catalog.heading) {
    fail(`${catalog.name}: ${catalog.kind} catalog requires a heading`);
  }
  const section = markdownSection(sourceText, catalog.heading);
  if (!section.includes(catalog.prefix)) {
    fail(`${catalog.name}: section does not declare ${catalog.prefix}`);
  }

  const ordinalPattern =
    catalog.kind === "numbered-list"
      ? NUMBERED_LIST_ORDINAL_PATTERN
      : catalog.kind === "numbered-headings"
        ? NUMBERED_HEADING_ORDINAL_PATTERN
        : E2E_HEADING_ORDINAL_PATTERN;
  const ordinals = section
    .split("\n")
    .map((line) => line.match(ordinalPattern)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const actualCount = ordinals.length;

  if (actualCount !== catalog.count) {
    fail(
      `${catalog.name}: expected ${catalog.count} numbered requirements, found ${actualCount}`
    );
  }
  for (let index = 0; index < catalog.count; index += 1) {
    const expectedOrdinal = index + 1;
    if (ordinals[index] !== expectedOrdinal) {
      const expectedId = ids[index];
      fail(
        `${catalog.name}: ${expectedId} must map to ordinal ${expectedOrdinal}, found ${ordinals[index] ?? "missing"}`
      );
    }
  }
}

function expandSelector(selector: string) {
  if (!selector.includes("..")) {
    return [selector];
  }
  const [start, end, extra] = selector.split("..");
  if (!(start && end) || extra) {
    fail(`Invalid requirement selector: ${selector}`);
  }
  const startMatch = start.match(RANGE_ENDPOINT_PATTERN);
  const endMatch = end.match(RANGE_ENDPOINT_PATTERN);
  if (!(startMatch && endMatch) || startMatch[1] !== endMatch[1]) {
    fail(`Range must share one numeric prefix: ${selector}`);
  }
  const first = Number(startMatch[2]);
  const last = Number(endMatch[2]);
  if (first > last) {
    fail(`Range is descending: ${selector}`);
  }
  const width = startMatch[2].length;
  return Array.from(
    { length: last - first + 1 },
    (_, index) =>
      `${startMatch[1]}${String(first + index).padStart(width, "0")}`
  );
}

function packetSelectors(markdown: string, packetId: string) {
  const section = markdownSection(markdown, "Traceability selectors");
  const selectors = section
    .split("\n")
    .map((line) => line.match(PACKET_SELECTOR_PATTERN)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  if (selectors.length === 0) {
    fail(`${packetId}: Traceability selectors is empty`);
  }
  return selectors;
}

function assertNoDependencyCycle(
  workPackages: Map<string, { dependsOn: string[] }>
) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      fail(`Work-package dependency cycle includes ${id}`);
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const dependency of workPackages.get(id)?.dependsOn ?? []) {
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of workPackages.keys()) {
    visit(id);
  }
}

function assertCommitAncestor(args: {
  ancestorSha: string;
  descendantSha: string;
  lookupFailurePrefix: string;
  notAncestorMessage: string;
}) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", args.ancestorSha, args.descendantSha],
    { cwd: repositoryRoot, encoding: "utf8" }
  );
  if (result.status === 0) {
    return;
  }
  if (result.status === 1) {
    fail(args.notAncestorMessage);
  }
  const diagnostic = result.stderr.trim();
  fail(
    `${args.lookupFailurePrefix}: git merge-base exited ${result.status ?? "without a status"}${diagnostic ? `: ${diagnostic}` : ""}`
  );
}

function validateEvidence(
  workPackage: z.infer<typeof ledgerSchema>["workPackages"][number],
  currentHead: string
) {
  const evidence = workPackage.evidence;
  if (!evidence) {
    fail(`${workPackage.id}: verified packets require evidence`);
  }
  const evidencePath = resolve(repositoryRoot, evidence.path);
  if (!existsSync(evidencePath)) {
    fail(`${workPackage.id}: missing evidence ${evidence.path}`);
  }
  const evidenceText = readFileSync(evidencePath, "utf8");
  const evidenceHash = createHash("sha256").update(evidenceText).digest("hex");
  if (evidenceHash !== evidence.sha256) {
    fail(`${workPackage.id}: evidence hash does not match ${evidence.path}`);
  }
  if (!evidenceText.includes(evidence.acceptedSha)) {
    fail(`${workPackage.id}: evidence does not name accepted SHA`);
  }
  assertCommitAncestor({
    ancestorSha: evidence.acceptedSha,
    descendantSha: currentHead,
    lookupFailurePrefix: `${workPackage.id}: unable to verify accepted SHA ${evidence.acceptedSha}`,
    notAncestorMessage: `${workPackage.id}: accepted SHA ${evidence.acceptedSha} is not an ancestor of ${currentHead}`,
  });
}

const rawLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const ledger = ledgerSchema.parse(rawLedger);
const mode = process.argv.includes("--release")
  ? "release"
  : ledger.workPackages.every(
        (workPackage) =>
          workPackage.status === "ready" && workPackage.evidence === null
      )
    ? "prep"
    : "execution";

const sourceTexts = new Map<string, string>();
for (const source of ledger.sources) {
  const absolutePath = resolve(repositoryRoot, source.path);
  if (!existsSync(absolutePath)) {
    fail(`Missing source: ${source.path}`);
  }
  const sourceText = readFileSync(absolutePath, "utf8");
  const sourceHash = createHash("sha256").update(sourceText).digest("hex");
  if (sourceHash !== source.sha256) {
    fail(
      `${source.path}: source hash changed; refresh traceability and pre-implementation evidence intentionally`
    );
  }
  sourceTexts.set(source.path, sourceText);
}

const knownRequirementIds = new Set<string>();
for (const catalog of ledger.catalogs) {
  const sourceText = sourceTexts.get(catalog.source);
  if (!sourceText) {
    fail(`${catalog.name}: source is not declared in sources`);
  }
  validateCatalog(catalog, sourceText);
  for (const id of catalogIds(catalog)) {
    if (knownRequirementIds.has(id)) {
      fail(`Duplicate requirement id: ${id}`);
    }
    knownRequirementIds.add(id);
  }
}

const workPackageIds = new Set<string>();
for (const workPackage of ledger.workPackages) {
  if (workPackageIds.has(workPackage.id)) {
    fail(`Duplicate work-package id: ${workPackage.id}`);
  }
  workPackageIds.add(workPackage.id);
}
const workPackages = new Map(
  ledger.workPackages.map((workPackage) => [workPackage.id, workPackage])
);
for (const workPackage of ledger.workPackages) {
  for (const dependency of workPackage.dependsOn) {
    if (!workPackages.has(dependency)) {
      fail(`${workPackage.id}: unknown dependency ${dependency}`);
    }
  }
}
assertNoDependencyCycle(workPackages);

const coveredRequirementIds = new Set<string>();
for (const group of ledger.coverageGroups) {
  for (const workPackageId of group.workPackages) {
    if (!workPackages.has(workPackageId)) {
      fail(`${group.id}: unknown work package ${workPackageId}`);
    }
  }
  for (const selector of group.requirementSelectors) {
    for (const id of expandSelector(selector)) {
      if (!knownRequirementIds.has(id)) {
        fail(`${group.id}: unknown requirement ${id}`);
      }
      coveredRequirementIds.add(id);
    }
  }
  for (const journey of group.journeys) {
    if (!knownRequirementIds.has(journey)) {
      fail(`${group.id}: unknown journey ${journey}`);
    }
  }
}

const orphanedRequirements = [...knownRequirementIds].filter(
  (id) => !coveredRequirementIds.has(id)
);
if (orphanedRequirements.length > 0) {
  fail(`Orphaned requirements: ${orphanedRequirements.join(", ")}`);
}

const packetCoveredRequirements = new Set<string>();
const packetRequirementsByWorkPackage = new Map<string, Set<string>>();
for (const workPackage of ledger.workPackages) {
  const absolutePath = resolve(repositoryRoot, workPackage.path);
  if (!existsSync(absolutePath)) {
    fail(`${workPackage.id}: missing packet ${workPackage.path}`);
  }
  const markdown = readFileSync(absolutePath, "utf8");
  if (!markdown.includes(`# ${workPackage.id}`)) {
    fail(`${workPackage.id}: packet heading does not match id`);
  }
  if (!markdown.includes(`Status: ${workPackage.status}`)) {
    fail(
      `${workPackage.id}: packet status does not match traceability status ${workPackage.status}`
    );
  }
  if (/\b(?:TODO|TBD|PLACEHOLDER)\b/.test(markdown)) {
    fail(`${workPackage.id}: unresolved placeholder text is not allowed`);
  }
  const workPackageRequirements = new Set<string>();
  for (const selector of packetSelectors(markdown, workPackage.id)) {
    for (const id of expandSelector(selector)) {
      if (!knownRequirementIds.has(id)) {
        fail(`${workPackage.id}: unknown requirement ${id}`);
      }
      packetCoveredRequirements.add(id);
      workPackageRequirements.add(id);
    }
  }
  packetRequirementsByWorkPackage.set(workPackage.id, workPackageRequirements);
}

const phaseOneRequirements = new Set(
  ledger.coverageGroups
    .filter((group) => group.phase === 1)
    .flatMap((group) => group.requirementSelectors.flatMap(expandSelector))
);
const phaseOnePacketGaps = [...phaseOneRequirements].filter(
  (id) => !packetCoveredRequirements.has(id)
);
if (phaseOnePacketGaps.length > 0) {
  fail(`Phase 1 packet gaps: ${phaseOnePacketGaps.join(", ")}`);
}

for (const group of ledger.coverageGroups) {
  if (group.status === "planned") {
    if (group.workPackages.length > 0) {
      fail(`${group.id}: planned coverage groups cannot declare work packages`);
    }
    continue;
  }
  if (group.workPackages.length === 0) {
    fail(`${group.id}: ${group.status} coverage groups require work packages`);
  }
  const declaredPacketCoverage = new Set(
    group.workPackages.flatMap((workPackageId) => [
      ...(packetRequirementsByWorkPackage.get(workPackageId) ?? []),
    ])
  );
  const groupRequirements = group.requirementSelectors.flatMap(expandSelector);
  // Phase 0 quality groups span the entire roadmap. Only the requirements
  // selected by currently prepared packets are due until later packets exist.
  const requirementsDueFromPreparedPackets =
    group.phase === 0
      ? groupRequirements.filter((id) => packetCoveredRequirements.has(id))
      : groupRequirements;
  const groupPacketGaps = requirementsDueFromPreparedPackets.filter(
    (id) => !declaredPacketCoverage.has(id)
  );
  if (groupPacketGaps.length > 0) {
    fail(
      `${group.id}: declared work-package coverage gaps: ${groupPacketGaps.join(", ")}`
    );
  }
}

const gitHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (gitHead.status !== 0) {
  fail("Unable to resolve the current Git HEAD");
}
const currentHead = gitHead.stdout.trim();
if (mode === "prep" && currentHead !== ledger.preparationBaseline.headSha) {
  fail(
    `Preparation baseline is stale: expected ${ledger.preparationBaseline.headSha}, found ${currentHead}`
  );
}
if (mode !== "prep") {
  assertCommitAncestor({
    ancestorSha: ledger.preparationBaseline.headSha,
    descendantSha: currentHead,
    lookupFailurePrefix: `Unable to verify preparation baseline ${ledger.preparationBaseline.headSha}`,
    notAncestorMessage: `Implementation HEAD ${currentHead} does not descend from preparation baseline ${ledger.preparationBaseline.headSha}`,
  });
}

if (mode === "prep") {
  for (const workPackage of ledger.workPackages) {
    if (workPackage.status !== "ready" || workPackage.evidence !== null) {
      fail(
        `${workPackage.id}: preparation mode requires ready status and no evidence`
      );
    }
  }
} else if (mode === "execution") {
  const inProgressPackages = ledger.workPackages.filter(
    (workPackage) => workPackage.status === "in-progress"
  );
  if (inProgressPackages.length > 1) {
    fail(
      `Execution mode permits one in-progress packet, found ${inProgressPackages.map((workPackage) => workPackage.id).join(", ")}`
    );
  }
  for (const workPackage of ledger.workPackages) {
    const hasImplementationEvidence =
      workPackage.status === "implementation-complete" ||
      workPackage.status === "verified";
    if (!hasImplementationEvidence && workPackage.evidence !== null) {
      fail(
        `${workPackage.id}: ${workPackage.status} packets cannot attach evidence`
      );
    }
    if (hasImplementationEvidence) {
      validateEvidence(workPackage, currentHead);
    }
    if (
      workPackage.status === "in-progress" ||
      workPackage.status === "implementation-complete" ||
      workPackage.status === "verified"
    ) {
      for (const dependencyId of workPackage.dependsOn) {
        const dependencyStatus = workPackages.get(dependencyId)?.status;
        if (
          dependencyStatus !== "implementation-complete" &&
          dependencyStatus !== "verified"
        ) {
          fail(
            `${workPackage.id}: dependency ${dependencyId} must be implementation-complete before execution`
          );
        }
      }
    }
  }
} else {
  const unfinishedGroups = ledger.coverageGroups.filter(
    (group) => group.status !== "verified"
  );
  const unfinishedPackages = ledger.workPackages.filter(
    (workPackage) =>
      workPackage.status !== "verified" || workPackage.evidence === null
  );
  if (unfinishedGroups.length > 0 || unfinishedPackages.length > 0) {
    fail(
      "Release mode requires verified coverage groups and exact-commit evidence"
    );
  }
  for (const workPackage of ledger.workPackages) {
    validateEvidence(workPackage, currentHead);
  }
}

console.log(
  JSON.stringify(
    {
      catalogs: ledger.catalogs.length,
      coverageGroups: ledger.coverageGroups.length,
      mode,
      requirements: knownRequirementIds.size,
      status: "valid",
      workPackages: ledger.workPackages.length,
    },
    null,
    2
  )
);
