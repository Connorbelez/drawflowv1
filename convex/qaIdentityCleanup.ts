import { v } from "convex/values";

import { internal } from "./_generated/api";
import { adminMutation, adminQuery } from "./authz";
import {
  isQaCleanupTableName,
  isQaProtectedTableName,
} from "./qaIdentityCleanupTables";
import type { Id, TableNames } from "./types";

const QA_EMAIL_PATTERN = /^drawflow-[a-z0-9]+(?:-[a-z0-9]+)*@agentmail\.to$/;
const MAX_REFERENCES_PER_SCAN = 2000;

const qaReference = v.object({
  documentId: v.string(),
  matchedValues: v.array(v.string()),
  relatedIds: v.array(v.string()),
  projectionDeleted: v.boolean(),
  tableName: v.string(),
});

const scanInput = {
  knownDocumentIds: v.array(v.string()),
  tableNames: v.array(v.string()),
  targetEmails: v.array(v.string()),
  targetWorkosInvitationIds: v.array(v.string()),
  targetWorkosUserIds: v.array(v.string()),
};

function normalizedTargetEmails(emails: readonly string[]) {
  const normalized = [
    ...new Set(emails.map((email) => email.trim().toLowerCase())),
  ];
  for (const email of normalized) {
    if (!QA_EMAIL_PATTERN.test(email)) {
      throw new Error(
        `QA cleanup only accepts drawflow-*@agentmail.to identities; rejected ${email}.`
      );
    }
  }
  return new Set(normalized);
}

function collectStringLeaves(value: unknown, depth = 0): string[] {
  if (depth > 4) {
    return [];
  }
  if (typeof value === "string") {
    const leaves = [value];
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        leaves.push(...collectStringLeaves(JSON.parse(trimmed), depth + 1));
      } catch {
        // The string is not a JSON snapshot. Its exact value is still tested.
      }
    }
    return leaves;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringLeaves(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) =>
      collectStringLeaves(item, depth + 1)
    );
  }
  return [];
}

function matchingValues(
  document: unknown,
  targetEmails: ReadonlySet<string>,
  targetIds: ReadonlySet<string>
) {
  const matches = new Set<string>();
  for (const value of collectStringLeaves(document)) {
    if (targetIds.has(value)) {
      matches.add(value);
      continue;
    }
    const normalized = value.trim().toLowerCase();
    if (targetEmails.has(normalized)) {
      matches.add(value);
    }
  }
  return [...matches];
}

function isIdentityRelationKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return new Set([
    "builderprofileid",
    "builderaccountlinkid",
    "builderassignmentid",
    "contractorprofileid",
    "contractoridentitylinkid",
    "contractorinviteclaimid",
    "contractoronboardingreviewid",
    "workosuserid",
    "workosinvitationid",
    "workosmembershipid",
    "communicationintentid",
    "communicationattemptid",
    "communicationoutcomeid",
    "communicationproviderreservationid",
    "emailmessageid",
    "emaildeliveryeventid",
    "invitationclaimid",
    "onboardingreviewid",
  ]).has(normalized);
}

function collectIdentityRelationIds(
  value: unknown,
  key = "",
  depth = 0
): string[] {
  if (depth > 4) {
    return [];
  }
  if (typeof value === "string") {
    const values = isIdentityRelationKey(key) ? [value] : [];
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        values.push(
          ...collectIdentityRelationIds(JSON.parse(trimmed), key, depth + 1)
        );
      } catch {
        // The string is not a JSON snapshot.
      }
    }
    return values;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectIdentityRelationIds(item, key, depth + 1)
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([childKey, childValue]) =>
      collectIdentityRelationIds(childValue, childKey, depth + 1)
    );
  }
  return [];
}

function validateTableNames(tableNames: readonly string[]) {
  const unique = [...new Set(tableNames)];
  for (const tableName of unique) {
    if (!isQaCleanupTableName(tableName)) {
      throw new Error(`Unsupported QA cleanup table: ${tableName}`);
    }
  }
  return unique;
}

/**
 * Read-only, admin-gated QA reference scanner. WorkOS projection tables are
 * intentionally scanned but never deleted here; WorkOS deletion and its
 * webhook are the authoritative projection lifecycle.
 */
export const scan = adminQuery
  .input(scanInput)
  .returns(
    v.object({
      references: v.array(qaReference),
      scannedTables: v.array(v.string()),
    })
  )
  .handler(async (ctx, args) => {
    const tableNames = validateTableNames(args.tableNames);
    const targetEmails = normalizedTargetEmails(args.targetEmails);
    const targetIds = new Set(
      [
        ...args.knownDocumentIds,
        ...args.targetWorkosInvitationIds,
        ...args.targetWorkosUserIds,
      ].filter(Boolean)
    );
    const references: Array<{
      documentId: string;
      matchedValues: string[];
      relatedIds: string[];
      tableName: string;
      projectionDeleted: boolean;
    }> = [];

    for (const tableName of tableNames) {
      const documents = await ctx.db.query(tableName as TableNames).collect();
      for (const document of documents) {
        const matched = matchingValues(document, targetEmails, targetIds);
        if (matched.length === 0) {
          continue;
        }
        references.push({
          documentId: String((document as { _id: string })._id),
          matchedValues: matched,
          relatedIds: [...new Set(collectIdentityRelationIds(document))],
          projectionDeleted:
            isQaProtectedTableName(tableName) &&
            (document as { deletedAt?: unknown; status?: unknown }).status ===
              "deleted",
          tableName,
        });
        if (references.length >= MAX_REFERENCES_PER_SCAN) {
          throw new Error(
            `QA cleanup scan exceeded ${MAX_REFERENCES_PER_SCAN} references; narrow the target identities before retrying.`
          );
        }
      }
    }

    return { references, scannedTables: tableNames };
  })
  .public();

/**
 * Delete only application-owned rows identified by the read-only scanner.
 * Projection rows are rejected so WorkOS remains the only identity owner.
 */
export const deleteReferences = adminMutation
  .input({
    documentIds: v.array(v.string()),
    tableName: v.string(),
  })
  .returns(
    v.object({
      deletedCount: v.number(),
      tableName: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    if (!isQaCleanupTableName(args.tableName)) {
      throw new Error(`Unsupported QA cleanup table: ${args.tableName}`);
    }
    if (isQaProtectedTableName(args.tableName)) {
      throw new Error(
        `Refusing to delete ${args.tableName}; WorkOS projection or shared tenancy state is webhook/application controlled.`
      );
    }

    let deletedCount = 0;
    for (const documentId of new Set(args.documentIds)) {
      const document = await ctx.db.get(documentId as Id<TableNames>);
      if (!document) {
        continue;
      }
      await ctx.db.delete(documentId as Id<TableNames>);
      deletedCount += 1;
    }
    return { deletedCount, tableName: args.tableName };
  })
  .public();

/**
 * Feed explicit WorkOS deletion events through the canonical projection
 * processor for development cleanup. This keeps WorkOS projection ownership
 * with the webhook/event boundary instead of mutating projection tables here.
 */
export const reconcileWorkosDeletion = adminMutation
  .input({
    organizationId: v.string(),
    workosMembershipIds: v.array(v.string()),
    workosUserId: v.string(),
  })
  .returns(
    v.object({
      membershipEvents: v.number(),
      userEvents: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const createdAt = new Date().toISOString();
    const eventSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
      created_at: createdAt,
      data: { id: args.workosUserId },
      event: "user.deleted",
      id: `qa-cleanup:user.deleted:${args.workosUserId}:${eventSuffix}`,
    });

    for (const membershipId of args.workosMembershipIds) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        created_at: createdAt,
        data: {
          id: membershipId,
          organization_id: args.organizationId,
          user_id: args.workosUserId,
        },
        event: "organization_membership.deleted",
        id: `qa-cleanup:organization_membership.deleted:${membershipId}:${eventSuffix}`,
      });
    }

    return {
      membershipEvents: args.workosMembershipIds.length,
      userEvents: 1,
    };
  })
  .public();
