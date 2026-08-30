import { WorkOS } from "@workos-inc/node";
import {
  isQaProtectedTableName,
  QA_CLEANUP_TABLES,
} from "../../convex/qaIdentityCleanupTables";
import { ONBOARDING_QA_INBOXES } from "./agentmail";

const DEFAULT_ORGANIZATION_ID = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const QA_EMAIL_PATTERN = /^drawflow-[a-z0-9]+(?:-[a-z0-9]+)*@agentmail[.]to$/i;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_MAX_PASSES = 8;
const DEFAULT_WAIT_MS = 45_000;
const MAX_DELETE_BATCH_SIZE = 100;

type CleanupOptions = {
  batchSize: number;
  confirm: boolean;
  deployment: string;
  emails: string[];
  maxPasses: number;
  waitMs: number;
};

type ConvexReference = {
  documentId: string;
  matchedValues: string[];
  relatedIds?: string[];
  tableName: string;
};

type ConvexScanResult = {
  references: ConvexReference[];
  scannedTables: string[];
};

type ConvexIdentity = {
  email: string;
  organizationId: string;
  role: "admin";
  roles: ["admin", ...string[]];
  subject: string;
  tokenIdentifier: string;
};

type TargetUser = {
  email: string;
  emailVerified?: boolean;
  id: string;
};

type TargetInvitation = {
  email: string;
  id: string;
  state: string;
};

type TargetMembership = {
  id: string;
  status: string;
  userId: string;
};

function usage() {
  console.log(
    [
      "Usage:",
      "  bun scripts/qa/cleanup-onboarding-identities.ts [options]",
      "",
      "Options:",
      "  --email <address>       Repeat to target explicit drawflow-*@agentmail.to identities.",
      "  --deployment <name>     Convex dev deployment; defaults to CONVEX_DEPLOYMENT.",
      "  --batch-size <number>   Tables per Convex scan call (default: " +
        DEFAULT_BATCH_SIZE +
        ").",
      "  --max-passes <number>   Identity-reference closure passes (default: " +
        DEFAULT_MAX_PASSES +
        ").",
      "  --wait-ms <number>      Webhook convergence wait after deletion (default: " +
        DEFAULT_WAIT_MS +
        ").",
      "  --confirm               Delete application rows, revoke invitations, and delete WorkOS users.",
      "  --help                  Show this help.",
      "",
      "Without --confirm the script is read-only and prints the exact deletion plan.",
    ].join("\n")
  );
}

function requiredEnv(name: string) {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(name + " is required.");
  }
  return value;
}

function requiredEnvOrDefault(name: string, fallback: string) {
  return Bun.env[name]?.trim() || fallback;
}

function positiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(flag + " must be a positive integer.");
  }
  return parsed;
}

function parseOptions(): CleanupOptions {
  const args = Bun.argv.slice(2);
  const emails: string[] = [];
  let batchSize = DEFAULT_BATCH_SIZE;
  let confirm = false;
  let deployment = Bun.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  let maxPasses = DEFAULT_MAX_PASSES;
  let waitMs = DEFAULT_WAIT_MS;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument === "--confirm") {
      confirm = true;
      continue;
    }
    if (argument === "--email") {
      const email = args[++index];
      if (!email) {
        throw new Error("--email requires an address.");
      }
      emails.push(email);
      continue;
    }
    if (argument === "--deployment") {
      deployment = args[++index] ?? "";
      continue;
    }
    if (argument === "--batch-size") {
      batchSize = positiveInteger(args[++index] ?? "", "--batch-size");
      continue;
    }
    if (argument === "--max-passes") {
      maxPasses = positiveInteger(args[++index] ?? "", "--max-passes");
      continue;
    }
    if (argument === "--wait-ms") {
      waitMs = positiveInteger(args[++index] ?? "", "--wait-ms");
      continue;
    }
    throw new Error("Unknown option: " + argument);
  }

  if (!deployment) {
    throw new Error(
      "A non-production CONVEX_DEPLOYMENT or --deployment is required."
    );
  }

  const normalizedEmails = [
    ...new Set(
      (emails.length > 0
        ? emails
        : ONBOARDING_QA_INBOXES.map((inbox) => inbox.address)
      ).map((email) => email.trim().toLowerCase())
    ),
  ];
  for (const email of normalizedEmails) {
    if (!QA_EMAIL_PATTERN.test(email)) {
      throw new Error(
        "Refusing non-QA email " +
          email +
          "; only drawflow-*@agentmail.to identities are accepted."
      );
    }
  }

  return {
    batchSize,
    confirm,
    deployment,
    emails: normalizedEmails,
    maxPasses,
    waitMs,
  };
}

function assertDevelopmentTarget(options: CleanupOptions) {
  const deployment = options.deployment.toLowerCase();
  if (
    deployment === "prod" ||
    deployment === "production" ||
    deployment.startsWith("prod:") ||
    deployment.includes("production")
  ) {
    throw new Error(
      "Refusing destructive QA cleanup against production deployment " +
        options.deployment +
        "."
    );
  }

  const workosKey = requiredEnv("WORKOS_API_KEY");
  if (!workosKey.startsWith("sk_test_")) {
    throw new Error(
      "Refusing QA cleanup with a non-test WorkOS API key. Use the configured development/test environment."
    );
  }
}

function convexCliDeployment(deployment: string) {
  return deployment.startsWith("dev:") ? deployment.slice(4) : deployment;
}

function provisionalBuilderWorkosUserId(email: string) {
  const slug = email.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return "provisioned_builder_" + slug;
}

async function getWorkosCollections(
  options: CleanupOptions,
  organizationId: string,
  workos: WorkOS
) {
  const usersByEmail = new Map<string, TargetUser>();
  for (const email of options.emails) {
    const users = await (
      await workos.userManagement.listUsers({ email })
    ).autoPagination();
    const exactUsers = users.filter(
      (user) => user.email.trim().toLowerCase() === email
    );
    if (exactUsers.length > 1) {
      throw new Error(
        "WorkOS returned multiple users for " +
          email +
          "; cleanup requires an unambiguous target."
      );
    }
    const user = exactUsers[0];
    if (user) {
      usersByEmail.set(email, {
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
      });
    }
  }

  const invitations = await (
    await workos.userManagement.listInvitations({ organizationId })
  ).autoPagination();
  const targetInvitations: TargetInvitation[] = invitations
    .filter((invitation) =>
      options.emails.includes(invitation.email.trim().toLowerCase())
    )
    .map((invitation) => ({
      email: invitation.email,
      id: invitation.id,
      state: invitation.state,
    }));

  const memberships: TargetMembership[] = [];
  for (const user of usersByEmail.values()) {
    const userMemberships = await (
      await workos.userManagement.listOrganizationMemberships({
        organizationId,
        statuses: ["active", "inactive", "pending"],
        userId: user.id,
      })
    ).autoPagination();
    memberships.push(
      ...userMemberships.map((membership) => ({
        id: membership.id,
        status: membership.status,
        userId: membership.userId,
      }))
    );
  }

  return {
    invitations: targetInvitations,
    memberships,
    users: [...usersByEmail.values()],
  };
}

async function resolveAdminIdentity(
  organizationId: string,
  workos: WorkOS
): Promise<ConvexIdentity> {
  const adminEmail = requiredEnv("ALL_ROLE_LOGIN_EMAIL").toLowerCase();
  const users = await (
    await workos.userManagement.listUsers({ email: adminEmail })
  ).autoPagination();
  const exactUsers = users.filter(
    (user) => user.email.trim().toLowerCase() === adminEmail
  );
  if (exactUsers.length !== 1) {
    throw new Error(
      "Expected exactly one WorkOS admin identity for " +
        adminEmail +
        "; found " +
        exactUsers.length +
        "."
    );
  }
  const [admin] = exactUsers;
  if (!admin) {
    throw new Error("WorkOS admin identity " + adminEmail + " was not found.");
  }

  const memberships = await (
    await workos.userManagement.listOrganizationMemberships({
      organizationId,
      statuses: ["active"],
      userId: admin.id,
    })
  ).autoPagination();
  const roles = [
    ...new Set(
      memberships.flatMap((membership) => [
        membership.role?.slug,
        ...(membership.roles ?? []).map((role) => role.slug),
      ])
    ),
  ].filter((role): role is string => Boolean(role));
  if (!roles.includes("admin")) {
    throw new Error(
      "WorkOS admin identity " +
        adminEmail +
        " has no active admin role in " +
        organizationId +
        "."
    );
  }

  return {
    email: admin.email,
    organizationId,
    role: "admin",
    roles: ["admin", ...roles.filter((role) => role !== "admin")],
    subject: admin.id,
    tokenIdentifier: "https://api.workos.com/|" + admin.id,
  };
}

function parseConvexJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Convex returned no JSON output.");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    }
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
    }
    throw new Error("Convex returned output that was not valid JSON.");
  }
}

function runConvex<T>(
  deployment: string,
  identity: ConvexIdentity,
  functionName: string,
  args: Record<string, unknown>
): T {
  const result = Bun.spawnSync({
    cmd: [
      "bun",
      "x",
      "convex",
      "run",
      functionName,
      JSON.stringify(args),
      "--deployment",
      convexCliDeployment(deployment),
      "--identity",
      JSON.stringify(identity),
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    env: process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0) {
    throw new Error(
      "Convex " +
        functionName +
        " failed with exit code " +
        result.exitCode +
        ": " +
        (stderr || stdout).trim().slice(0, 1000)
    );
  }
  return parseConvexJson(stdout) as T;
}

function tableBatches(batchSize: number) {
  const batches: string[][] = [];
  for (let index = 0; index < QA_CLEANUP_TABLES.length; index += batchSize) {
    batches.push([...QA_CLEANUP_TABLES.slice(index, index + batchSize)]);
  }
  return batches;
}

function referenceKey(reference: ConvexReference) {
  return reference.tableName + ":" + reference.documentId;
}

async function scanReferences(
  options: CleanupOptions,
  identity: ConvexIdentity,
  targetEmails: string[],
  targetWorkosUserIds: string[],
  targetWorkosInvitationIds: string[],
  initialKnownIds: string[]
) {
  const references = new Map<string, ConvexReference>();
  const knownIds = new Set(initialKnownIds);
  const batches = tableBatches(options.batchSize);

  for (let pass = 0; pass < options.maxPasses; pass += 1) {
    let addedDocumentIds = 0;
    for (const tableNames of batches) {
      const result = runConvex<ConvexScanResult>(
        options.deployment,
        identity,
        "qaIdentityCleanup:scan",
        {
          knownDocumentIds: [...knownIds],
          tableNames,
          targetEmails,
          targetWorkosInvitationIds,
          targetWorkosUserIds,
        }
      );
      for (const reference of result.references) {
        references.set(referenceKey(reference), reference);
        if (!knownIds.has(reference.documentId)) {
          knownIds.add(reference.documentId);
          addedDocumentIds += 1;
        }
        for (const relatedId of reference.relatedIds ?? []) {
          if (!knownIds.has(relatedId)) {
            knownIds.add(relatedId);
            addedDocumentIds += 1;
          }
        }
      }
    }
    if (addedDocumentIds === 0) {
      break;
    }
  }

  return {
    knownIds: [...knownIds],
    references: [...references.values()],
  };
}

function countReferences(references: ConvexReference[]) {
  return Object.fromEntries(
    [...new Set(references.map((reference) => reference.tableName))]
      .sort()
      .map((tableName) => [
        tableName,
        references.filter((reference) => reference.tableName === tableName)
          .length,
      ])
  );
}

function protectedReferences(references: ConvexReference[]) {
  return references.filter(
    (reference) =>
      isQaProtectedTableName(reference.tableName) &&
      !reference.projectionDeleted
  );
}

function projectionIdentityIds(
  references: ConvexReference[],
  targetWorkosUserIds: readonly string[],
  memberships: readonly TargetMembership[]
) {
  const userIds = new Set(targetWorkosUserIds);
  const membershipIdsByUser = new Map<string, Set<string>>();

  for (const membership of memberships) {
    const ids = membershipIdsByUser.get(membership.userId) ?? new Set<string>();
    ids.add(membership.id);
    membershipIdsByUser.set(membership.userId, ids);
  }

  for (const reference of references) {
    if (reference.tableName === "users") {
      for (const relatedId of reference.relatedIds ?? []) {
        if (relatedId.startsWith("user_")) {
          userIds.add(relatedId);
        }
      }
      continue;
    }
    if (reference.tableName !== "workosOrganizationMemberships") {
      continue;
    }

    const relatedUserIds = (reference.relatedIds ?? []).filter((relatedId) =>
      relatedId.startsWith("user_")
    );
    const relatedMembershipIds = (reference.relatedIds ?? []).filter(
      (relatedId) => relatedId.startsWith("om_")
    );
    for (const userId of relatedUserIds) {
      userIds.add(userId);
      const ids = membershipIdsByUser.get(userId) ?? new Set<string>();
      for (const membershipId of relatedMembershipIds) {
        ids.add(membershipId);
      }
      membershipIdsByUser.set(userId, ids);
    }
  }

  return { membershipIdsByUser, userIds };
}

function reconcileDeletedProjections(
  options: CleanupOptions,
  identity: ConvexIdentity,
  organizationId: string,
  projectedIdentityIds: ReturnType<typeof projectionIdentityIds>
) {
  for (const workosUserId of projectedIdentityIds.userIds) {
    runConvex<{
      membershipEvents: number;
      userEvents: number;
    }>(
      options.deployment,
      identity,
      "qaIdentityCleanup:reconcileWorkosDeletion",
      {
        organizationId,
        workosMembershipIds: [
          ...(projectedIdentityIds.membershipIdsByUser.get(workosUserId) ?? []),
        ],
        workosUserId,
      }
    );
  }
}

function assertSafeReferences(references: ConvexReference[]) {
  const brokerageReferences = references.filter(
    (reference) => reference.tableName === "brokerages"
  );
  if (brokerageReferences.length > 0) {
    throw new Error(
      "Refusing cleanup because a QA identity appears in brokerage root records: " +
        JSON.stringify(brokerageReferences)
    );
  }
}

async function deleteApplicationReferences(
  options: CleanupOptions,
  identity: ConvexIdentity,
  references: ConvexReference[]
) {
  const byTable = new Map<string, string[]>();
  for (const reference of references) {
    if (isQaProtectedTableName(reference.tableName)) {
      continue;
    }
    const documentIds = byTable.get(reference.tableName) ?? [];
    documentIds.push(reference.documentId);
    byTable.set(reference.tableName, documentIds);
  }

  let deletedCount = 0;
  for (const [tableName, documentIds] of byTable) {
    for (
      let index = 0;
      index < documentIds.length;
      index += MAX_DELETE_BATCH_SIZE
    ) {
      const result = runConvex<{
        deletedCount: number;
        tableName: string;
      }>(options.deployment, identity, "qaIdentityCleanup:deleteReferences", {
        documentIds: documentIds.slice(index, index + MAX_DELETE_BATCH_SIZE),
        tableName,
      });
      deletedCount += result.deletedCount;
    }
  }
  return deletedCount;
}

async function waitForProjectionConvergence(
  options: CleanupOptions,
  identity: ConvexIdentity,
  organizationId: string,
  targetEmails: string[],
  targetWorkosUserIds: string[],
  targetWorkosInvitationIds: string[],
  knownIds: string[],
  projectedIdentityIds: ReturnType<typeof projectionIdentityIds>
) {
  const deadline = Date.now() + options.waitMs;
  let remaining: ConvexReference[] = [];
  while (Date.now() <= deadline) {
    remaining = (
      await scanReferences(
        options,
        identity,
        targetEmails,
        targetWorkosUserIds,
        targetWorkosInvitationIds,
        knownIds
      )
    ).references;
    if (remaining.length === 0) {
      return remaining;
    }
    if (protectedReferences(remaining).length > 0) {
      reconcileDeletedProjections(
        options,
        identity,
        organizationId,
        projectedIdentityIds
      );
    }
    await Bun.sleep(5000);
  }
  return remaining;
}

async function main() {
  const options = parseOptions();
  assertDevelopmentTarget(options);
  const organizationId = requiredEnvOrDefault(
    "VITE_DRAWFLOW_FAIRLEND_ORG_ID",
    DEFAULT_ORGANIZATION_ID
  );
  const workos = new WorkOS(requiredEnv("WORKOS_API_KEY"));
  const identity = await resolveAdminIdentity(organizationId, workos);
  const workosCollections = await getWorkosCollections(
    options,
    organizationId,
    workos
  );
  const targetWorkosUserIds = workosCollections.users.map((user) => user.id);
  const targetWorkosInvitationIds = workosCollections.invitations.map(
    (invitation) => invitation.id
  );
  const knownWorkosIds = [
    ...targetWorkosInvitationIds,
    ...workosCollections.memberships.map((membership) => membership.id),
    ...options.emails.map(provisionalBuilderWorkosUserId),
  ];

  const scanned = await scanReferences(
    options,
    identity,
    options.emails,
    targetWorkosUserIds,
    targetWorkosInvitationIds,
    knownWorkosIds
  );
  assertSafeReferences(scanned.references);

  const applicationReferences = scanned.references.filter(
    (reference) => !isQaProtectedTableName(reference.tableName)
  );
  const projections = protectedReferences(scanned.references);
  console.log(
    JSON.stringify(
      {
        applicationReferenceCounts: countReferences(applicationReferences),
        confirm: options.confirm,
        deployment: options.deployment,
        protectedProjectionReferenceCounts: countReferences(projections),
        targetEmails: options.emails,
        workos: {
          invitations: workosCollections.invitations,
          memberships: workosCollections.memberships,
          users: workosCollections.users,
        },
      },
      null,
      2
    )
  );

  if (!options.confirm) {
    console.log(
      "Dry run complete. Re-run with --confirm only after reviewing the exact target counts above."
    );
    return;
  }

  const deletedApplicationReferences = await deleteApplicationReferences(
    options,
    identity,
    applicationReferences
  );
  let revokedInvitations = 0;
  for (const invitation of workosCollections.invitations) {
    if (invitation.state !== "pending") {
      continue;
    }
    await workos.userManagement.revokeInvitation(invitation.id);
    revokedInvitations += 1;
  }
  for (const user of workosCollections.users) {
    await workos.userManagement.deleteUser(user.id);
  }

  const projectedIdentityIds = projectionIdentityIds(
    scanned.references,
    targetWorkosUserIds,
    workosCollections.memberships
  );
  reconcileDeletedProjections(
    options,
    identity,
    organizationId,
    projectedIdentityIds
  );

  const remainingUsers: TargetUser[] = [];
  for (const email of options.emails) {
    const users = await (
      await workos.userManagement.listUsers({ email })
    ).autoPagination();
    remainingUsers.push(
      ...users
        .filter((user) => user.email.trim().toLowerCase() === email)
        .map((user) => ({
          email: user.email,
          emailVerified: user.emailVerified,
          id: user.id,
        }))
    );
  }
  if (remainingUsers.length > 0) {
    throw new Error(
      "WorkOS cleanup did not remove every target user: " +
        JSON.stringify(remainingUsers)
    );
  }

  const remainingReferences = await waitForProjectionConvergence(
    options,
    identity,
    organizationId,
    options.emails,
    targetWorkosUserIds,
    targetWorkosInvitationIds,
    [
      ...scanned.knownIds,
      ...scanned.references.map((reference) => reference.documentId),
    ],
    projectedIdentityIds
  );
  const remainingApplicationReferences = remainingReferences.filter(
    (reference) => !isQaProtectedTableName(reference.tableName)
  );
  const remainingProtectedReferences = protectedReferences(remainingReferences);
  if (remainingApplicationReferences.length > 0) {
    throw new Error(
      "Application references remain after cleanup: " +
        JSON.stringify(countReferences(remainingApplicationReferences))
    );
  }
  if (remainingProtectedReferences.length > 0) {
    throw new Error(
      "WorkOS projection references did not converge before timeout: " +
        JSON.stringify(countReferences(remainingProtectedReferences)) +
        ". Do not delete projection rows directly; wait for WorkOS webhook delivery and rerun the read-only scan."
    );
  }

  console.log(
    JSON.stringify(
      {
        deletedApplicationReferences,
        pendingInvitationsRevoked: revokedInvitations,
        protectedProjectionReferencesRemaining: 0,
        targetEmails: options.emails,
        workosUsersDeleted: targetWorkosUserIds.length,
      },
      null,
      2
    )
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
