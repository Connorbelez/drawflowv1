/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { operationalRequestFingerprint } from "./build_operational_idempotency";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { assertProposalLenderApprovalTimestamps } from "./production_proposals";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_production_foundation";
const APP_PERMISSION_RESOURCES = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "contractor",
  "material",
  "capitalEvent",
  "reminder",
] as const;

function tiptapDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

const EMPTY_TIPTAP_DOCUMENT = JSON.stringify({
  content: [{ type: "paragraph" }],
  type: "doc",
});

const PHASE4_CONFIRMATION_CHECKPOINTS = [
  "milestoneCount",
  "budget",
  "scheduleTimeline",
  "builder",
  "accessReviewPolicy",
] as const;
const PHASE4_HISTORY_PAGE = { cursor: null, numItems: 50 };

async function phase4CommandBaseForTest(t: any, proposalId: any) {
  const projection = await t.query(
    (api as any).production_proposals.getBackofficeProposalRemediation,
    {
      historyPaginationOpts: PHASE4_HISTORY_PAGE,
      proposalId,
      workosOrganizationId: ORG,
    },
  );
  if (!projection.currentCycle) {
    throw new Error("Phase 4 test fixture is missing its current confirmation cycle.");
  }
  return {
    expectedAssignmentId: projection.currentCycle.assignmentId,
    expectedConfirmationCycleId:
      projection.currentCycle.confirmationCycleId,
    expectedProposalRevisionId:
      projection.currentCycle.proposalRevisionId,
  };
}

async function approveCurrentProposalConfirmationForTest(
  t: any,
  lenderViewer: any,
  proposalId: any,
  lenderWorkosOrganizationId: string,
  idempotencyKeyPrefix: string,
  reason: string,
) {
  const commandBase = await phase4CommandBaseForTest(t, proposalId);
  for (const [index, checkpoint] of PHASE4_CONFIRMATION_CHECKPOINTS.entries()) {
    await lenderViewer.mutation(
      (api as any).production_proposals
        .acknowledgeProposalConfirmationCheckpoint,
      {
        ...commandBase,
        checkpoint,
        idempotencyKey: `${idempotencyKeyPrefix}:ack:${index + 1}`,
        proposalId,
        workosOrganizationId: lenderWorkosOrganizationId,
      },
    );
  }
  return await lenderViewer.mutation(
    (api as any).production_proposals.approveExternalProposalForClosing,
    {
      ...commandBase,
      idempotencyKey: `${idempotencyKeyPrefix}:approve`,
      proposalId,
      reason,
      workosOrganizationId: lenderWorkosOrganizationId,
    },
  );
}

async function seededPhase4Proposal(buildName: string) {
  const { base, seed, t } = await seeded(["admin"], "user_admin");
  const lender = await seedExternalLenderOrganization(t, {
    organizationId: `org_${buildName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    userId: `user_${buildName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  });
  const proposalId = await createSubmittedProposal(t, seed, {
    buildName,
    capitalSource: "external",
  });
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Approve the Phase 4 confirmation fixture.",
    workosOrganizationId: ORG,
  });
  await t.mutation(
    (api as any).production_proposals.assignExternalLenderOrganization,
    {
      lenderOrganizationId: lender.lenderOrganizationId,
      proposalId,
      reason: "Assign the Phase 4 confirmation fixture.",
      workosOrganizationId: ORG,
    },
  );
  return {
    base,
    lender,
    lenderViewer: withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    ),
    proposalId,
    t,
  };
}

describe("Lender Portal Phase 4 confirmation and remediation", () => {
  test("requires all immutable checkpoints before lender approval", async () => {
    const { base, lender, lenderViewer, proposalId, t } =
      await seededPhase4Proposal("Phase 4 partial confirmation");
    const commandBase = await phase4CommandBaseForTest(t, proposalId);
    const before = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    await lenderViewer.mutation(
      (api as any).production_proposals
        .acknowledgeProposalConfirmationCheckpoint,
      {
        ...commandBase,
        checkpoint: "milestoneCount",
        idempotencyKey: "phase4-partial-milestone-count",
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    const after = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(after.currentCycle.checkpoints).toEqual(
      before.currentCycle.checkpoints,
    );
    expect(after.currentCycle.acknowledgements).toHaveLength(1);
    expect(after.canDecide).toBe(false);
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...commandBase,
          idempotencyKey: "phase4-partial-approval",
          proposalId,
          reason: "Do not approve an incomplete guided confirmation.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("Every proposal confirmation checkpoint");
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals
          .updateProductionProposalProposedStartDate,
        {
          proposedStartDate: "2027-01-15",
          proposalId,
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("Forbidden");
    const staffUserId = "user_phase4_confirmation_staff";
    await seedAdditionalLenderOrganizationMember(t, {
      brokerageId: lender.brokerageId,
      lenderOrganizationId: lender.lenderOrganizationId,
      role: "lender-staff",
      userId: staffUserId,
    });
    const staffViewer = withIdentity(
      base,
      ["lender-staff"],
      staffUserId,
      lender.organizationId,
    );
    for (const [index, checkpoint] of PHASE4_CONFIRMATION_CHECKPOINTS.entries()) {
      await staffViewer.mutation(
        (api as any).production_proposals
          .acknowledgeProposalConfirmationCheckpoint,
        {
          ...commandBase,
          checkpoint,
          idempotencyKey: `phase4-staff-ack-${index + 1}`,
          proposalId,
          workosOrganizationId: lender.organizationId,
        },
      );
    }
    const staffProjection = await staffViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(staffProjection.canDecide).toBe(false);
    await expect(
      staffViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...commandBase,
          idempotencyKey: "phase4-staff-cannot-approve",
          proposalId,
          reason: "Staff cannot make the final lender decision.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("final lender decision authority proposal_review");
  });

  test("rejects acknowledgement replay when the expected assignment changes", async () => {
    const { lender, lenderViewer, proposalId, t } =
      await seededPhase4Proposal("Phase 4 acknowledgement assignment replay");
    const commandBase = await phase4CommandBaseForTest(t, proposalId);
    const command = {
      ...commandBase,
      checkpoint: "milestoneCount" as const,
      idempotencyKey: "phase4-assignment-replay",
      proposalId,
      workosOrganizationId: lender.organizationId,
    };
    await lenderViewer.mutation(
      (api as any).production_proposals
        .acknowledgeProposalConfirmationCheckpoint,
      command,
    );
    const mismatchedAssignmentId = await t.run(async (ctx: any) => {
      const assignment = await ctx.db.get(commandBase.expectedAssignmentId);
      if (!assignment) {
        throw new Error("Phase 4 test assignment is unavailable.");
      }
      const { _creationTime, _id, ...values } = assignment;
      return await ctx.db.insert("proposalLenderAssignments", {
        ...values,
        status: "withdrawn",
      });
    });

    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals
          .acknowledgeProposalConfirmationCheckpoint,
        { ...command, expectedAssignmentId: mismatchedAssignmentId },
      ),
    ).rejects.toThrow(
      "Proposal checkpoint acknowledgement idempotency key was reused with different values.",
    );
  });

  test("declines privately, remediates the same proposal, and opens a full new cycle", async () => {
    const { base, lender, lenderViewer, proposalId, t } =
      await seededPhase4Proposal("Phase 4 remediation loop");
    const firstBase = await phase4CommandBaseForTest(t, proposalId);
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals.declineExternalProposalForClosing,
        {
          ...firstBase,
          declinedCheckpoint: "scheduleTimeline",
          idempotencyKey: "phase4-empty-decline-reason",
          proposalId,
          reason: "   ",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("A reason is required");
    const declineArgs = {
      ...firstBase,
      declinedCheckpoint: "scheduleTimeline" as const,
      idempotencyKey: "phase4-decline-revision-one",
      proposalId,
      reason: "The construction start date needs lender review.",
      workosOrganizationId: lender.organizationId,
    };
    const declined = await lenderViewer.mutation(
      (api as any).production_proposals.declineExternalProposalForClosing,
      declineArgs,
    );
    const declinedRetry = await lenderViewer.mutation(
      (api as any).production_proposals.declineExternalProposalForClosing,
      declineArgs,
    );
    expect(declinedRetry).toEqual(declined);
    const proposalAfterDecline = await base.run((ctx: any) =>
      ctx.db.get(proposalId),
    );
    expect(proposalAfterDecline).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    const remediation = await t.query(
      (api as any).production_proposals.getBackofficeProposalRemediation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(remediation.remediation).toMatchObject({
      declinedCheckpoint: "scheduleTimeline",
      declinedProposalRevisionId: firstBase.expectedProposalRevisionId,
      editableProposalId: proposalId,
      privateReason: "The construction start date needs lender review.",
      updateRequired: true,
    });
    const builder = withIdentity(base, ["builder"], "user_builder", ORG);
    const builderProjection = await builder.query(
      (api as any).production_proposals.getBuilderProposalConfirmationState,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(builderProjection).toMatchObject({
      lifecycle: { lenderConfirmation: "declined" },
      updateRequired: true,
    });
    expect(JSON.stringify(builderProjection)).not.toContain(lender.userId);
    expect(JSON.stringify(builderProjection)).not.toContain(
      "construction start date needs lender review",
    );

    await t.mutation(
      (api as any).production_proposals
        .updateProductionProposalProposedStartDate,
      {
        proposedStartDate: "2027-01-15",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.publishProposalRevision,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase4-publish-remediation-two",
        proposalId,
        reason: "Publish the same-proposal schedule remediation.",
        workosOrganizationId: ORG,
      },
    );
    const lenderAfterPublish = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(lenderAfterPublish).toMatchObject({
      canDecide: false,
      closingGateSatisfied: false,
      currentCycle: {
        acknowledgements: [],
        changedCheckpoints: ["scheduleTimeline"],
        status: "pending",
      },
      lenderNeedsAction: true,
    });
    expect(lenderAfterPublish.history.page).toHaveLength(2);
    expect(new Set(
      lenderAfterPublish.history.page.map((cycle: any) => cycle.confirmationCycleId),
    ).size).toBe(2);
    const backofficeAfterPublish = await t.query(
      (api as any).production_proposals.getBackofficeProposalRemediation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(backofficeAfterPublish).toMatchObject({
      lenderNeedsAction: true,
      remediation: null,
    });
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...firstBase,
          idempotencyKey: "phase4-stale-revision-one-approval",
          proposalId,
          reason: "Do not approve the superseded revision.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("Stale proposal confirmation assignment or revision");

    const secondBase = await phase4CommandBaseForTest(t, proposalId);
    const secondDeclineArgs = {
      ...secondBase,
      declinedCheckpoint: "scheduleTimeline" as const,
      idempotencyKey: "phase4-decline-revision-two",
      proposalId,
      reason: "The remediated start date still needs adjustment.",
      workosOrganizationId: lender.organizationId,
    };
    const secondDecline = await lenderViewer.mutation(
      (api as any).production_proposals.declineExternalProposalForClosing,
      secondDeclineArgs,
    );
    expect(
      await lenderViewer.mutation(
        (api as any).production_proposals.declineExternalProposalForClosing,
        secondDeclineArgs,
      ),
    ).toEqual(secondDecline);
    await t.mutation(
      (api as any).production_proposals
        .updateProductionProposalProposedStartDate,
      {
        proposedStartDate: "2027-02-01",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.publishProposalRevision,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase4-publish-remediation-three",
        proposalId,
        reason: "Publish the second same-proposal schedule remediation.",
        workosOrganizationId: ORG,
      },
    );
    const thirdCycle = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: { cursor: null, numItems: 2 },
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(thirdCycle.history.page).toHaveLength(2);
    expect(thirdCycle.history.isDone).toBe(false);
    expect(thirdCycle.currentCycle).toMatchObject({
      acknowledgements: [],
      changedCheckpoints: ["scheduleTimeline"],
      status: "pending",
    });
    const finalHistoryPage = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: {
          cursor: thirdCycle.history.continueCursor,
          numItems: 2,
        },
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(finalHistoryPage.history.page).toHaveLength(1);
    expect(finalHistoryPage.history.isDone).toBe(true);
    expect(
      new Set(
        [...thirdCycle.history.page, ...finalHistoryPage.history.page].map(
          (cycle: any) => cycle.confirmationCycleId,
        ),
      ).size,
    ).toBe(3);

    const finalApproval = await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase4-approve-remediation-two",
      "Approve the fully reconfirmed revision.",
    );
    expect(
      await approveCurrentProposalConfirmationForTest(
        t,
        lenderViewer,
        proposalId,
        lender.organizationId,
        "phase4-approve-remediation-two",
        "Approve the fully reconfirmed revision.",
      ),
    ).toEqual(finalApproval);
    const approved = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalConfirmation,
      {
        historyPaginationOpts: PHASE4_HISTORY_PAGE,
        proposalId,
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(approved).toMatchObject({
      closingGateSatisfied: true,
      currentCycle: { status: "approved" },
      lenderNeedsAction: false,
    });
    expect(approved.history.page).toHaveLength(3);
    expect(approved.currentCycle.acknowledgements).toHaveLength(5);
  });

  test("serializes competing approve and decline decisions without duplicate history", async () => {
    const { base, lender, lenderViewer, proposalId, t } =
      await seededPhase4Proposal("Phase 4 competing decisions");
    const commandBase = await phase4CommandBaseForTest(t, proposalId);
    for (const [index, checkpoint] of PHASE4_CONFIRMATION_CHECKPOINTS.entries()) {
      await lenderViewer.mutation(
        (api as any).production_proposals
          .acknowledgeProposalConfirmationCheckpoint,
        {
          ...commandBase,
          checkpoint,
          idempotencyKey: `phase4-race-ack-${index + 1}`,
          proposalId,
          workosOrganizationId: lender.organizationId,
        },
      );
    }
    const outcomes = await Promise.allSettled([
      lenderViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...commandBase,
          idempotencyKey: "phase4-race-approve",
          proposalId,
          reason: "Approve the current confirmation cycle.",
          workosOrganizationId: lender.organizationId,
        },
      ),
      lenderViewer.mutation(
        (api as any).production_proposals.declineExternalProposalForClosing,
        {
          ...commandBase,
          declinedCheckpoint: "budget",
          idempotencyKey: "phase4-race-decline",
          proposalId,
          reason: "Decline the current confirmation cycle.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled"))
      .toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected"))
      .toHaveLength(1);
    const rows = await base.run(async (ctx: any) => ({
      cycles: await ctx.db
        .query("proposalLenderConfirmationCycles")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .collect(),
      decisions: await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_confirmation_cycle", (query: any) =>
          query.eq(
            "confirmationCycleId",
            commandBase.expectedConfirmationCycleId,
          ),
        )
        .collect(),
    }));
    expect(rows.cycles).toHaveLength(1);
    expect(rows.decisions).toHaveLength(1);
    expect(rows.cycles[0].decisionId).toBe(rows.decisions[0]._id);
  });
});

describe("Lender Portal Phase 3 review policy and revision controls", () => {
  test("rejects proposal approval with an actionable builder prerequisite before lifecycle writes", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 missing builder prerequisite",
      capitalSource: "internal",
    });
    await base.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { builderProfileId: undefined });
    });
    await expect(t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Do not approve without a builder.",
      workosOrganizationId: ORG,
    })).rejects.toThrow("Assign an active builder before approving");
    const proposal = await base.run((ctx: any) => ctx.db.get(proposalId));
    expect(proposal).toMatchObject({ reviewOutcome: "none", status: "submitted" });
  });

  test("returns an explicit Builder-safe proposal detail without internal identities or audit payloads", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 Builder privacy projection",
      capitalSource: "internal",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the Builder privacy projection fixture.",
      workosOrganizationId: ORG,
    });
    const builder = withIdentity(base, ["builder"], "user_builder", ORG);
    const [byId, byString] = await Promise.all([
      builder.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
      builder.query((api as any).production_proposals.getProposalDetailByString, {
        proposalId: String(proposalId),
        workosOrganizationId: ORG,
      }),
    ]);

    for (const detail of [byId, byString]) {
      expect(detail.proposal).toMatchObject({
        buildName: "Phase 3 Builder privacy projection",
        status: "approved",
      });
      expect(detail.proposal.backOfficeApprovedByWorkosUserId).toBeUndefined();
      expect(detail.proposal.createdByWorkosUserId).toBeUndefined();
      expect(detail.proposal.updatedByWorkosUserId).toBeUndefined();
      expect(detail.proposal.currentReviewPolicyVersionId).toBeUndefined();
      expect(detail.proposal.lockedReviewPolicyId).toBeUndefined();
      expect(detail.assignment?.broker).toBeUndefined();
      expect(detail.assignment?.createdBy).toBeUndefined();
      expect(detail.documents.every((document: any) =>
        document.uploadedByWorkosUserId === undefined
      )).toBe(true);
      expect(detail.auditEvents ?? []).toEqual([]);
      expect(detail.events ?? []).toEqual([]);
      expect(JSON.stringify(detail)).not.toContain("user_admin");
    }
  });

  test("keeps monotonic immutable revisions, deterministic checkpoint diffs, exact-revision decisions, and copied closing lock evidence", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_revision_lender",
      userId: "user_phase3_revision_lender",
    });
    await seedAdditionalLenderOrganizationMember(t, {
      brokerageId: lender.brokerageId,
      lenderOrganizationId: lender.lenderOrganizationId,
      userId: "user_phase3_revision_lender_2",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 immutable revision proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the initial reviewable revision.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the Phase 3 lender.",
        workosOrganizationId: ORG,
      },
    );
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    const firstControl = await t.query(
      (api as any).production_proposals.getProposalPhase3ReviewControl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(firstControl.revisions.map((revision: any) => revision.revisionNumber)).toEqual([
      1,
      2,
    ]);
    const lenderReviewedSnapshot = structuredClone(
      firstControl.revisions[1].checkpoints,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-revision-two",
      "Approve revision two.",
    );

    const policyInput = {
      drawApprovalMode: "both" as const,
      drawLenderQuorum: 2,
      milestoneApprovalMode: "lender_quorum" as const,
      milestoneLenderQuorum: 1,
      milestoneReceiptInvoiceRequired: true,
      milestoneSiteVisitRequired: false,
    };
    const configured = await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-revision-policy-v2",
        policy: policyInput,
        proposalId,
        reason: "Require lender participation in Build reviews.",
        workosOrganizationId: ORG,
      },
    );
    const configuredRetry = await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-revision-policy-v2",
        policy: policyInput,
        proposalId,
        reason: "Require lender participation in Build reviews.",
        workosOrganizationId: ORG,
      },
    );
    expect(configuredRetry).toEqual(configured);
    expect(configured).toMatchObject({ revisionNumber: 3 });

    const revisedControl = await t.query(
      (api as any).production_proposals.getProposalPhase3ReviewControl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(revisedControl).toMatchObject({
      currentRevisionNumber: 3,
      latestLenderReviewedRevisionNumber: 2,
    });
    expect(revisedControl.revisions[1].checkpoints).toEqual(
      lenderReviewedSnapshot,
    );
    expect(revisedControl.revisions[2]).toMatchObject({
      changedCheckpoints: ["accessReviewPolicy"],
      priorLenderReviewedRevisionId:
        revisedControl.revisions[1].proposalRevisionId,
      revisionNumber: 3,
    });
    await expect(
      t.mutation((api as any).production_proposals.publishProposalRevision, {
        expectedAssignmentId: revisedControl.currentAssignmentId,
        expectedProposalRevisionNumber: 2,
        idempotencyKey: "phase3-stale-base-publication",
        proposalId,
        reason: "Reject publication from a stale base revision.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Stale proposal revision");
    const publicationBase = await phase3CommandBaseForTest(t, proposalId);
    const publications = await Promise.allSettled([
      t.mutation((api as any).production_proposals.publishProposalRevision, {
        ...publicationBase,
        idempotencyKey: "phase3-concurrent-publication-a",
        proposalId,
        reason: "Publish competing revision A.",
        workosOrganizationId: ORG,
      }),
      t.mutation((api as any).production_proposals.publishProposalRevision, {
        ...publicationBase,
        idempotencyKey: "phase3-concurrent-publication-b",
        proposalId,
        reason: "Publish competing revision B.",
        workosOrganizationId: ORG,
      }),
    ]);
    expect(publications.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(publications.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-stale-lock",
        proposalId,
        reason: "Reject the stale revision decision.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Current lender-reviewed proposal revision");

    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-revision-three",
      "Approve revision three.",
    );
    const locked = await t.mutation(
      (api as any).production_proposals.lockProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-final-policy-lock",
        proposalId,
        reason: "Lock the lender-confirmed policy.",
        workosOrganizationId: ORG,
      },
    );
    const lockRetry = await t.mutation(
      (api as any).production_proposals.lockProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-final-policy-lock",
        proposalId,
        reason: "Lock the lender-confirmed policy.",
        workosOrganizationId: ORG,
      },
    );
    expect(lockRetry).toEqual(locked);
    expect(locked.activeLenderMemberCount).toBe(2);
    const builderViewer = withIdentity(base, ["builder"], "user_builder", ORG);
    const [builderControl, lenderControl] = await Promise.all([
      builderViewer.query(
        (api as any).production_proposals.getProposalPhase3ReviewControl,
        { proposalId, workosOrganizationId: ORG },
      ),
      lenderViewer.query(
        (api as any).production_proposals.getProposalPhase3ReviewControl,
        { proposalId, workosOrganizationId: lender.organizationId },
      ),
    ]);
    for (const control of [builderControl, lenderControl]) {
      expect(control.lock.lockedByWorkosUserId).toBeUndefined();
      expect(control.lock.reason).toBeUndefined();
      expect(control.policyVersions[0].configuredByWorkosUserId).toBeUndefined();
      expect(control.policyVersions[0].reason).toBeUndefined();
      expect(control.policyVersions[0].idempotencyKey).toBeUndefined();
      expect(control.policyVersions[0].organizationId).toBeUndefined();
      expect(control.revisions[0].createdByWorkosUserId).toBeUndefined();
      expect(
        control.revisions[0].backOfficeApprovedByWorkosUserId,
      ).toBeUndefined();
      expect(control.revisions[0].reason).toBeUndefined();
      expect(control.revisions[0].idempotencyKey).toBeUndefined();
      expect(control.revisions[0].organizationId).toBeUndefined();
      expect(control.lock.idempotencyKey).toBeUndefined();
      expect(control.lock.organizationId).toBeUndefined();
    }
    expect(builderControl.lock.lenderOrganizationId).toBeUndefined();
    expect(builderControl.lock.activeLenderMemberCount).toBeUndefined();
    expect(builderControl.lock.eligibleLenderApproverCount).toBeUndefined();
    expect(builderControl.lock.eligibleLenderApproverCounts).toBeUndefined();
    expect(lenderControl.lock.lenderOrganizationId).toBe(lender.lenderOrganizationId);
    expect(lenderControl.lock.eligibleLenderApproverCounts).toEqual({
      draw: 2,
      milestone: 2,
      proposalReview: 2,
    });
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-conflicting-second-lock",
        proposalId,
        reason: "Reject a second policy lock.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("already locked");

    const closingInput = {
      buildStartDate: "2026-09-01",
      ianaTimezone: "America/Toronto",
      loanFacility: {
        interestAnnualBps: 900,
        principalCents: 55_000_000,
      },
      proposalId,
      reason: "Close with the immutable Phase 3 policy.",
      workosOrganizationId: ORG,
    };
    const closingPolicyBase = await phase3CommandBaseForTest(t, proposalId);
    const [closingRace, policyRace] = await Promise.allSettled([
      t.mutation(
        (api as any).production_proposals.recordProposalClosing,
        closingInput,
      ),
      t.mutation(
        (api as any).production_proposals.configureProposalReviewPolicy,
        {
          ...closingPolicyBase,
          idempotencyKey: "phase3-racing-policy-write",
          policy: {
            ...policyInput,
            milestoneSiteVisitRequired: true,
          },
          proposalId,
          reason: "Race a policy mutation against closing.",
          workosOrganizationId: ORG,
        },
      ),
    ]);
    expect(closingRace.status).toBe("fulfilled");
    expect(policyRace.status).toBe("rejected");
    const activated = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Activate the policy-locked Build.",
        workosOrganizationId: ORG,
      },
    );
    const build = await base.run((ctx: any) => ctx.db.get(activated.buildId));
    expect(build).toMatchObject({
      reviewPolicyLockEvidence: {
        activeLenderMemberCount: 2,
        proposalRevisionNumber: 4,
      },
      reviewPolicyLockId: locked.policyLockId,
      reviewPolicySnapshot: {
        drawApprovalMode: "both",
        drawLenderQuorum: 2,
        milestoneApprovalMode: "lender_quorum",
        milestoneLenderQuorum: 1,
        milestoneReceiptInvoiceRequired: true,
        milestoneSiteVisitRequired: false,
      },
    });
  });

  test("accepts every independent approval-mode combination and evidence-switch combination at the command seam", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_mode_lender",
      userId: "user_phase3_mode_lender",
    });
    await seedAdditionalLenderOrganizationMember(t, {
      brokerageId: lender.brokerageId,
      lenderOrganizationId: lender.lenderOrganizationId,
      userId: "user_phase3_mode_lender_2",
    });
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    const modes = ["backoffice_only", "lender_quorum", "both"] as const;

    for (const [drawIndex, drawApprovalMode] of modes.entries()) {
      for (const [milestoneIndex, milestoneApprovalMode] of modes.entries()) {
        const key = `${drawApprovalMode}-${milestoneApprovalMode}`;
        const proposalId = await createSubmittedProposal(t, seed, {
          buildName: `Phase 3 mode ${key}`,
          capitalSource: "external",
        });
        await t.mutation((api as any).production_proposals.approveProposal, {
          proposalId,
          reason: `Approve ${key}.`,
          workosOrganizationId: ORG,
        });
        await t.mutation(
          (api as any).production_proposals.assignExternalLenderOrganization,
          {
            lenderOrganizationId: lender.lenderOrganizationId,
            proposalId,
            reason: `Assign ${key}.`,
            workosOrganizationId: ORG,
          },
        );
        const configured = await t.mutation(
          (api as any).production_proposals.configureProposalReviewPolicy,
          {
            ...(await phase3CommandBaseForTest(t, proposalId)),
            idempotencyKey: `phase3-mode-${key}`,
            policy: {
              drawApprovalMode,
              ...(drawApprovalMode === "backoffice_only"
                ? {}
                : { drawLenderQuorum: 2 }),
              milestoneApprovalMode,
              ...(milestoneApprovalMode === "backoffice_only"
                ? {}
                : { milestoneLenderQuorum: 1 }),
              milestoneReceiptInvoiceRequired: drawIndex % 2 === 0,
              milestoneSiteVisitRequired: milestoneIndex % 2 === 1,
            },
            proposalId,
            reason: `Configure ${key}.`,
            workosOrganizationId: ORG,
          },
        );
        expect(configured.revisionNumber).toBe(3);
        await approveCurrentProposalConfirmationForTest(
          t,
          lenderViewer,
          proposalId,
          lender.organizationId,
          `phase3-confirm-${key}`,
          `Confirm ${key}.`,
        );
        const lock = await t.mutation(
          (api as any).production_proposals.lockProposalReviewPolicy,
          {
            ...(await phase3CommandBaseForTest(t, proposalId)),
            idempotencyKey: `phase3-lock-${key}`,
            proposalId,
            reason: `Lock ${key}.`,
            workosOrganizationId: ORG,
          },
        );
        expect(lock.activeLenderMemberCount).toBe(2);
      }
    }
  });

  test("rejects invalid quorums, stale revision decisions, unauthorized policy writes, and post-lock mutations", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_denial_lender",
      userId: "user_phase3_denial_lender",
    });
    await seedAdditionalLenderOrganizationMember(t, {
      brokerageId: lender.brokerageId,
      lenderOrganizationId: lender.lenderOrganizationId,
      userId: "user_phase3_denial_lender_2",
    });
    await seedAdditionalLenderOrganizationMember(t, {
      brokerageId: lender.brokerageId,
      lenderOrganizationId: lender.lenderOrganizationId,
      role: "lender-staff",
      userId: "user_phase3_denial_staff",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 denial proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the denial fixture.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the denial fixture.",
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(
        (api as any).production_proposals.configureProposalReviewPolicy,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: "phase3-builder-policy-write",
          policy: {
            drawApprovalMode: "backoffice_only",
            milestoneApprovalMode: "backoffice_only",
            milestoneReceiptInvoiceRequired: false,
            milestoneSiteVisitRequired: false,
          },
          proposalId,
          reason: "Builder cannot configure review policy.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden");
    const foreignAdmin = withIdentity(
      base,
      ["admin"],
      "user_phase3_foreign_admin",
      "org_phase3_foreign",
    );
    await expect(
      foreignAdmin.mutation(
        (api as any).production_proposals.configureProposalReviewPolicy,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: "phase3-foreign-tenant-policy-write",
          policy: {
            drawApprovalMode: "backoffice_only",
            milestoneApprovalMode: "backoffice_only",
            milestoneReceiptInvoiceRequired: false,
            milestoneSiteVisitRequired: false,
          },
          proposalId,
          reason: "Foreign tenant cannot configure review policy.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden");
    const currentBase = await phase3CommandBaseForTest(t, proposalId);
    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...currentBase,
        expectedAssignmentId: null,
        idempotencyKey: "phase3-stale-assignment-policy-write",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
        proposalId,
        reason: "Reject a stale assignment base.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Stale lender assignment");
    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-zero-quorum",
        policy: {
          drawApprovalMode: "lender_quorum",
          drawLenderQuorum: 0,
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
        proposalId,
        reason: "Reject zero quorum.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("positive integer");

    await expect(
      t.mutation(
        (api as any).production_proposals.configureProposalReviewPolicy,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: "phase3-too-large-quorum",
          policy: {
            drawApprovalMode: "lender_quorum",
            drawLenderQuorum: 3,
            milestoneApprovalMode: "both",
            milestoneLenderQuorum: 3,
            milestoneReceiptInvoiceRequired: false,
            milestoneSiteVisitRequired: true,
          },
          proposalId,
          reason: "Reject a quorum that exceeds active membership.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("1 through 2");
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-valid-quorum",
        policy: {
          drawApprovalMode: "lender_quorum",
          drawLenderQuorum: 2,
          milestoneApprovalMode: "both",
          milestoneLenderQuorum: 1,
          milestoneReceiptInvoiceRequired: true,
          milestoneSiteVisitRequired: true,
        },
        proposalId,
        reason: "Correct the quorum values.",
        workosOrganizationId: ORG,
      },
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-valid-quorum",
      "Approve the valid-quorum revision.",
    );
    await base.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_workos_user_and_status", (query: any) =>
          query
            .eq("workosUserId", "user_phase3_denial_lender_2")
            .eq("status", "active"),
        )
        .unique();
      await ctx.db.patch(assignment._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-membership-change-lock",
        proposalId,
        reason: "Revalidate quorum after active membership changes.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("1 through 1");
    await base.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("lenderOrganizationAssignments")
        .withIndex("by_workos_user_and_status", (query: any) =>
          query
            .eq("workosUserId", "user_phase3_denial_lender_2")
            .eq("status", "inactive"),
        )
        .unique();
      await ctx.db.patch(assignment._id, {
        status: "active",
        updatedAt: Date.now(),
      });
    });
    await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-valid-quorum-v2",
        policy: {
          drawApprovalMode: "lender_quorum",
          drawLenderQuorum: 2,
          milestoneApprovalMode: "both",
          milestoneLenderQuorum: 1,
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: true,
        },
        proposalId,
        reason: "Publish another valid policy revision.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-stale-decision-lock",
        proposalId,
        reason: "Reject the stale lender decision.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Current lender-reviewed proposal revision");
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-corrected-revision",
      "Approve the corrected current revision.",
    );
    await t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
      ...(await phase3CommandBaseForTest(t, proposalId)),
      idempotencyKey: "phase3-valid-lock",
      proposalId,
      reason: "Lock the corrected policy.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.publishProposalRevision, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-post-lock-revision",
        proposalId,
        reason: "Reject post-lock revision publication.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("after policy lock");
    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-post-lock-policy",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
        proposalId,
        reason: "Reject post-lock policy mutation.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("after policy lock or closing");
  });

  test("reports a direct quorum error when an assigned organization has no approval-eligible member", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_staff_only_lender",
      role: "lender-staff",
      userId: "user_phase3_staff_only_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 staff-only quorum",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the staff-only quorum fixture.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the staff-only lender organization.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.configureProposalReviewPolicy,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: "phase3-staff-only-quorum",
          policy: {
            drawApprovalMode: "lender_quorum",
            drawLenderQuorum: 1,
            milestoneApprovalMode: "backoffice_only",
            milestoneReceiptInvoiceRequired: false,
            milestoneSiteVisitRequired: false,
          },
          proposalId,
          reason: "Reject a quorum with no approval-eligible member.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("no active approval-eligible lender member");
  });

  test("replays a policy configuration deterministically after more than twenty later revisions", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 delayed policy replay",
      capitalSource: "internal",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the delayed-replay fixture.",
      workosOrganizationId: ORG,
    });
    const originalBase = await phase3CommandBaseForTest(t, proposalId);
    const policy = {
      drawApprovalMode: "backoffice_only" as const,
      milestoneApprovalMode: "backoffice_only" as const,
      milestoneReceiptInvoiceRequired: true,
      milestoneSiteVisitRequired: false,
    };
    const first = await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...originalBase,
        idempotencyKey: "phase3-delayed-policy-replay",
        policy,
        proposalId,
        reason: "Persist the replay anchor.",
        workosOrganizationId: ORG,
      },
    );
    for (let index = 0; index < 25; index += 1) {
      await t.mutation(
        (api as any).production_proposals.publishProposalRevision,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: `phase3-delayed-policy-followup-${index}`,
          proposalId,
          reason: `Publish follow-up revision ${index}.`,
          workosOrganizationId: ORG,
        },
      );
    }
    const replay = await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...originalBase,
        idempotencyKey: "phase3-delayed-policy-replay",
        policy,
        proposalId,
        reason: "Persist the replay anchor.",
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toEqual(first);
  });

  test("serializes policy lock against lender-assignment withdrawal", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_lock_withdraw_lender",
      userId: "user_phase3_lock_withdraw_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 lock withdrawal race",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the lock-withdrawal race fixture.",
      workosOrganizationId: ORG,
    });
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the lock-withdrawal race fixture.",
        workosOrganizationId: ORG,
      },
    );
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-lock-withdrawal-race",
      "Approve the lock-withdrawal race revision.",
    );
    const commandBase = await phase3CommandBaseForTest(t, proposalId);
    const outcomes = await Promise.allSettled([
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...commandBase,
        idempotencyKey: "phase3-lock-withdrawal-race",
        proposalId,
        reason: "Race policy lock against assignment withdrawal.",
        workosOrganizationId: ORG,
      }),
      t.mutation(
        (api as any).production_proposals.withdrawExternalLenderAssignment,
        {
          assignmentId: assignment.assignmentId,
          proposalId,
          reason: "Race assignment withdrawal against policy lock.",
          workosOrganizationId: ORG,
        },
      ),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  test("serializes archive sealing against policy lock and internal closing in both orderings", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_archive_exclusivity",
      userId: "user_phase3_archive_exclusivity",
    });

    const lockedProposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 lock before archive",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId: lockedProposalId,
      reason: "Approve the lock-first archive fixture.",
      workosOrganizationId: ORG,
    });
    const lockedAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId: lockedProposalId,
        reason: "Assign the lock-first archive fixture.",
        workosOrganizationId: ORG,
      },
    );
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      lockedProposalId,
      lender.organizationId,
      "phase3-approve-lock-first",
      "Approve before the lock-first ordering.",
    );
    await t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
      ...(await phase3CommandBaseForTest(t, lockedProposalId)),
      idempotencyKey: "phase3-lock-before-archive",
      proposalId: lockedProposalId,
      reason: "Lock before attempting withdrawal.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.withdrawExternalLenderAssignment, {
        assignmentId: lockedAssignment.assignmentId,
        proposalId: lockedProposalId,
        reason: "Do not archive after the lock commits.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("cannot change after policy lock");

    const archivingProposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 archive before lock",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId: archivingProposalId,
      reason: "Approve the archive-first fixture.",
      workosOrganizationId: ORG,
    });
    const archivingAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId: archivingProposalId,
        reason: "Assign the archive-first fixture.",
        workosOrganizationId: ORG,
      },
    );
    const archiveBase = await phase3CommandBaseForTest(t, archivingProposalId);
    vi.useFakeTimers();
    await t.mutation((api as any).production_proposals.withdrawExternalLenderAssignment, {
      assignmentId: archivingAssignment.assignmentId,
      proposalId: archivingProposalId,
      reason: "Begin archival before lifecycle writes.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...archiveBase,
        idempotencyKey: "phase3-policy-during-archive",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: true,
          milestoneSiteVisitRequired: false,
        },
        proposalId: archivingProposalId,
        reason: "Do not configure policy while archival is incomplete.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("archive is still sealing");
    await expect(
      t.mutation((api as any).production_proposals.publishProposalRevision, {
        ...archiveBase,
        idempotencyKey: "phase3-revision-during-archive",
        proposalId: archivingProposalId,
        reason: "Do not publish while archival is incomplete.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("archive is still sealing");
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...archiveBase,
        idempotencyKey: "phase3-lock-during-archive",
        proposalId: archivingProposalId,
        reason: "Do not lock while archival is incomplete.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("archive is still sealing");
    await expect(
      t.mutation((api as any).production_proposals.recordProposalClosing, {
        buildStartDate: "2026-09-01",
        ianaTimezone: "America/Toronto",
        loanFacility: { interestAnnualBps: 800, principalCents: 50_000_000 },
        proposalId: archivingProposalId,
        reason: "Do not take the internal closing path during archival.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("archive is still sealing");
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    await t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
      ...(await phase3CommandBaseForTest(t, archivingProposalId)),
      idempotencyKey: "phase3-lock-after-archive",
      proposalId: archivingProposalId,
      reason: "Lock the internal path after archival completes.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.recordProposalClosing, {
        buildStartDate: "2026-09-01",
        ianaTimezone: "America/Toronto",
        loanFacility: { interestAnnualBps: 800, principalCents: 50_000_000 },
        proposalId: archivingProposalId,
        reason: "Close only after archival completes.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ closingId: expect.any(String) });
  });

  test("resolves legacy lender organization identifiers for policy configuration and lock", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_legacy_policy_lender",
      userId: "user_phase3_legacy_policy_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 legacy policy organization",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the legacy organization fixture.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the legacy organization fixture.",
        workosOrganizationId: ORG,
      },
    );
    const legacyWorkosOrganizationId = "org_legacy_phase3_policy";
    await base.run(async (ctx: any) => {
      await ctx.db.patch(lender.lenderOrganizationId, { legacyWorkosOrganizationId });
      await ctx.db.patch(assigned.assignmentId, {
        lenderOrganizationId: legacyWorkosOrganizationId,
      });
    });
    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-legacy-organization-policy",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
        proposalId,
        reason: "Resolve the legacy organization during policy configuration.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ revisionId: expect.any(String) });
    await base.run(async (ctx: any) => {
      await ctx.db.patch(assigned.assignmentId, {
        lenderOrganizationId: lender.lenderOrganizationId,
      });
    });
    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-legacy-lock",
      "Approve before exercising the legacy lock lookup.",
    );
    await base.run(async (ctx: any) => {
      await ctx.db.patch(assigned.assignmentId, {
        lenderOrganizationId: legacyWorkosOrganizationId,
      });
    });
    await expect(
      t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-legacy-organization-lock",
        proposalId,
        reason: "Resolve the legacy organization during policy lock.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ policyLockId: expect.any(String) });
  });

  test("rejects a canonical lender organization from a different Brokerage", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const assignedLender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_brokerage_consistency_assigned",
      userId: "user_phase3_brokerage_consistency_assigned",
    });
    const foreignLender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_brokerage_consistency_foreign",
      userId: "user_phase3_brokerage_consistency_foreign",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 Brokerage consistency",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before testing malformed cutover data.",
      workosOrganizationId: ORG,
    });
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: assignedLender.lenderOrganizationId,
        proposalId,
        reason: "Create the correctly scoped assignment first.",
        workosOrganizationId: ORG,
      },
    );
    await base.run(async (ctx: any) => {
      await ctx.db.patch(assignment.assignmentId, {
        lenderOrganizationId: foreignLender.lenderOrganizationId,
      });
    });

    await expect(
      t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-cross-brokerage-organization",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: false,
          milestoneSiteVisitRequired: false,
        },
        proposalId,
        reason: "Reject cross-Brokerage policy ownership.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("legacy organization cutover");
  });

  test("uses capability-specific quorum denominators and invalidates revoked proposal approval", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_permission_lender",
      userId: "user_phase3_permission_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 permission-aware quorum",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the permission-aware quorum fixture.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.assignExternalLenderOrganization, {
      lenderOrganizationId: lender.lenderOrganizationId,
      proposalId,
      reason: "Assign the permission-aware lender.",
      workosOrganizationId: ORG,
    });
    await base.run(async (ctx: any) => {
      await ctx.db.patch(lender.lenderOrganizationId, {
        permissions: { drawDecisions: false, milestoneDecisions: true, proposalReview: true, siteVisitReview: true },
      });
    });
    await expect(t.mutation((api as any).production_proposals.configureProposalReviewPolicy, {
      ...(await phase3CommandBaseForTest(t, proposalId)),
      idempotencyKey: "phase3-disabled-draw-capability",
      policy: {
        drawApprovalMode: "lender_quorum",
        drawLenderQuorum: 1,
        milestoneApprovalMode: "backoffice_only",
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: false,
      },
      proposalId,
      reason: "Reject a quorum for a disabled Draw capability.",
      workosOrganizationId: ORG,
    })).rejects.toThrow("no active approval-eligible lender member");

    await base.run(async (ctx: any) => {
      await ctx.db.patch(lender.lenderOrganizationId, {
        permissions: { drawDecisions: true, milestoneDecisions: true, proposalReview: true, siteVisitReview: true },
      });
    });
    const lenderViewer = withIdentity(base, ["lender-admin"], lender.userId, lender.organizationId);
    await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-before-permission-revoked",
      "Approve before proposal-review permission is revoked.",
    );
    await base.run(async (ctx: any) => {
      await ctx.db.patch(lender.lenderOrganizationId, {
        permissions: { drawDecisions: true, milestoneDecisions: true, proposalReview: false, siteVisitReview: true },
      });
    });
    await expect(t.mutation((api as any).production_proposals.lockProposalReviewPolicy, {
      ...(await phase3CommandBaseForTest(t, proposalId)),
      idempotencyKey: "phase3-revoked-proposal-review",
      proposalId,
      reason: "Reject a lock after approval eligibility is revoked.",
      workosOrganizationId: ORG,
    })).rejects.toThrow("Current lender-reviewed proposal revision");
  });

  test("seals large withdrawn histories in batches and keeps prior assignment manifests addressable after reassignment", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_large_archive_lender",
      userId: "user_phase3_large_archive_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 large archive proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the large archive fixture.",
      workosOrganizationId: ORG,
    });
    const firstAssignment = await t.mutation((api as any).production_proposals.assignExternalLenderOrganization, {
      lenderOrganizationId: lender.lenderOrganizationId,
      proposalId,
      reason: "Assign the large archive lender.",
      workosOrganizationId: ORG,
    });
    await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      if (!proposal) throw new Error("Large archive fixture is unavailable.");
      for (let index = 0; index < 205; index += 1) {
        const now = Date.now() - 1_000 + index;
        await ctx.db.insert("proposalDocuments", {
          brokerageId: proposal.brokerageId,
          createdAt: now,
          documentType: "supporting",
          fileName: `archive-document-${index}.pdf`,
          mimeType: "application/pdf",
          organizationId: proposal.organizationId,
          proposalId,
          sizeBytes: 100 + index,
          status: "uploaded",
          updatedAt: now,
          uploadedByWorkosUserId: "user_admin",
        });
      }
    });
    const formerLender = withIdentity(base, ["lender-admin"], lender.userId, lender.organizationId);
    vi.useFakeTimers();
    await t.mutation((api as any).production_proposals.withdrawExternalLenderAssignment, {
      assignmentId: firstAssignment.assignmentId,
      proposalId,
      reason: "Freeze a history larger than the former single-mutation cap.",
      workosOrganizationId: ORG,
    });
    await expect(formerLender.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: firstAssignment.assignmentId, proposalId },
    )).rejects.toThrow("still sealing");
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    let cursor: string | null = null;
    let archivedDocumentCount = 0;
    do {
      const page: any = await formerLender.query(
        (api as any).production_proposals.listLenderProposalAssignmentDocuments,
        { assignmentId: firstAssignment.assignmentId, paginationOpts: { cursor, numItems: 37 }, proposalId },
      );
      archivedDocumentCount += page.page.length;
      cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) break;
    } while (cursor !== null);
    expect(archivedDocumentCount).toBeGreaterThan(200);

    const secondAssignment = await t.mutation((api as any).production_proposals.assignExternalLenderOrganization, {
      lenderOrganizationId: lender.lenderOrganizationId,
      proposalId,
      reason: "Reassign the same organization for a new interval.",
      workosOrganizationId: ORG,
    });
    expect(secondAssignment.assignmentId).not.toBe(firstAssignment.assignmentId);
    await expect(formerLender.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: firstAssignment.assignmentId, proposalId },
    )).resolves.toMatchObject({ assignment: { assignmentId: firstAssignment.assignmentId, readOnly: true, status: "withdrawn" } });
    await expect(formerLender.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: secondAssignment.assignmentId, proposalId },
    )).resolves.toMatchObject({ assignment: { assignmentId: secondAssignment.assignmentId, readOnly: false, status: "current" } });
  });

  test("paginates current-lender revisions within the current assignment interval", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_revision_pagination_lender",
      userId: "user_phase3_revision_pagination_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 assignment-scoped revision pagination",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the multi-interval revision fixture.",
      workosOrganizationId: ORG,
    });
    const firstAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Create the first revision interval.",
        workosOrganizationId: ORG,
      },
    );
    for (const suffix of ["a", "b"] as const) {
      await t.mutation(
        (api as any).production_proposals.publishProposalRevision,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: `phase3-first-interval-revision-${suffix}`,
          proposalId,
          reason: `Publish first-interval revision ${suffix}.`,
          workosOrganizationId: ORG,
        },
      );
    }
    vi.useFakeTimers();
    await t.mutation(
      (api as any).production_proposals.withdrawExternalLenderAssignment,
      {
        assignmentId: firstAssignment.assignmentId,
        proposalId,
        reason: "Seal the first revision interval.",
        workosOrganizationId: ORG,
      },
    );
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    const secondAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Create the current revision interval.",
        workosOrganizationId: ORG,
      },
    );
    const secondIntervalStartingRevisionNumber = (
      await phase3CommandBaseForTest(t, proposalId)
    ).expectedProposalRevisionNumber;
    for (const suffix of ["a", "b"] as const) {
      await t.mutation(
        (api as any).production_proposals.publishProposalRevision,
        {
          ...(await phase3CommandBaseForTest(t, proposalId)),
          idempotencyKey: `phase3-current-interval-revision-${suffix}`,
          proposalId,
          reason: `Publish current-interval revision ${suffix}.`,
          workosOrganizationId: ORG,
        },
      );
    }

    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    let cursor: string | null = null;
    const visibleRevisions: any[] = [];
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page: any = await lenderViewer.query(
        (api as any).production_proposals.listProposalRevisions,
        {
          paginationOpts: { cursor, numItems: 1 },
          proposalId,
          workosOrganizationId: lender.organizationId,
        },
      );
      expect(page.page).toHaveLength(1);
      expect(page.page[0].assignmentId).toBe(secondAssignment.assignmentId);
      visibleRevisions.push(...page.page);
      if (page.isDone) {
        break;
      }
      cursor = page.continueCursor;
    }
    expect(visibleRevisions).toHaveLength(3);
    expect(
      visibleRevisions.map((revision) => revision.revisionNumber),
    ).toEqual([
      secondIntervalStartingRevisionNumber,
      secondIntervalStartingRevisionNumber + 1,
      secondIntervalStartingRevisionNumber + 2,
    ]);
  });

  test("serializes document creation against the archive cutover at the same wall-clock time", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_document_archive_cutover",
      userId: "user_phase3_document_archive_cutover",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 document archive cutover",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the document cutover fixture.",
      workosOrganizationId: ORG,
    });
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the document cutover fixture.",
        workosOrganizationId: ORG,
      },
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T18:00:00.000Z"));
    await t.mutation((api as any).production_proposals.addProposalDocument, {
      documentType: "supporting",
      fileName: "before-cutover.pdf",
      mimeType: "application/pdf",
      proposalId,
      sizeBytes: 100,
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.withdrawExternalLenderAssignment,
      {
        assignmentId: assignment.assignmentId,
        proposalId,
        reason: "Freeze the exact document set.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation((api as any).production_proposals.addProposalDocument, {
        documentType: "supporting",
        fileName: "same-millisecond-after-cutover.pdf",
        mimeType: "application/pdf",
        proposalId,
        sizeBytes: 100,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("archive is still sealing");
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    const formerLender = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    const page: any = await formerLender.query(
      (api as any).production_proposals.listLenderProposalAssignmentDocuments,
      {
        assignmentId: assignment.assignmentId,
        paginationOpts: { cursor: null, numItems: 20 },
        proposalId,
      },
    );
    expect(page.page.map((document: any) => document.fileName)).toContain(
      "before-cutover.pdf",
    );
    expect(page.page.map((document: any) => document.fileName)).not.toContain(
      "same-millisecond-after-cutover.pdf",
    );
  });

  test("places a concurrent document transaction on exactly one side of the archive cutover", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_document_archive_race",
      userId: "user_phase3_document_archive_race",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 document archive race",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the concurrent document cutover fixture.",
      workosOrganizationId: ORG,
    });
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the concurrent document cutover fixture.",
        workosOrganizationId: ORG,
      },
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T18:05:00.000Z"));
    const [withdrawalResult, documentResult] = await Promise.allSettled([
      t.mutation(
        (api as any).production_proposals.withdrawExternalLenderAssignment,
        {
          assignmentId: assignment.assignmentId,
          proposalId,
          reason: "Race the archive cutover against a document transaction.",
          workosOrganizationId: ORG,
        },
      ),
      t.mutation((api as any).production_proposals.addProposalDocument, {
        documentType: "supporting",
        fileName: "concurrent-cutover.pdf",
        mimeType: "application/pdf",
        proposalId,
        sizeBytes: 100,
        workosOrganizationId: ORG,
      }),
    ]);
    expect(withdrawalResult.status).toBe("fulfilled");
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    const formerLender = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    const page: any = await formerLender.query(
      (api as any).production_proposals.listLenderProposalAssignmentDocuments,
      {
        assignmentId: assignment.assignmentId,
        paginationOpts: { cursor: null, numItems: 20 },
        proposalId,
      },
    );
    expect(
      page.page.some(
        (document: any) => document.fileName === "concurrent-cutover.pdf",
      ),
    ).toBe(documentResult.status === "fulfilled");
  });

  test("records a failed archive and repairs a legacy missing-policy prerequisite on retry", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_archive_repair",
      userId: "user_phase3_archive_repair",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 repairable archive",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the archive repair fixture.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the archive repair fixture.",
        workosOrganizationId: ORG,
      },
    );
    await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      if (proposal?.currentReviewPolicyVersionId) {
        await ctx.db.delete(proposal.currentReviewPolicyVersionId);
      }
      await ctx.db.patch(proposalId, { currentReviewPolicyVersionId: undefined });
    });
    vi.useFakeTimers();
    await t.mutation((api as any).production_proposals.withdrawExternalLenderAssignment, {
      assignmentId: assigned.assignmentId,
      proposalId,
      reason: "Preflight the missing legacy policy and start archival.",
      workosOrganizationId: ORG,
    });
    await base.run(async (ctx: any) => {
      const manifest = await ctx.db
        .query("proposalLenderAssignmentManifests")
        .withIndex("by_assignment", (query: any) =>
          query.eq("assignmentId", assigned.assignmentId),
        )
        .unique();
      if (!manifest?.reviewPolicyVersionId) {
        throw new Error("Archive repair manifest did not capture a policy.");
      }
      await ctx.db.delete(manifest.reviewPolicyVersionId);
      await ctx.db.patch(proposalId, { currentReviewPolicyVersionId: undefined });
    });
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(
      t.query((api as any).production_proposals.getProposalLenderArchiveStatus, {
        assignmentId: assigned.assignmentId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ attemptCount: 1, status: "failed" });
    await expect(
      t.mutation((api as any).production_proposals.retryProposalLenderArchive, {
        assignmentId: assigned.assignmentId,
        proposalId,
        reason: "Repair the missing policy and resume archival.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ status: "building" });
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();
    await expect(
      t.query((api as any).production_proposals.getProposalLenderArchiveStatus, {
        assignmentId: assigned.assignmentId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ attemptCount: 1, status: "sealed" });
    const assignment: any = await base.run((ctx: any) => ctx.db.get(assigned.assignmentId));
    expect(assignment.status).toBe("withdrawn");
  });

  test("records and retries deterministic failures in every archive batch phase", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_archive_batch_failures",
      userId: "user_phase3_archive_batch_failures",
    });
    vi.useFakeTimers();
    for (const [index, failedPhase] of [
      "documents",
      "revisions",
      "decisions",
    ].entries()) {
      const proposalId = await createSubmittedProposal(t, seed, {
        buildName: `Phase 3 ${failedPhase} archive failure`,
        capitalSource: "external",
      });
      await t.mutation((api as any).production_proposals.approveProposal, {
        proposalId,
        reason: `Approve the ${failedPhase} archive failure fixture.`,
        workosOrganizationId: ORG,
      });
      const assigned = await t.mutation(
        (api as any).production_proposals.assignExternalLenderOrganization,
        {
          lenderOrganizationId: lender.lenderOrganizationId,
          proposalId,
          reason: `Assign the ${failedPhase} archive failure fixture.`,
          workosOrganizationId: ORG,
        },
      );
      await t.mutation(
        (api as any).production_proposals.withdrawExternalLenderAssignment,
        {
          assignmentId: assigned.assignmentId,
          proposalId,
          reason: `Start ${failedPhase} archival.`,
          workosOrganizationId: ORG,
        },
      );
      const manifestId = await base.run(async (ctx: any) => {
        const manifest = await ctx.db
          .query("proposalLenderAssignmentManifests")
          .withIndex("by_assignment", (query: any) =>
            query.eq("assignmentId", assigned.assignmentId),
          )
          .unique();
        if (!manifest) throw new Error("Archive failure manifest is unavailable.");
        return manifest._id;
      });
      const phaseSteps = failedPhase === "documents" ? 0 : failedPhase === "revisions" ? 1 : 2;
      for (let step = 0; step < phaseSteps; step += 1) {
        await t.mutation(
          (internal as any).production_proposals.sealLenderAssignmentManifestBatch,
          { manifestId },
        );
      }
      await base.run(async (ctx: any) => {
        const manifest = await ctx.db.get(manifestId);
        expect(manifest?.phase).toBe(failedPhase);
        await ctx.db.patch(manifestId, { cursor: `invalid-${failedPhase}-${index}` });
      });
      await t.mutation(
        (internal as any).production_proposals.sealLenderAssignmentManifestBatch,
        { manifestId },
      );
      await expect(
        t.query((api as any).production_proposals.getProposalLenderArchiveStatus, {
          assignmentId: assigned.assignmentId,
          proposalId,
          workosOrganizationId: ORG,
        }),
      ).resolves.toMatchObject({
        attemptCount: 1,
        failureReason: expect.any(String),
        phase: failedPhase,
        status: "failed",
      });
      await t.mutation((api as any).production_proposals.retryProposalLenderArchive, {
        assignmentId: assigned.assignmentId,
        proposalId,
        reason: `Retry the ${failedPhase} batch from its safe boundary.`,
        workosOrganizationId: ORG,
      });
      await base.finishAllScheduledFunctions(() => vi.runAllTimers());
      await expect(
        t.query((api as any).production_proposals.getProposalLenderArchiveStatus, {
          assignmentId: assigned.assignmentId,
          proposalId,
          workosOrganizationId: ORG,
        }),
      ).resolves.toMatchObject({ attemptCount: 1, status: "sealed" });
    }
    vi.useRealTimers();
  });

  test("backfills legacy policy, revision, and exact approval links idempotently", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_migration_lender",
      userId: "user_phase3_migration_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 approval migration proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the legacy migration fixture.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the migration fixture lender.",
        workosOrganizationId: ORG,
      },
    );
    const migrationLenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      migrationLenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-legacy-migration",
      "Approve the legacy migration fixture revision.",
    );

    await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const approvals = await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      const revisions = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      const policies = await ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      if (!proposal || approvals.length !== 1) {
        throw new Error("Legacy approval migration fixture is unavailable.");
      }
      const {
        currentProposalRevisionId: _currentRevisionId,
        currentProposalRevisionNumber: _currentRevisionNumber,
        currentReviewPolicyVersionId: _currentPolicyVersionId,
        latestLenderReviewedRevisionId: _latestRevisionId,
        latestLenderReviewedRevisionNumber: _latestRevisionNumber,
        ...legacyProposal
      } = proposal;
      const {
        proposalRevisionId: _approvalRevisionId,
        proposalRevisionNumber: _approvalRevisionNumber,
        ...legacyApproval
      } = approvals[0];
      await ctx.db.replace(proposalId, legacyProposal);
      await ctx.db.replace(approvals[0]._id, legacyApproval);
      for (const revision of revisions) await ctx.db.delete(revision._id);
      for (const policy of policies) await ctx.db.delete(policy._id);
    });

    await runPhase3LifecycleBackfill(t);
    await runPhase3LifecycleBackfill(t);

    const migrated = await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const approval = await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .unique();
      const policies = await ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      const revisions = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      const issues = await ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) =>
          query.eq("proposalId", proposalId).eq("status", "open"),
        )
        .collect();
      return { approval, issues, policies, proposal, revisions };
    });
    expect(migrated.policies).toHaveLength(1);
    expect(migrated.revisions).toHaveLength(1);
    expect(migrated.approval?.proposalRevisionId).toBe(migrated.revisions[0]._id);
    expect(migrated.approval?.proposalRevisionNumber).toBe(1);
    expect(migrated.proposal?.currentReviewPolicyVersionId).toBe(
      migrated.policies[0]._id,
    );
    expect(migrated.proposal?.currentProposalRevisionId).toBe(
      migrated.revisions[0]._id,
    );
    expect(migrated.proposal?.latestLenderReviewedRevisionId).toBe(
      migrated.revisions[0]._id,
    );
    expect(migrated.issues).toHaveLength(0);
  });

  test("backfills an exact approval revision deterministically beyond one hundred revisions", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_long_revision_history",
      userId: "user_phase3_long_revision_history",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 long revision history",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the long revision history fixture.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation((api as any).production_proposals.assignExternalLenderOrganization, {
      lenderOrganizationId: lender.lenderOrganizationId,
      proposalId,
      reason: "Assign the long-history lender.",
      workosOrganizationId: ORG,
    });
    const fixture = await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const current = proposal?.currentProposalRevisionId
        ? await ctx.db.get(proposal.currentProposalRevisionId)
        : null;
      if (!proposal || !current) throw new Error("Long revision history fixture is unavailable.");
      let latestRevisionId = current._id;
      const origin = Date.now() - 10_000;
      for (let revisionNumber = 3; revisionNumber <= 112; revisionNumber += 1) {
        latestRevisionId = await ctx.db.insert("proposalRevisions", {
          assignmentId: assigned.assignmentId,
          backOfficeApprovedByWorkosUserId: current.backOfficeApprovedByWorkosUserId,
          brokerageId: current.brokerageId,
          changedCheckpoints: [],
          checkpoints: current.checkpoints,
          createdAt: origin + revisionNumber,
          createdByRole: "migration-fixture",
          createdByWorkosUserId: "user_admin",
          idempotencyKey: `migration-fixture-long-history-${revisionNumber}`,
          organizationId: current.organizationId,
          proposalId,
          reason: "Seed deterministic historical revision ordering.",
          revisionNumber,
          reviewPolicyVersionId: current.reviewPolicyVersionId,
        });
      }
      const decisionAt = origin + 200;
      const approvalId = await ctx.db.insert("proposalLenderApprovals", {
        approverRole: "lender-admin",
        approverWorkosUserId: lender.userId,
        approvedAt: decisionAt,
        assignmentId: assigned.assignmentId,
        brokerageId: proposal.brokerageId,
        createdAt: decisionAt,
        lenderOrganizationId: lender.lenderOrganizationId,
        organizationId: proposal.organizationId,
        proposalId,
        status: "approved",
      });
      return { approvalId, latestRevisionId };
    });
    await runPhase3LifecycleBackfill(t);
    const approval: any = await base.run((ctx: any) => ctx.db.get(fixture.approvalId));
    expect(approval?.proposalRevisionId).toBe(fixture.latestRevisionId);
    expect(approval?.proposalRevisionNumber).toBe(112);
  });

  test("records an issue instead of guessing between revisions with the same creation time", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_revision_timestamp_tie",
      userId: "user_phase3_revision_timestamp_tie",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 revision timestamp tie",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before constructing an ambiguous timestamp tie.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the timestamp-tie migration fixture.",
        workosOrganizationId: ORG,
      },
    );
    const approvalId = await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const current = proposal?.currentProposalRevisionId
        ? await ctx.db.get(proposal.currentProposalRevisionId)
        : null;
      if (!proposal || !current) {
        throw new Error("Timestamp-tie migration fixture is unavailable.");
      }
      const createdAt = Date.now() + 1_000;
      for (const revisionNumber of [3, 4]) {
        await ctx.db.insert("proposalRevisions", {
          assignmentId: assigned.assignmentId,
          backOfficeApprovedByWorkosUserId:
            current.backOfficeApprovedByWorkosUserId,
          brokerageId: current.brokerageId,
          changedCheckpoints: [],
          checkpoints: current.checkpoints,
          createdAt,
          createdByRole: "migration-fixture",
          createdByWorkosUserId: "user_admin",
          idempotencyKey: `migration-fixture-timestamp-tie-${revisionNumber}`,
          organizationId: current.organizationId,
          proposalId,
          reason: "Seed an intentionally ambiguous revision timestamp.",
          revisionNumber,
          reviewPolicyVersionId: current.reviewPolicyVersionId,
        });
      }
      return await ctx.db.insert("proposalLenderApprovals", {
        approverRole: "lender-admin",
        approverWorkosUserId: lender.userId,
        approvedAt: createdAt + 1,
        assignmentId: assigned.assignmentId,
        brokerageId: proposal.brokerageId,
        createdAt: createdAt + 1,
        lenderOrganizationId: lender.lenderOrganizationId,
        organizationId: proposal.organizationId,
        proposalId,
        status: "approved",
      });
    });

    await runPhase3LifecycleBackfill(t);
    const result = await base.run(async (ctx: any) => ({
      approval: await ctx.db.get(approvalId),
      issues: await ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) =>
          query.eq("proposalId", proposalId).eq("status", "open"),
        )
        .collect(),
    }));
    expect(result.approval?.proposalRevisionId).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining("same creation time"),
          sourceRecordId: String(approvalId),
          sourceTable: "proposalLenderApprovals",
        }),
      ]),
    );
  });

  test("finds a prior reviewed revision behind more than one hundred newer unlinked approvals", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_deep_approval_history",
      userId: "user_phase3_deep_approval_history",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 deep approval history",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the deep approval history fixture.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the deep approval history lender.",
        workosOrganizationId: ORG,
      },
    );
    const priorRevisionId = await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const revision = proposal?.currentProposalRevisionId
        ? await ctx.db.get(proposal.currentProposalRevisionId)
        : null;
      if (!proposal || !revision) throw new Error("Deep approval history fixture is unavailable.");
      await ctx.db.patch(proposalId, {
        latestLenderApprovalId: undefined,
        latestLenderReviewedRevisionId: undefined,
        latestLenderReviewedRevisionNumber: undefined,
      });
      await ctx.db.insert("proposalLenderApprovals", {
        approverRole: "lender-admin",
        approverWorkosUserId: lender.userId,
        approvedAt: Date.now() - 1_000,
        assignmentId: assigned.assignmentId,
        brokerageId: proposal.brokerageId,
        createdAt: Date.now() - 1_000,
        lenderOrganizationId: lender.lenderOrganizationId,
        organizationId: proposal.organizationId,
        proposalId,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber,
        status: "approved",
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("proposalLenderApprovals", {
          approverRole: "legacy-lender",
          approverWorkosUserId: `legacy-unlinked-${index}`,
          approvedAt: Date.now() + index,
          assignmentId: assigned.assignmentId,
          brokerageId: proposal.brokerageId,
          createdAt: Date.now() + index,
          lenderOrganizationId: lender.lenderOrganizationId,
          organizationId: proposal.organizationId,
          proposalId,
          status: "approved",
        });
      }
      return revision._id;
    });
    const published = await t.mutation(
      (api as any).production_proposals.publishProposalRevision,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "phase3-deep-approval-history-publication",
        proposalId,
        reason: "Publish against the older linked review anchor.",
        workosOrganizationId: ORG,
      },
    );
    const revision: any = await base.run((ctx: any) => ctx.db.get(published.revisionId));
    expect(revision.priorLenderReviewedRevisionId).toBe(priorRevisionId);
  });

  test("records multiple-current-assignment migration ambiguity and continues without linking a revision", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_multiple_current_migration",
      userId: "user_phase3_multiple_current_migration",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 multiple current migration",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before constructing ambiguous legacy state.",
      workosOrganizationId: ORG,
    });
    await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      if (!proposal) throw new Error("Multiple-current migration fixture is unavailable.");
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("proposalLenderAssignments", {
          assignedAt: Date.now() + index,
          assignedByRole: "admin",
          assignedByWorkosUserId: "user_admin",
          brokerageId: proposal.brokerageId,
          createdAt: Date.now() + index,
          lenderBrokerageId: lender.brokerageId,
          lenderOrganizationId: lender.lenderOrganizationId,
          lenderOrganizationName: `Ambiguous lender ${index}`,
          organizationId: proposal.organizationId,
          proposalId,
          status: "current",
        });
      }
      const revisions = await ctx.db.query("proposalRevisions").withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId)).collect();
      const policies = await ctx.db.query("proposalReviewPolicyVersions").withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId)).collect();
      for (const revision of revisions) await ctx.db.delete(revision._id);
      for (const policy of policies) await ctx.db.delete(policy._id);
      await ctx.db.patch(proposalId, {
        currentProposalRevisionId: undefined,
        currentProposalRevisionNumber: undefined,
        currentReviewPolicyVersionId: undefined,
      });
    });
    await expect(runPhase3LifecycleBackfill(t)).resolves.toBeUndefined();
    const result = await base.run(async (ctx: any) => ({
      issues: await ctx.db.query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) => query.eq("proposalId", proposalId).eq("status", "open")).collect(),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(result.proposal?.currentProposalRevisionId).toBeUndefined();
    expect(result.issues).toEqual([expect.objectContaining({ sourceTable: "buildProposals", status: "open" })]);
  });

  test("backfills a closed Build policy lock and copied evidence idempotently", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Phase 3 closed Build migration",
    });
    const fixture = await base.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const proposal = build ? await ctx.db.get(build.proposalId) : null;
      const proposalClosing = proposal
        ? await ctx.db
            .query("proposalClosings")
            .withIndex("by_proposal", (query: any) =>
              query.eq("proposalId", proposal._id),
            )
            .unique()
        : null;
      if (!build || !proposal || !proposalClosing) {
        throw new Error("Closed Build migration fixture is unavailable.");
      }
      const revisions = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposal._id))
        .collect();
      const policies = await ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposal._id))
        .collect();
      const locks = await ctx.db
        .query("proposalReviewPolicyLocks")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposal._id))
        .collect();
      const {
        currentProposalRevisionId: _currentRevisionId,
        currentProposalRevisionNumber: _currentRevisionNumber,
        currentReviewPolicyVersionId: _currentPolicyVersionId,
        lockedReviewPolicyId: _lockedReviewPolicyId,
        ...legacyProposal
      } = proposal;
      const { reviewPolicyLockId: _closingLockId, ...legacyClosing } =
        proposalClosing;
      const {
        reviewPolicyLockEvidence: _lockEvidence,
        reviewPolicyLockId: _buildLockId,
        reviewPolicySnapshot: _policySnapshot,
        ...legacyBuild
      } = build;
      await ctx.db.replace(proposal._id, legacyProposal);
      await ctx.db.replace(proposalClosing._id, legacyClosing);
      await ctx.db.replace(build._id, legacyBuild);
      for (const lock of locks) await ctx.db.delete(lock._id);
      for (const revision of revisions) await ctx.db.delete(revision._id);
      for (const policy of policies) await ctx.db.delete(policy._id);
      return { proposalId: proposal._id };
    });

    await runPhase3LifecycleBackfill(t);
    await base.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const proposalClosing = await ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", fixture.proposalId),
        )
        .unique();
      if (!build || !proposalClosing) {
        throw new Error("Migrated policy-lock linkage fixture is unavailable.");
      }
      const { reviewPolicyLockId: _closingLockId, ...closingWithoutLock } =
        proposalClosing;
      const {
        reviewPolicyLockEvidence: _lockEvidence,
        reviewPolicyLockId: _buildLockId,
        reviewPolicySnapshot: _policySnapshot,
        ...buildWithoutLock
      } = build;
      await ctx.db.replace(proposalClosing._id, closingWithoutLock);
      await ctx.db.replace(build._id, buildWithoutLock);
    });
    await runPhase3LifecycleBackfill(t);

    const migrated = await base.run(async (ctx: any) => {
      const proposal = await ctx.db.get(fixture.proposalId);
      const build = await ctx.db.get(closing.buildId);
      const proposalClosing = await ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", fixture.proposalId),
        )
        .unique();
      const locks = await ctx.db
        .query("proposalReviewPolicyLocks")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", fixture.proposalId),
        )
        .collect();
      const issues = await ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) =>
          query.eq("proposalId", fixture.proposalId).eq("status", "open"),
        )
        .collect();
      return { build, issues, locks, proposal, proposalClosing };
    });
    expect(migrated.locks).toHaveLength(1);
    expect(migrated.proposal?.lockedReviewPolicyId).toBe(migrated.locks[0]._id);
    expect(migrated.proposalClosing?.reviewPolicyLockId).toBe(
      migrated.locks[0]._id,
    );
    expect(migrated.build?.reviewPolicyLockId).toBe(migrated.locks[0]._id);
    expect(migrated.build?.reviewPolicyLockEvidence).toMatchObject({
      activeLenderMemberCount: 0,
      eligibleLenderApproverCount: 0,
      proposalRevisionNumber: 1,
    });
    expect(migrated.issues).toHaveLength(0);
  });

  test("does not fabricate historical external quorum evidence from current membership", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_historical_quorum_lender",
      userId: "user_phase3_historical_quorum_lender",
    });
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Phase 3 historical quorum non-fabrication",
    });
    const proposalId = await base.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const proposal = build ? await ctx.db.get(build.proposalId) : null;
      if (!build || !proposal) throw new Error("Historical quorum fixture is unavailable.");
      const proposalClosing = await ctx.db.query("proposalClosings")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposal._id)).unique();
      const locks = await ctx.db.query("proposalReviewPolicyLocks")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposal._id)).collect();
      for (const lock of locks) await ctx.db.delete(lock._id);
      await ctx.db.patch(proposal._id, { lockedReviewPolicyId: undefined });
      if (proposalClosing) await ctx.db.patch(proposalClosing._id, { reviewPolicyLockId: undefined });
      await ctx.db.patch(build._id, {
        reviewPolicyLockEvidence: undefined,
        reviewPolicyLockId: undefined,
        reviewPolicySnapshot: undefined,
      });
      await ctx.db.insert("proposalLenderAssignments", {
        assignedAt: proposal.closedAt ?? Date.now(),
        assignedByRole: "admin",
        assignedByWorkosUserId: "user_admin",
        brokerageId: proposal.brokerageId,
        createdAt: proposal.closedAt ?? Date.now(),
        lenderBrokerageId: lender.brokerageId,
        lenderOrganizationId: lender.lenderOrganizationId,
        lenderOrganizationName: "Historical current lender",
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        status: "current",
      });
      return proposal._id;
    });
    await expect(runPhase3LifecycleBackfill(t)).resolves.toBeUndefined();
    const result = await base.run(async (ctx: any) => ({
      issues: await ctx.db.query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) => query.eq("proposalId", proposalId).eq("status", "open")).collect(),
      locks: await ctx.db.query("proposalReviewPolicyLocks")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId)).collect(),
    }));
    expect(result.locks).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.stringContaining("cannot be proven"),
        sourceTable: "proposalClosings",
        status: "open",
      }),
    ]));
  });

  test("supports an audited operator activation override for an unprovable legacy closing lock", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_legacy_activation_resolution",
      userId: "user_phase3_legacy_activation_resolution",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 legacy activation resolution",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the legacy activation fixture.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the legacy activation fixture.",
        workosOrganizationId: ORG,
      },
    );
    const closingLenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      closingLenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-before-closing",
      "Approve the current revision before closing.",
    );
    const lock = await lockProposalReviewPolicyForTest(
      t,
      proposalId,
      "legacy-activation-resolution",
    );
    await t.mutation((api as any).production_proposals.recordProposalClosing, {
      buildStartDate: "2026-09-15",
      ianaTimezone: "America/Toronto",
      loanFacility: { interestAnnualBps: 875, principalCents: 55_000_000 },
      proposalId,
      reason: "Record the original closing before simulating legacy loss.",
      workosOrganizationId: ORG,
    });
    await base.run(async (ctx: any) => {
      const closing = await ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .unique();
      if (!closing) throw new Error("Legacy activation closing is unavailable.");
      await ctx.db.patch(closing._id, { reviewPolicyLockId: undefined });
      await ctx.db.patch(proposalId, { lockedReviewPolicyId: undefined });
      await ctx.db.delete(lock.policyLockId);
    });
    await runPhase3LifecycleBackfill(t);
    const issue = (await base.run((ctx: any) =>
      ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) =>
          query.eq("proposalId", proposalId).eq("status", "open"),
        )
        .filter((query: any) =>
          query.eq(query.field("sourceTable"), "proposalClosings"),
        )
        .unique(),
    )) as Doc<"proposalPhase3MigrationIssues"> | null;
    expect(issue).toBeDefined();
    await expect(
      t.mutation((api as any).production_proposals.activateClosedProposal, {
        proposalId,
        reason: "Do not activate before operator resolution.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("missing its review policy lock");

    const resolutionInput = {
      evidenceReference: "closing-file://legacy-activation-resolution",
      issueId: issue!._id,
      proposalId,
      reason:
        "Back Office reviewed the signed closing file and authorizes activation as an explicit legacy exception without reconstructed quorum evidence.",
      workosOrganizationId: ORG,
    };
    const resolved = await t.mutation(
      (api as any).production_proposals.resolveLegacyClosedProposalActivation,
      resolutionInput,
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.resolveLegacyClosedProposalActivation,
        resolutionInput,
      ),
    ).resolves.toEqual(resolved);
    const activated = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Activate using the audited legacy exception.",
        workosOrganizationId: ORG,
      },
    );
    const result = await base.run(async (ctx: any) => ({
      build: await ctx.db.get(activated.buildId),
      issue: await ctx.db.get(issue!._id),
      events: await ctx.db
        .query("proposalEvents")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect(),
    }));
    expect(result.issue).toMatchObject({
      resolutionMode: "operator_activation_override",
      resolvedByWorkosUserId: "user_admin",
      status: "resolved",
    });
    expect(result.build).toMatchObject({
      legacyPolicyResolutionIssueId: issue!._id,
      proposalId,
    });
    expect(result.build?.reviewPolicyLockId).toBeUndefined();
    expect(result.events.map((event: any) => event.eventType)).toContain(
      "proposal.legacy_policy_activation_resolved",
    );
  });

  test("records an observable issue instead of guessing an ambiguous historical approval revision", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_phase3_ambiguous_migration_lender",
      userId: "user_phase3_ambiguous_migration_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Phase 3 ambiguous migration proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the ambiguous migration fixture.",
      workosOrganizationId: ORG,
    });
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the ambiguous migration fixture.",
        workosOrganizationId: ORG,
      },
    );
    const withdrawalLenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    await approveCurrentProposalConfirmationForTest(
      t,
      withdrawalLenderViewer,
      proposalId,
      lender.organizationId,
      "phase3-approve-before-withdrawal",
      "Approve before the historical assignment is withdrawn.",
    );
    await t.mutation(
      (api as any).production_proposals.withdrawExternalLenderAssignment,
      {
        assignmentId: assignment.assignmentId,
        proposalId,
        reason: "Withdraw before simulating the legacy migration shape.",
        workosOrganizationId: ORG,
      },
    );
    await base.run(async (ctx: any) => {
      const approval = await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .unique();
      const revisions = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      if (!approval) throw new Error("Ambiguous approval fixture is unavailable.");
      const {
        proposalRevisionId: _approvalRevisionId,
        proposalRevisionNumber: _approvalRevisionNumber,
        ...legacyApproval
      } = approval;
      await ctx.db.replace(approval._id, legacyApproval);
      for (const revision of revisions) await ctx.db.delete(revision._id);
    });

    await runPhase3LifecycleBackfill(t);
    const result = await base.run(async (ctx: any) => {
      const approval = await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .unique();
      const issues = await ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query: any) =>
          query.eq("proposalId", proposalId).eq("status", "open"),
        )
        .collect();
      return { approval, issues };
    });
    expect(result.approval?.proposalRevisionId).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        sourceTable: "proposalLenderApprovals",
        status: "open",
      }),
    ]);
  });
});

function asIdentity(
  roles: string[],
  subject = "user_builder",
  organizationId = ORG,
) {
  return convexTest(schema, modules).withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function withIdentity(
  t: any,
  roles: string[],
  subject: string,
  organizationId = ORG,
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function withIdentityEmail(
  t: any,
  roles: string[],
  subject: string,
  email: string,
  organizationId = ORG,
) {
  return t.withIdentity({
    email,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function directAdminProposalFixture(
  buildName: string,
  location: string,
) {
  const base = convexTest(schema, modules);
  const t = withIdentity(base, ["admin"], "user_admin", ORG);
  const fixture = await base.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Production Proposal Test Brokerage",
      legalName: "Production Proposal Test Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: ORG,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Production Proposal Test Builder",
      legalName: "Production Proposal Test Builder Inc.",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      borrowerWorkingCapitalLimitCents: 40_000_000,
      brokerageId,
      buildName,
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 55_000_000,
      location,
      organizationId: ORG,
      reviewOutcome: "none",
      status: "draft",
      totalBudgetCents: 0,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: ["admin", "principle-broker"],
      brokerageId,
      createdAt: now,
      organizationId: ORG,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true,
      ruleKey: "proposal-foundation-v1",
      settings: {
        interestStartsOn: "funds_released",
        reimbursementOnly: true,
      },
      status: "active",
      updatedAt: now,
      version: 1,
    });
    return { brokerageId, builderProfileId, proposalId };
  });
  return { ...fixture, base, t };
}

async function seeded(roles: string[], subject?: string, organizationId = ORG) {
  const base = convexTest(schema, modules);
  const t = withIdentity(
    base,
    roles,
    subject ?? "user_builder",
    organizationId,
  );
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: organizationId },
  );
  return { base, seed, t };
}

async function seedTokenizedSiteVisitEvidence(
  t: any,
  {
    buildId,
    locationFailureReason,
    token,
  }: {
    buildId: string;
    locationFailureReason?: string;
    token: string;
  },
) {
  await t.run(async (ctx: any) => {
    const normalizedBuildId = ctx.db.normalizeId("activeBuilds", buildId);
    const build = await ctx.db.get(normalizedBuildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q: any) => q.eq("visitId", token))
      .unique();
    if (!(build && visit)) {
      throw new Error("Site visit test fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: build.brokerageId,
      buildId: normalizedBuildId,
      createdAt: now,
      evidenceKey: `site-visit-test-${token}`,
      fileName: "site-visit-evidence.webp",
      label: "Site visit evidence",
      locationFailureReason,
      locationVerified: false,
      milestoneKey: visit.milestoneKey,
      mimeType: "image/webp",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      siteVisitId: visit._id,
      sizeBytes: 128_000,
      source: `active_build_site_visit:${token}:`,
      tag: "Site visit evidence",
      updatedAt: now,
    });
  });
}

async function grantOrgMembership(
  t: any,
  {
    roleSlugs,
    subject,
  }: {
    roleSlugs: string[];
    subject: string;
  },
) {
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      directoryManaged: false,
      roleSlug: roleSlugs[0],
      roleSlugs,
      sourceEventId: `test_membership_${subject}`,
      sourceEventType: "test.production_proposals",
      status: "active",
      updatedAt: now,
      workosMembershipId: `test_membership_${subject}`,
      workosOrganizationId: ORG,
      workosUserId: subject,
    });
  });
}

async function seedExternalLenderOrganization(
  t: any,
  options: {
    organizationId?: string;
    organizationName?: string;
    userId?: string;
    role?: string;
  } = {},
) {
  const legacyOrganizationId = options.organizationId ?? "org_external_lender";
  const organizationName =
    options.organizationName ?? "Northstar Lending Organization";
  const userId = options.userId ?? "user_external_lender_admin";
  const role = options.role ?? "lender-admin";
  return await t.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: organizationName,
      legalName: `${organizationName} Inc.`,
      status: "active",
      updatedAt: now,
      workosOrganizationId: legacyOrganizationId,
    });
    await ctx.db.insert("workosOrganizations", {
      domains: [],
      name: organizationName,
      sourceEventId: `test_${legacyOrganizationId}_created`,
      sourceEventType: "organization.created",
      status: "active",
      workosOrganizationId: legacyOrganizationId,
    });
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId,
      createdAt: now,
      displayName: organizationName,
      legalName: `${organizationName} Inc.`,
      legacyWorkosOrganizationId: legacyOrganizationId,
      permissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("users", {
      authId: userId,
      createdAt: now,
      email: `${userId}@example.com`,
      name: "External Lender Admin",
      sourceEventId: `test_${userId}_created`,
      sourceEventType: "user.created",
      status: "active",
      updatedAt: now,
      workosUserId: userId,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      directoryManaged: false,
      roleSlug: role,
      roleSlugs: [role],
      sourceEventId: `test_${userId}_membership`,
      sourceEventType: "organization_membership.created",
      status: "active",
      updatedAt: now,
      workosMembershipId: `om_${userId}`,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: userId,
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId,
      lenderOrganizationId,
      normalizedEmail: `${userId}@example.com`,
      reason: "Seed an assigned lender for proposal lifecycle tests.",
      status: "active",
      updatedAt: now,
      workosUserId: userId,
    });
    return {
      brokerageId,
      lenderOrganizationId,
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      legacyOrganizationId,
      userId,
    };
  });
}

async function seedAdditionalLenderOrganizationMember(
  t: any,
  input: {
    brokerageId: any;
    lenderOrganizationId: any;
    role?: "lender" | "lender-admin" | "lender-staff";
    userId: string;
  },
) {
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      authId: input.userId,
      createdAt: now,
      email: `${input.userId}@example.com`,
      name: input.userId,
      sourceEventId: `test_${input.userId}_created`,
      sourceEventType: "user.created",
      status: "active",
      updatedAt: now,
      workosUserId: input.userId,
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      directoryManaged: false,
      roleSlug: input.role ?? "lender",
      roleSlugs: [input.role ?? "lender"],
      sourceEventId: `test_${input.userId}_membership`,
      sourceEventType: "organization_membership.created",
      status: "active",
      updatedAt: now,
      workosMembershipId: `om_${input.userId}`,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: input.userId,
    });
    await ctx.db.insert("lenderOrganizationAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "user_admin",
      brokerageId: input.brokerageId,
      lenderOrganizationId: input.lenderOrganizationId,
      normalizedEmail: `${input.userId}@example.com`,
      reason: "Seed an additional active lender member.",
      status: "active",
      updatedAt: now,
      workosUserId: input.userId,
    });
  });
}

async function runAuditEventBuildIdBackfill(t: any) {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: { continueCursor: string; isDone: boolean } =
      await t.mutation(
        (internal as any).audit_event_migrations.backfillAuditEventBuildId,
        { batchSize: 25, cursor, dryRun: false, oneBatchOnly: true },
      );
    cursor = result.continueCursor;
    isDone = result.isDone;
  }
}

async function runPhase3LifecycleBackfill(t: any) {
  for (const migrationName of [
    "backfillProposalPhase3PolicyAndRevision",
    "backfillProposalPhase3ApprovalRevision",
    "backfillProposalPhase3PolicyLock",
  ]) {
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean } =
        await t.mutation((internal as any).migrations[migrationName], {
          batchSize: 25,
          cursor,
          dryRun: false,
          oneBatchOnly: true,
        });
      cursor = result.continueCursor;
      isDone = result.isDone;
    }
  }
}

function productionTemplateSettingsArgs(
  template: any,
  scenarios = template.scenarios,
) {
  return {
    milestones: template.milestones.map((milestone: any, index: number) => ({
      dependencyKeys: milestone.dependencyKeys,
      durationDays: milestone.durationDays,
      icon: milestone.icon,
      included: true,
      milestoneKey: milestone.key,
      name: milestone.name,
      order: index,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
        submilestones: milestone.submilestones.map(
          (submilestone: any, subIndex: number) => ({
            description: submilestone.description,
            durationDays: submilestone.durationDays,
            ...(submilestone.fieldGuidance === undefined
              ? {}
              : { fieldGuidance: submilestone.fieldGuidance }),
            name: submilestone.name,
            order: subIndex,
            percentageBps: submilestone.percentageBps,
            ...(submilestone.scopeOfWorkTiptapJson === undefined
              ? {}
              : {
                  scopeOfWorkTiptapJson:
                    submilestone.scopeOfWorkTiptapJson,
                }),
            submilestoneKey: submilestone.key,
          }),
      ),
      type: milestone.archetypeKey,
    })),
    scenarios: scenarios.map((scenario: any) => ({
      description: scenario.description,
      draws: scenario.draws.map((draw: any, order: number) => ({
        amountBps: draw.amountBps,
        drawKey: draw.drawKey,
        label: draw.label,
        order: draw.order ?? order,
        reviewNote: draw.reviewNote,
        timingDay: draw.timingDay,
      })),
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      scenarioKey: scenario.scenarioKey,
      sortOrder: scenario.sortOrder,
    })),
    template: {
      description: template.description,
      isDefault: template.isDefault,
      summary: template.summary,
      templateKey: template.templateKey,
      title: template.title,
    },
    workosOrganizationId: ORG,
  };
}

async function submitProposalForTest(
  t: any,
  proposalId: any,
  workosOrganizationId = ORG,
) {
  return await t.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId,
  });
}

async function phase3CommandBaseForTest(
  t: any,
  proposalId: any,
  workosOrganizationId = ORG,
) {
  const control = await t.query(
    (api as any).production_proposals.getProposalPhase3ReviewControl,
    { proposalId, workosOrganizationId },
  );
  return {
    expectedAssignmentId: control.currentAssignmentId,
    expectedProposalRevisionNumber: control.currentRevisionNumber,
  };
}

async function lockProposalReviewPolicyForTest(
  t: any,
  proposalId: any,
  suffix = "default",
  workosOrganizationId = ORG,
) {
  return await t.mutation(
    (api as any).production_proposals.lockProposalReviewPolicy,
    {
      ...(await phase3CommandBaseForTest(
        t,
        proposalId,
        workosOrganizationId,
      )),
      idempotencyKey: `test-policy-lock:${String(proposalId)}:${suffix}`,
      proposalId,
      reason: "Lock the review policy for the closing test.",
      workosOrganizationId,
    },
  );
}

async function closeAndActivateProposal(t: any, input: any) {
  await lockProposalReviewPolicyForTest(
    t,
    input.proposalId,
    "default",
    input.workosOrganizationId,
  );
  await t.mutation(
    (api as any).production_proposals.recordProposalClosing,
    input,
  );
  return await t.mutation(
    (api as any).production_proposals.activateClosedProposal,
    {
      proposalId: input.proposalId,
      reason: input.reason,
      workosOrganizationId: input.workosOrganizationId,
    },
  );
}

async function createSubmittedProposal(
  t: any,
  seed: any,
  options: {
    buildName?: string;
    capitalSource?: "external" | "internal";
  } = {},
) {
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: options.buildName ?? "Assignment lifecycle proposal",
      location: "18 Assignment History Road",
      workosOrganizationId: ORG,
    },
  );
  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 35_000_000,
    capitalSource: options.capitalSource,
    documents: [
      {
        documentType: "permit",
        fileName: "assignment-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
      },
    ],
    lenderDrawPolicyLimitCents: 55_000_000,
    milestones: [
      {
        budgetCents: 50_000_000,
        dayEnd: 20,
        dayStart: 0,
        dependencyKeys: [],
        durationDays: 20,
        key: "foundation",
        name: "Foundation",
        order: 1,
        submilestones: [],
      },
    ],
    proposalId,
    workosOrganizationId: ORG,
  });
  await submitProposalForTest(t, proposalId);
  return proposalId;
}

async function createClosedSingleMilestoneBuild(
  t: any,
  seed: any,
  options: {
    buildName?: string;
    location?: string;
    milestones?: Array<{
      budgetCents: number;
      dayEnd: number;
      dayStart: number;
      dependencyKeys: string[];
      durationDays: number;
      key: string;
      name: string;
      order: number;
      submilestones: never[];
    }>;
    submilestones?: Array<{
      budgetCents?: number;
      durationDays?: number;
      key?: string;
      name: string;
      order: number;
    }>;
    ianaTimezone?: string;
    workosOrganizationId?: string;
  } = {},
) {
  const workosOrganizationId = options.workosOrganizationId ?? ORG;
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: options.buildName ?? "Actual cost active build",
      location: options.location ?? "44 Actual Cost Lane",
      workosOrganizationId,
    },
  );

  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 35_000_000,
    documents: [
      {
        documentType: "permit",
        fileName: "actual-cost-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
      },
    ],
    lenderDrawPolicyLimitCents: 55_000_000,
    milestones: options?.milestones ?? [
      {
        budgetCents: 50_000_000,
        dayEnd: 20,
        dayStart: 0,
        dependencyKeys: [],
        durationDays: 20,
        key: "foundation",
        name: "Foundation",
        order: 1,
        submilestones: options.submilestones ?? [],
      },
    ],
    proposalId,
    workosOrganizationId,
  });
  await submitProposalForTest(t, proposalId, workosOrganizationId);
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Ready to close.",
    workosOrganizationId,
  });

  return await closeAndActivateProposal(t, {
      buildStartDate: "2026-05-01",
      ianaTimezone: options.ianaTimezone ?? "America/Toronto",
      loanFacility: {
        interestAnnualBps: 925,
        principalCents: 55_000_000,
      },
      proposalId,
      reason: "Loan closed offline.",
      workosOrganizationId,
  });
}

async function seedCanonicalSiteVisitGuidanceForBuild(
  t: any,
  buildId: any,
  workosOrganizationId = ORG,
) {
  const rows = await t.run(async (ctx: any) =>
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_build", (query: any) => query.eq("buildId", buildId))
      .collect(),
  );
  for (const row of rows) {
    await t.mutation(
      (api as any).submilestone_field_guidance.saveSubmilestoneFieldGuidance,
      {
        proposalSubmilestoneId: row.proposalSubmilestoneId,
        whatToVerifyTiptapJson: tiptapDocument(
          `Verify ${row.name} before the Site Visit.`,
        ),
        cameraAnglesTiptapJson: tiptapDocument(
          `Capture ${row.name} from the primary inspection angle.`,
        ),
        workosOrganizationId,
      },
    );
  }
}

async function seedUnassignedSiteVisitEvidence(
  t: any,
  seed: any,
  options: { collaborationStatus: "active" | "disabled" },
) {
  const closing = await createClosedSingleMilestoneBuild(t, seed, {
    buildName: "Unassigned site-visit evidence build",
    submilestones: [
      { key: "excavation", name: "Excavation", order: 1 },
    ],
  });
  await seedCanonicalSiteVisitGuidanceForBuild(t, closing.buildId);
  const visit = await t.mutation(
    (api as any).production_proposals.assignActiveBuildSiteVisit,
    {
      buildId: closing.buildId,
      idempotencyKey: "assign-site-visit-unassigned-evidence",
      milestoneKey: "foundation",
      note: "Inspect the stale target evidence.",
      requestedDay: 21,
      submilestoneKeys: ["excavation"],
      workosOrganizationId: ORG,
    },
  );
  await t.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", closing.buildId).eq("key", "foundation"),
      )
      .unique();
    await ctx.db.patch(milestone._id, { planningState: "superseded" });
    const build = await ctx.db.get(closing.buildId);
    if (!build) {
      throw new Error("Stale site-visit Build fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: build.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORG,
      status: options.collaborationStatus,
      updatedAt: now,
    });
  });

  const supersededStorageId = await t.run(async (ctx: any) =>
    ctx.storage.store(
      new Blob(["superseded evidence"], { type: "image/webp" }),
    ),
  );
  const supersededRegistration = await t.mutation(
    (api as any).production_proposals.registerActiveBuildSiteVisitFile,
    {
      buildId: String(closing.buildId),
      clientEvidenceId: "superseded-target-evidence",
      fileName: "superseded-target.webp",
      mimeType: "image/webp",
      sizeBytes: 64,
      storageId: supersededStorageId,
      targetMilestoneKey: "foundation",
      targetSubmilestoneKey: "excavation",
      token: visit.visitId,
    },
  );
  expect(supersededRegistration.status).toBe("registered");

  await t.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", closing.buildId).eq("key", "foundation"),
      )
      .unique();
    await ctx.db.delete(milestone._id);
  });
  const missingStorageId = await t.run(async (ctx: any) =>
    ctx.storage.store(new Blob(["missing evidence"], { type: "image/webp" })),
  );
  const missingRegistration = await t.mutation(
    (api as any).production_proposals.registerActiveBuildSiteVisitFile,
    {
      buildId: String(closing.buildId),
      clientEvidenceId: "missing-target-evidence",
      fileName: "missing-target.webp",
      mimeType: "image/webp",
      sizeBytes: 48,
      storageId: missingStorageId,
      targetMilestoneKey: "foundation",
      targetSubmilestoneKey: "removed-submilestone",
      token: visit.visitId,
    },
  );
  expect(missingRegistration.status).toBe("registered");

  const evidence = await t.run(async (ctx: any) => {
    const visitRow = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q: any) => q.eq("visitId", visit.visitId))
      .unique();
    const assets = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_site_visit", (q: any) => q.eq("siteVisitId", visitRow._id))
      .collect();
    const posts = (await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_createdAt", (q: any) =>
        q.eq("buildId", closing.buildId),
      )
      .collect()) as any[];
    const targetReviewPost = posts.find((post) =>
      post.systemEventKey?.endsWith(":target-unassigned"),
    );
    const revision = targetReviewPost?.currentRevisionId
      ? await ctx.db.get(targetReviewPost.currentRevisionId)
      : null;
    const reviewDelivery = (await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient", (q: any) =>
        q
          .eq("organizationId", ORG)
          .eq("recipientWorkosUserId", "user_admin"),
      )
      .collect()).find(
      (delivery: any) =>
        delivery.title === "Site Visit Evidence needs assignment" &&
        delivery.entityId === String(closing.buildId),
    );
    const tenantSetting = await ctx.db
      .query("buildCollaborationTenantSettings")
      .withIndex("by_organizationId", (q: any) => q.eq("organizationId", ORG))
      .unique();
    return { assets, revision, reviewDelivery, targetReviewPost, tenantSetting };
  });
  return {
    closing,
    evidence,
    missingStorageId,
    supersededStorageId,
    visit,
  };
}

async function unlockActiveBuildMilestoneForDraw(
  t: any,
  buildId: any,
  milestoneKey = "foundation",
) {
  await t.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", buildId).eq("key", milestoneKey),
      )
      .unique();
    if (!milestone) throw new Error("Test milestone not found.");
    await ctx.db.patch(milestone._id, {
      completionReview: {
        reviewedAt: "2026-07-14T12:00:00.000Z",
        status: "approved",
      },
      status: "complete",
    });
  });
}

function appPermissionGrants(
  allowed: Partial<
    Record<
      (typeof APP_PERMISSION_RESOURCES)[number],
      Partial<{
        canCreate: boolean;
        canDelete: boolean;
        canUpdate: boolean;
        canView: boolean;
      }>
    >
  >,
) {
  return APP_PERMISSION_RESOURCES.map((resourceType) => ({
    canCreate: allowed[resourceType]?.canCreate ?? false,
    canDelete: allowed[resourceType]?.canDelete ?? false,
    canUpdate: allowed[resourceType]?.canUpdate ?? false,
    canView: allowed[resourceType]?.canView ?? false,
    resourceType,
  }));
}

function oldWeakDrawOperationHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function findLegacyDrawOperationCollision(input: {
  buildId: string;
  requestedByWorkosUserId: string;
}) {
  const seen = new Map<string, { amountCents: number; drawKey: string }>();
  for (let index = 0; index < 250_000; index += 1) {
    const candidate = {
      amountCents: 1_000_000 + index,
      drawKey: `collision-draw-${index}`,
    };
    const operationId = `legacy:${oldWeakDrawOperationHash(
      [
        input.buildId,
        input.requestedByWorkosUserId,
        candidate.drawKey,
        String(candidate.amountCents),
      ].join("|"),
    )}`;
    const previous = seen.get(operationId);
    if (
      previous &&
      (previous.amountCents !== candidate.amountCents ||
        previous.drawKey !== candidate.drawKey)
    ) {
      return {
        first: previous,
        legacyOperationId: operationId,
        second: candidate,
      };
    }
    seen.set(operationId, candidate);
  }
  throw new Error("Failed to find a legacy draw operation collision.");
}

describe("production proposal foundation", () => {
  test("enforces lender approval timestamp invariants", () => {
    expect(() =>
      assertProposalLenderApprovalTimestamps({ status: "approved" }),
    ).toThrow("approvedAt");
    expect(() =>
      assertProposalLenderApprovalTimestamps({
        approvedAt: 1,
        declinedAt: 2,
        status: "approved",
      }),
    ).toThrow("declinedAt");
    expect(() =>
      assertProposalLenderApprovalTimestamps({ status: "declined" }),
    ).toThrow("declinedAt");
    expect(() =>
      assertProposalLenderApprovalTimestamps({
        approvedAt: 1,
        declinedAt: 2,
        status: "declined",
      }),
    ).toThrow("approvedAt");
    expect(() =>
      assertProposalLenderApprovalTimestamps({
        approvedAt: 1,
        status: "approved",
      }),
    ).not.toThrow();
    expect(() =>
      assertProposalLenderApprovalTimestamps({
        declinedAt: 2,
        status: "declined",
      }),
    ).not.toThrow();
  });

  test("projects explicit capital, approval, closing, and activation axes", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Explicit lifecycle proposal",
        location: "12 State Machine Street",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        capitalSource: "external",
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the external proposal for lender assignment.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.approveProposal, {
        proposalId,
        reason: "Do not replay the approval transition.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("requires state submitted");

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(detail.proposal.capitalSource).toBe("external");
    expect(detail.proposal.backOfficeApprovedByWorkosUserId).toBe("user_admin");
    expect(detail.lifecycle).toEqual({
      activation: "inactive",
      backOfficeApproval: "approved",
      capitalSource: "external",
      closing: "pending_closing",
      externalAssignment: "unassigned",
      lenderConfirmation: "pending",
      proposalState: "approved",
    });
    expect(detail.activeBuild).toBeNull();
  });

  test("reject is terminal for the current review attempt", async () => {
    const base = convexTest(schema, modules);
    const t = withIdentity(base, ["admin"], "user_admin", ORG);
    const seed = await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );
    const proposalId = seed.proposals.submitted;

    await t.mutation((api as any).production_proposals.rejectProposal, {
      proposalId,
      reason: "Reject this review attempt.",
      workosOrganizationId: ORG,
    });
    await expect(
      t.mutation((api as any).production_proposals.rejectProposal, {
        proposalId,
        reason: "Do not replay the rejection.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("requires review outcome none");
    await expect(
      t.mutation((api as any).production_proposals.approveProposal, {
        proposalId,
        reason: "Do not approve a rejected review attempt.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("requires review outcome none");
  });

  test("assigns one eligible external lender and exposes bounded history", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t);
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "External assignment proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve the proposal for external lender assignment.",
      workosOrganizationId: ORG,
    });

    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign the eligible external lender for review.",
        workosOrganizationId: ORG,
      },
    );
    expect(assigned.assignmentId).toBeDefined();
    await expect(
      t.mutation(
        (api as any).production_proposals.assignExternalLenderOrganization,
        {
          lenderOrganizationId: lender.lenderOrganizationId,
          proposalId,
          reason: "Do not overlap a current assignment.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("current lender assignment already exists");

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.lifecycle).toMatchObject({
      closing: "pending_closing",
      externalAssignment: "assigned",
      lenderConfirmation: "pending",
    });
    const history = await t.query(
      (api as any).production_proposals.listProposalLenderAssignmentHistory,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(history.page).toEqual([
      expect.objectContaining({
        assignmentId: assigned.assignmentId,
        lenderOrganizationId: lender.lenderOrganizationId,
        status: "current",
      }),
    ]);

    const concurrentProposalId = await createSubmittedProposal(t, seed, {
      buildName: "Concurrent external assignment proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId: concurrentProposalId,
      reason: "Approve the concurrent assignment proposal.",
      workosOrganizationId: ORG,
    });
    const concurrentResults = await Promise.allSettled([
      t.mutation(
        (api as any).production_proposals.assignExternalLenderOrganization,
        {
          lenderOrganizationId: lender.lenderOrganizationId,
          proposalId: concurrentProposalId,
          reason: "Competing assignment attempt one.",
          workosOrganizationId: ORG,
        },
      ),
      t.mutation(
        (api as any).production_proposals.assignExternalLenderOrganization,
        {
          lenderOrganizationId: lender.lenderOrganizationId,
          proposalId: concurrentProposalId,
          reason: "Competing assignment attempt two.",
          workosOrganizationId: ORG,
        },
      ),
    ]);
    expect(
      concurrentResults.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const concurrentHistory = await t.query(
      (api as any).production_proposals.listProposalLenderAssignmentHistory,
      { proposalId: concurrentProposalId, workosOrganizationId: ORG },
    );
    expect(concurrentHistory.page).toHaveLength(1);

    const lenderViewer = withIdentity(
      base,
      ["admin"],
      lender.userId,
      lender.organizationId,
    );
    await expect(
      lenderViewer.query(
        (api as any).production_proposals.listProposalLenderAssignmentHistory,
        { proposalId },
      ),
    ).resolves.toMatchObject({
      page: [
        expect.objectContaining({
          assignmentId: assigned.assignmentId,
          status: "current",
        }),
      ],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.query(
        (api as any).production_proposals.listProposalLenderAssignmentHistory,
        { proposalId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow("Forbidden: role");
    const unrelated = await seedExternalLenderOrganization(t, {
      organizationId: "org_unrelated_assignment_reader",
      userId: "user_unrelated_assignment_reader",
    });
    const unrelatedViewer = withIdentity(
      base,
      ["admin"],
      unrelated.userId,
      unrelated.organizationId,
    );
    await expect(
      unrelatedViewer.query(
        (api as any).production_proposals.listProposalLenderAssignmentHistory,
        { proposalId, workosOrganizationId: unrelated.organizationId },
      ),
    ).rejects.toThrow(/Forbidden: (proposal scope|brokerage)/);
  });

  test("withdrawal closes the assignment interval without deleting history", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_withdrawal_lender",
      organizationName: "Withdrawal Lender Organization",
      userId: "user_withdrawal_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Withdrawal assignment proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before assigning the withdrawal test lender.",
      workosOrganizationId: ORG,
    });
    const assigned = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign lender before withdrawal.",
        workosOrganizationId: ORG,
      },
    );
    vi.useFakeTimers();
    await t.mutation(
      (api as any).production_proposals.withdrawExternalLenderAssignment,
      {
        assignmentId: assigned.assignmentId,
        proposalId,
        reason: "Borrower returned to the internal path before closing.",
        workosOrganizationId: ORG,
      },
    );
    await base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();
    await expect(
      t.mutation(
        (api as any).production_proposals.withdrawExternalLenderAssignment,
        {
          assignmentId: assigned.assignmentId,
          proposalId,
          reason: "Do not replay withdrawal.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("already withdrawn");

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.lifecycle).toMatchObject({
      backOfficeApproval: "approved",
      closing: "pending_closing",
      externalAssignment: "withdrawn",
      lenderConfirmation: "pending",
    });
    // Keep the selected external funding path so another lender can be assigned;
    // withdrawal restores internal closing eligibility without rewriting it.
    expect(detail.proposal.capitalSource).toBe("external");
    const formerLender = withIdentity(
      base,
      ["admin"],
      lender.userId,
      lender.organizationId,
    );
    const formerHistory = await formerLender.query(
      (api as any).production_proposals.listProposalLenderAssignmentHistory,
      { proposalId },
    );
    expect(formerHistory).toMatchObject({
      page: [
        expect.objectContaining({
          assignmentId: assigned.assignmentId,
          status: "withdrawn",
        }),
      ],
    });
    expect(formerHistory.page[0]?.withdrawalReason).toBeUndefined();
    expect(formerHistory.page[0]?.withdrawnByWorkosUserId).toBeUndefined();
    const formerLenderProjection = await formerLender.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: assigned.assignmentId, proposalId },
    );
    const [frozenDocuments, frozenRevisions] = await Promise.all([
      formerLender.query(
        (api as any).production_proposals.listLenderProposalAssignmentDocuments,
        { assignmentId: assigned.assignmentId, paginationOpts: { cursor: null, numItems: 50 }, proposalId },
      ),
      formerLender.query(
        (api as any).production_proposals.listLenderProposalAssignmentRevisions,
        { assignmentId: assigned.assignmentId, paginationOpts: { cursor: null, numItems: 50 }, proposalId },
      ),
    ]);
    expect(formerLenderProjection).toMatchObject({
      assignment: {
        assignmentId: assigned.assignmentId,
        readOnly: true,
        status: "withdrawn",
      },
      lifecycle: {
        externalAssignment: "withdrawn",
      },
      snapshot: {
        proposal: {
          buildName: "Withdrawal assignment proposal",
          location: "18 Assignment History Road",
          status: "approved",
        },
      },
    });
    expect(frozenDocuments.page).toEqual([expect.objectContaining({ fileName: "assignment-permit.pdf" })]);
    expect(frozenRevisions.page).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentId: assigned.assignmentId, revisionNumber: 2 })]));
    expect(formerLenderProjection.assignment.withdrawalReason).toBeUndefined();

    await base.run(async (ctx: any) => {
      const documents = await ctx.db
        .query("proposalDocuments")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .take(10);
      await ctx.db.patch(proposalId, {
        buildName: "Internal-only revised proposal",
        updatedAt: Date.now(),
        updatedByWorkosUserId: "user_admin",
      });
      await ctx.db.patch(documents[0]._id, {
        fileName: "internal-only-renamed-permit.pdf",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("proposalDocuments", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        documentType: "supporting",
        fileName: "internal-only-document.pdf",
        mimeType: "application/pdf",
        organizationId: ORG,
        proposalId,
        sizeBytes: 128,
        status: "uploaded",
        updatedAt: Date.now(),
        uploadedByWorkosUserId: "user_admin",
      });
    });
    await t.mutation(
      (api as any).production_proposals.configureProposalReviewPolicy,
      {
        ...(await phase3CommandBaseForTest(t, proposalId)),
        idempotencyKey: "withdrawn-internal-only-policy",
        policy: {
          drawApprovalMode: "backoffice_only",
          milestoneApprovalMode: "backoffice_only",
          milestoneReceiptInvoiceRequired: true,
          milestoneSiteVisitRequired: true,
        },
        proposalId,
        reason: "Change policy after the lender assignment period ended.",
        workosOrganizationId: ORG,
      },
    );
    const frozenProjection = await formerLender.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: assigned.assignmentId, proposalId },
    );
    expect(frozenProjection.snapshot).toEqual(formerLenderProjection.snapshot);
    const frozenDocumentsAfter = await formerLender.query(
      (api as any).production_proposals.listLenderProposalAssignmentDocuments,
      { assignmentId: assigned.assignmentId, paginationOpts: { cursor: null, numItems: 50 }, proposalId },
    );
    const frozenRevisionsAfter = await formerLender.query(
      (api as any).production_proposals.listLenderProposalAssignmentRevisions,
      { assignmentId: assigned.assignmentId, paginationOpts: { cursor: null, numItems: 50 }, proposalId },
    );
    expect(
      frozenDocumentsAfter.page.map((document: any) => document.fileName),
    ).not.toContain("internal-only-document.pdf");
    expect(
      frozenRevisionsAfter.page.map((revision: any) =>
        revision.revisionNumber,
      ),
    ).not.toContain(4);

    await lockProposalReviewPolicyForTest(t, proposalId, "withdrawn");
    const closing = await t.mutation(
      (api as any).production_proposals.recordProposalClosing,
      {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Close after the external assignment was withdrawn.",
        workosOrganizationId: ORG,
      },
    );
    expect(closing.closingId).toBeDefined();
    const activated = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Activate the internal closing path.",
        workosOrganizationId: ORG,
      },
    );
    expect(activated.buildId).toBeDefined();
  });

  test("allows internal-capital lender assignment and app-owned organizations without members", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const eligibleLender = await seedExternalLenderOrganization(t, {
      organizationId: "org_internal_assignment_lender",
      userId: "user_internal_assignment_lender",
    });
    const emptyLenderOrganizationId = await t.run(async (ctx: any) => {
      const now = Date.now();
      return await ctx.db.insert("lenderOrganizations", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "App Owned Lender Without Members",
        legalName: "App Owned Lender Without Members Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
        updatedAt: now,
      });
    });
    const internalProposalId = await createSubmittedProposal(t, seed, {
      buildName: "Internal capital assignment proposal",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId: internalProposalId,
      reason: "Approve the internal-capital proposal.",
      workosOrganizationId: ORG,
    });
    const internalLenderOptions = await t.query(
      (api as any).production_proposals.listEligibleExternalLenderOrganizations,
      { proposalId: internalProposalId, workosOrganizationId: ORG },
    );
    expect(internalLenderOptions.organizations).toEqual(
      expect.arrayContaining([
        {
          lenderOrganizationId: eligibleLender.lenderOrganizationId,
          lenderOrganizationName: "Northstar Lending Organization",
        },
        {
          lenderOrganizationId: emptyLenderOrganizationId,
          lenderOrganizationName: "App Owned Lender Without Members",
        },
      ]),
    );
    const internalAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: eligibleLender.lenderOrganizationId,
        proposalId: internalProposalId,
        reason: "Assign the lender for the approved proposal.",
        workosOrganizationId: ORG,
      },
    );
    expect(internalAssignment.assignmentId).toBeDefined();
    const internalLenderViewer = withIdentity(
      base,
      ["admin"],
      eligibleLender.userId,
      eligibleLender.organizationId,
    );
    const internalApproval = await approveCurrentProposalConfirmationForTest(
      t,
      internalLenderViewer,
      internalProposalId,
      eligibleLender.organizationId,
      "phase2-confirm-internal-assignment",
      "Confirm the assigned lender review.",
    );
    expect(internalApproval.approvalId).toBeDefined();
    const internalDetail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId: internalProposalId, workosOrganizationId: ORG },
    );
    expect(internalDetail.lifecycle).toMatchObject({
      externalAssignment: "assigned",
      lenderConfirmation: "approved",
    });

    const emptyLenderProposalId = await createSubmittedProposal(t, seed, {
      buildName: "Assignment before lender membership proposal",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId: emptyLenderProposalId,
      reason: "Approve before attaching lender members.",
      workosOrganizationId: ORG,
    });
    const emptyLenderAssignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: emptyLenderOrganizationId,
        proposalId: emptyLenderProposalId,
        reason: "Assign the app-owned lender before its members reconcile.",
        workosOrganizationId: ORG,
      },
    );
    expect(emptyLenderAssignment.assignmentId).toBeDefined();
  });

  test("records closing separately from activation and replays activation safely", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Separate closing proposal",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before separate closing.",
      workosOrganizationId: ORG,
    });

    await lockProposalReviewPolicyForTest(t, proposalId, "separate-close");
    const closing = await t.mutation(
      (api as any).production_proposals.recordProposalClosing,
      {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925.6,
          principalCents: 55_000_000.6,
        },
        proposalId,
        reason: "Record the loan closing before activation.",
        workosOrganizationId: ORG,
      },
    );
    const afterClosing = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closing.closingId).toBeDefined();
    expect(afterClosing.proposal.status).toBe("closed");
    expect(afterClosing.activeBuild).toBeNull();
    expect(afterClosing.lifecycle).toMatchObject({
      activation: "inactive",
      closing: "closed",
    });
    const persistedClosing: any = await base.run((ctx: any) =>
      ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .unique(),
    );
    expect(persistedClosing?._id).toBe(closing.closingId);
    expect(persistedClosing?.loanFacility).toEqual({
      interestAnnualBps: 926,
      principalCents: 55_000_001,
    });

    const activated = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Activate the separately closed Build.",
        workosOrganizationId: ORG,
      },
    );
    expect(activated.buildId).toBeDefined();
    const replay = await t.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Replay the activation safely.",
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toEqual(activated);
    await expect(
      t.mutation((api as any).production_proposals.recordProposalClosing, {
        buildStartDate: "2026-08-02",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Reject a duplicate closing.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("already recorded");
  });

  test("requires current lender approval and permits the assigned lender to close and activate", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_closing_lender",
      userId: "user_closing_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "External closing eligibility proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before external closing eligibility.",
      workosOrganizationId: ORG,
    });
    const lenderOptions = await t.query(
      (api as any).production_proposals
        .listEligibleExternalLenderOrganizations,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(lenderOptions.organizations).toEqual([
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        lenderOrganizationName: "Northstar Lending Organization",
      },
    ]);
    const assignment = await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign lender for closing eligibility.",
        workosOrganizationId: ORG,
      },
    );
    const lenderViewer = withIdentity(
      base,
      ["admin"],
      lender.userId,
      lender.organizationId,
    );
    await expect(
      t.mutation((api as any).production_proposals.recordProposalClosing, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Reject closing before lender approval.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("eligible active lender approval");

    const approval = await approveCurrentProposalConfirmationForTest(
      t,
      lenderViewer,
      proposalId,
      lender.organizationId,
      "phase2-confirm-external-closing",
      "Confirm the current proposal for closing.",
    );
    expect(approval.approvalId).toBeDefined();
    const lenderProjection = await lenderViewer.query(
      (api as any).production_proposals.getLenderProposalLifecycleProjection,
      { assignmentId: assignment.assignmentId, proposalId },
    );
    expect(lenderProjection).toMatchObject({
      assignment: {
        assignmentId: assignment.assignmentId,
        lenderOrganizationId: lender.lenderOrganizationId,
        readOnly: false,
        status: "current",
      },
      canApproveClosing: false,
      lifecycle: {
        externalAssignment: "assigned",
        lenderConfirmation: "approved",
      },
    });
    expect(lenderProjection.assignment.withdrawalReason).toBeUndefined();
    const backofficeStringProjection = await t.query(
      (api as any).production_proposals.getProposalDetailByString,
      { proposalId: String(proposalId), workosOrganizationId: ORG },
    );
    expect(backofficeStringProjection).toMatchObject({
      lenderApproval: {
        approvalId: approval.approvalId,
        status: "approved",
      },
      lenderAssignment: {
        assignmentId: assignment.assignmentId,
        lenderOrganizationId: lender.lenderOrganizationId,
        status: "current",
      },
      lenderAssignmentHistory: [
        expect.objectContaining({ assignmentId: assignment.assignmentId }),
      ],
    });
    expect(backofficeStringProjection.lenderApproval.approverWorkosUserId).toBeUndefined();
    const builder = withIdentity(base, ["builder"], "user_builder");
    const builderProjection = await builder.query(
      (api as any).production_proposals.getProposalDetailByString,
      { proposalId: String(proposalId), workosOrganizationId: ORG },
    );
    expect(builderProjection.lifecycle).toMatchObject({
      externalAssignment: "assigned",
      lenderConfirmation: "approved",
    });
    expect(builderProjection.lenderAssignment).toBeNull();
    expect(builderProjection.lenderAssignmentHistory).toEqual([]);
    const completedConfirmationBase = await phase4CommandBaseForTest(
      t,
      proposalId,
    );
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...completedConfirmationBase,
          idempotencyKey: "phase2-do-not-replay-lender-approval",
          proposalId,
          reason: "Do not replay lender approval.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("Stale or completed proposal confirmation cycle");

    await lockProposalReviewPolicyForTest(t, proposalId, "external-close");

    await base.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query: any) =>
          query
            .eq("workosUserId", lender.userId)
            .eq("workosOrganizationId", lender.organizationId),
        )
        .collect();
      const membership = memberships[0];
      if (!membership) {
        throw new Error("Missing lender membership for deactivation test.");
      }
      await ctx.db.patch(membership._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation((api as any).production_proposals.recordProposalClosing, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Reject close after lender membership deactivation.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("eligible active lender approval");
    await base.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query: any) =>
          query
            .eq("workosUserId", lender.userId)
            .eq("workosOrganizationId", lender.organizationId),
        )
        .collect();
      const membership = memberships[0];
      if (!membership) {
        throw new Error("Missing lender membership after deactivation test.");
      }
      await ctx.db.patch(membership._id, {
        status: "active",
        updatedAt: Date.now(),
      });
    });

    const closing = await lenderViewer.mutation(
      (api as any).production_proposals.recordProposalClosing,
      {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Lender records the eligible closing.",
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(closing.closingId).toBeDefined();
    const activated = await lenderViewer.mutation(
      (api as any).production_proposals.activateClosedProposal,
      {
        proposalId,
        reason: "Lender activates the closed Build.",
        workosOrganizationId: lender.organizationId,
      },
    );
    expect(activated.buildId).toBeDefined();
    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.lifecycle).toMatchObject({
      activation: "active",
      closing: "closed",
      externalAssignment: "assigned",
      lenderConfirmation: "approved",
    });
    const persistedApproval = await base.run((ctx: any) =>
      ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal_assignment", (query: any) =>
          query
            .eq("proposalId", proposalId)
            .eq("assignmentId", assignment.assignmentId),
        )
        .unique(),
    );
    expect(persistedApproval).toMatchObject({
      _id: approval.approvalId,
      status: "approved",
      approverWorkosUserId: lender.userId,
    });
  });

  test("caps lender proposal decisions with the app-owned workflow policy", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const lender = await seedExternalLenderOrganization(t, {
      organizationId: "org_policy_lender",
      role: "lender-admin",
      userId: "user_policy_lender",
    });
    const proposalId = await createSubmittedProposal(t, seed, {
      buildName: "Policy-capped external proposal",
      capitalSource: "external",
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve before policy-cap validation.",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.assignExternalLenderOrganization,
      {
        lenderOrganizationId: lender.lenderOrganizationId,
        proposalId,
        reason: "Assign lender before policy-cap validation.",
        workosOrganizationId: ORG,
      },
    );
    await base.run(async (ctx: any) => {
      await ctx.db.patch(lender.lenderOrganizationId, {
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: false,
          siteVisitReview: true,
        },
        updatedAt: Date.now(),
      });
    });

    const lenderViewer = withIdentity(
      base,
      ["lender-admin"],
      lender.userId,
      lender.organizationId,
    );
    const deniedConfirmationBase = await phase4CommandBaseForTest(t, proposalId);
    await expect(
      lenderViewer.mutation(
        (api as any).production_proposals.approveExternalProposalForClosing,
        {
          ...deniedConfirmationBase,
          idempotencyKey: "phase2-policy-denied-confirmation",
          proposalId,
          reason: "This decision is blocked by the organization policy.",
          workosOrganizationId: lender.organizationId,
        },
      ),
    ).rejects.toThrow("permission proposal_review");
  });

  test("persists an explicit Build IANA timezone and rejects invalid closing input", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const valid = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Timezone-persisted Build",
      ianaTimezone: "America/Toronto",
    });
    const stored = await base.run((ctx: any) => ctx.db.get(valid.buildId));
    expect(stored).toMatchObject({ timezone: "America/Toronto" });
    await t.mutation(
      (api as any).production_proposals.updateActiveBuildNonFinancialDetails,
      {
        buildId: valid.buildId,
        buildName: "Timezone-persisted Build",
        ianaTimezone: "America/New_York",
        location: "44 Actual Cost Lane",
        reason: "Repair the canonical Build timezone.",
        startDate: "2026-05-01",
        workosOrganizationId: ORG,
      }
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.updateActiveBuildNonFinancialDetails,
        {
          buildId: valid.buildId,
          buildName: "Timezone-persisted Build",
          ianaTimezone: "Not/AZone",
          location: "44 Actual Cost Lane",
          reason: "Reject invalid timezone.",
          startDate: "2026-05-01",
          workosOrganizationId: ORG,
        }
      )
    ).rejects.toThrow("not a valid IANA timezone");
    const updated = await base.run((ctx: any) => ctx.db.get(valid.buildId));
    expect(updated).toMatchObject({ timezone: "America/New_York" });

    await expect(
      createClosedSingleMilestoneBuild(t, seed, {
        buildName: "Invalid timezone Build",
        ianaTimezone: "Not/AZone",
      })
    ).rejects.toThrow("not a valid IANA timezone");
    const invalidBuilds = await base.run((ctx: any) =>
      ctx.db
        .query("activeBuilds")
        .filter((query: any) =>
          query.eq(query.field("buildName"), "Invalid timezone Build")
        )
        .collect()
    );
    expect(invalidBuilds).toHaveLength(0);
  });

  test("submits a custom timeline plan without an optimizer preset", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Custom timeline proposal",
        location: "12 Custom Plan Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await builder.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    const submitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submitted.proposal.selectedPlan).toBeUndefined();
    expect(submitted.proposal.status).toBe("submitted");
  });

  test("preserves optional optimizer preset metrics through submission handoff", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Selected plan proposal",
        location: "12 Comparison Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const storedProposal = await t.run((ctx: any) => ctx.db.get(proposalId));
    expect(storedProposal.borrowerStartingCashCents).toBe(40_000_000);

    await builder.mutation(
      (api as any).production_proposals.selectProposalPlan,
      {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 30,
          requiredWorkingCapitalCents: 32_000_000,
          startingCashCents: 40_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 40_000_000,
        },
        planKey: "cheapestFeasible",
        proposalId,
        recommendationReason:
          "Lowest financing cost while maintaining the required reserve.",
        workosOrganizationId: ORG,
      },
    );

    const selectedWorkspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(selectedWorkspace.proposal.selectedPlan).toMatchObject({
      metrics: {
        drawCount: 2,
        projectedDurationDays: 30,
        requiredWorkingCapitalCents: 32_000_000,
        totalCostCents: 350_000,
      },
      name: "Cheapest Feasible",
      planKey: "cheapestFeasible",
    });

    await builder.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    const submitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submitted.proposal.selectedPlan).toEqual(
      selectedWorkspace.proposal.selectedPlan,
    );
    expect(submitted.proposal.status).toBe("submitted");
  });

  test("creates, saves, submits, approves, and closes a production Build Proposal without mutating demo tables", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Production proposal",
        location: "123 Production Ave, Toronto, ON",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await submitProposalForTest(t, proposalId);
    await expect(
      t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [],
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/draft/);

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Permit and draw plan reviewed.",
      workosOrganizationId: ORG,
    });

    const approved = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(approved.proposal.status).toBe("approved");
    expect(approved.activeBuild).toBeNull();

    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
    });

    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.proposal.status).toBe("closed");
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.activeBuild?.startDate).toBe("2026-08-01");
    expect(closed.buildMilestones).toHaveLength(1);
    expect(closed.buildMilestones[0]).toMatchObject({
      budgetCents: approved.milestones[0].budgetCents,
      drawAvailabilityCents: approved.milestones[0].drawAvailabilityCents,
      proposalMilestoneId: approved.milestones[0]._id,
    });
    expect(closed.buildSubmilestones).toHaveLength(1);
    expect(closed.plannedDraws[0]).toMatchObject({
      amountCents: 16_000_000,
      status: "planned",
    });
    expect(closed.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.closed",
      ]),
    );

    const persistedState = await t.run(async (ctx: any) => ({
      activeBuildsForProposal: await ctx.db
        .query("activeBuilds")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      demoBuilds: await ctx.db.query("demo_builds").collect(),
      demoProposalDrafts: await ctx.db
        .query("demo_builderProposalDrafts")
        .collect(),
    }));
    expect(persistedState.activeBuildsForProposal).toHaveLength(1);
    expect(persistedState.activeBuildsForProposal[0]).toMatchObject({
      _id: closing.buildId,
      proposalId,
    });
    expect(persistedState.demoBuilds).toHaveLength(0);
    expect(persistedState.demoProposalDrafts).toHaveLength(0);
  });

  test("publishes active build navigation only after closing and passing record, scope, and authorization checks", async () => {
    const otherOrg = "org_production_other_scope";
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scoped activation proposal",
        location: "210 Activation Way",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "activation-scope-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 50_000_000,
                durationDays: 20,
                key: "forms",
                name: "Forms",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(admin, proposalId);
    await admin.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to activate.",
      workosOrganizationId: ORG,
    });

    const beforeClosing = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(beforeClosing.activeBuild).toBeNull();

    const workspaceBeforeClosing = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    const proposalRowBeforeClosing = workspaceBeforeClosing.proposalRows.find(
      (row: any) => row.proposalId === String(proposalId),
    );
    expect(proposalRowBeforeClosing).toMatchObject({
      kind: "proposal",
      proposalId: String(proposalId),
    });
    expect(proposalRowBeforeClosing).not.toHaveProperty("buildKey");
    expect(
      workspaceBeforeClosing.activeBuildRows.some(
        (row: any) => row.proposalId === String(proposalId),
      ),
    ).toBe(false);

    const closing = await closeAndActivateProposal(admin, {
        buildStartDate: "2026-08-02",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Closed for activation scope test.",
        workosOrganizationId: ORG,
    });

    const blocked = withIdentity(base, ["builder"], "user_other_builder");
    const otherOrgAdmin = (
      await seeded(["admin"], "user_admin_other_scope", otherOrg)
    ).t;

    const authorizedDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const wrongScopeDetail = await otherOrgAdmin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: otherOrg },
    );

    await expect(
      blocked.query(
        (api as any).production_proposals.getActiveBuildDetailByString,
        {
          buildId: String(closing.buildId),
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/forbidden/i);

    expect(authorizedDetail.build).toMatchObject({ _id: closing.buildId });
    expect(wrongScopeDetail).toBeNull();
    await expect(
      admin.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: String(closing.buildId), workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({
      buildName: "Scoped activation proposal",
      category: "available",
      requestedBuildId: String(closing.buildId),
    });
    await expect(
      blocked.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: String(closing.buildId), workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({
      category: "accessDenied",
      requestedBuildId: String(closing.buildId),
    });
    await expect(
      admin.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: "not-an-active-build-id", workosOrganizationId: ORG },
      ),
    ).resolves.toEqual({
      category: "invalidLink",
      requestedBuildId: "not-an-active-build-id",
    });

    const workspaceAfterClosing = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(
      workspaceAfterClosing.proposalRows.find(
        (row: any) => row.proposalId === String(proposalId),
      ),
    ).toMatchObject({
      buildKey: String(closing.buildId),
      kind: "proposal",
      proposalId: String(proposalId),
    });
    expect(workspaceAfterClosing.activeBuildRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildKey: String(closing.buildId),
          kind: "activeBuild",
          proposalId: String(proposalId),
        }),
      ]),
    );
  });

  test("adds material and equipment cost items without turning them into submilestones", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Material planning proposal",
        location: "900 Supply Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const materialItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 7_500_000,
        description: "Concrete and rebar package.",
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 2,
        relevantSubmilestoneKeys: ["forms"],
        supplier: "Apex Supply",
        title: "Foundation material package",
        workosOrganizationId: ORG,
      },
    );
    const equipmentItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 2_000_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: [],
        supplier: "Rental Desk",
        title: "Pump rental",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation((api as any).production_proposals.deleteProposalCostItem, {
      itemId: equipmentItemId,
      proposalId,
      reason: "Rental moved into contractor scope.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.updateProposalCostItem, {
      costCents: 8_000_000,
      itemId: materialItemId,
      proposalId,
      quantity: 2.5,
      reason: "Supplier quote revised.",
      workosOrganizationId: ORG,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(1);
    expect(detail.costItems[0]).toMatchObject({
      itemType: "material",
      milestoneKey: "foundation",
      quantity: 2.5,
      relevantSubmilestoneKeys: ["forms"],
      supplier: "Apex Supply",
      title: "Foundation material package",
    });
    expect(detail.submilestones).toHaveLength(1);
    expect(detail.proposal.totalBudgetCents).toBe(40_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 40_000_000,
      drawAvailabilityCents: 32_000_000,
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 32_000_000 });

    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit packet pending municipality upload.",
      proposalId,
      reason: "Material planning detail reviewed.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-15",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 80_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
    });
    const buildDetail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetail.costItems).toHaveLength(1);
    expect(buildDetail.costItems[0]).toMatchObject({
      costCents: 8_000_000,
      itemType: "material",
      quantity: 2.5,
      relevantSubmilestoneKeys: ["forms"],
    });
    expect(buildDetail.build.totalBudgetCents).toBe(40_000_000);
    expect(buildDetail.submilestones).toHaveLength(1);

    const addedItemId = await t.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_500_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        quantity: 1,
        relevantSubmilestoneKeys: [],
        supplier: "Rental Desk",
        title: "Pump rental",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation((api as any).production_proposals.updateActiveBuildCostItem, {
        budgetTreatment: "logOnly",
        buildId: closing.buildId,
        itemId: addedItemId,
        reason: "Attempting to change planning treatment after closing.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(
      "Budget treatment can only be changed during proposal planning",
    );
    await t.mutation(
      (api as any).production_proposals.updateActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_750_000,
        itemId: addedItemId,
        reason: "Rental quote revised.",
        workosOrganizationId: ORG,
      },
    );
    const buildDetailAfterUpdate = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetailAfterUpdate.costItems).toHaveLength(2);
    expect(buildDetailAfterUpdate.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costCents: 8_000_000,
          title: "Foundation material package",
        }),
        expect.objectContaining({
          costCents: 1_750_000,
          title: "Pump rental",
        }),
      ]),
    );
    expect(buildDetailAfterUpdate.build.totalBudgetCents).toBe(41_750_000);

    await t.mutation(
      (api as any).production_proposals.deleteActiveBuildCostItem,
      {
        buildId: closing.buildId,
        itemId: addedItemId,
        reason: "Rental moved into contractor scope.",
        workosOrganizationId: ORG,
      },
    );
    const buildDetailAfterDelete = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetailAfterDelete.costItems).toHaveLength(1);
    expect(buildDetailAfterDelete.build.totalBudgetCents).toBe(40_000_000);
  });

  test("scopes active-build material commands to canonical revisions and receipts", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Scoped material command build",
      location: "18 Scoped Material Lane",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });

    const submilestoneId = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .filter((query: any) => query.eq(query.field("key"), "forms"))
        .unique();
      return submilestone._id;
    });

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("buildSubmilestoneCommandReceipts", {
        buildId: closing.buildId,
        buildSubmilestoneId: submilestoneId,
        command: "createActiveBuildCostItem",
        createdAt: Date.now(),
        idempotencyKey: "scoped-material-legacy-receipt",
        organizationId: ORG,
        resultJson: JSON.stringify({
          itemId: "legacy-material-item",
          revision: 1,
        }),
      });
    });

    const createArgs = {
      buildId: closing.buildId,
      costCents: 1_500_000,
      expectedRevision: 0,
      idempotencyKey: "scoped-material-create-001",
      itemType: "material" as const,
      milestoneKey: "foundation",
      quantity: 1,
      relevantSubmilestoneKeys: ["forms"],
      submilestoneKey: "forms",
      supplier: "Scoped Supply",
      title: "Scoped forms package",
      workosOrganizationId: ORG,
    };
    await expect(
      admin.mutation(
        (api as any).production_proposals.createActiveBuildCostItem,
        {
          ...createArgs,
          idempotencyKey: "scoped-material-blank-key",
          submilestoneKey: "   ",
        },
      ),
    ).rejects.toThrow(/SUBMILESTONE_NOT_FOUND|non-empty Sub-milestone key/i);
    await expect(
      admin.mutation(
        (api as any).production_proposals.createActiveBuildCostItem,
        {
          ...createArgs,
          idempotencyKey: "scoped-material-legacy-receipt",
        },
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED|different canonical command/i);

    const created = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      createArgs,
    );
    expect(created).toMatchObject({
      replayed: false,
      revision: 1,
    });
    const createdItemId = (created as any).itemId;

    const replayedCreate = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      createArgs,
    );
    expect(replayedCreate).toMatchObject({
      itemId: createdItemId,
      replayed: true,
      revision: 1,
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.createActiveBuildCostItem,
        {
          ...createArgs,
          title: "Different scoped forms package",
        },
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED|different canonical command/i);

    const updated = await admin.mutation(
      (api as any).production_proposals.updateActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_750_000,
        expectedRevision: 1,
        idempotencyKey: "scoped-material-update-001",
        itemId: createdItemId,
        reason: "Scoped material quote revised.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(updated).toMatchObject({ replayed: false, revision: 2 });
    await expect(
      admin.mutation(
        (api as any).production_proposals.updateActiveBuildCostItem,
        {
          buildId: closing.buildId,
          costCents: 2_000_000,
          expectedRevision: 1,
          idempotencyKey: "scoped-material-update-stale-001",
          itemId: createdItemId,
          reason: "Stale scoped material write.",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/STALE_SUBMILESTONE_REVISION|Sub-milestone changed/i);

    const deleted = await admin.mutation(
      (api as any).production_proposals.deleteActiveBuildCostItem,
      {
        buildId: closing.buildId,
        expectedRevision: 2,
        idempotencyKey: "scoped-material-delete-001",
        itemId: createdItemId,
        milestoneKey: "foundation",
        reason: "Scoped material removed.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(deleted).toMatchObject({ replayed: false, revision: 3 });
    const replayedDelete = await admin.mutation(
      (api as any).production_proposals.deleteActiveBuildCostItem,
      {
        buildId: closing.buildId,
        expectedRevision: 2,
        idempotencyKey: "scoped-material-delete-001",
        itemId: createdItemId,
        milestoneKey: "foundation",
        reason: "Scoped material removed.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(replayedDelete).toMatchObject({
      itemId: createdItemId,
      replayed: true,
      revision: 3,
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.deleteActiveBuildCostItem,
        {
          ...{
            buildId: closing.buildId,
            expectedRevision: 2,
            idempotencyKey: "scoped-material-delete-001",
            itemId: createdItemId,
            reason: "Scoped material removed.",
            submilestoneKey: "forms",
            workosOrganizationId: ORG,
          },
          milestoneKey: "   ",
        },
      ),
    ).rejects.toThrow(/MILESTONE_KEY_REQUIRED|non-empty Milestone key/i);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(0);
    expect(detail.submilestones[0].workflowRevision).toBe(3);
    expect(
      detail.auditEvents.some(
        (event: any) =>
          event.entityType === "buildSubmilestone" &&
          event.canonicalTarget?.submilestoneId === String(submilestoneId),
      ),
    ).toBe(true);

    await runAuditEventBuildIdBackfill(admin);
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_material_audit_resource_only",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ material: { canView: true } }),
        staffWorkosUserId: "user_material_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const materialResourceOnly = withIdentity(
      base,
      ["builder-staff"],
      "user_material_audit_resource_only",
    );
    const materialResourceOnlyDetail = await materialResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const materialCommands = new Set([
      "createActiveBuildCostItem",
      "updateActiveBuildCostItem",
      "deleteActiveBuildCostItem",
    ]);
    expect(
      materialResourceOnlyDetail.auditEvents.some(
        (event: any) =>
          materialCommands.has(event.command) &&
          event.entityType === "buildSubmilestone",
      ),
    ).toBe(false);

    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          material: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_material_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const materialAllowedDetail = await materialResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      materialAllowedDetail.auditEvents.some(
        (event: any) =>
          materialCommands.has(event.command) &&
          event.canonicalTarget?.submilestoneId === String(submilestoneId),
      ),
    ).toBe(true);

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(submilestoneId, { workflowRevision: undefined });
    });
    const legacyDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(legacyDetail.submilestones[0].workflowRevision).toBe(0);
  });

  test("canonical scoped key sets use code-unit ordering for fingerprints", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Code-unit scoped key build",
      location: "18 Code Unit Lane",
      submilestones: [
        { key: "Zeta", name: "Uppercase target", order: 1 },
        { key: "alpha", name: "Lowercase target", order: 2 },
      ],
    });
    const createArgs = {
      buildId: closing.buildId,
      costCents: 1_500_000,
      expectedRevision: 0,
      idempotencyKey: "code-unit-scoped-material-001",
      itemType: "material" as const,
      milestoneKey: "foundation",
      quantity: 1,
      relevantSubmilestoneKeys: ["alpha", "Zeta"],
      submilestoneKey: "Zeta",
      supplier: "Code Unit Supply",
      title: "Code-unit scoped package",
      workosOrganizationId: ORG,
    };
    const created = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      createArgs,
    );
    const item = await admin.run(async (ctx: any) =>
      ctx.db.get((created as any).itemId),
    );
    expect(item.relevantSubmilestoneKeys).toEqual(["Zeta", "alpha"]);

    const replayed = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      {
        ...createArgs,
        expectedRevision: 99,
        relevantSubmilestoneKeys: ["Zeta", "alpha"],
      },
    );
    expect(replayed).toMatchObject({
      itemId: (created as any).itemId,
      replayed: true,
      revision: 1,
    });
  });

  test("applies log-only, additive, and maintained sub-milestone cost treatments", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Cost treatment proposal",
        location: "18 Allocation Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 20_000_000,
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 20_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 10,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.createProposalCostItem, {
        budgetTreatment: "add",
        costCents: 1_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Untargeted added package",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Add requires one budget sub-milestone target");
    await expect(
      t.mutation((api as any).production_proposals.createProposalCostItem, {
        budgetTreatment: "maintain",
        costCents: 1_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Untargeted maintained package",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Maintain requires one budget sub-milestone target");

    await t.mutation((api as any).production_proposals.createProposalCostItem, {
      budgetSubmilestoneKey: "forms",
      budgetTreatment: "logOnly",
      costCents: 2_000_000,
      itemType: "material",
      milestoneKey: "foundation",
      proposalId,
      quantity: 1,
      relevantSubmilestoneKeys: ["forms"],
      title: "Logged quote",
      workosOrganizationId: ORG,
    });
    const maintainedItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
        costCents: 5_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Maintained package",
        workosOrganizationId: ORG,
      },
    );
    const additiveItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "add",
        costCents: 3_000_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Added pump",
        workosOrganizationId: ORG,
      },
    );

    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(23_000_000);
    expect(detail.proposal.borrowerCoPayCents).toBe(4_600_000);
    expect(detail.milestones[0].budgetCents).toBe(23_000_000);
    expect(detail.submilestones[0].budgetCents).toBe(23_000_000);
    expect(detail.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetTreatment: "logOnly",
          title: "Logged quote",
        }),
        expect.objectContaining({
          budgetSubmilestoneKey: "forms",
          budgetTreatment: "maintain",
          title: "Maintained package",
        }),
      ]),
    );
    expect(
      detail.costItems.find((item: any) => item.title === "Logged quote")
        ?.budgetSubmilestoneKey,
    ).toBeUndefined();

    await t.mutation((api as any).production_proposals.updateProposalCostItem, {
      budgetSubmilestoneKey: "forms",
      budgetTreatment: "maintain",
      itemId: additiveItemId,
      proposalId,
      workosOrganizationId: ORG,
    });
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(20_000_000);
    expect(detail.submilestones[0].budgetCents).toBe(20_000_000);

    await expect(
      t.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          proposalId,
          submilestones: [],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(
      "Cannot remove budget sub-milestone forms while cost items target it",
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          proposalId,
          submilestones: [
            {
              budgetCents: 7_999_999,
              durationDays: 10,
              key: "forms",
              name: "Forms and pour",
              order: 1,
            },
          ],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Maintained cost items exceed the forms budget");

    await expect(
      t.mutation((api as any).production_proposals.createProposalCostItem, {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
        costCents: 13_000_001,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Over-allocated package",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Maintained cost items exceed");

    await t.mutation((api as any).production_proposals.deleteProposalCostItem, {
      itemId: maintainedItemId,
      proposalId,
      workosOrganizationId: ORG,
    });
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(20_000_000);
    expect(detail.costItems).toHaveLength(2);
  });

  test("rejects budget writes to superseded submilestones and skips stale coverage validation", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Superseded cost target build",
      location: "24 Superseded Target Lane",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const maintainedItemId = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Maintained forms package",
        workosOrganizationId: ORG,
      },
    );
    const additiveItemId = await admin.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 2_000_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Additive forms package",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .filter((query: any) => query.eq(query.field("key"), "forms"))
        .unique();
      await ctx.db.patch(maintainedItemId, {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
      });
      await ctx.db.patch(additiveItemId, {
        budgetSubmilestoneKey: "forms",
      });
      await ctx.db.patch(submilestone._id, {
        budgetCents: 0,
        planningState: "superseded",
        supersededAt: Date.now(),
      });
    });

    await admin.mutation(
      (api as any).production_proposals.updateActiveBuildCostItem,
      {
        buildId: closing.buildId,
        itemId: maintainedItemId,
        reason: "Rename the retained cost evidence.",
        title: "Maintained forms package (retained)",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation(
        (api as any).production_proposals.updateActiveBuildCostItem,
        {
          buildId: closing.buildId,
          costCents: 3_000_000,
          itemId: additiveItemId,
          reason: "Attempt to add budget to a removed target.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/removed by an approved planning revision/i);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: maintainedItemId,
          title: "Maintained forms package (retained)",
        }),
        expect.objectContaining({
          _id: additiveItemId,
          costCents: 2_000_000,
        }),
      ]),
    );
  });

  test("enforces proposal-scoped builder staff material permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_material",
    });
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Staff permission proposal",
        location: "12 Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 20_000_000,
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 10_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          material: { canCreate: true, canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_staff_material",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_material");
    await expect(
      staff.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          name: "Blocked rename",
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: builder staff milestone.update");

    await staff.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 1_500_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: [],
        title: "Concrete package",
        workosOrganizationId: ORG,
      },
    );
    const detail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(1);
    expect(detail.milestones).toHaveLength(0);
    expect(detail.appPermissions.role).toBe("staff");
  });

  test("provisions unknown proposal builder staff emails before assigning app permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Staff invite proposal",
        location: "14 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    const result = await admin.action(
      (api as any).production_proposals
        .provisionProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "Frame.Team@Example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      provisioning: {
        adapter: "fake",
        membershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
        operation: "provisionBuilderStaffUser",
        status: "accepted",
        sync: "waiting-for-webhook",
        userId: "fake_user_builder_staff_frame_team_example_com",
      },
      staffWorkosUserId: "fake_user_builder_staff_frame_team_example_com",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId ===
        "fake_user_builder_staff_frame_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "frame.team@example.com",
      identityStatus: "pending",
      role: "staff",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "milestone",
      ),
    ).toMatchObject({ canView: true });

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "fake_user_builder_staff_frame_team_example_com",
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Staff invite proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    await admin.run(async (ctx: any) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(user).toBeNull();
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .filter((q: any) => q.eq(q.field("workosOrganizationId"), ORG))
        .first();
      expect(membership).toBeNull();
      const link = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(link).toMatchObject({
        assignedEmail: "frame.team@example.com",
        role: "staff",
        status: "active",
        workosMembershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
      });
    });
  });

  test("keeps provisioned existing org members visible while WorkOS role sync is pending", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Existing member staff proposal",
        location: "16 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_existing_org_staff",
        createdAt: now - 1_000,
        email: "existing.staff@example.com",
        name: "Existing Staff",
        sourceEventId: "test_existing_staff_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now - 1_000,
        workosUserId: "user_existing_org_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now - 1_000,
        directoryManaged: false,
        roleSlug: "member",
        roleSlugs: ["member"],
        sourceEventId: "test_existing_staff_membership",
        sourceEventType: "organization_membership.updated",
        status: "active",
        updatedAt: now - 1_000,
        workosMembershipId: "om_existing_org_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_existing_org_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "existing.staff@example.com",
        staffWorkosUserId: "user_existing_org_staff",
        workosMembershipId: "om_existing_org_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(directory.staff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "existing.staff@example.com",
          identityStatus: "pending",
          role: "staff",
          workosMembershipId: "om_existing_org_staff",
          workosUserId: "user_existing_org_staff",
        }),
      ]),
    );

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "user_existing_org_staff",
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Existing member staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    const detail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.appPermissions.role).toBe("staff");
    expect(detail.milestones).toHaveLength(0);
  });

  test("keeps invited builder staff visible while their WorkOS membership is pending", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Pending invited staff proposal",
        location: "17 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_pending_invited_staff",
        createdAt: now - 1_000,
        email: "pending.invited@example.com",
        name: "Pending Invited",
        sourceEventId: "test_pending_invited_staff_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now - 1_000,
        workosUserId: "user_pending_invited_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now - 1_000,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_pending_invited_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "pending",
        updatedAt: now - 1_000,
        workosMembershipId: "om_pending_invited_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_pending_invited_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "pending.invited@example.com",
        staffWorkosUserId: "user_pending_invited_staff",
        workosMembershipId: "om_pending_invited_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(directory.staff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "pending.invited@example.com",
          identityStatus: "pending",
          role: "staff",
          workosMembershipId: "om_pending_invited_staff",
          workosUserId: "user_pending_invited_staff",
        }),
      ]),
    );
  });

  test("resolves pending email-only builder staff assignments after onboarding without duplicates", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const staffEmail = "pending.invited@example.com";
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Email pending staff proposal",
        location: "20 Pending Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);
    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId: "pending_builder_staff_pending_invited_example_com",
        workosMembershipId: "pending_invitation_inv_pending_first",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId:
          "pending_builder_staff_pending_invited_example_com_second",
        workosMembershipId: "pending_invitation_inv_pending_second",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      internal.production_proposals.finalizeActiveBuildBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        buildId,
        permissions: appPermissionGrants({
          draw: { canView: true },
        }),
        staffEmail,
        staffWorkosUserId:
          "pending_builder_staff_pending_invited_example_com_third",
        workosMembershipId: "pending_invitation_inv_pending_third",
        workosOrganizationId: ORG,
      },
    );

    const directoryBeforeOnboarding = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const pendingStaffRows = directoryBeforeOnboarding.staff.filter(
      (member: any) => member.email === staffEmail && member.role === "staff",
    );
    expect(pendingStaffRows).toHaveLength(1);
    expect(pendingStaffRows[0]).toMatchObject({
      email: staffEmail,
      identityStatus: "pending",
      role: "staff",
      workosUserId: "pending_builder_staff_pending_invited_example_com",
    });

    await admin.run(async (ctx: any) => {
      const links = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder", (q: any) =>
          q.eq("builderProfileId", seed.builderProfileId),
        )
        .collect();
      expect(
        links.filter(
          (link: any) =>
            link.role === "staff" &&
            link.status === "active" &&
            link.assignedEmail === staffEmail,
        ),
      ).toHaveLength(1);

      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_onboarded_pending_staff",
        createdAt: now,
        email: staffEmail,
        name: "Pending Invited",
        sourceEventId: "test_onboarded_pending_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_onboarded_pending_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_onboarded_pending_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_onboarded_pending_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_onboarded_pending_staff",
      });
    });

    const staff = withIdentityEmail(
      base,
      ["builder-staff"],
      "user_onboarded_pending_staff",
      staffEmail,
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Email pending staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);
    expect(workspace.activeBuildRows).toEqual([
      expect.objectContaining({
        buildKey: String(buildId),
        kind: "activeBuild",
      }),
    ]);

    const proposalDetail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(proposalDetail.appPermissions.role).toBe("staff");

    const buildDetail = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(buildId), workosOrganizationId: ORG },
    );
    expect(buildDetail.appPermissions.role).toBe("staff");

    const directoryAfterOnboarding = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directoryAfterOnboarding.staff.filter(
        (member: any) => member.email === staffEmail && member.role === "staff",
      ),
    ).toHaveLength(1);
  });

  test("re-provisioning an existing staff email preserves current app permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_resend_staff",
    });
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Resend staff proposal",
        location: "18 Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_resend_staff",
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({}),
        proposalId,
        staffEmail: "user_resend_staff@example.com",
        staffWorkosUserId: "user_resend_staff",
        workosMembershipId: "test_membership_user_resend_staff",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_resend_staff");
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Resend staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const resendStaff = directory.staff.find(
      (member: any) => member.workosUserId === "user_resend_staff",
    );
    expect(
      resendStaff.permissions.find(
        (permission: any) => permission.resourceType === "milestone",
      ),
    ).toMatchObject({ canView: true });
  });

  test("hides WorkOS-deleted proposal builder staff links and denies access", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted staff proposal",
        location: "19 Archive Street",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_deleted_staff",
        createdAt: now,
        deletedAt: now,
        email: "deleted.staff@example.com",
        name: "Deleted Staff",
        sourceEventId: "test_deleted_staff",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now,
        workosUserId: "user_deleted_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_deleted_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_deleted_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_deleted_staff",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_deleted_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directory.staff.some(
        (member: any) => member.workosUserId === "user_deleted_staff",
      ),
    ).toBe(false);

    const deletedStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_deleted_staff",
    );
    await expect(
      deletedStaff.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: builder account is not active in WorkOS");
  });

  test("re-provisioning a deleted staff email rebinds the link to the active WorkOS user", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const staffEmail = "rebound.staff@example.com";
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Rebound staff proposal",
        location: "21 Staff Rebind Road",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_deleted_rebound_staff",
        createdAt: now - 5_000,
        deletedAt: now - 4_000,
        email: staffEmail,
        name: "Deleted Rebound",
        sourceEventId: "test_deleted_rebound_staff",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now - 4_000,
        workosUserId: "user_deleted_rebound_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId: "user_deleted_rebound_staff",
        workosMembershipId: "om_deleted_rebound_staff",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_active_rebound_staff",
        createdAt: now,
        email: staffEmail,
        name: "Active Rebound",
        sourceEventId: "test_active_rebound_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_active_rebound_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_active_rebound_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "pending",
        updatedAt: now,
        workosMembershipId: "om_active_rebound_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_active_rebound_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({}),
        proposalId,
        staffEmail,
        staffWorkosUserId: "user_active_rebound_staff",
        workosMembershipId: "om_active_rebound_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const reboundStaff = directory.staff.find(
      (member: any) => member.email === staffEmail,
    );
    expect(reboundStaff).toMatchObject({
      identityStatus: "pending",
      role: "staff",
      workosMembershipId: "om_active_rebound_staff",
      workosUserId: "user_active_rebound_staff",
    });

    const staff = withIdentityEmail(
      base,
      ["builder-staff"],
      "user_active_rebound_staff",
      staffEmail,
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Rebound staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);
  });

  test("hides builder staff links when their WorkOS membership is deleted", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted membership proposal",
        location: "21 Archive Street",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_membership_deleted_staff",
        createdAt: now,
        email: "membership.deleted@example.com",
        name: "Membership Deleted",
        sourceEventId: "test_membership_deleted_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_membership_deleted_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        deletedAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_membership_deleted",
        sourceEventType: "organization_membership.deleted",
        status: "deleted",
        updatedAt: now,
        workosMembershipId: "om_membership_deleted_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_membership_deleted_staff",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_membership_deleted_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directory.staff.some(
        (member: any) =>
          member.workosUserId === "user_membership_deleted_staff",
      ),
    ).toBe(false);
  });

  test("enforces active-build scoped builder staff draw permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_draw",
    });
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, buildId);
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canUpdate: true, canView: true },
        }),
        staffWorkosUserId: "user_staff_draw",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_draw");
    await expect(
      staff.mutation(
        (api as any).production_proposals.createActiveBuildCostItem,
        {
          buildId,
          costCents: 250_000,
          itemType: "material",
          milestoneKey: "foundation",
          quantity: 1,
          relevantSubmilestoneKeys: [],
          title: "Blocked material",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: builder staff material.create");

    await staff.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 1_000_000,
        buildId,
        drawKey: "draw-01",
        note: "Ready for reimbursement.",
        workosOrganizationId: ORG,
      },
    );
    const detail = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      status: "requested",
    });
    expect(detail.draws[0]).toMatchObject({
      note: "Ready for reimbursement.",
      requestNote: "Ready for reimbursement.",
    });
    expect(detail.draws[0]).not.toHaveProperty("requestReviewNote");
    expect(detail.costItems).toHaveLength(0);
    expect(detail.appPermissions.role).toBe("staff");
  });

  test("redacts lender draw notes from builder projections while retaining lender visibility", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Draw note projection boundary build",
      location: "31 Draw Note Boundary Lane",
    });
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 1_000_000,
        buildId: closing.buildId,
        clientOperationId: "draw-note-boundary-001",
        drawKey: "draw-01",
        note: "Builder reimbursement note.",
        workosOrganizationId: ORG,
      },
    );

    const builderDetail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const builderTimeline = await builder.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const builderDetailDraw = builderDetail.draws.find(
      (draw: any) => draw.drawKey === receipt.requestKey,
    );
    const builderTimelineDraw = builderTimeline.draws.find(
      (draw: any) => draw.drawKey === receipt.requestKey,
    );
    expect(builderDetailDraw).toBeDefined();
    expect(builderTimelineDraw).toBeDefined();
    expect(builderDetailDraw).toMatchObject({
      note: "Builder reimbursement note.",
      requestNote: "Builder reimbursement note.",
    });
    expect(builderDetailDraw).not.toHaveProperty("requestReviewNote");
    expect(builderTimelineDraw).toMatchObject({
      requestNote: "Builder reimbursement note.",
    });
    expect(builderTimelineDraw).not.toHaveProperty("requestReviewNote");

    await broker.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations review started.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.rejectActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Lender review requires another supporting invoice.",
        workosOrganizationId: ORG,
      },
    );

    const lenderDetail = await broker.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const lenderTimeline = await broker.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(
      lenderDetail.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({
      requestNote: "Builder reimbursement note.",
      requestReviewNote: "Lender review requires another supporting invoice.",
    });
    expect(
      lenderTimeline.draws.find(
        (draw: any) => draw.drawKey === receipt.requestKey,
      ),
    ).toMatchObject({
      requestNote: "Builder reimbursement note.",
      requestReviewNote: "Lender review requires another supporting invoice.",
    });

    const builderDetailAfterRejection = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const builderTimelineAfterRejection = await builder.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const builderDetailDrawAfterRejection =
      builderDetailAfterRejection.draws.find(
        (draw: any) => draw.drawKey === receipt.requestKey,
      );
    const builderTimelineDrawAfterRejection =
      builderTimelineAfterRejection.draws.find(
        (draw: any) => draw.drawKey === receipt.requestKey,
      );
    expect(builderDetailDrawAfterRejection).toBeDefined();
    expect(builderTimelineDrawAfterRejection).toBeDefined();
    expect(builderDetailDrawAfterRejection).toMatchObject({
      note: "Builder reimbursement note.",
      requestNote: "Builder reimbursement note.",
    });
    expect(builderDetailDrawAfterRejection).not.toHaveProperty(
      "requestReviewNote",
    );
    expect(builderTimelineDrawAfterRejection).toMatchObject({
      requestNote: "Builder reimbursement note.",
    });
    expect(builderTimelineDrawAfterRejection).not.toHaveProperty(
      "requestReviewNote",
    );
  });

  test("provisions unknown active-build builder staff emails before assigning app permissions", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    const result = await admin.action(
      (api as any).production_proposals
        .provisionActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canUpdate: true, canView: true },
        }),
        staffEmail: "Draw.Team@Example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      provisioning: {
        adapter: "fake",
        membershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_draw_team_example_com",
        operation: "provisionBuilderStaffUser",
        status: "accepted",
        sync: "waiting-for-webhook",
        userId: "fake_user_builder_staff_draw_team_example_com",
      },
      staffWorkosUserId: "fake_user_builder_staff_draw_team_example_com",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_draw_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listActiveBuildBuilderStaffPermissions,
      { buildId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId === "fake_user_builder_staff_draw_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "draw.team@example.com",
      identityStatus: "pending",
      role: "staff",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "draw",
      ),
    ).toMatchObject({ canUpdate: true, canView: true });
  });

  test("lists only explicitly assigned builder-staff proposal and active-build rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_workspace",
    });
    const assignedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned staff proposal",
        location: "31 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const blockedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Blocked staff proposal",
        location: "33 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: assignedProposalId,
        staffWorkosUserId: "user_staff_workspace",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canView: true },
        }),
        staffWorkosUserId: "user_staff_workspace",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_workspace");
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );

    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Assigned staff proposal",
        kind: "proposal",
        proposalId: String(assignedProposalId),
      }),
    ]);
    expect(workspace.activeBuildRows).toEqual([
      expect.objectContaining({
        buildKey: String(buildId),
        kind: "activeBuild",
      }),
    ]);

    await expect(
      staff.query((api as any).production_proposals.getProposalDetail, {
        proposalId: blockedProposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: builder staff view");

    const ownerWithStaffRole = withIdentity(
      base,
      ["builder-staff"],
      "user_builder",
    );
    const ownerWorkspace = await ownerWithStaffRole.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(ownerWorkspace.proposalRows).toHaveLength(0);
    expect(ownerWorkspace.activeBuildRows).toHaveLength(0);
  });

  test("admin can inspect the builder-staff workspace without explicit staff grants", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Admin visible staff proposal",
        location: "37 Staff Admin Route",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    const workspace = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );

    expect(workspace.proposalRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildName: "Admin visible staff proposal",
          kind: "proposal",
          proposalId: String(proposalId),
        }),
      ]),
    );
    expect(workspace.activeBuildRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildKey: String(buildId),
          kind: "activeBuild",
        }),
      ]),
    );
  });

  test("excludes WorkOS-invalid builder staff workspace rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const deletedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted workspace staff proposal",
        location: "41 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const wrongRoleProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Wrong role workspace staff proposal",
        location: "43 Staff Route",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_workspace_deleted",
        createdAt: now,
        deletedAt: now,
        email: "workspace.deleted@example.com",
        name: "Workspace Deleted",
        sourceEventId: "test_workspace_deleted",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now,
        workosUserId: "user_workspace_deleted",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_workspace_deleted_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_workspace_deleted",
        workosOrganizationId: ORG,
        workosUserId: "user_workspace_deleted",
      });
      await ctx.db.insert("users", {
        authId: "user_workspace_wrong_role",
        createdAt: now,
        email: "workspace.wrong-role@example.com",
        name: "Workspace Wrong Role",
        sourceEventId: "test_workspace_wrong_role",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_workspace_wrong_role",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "member",
        roleSlugs: ["member"],
        sourceEventId: "test_workspace_wrong_role_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_workspace_wrong_role",
        workosOrganizationId: ORG,
        workosUserId: "user_workspace_wrong_role",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: deletedProposalId,
        staffWorkosUserId: "user_workspace_deleted",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: wrongRoleProposalId,
        staffWorkosUserId: "user_workspace_wrong_role",
        workosOrganizationId: ORG,
      },
    );

    const deletedStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_workspace_deleted",
    );
    const deletedWorkspace = await deletedStaff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(deletedWorkspace.proposalRows).toHaveLength(0);
    expect(deletedWorkspace.activeBuildRows).toHaveLength(0);

    const wrongRoleStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_workspace_wrong_role",
    );
    const wrongRoleWorkspace = await wrongRoleStaff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(wrongRoleWorkspace.proposalRows).toHaveLength(0);
    expect(wrongRoleWorkspace.activeBuildRows).toHaveLength(0);
  });

  test("persists sub-milestone starts and expands milestone duration to cover them", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Submilestone schedule proposal",
        location: "88 Schedule Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 10,
            dayStart: 3,
            dependencyKeys: [],
            durationDays: 7,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 5,
                key: "forms",
                name: "Forms and pour",
                order: 1,
                startDay: 8,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 20_000_000,
      dayEnd: 13,
      dayStart: 8,
      durationDays: 5,
      key: "foundation",
    });
    expect(detail.submilestones[0]).toMatchObject({
      durationDays: 5,
      key: "forms",
      startDay: 8,
    });
  });

  test("saves draft package contractor assignments and material planning rows", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Step 2 planning proposal",
        location: "44 Milestone Budget Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        contractorAssignments: [
          {
            contractorName: "Apex Concrete Works",
            estimatedCostCents: 3_000_000,
            estimatedHours: 24,
            milestoneKey: "foundation",
            role: "Foundation contractor",
            submilestoneKeys: ["forms"],
          },
        ],
        costItems: [
          {
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 7_500_000,
            description:
              '<p>Concrete and rebar package.</p><img src="data:image/png;base64,abc" alt="site detail" />',
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 2,
            relevantSubmilestoneKeys: ["forms"],
            supplier: "Apex Supply",
            title: "Foundation material package",
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toEqual([
      expect.objectContaining({
        costCents: 7_500_000,
        description: expect.stringContaining("<img"),
        itemType: "material",
        milestoneKey: "foundation",
        quantity: 2,
        relevantSubmilestoneKeys: ["forms"],
        supplier: "Apex Supply",
        title: "Foundation material package",
      }),
    ]);
    expect(detail.proposal.totalBudgetCents).toBe(35_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 35_000_000,
      drawAvailabilityCents: 28_000_000,
    });
    expect(detail.submilestones[0]).toMatchObject({
      budgetCents: 35_000_000,
      key: "forms",
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 28_000_000 });

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.contractorPlanning).toBeUndefined();

    await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "scenario.contractor@example.com",
        kind: "company",
        name: "Seed Scenario Contractor LLC",
        trades: ["foundation", "framing"],
        workosOrganizationId: ORG,
      },
    );

    const contractorPlanning = await t.query(
      (api as any).production_proposals.getProposalContractorPlanning,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(contractorPlanning.availableContractors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "scenario.contractor@example.com",
          name: "Seed Scenario Contractor LLC",
          onboardingStatus: "profile_only",
        }),
      ]),
    );
    expect(contractorPlanning.proposalContractors).toEqual([
      expect.objectContaining({
        name: "Apex Concrete Works",
        role: "Foundation contractor",
        status: "active",
      }),
    ]);
    expect(contractorPlanning.milestoneAssignments).toEqual([
      expect.objectContaining({
        contractorName: "Apex Concrete Works",
        estimatedCostCents: 3_000_000,
        estimatedHours: 24,
        milestoneKey: "foundation",
        role: "Foundation contractor",
        status: "planned",
        submilestoneKey: "forms",
        submilestoneName: "Forms and pour",
      }),
    ]);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.cost_items.saved",
        "proposal.contractor.milestone_assignments_saved",
      ]),
    );
  });

  test("does not attach an existing contractor when the atomic proposal invite cannot be created", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Atomic contractor invite proposal",
        location: "12 Lifecycle Lane",
        workosOrganizationId: ORG,
      },
    );
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        name: "No Email Foundation Crew",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.attachAndInviteProposalContractor,
        {
          contractorId,
          proposalId,
          role: "Foundation",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/no email/i);

    const persisted = await admin.run(async (ctx: any) => ({
      assignment: await ctx.db
        .query("proposalContractorAssignments")
        .withIndex("by_proposal_contractor", (q: any) =>
          q.eq("proposalId", proposalId).eq("contractorId", contractorId),
        )
        .unique(),
      claims: await ctx.db
        .query("contractorInviteClaims")
        .withIndex("by_contractor_state", (q: any) =>
          q.eq("contractorId", contractorId).eq("state", "invited"),
        )
        .collect(),
    }));
    expect(persisted).toEqual({ assignment: null, claims: [] });
  });

  test("persists an unassigned broker draft after the setup workflow", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      {
        buildName: "Broker setup workflow proposal",
        location: "77 Workflow Way",
        workosOrganizationId: ORG,
      },
    );
    const assignedDraftId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned builder draft",
        location: "88 Assigned Lane",
        workosOrganizationId: ORG,
      },
    );

    const detail = await broker.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      buildName: "Broker setup workflow proposal",
      location: "77 Workflow Way",
      status: "draft",
    });
    expect(detail.proposal.builderProfileId).toBeUndefined();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.created",
    );

    const unassignedDrafts = await broker.query(
      (api as any).production_proposals.listUnassignedDraftProposals,
      { workosOrganizationId: ORG },
    );
    expect(
      unassignedDrafts.drafts.map((proposal: any) => proposal.proposalId),
    ).toContain(proposalId);
    expect(
      unassignedDrafts.drafts.map((proposal: any) => proposal.proposalId),
    ).not.toContain(assignedDraftId);
    expect(unassignedDrafts.drafts[0]).toMatchObject({
      builder: "Unassigned builder",
      column: "draft",
      name: "Broker setup workflow proposal",
    });

    const dashboard = await admin.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.proposals.find(
        (proposal: any) => proposal.proposalId === proposalId,
      ),
    ).toMatchObject({
      builder: "Unassigned builder",
      column: "draft",
      name: "Broker setup workflow proposal",
    });
  });

  test("enforces proposal ownership, state, reason, and permit waiver rules", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Waiver proposal",
        location: "456 Waiver Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 1_500,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        lenderDrawPolicyLimitCents: 30_000_000,
        milestones: [
          {
            budgetCents: 20_000_000,
            dayEnd: 15,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 15,
            key: "mobilization",
            name: "Mobilization",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    await expect(
      t.mutation((api as any).production_proposals.approveProposal, {
        proposalId,
        reason: "No waiver.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/permit waiver/);

    await t.mutation((api as any).production_proposals.requestChanges, {
      proposalId,
      reason: "Add permit or waiver.",
      workosOrganizationId: ORG,
    });
    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("draft");

    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit issued after closing by municipal process.",
      proposalId,
      reason: "Policy exception approved.",
      workosOrganizationId: ORG,
    });

    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.permitWaiver).toMatchObject({
      reason: "Permit issued after closing by municipal process.",
    });

    await expect(
      asIdentity(["builder"], "user_other_builder").query(
        (api as any).production_proposals.getProposalDetail,
        { proposalId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  test("saves draft proposal identity and package fields explicitly", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Original proposal",
        location: "Original location",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_500,
        borrowerWorkingCapitalLimitCents: 45_000_000,
        buildName: "Updated proposal",
        lenderDrawPolicyLimitCents: 60_000_000,
        location: "Updated location",
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "sitework",
            name: "Sitework",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      borrowerCoPayBps: 2_500,
      borrowerWorkingCapitalLimitCents: 45_000_000,
      buildName: "Updated proposal",
      lenderDrawPolicyLimitCents: 60_000_000,
      location: "Updated location",
      totalBudgetCents: 40_000_000,
    });
  });

  test("persists a backdated proposed start date without creating implicit dependencies", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Backdated proposal",
        location: "11 Parallel Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 90_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 35_000_000,
            dayEnd: 35,
            dayStart: 5,
            dependencyKeys: [],
            durationDays: 30,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        proposedStartDate: "2025-04-15",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.proposedStartDate).toBe("2025-04-15");
    expect(
      detail.milestones
        .sort((left: any, right: any) => left.order - right.order)
        .map((milestone: any) => ({
          dependencyKeys: milestone.dependencyKeys,
          key: milestone.key,
        })),
    ).toEqual([
      { dependencyKeys: [], key: "foundation" },
      { dependencyKeys: [], key: "framing" },
    ]);

    const byString = await t.query(
      (api as any).production_proposals.getProposalDetailByString,
      { proposalId: String(proposalId), workosOrganizationId: ORG },
    );
    expect(byString.proposal.proposedStartDate).toBe("2025-04-15");
    expect(byString.auditEvents).toBeUndefined();
    expect(byString.buildMilestones).toBeUndefined();
    expect(byString.buildSubmilestones).toBeUndefined();
    expect(byString.events).toBeUndefined();

    await submitProposalForTest(t, proposalId);
    await t.mutation(
      (api as any).production_proposals
        .updateProductionProposalProposedStartDate,
      {
        proposalId,
        proposedStartDate: "2025-03-10",
        workosOrganizationId: ORG,
      },
    );
    const updatedSubmitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(updatedSubmitted.proposal.proposedStartDate).toBe("2025-03-10");

    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit packet approved offline.",
      proposalId,
      reason: "Schedule reviewed.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2025-05-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 90_000_000,
        },
        proposalId,
        reason: "Loan closed with updated start date.",
        workosOrganizationId: ORG,
    });
    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.proposal.proposedStartDate).toBe("2025-03-10");
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.activeBuild?.startDate).toBe("2025-05-01");
  });

  test("generates Convex storage upload URLs and returns document storage URLs in proposal detail", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Storage proposal",
        location: "222 Storage Street",
        workosOrganizationId: ORG,
      },
    );

    const uploadUrl = await t.mutation(
      (api as any).production_proposals.generateProposalDocumentUploadUrl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(uploadUrl).toContain("http");

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 1_000,
        borrowerWorkingCapitalLimitCents: 12_000_000,
        documents: [
          {
            documentType: "supporting",
            fileName: "scope.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 20_000_000,
        milestones: [
          {
            budgetCents: 10_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "scope",
            name: "Scope",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    const submittedUploadUrl = await t.mutation(
      (api as any).production_proposals.generateProposalDocumentUploadUrl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submittedUploadUrl).toContain("http");
    await t.mutation((api as any).production_proposals.addProposalDocument, {
      documentType: "permit",
      fileName: "issued-permit.pdf",
      mimeType: "application/pdf",
      proposalId,
      sizeBytes: 1024,
      workosOrganizationId: ORG,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      detail.documents.find(
        (document: any) => document.fileName === "scope.pdf",
      ),
    ).toMatchObject({
      fileName: "scope.pdf",
      storageUrl: null,
    });
    expect(
      detail.documents.find(
        (document: any) => document.fileName === "issued-permit.pdf",
      ),
    ).toMatchObject({
      documentType: "permit",
      fileName: "issued-permit.pdf",
      storageUrl: null,
    });
  });

  test("allows audited backoffice draw schedule edits after submission without returning to draft", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Draw schedule proposal",
        location: "321 Draw Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
          },
        ],
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    await expect(
      withIdentity(base, ["builder"], "user_builder").mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          amountCents: 35_000_000,
          drawKey: "draw-01",
          proposalId,
          reason: "Builder tries to edit after submission.",
          timingDay: 28,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    await t.mutation(
      (api as any).production_proposals.updateSubmittedProposalDrawScheduleRow,
      {
        amountCents: 35_000_000,
        drawKey: "draw-01",
        label: "Foundation verified reimbursement",
        proposalId,
        reason: "Adjusted after lender review.",
        timingDay: 28,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("submitted");
    expect(detail.draws[0]).toMatchObject({
      amountCents: 35_000_000,
      label: "Foundation verified reimbursement",
      timingDay: 28,
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.draw_schedule.updated",
    );

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Adjusted draw schedule approved.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-15",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 40_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
    });
    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.plannedDraws[0]).toMatchObject({
      amountCents: 35_000_000,
      timingDay: 28,
    });
  });

  test("materializes exactly four kanban columns and supports contractor profiles without account links", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "contractor@example.com",
        name: "Unlinked Contractor LLC",
        trades: ["framing"],
        workosOrganizationId: ORG,
      },
    );
    const contractor = await t.run(async (ctx: any) =>
      ctx.db.get(ctx.db.normalizeId("contractorProfiles", contractorId)!),
    );
    expect(contractor?.accountWorkosUserId).toBeUndefined();
    expect(contractor).toMatchObject({ name: "Unlinked Contractor LLC" });

    const kanban = await t.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(kanban.columns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
  });

  test("seeds production proposal settings for templates, archetypes, scenarios, and workflow rules", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );

    expect(settings.archetypes.map((row: any) => row.key).sort()).toEqual([
      "foundation",
      "interior-finish",
      "shell",
    ]);
    expect(settings.templates).toHaveLength(1);
    expect(settings.templates[0].milestones.map((row: any) => row.key)).toEqual(
      ["foundation", "shell-dry-in", "interior-finish"],
    );
    expect(settings.templates[0].milestones[0].submilestones).toHaveLength(2);
    expect(
      settings.templates[0].scenarios.map((row: any) => row.scenarioKey).sort(),
    ).toEqual(["capital-constrained", "cheapest-feasible", "fastest"]);
    expect(settings.workflowRules[0]).toMatchObject({
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true,
      settings: {
        interestStartsOn: "funds_released",
        reimbursementOnly: true,
      },
    });
  });

  test("returns provisioning state for backoffice orgs before brokerage profile creation", async () => {
    const t = asIdentity(["admin"], "user_admin");
    const now = Date.now();
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        createdAt: now,
        domains: [],
        name: "Unprovisioned Brokerage",
        sourceEventId: "seed_unprovisioned_org",
        sourceEventType: "test.production_foundation",
        status: "active",
        updatedAt: now,
        workosOrganizationId: ORG,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_unprovisioned_membership",
        sourceEventType: "test.production_foundation",
        status: "active",
        updatedAt: now,
        workosMembershipId: "seed_unprovisioned_membership",
        workosOrganizationId: ORG,
        workosUserId: "user_admin",
      });
    });

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(settings).toMatchObject({
      archetypes: [],
      brokerage: null,
      provisioningRequired: true,
      templates: [],
      workflowRules: [],
    });

    const kanban = await t.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(kanban.provisioningRequired).toBe(true);
    expect(kanban.columns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
    expect(kanban.columns.flatMap((column: any) => column.cards)).toEqual([]);
  });

  test("builder resolves proposal creation context without admin-only seed writes", async () => {
    const { base, seed } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");

    const context = await builder.query(
      (api as any).production_proposals.getBuilderProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context).toMatchObject({
      brokerage: { _id: seed.brokerageId },
      builderProfile: { _id: seed.builderProfileId },
      defaultAssignedBrokerWorkosUserId: "user_admin",
    });
    expect(context.brokers).toEqual([
      expect.objectContaining({
        isPrincipal: true,
        workosUserId: "user_admin",
      }),
      expect.objectContaining({
        isPrincipal: false,
        workosUserId: "user_broker",
      }),
    ]);
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);

    const proposalId = await builder.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        assignedBrokerWorkosUserId: "user_broker",
        brokerageId: context.brokerage._id,
        builderProfileId: context.builderProfile._id,
        buildName: "Builder-created production proposal",
        location: "44 Builder Lane",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      buildName: "Builder-created production proposal",
    });
    expect(detail.proposal.assignedBrokerWorkosUserId).toBeUndefined();
    expect(detail.proposal.createdByWorkosUserId).toBeUndefined();
  });

  test("builder proposal creation context includes seeded Garden Suite template", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    const admin = withIdentity(base, ["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    const context = await builder.query(
      (api as any).production_proposals.getBuilderProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    const gardenSuite = context.templates.find(
      (template: any) => template.templateKey === "garden-suite",
    );

    expect(gardenSuite).toMatchObject({
      summary:
        "16 milestones, 65 budget line items, 100.00% PoC, 141 field days",
      title: "Garden Suite",
    });
    expect(gardenSuite.milestones).toHaveLength(16);
    expect(gardenSuite.milestones[0].submilestones).toHaveLength(8);
    expect(gardenSuite.milestones.at(-1).submilestones).toEqual([
      expect.objectContaining({
        name: "Supervision, PM, temp services, dumpsters, scaffold, final clean",
      }),
    ]);
  });

  test("broker resolves proposal setup context without selecting a builder", async () => {
    const { base, seed } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context).toMatchObject({
      brokerage: { _id: seed.brokerageId },
      defaultAssignedBrokerWorkosUserId: "user_admin",
    });
    expect(context.brokers[0]).toMatchObject({
      isPrincipal: true,
      workosUserId: "user_admin",
    });
    expect(context.builderProfile).toBeUndefined();
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);
  });

  test("broker proposal setup falls back when the configured principal membership is inactive", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    await base.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) => q.eq("workosUserId", "user_admin"))
        .collect();
      const principalMembership = memberships.find(
        (membership: any) => membership.workosOrganizationId === ORG,
      );
      if (!principalMembership) {
        throw new Error("Missing seeded principal broker membership.");
      }
      await ctx.db.patch(principalMembership._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    const broker = withIdentity(base, ["broker"], "user_broker");

    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context.defaultAssignedBrokerWorkosUserId).toBe("user_broker");
    expect(context.brokers).toEqual([
      expect.objectContaining({
        isPrincipal: false,
        workosUserId: "user_broker",
      }),
    ]);

    await expect(
      broker.mutation(
        (api as any).production_proposals.createBrokerDraftProposal,
        {
          assignedBrokerWorkosUserId: "user_admin",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/active broker member/i);

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      {
        assignedBrokerWorkosUserId: context.defaultAssignedBrokerWorkosUserId,
        buildName: "Fallback broker build",
        location: "22 Membership Recovery Road",
        workosOrganizationId: ORG,
      },
    );
    const proposal = await broker.run((ctx: any) => ctx.db.get(proposalId));
    expect(proposal).toMatchObject({
      assignedBrokerWorkosUserId: "user_broker",
      buildName: "Fallback broker build",
    });
  });

  test("preserves the WorkOS organization name when seeding production defaults", async () => {
    const t = asIdentity(["admin"], "user_admin");
    const sourceEventId = "evt_test_organization";
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "TestOrganization",
        sourceEventId,
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: ORG,
      });
    });

    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );

    const organization = await t.run(async (ctx: any) =>
      ctx.db
        .query("workosOrganizations")
        .withIndex("by_workos_organization_id", (q: any) =>
          q.eq("workosOrganizationId", ORG),
        )
        .unique(),
    );
    expect(organization).toMatchObject({
      name: "TestOrganization",
      sourceEventId,
      sourceEventType: "organization.created",
      status: "active",
    });
  });

  test("backfills the complete template catalogue for a legacy brokerage create context", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");

    const legacyContext = await admin.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    expect(
      legacyContext.templates.map((template: any) => template.templateKey),
    ).toEqual(["single-family-full-build"]);

    const result = await admin.mutation(
      (api as any).production_proposals.backfillProductionDefaultTemplates,
      { workosOrganizationId: ORG },
    );
    expect(result).toMatchObject({ templates: 5 });

    const broker = withIdentity(base, ["broker"], "user_broker");
    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    expect(
      context.templates.map((template: any) => template.templateKey),
    ).toEqual([
      "single-family-full-build",
      "single-family-renovation",
      "multiplex-build",
      "4-plex",
      "garden-suite",
    ]);
  });

  test("seeds production defaults including the 4-plex template", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const result = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );

    expect(result).toMatchObject({
      milestones: 45,
      scenarios: 6,
      submilestones: 151,
      templates: 5,
    });

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(
      settings.templates.map((template: any) => template.templateKey),
    ).toEqual([
      "single-family-full-build",
      "single-family-renovation",
      "multiplex-build",
      "4-plex",
      "garden-suite",
    ]);

    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    expect(fullBuild.scenarios[0]).toMatchObject({
      description:
        "Standard reimbursement draw timing and reimbursement amount assumptions.",
      draws: expect.arrayContaining([
        expect.objectContaining({
          amountBps: 2000,
          drawKey: "draw-01",
          label: "Draw 01",
          reviewNote: "Foundation complete",
          timingDay: 16,
        }),
      ]),
      isActive: true,
      name: "Standard reimbursement",
      scenarioKey: "standard-reimbursement",
    });
    expect(fullBuild.milestones.map((milestone: any) => milestone.key)).toEqual(
      [
        "site-prep",
        "framing",
        "rough-in",
        "exterior",
        "drywall",
        "finishes",
        "closeout",
      ],
    );
    expect(fullBuild.milestones[0]).toMatchObject({
      durationDays: 14,
      name: "Site prep & foundation",
      percentageBps: 1000,
      submilestones: [
        expect.objectContaining({ name: "Permit mobilization" }),
        expect.objectContaining({ name: "Excavation" }),
        expect.objectContaining({ name: "Concrete forms" }),
        expect.objectContaining({ name: "Foundation pour" }),
      ],
    });
    expect(
      fullBuild.milestones.every(
        (milestone: any) =>
          milestone.siteVisitGuidance?.whatToVerify?.trim().length > 0 &&
          milestone.siteVisitGuidance?.cameraAngles?.trim().length > 0,
      ),
    ).toBe(true);
    expect(
      fullBuild.milestones.map((milestone: any) => milestone.key),
    ).not.toContain("shell-dry-in");

    const fourPlex = settings.templates.find(
      (template: any) => template.templateKey === "4-plex",
    );
    expect(fourPlex).toMatchObject({
      summary:
        "8 milestones, 36 budget line items, 100.00% PoC, 160 field days",
      title: "4-plex",
    });
    expect(fourPlex.milestones.map((milestone: any) => milestone.name)).toEqual(
      [
        "Draw/Milestone 1 - Permits, demo & foundation",
        "Draw/Milestone 2 - Underground, framing & roof",
        "Draw/Milestone 3 - Service upgrade & envelope",
        "Draw/Milestone 4 - MEP rough-ins",
        "Draw/Milestone 5 - Insulation, drywall & stairs",
        "Draw/Milestone 6 - Tile, flooring & trim",
        "Draw/Milestone 7 - Kitchen, appliances, paint & labour",
        "Draw/Milestone 8 - Landscaping, misc, insurance & management",
      ],
    );
    expect(
      fourPlex.milestones.reduce(
        (total: number, milestone: any) => total + milestone.percentageBps,
        0,
      ),
    ).toBe(10_000);
    expect(
      fourPlex.milestones.every((milestone: any) => {
        const subTotal = milestone.submilestones.reduce(
          (total: number, submilestone: any) =>
            total + submilestone.percentageBps,
          0,
        );
        return subTotal === milestone.percentageBps;
      }),
    ).toBe(true);
    expect(
      fourPlex.milestones[0].submilestones.map((row: any) => row.name),
    ).toEqual([
      "DC/ED",
      "PERMITS",
      "DRAWINGS",
      "DEMO EX",
      "TEMP FENCE",
      "TREE PROTECTION",
      "FOUNDATION",
    ]);
    expect(
      fourPlex.milestones[1].submilestones.map((row: any) => row.name),
    ).toEqual([
      "UNDERGROUND PIB",
      "FRAMING",
      "LUMBER",
      "CONCRETE",
      "WATER/SEWER",
      "ROOF FLAT/SHINGLES",
    ]);
    expect(fourPlex.milestones[3].submilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "PLUMBING SUPPLIES",
          percentageBps: 0,
        }),
      ]),
    );
    expect(
      fourPlex.milestones.every(
        (milestone: any) =>
          milestone.siteVisitGuidance?.whatToVerify?.includes("<li>") &&
          milestone.siteVisitGuidance?.cameraAngles?.includes(
            "Required wide angle",
          ),
      ),
    ).toBe(true);
    expect(fourPlex.scenarios[0]).toMatchObject({
      draws: [
        expect.objectContaining({
          amountBps: 1100,
          label: "Draw/Milestone 1",
          timingDay: 23,
        }),
        expect.objectContaining({
          amountBps: 1329,
          label: "Draw/Milestone 2",
          timingDay: 56,
        }),
        expect.objectContaining({
          amountBps: 1118,
          label: "Draw/Milestone 3",
          timingDay: 82,
        }),
        expect.objectContaining({
          amountBps: 1283,
          label: "Draw/Milestone 4",
          timingDay: 111,
        }),
        expect.objectContaining({
          amountBps: 1099,
          label: "Draw/Milestone 5",
          timingDay: 130,
        }),
        expect.objectContaining({
          amountBps: 815,
          label: "Draw/Milestone 6",
          timingDay: 153,
        }),
        expect.objectContaining({
          amountBps: 1283,
          label: "Draw/Milestone 7",
          timingDay: 178,
        }),
        expect.objectContaining({
          amountBps: 1973,
          label: "Draw/Milestone 8",
          timingDay: 197,
        }),
      ],
      isActive: true,
      name: "4-plex",
      scenarioKey: "four-plex-standard",
    });
    expect(
      fourPlex.scenarios[0].draws.reduce(
        (total: number, draw: any) => total + draw.amountBps,
        0,
      ),
    ).toBe(10_000);

    const gardenSuite = settings.templates.find(
      (template: any) => template.templateKey === "garden-suite",
    );
    expect(gardenSuite).toMatchObject({
      summary:
        "16 milestones, 65 budget line items, 100.00% PoC, 141 field days",
      title: "Garden Suite",
    });
    expect(
      gardenSuite.milestones.map((milestone: any) => milestone.name),
    ).toEqual([
      "Soft Costs & Pre-Construction",
      "Site Work & Servicing",
      "Concrete & Foundation",
      "Framing & Structure",
      "Roofing & Exterior Envelope",
      "Windows & Exterior Doors",
      "Mechanical - HVAC & Plumbing",
      "Electrical",
      "Insulation & Drywall",
      "Flooring & Stairs",
      "Interior Doors, Trim & Paint",
      "Kitchen",
      "Bathrooms & Powder Room",
      "Exterior Site Finishes",
      "Laundry & Misc. Equipment",
      "General Conditions",
    ]);
    expect(
      gardenSuite.milestones.reduce(
        (total: number, milestone: any) => total + milestone.percentageBps,
        0,
      ),
    ).toBe(10_000);
    expect(
      gardenSuite.milestones.every((milestone: any) => {
        const subTotal = milestone.submilestones.reduce(
          (total: number, submilestone: any) =>
            total + submilestone.percentageBps,
          0,
        );
        return subTotal === milestone.percentageBps;
      }),
    ).toBe(true);
    expect(
      gardenSuite.milestones[0].submilestones.map((row: any) => row.name),
    ).toEqual([
      "Legal / topographic survey",
      "Architectural & permit drawings",
      "Structural engineering",
      "Arborist report & tree protection plan",
      "Geotechnical / soils investigation",
      "City of Toronto building permit",
      "Builder's risk insurance",
      "Legal & disbursements",
    ]);
    expect(gardenSuite.milestones.at(-1).submilestones).toEqual([
      expect.objectContaining({
        name: "Supervision, PM, temp services, dumpsters, scaffold, final clean",
        percentageBps: 357,
      }),
    ]);
    expect(
      gardenSuite.milestones.flatMap((milestone: any) =>
        milestone.submilestones.map((row: any) => row.name),
      ),
    ).not.toEqual(
      expect.arrayContaining([
        "Project subtotal (pre-contingency)",
        "HST  (D10)",
        "TOTAL INCL. HST",
        "NET ALL-IN (if rebate eligible)",
      ]),
    );
    expect(gardenSuite.scenarios[0]).toMatchObject({
      draws: [
        expect.objectContaining({ amountBps: 2603, timingDay: 48 }),
        expect.objectContaining({ amountBps: 2449, timingDay: 95 }),
        expect.objectContaining({ amountBps: 1955, timingDay: 142 }),
        expect.objectContaining({ amountBps: 2306, timingDay: 192 }),
        expect.objectContaining({ amountBps: 687, timingDay: 218 }),
      ],
      isActive: true,
      scenarioKey: "garden-suite-standard-reimbursement",
    });
    expect(
      gardenSuite.scenarios[0].draws.reduce(
        (total: number, draw: any) => total + draw.amountBps,
        0,
      ),
    ).toBe(10_000);

    const secondResult = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    expect(secondResult).toMatchObject({
      milestones: 45,
      templates: 5,
    });
    const secondSettings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(
      secondSettings.templates.find(
        (template: any) => template.templateKey === "single-family-full-build",
      ).milestones,
    ).toHaveLength(7);
  });

  test("saves production template settings through the timeline settings workspace shape", async () => {
    const { t } = await seeded(["admin"], "user_admin");
    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    const [standardScenario, ...otherScenarios] = fullBuild.scenarios;

    await t.mutation(
      (api as any).production_proposals
        .saveProductionProposalTemplateConfiguration,
      {
        milestones: fullBuild.milestones.map(
          (milestone: any, index: number) => ({
            dependencyKeys: milestone.dependencyKeys,
            durationDays:
              milestone.key === "site-prep" ? 15 : milestone.durationDays,
            icon: milestone.icon,
            included: true,
            milestoneKey: milestone.key,
            name:
              milestone.key === "site-prep"
                ? "Site prep, utilities & foundation"
                : milestone.name,
            order: index,
            percentageBps: milestone.percentageBps,
            siteVisitGuidance: milestone.siteVisitGuidance,
            submilestones: milestone.submilestones.map(
              (submilestone: any, subIndex: number) => ({
                description: submilestone.description,
                durationDays: submilestone.durationDays,
                name: submilestone.name,
                order: subIndex,
                percentageBps: submilestone.percentageBps,
                submilestoneKey: submilestone.key,
              }),
            ),
            type: milestone.archetypeKey,
          }),
        ),
        scenarios: [
          {
            description: "Backoffice-reviewed reimbursement cadence.",
            draws: standardScenario.draws.map((draw: any) => ({
              amountBps: draw.amountBps,
              drawKey: draw.drawKey,
              label: draw.label,
              order: draw.order,
              reviewNote:
                draw.drawKey === "draw-01"
                  ? "Foundation completion and utility tie-in verified."
                  : draw.reviewNote,
              timingDay: draw.timingDay,
            })),
            isActive: true,
            isDefault: standardScenario.isDefault,
            name: "Standard reimbursement updated",
            scenarioKey: standardScenario.scenarioKey,
            sortOrder: standardScenario.sortOrder,
          },
          ...otherScenarios.map((scenario: any) => ({
            description: scenario.description,
            draws: scenario.draws.map((draw: any) => ({
              amountBps: draw.amountBps,
              drawKey: draw.drawKey,
              label: draw.label,
              order: draw.order,
              reviewNote: draw.reviewNote,
              timingDay: draw.timingDay,
            })),
            isActive: false,
            isDefault: scenario.isDefault,
            name: scenario.name,
            scenarioKey: scenario.scenarioKey,
            sortOrder: scenario.sortOrder,
          })),
        ],
        template: {
          description: fullBuild.description,
          isDefault: fullBuild.isDefault,
          summary: fullBuild.summary,
          templateKey: fullBuild.templateKey,
          title: fullBuild.title,
        },
        workosOrganizationId: ORG,
      },
    );

    const updated = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const updatedFullBuild = updated.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    expect(updatedFullBuild.milestones[0]).toMatchObject({
      durationDays: 15,
      key: "site-prep",
      name: "Site prep, utilities & foundation",
    });
    expect(updatedFullBuild.scenarios[0]).toMatchObject({
      description: "Backoffice-reviewed reimbursement cadence.",
      isActive: true,
      name: "Standard reimbursement updated",
    });
    expect(updatedFullBuild.scenarios[0].draws[0]).toMatchObject({
      reviewNote: "Foundation completion and utility tie-in verified.",
    });

    const audits = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "productionProposalSettings")
            .eq("entityId", "single-family-full-build"),
        )
        .collect(),
    );
    expect(audits.map((event: any) => event.eventType)).toContain(
      "production_settings.template_configuration_saved",
    );
  });

  test("persists optional submilestone scope and field guidance in production settings", async () => {
    const { t } = await seeded(["admin"], "user_admin");
    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    const args = productionTemplateSettingsArgs(fullBuild);
    const firstSubmilestone = args.milestones[0].submilestones[0];
    firstSubmilestone.scopeOfWorkTiptapJson = tiptapDocument(
      "Production template scope",
    );
    firstSubmilestone.fieldGuidance = {
      cameraAnglesTiptapJson: tiptapDocument("Production camera angles"),
      whatToVerifyTiptapJson: tiptapDocument("Production verification"),
    };

    await t.mutation(
      (api as any).production_proposals
        .saveProductionProposalTemplateConfiguration,
      {
        ...args,
        workosOrganizationId: ORG,
      },
    );

    const updated = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const updatedSubmilestone = updated.templates
      .find((template: any) => template.templateKey === "single-family-full-build")
      .milestones[0].submilestones[0];
    expect(updatedSubmilestone).toMatchObject({
      fieldGuidance: firstSubmilestone.fieldGuidance,
      scopeOfWorkTiptapJson: firstSubmilestone.scopeOfWorkTiptapJson,
    });

    const malformedArgs = productionTemplateSettingsArgs(fullBuild);
    malformedArgs.milestones[0].submilestones[0].fieldGuidance = {
      cameraAnglesTiptapJson: tiptapDocument("Camera"),
      whatToVerifyTiptapJson: 42,
    };
    await expect(
      t.mutation(
        (api as any).production_proposals
          .saveProductionProposalTemplateConfiguration,
        {
          ...malformedArgs,
          workosOrganizationId: ORG,
        } as any,
      ),
    ).rejects.toThrow(/Validator error|whatToVerifyTiptapJson/i);
  });

  test("allows principal brokers to create entirely new production proposal templates", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    await grantOrgMembership(admin, {
      roleSlugs: ["principle-broker"],
      subject: "user_principal",
    });
    const principalBroker = withIdentity(
      base,
      ["principal-broker"],
      "user_principal",
    );
    const settings = await principalBroker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const source = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );

    await principalBroker.mutation(
      (api as any).production_proposals.createProductionProposalTemplate,
      {
        ...productionTemplateSettingsArgs(source),
        template: {
          description:
            "Ground-up infill rowhouse template created from backoffice settings.",
          isDefault: false,
          summary: "Custom rowhouse template for urban infill projects.",
          templateKey: "urban-infill-rowhouse",
          title: "Urban Infill Rowhouse",
        },
      },
    );

    const updated = await principalBroker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const created = updated.templates.find(
      (template: any) => template.templateKey === "urban-infill-rowhouse",
    );
    expect(created).toMatchObject({
      isDefault: false,
      summary: "Custom rowhouse template for urban infill projects.",
      templateKey: "urban-infill-rowhouse",
      title: "Urban Infill Rowhouse",
    });
    expect(created.milestones).toHaveLength(source.milestones.length);
    expect(created.scenarios).toHaveLength(source.scenarios.length);

    const audits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "productionProposalSettings")
            .eq("entityId", "urban-infill-rowhouse"),
        )
        .collect(),
    );
    expect(audits.map((event: any) => event.eventType)).toContain(
      "production_settings.template_created",
    );
  });

  test("rejects ordinary brokers creating production proposal templates", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const broker = withIdentity(base, ["broker"], "user_broker");
    const settings = await broker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const source = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );

    await expect(
      broker.mutation(
        (api as any).production_proposals.createProductionProposalTemplate,
        {
          ...productionTemplateSettingsArgs(source),
          template: {
            description:
              "Broker-created template should not pass approval-role gates.",
            isDefault: false,
            summary: "Unauthorized broker template.",
            templateKey: "unauthorized-broker-template",
            title: "Unauthorized Broker Template",
          },
        },
      ),
    ).rejects.toThrow(/Forbidden: role/);
  });

  test("rejects production draw timing inside unfinished milestone windows", async () => {
    const { t } = await seeded(["admin"], "user_admin");
    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    const invalidScenarios = fullBuild.scenarios.map(
      (scenario: any, scenarioIndex: number) => ({
        ...scenario,
        draws: scenario.draws.map((draw: any, drawIndex: number) =>
          scenarioIndex === 0 && drawIndex === 0
            ? { ...draw, timingDay: 10 }
            : draw,
        ),
      }),
    );

    await expect(
      t.mutation(
        (api as any).production_proposals
          .saveProductionProposalTemplateConfiguration,
        productionTemplateSettingsArgs(fullBuild, invalidScenarios),
      ),
    ).rejects.toThrow(
      "Reimbursement draws must be scheduled after completed work",
    );
  });

  test("warns when a planned draw schedule is above the lender facility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Over-facility proposal",
        location: "42 Constraint Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 90_000_000,
            drawKey: "over-facility-draw",
            label: "Over-facility draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 100_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned draws exceed the lender facility. Revise the draw schedule or obtain an approved facility change.",
    );
  });

  test("warns when a planned reimbursement is before its milestone is complete", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Premature reimbursement proposal",
        location: "44 Completion Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 80_000_000,
            drawKey: "premature-draw",
            label: "Premature draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 19,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 100_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned reimbursements are scheduled before their milestone is complete.",
    );
  });

  test("warns when planned draws are above cumulative completed-work eligibility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Unearned reimbursement proposal",
        location: "46 Eligibility Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 50_000_000,
            drawKey: "unearned-draw",
            label: "Unearned draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 50_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned draws exceed cumulative completed-work eligibility.",
    );
  });

  test("includes additive package cost items in completed-work draw eligibility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Additive eligibility proposal",
        location: "48 Eligibility Road",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        costItems: [
          {
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 12_500_000,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: ["forms"],
            title: "Added concrete package",
          },
        ],
        draws: [
          {
            amountCents: 50_000_000,
            drawKey: "foundation-draw",
            label: "Foundation reimbursement",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 50_000_000,
                durationDays: 20,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toEqual({ warnings: [] });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(62_500_000);
    expect(detail.draws[0].amountCents).toBe(50_000_000);
  });

  test("persists provided template scenario draws instead of milestone fallback draws", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scenario draw proposal",
        location: "44 Scenario Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 30_000_000,
            drawKey: "scenario-draw-01",
            label: "Scenario draw 01",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
          {
            amountCents: 50_000_000,
            drawKey: "scenario-draw-02",
            label: "Scenario draw 02",
            milestoneKey: "framing",
            order: 2,
            timingDay: 48,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 75_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(detail.draws.map((draw: any) => draw.drawKey)).toEqual([
      "scenario-draw-01",
      "scenario-draw-02",
    ]);
  });

  test("hydrates a production proposal timeline workspace from production rows", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const scope = tiptapDocument("Scope bytes from the canonical draft.");
    const guidance = {
      cameraAnglesTiptapJson: tiptapDocument("Camera angle bytes from the draft."),
      whatToVerifyTiptapJson: tiptapDocument("Verification bytes from the draft."),
    };
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Production timeline workspace",
        location: "88 Timeline Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        lenderDrawPolicyLimitCents: 90_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 8,
                fieldGuidance: guidance,
                key: "forms",
                name: "Forms and pour",
                order: 1,
                scopeOfWorkTiptapJson: scope,
              },
            ],
          },
          {
            budgetCents: 75_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [
              {
                budgetCents: 30_000_000,
                durationDays: 10,
                key: "walls",
                name: "Wall framing",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(workspace.plan).toMatchObject({
      borrowerCoPayBps: 2_000,
      currentDay: 0,
      rangeMin: -30,
      startingCashCents: 25_000_000,
    });
    expect(workspace.plan.rangeMax).toBeGreaterThanOrEqual(58);
    expect(workspace.proposal).toMatchObject({
      buildName: "Production timeline workspace",
      status: "draft",
    });
    expect(workspace.milestones).toHaveLength(2);
    expect(workspace.milestones[0]).toMatchObject({
      budgetCents: 20_000_000,
      drawAvailabilityCents: 16_000_000,
      icon: "foundation",
      milestoneKey: "foundation",
      status: "ready",
      submilestoneSnapshot: [
          {
            budgetCents: 20_000_000,
            durationDays: 8,
            fieldGuidance: guidance,
            key: "forms",
            name: "Forms and pour",
            order: 1,
            scopeOfWorkTiptapJson: scope,
          },
        ],
      x: 0,
    });
    expect(workspace.draws).toEqual([
      expect.objectContaining({
        amountCents: 16_000_000,
        drawKey: "draw-01",
        itemMilestoneKey: "foundation",
        x: 8,
      }),
      expect.objectContaining({
        amountCents: 24_000_000,
        drawKey: "draw-02",
        itemMilestoneKey: "framing",
        x: 34,
      }),
    ]);
    expect(workspace.capitalEvents).toEqual([
      expect.objectContaining({
        amountCents: 25_000_000,
        capitalEventKey: "borrower-reserve",
        eventKind: "cashInfusion",
        x: 0,
      }),
    ]);

    const updatedScope = tiptapDocument("Updated Scope bytes stay exact.");
    const updatedGuidance = {
      cameraAnglesTiptapJson: tiptapDocument(
        "Updated camera angle bytes stay exact.",
      ),
      whatToVerifyTiptapJson: tiptapDocument(
        "Updated verification bytes stay exact.",
      ),
    };
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        milestoneKey: "foundation",
        proposalId,
        submilestones: [
          {
            budgetCents: 20_000_000,
            durationDays: 8,
            fieldGuidance: updatedGuidance,
            key: "forms",
            name: "Forms and pour",
            order: 1,
            scopeOfWorkTiptapJson: updatedScope,
          },
        ],
        workosOrganizationId: ORG,
      },
    );
    const updatedWorkspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      updatedWorkspace.milestones[0].submilestoneSnapshot[0],
    ).toMatchObject({
      fieldGuidance: updatedGuidance,
      key: "forms",
      scopeOfWorkTiptapJson: updatedScope,
    });
    const canonicalState = await t.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .filter((query: any) => query.eq(query.field("key"), "forms"))
        .unique();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      const revision = contract?.activeDraftRevisionId
        ? await ctx.db.get(contract.activeDraftRevisionId)
        : null;
      const fieldGuidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      return { fieldGuidance, revision };
    });
    expect(canonicalState.revision?.scopeOfWorkTiptapJson).toBe(updatedScope);
    expect(canonicalState.fieldGuidance).toMatchObject(updatedGuidance);
  });

  test("persists production timeline evidence, completion, draw review, capital events, and audit events", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Live production timeline",
        location: "101 Live Build Way",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 100_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready for live draw controls.",
      workosOrganizationId: ORG,
    });

    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCapitalEvent,
      {
        amountCents: 7_500_000,
        capitalEventKey: "weather-delay-cost",
        eventKind: "cost",
        label: "Weather delay capital spike",
        proposalId,
        workosOrganizationId: ORG,
        x: 12,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCashInfusion,
      {
        amountCents: 8_000_000,
        cashInfusionKey: "owner-infusion-01",
        label: "Owner cash infusion",
        proposalId,
        workosOrganizationId: ORG,
        x: 13,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "foundation-photo-1",
          fileName: "foundation.jpg",
          label: "Foundation photo",
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          tag: "Foundation",
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitProductionMilestoneCompletion,
      {
        actualCostCents: 52_500_000,
        completedDay: 21,
        milestoneKey: "foundation",
        note: "Foundation complete with signed inspection.",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewProductionMilestoneCompletion,
      {
        milestoneKey: "foundation",
        note: "Inspection package accepted.",
        proposalId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    const siteVisit = await t.mutation(
      (api as any).production_proposals.requestProductionMilestoneSiteVisit,
      {
        includedMilestoneKeys: ["foundation"],
        milestoneKey: "foundation",
        note: "Verify footing photos against the permit package.",
        proposalId,
        requestedDay: 22,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.recordProductionMilestoneSiteVisit,
      {
        milestoneKey: "foundation",
        note: "Inspector verified the poured footing scope.",
        proposalId,
        status: "complete",
        visitId: siteVisit.visitId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitProductionDrawRequest,
      {
        amountCents: 40_000_000,
        drawKey: "draw-01",
        note: "Requesting foundation reimbursement.",
        proposalId,
        workosOrganizationId: ORG,
        x: 22,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewProductionDrawRequest,
      {
        drawKey: "draw-01",
        note: "Released after completion approval.",
        proposalId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 7_500_000,
          capitalEventKey: "weather-delay-cost",
          eventKind: "cost",
          x: 12,
        }),
        expect.objectContaining({
          amountCents: 8_000_000,
          capitalEventKey: "owner-infusion-01",
          eventKind: "cashInfusion",
          x: 13,
        }),
      ]),
    );
    expect(workspace.evidenceAssets).toEqual([
      expect.objectContaining({
        evidenceKey: "foundation-photo-1",
        fileName: "foundation.jpg",
        milestoneKey: "foundation",
        tag: "Foundation",
      }),
    ]);
    expect(workspace.milestones[0]).toMatchObject({
      completionClaim: {
        actualCost: 525_000,
        completedDay: 21,
        note: "Foundation complete with signed inspection.",
      },
      completionReview: {
        note: "Inspection package accepted.",
        siteVisit: expect.objectContaining({
          completedAt: expect.any(String),
          includedItemIds: ["foundation"],
          note: "Verify footing photos against the permit package.",
          recordNote: "Inspector verified the poured footing scope.",
          requestedDay: 22,
          status: "complete",
        }),
        status: "approved",
      },
      evidenceState: "Submitted package",
      status: "complete",
    });
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 40_000_000,
      requestNote: "Requesting foundation reimbursement.",
      requestReviewNote: "Released after completion approval.",
      requestStatus: "approved",
      x: 22,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.capital_event.created",
        "proposal.evidence.created",
        "proposal.milestone_completion.submitted",
        "proposal.milestone_completion.reviewed",
        "proposal.site_visit.requested",
        "proposal.site_visit.recorded",
        "proposal.draw_request.submitted",
        "proposal.draw_request.reviewed",
      ]),
    );
  });

  test("keeps proposal budget and approved amount aligned during pre-live planning edits", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Pre-live budget planning",
        location: "22 Budget Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 32_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        budgetCents: 45_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineMilestone,
      {
        milestone: {
          budgetCents: 10_000_000,
          dayEnd: 36,
          dayStart: 22,
          durationDays: 14,
          evidenceState: "Draft package",
          milestoneKey: "framing",
          name: "Framing",
          order: 2,
          policyState: "Draft proposal policy",
          status: "ready",
          submilestones: [],
          x: 22,
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCapitalEvent,
      {
        amountCents: 5_000_000,
        capitalEventKey: "utility-overrun",
        eventKind: "cost",
        label: "Utility overrun",
        proposalId,
        workosOrganizationId: ORG,
        x: 18,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCashInfusion,
      {
        amountCents: 6_000_000,
        cashInfusionKey: "owner-cash",
        label: "Owner cash infusion",
        proposalId,
        workosOrganizationId: ORG,
        x: 19,
      },
    );

    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(60_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(40_000_000);
    const drawAmountBeforeCoPayEdit = detail.draws[0].amountCents;
    expect(drawAmountBeforeCoPayEdit).toBe(32_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.borrowerCoPayBps).toBe(2_500);
    expect(detail.proposal.borrowerCoPayCents).toBe(15_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(45_000_000);
    expect(detail.milestones[0].drawAvailabilityCents).toBe(33_750_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeCoPayEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 12_345_678,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.borrowerCoPayBps).toBe(2_058);
    expect(detail.proposal.borrowerCoPayCents).toBe(12_345_678);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(47_652_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalInterestRate,
      {
        interestAnnualBps: 1_050,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.interestAnnualBps).toBe(1_050);

    const drawAmountBeforeApprovedEdit = detail.draws[0].amountCents;
    const totalDrawAmountBeforeApprovedEdit = detail.draws.reduce(
      (total: number, draw: any) => total + draw.amountCents,
      0,
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 30_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(
      totalDrawAmountBeforeApprovedEdit,
    );
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 50_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(50_000_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        drawAvailabilityCents: 55_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.milestones[0].drawAvailabilityCents).toBe(55_000_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(50_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineDraw,
      {
        amountCents: 48_000_000,
        drawKey: detail.draws[0].drawKey,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(workspace.milestones[0].drawAvailabilityCents).toBe(55_000_000);
    expect(workspace.draws[0].amountCents).toBe(48_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        amountCents: 7_000_000,
        capitalEventKey: "utility-overrun",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(62_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 50_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        amountCents: 8_000_000,
        capitalEventKey: "utility-overrun",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(63_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        capitalEventKey: "utility-overrun",
        eventKind: "cashInfusion",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(55_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);
  });

  test("supports audited draft timeline edits and approved live-build modification requests", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Editable production timeline",
        location: "44 Edit Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 110_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        budgetCents: 42_000_000,
        dayEnd: 22,
        dayStart: 1,
        durationDays: 21,
        milestoneKey: "foundation",
        name: "Foundation revised",
        proposalId,
        submilestones: [
          {
            budgetCents: 18_000_000,
            durationDays: 9,
            key: "forms",
            name: "Forms revised",
            order: 1,
            startDay: 3,
          },
        ],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineMilestone,
      {
        milestone: {
          budgetCents: 30_000_000,
          dayEnd: 46,
          dayStart: 24,
          durationDays: 22,
          evidenceState: "Draft package",
          milestoneKey: "framing",
          name: "Framing",
          order: 2,
          policyState: "Draft proposal policy",
          status: "ready",
          submilestones: [
            {
              budgetCents: 30_000_000,
              durationDays: 22,
              key: "walls",
              name: "Wall framing",
              order: 1,
              startDay: 24,
            },
          ],
          x: 24,
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineDraw,
      {
        amountCents: 24_000_000,
        customDate: true,
        drawKey: "manual-draw-framing",
        itemMilestoneKey: "framing",
        label: "Manual framing draw",
        order: 2,
        proposalId,
        workosOrganizationId: ORG,
        x: 47,
      },
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineDraw,
      {
        amountCents: 25_000_000,
        drawKey: "manual-draw-framing",
        label: "Manual framing reimbursement",
        proposalId,
        workosOrganizationId: ORG,
        x: 49,
      },
    );

    let workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toEqual(["foundation", "framing"]);
    expect(workspace.milestones[0]).toMatchObject({
      budgetCents: 18_000_000,
      durationDays: 9,
      name: "Foundation revised",
      x: 3,
    });
    expect(workspace.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 25_000_000,
          drawKey: "manual-draw-framing",
          itemMilestoneKey: "framing",
          label: "Manual framing reimbursement",
          x: 49,
        }),
      ]),
    );

    await t.mutation(
      (api as any).production_proposals.deleteProductionTimelineDraw,
      {
        drawKey: "manual-draw-framing",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.deleteProductionTimelineMilestone,
      {
        milestoneKey: "framing",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toEqual(["foundation"]);
    expect(workspace.draws.map((draw: any) => draw.drawKey)).not.toContain(
      "manual-draw-framing",
    );

    await submitProposalForTest(t, proposalId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          budgetCents: 43_000_000,
          milestoneKey: "foundation",
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/locked/);

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve revised timeline.",
      workosOrganizationId: ORG,
    });
    const request = await builder.mutation(
      (api as any).production_proposals.requestProductionTimelineModification,
      {
        proposalId,
        reason: "Add porch scope after buyer selection.",
        requestedPayload: {
          milestone: {
            budgetCents: 12_000_000,
            dayEnd: 38,
            dayStart: 30,
            durationDays: 8,
            evidenceState: "Requested change",
            milestoneKey: "porch",
            name: "Porch allowance",
            order: 2,
            policyState: "Admin approval required",
            status: "ready",
            submilestones: [
              { key: "porch-scope", name: "Porch scope", order: 1 },
            ],
            x: 30,
          },
        },
        requestType: "createMilestone",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals
        .reviewProductionTimelineModificationRequest,
      {
        note: "Approved as buyer-paid change order.",
        requestId: request.requestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.modificationRequests[0]).toMatchObject({
      reviewNote: "Approved as buyer-paid change order.",
      status: "approved",
    });
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toContain("porch");

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.milestone.updated",
        "proposal.milestone.created",
        "proposal.draw.created",
        "proposal.draw.updated",
        "proposal.draw.deleted",
        "proposal.milestone.deleted",
        "proposal.modification.requested",
        "proposal.modification.reviewed",
      ]),
    );
  });

  test("materializes a full production active-build workspace with audited draw and milestone actions", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Full active build workspace",
        location: "909 Workspace Court",
        locationLatitude: 43.2557,
        locationLongitude: -79.8711,
        locationPlaceId: "workspace-court-place",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "workspace-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 25_000_000,
                durationDays: 10,
                key: "excavation",
                name: "Excavation",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "foundation-site-photo",
          fileName: "foundation-site-photo.jpg",
          label: "Foundation site photo",
          locationVerified: true,
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          tag: "site-photo",
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready for active build workspace.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
    });
    await seedCanonicalSiteVisitGuidanceForBuild(t, closing.buildId);

    const principalRequestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildFacilityChange,
      {
        buildId: closing.buildId,
        reason: "Framing quote increased after lender approval.",
        requestedPrincipalCents: 60_000_000,
        requestType: "principalIncrease",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .reviewActiveBuildFacilityChangeRequest,
        {
          requestId: principalRequestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/role|permission|Forbidden/i);
    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
      {
        note: "Approved within revised loan authority.",
        requestId: principalRequestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    const extensionRequestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildFacilityChange,
      {
        buildId: closing.buildId,
        reason: "Winter sequencing pushed exterior work.",
        requestedPaybackDate: "2027-10-01",
        requestType: "paybackExtension",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
      {
        note: "Extension accepted after broker review.",
        requestId: extensionRequestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.addActiveBuildNote, {
        body: "Internal lender note for the production workspace.",
        buildId: closing.buildId,
        visibility: "internal",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Public/Internal Notes are retired");
    await t.mutation((api as any).production_proposals.addActiveBuildDocument, {
      buildId: closing.buildId,
      clientOperationId: "active-build-document-inspection-scope",
      documentType: "supporting",
      fileName: "inspection-scope.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      workosOrganizationId: ORG,
    });
    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "site-lead@example.com",
        name: "Site Lead Builders",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation contractor",
        workosOrganizationId: ORG,
      },
    );
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const drawReceipt = await t.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 20_000_000,
        buildId: closing.buildId,
        drawKey: "draw-01",
        note: "Foundation reimbursement requested.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: drawReceipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: drawReceipt.requestKey,
        note: "Evidence and policy review complete.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: drawReceipt.requestKey,
      note: "Approved for release after operations review.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.releaseActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: drawReceipt.requestKey,
      note: "Released after admin approval.",
      releaseDate: "2026-08-24",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Add final inspection card.",
        workosOrganizationId: ORG,
      },
    );
    const siteVisit = await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        idempotencyKey: "assign-site-visit-workspace-token",
        milestoneKey: "foundation",
        note: "Verify footing photo location.",
        requestedDay: 23,
        siteVisitGuidance: {
          cameraAngles:
            "<ul><li>Capture the complete formwork from the street.</li></ul>",
          whatToVerify:
            "<ul><li>Verify forms are complete and ready for the pour.</li></ul>",
        },
        submilestoneKeys: ["excavation"],
        workosOrganizationId: ORG,
      },
    );
    expect(siteVisit.url).toContain("/newsitevisit/");
    const tokenizedVisit = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(closing.buildId),
        token: siteVisit.visitId,
      },
    );
    expect(tokenizedVisit.permit).toMatchObject({
      fileName: "workspace-permit.pdf",
      kind: "permit",
      mimeType: "application/pdf",
    });
    expect(tokenizedVisit.build).toMatchObject({
      address: "909 Workspace Court",
      locationLatitude: 43.2557,
      locationLongitude: -79.8711,
    });
    expect(tokenizedVisit.targets).toEqual([
      expect.objectContaining({
        guidance: {
          cameraAngles:
            "<ul><li>Capture the complete formwork from the street.</li></ul>",
          whatToVerify:
            "<ul><li>Verify forms are complete and ready for the pour.</li></ul>",
        },
        milestoneKey: "foundation",
        submilestones: [{ key: "excavation", name: "Excavation" }],
      }),
    ]);
    const siteVisitRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      { workosOrganizationId: ORG },
    );
    expect(siteVisitRoster.summary.total).toBeGreaterThanOrEqual(1);
    expect(siteVisitRoster.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildId: closing.buildId,
          milestoneKey: "foundation",
          operationalStatus: "open",
          visitId: siteVisit.visitId,
        }),
      ]),
    );
    expect(
      siteVisitRoster.builds.some(
        (group: { buildId: string }) => group.buildId === closing.buildId,
      ),
    ).toBe(true);
    const scopedVisitFixtures = await t.run(async (ctx: any) => {
      const child = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .filter((q: any) => q.eq(q.field("key"), "excavation"))
        .unique();
      const canonical = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) => q.eq("visitId", siteVisit.visitId))
        .unique();
      const { _creationTime, _id, ...canonicalFields } = canonical;
      await ctx.db.insert("buildSiteVisits", {
        ...canonicalFields,
        scheduleIdempotencyKey: "scoped-cancelled-history",
        status: "cancelled",
        submilestoneId: child._id,
        submilestoneKeys: ["legacy-key-does-not-match"],
        visitId: "scoped-cancelled-history",
      });
      const {
        submilestoneId: _submilestoneId,
        submilestoneKeys: _submilestoneKeys,
        ...legacyFields
      } = canonicalFields;
      await ctx.db.insert("buildSiteVisits", {
        ...legacyFields,
        scheduleIdempotencyKey: "legacy-milestone-wide-history",
        status: "cancelled",
        visitId: "legacy-milestone-wide-history",
      });
      await ctx.db.insert("buildSiteVisits", {
        ...legacyFields,
        scheduleIdempotencyKey: "other-child-history",
        status: "cancelled",
        submilestoneKeys: ["other-child"],
        visitId: "other-child-history",
      });
      return { childId: child._id };
    });
    const childScopedRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        submilestoneId: scopedVisitFixtures.childId,
        workosOrganizationId: ORG,
      },
    );
    const childScopedVisitIds = childScopedRoster.visits.map(
      (visit: { visitId: string }) => visit.visitId,
    );
    expect(childScopedVisitIds).toEqual(
      expect.arrayContaining([
        siteVisit.visitId,
        "scoped-cancelled-history",
        "legacy-milestone-wide-history",
      ]),
    );
    expect(childScopedVisitIds).not.toContain("other-child-history");
    await expect(
      t.query((api as any).production_proposals.listBrokerageSiteVisits, {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        submilestoneId: scopedVisitFixtures.childId,
        workosOrganizationId: "org_site_visit_scope_other",
      }),
    ).rejects.toThrow();
    await seedTokenizedSiteVisitEvidence(t, {
      buildId: String(closing.buildId),
      locationFailureReason: "Previously outside the site geofence.",
      token: siteVisit.visitId,
    });
    await t.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(closing.buildId),
        completionObserved: true,
        locationAttempt: {
          accuracyMeters: 12,
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          latitude: 43.25571,
          longitude: -79.87109,
          permissionOutcome: "granted",
          verified: true,
        },
        missingPrerequisites: [],
        recommendedOutcome: "approve",
        reportNotes:
          "<p><strong>Inspector verified</strong> footing photo location.</p>",
        token: siteVisit.visitId,
      },
    );
    const adminInbox = await t.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(adminInbox.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "Review site visit",
          actionRequired: true,
          href: `/backoffice/builds/${closing.buildId}?milestone=foundation&rail=open`,
          sourceLabel: "Site Visit Staff",
          title: "Foundation site visit submitted",
        }),
      ]),
    );
    const completedSiteVisitRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      { workosOrganizationId: ORG },
    );
    expect(completedSiteVisitRoster.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locationAttempt: {
            accuracyMeters: 12,
            attempted: true,
            attemptedAt: 1_721_234_567_890,
            distanceMeters: 1,
            geofenceRadiusMeters: 250,
            latitude: 43.25571,
            longitude: -79.87109,
            permissionOutcome: "granted",
            verified: true,
          },
          milestoneKey: "foundation",
          missingPrerequisites: [],
          operationalStatus: "complete",
          recordNote:
            "<p><strong>Inspector verified</strong> footing photo location.</p>",
          recordNoteFormat: "html",
          visitId: siteVisit.visitId,
        }),
      ]),
    );
    const persistedVisitEvidence = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) => q.eq("visitId", siteVisit.visitId))
        .unique();
      return await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_site_visit", (q: any) => q.eq("siteVisitId", visit._id))
        .unique();
    });
    expect(persistedVisitEvidence).toMatchObject({
      locationAccuracyMeters: 12,
      locationDistanceMeters: 1,
      locationGeofenceRadiusMeters: 250,
      locationVerified: true,
    });
    expect(persistedVisitEvidence).not.toHaveProperty("locationFailureReason");
    const replacementRequest = await t.mutation(
      (api as any).production_proposals
        .requestActiveBuildSiteVisitReplacementLink,
      {
        buildId: String(closing.buildId),
        reason: "Corrective work requires another site inspection.",
        token: siteVisit.visitId,
      },
    );
    expect(replacementRequest).toMatchObject({
      requested: true,
      reference: expect.stringMatching(/^SVR-[A-Z0-9]{8}$/),
    });
    const persistedReplacementRequest = await t.run(async (ctx: any) =>
      ctx.db
        .query("siteVisitLinkRecoveryRequests")
        .withIndex("by_reference", (q: any) =>
          q.eq("reference", replacementRequest.reference),
        )
        .unique(),
    );
    expect(persistedReplacementRequest).toMatchObject({
      buildId: String(closing.buildId),
      originalVisitId: siteVisit.visitId,
      reason: "Corrective work requires another site inspection.",
      source: "production",
      status: "pending",
      tokenState: "consumed",
    });
    const drawRoster = await t.query(
      (api as any).production_proposals.listBrokerageDraws,
      { workosOrganizationId: ORG },
    );
    expect(drawRoster.summary.total).toBeGreaterThanOrEqual(1);
    expect(drawRoster.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildId: closing.buildId,
          builderContact: expect.objectContaining({
            displayName: expect.any(String),
          }),
          drawKey: drawReceipt.requestKey,
          funding: expect.objectContaining({
            availableCents: expect.any(Number),
            drawnCents: expect.any(Number),
            totalApprovedCents: expect.any(Number),
          }),
          status: "released",
        }),
      ]),
    );
    expect(drawRoster.chartSeries.length).toBeGreaterThanOrEqual(1);
    expect(
      drawRoster.builds.some(
        (group: { buildId: string }) => group.buildId === closing.buildId,
      ),
    ).toBe(true);
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Milestone approved from production build detail.",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );

    expect(workspace.builderContact).toEqual(
      expect.objectContaining({ displayName: expect.any(String) }),
    );

    expect(workspace.sitePhotos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caption: "Foundation site photo",
          evidenceKey: "foundation-site-photo",
          locationVerified: true,
        }),
      ]),
    );
    expect(workspace.documents.map((doc: any) => doc.fileName)).toEqual(
      expect.arrayContaining(["workspace-permit.pdf", "inspection-scope.pdf"]),
    );
    expect(workspace).not.toHaveProperty("notes");
    expect(workspace.contractors[0]).toMatchObject({
      name: "Site Lead Builders",
      role: "Foundation contractor",
    });
    const excavation = workspace.submilestones.find(
      (submilestone: any) => submilestone.key === "excavation",
    );
    expect(siteVisit.submilestoneId).toBe(excavation?._id);
    expect(
      workspace.auditEvents.find(
        (event: any) => event.eventType === "active_build.site_visit.requested",
      ),
    ).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: excavation?._id,
        },
        canonicalTargetContext: { selectedTab: "review" },
      }),
    );
    await runAuditEventBuildIdBackfill(t);
    await grantOrgMembership(t, {
      roleSlugs: ["builder-staff"],
      subject: "user_site_visit_resource_only",
    });
    await t.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ evidence: { canView: true } }),
        staffWorkosUserId: "user_site_visit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const resourceOnlyStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_site_visit_resource_only",
    );
    const resourceOnlyWorkspace = await resourceOnlyStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      resourceOnlyWorkspace.auditEvents.some(
        (event: any) =>
          event.eventType === "active_build.site_visit.requested",
      ),
    ).toBe(false);

    await t.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          evidence: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_site_visit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const allowedWorkspace = await resourceOnlyStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      allowedWorkspace.auditEvents.find(
        (event: any) => event.eventType === "active_build.site_visit.requested",
      ),
    ).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: excavation?._id,
        },
      }),
    );
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 20_000_000,
      requestNote: "Foundation reimbursement requested.",
      requestReviewNote: "Approved for release after operations review.",
      releaseNote: "Released after admin approval.",
      status: "released",
    });
    expect(workspace.loanFacility).toMatchObject({
      paybackDate: "2027-10-01",
      principalCents: 60_000_000,
    });
    expect(workspace.facilityChangeRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestType: "principalIncrease",
          status: "approved",
        }),
        expect.objectContaining({
          requestType: "paybackExtension",
          status: "approved",
        }),
      ]),
    );
    expect(workspace.milestones[0]).toMatchObject({
      completionReview: expect.objectContaining({
        note: "Milestone approved from production build detail.",
        siteVisit: expect.objectContaining({
          note: "Verify footing photo location.",
          recordNote:
            "<p><strong>Inspector verified</strong> footing photo location.</p>",
          recordNoteFormat: "html",
          requestedDay: 23,
          status: "complete",
        }),
        status: "approved",
      }),
      evidenceState: "Approved",
      status: "complete",
    });
    expect(workspace.quickActionEvents).toEqual([]);
    expect(JSON.stringify(workspace.auditEvents)).not.toMatch(
      /payloadPreview|requestId|stack|validator/i,
    );
    expect(
      workspace.auditEvents.every(
        (event: any) =>
          !event.beforeSummary?.startsWith("{") &&
          !event.afterSummary?.startsWith("{"),
      ),
    ).toBe(true);
    expect(JSON.stringify(workspace.auditEvents)).not.toMatch(
      /Previous state|Updated state/,
    );
    expect(
      workspace.auditEvents.some(
        (event: any) =>
          Array.isArray(event.changes) && event.changes.length > 0,
      ),
    ).toBe(true);
    expect(
      workspace.auditEvents.find(
        (event: any) => event.eventType === "active_build.draw.requested",
      ),
    ).toEqual(
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ field: "Status" }),
        ]),
        reason: expect.any(String),
        warnings: expect.any(Array),
      }),
    );
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.created",
        "active_build.facility_change.requested",
        "active_build.facility_change.reviewed",
        "active_build.document.created",
        "active_build.contractor.attached",
        "active_build.draw.requested",
        "active_build.draw.review_started",
        "active_build.draw.ready_for_admin",
        "active_build.draw.approved_for_release",
        "active_build.draw.released",
        "active_build.milestone.info_requested",
        "active_build.site_visit.requested",
        "active_build.site_visit.token_report_submitted",
        "active_build.milestone.approved",
      ]),
    );
  });

  test("allows canonical execution fields to be explicitly cleared with null", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "clear-execution-start-001",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 47_500_000,
        buildId: closing.buildId,
        completionForecastDate: "2026-06-12",
        expectedRevision: 1,
        fieldNote: "Initial execution note.",
        idempotencyKey: "clear-execution-set-001",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: null,
        buildId: closing.buildId,
        completionForecastDate: null,
        expectedRevision: 2,
        fieldNote: null,
        idempotencyKey: "clear-execution-clear-001",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.submilestones[0]).not.toHaveProperty("actualCostCents");
    expect(detail.submilestones[0]).not.toHaveProperty(
      "completionForecastDate",
    );
    expect(detail.submilestones[0]).not.toHaveProperty("fieldNote");
    expect(detail.submilestones[0].workflowRevision).toBe(3);
  });

  test("requires evidence and Sub-milestone view for canonical evidence audits", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Canonical evidence audit build",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "canonical-evidence-start-001",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const storageId = await admin.run(async (ctx: any) =>
      ctx.storage.store(new Blob(["canonical evidence"], { type: "image/jpeg" })),
    );
    await builder.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      {
        buildId: closing.buildId,
        evidence: {
          fileName: "forms.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 128,
          storageId,
        },
        expectedRevision: 1,
        idempotencyKey: "canonical-evidence-add-001",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const adminDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const evidenceEvent = adminDetail.auditEvents.find(
      (event: any) => event.command === "addActiveBuildSubmilestoneEvidence",
    );
    expect(evidenceEvent).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: String(adminDetail.submilestones[0]._id),
        },
      }),
    );

    await runAuditEventBuildIdBackfill(admin);
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_evidence_audit_resource_only",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ evidence: { canView: true } }),
        staffWorkosUserId: "user_evidence_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const evidenceResourceOnly = withIdentity(
      base,
      ["builder-staff"],
      "user_evidence_audit_resource_only",
    );
    const evidenceResourceOnlyDetail = await evidenceResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      evidenceResourceOnlyDetail.auditEvents.some(
        (event: any) =>
          event.command === "addActiveBuildSubmilestoneEvidence" &&
          event.entityType === "buildSubmilestone",
      ),
    ).toBe(false);

    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          evidence: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_evidence_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const evidenceAllowedDetail = await evidenceResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      evidenceAllowedDetail.auditEvents.some(
        (event: any) =>
          event.command === "addActiveBuildSubmilestoneEvidence" &&
          event.canonicalTarget?.submilestoneId ===
            String(evidenceAllowedDetail.submilestones[0]._id),
      ),
    ).toBe(true);
  });

  test("lets Backoffice upload canonical evidence on behalf of the Builder before work starts", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Backoffice evidence upload build",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const storageId = await admin.run(async (ctx: any) =>
      ctx.storage.store(
        new Blob(["builder evidence"], { type: "application/pdf" }),
      ),
    );
    const args = {
      buildId: closing.buildId,
      evidence: {
        fileName: "builder-invoice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 256,
        storageId,
      },
      expectedRevision: 0,
      idempotencyKey: "backoffice-builder-evidence-001",
      milestoneKey: "foundation",
      submilestoneKey: "forms",
      uploadedOnBehalfOfBuilder: true,
      workosOrganizationId: ORG,
    };

    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(
        (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
        args,
      ),
    ).rejects.toThrow(/backoffice|forbidden|required role/i);

    const first = await admin.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      args,
    );
    const replay = await admin.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      args,
    );

    expect(replay).toMatchObject({
      evidenceAssetId: first.evidenceAssetId,
      replayed: true,
    });
    const persisted = await admin.run(async (ctx: any) => {
      const asset = await ctx.db.get(first.evidenceAssetId);
      const item = await ctx.db
        .query("buildSubmilestoneEvidencePackageItems")
        .withIndex("by_package_revision", (query: any) =>
          query.eq("packageRevisionId", first.evidencePackageRevisionId),
        )
        .unique();
      if (!item) {
        throw new Error("Canonical Evidence Package item is unavailable.");
      }
      const audit = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query: any) =>
          query
            .eq("entityType", "buildSubmilestone")
            .eq("entityId", String(item.buildSubmilestoneId)),
        )
        .collect();
      const evidenceAudit = audit.find(
        (event: any) =>
          event.command === "addActiveBuildSubmilestoneEvidence",
      );
      return { asset, audit: evidenceAudit, item };
    });
    expect(persisted.asset).toMatchObject({
      locationVerified: false,
      source: "backoffice_builder_evidence_upload",
    });
    expect(persisted.item).toMatchObject({
      requirementKey: "completion-evidence",
      sourceKind: "canonical_upload",
      sourceUploaderWorkosUserId: "user_admin",
    });
    expect(JSON.parse(persisted.audit?.newState ?? "{}")).toMatchObject({
      uploadedByWorkosUserId: "user_admin",
      uploadedOnBehalfOfBuilder: true,
    });
    expect(persisted.audit?.warnings).toEqual([
      "uploaded_on_behalf_of_builder",
      "evidence_location_unverified",
    ]);
  });

  test("projects active-build submilestones as canonical calendar child entities", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildCalendarWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const child = workspace.events.find(
      (event: any) => event.kind === "submilestone",
    );
    const parent = workspace.events.find(
      (event: any) => event.kind === "milestone",
    );

    expect(child).toEqual(
      expect.objectContaining({
        entity: {
          id: expect.any(String),
          type: "submilestone",
        },
      }),
    );
    expect(parent?.entity).toEqual(
      expect.objectContaining({ type: "milestone" }),
    );
  });

  test("keeps active-build calendar child event IDs unique when display keys repeat", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 20,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 20,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [
            { budgetCents: 20_000_000, key: "forms", name: "Forms", order: 1 },
          ] as never[],
        },
        {
          budgetCents: 50_000_000,
          dayEnd: 40,
          dayStart: 20,
          dependencyKeys: [],
          durationDays: 20,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [
            { budgetCents: 20_000_000, key: "forms", name: "Forms", order: 1 },
          ] as never[],
        },
      ],
    });
    const canonicalIds = await t.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      return rows.map((row: any) => String(row._id)).sort();
    });
    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildCalendarWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const children = workspace.events.filter(
      (event: any) => event.kind === "submilestone",
    );

    expect(children).toHaveLength(2);
    expect(children.map((event: any) => event.entity.id).sort()).toEqual(
      canonicalIds,
    );
    expect(new Set(children.map((event: any) => event.id)).size).toBe(2);
    expect(children[0].entity.id).not.toBe(children[1].entity.id);
  });

  test("projects only real build submilestone audit identities as canonical child targets", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const submilestone = await t.run(async (ctx: any) => {
      const row = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .filter((q: any) => q.eq(q.field("key"), "forms"))
        .unique();
      const build = await ctx.db.get(closing.buildId);
      if (!(row && build)) {
        throw new Error("Canonical submilestone audit fixture is unavailable.");
      }
      await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: closing.buildId,
        command: "reviewActiveBuildSubmilestone",
        createdAt: Date.now(),
        entityId: String(row._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.reviewed",
        resourceType: "submilestone",
        newState: JSON.stringify({ status: "in_review" }),
        organizationId: build.organizationId,
        priorState: JSON.stringify({ status: "planned" }),
        warnings: [],
      });
      return row;
    });

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const childEvent = detail.auditEvents.find(
      (event: any) => event.entityType === "buildSubmilestone",
    );

    expect(childEvent).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: String(submilestone._id),
        },
      }),
    );
    expect(
      detail.auditEvents
        .filter((event: any) => event.entityType !== "buildSubmilestone")
        .some((event: any) => event.canonicalTarget),
    ).toBe(false);
  });

  test("redacts child audit details when builder staff lacks submilestone view", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_limited_child_audit",
    });
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Sensitive forms", order: 1 }],
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        staffWorkosUserId: "user_limited_child_audit",
        workosOrganizationId: ORG,
      },
    );
    const child = await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const row = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      if (!(build && row)) {
        throw new Error("Limited child audit fixture is unavailable.");
      }
      await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: closing.buildId,
        command: "reviewActiveBuildSubmilestone",
        createdAt: Date.now(),
        entityId: String(row._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.sensitive_reviewed",
        newState: JSON.stringify({ status: "in_review" }),
        organizationId: build.organizationId,
        priorState: JSON.stringify({ status: "planned" }),
        reason: "Sensitive child audit reason",
        warnings: ["Sensitive child warning"],
      });
      return row;
    });

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "user_limited_child_audit",
    );
    const detail = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );

    expect(detail.submilestones).toEqual([]);
    expect(
      detail.auditEvents.some(
        (event: any) => event.entityId === String(child._id),
      ),
    ).toBe(false);
    expect(JSON.stringify(detail.auditEvents)).not.toContain("Sensitive forms");
    expect(JSON.stringify(detail.auditEvents)).not.toContain(
      "Sensitive child audit reason",
    );
    expect(JSON.stringify(detail.auditEvents)).not.toContain(
      "Sensitive child warning",
    );
    expect(
      detail.auditEvents.some((event: any) => event.canonicalTarget),
    ).toBe(false);
  });

  test("redacts every canonical audit resource without its Builder Staff view grant", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_limited_audit_resources",
    });
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Permission-scoped audit build",
      submilestones: [{ key: "forms", name: "Sensitive forms", order: 1 }],
    });
    const entityIds = await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .unique();
      if (!(build && milestone && submilestone)) {
        throw new Error("Permission audit entities are unavailable.");
      }
      const now = Date.now();
      const drawId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 1_000_000,
        brokerageId: build.brokerageId,
        buildId: build._id,
        clientOperationId: "permission-audit-draw-001",
        createdAt: now,
        displayId: "DR-PERMISSION",
        label: "Permission audit draw",
        organizationId: build.organizationId,
        requestedAt: new Date(now).toISOString(),
        requestedByWorkosUserId: "user_admin",
        requestKey: "permission-audit-draw",
        status: "requested",
        updatedAt: now,
      });
      const siteVisitId = await ctx.db.insert("buildSiteVisits", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildMilestoneId: milestone._id,
        createdAt: now,
        milestoneKey: milestone.key,
        organizationId: build.organizationId,
        requestedAt: new Date(now).toISOString(),
        requestedDay: 1,
        status: "requested",
        tokenExpiresAt: now + 86_400_000,
        updatedAt: now,
        url: `/site-visits/${String(build._id)}/permission-audit`,
        visitId: "permission-audit-site-visit",
      });
      const evidenceId = await ctx.db.insert("buildEvidenceAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        evidenceKey: "permission-audit-evidence",
        fileName: "permission-audit.jpg",
        label: "Permission audit evidence",
        locationVerified: true,
        milestoneKey: milestone.key,
        mimeType: "image/jpeg",
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        siteVisitId,
        sizeBytes: 1_024,
        source: "test",
        tag: "Permission audit",
        updatedAt: now,
      });
      const events = [
        {
          entityId: String(milestone._id),
          entityType: "buildMilestone",
          eventType: "permission.milestone",
        },
        {
          entityId: String(submilestone._id),
          entityType: "buildSubmilestone",
          eventType: "permission.submilestone",
        },
        {
          entityId: String(drawId),
          entityType: "draw",
          eventType: "permission.draw",
        },
        {
          entityId: String(evidenceId),
          entityType: "evidencePackage",
          eventType: "permission.evidence",
        },
        {
          entityId: String(siteVisitId),
          entityType: "siteVisit",
          eventType: "permission.siteVisit",
        },
        {
          entityId: String(build._id),
          entityType: "activeBuild",
          eventType: "permission.material",
          resourceType: "material",
        },
      ];
      for (const event of events) {
        await ctx.db.insert("auditEvents", {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          brokerageId: build.brokerageId,
          buildId: build._id,
          command: "permissionAuditProbe",
          createdAt: now,
          entityId: event.entityId,
          entityType: event.entityType,
          eventType: event.eventType,
          resourceType:
            event.resourceType ??
            (event.entityType === "buildMilestone"
              ? "milestone"
              : event.entityType === "buildSubmilestone"
                ? "submilestone"
                : event.entityType === "draw"
                  ? "draw"
                  : event.entityType === "evidencePackage"
                    ? "evidence"
                    : "siteVisit"),
          organizationId: build.organizationId,
          reason:
            event.entityType === "buildMilestone"
              ? "Visible milestone audit reason"
              : `Sensitive ${event.entityType} reason`,
          warnings:
            event.entityType === "buildMilestone"
              ? ["Visible milestone audit warning"]
              : [`Sensitive ${event.entityType} warning`],
        });
      }
      return { buildId: build._id, eventTypes: events.map((event) => event.eventType) };
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ milestone: { canView: true } }),
        staffWorkosUserId: "user_limited_audit_resources",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "user_limited_audit_resources",
    );
    const restricted = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(entityIds.buildId), workosOrganizationId: ORG },
    );
    expect(
      restricted.auditEvents.map((event: any) => event.eventType),
    ).toContain("permission.milestone");
    for (const eventType of entityIds.eventTypes.filter(
      (eventType: string) => eventType !== "permission.milestone",
    )) {
      expect(
        restricted.auditEvents.some(
          (event: any) => event.eventType === eventType,
        ),
      ).toBe(false);
    }
    expect(JSON.stringify(restricted.auditEvents)).not.toContain(
      "Sensitive",
    );

    const adminDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(entityIds.buildId), workosOrganizationId: ORG },
    );
    for (const eventType of entityIds.eventTypes) {
      expect(
        adminDetail.auditEvents.some(
          (event: any) => event.eventType === eventType,
        ),
      ).toBe(true);
    }
    const lender = withIdentity(base, ["broker"], "user_lender_audit_reader");
    const lenderDetail = await lender.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(entityIds.buildId), workosOrganizationId: ORG },
    );
    for (const eventType of entityIds.eventTypes) {
      expect(
        lenderDetail.auditEvents.some(
          (event: any) => event.eventType === eventType,
        ),
      ).toBe(true);
    }
  });

  test("backfills legacy canonical audit rows to an active Build id idempotently", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Audit event build-id migration build",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const legacyEventId = await admin.run(async (ctx: any) => {
      const child = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      const build = await ctx.db.get(closing.buildId);
      if (!(child && build)) {
        throw new Error("Audit migration fixture is unavailable.");
      }
      return ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "legacyChildAudit",
        createdAt: Date.now(),
        entityId: String(child._id),
        entityType: "buildSubmilestone",
        eventType: "submilestone.legacy_audit",
        organizationId: build.organizationId,
        reason: "Legacy row requiring Build backfill.",
        warnings: [],
      });
    });
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(legacyEventId);
        return event?.buildId;
      }),
    ).resolves.toBeNull();

    let cursor: string | null = null;
    let isDone = false;
    let processed = 0;
    while (!isDone) {
      const result: {
        continueCursor: string;
        isDone: boolean;
        processed: number;
      } = await admin.mutation(
        (internal as any).audit_event_migrations.backfillAuditEventBuildId,
        {
          batchSize: 25,
          cursor,
          dryRun: false,
          oneBatchOnly: true,
        },
      );
      processed += result.processed;
      cursor = result.continueCursor;
      isDone = result.isDone;
    }
    expect(processed).toBeGreaterThan(0);
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(legacyEventId);
        return event?.buildId;
      }),
    ).resolves.toBe(closing.buildId);

    const replay = await admin.mutation(
      (internal as any).audit_event_migrations.backfillAuditEventBuildId,
      { batchSize: 25, cursor: null, dryRun: false, oneBatchOnly: true },
    );
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(legacyEventId);
        return event?.buildId;
      }),
    ).resolves.toBe(closing.buildId);
    expect(replay.processed).toBeGreaterThan(0);
  });

  test("repairs validated child payload identity and rejects mismatched tenant rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Audit identity repair build",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const ids = await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const child = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      if (!(build && milestone && child)) {
        throw new Error("Audit identity repair fixture is unavailable.");
      }
      const startEventId = await ctx.db.insert("milestoneStartEvents", {
        actualStartedAt: Date.parse("2026-05-03T12:00:00.000Z"),
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: child._id,
        dependencySnapshot: [],
        eventType: "started",
        idempotencyKey: "legacy-start-event-001",
        milestoneKey: milestone.key,
        newLifecycleState: "in_progress",
        organizationId: build.organizationId,
        priorLifecycleState: "planned",
        reportedAt: Date.parse("2026-05-03T12:00:00.000Z"),
        source: "legacy",
        submilestoneKey: child.key,
        warnings: [],
      });
      const repairedId = await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: build._id,
        command: "updateActiveBuildSubmilestoneProgress",
        createdAt: Date.now(),
        entityId: String(build._id),
        entityType: "activeBuild",
        eventType: "active_build.submilestone.progress_updated",
        newState: JSON.stringify({ buildSubmilestoneId: String(child._id) }),
        organizationId: build.organizationId,
        warnings: [],
      });
      const eventIdPayloadId = await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "recordMilestoneStart",
        createdAt: Date.now() + 1,
        entityId: String(build._id),
        entityType: "activeBuild",
        eventType: "milestone.started",
        newState: JSON.stringify({
          eventId: String(startEventId),
          milestoneKey: milestone.key,
          submilestoneKey: child.key,
        }),
        organizationId: build.organizationId,
        warnings: [],
      });
      const keyPayloadId = await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "recordMilestoneStart",
        createdAt: Date.now() + 2,
        entityId: String(build._id),
        entityType: "activeBuild",
        eventType: "milestone.started",
        newState: JSON.stringify({
          milestoneKey: milestone.key,
          submilestoneKey: child.key,
        }),
        organizationId: build.organizationId,
        warnings: [],
      });
      const legacyLifecycleIds: Record<string, any> = {};
      for (const lifecycle of [
        {
          command: "correctMilestoneStart",
          eventType: "milestone.start_corrected",
          key: "corrected",
        },
        {
          command: "retractMilestoneStart",
          eventType: "milestone.start_retracted",
          key: "retracted",
        },
      ]) {
        legacyLifecycleIds[lifecycle.key] = await ctx.db.insert(
          "auditEvents",
          {
            actorRoles: ["admin"],
            actorWorkosUserId: "user_admin",
            brokerageId: build.brokerageId,
            buildId: build._id,
            command: lifecycle.command,
            createdAt: Date.now() + 3,
            entityId: String(child._id),
            entityType: "buildSubmilestone",
            eventType: lifecycle.eventType,
            newState: JSON.stringify({
              milestoneKey: milestone.key,
              submilestoneKey: child.key,
            }),
            organizationId: build.organizationId,
            warnings: [],
          },
        );
      }
      const specializedResourceIds: Record<string, any> = {};
      for (const resourceType of [
        "evidence",
        "material",
        "contractor",
        "siteVisit",
      ]) {
        specializedResourceIds[resourceType] = await ctx.db.insert(
          "auditEvents",
          {
            actorRoles: ["admin"],
            actorWorkosUserId: "user_admin",
            brokerageId: build.brokerageId,
            command: `legacyChild${resourceType}`,
            createdAt: Date.now() + 2,
            entityId: String(build._id),
            entityType: "activeBuild",
            eventType: `active_build.submilestone.${resourceType}_changed`,
            newState: JSON.stringify({
              buildSubmilestoneId: String(child._id),
            }),
            organizationId: build.organizationId,
            resourceType,
            warnings: [],
          },
        );
      }
      const legacyChildResourceIds: Record<string, any> = {};
      for (const legacyChildResource of [
        {
          command: "addActiveBuildSubmilestoneEvidence",
          eventType: "active_build.submilestone.evidence_added",
          key: "evidence",
        },
        {
          command: "approveActiveBuildSubmilestone",
          eventType: "active_build.submilestone.review.approved",
          key: "review",
        },
        {
          command: "waiveActiveBuildSubmilestoneSiteVisit",
          eventType: "active_build.submilestone.site_visit.waived",
          key: "siteVisit",
        },
      ]) {
        legacyChildResourceIds[legacyChildResource.key] = await ctx.db.insert(
          "auditEvents",
          {
            actorRoles: ["admin"],
            actorWorkosUserId: "user_admin",
            brokerageId: build.brokerageId,
            buildId: build._id,
            command: legacyChildResource.command,
            createdAt: Date.now() + 3,
            entityId: String(child._id),
            entityType: "buildSubmilestone",
            eventType: legacyChildResource.eventType,
            newState: JSON.stringify({
              milestoneKey: milestone.key,
              submilestoneKey: child.key,
            }),
            organizationId: build.organizationId,
            warnings: [],
          },
        );
      }
      const unknownChildResourceId = await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: build._id,
        command: "legacyChildUnknownChange",
        createdAt: Date.now() + 4,
        entityId: String(child._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.unmapped_change",
        newState: JSON.stringify({
          milestoneKey: milestone.key,
          submilestoneKey: child.key,
        }),
        organizationId: build.organizationId,
        warnings: [],
      });
      const mismatchedTenantId = await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "foreignTenantAudit",
        createdAt: Date.now(),
        entityId: String(child._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.foreign_tenant",
        organizationId: "org_foreign_tenant",
        warnings: [],
      });
      return {
        childId: child._id,
        eventIdPayloadId,
        keyPayloadId,
        legacyLifecycleIds,
        mismatchedTenantId,
        repairedId,
        legacyChildResourceIds,
        unknownChildResourceId,
        specializedResourceIds,
      };
    });

    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean } =
        await admin.mutation(
          (internal as any).audit_event_migrations.backfillAuditEventBuildId,
          { batchSize: 25, cursor, dryRun: false, oneBatchOnly: true },
        );
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(ids.repairedId);
        return {
          buildId: event?.buildId,
          entityId: event?.entityId,
          entityType: event?.entityType,
          resourceType: event?.resourceType,
        };
      }),
    ).resolves.toEqual({
      buildId: closing.buildId,
      entityId: String(ids.childId),
      entityType: "buildSubmilestone",
      resourceType: "submilestone",
    });
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(ids.mismatchedTenantId);
        return { buildId: event?.buildId, resourceType: event?.resourceType };
      }),
    ).resolves.toEqual({ buildId: undefined, resourceType: undefined });

    await expect(
      admin.run(async (ctx: any) => {
        const events = await Promise.all([
          ctx.db.get(ids.eventIdPayloadId),
          ctx.db.get(ids.keyPayloadId),
        ]);
        return events.map((event: any) => ({
          buildId: event?.buildId,
          entityId: event?.entityId,
          entityType: event?.entityType,
          resourceType: event?.resourceType,
        }));
      }),
    ).resolves.toEqual([
      {
        buildId: closing.buildId,
        entityId: String(ids.childId),
        entityType: "buildSubmilestone",
        resourceType: "submilestone",
      },
      {
        buildId: closing.buildId,
        entityId: String(ids.childId),
        entityType: "buildSubmilestone",
        resourceType: "submilestone",
      },
    ]);
    await expect(
      admin.run(async (ctx: any) =>
        Promise.all(
          Object.entries(ids.legacyLifecycleIds).map(
            async ([lifecycle, eventId]) => {
              const event = await ctx.db.get(eventId);
              return {
                lifecycle,
                command: event?.command,
                eventType: event?.eventType,
                entityType: event?.entityType,
                resourceType: event?.resourceType,
              };
            },
          ),
        ),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          lifecycle: "corrected",
          command: "correctMilestoneStart",
          eventType: "milestone.start_corrected",
          entityType: "buildSubmilestone",
          resourceType: "submilestone",
        },
        {
          lifecycle: "retracted",
          command: "retractMilestoneStart",
          eventType: "milestone.start_retracted",
          entityType: "buildSubmilestone",
          resourceType: "submilestone",
        },
      ]),
    );
    const migratedHistory = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(migratedHistory.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "recordMilestoneStart",
          eventType: "milestone.started",
          entityType: "buildSubmilestone",
          canonicalTarget: {
            kind: "submilestone",
            submilestoneId: String(ids.childId),
          },
        }),
        expect.objectContaining({
          command: "correctMilestoneStart",
          eventType: "milestone.start_corrected",
          entityType: "buildSubmilestone",
          canonicalTarget: {
            kind: "submilestone",
            submilestoneId: String(ids.childId),
          },
        }),
        expect.objectContaining({
          command: "retractMilestoneStart",
          eventType: "milestone.start_retracted",
          entityType: "buildSubmilestone",
          canonicalTarget: {
            kind: "submilestone",
            submilestoneId: String(ids.childId),
          },
        }),
      ]),
    );
    await expect(
      admin.run(async (ctx: any) =>
        Promise.all(
          Object.entries(ids.specializedResourceIds).map(
            async ([resourceType, eventId]) => {
              const event = await ctx.db.get(eventId);
              return {
                resourceType,
                entityId: event?.entityId,
                entityType: event?.entityType,
                storedResourceType: event?.resourceType,
              };
            },
          ),
        ),
      ),
    ).resolves.toEqual(
      expect.arrayContaining(
        ["evidence", "material", "contractor", "siteVisit"].map(
          (resourceType) => ({
            resourceType,
            entityId: String(ids.childId),
            entityType: "buildSubmilestone",
            storedResourceType: resourceType,
          }),
        ),
      ),
    );
    await expect(
      admin.run(async (ctx: any) =>
        Promise.all(
          Object.entries(ids.legacyChildResourceIds).map(
            async ([resourceType, eventId]) => {
              const event = await ctx.db.get(eventId);
              return {
                resourceType,
                command: event?.command,
                eventType: event?.eventType,
                storedResourceType: event?.resourceType,
              };
            },
          ),
        ),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          resourceType: "evidence",
          command: "addActiveBuildSubmilestoneEvidence",
          eventType: "active_build.submilestone.evidence_added",
          storedResourceType: "evidence",
        },
        {
          resourceType: "review",
          command: "approveActiveBuildSubmilestone",
          eventType: "active_build.submilestone.review.approved",
          storedResourceType: "evidence",
        },
        {
          resourceType: "siteVisit",
          command: "waiveActiveBuildSubmilestoneSiteVisit",
          eventType: "active_build.submilestone.site_visit.waived",
          storedResourceType: "siteVisit",
        },
      ]),
    );
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(ids.unknownChildResourceId);
        return event?.resourceType;
      }),
    ).resolves.toBeNull();

    const ambiguousId = await admin.run(async (ctx: any) => {
      const child = await ctx.db.get(ids.childId);
      const build = await ctx.db.get(closing.buildId);
      if (!(child && build)) {
        throw new Error("Ambiguous migration fixture is unavailable.");
      }
      const { _id: _childId, _creationTime: _createdAt, ...childFields } = child;
      await ctx.db.insert("buildSubmilestones", {
        ...childFields,
        name: "Duplicate Forms",
      });
      return ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "legacyAmbiguousChildExecution",
        createdAt: Date.now() + 3,
        entityId: String(build._id),
        entityType: "activeBuild",
        eventType: "active_build.submilestone.execution_updated",
        newState: JSON.stringify({
          milestoneKey: child.milestoneKey,
          submilestoneKey: child.key,
        }),
        organizationId: build.organizationId,
        warnings: [],
      });
    });
    const ambiguousReplay = await admin.mutation(
      (internal as any).audit_event_migrations.backfillAuditEventBuildId,
      { batchSize: 25, cursor: null, dryRun: false, oneBatchOnly: true },
    );
    expect(ambiguousReplay.processed).toBeGreaterThan(0);
    await expect(
      admin.run(async (ctx: any) => {
        const event = await ctx.db.get(ambiguousId);
        return {
          buildId: event?.buildId,
          entityId: event?.entityId,
          entityType: event?.entityType,
          resourceType: event?.resourceType,
        };
      }),
    ).resolves.toEqual({
      buildId: closing.buildId,
      entityId: String(closing.buildId),
      entityType: "activeBuild",
      resourceType: undefined,
    });

    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_ambiguous_child_milestone_only",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ milestone: { canView: true } }),
        staffWorkosUserId: "user_ambiguous_child_milestone_only",
        workosOrganizationId: ORG,
      },
    );
    const milestoneOnlyStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_ambiguous_child_milestone_only",
    );
    const milestoneOnlyDetail = await milestoneOnlyStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      milestoneOnlyDetail.auditEvents.some(
        (event: any) => event.command === "legacyAmbiguousChildExecution",
      ),
    ).toBe(false);

    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_legacy_child_submilestone_only",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_legacy_child_submilestone_only",
        workosOrganizationId: ORG,
      },
    );
    const legacyChildStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_legacy_child_submilestone_only",
    );
    const submilestoneOnlyDetail = await legacyChildStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      submilestoneOnlyDetail.auditEvents.some((event: any) =>
        [
          "addActiveBuildSubmilestoneEvidence",
          "approveActiveBuildSubmilestone",
          "waiveActiveBuildSubmilestoneSiteVisit",
        ].includes(event.command),
      ),
    ).toBe(false);

    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          evidence: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_legacy_child_submilestone_only",
        workosOrganizationId: ORG,
      },
    );
    const compoundDetail = await legacyChildStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      compoundDetail.auditEvents.map((event: any) => event.command),
    ).toEqual(
      expect.arrayContaining([
        "addActiveBuildSubmilestoneEvidence",
        "approveActiveBuildSubmilestone",
        "waiveActiveBuildSubmilestoneSiteVisit",
      ]),
    );
  });

  test("scopes active-build audit events before applying the 100-event cap", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const target = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Scoped target build",
      submilestones: [{ key: "forms", name: "Target forms", order: 1 }],
    });
    const crowded = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Crowded unrelated build",
    });
    const targetChild = await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(target.buildId);
      const row = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", target.buildId))
        .unique();
      const crowdedBuild = await ctx.db.get(crowded.buildId);
      if (!(build && row && crowdedBuild)) {
        throw new Error("Scoped audit crowding fixture is unavailable.");
      }
      const now = Date.now();
      for (let index = 0; index < 125; index += 1) {
        await ctx.db.insert("auditEvents", {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          brokerageId: crowdedBuild.brokerageId,
          buildId: crowded.buildId,
          command: "crowdUnrelatedBuildAudit",
          createdAt: now + index,
          entityId: String(crowdedBuild._id),
          entityType: "activeBuild",
          eventType: "active_build.crowded_unrelated_event",
          organizationId: crowdedBuild.organizationId,
          reason: "Crowded unrelated build",
          warnings: [],
        });
      }
      await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        buildId: target.buildId,
        command: "reviewActiveBuildSubmilestone",
        createdAt: now + 1_000,
        entityId: String(row._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.scoped_reviewed",
        resourceType: "submilestone",
        organizationId: build.organizationId,
        reason: "Target child event",
        warnings: [],
      });
      return row;
    });

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(target.buildId), workosOrganizationId: ORG },
    );

    expect(detail.auditEvents.length).toBeLessThanOrEqual(100);
    expect(
      detail.auditEvents.some(
        (event: any) =>
          event.canonicalTarget?.submilestoneId === String(targetChild._id),
      ),
    ).toBe(true);
    expect(
      detail.auditEvents.some(
        (event: any) => event.reason === "Crowded unrelated build",
      ),
    ).toBe(false);
  });

  test("preserves legacy parent and child audit events for the selected Build", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const target = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Legacy audit target build",
      submilestones: [{ key: "forms", name: "Target forms", order: 1 }],
    });
    const unrelated = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Legacy audit unrelated build",
    });

    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(target.buildId);
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", target.buildId).eq("key", "foundation"),
        )
        .unique();
      const child = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", target.buildId))
        .unique();
      const unrelatedMilestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", unrelated.buildId).eq("key", "foundation"),
        )
        .unique();
      if (!(build && milestone && child && unrelatedMilestone)) {
        throw new Error("Legacy audit preservation fixture is unavailable.");
      }
      const common = {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "legacyAuditProbe",
        createdAt: Date.now(),
        organizationId: build.organizationId,
        warnings: [],
      };
      await ctx.db.insert("auditEvents", {
        ...common,
        entityId: String(milestone._id),
        entityType: "buildMilestone",
        eventType: "legacy.parent.audit",
        resourceType: "milestone",
        newState: JSON.stringify({ status: "in_progress" }),
      });
      await ctx.db.insert("auditEvents", {
        ...common,
        entityId: String(child._id),
        entityType: "buildSubmilestone",
        eventType: "legacy.child.audit",
        resourceType: "submilestone",
        newState: JSON.stringify({ status: "complete" }),
        reason: "Legacy child audit remains visible.",
      });
      await ctx.db.insert("auditEvents", {
        ...common,
        entityId: String(unrelatedMilestone._id),
        entityType: "buildMilestone",
        eventType: "legacy.unrelated.audit",
      });
    });

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(target.buildId), workosOrganizationId: ORG },
    );

    expect(detail.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "legacy.parent.audit" }),
        expect.objectContaining({ eventType: "legacy.child.audit" }),
      ]),
    );
    expect(
      detail.auditEvents.some(
        (event: any) => event.eventType === "legacy.unrelated.audit",
      ),
    ).toBe(false);
  });

  test("filters same-Build irrelevant audits before applying the 100-event cap", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const target = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Same-build audit target",
      submilestones: [{ key: "forms", name: "Target forms", order: 1 }],
    });

    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(target.buildId);
      const child = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", target.buildId))
        .unique();
      if (!(build && child)) {
        throw new Error("Same-build audit crowding fixture is unavailable.");
      }
      const now = Date.now();
      await ctx.db.insert("auditEvents", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        command: "updateActiveBuildSubmilestoneProgress",
        createdAt: now,
        entityId: String(child._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.progress_updated",
        resourceType: "submilestone",
        organizationId: build.organizationId,
        warnings: [],
      });
      for (let index = 0; index < 525; index += 1) {
        await ctx.db.insert("auditEvents", {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          brokerageId: build.brokerageId,
          buildId: target.buildId,
          command: "costDocumentAuditCrowding",
          createdAt: now + index + 1,
          entityId: `cost-document-${index}`,
          entityType: "costDocument",
          eventType: "same_build.irrelevant_cost_document",
          resourceType: "material",
          organizationId: build.organizationId,
          warnings: [],
        });
      }
    });

    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean } =
        await admin.mutation(
          (internal as any).audit_event_migrations.backfillAuditEventBuildId,
          { batchSize: 25, cursor, dryRun: false, oneBatchOnly: true },
        );
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(target.buildId), workosOrganizationId: ORG },
    );

    expect(detail.auditEvents.length).toBeLessThanOrEqual(100);
    expect(
      detail.auditEvents.some(
        (event: any) =>
          event.eventType === "active_build.submilestone.progress_updated",
      ),
    ).toBe(true);
    expect(
      detail.auditEvents.some(
        (event: any) => event.eventType === "same_build.irrelevant_cost_document",
      ),
    ).toBe(false);
  });

  test("projects build quick actions from unresolved domain state instead of audit payloads", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 50_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 30,
        expectedRevision: 0,
        idempotencyKey: "quick-action-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );

    expect(detail.quickActionEvents).toEqual([
      expect.objectContaining({
        actionLabel: "Review milestone",
        entityLabel: expect.stringContaining("Foundation"),
        entityType: "milestone",
        href: expect.stringMatching(/^\/backoffice\/builds\//),
        resolutionMode: "domain",
        sourceLabel: "Builder workspace",
        title: "Milestone completion awaiting review",
      }),
    ]);
    expect(JSON.stringify(detail.quickActionEvents)).not.toMatch(
      /payloadPreview|eventType|requestId|stack|validator|mutation/i,
    );
  });

  test("active build detail and timeline queries share one milestone summary contract for lifecycle, submilestones, assignments, and financial labels", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Canonical milestone summary build",
      location: "18 Canonical Summary Lane",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "canonical-summary-contractor@example.com",
        name: "Canonical Summary Concrete",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 47_500_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        fieldNote: "Forms stripped and dimensions verified.",
        expectedRevision: 0,
        idempotencyKey: "summary-forms-completion-001",
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 48_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 1,
        idempotencyKey: "summary-milestone-completion-001",
        milestoneKey: "foundation",
        note: "Builder submitted the foundation package.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const timeline = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const detailMilestone = detail.milestones.find(
      (milestone: any) => milestone.key === "foundation",
    );
    const timelineMilestone = timeline.milestones.find(
      (milestone: any) => milestone.milestoneKey === "foundation",
    );
    const assignmentCount = detail.milestoneContractorAssignments.filter(
      (assignment: any) => assignment.milestoneKey === "foundation",
    ).length;

    expect(detailMilestone).toBeTruthy();
    expect(detailMilestone.budgetCents).not.toBeUndefined();
    expect(detailMilestone.drawAvailabilityCents).not.toBeUndefined();
    expect(timelineMilestone).toMatchObject({
      budgetCents: detailMilestone.budgetCents,
      drawAvailabilityCents: detailMilestone.drawAvailabilityCents,
      submilestoneSnapshot: [
        expect.objectContaining({
          canonicalId: String(detail.submilestones[0]._id),
          key: "forms",
          name: "Forms",
        }),
      ],
    });
    expect(assignmentCount).toBe(1);
    expect(timelineMilestone).toMatchObject({
      assignmentCount,
      assignmentCoverage: "assigned",
      completedSubmilestoneCount: 1,
      lifecycleState: "completion_submitted",
      reconciliationIssues: [],
      reconciliationState: "consistent",
      submilestoneSnapshot: [
        expect.objectContaining({ key: "forms", status: "complete" }),
      ],
      totalSubmilestoneCount: 1,
    });
  });

  test("reconciles parent milestone progress after a field-only submilestone update", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Field progress reconciliation build",
      location: "19 Progress Reconciliation Lane",
      submilestones: [
        { key: "forms", name: "Forms", order: 1 },
        { key: "waterproofing", name: "Waterproofing", order: 2 },
      ],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "progress-reconciliation-forms-001",
        milestoneKey: "foundation",
        progressPercent: 100,
        status: "complete",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const afterFirstCompletion = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      afterFirstCompletion.milestones.find(
        (milestone: any) => milestone.key === "foundation",
      ).progressPercent,
    ).toBe(50);
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-05-03T12:00:00.000Z"),
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "progress-reconciliation-waterproofing-start-001",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "waterproofing",
        workosOrganizationId: ORG,
      },
    );

    const expectedRevision = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      await ctx.db.patch(milestone._id, { progressPercent: 0 });
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .filter((query: any) => query.eq(query.field("key"), "waterproofing"))
        .unique();
      return submilestone.workflowRevision ?? 0;
    });

    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
      {
        buildId: closing.buildId,
        expectedRevision,
        idempotencyKey: "progress-reconciliation-waterproofing-001",
        milestoneKey: "foundation",
        progressPercent: 25,
        submilestoneKey: "waterproofing",
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      detail.milestones.find((milestone: any) => milestone.key === "foundation")
        .progressPercent,
    ).toBe(50);
  });

  test("milestone completion is gated by persisted submilestone execution state", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Strict submilestone completion build",
      location: "22 Completion Gate Road",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const completionArgs = {
      actualCostCents: 48_000_000,
      actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
      buildId: closing.buildId,
      completedDay: 20,
      expectedRevision: 0,
      idempotencyKey: "strict-milestone-completion-001",
      milestoneKey: "foundation",
      note: "Foundation ready for review.",
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
        completionArgs,
      ),
    ).rejects.toThrow(/complete every submilestone/i);

    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 47_750_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        fieldNote: "Forms removed; footing measurements match plan.",
        expectedRevision: 0,
        idempotencyKey: "strict-forms-completion-001",
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      { ...completionArgs, expectedRevision: 1 },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.submilestones[0]).toMatchObject({
      actualCostCents: 47_750_000,
      completedAt: expect.any(Number),
      completedByWorkosUserId: "user_builder",
      fieldNote: "Forms removed; footing measurements match plan.",
      status: "complete",
    });
    expect(detail.milestones[0]).toMatchObject({
      completionClaim: expect.objectContaining({
        note: "Foundation ready for review.",
        submittedAt: expect.any(String),
      }),
      progressPercent: 100,
    });
    const childExecutionEvent = detail.auditEvents.find(
      (event: any) =>
        event.eventType === "active_build.submilestone.execution_updated",
    );
    expect(childExecutionEvent).toEqual(
      expect.objectContaining({
        canonicalTarget: {
          kind: "submilestone",
          submilestoneId: String(detail.submilestones[0]._id),
        },
      }),
    );

    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_real_child_audit_limited",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ milestone: { canView: true } }),
        staffWorkosUserId: "user_real_child_audit_limited",
        workosOrganizationId: ORG,
      },
    );
    const limitedStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_real_child_audit_limited",
    );
    const limitedDetail = await limitedStaff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      limitedDetail.auditEvents.some(
        (event: any) =>
          event.eventType === "active_build.submilestone.execution_updated",
      ),
    ).toBe(false);
  });

  test("does not restamp superseded submilestones when an approved timeline update replays", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Planning replay build",
      location: "23 Planning Replay Road",
      submilestones: [
        { key: "forms", name: "Forms", order: 1 },
        { key: "waterproofing", name: "Waterproofing", order: 2 },
      ],
    });
    const update = {
      buildId: closing.buildId,
      milestoneKey: "foundation",
      submilestones: [
        {
          budgetCents: 25_000_000,
          durationDays: 10,
          key: "waterproofing",
          name: "Waterproofing",
          order: 2,
          startDay: 10,
        },
      ],
      workosOrganizationId: ORG,
    };

    await admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      update,
    );
    const first = await admin.run(async (ctx: any) => {
      const superseded = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .filter((query: any) => query.eq(query.field("key"), "forms"))
        .unique();
      const revision = await ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .order("desc")
        .first();
      return { revision, superseded };
    });
    expect(first.revision).toBeDefined();
    expect(first.superseded).toMatchObject({
      planningState: "superseded",
      supersededByPlanningRevision: first.revision?.revision,
    });

    await admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      update,
    );
    const replay = await admin.run(async (ctx: any) => {
      const superseded = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .filter((query: any) => query.eq(query.field("key"), "forms"))
        .unique();
      const revision = await ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .order("desc")
        .first();
      return { revision, superseded };
    });
    expect(replay.revision?._id).toBe(first.revision?._id);
    expect(replay.superseded).toMatchObject({
      planningState: "superseded",
      supersededByPlanningRevision: first.revision?.revision,
    });
  });

  test("site visit token mutations reject cross-build and cross-org mismatches before mutation while keeping visit identity bound", async () => {
    const otherOrg = "org_production_site_visit_other";
    const { seed, t } = await seeded(["admin"], "user_admin");
    const otherSeeded = await seeded(
      ["admin"],
      "user_admin_site_visit_other",
      otherOrg,
    );
    const primary = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Primary token build",
      location: "27 Primary Token Way",
    });
    const secondary = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Secondary token build",
      location: "29 Secondary Token Way",
    });
    const foreign = await createClosedSingleMilestoneBuild(
      otherSeeded.t,
      otherSeeded.seed,
      {
        buildName: "Foreign token build",
        location: "31 Foreign Token Way",
        workosOrganizationId: otherOrg,
      },
    );
    const primaryVisit = await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: primary.buildId,
        idempotencyKey: "assign-site-visit-primary-token",
        milestoneKey: "foundation",
        note: "Inspect the primary build only.",
        requestedDay: 21,
        workosOrganizationId: ORG,
      },
    );

    const primaryTokenState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(primary.buildId),
        token: primaryVisit.visitId,
      },
    );
    const crossBuildState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(secondary.buildId),
        token: primaryVisit.visitId,
      },
    );
    const crossOrgState = await otherSeeded.t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(foreign.buildId),
        token: primaryVisit.visitId,
      },
    );

    expect(primaryTokenState).toMatchObject({
      available: true,
      build: {
        key: String(primary.buildId),
        name: "Primary token build",
        subtitle: "27 Primary Token Way",
      },
    });
    expect(primaryTokenState.targets).toEqual([
      expect.objectContaining({ milestoneKey: "foundation" }),
    ]);
    expect(primaryTokenState.visit).toMatchObject({
      evidencePackageId: primaryVisit.evidencePackageId,
      organizationId: ORG,
      workOrderId: primaryVisit.workOrderId,
    });
    expect(primaryVisit).toMatchObject({
      evidencePackageId: `EP-${String(primary.buildId)}-foundation`,
      workOrderId: `WO-${primaryVisit.visitId}`,
    });
    const visitDocumentId = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      await ctx.db.patch(visit._id, { workOrderId: "WO-tampered" });
      return visit._id;
    });
    const tamperedScopeState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      { buildId: String(primary.buildId), token: primaryVisit.visitId },
    );
    expect(tamperedScopeState).toMatchObject({
      available: false,
      reason: "not_found",
      status: "invalid",
    });
    await t.run((ctx: any) =>
      ctx.db.patch(visitDocumentId, { workOrderId: primaryVisit.workOrderId }),
    );
    expect(crossBuildState.available).toBe(false);
    expect(crossOrgState.available).toBe(false);

    await expect(
      t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(primary.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason: "Location permission was unavailable.",
            permissionOutcome: "denied",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "needs_information",
          reportNotes: "<p>Valid visit without uploaded evidence.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/uploaded evidence file is required/i);
    expect(
      await t.query(
        (api as any).production_proposals.getActiveBuildSiteVisitByToken,
        {
          buildId: String(primary.buildId),
          token: primaryVisit.visitId,
        },
      ),
    ).toMatchObject({ available: true });

    const before = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(primary.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType ===
            "active_build.site_visit.token_report_submitted",
        ).length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType ===
              "active_build.site_visit.token_report_submitted" &&
            String(event.relatedEntityId) === String(primary.buildId),
        ).length,
        visit,
      };
    });

    await expect(
      t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(secondary.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason:
              "Location was not attempted for this invalid request.",
            permissionOutcome: "not_requested",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "approve",
          reportNotes: "<p>Wrong build tamper attempt.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/site visit token/i);
    await expect(
      otherSeeded.t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(foreign.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason:
              "Location was not attempted for this invalid request.",
            permissionOutcome: "not_requested",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "approve",
          reportNotes: "<p>Wrong org tamper attempt.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/site visit token/i);

    const after = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(primary.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType ===
            "active_build.site_visit.token_report_submitted",
        ).length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType ===
              "active_build.site_visit.token_report_submitted" &&
            String(event.relatedEntityId) === String(primary.buildId),
        ).length,
        visit,
      };
    });

    expect(after.auditCount).toBe(before.auditCount);
    expect(after.outboxCount).toBe(before.outboxCount);
    expect(after.visit).toMatchObject({
      _id: before.visit?._id,
      buildId: primary.buildId,
      milestoneKey: "foundation",
      status: before.visit?.status,
      url: before.visit?.url,
      visitId: primaryVisit.visitId,
    });
  });

  test("preserves unassigned site-visit uploads and routes review without automating a collaboration post", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const {
      evidence,
      missingStorageId,
      supersededStorageId,
    } = await seedUnassignedSiteVisitEvidence(admin, seed, {
      collaborationStatus: "active",
    });
    expect(
      await admin.run(async (ctx: any) =>
        Boolean(await ctx.storage.get(supersededStorageId)),
      ),
    ).toBe(true);
    expect(
      await admin.run(async (ctx: any) =>
        Boolean(await ctx.storage.get(missingStorageId)),
      ),
    ).toBe(true);
    expect(evidence.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientEvidenceId: "superseded-target-evidence",
          milestoneKey: "foundation",
          storageId: supersededStorageId,
        }),
        expect.objectContaining({
          clientEvidenceId: "missing-target-evidence",
          milestoneKey: "foundation",
          storageId: missingStorageId,
        }),
      ]),
    );
    expect(
      evidence.assets
        .filter((asset: any) =>
          ["superseded-target-evidence", "missing-target-evidence"].includes(
            asset.clientEvidenceId,
          ),
        )
        .every((asset: any) => asset.submilestoneKey === undefined),
    ).toBe(true);
    expect(evidence.targetReviewPost).toBeUndefined();
    expect(evidence.revision).toBeNull();
    expect(evidence.reviewDelivery).toMatchObject({
      actionRequired: true,
      sourceLabel: "Site Visit Staff",
      title: "Site Visit Evidence needs assignment",
    });
  });

  test("falls back to backoffice delivery when the Build Collaboration reader scope is disabled", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const { evidence } = await seedUnassignedSiteVisitEvidence(admin, seed, {
      collaborationStatus: "disabled",
    });
    expect(evidence.tenantSetting).toMatchObject({ status: "disabled" });
    expect(evidence.targetReviewPost).toBeUndefined();
    expect(evidence.revision).toBeNull();
    expect(evidence.reviewDelivery).toMatchObject({
      actionRequired: true,
      sourceLabel: "Site Visit Staff",
      title: "Site Visit Evidence needs assignment",
    });
  });

  test("starts active-build milestone work explicitly with audit history", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Explicit work start active build",
        location: "12 Start Work Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "start-work-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to close.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-05-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
    });

    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T14:30:00.000Z");
    const startArgs = {
      actualStartedAt,
      buildId: closing.buildId,
      expectedRevision: 0,
      idempotencyKey: "test-foundation-start-001",
      milestoneKey: "foundation",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };
    const firstResult = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startArgs,
    );
    const replayResult = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      { ...startArgs, expectedRevision: 99 },
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(firstResult).toMatchObject({ replayed: false, revision: 1 });
    expect(replayResult).toEqual({ ...firstResult, replayed: true });
    expect(detail.milestones[0]).toMatchObject({
      actualStartedAt,
      startReportedAt: expect.any(Number),
      startedByWorkosUserId: "user_builder",
      startSource: "milestone_detail",
      status: "in_progress",
    });
    expect(detail.milestones[0].progressPercent).toBeUndefined();
    expect(detail.milestones[0].evidenceState).toBeUndefined();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "milestone.started",
    );
    await t.run(async (ctx: any) => {
      const startEvents = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_organization_idempotency", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("idempotencyKey", "test-foundation-start-001"),
        )
        .collect();
      const outboxEvents = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("relatedEntityType", "activeBuild")
            .eq("relatedEntityId", String(closing.buildId)),
        )
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toMatchObject({
        actualStartedAt,
        actorWorkosUserId: "user_builder",
        eventType: "started",
        milestoneKey: "foundation",
        source: "milestone_detail",
        workflowRevision: 1,
      });
      const startOutboxEvents = outboxEvents.filter(
        (event: any) => event.eventType === "milestone.started",
      );
      expect(startOutboxEvents).toHaveLength(1);
      expect(JSON.parse(startOutboxEvents[0].payloadPreview)).toMatchObject({
        workflowRevision: 1,
      });
      const startAuditEvents = auditEvents.filter(
        (event: any) => event.eventType === "milestone.started",
      );
      expect(startAuditEvents).toHaveLength(1);
      expect(JSON.parse(startAuditEvents[0].newState)).toMatchObject({
        workflowRevision: 1,
      });
    });

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(workspace.milestones[0]).toMatchObject({
      milestoneKey: "foundation",
      status: "ready",
      tone: "warning",
    });
  });

  test("records backdated dependency exceptions without rewriting the roadmap and routes lender attention", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Dependency exception build",
      milestones: [
        {
          budgetCents: 20_000_000,
          dayEnd: 10,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 10,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [],
        },
        {
          budgetCents: 30_000_000,
          dayEnd: 20,
          dayStart: 11,
          dependencyKeys: ["foundation"],
          durationDays: 10,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [],
        },
        {
          budgetCents: 15_000_000,
          dayEnd: 30,
          dayStart: 21,
          dependencyKeys: ["foundation"],
          durationDays: 10,
          key: "roofing",
          name: "Roofing",
          order: 3,
          submilestones: [],
        },
      ],
    });
    await grantOrgMembership(admin, {
      roleSlugs: ["broker-staff"],
      subject: "user_broker_staff",
    });
    await grantOrgMembership(admin, {
      roleSlugs: ["agent"],
      subject: "user_agent",
    });
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: undefined,
      });
      await ctx.db.patch(build.brokerageId, {
        principalBrokerWorkosUserId: undefined,
      });
      const assignments = await ctx.db
        .query("buildBrokerAssignments")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      for (const assignment of assignments) {
        await ctx.db.delete(assignment._id);
      }
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-04T09:00:00.000Z");
    const input = {
      actualStartedAt,
      buildId: closing.buildId,
      expectedRevision: 0,
      idempotencyKey: "framing-dependency-start-001",
      milestoneKey: "framing",
      source: "gantt" as const,
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        input,
      ),
    ).rejects.toThrow(/explain why work began/i);
    const serverNow = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(serverNow);
    try {
      await expect(
        builder.mutation(
          (api as any).production_proposals.startActiveBuildMilestone,
          {
            ...input,
            actualStartedAt: serverNow + 1,
            dependencyOverrideReason: "Crew mobilized out of sequence.",
            idempotencyKey: "framing-future-start-001",
          },
        ),
      ).rejects.toThrow(/now or earlier/i);
    } finally {
      dateNow.mockRestore();
    }

    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        ...input,
        dependencyOverrideReason:
          "Crew mobilized while foundation inspection paperwork was closing.",
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          ...input,
          dependencyOverrideReason:
            "A different explanation must not reuse the original command key.",
        },
      ),
    ).rejects.toThrow(/idempotency key belongs to a different/i);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      detail.milestones.find((row: any) => row.key === "framing"),
    ).toMatchObject({
      actualStartedAt,
      dayStart: 11,
      status: "in_progress",
    });
    expect(
      detail.milestones.find((row: any) => row.key === "framing")
        .progressPercent,
    ).toBeUndefined();
    expect(
      detail.milestones.find((row: any) => row.key === "foundation"),
    ).toMatchObject({
      dayStart: 0,
      status: "planned",
    });
    const brokerStaff = withIdentity(
      base,
      ["broker-staff"],
      "user_broker_staff",
    );
    const inbox = await brokerStaff.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        actionRequired: true,
        entityId: String(closing.buildId),
        title: "Framing started out of sequence",
      }),
    ]);
    const agent = withIdentity(base, ["agent"], "user_agent");
    const agentInbox = await agent.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(agentInbox.deliveries).toHaveLength(0);

    await admin.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (query: any) =>
          query.eq("workosOrganizationId", ORG),
        )
        .collect();
      for (const membership of memberships) {
        await ctx.db.delete(membership._id);
      }
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_departed_broker",
      });
      await ctx.db.patch(build.brokerageId, {
        principalBrokerWorkosUserId: undefined,
      });
      const now = Date.now();
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "test_membership_user_departed_broker",
        sourceEventType: "test.production_proposals",
        status: "inactive",
        updatedAt: now,
        workosMembershipId: "test_membership_user_departed_broker",
        workosOrganizationId: ORG,
        workosUserId: "user_departed_broker",
      });
    });
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt,
        buildId: closing.buildId,
        expectedRevision: 0,
        dependencyOverrideReason:
          "Roof crew mobilized while foundation closeout was pending.",
        idempotencyKey: "roofing-dependency-fallback-001",
        milestoneKey: "roofing",
        source: "gantt",
        workosOrganizationId: ORG,
      },
    );
    const fallback = await admin.run(async (ctx: any) =>
      ctx.db
        .query("operationsQueueHandoffs")
        .filter((query: any) => query.eq(query.field("organizationId"), ORG))
        .first(),
    );
    expect(fallback).toMatchObject({
      acknowledgementState: "pending_decision",
      requiredAction: "Review dependency exception",
      targetLabel: "Dependency exception build · Roofing",
    });
  });

  test("starts a builder submilestone with its planned parent atomically and preserves correction lineage", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const initialStart = Date.parse("2026-05-03T08:00:00.000Z");
    const started = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: initialStart,
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "forms-parent-child-start-001",
        milestoneKey: "foundation",
        source: "submilestone_ledger",
        startParent: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(started).toMatchObject({
      parentStarted: true,
      submilestoneKey: "forms",
    });
    expect(started.eventIds).toHaveLength(2);
    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: initialStart,
          buildId: closing.buildId,
          expectedRevision: 0,
          idempotencyKey: "forms-parent-child-start-001",
          milestoneKey: "foundation",
          source: "submilestone_ledger",
          startParent: false,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/idempotency key belongs to a different/i);

    const correctedStart = Date.parse("2026-05-02T15:00:00.000Z");
    const firstCorrection = await builder.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      {
        actualStartedAt: correctedStart,
        buildId: closing.buildId,
        expectedRevision: 1,
        idempotencyKey: "forms-start-correction-001",
        milestoneKey: "foundation",
        reason: "Crew log confirmed an earlier mobilization time.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const correctionReplay = await builder.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      {
        actualStartedAt: correctedStart,
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "forms-start-correction-001",
        milestoneKey: "foundation",
        reason: "Crew log confirmed an earlier mobilization time.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(firstCorrection).toMatchObject({ replayed: false, revision: 2 });
    expect(correctionReplay).toEqual({
      ...firstCorrection,
      replayed: true,
    });
    await builder.mutation(
      (api as any).production_proposals.retractActiveBuildMilestoneStart,
      {
        buildId: closing.buildId,
        expectedRevision: 2,
        idempotencyKey: "forms-start-retraction-001",
        milestoneKey: "foundation",
        reason: "The crew log was attached to the wrong work scope.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestones = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .collect();
      const events = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_target", (query: any) =>
          query
            .eq("buildId", closing.buildId)
            .eq("milestoneKey", "foundation")
            .eq("submilestoneKey", "forms"),
        )
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query: any) =>
          query
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const childAuditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query: any) =>
          query
            .eq("entityType", "buildSubmilestone")
            .eq("entityId", String(submilestones[0]._id)),
        )
        .collect();
      const outboxEvents = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query: any) =>
          query
            .eq("relatedEntityType", "activeBuild")
            .eq("relatedEntityId", String(closing.buildId)),
        )
        .collect();
      const childOutboxEvents = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query: any) =>
          query
            .eq("relatedEntityType", "buildSubmilestone")
            .eq("relatedEntityId", String(submilestones[0]._id)),
        )
        .collect();
      expect(milestone).toMatchObject({
        actualStartedAt: initialStart,
        status: "in_progress",
      });
      expect(submilestones[0]).toMatchObject({ status: "planned" });
      expect(submilestones[0].actualStartedAt).toBeUndefined();
      expect(events.map((event: any) => event.eventType)).toEqual([
        "started",
        "start_corrected",
        "start_retracted",
      ]);
      expect(events[1].originalEventId).toBe(events[0]._id);
      expect(events[2].originalEventId).toBe(events[1]._id);
      expect(
        childAuditEvents
          .filter((event: any) =>
            [
              "submilestone.start_corrected",
              "submilestone.start_retracted",
            ].includes(
              event.eventType,
            ),
          )
          .map((event: any) => JSON.parse(event.newState).workflowRevision),
      ).toEqual([2, 3]);
      expect(
        childOutboxEvents
          .filter((event: any) =>
            [
              "submilestone.start_corrected",
              "submilestone.start_retracted",
            ].includes(
              event.eventType,
            ),
          )
          .map(
            (event: any) =>
              JSON.parse(event.payloadPreview).workflowRevision,
          ),
      ).toEqual([2, 3]);
    });
  });

  test("reserves post-completion start amendments for Lender Admin", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T08:00:00.000Z");
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt,
        buildId: closing.buildId,
        expectedRevision: 0,
        idempotencyKey: "foundation-start-before-completion-001",
        milestoneKey: "foundation",
        source: "milestone_detail",
        workosOrganizationId: ORG,
      },
    );
    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      await ctx.db.patch(milestone._id, { status: "complete" });
    });

    const correction = {
      actualStartedAt: actualStartedAt - 60 * 60 * 1000,
      buildId: closing.buildId,
      expectedRevision: 1,
      idempotencyKey: "foundation-post-completion-correction-001",
      milestoneKey: "foundation",
      reason: "Daily log confirmed an earlier mobilization time.",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };
    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        correction,
      ),
    ).rejects.toThrow(/only Lender Admin/i);
    await admin.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      correction,
    );

    const milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone).toMatchObject({
      actualStartedAt: correction.actualStartedAt,
      status: "complete",
    });
  });

  test("rejects correction commands for milestone and submilestone work that has never started", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const common = {
      actualStartedAt: Date.parse("2026-05-02T15:00:00.000Z"),
      buildId: closing.buildId,
      expectedRevision: 0,
      milestoneKey: "foundation",
      reason: "Daily log correction.",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        {
          ...common,
          idempotencyKey: "never-started-milestone-correction-001",
        },
      ),
    ).rejects.toThrow(/no recorded start to correct/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        {
          ...common,
          idempotencyKey: "never-started-submilestone-correction-001",
          submilestoneKey: "forms",
        },
      ),
    ).rejects.toThrow(/no recorded start to correct/i);
  });

  test("atomically catches up a missing actual start when completion is confirmed", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T08:00:00.000Z");
    const input = {
      actualCostCents: 42_000_000,
      actualStartedAt,
      buildId: closing.buildId,
      completedDay: 12,
      expectedRevision: 0,
      idempotencyKey: "foundation-completion-catch-up-001",
      milestoneKey: "foundation",
      note: "Completion and missing actual start confirmed together.",
      workosOrganizationId: ORG,
    };

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      input,
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      input,
    );

    const state = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const starts = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      const outbox = await ctx.db
        .query("eventOutbox")
        .filter((query: any) => query.eq(query.field("organizationId"), ORG))
        .collect();
      return { milestone, outbox, starts };
    });
    expect(state.milestone).toMatchObject({
      actualStartedAt,
      completionClaim: {
        completedDay: 12,
        idempotencyKey: "foundation-completion-catch-up-001",
      },
      startSource: "completion_catch_up",
    });
    expect(state.starts).toHaveLength(1);
    expect(
      state.outbox.filter(
        (event: any) => event.eventType === "milestone.started",
      ),
    ).toHaveLength(1);
  });

  test("builder can create and attach a contractor to an owned active build", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    const result = await builder.mutation(
      (api as any).production_proposals.createAndAttachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractor: {
          capabilities: [
            {
              capabilityKey: "brick-siding",
              label: "Brick siding",
              trade: "masonry",
            },
          ],
          city: "Toronto",
          defaultPayRateCents: 0,
          defaultPayRateUnit: "hour",
          email: "zepplinf13@gmail.com",
          equipment: [
            { equipmentKey: "telehandler", name: "Telehandler", quantity: 1 },
          ],
          kind: "company",
          name: "TestContractor",
          phone: "416-555-0101",
          trades: ["Masonry"],
        },
        role: "masonry lead.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId: result.contractorId,
        email: "zepplinf13@gmail.com",
        name: "TestContractor",
        role: "masonry lead.",
        trades: ["Masonry"],
      }),
    ]);

    const profile = await admin.run((ctx: any) =>
      ctx.db.get(result.contractorId),
    );
    expect(profile).toMatchObject({
      city: "Toronto",
      normalizedEmail: "zepplinf13@gmail.com",
      source: "builder_created",
      status: "active",
    });
    const activeBuildEvents = await admin.run((ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
    );
    expect(activeBuildEvents.map((event: any) => event.command)).toContain(
      "createAndAttachActiveBuildContractor",
    );
  });

  test("builder can attach an existing production contractor to an owned active build", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        city: "Toronto",
        email: "existing-masonry@example.com",
        kind: "company",
        name: "Existing Masonry Co",
        trades: ["masonry"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Masonry crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "attached",
        name: "Existing Masonry Co",
        role: "Masonry crew",
      }),
    ]);
  });

  test("authorized builder milestone assignment creates one pending acknowledgement and projects the linked contractor lifecycle", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "linked-assignment@example.com",
        kind: "company",
        name: "Linked Assignment Co",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(contractorId, {
        accountWorkosUserId: "user_linked_assignment_contractor",
        onboardingStatus: "account_linked",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "contractor",
        roleSlugs: ["contractor"],
        sourceEventId: "evt_linked_assignment_contractor",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_linked_assignment_contractor",
        workosOrganizationId: ORG,
        workosUserId: "user_linked_assignment_contractor",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const assignmentIds = await builder.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const acknowledgements = await admin.run(async (ctx: any) =>
      ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentIds[0]),
        )
        .collect(),
    );

    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "acknowledgement_pending",
      }),
    ]);
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0]).toMatchObject({
      assignmentType: "build",
      buildAssignmentId: assignmentIds[0],
      contractorId,
      kind: "assignment",
      state: "pending_acknowledgement",
    });
    const initialDeliveries = await admin.run(async (ctx: any) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_linked_assignment_contractor"),
        )
        .collect(),
    );
    expect(initialDeliveries).toEqual([
      expect.objectContaining({
        actionRequired: true,
        entityId: String(assignmentIds[0]),
        entityType: "contractorAssignment",
        status: "unread",
      }),
    ]);

    await builder.mutation(
      (api as any).production_proposals
        .removeActiveBuildContractorFromMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        reason: "Scope reassigned after Builder review.",
        workosOrganizationId: ORG,
      },
    );

    const removedState = await admin.run(async (ctx: any) => {
      const assignment = await ctx.db.get(assignmentIds[0]);
      const acknowledgement = await ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentIds[0]),
        )
        .first();
      const rootAssignment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q: any) =>
          q.eq("buildId", closing.buildId).eq("contractorId", contractorId),
        )
        .unique();
      const deliveries = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_linked_assignment_contractor"),
        )
        .collect();
      return { acknowledgement, assignment, deliveries, rootAssignment };
    });
    expect(removedState.assignment.status).toBe("removed");
    expect(removedState.acknowledgement.state).toBe("resolved");
    expect(removedState.rootAssignment.status).toBe("inactive");
    expect(removedState.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          entityId: String(assignmentIds[0]),
          status: "unread",
          title: "Foundation assignment removed",
        }),
        expect.objectContaining({
          entityId: String(assignmentIds[0]),
          status: "resolved",
        }),
      ]),
    );
    const removedDetail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(removedDetail.milestoneContractorAssignments).toEqual([]);
    expect(removedDetail.milestones[0].assignmentCount).toBe(0);

    const assignmentHistory = await admin.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .filter((q: any) =>
          q.eq(
            q.field("command"),
            "assignActiveBuildContractorToMilestone",
          ),
        )
        .collect(),
    );
    const removalHistory = await admin.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .filter((q: any) =>
          q.eq(
            q.field("command"),
            "removeActiveBuildContractorFromMilestone",
          ),
        )
        .collect(),
    );
    expect(JSON.parse(assignmentHistory.at(-1)!.newState)).toMatchObject({
      assignments: [
        expect.objectContaining({
          assignmentId: assignmentIds[0],
          contractorId,
          role: "Foundation crew",
          status: "active",
        }),
      ],
    });
    expect(JSON.parse(removalHistory.at(-1)!.priorState)).toEqual([
      expect.objectContaining({
        _id: assignmentIds[0],
        contractorId,
        role: "Foundation crew",
        status: "active",
      }),
    ]);
    expect(JSON.parse(removalHistory.at(-1)!.newState)).toMatchObject({
      assignments: [
        expect.objectContaining({
          assignmentId: assignmentIds[0],
          contractorId,
          status: "removed",
        }),
      ],
    });
  });

  test("sub-milestone assignment and removal use canonical revisions and replay receipts", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        {
          budgetCents: 10_000_000,
          durationDays: 5,
          key: "forms",
          name: "Forms",
          order: 1,
        },
      ],
    });
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "scoped-assignment@example.com",
        kind: "company",
        name: "Scoped Assignment Co",
        trades: ["concrete"],
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.linkContractorProfileToWorkosUser,
      {
        contractorId,
        workosOrganizationId: ORG,
        workosUserId: "user_scoped_assignment_contractor",
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");
    const assignArgs = {
      buildId: closing.buildId,
      contractorId,
      expectedRevision: 0,
      idempotencyKey: "scoped-assignment-001",
      milestoneKey: "foundation",
      role: "Forms crew",
      submilestoneKeys: ["forms"],
      workosOrganizationId: ORG,
    };
    const assignmentIds = await builder.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      assignArgs,
    );
    expect(assignmentIds).toHaveLength(1);
    const assignedTarget = await builder.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .filter((q: any) => q.eq(q.field("key"), "forms"))
        .unique();
      return {
        id: submilestone._id,
        key: submilestone.key,
        workflowRevision: submilestone.workflowRevision ?? 0,
      };
    });
    expect(assignedTarget.workflowRevision).toBe(1);

    const assignmentAuditAndReceipt = await builder.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "buildSubmilestone")
            .eq("entityId", String(assignedTarget.id)),
        )
        .filter((q: any) =>
          q.eq(q.field("command"), "assignActiveBuildContractorToMilestone"),
        )
        .collect();
      const receipts = await ctx.db
        .query("buildSubmilestoneCommandReceipts")
        .withIndex("by_submilestone_idempotency", (q: any) =>
          q
            .eq("buildSubmilestoneId", assignedTarget.id)
            .eq("idempotencyKey", assignArgs.idempotencyKey),
        )
        .collect();
      return {
        audit: JSON.parse(auditEvents.at(-1)!.newState),
        receipt: JSON.parse(receipts[0]!.resultJson),
      };
    });
    expect(assignmentAuditAndReceipt.audit.workflowRevisions).toEqual({
      forms: 1,
    });
    expect(assignmentAuditAndReceipt.receipt.workflowRevisions).toEqual({
      forms: 1,
    });

    // A replay must win before stale checking. The original revision is now
    // stale, but the committed assignment result is still returned.
    await expect(
      builder.mutation(
        (api as any).production_proposals.assignActiveBuildContractorToMilestone,
        assignArgs,
      ),
    ).resolves.toEqual(assignmentIds);

    await expect(
      builder.mutation(
        (api as any).production_proposals.assignActiveBuildContractorToMilestone,
        {
          ...assignArgs,
          role: "Different role",
        },
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED|idempotency key/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals.assignActiveBuildContractorToMilestone,
        {
          ...assignArgs,
          expectedRevision: 0,
          idempotencyKey: "scoped-assignment-stale-001",
        },
      ),
    ).rejects.toMatchObject({
      data: { code: "STALE_SUBMILESTONE_REVISION" },
    });

    const removeArgs = {
      buildId: closing.buildId,
      contractorId,
      expectedRevision: 1,
      idempotencyKey: "scoped-removal-001",
      milestoneKey: "foundation",
      reason: "Forms scope reassigned after review.",
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    };
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .removeActiveBuildContractorFromMilestone,
        {
          ...removeArgs,
          idempotencyKey: "scoped-removal-missing-target-001",
          submilestoneKey: "missing",
        },
      ),
    ).rejects.toThrow(/SUBMILESTONE_NOT_FOUND|Submilestone is unavailable/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .removeActiveBuildContractorFromMilestone,
        removeArgs,
      ),
    ).resolves.toEqual(assignmentIds);
    const removedRevision = await builder.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .filter((q: any) => q.eq(q.field("key"), "forms"))
        .unique();
      const assignments = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_submilestone", (q: any) =>
          q
            .eq("buildId", closing.buildId)
            .eq("milestoneKey", "foundation")
            .eq("submilestoneKey", "forms"),
        )
        .collect();
      const deliveries = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq(
              "recipientWorkosUserId",
              "user_scoped_assignment_contractor",
            ),
        )
        .collect();
      return {
        id: submilestone._id,
        key: submilestone.key,
        assignments,
        deliveries,
        workflowRevision: submilestone.workflowRevision ?? 0,
      };
    });
    expect(removedRevision.workflowRevision).toBe(2);
    expect(removedRevision.assignments).toEqual([
      expect.objectContaining({ status: "removed" }),
    ]);
    expect(removedRevision.deliveries).toHaveLength(2);

    const removalAuditAndReceipt = await builder.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "buildSubmilestone")
            .eq("entityId", String(removedRevision.id)),
        )
        .filter((q: any) =>
          q.eq(
            q.field("command"),
            "removeActiveBuildContractorFromMilestone",
          ),
        )
        .collect();
      const receipts = await ctx.db
        .query("buildSubmilestoneCommandReceipts")
        .withIndex("by_submilestone_idempotency", (q: any) =>
          q
            .eq("buildSubmilestoneId", removedRevision.id)
            .eq("idempotencyKey", removeArgs.idempotencyKey),
        )
        .collect();
      return {
        audit: JSON.parse(auditEvents.at(-1)!.newState),
        receipt: JSON.parse(receipts[0]!.resultJson),
      };
    });
    expect(removalAuditAndReceipt.audit.submilestoneKey).toBe("forms");
    expect(removalAuditAndReceipt.audit.workflowRevision).toBe(2);
    expect(removalAuditAndReceipt.receipt.workflowRevisions).toEqual({
      forms: 2,
    });

    await expect(
      builder.mutation(
        (api as any).production_proposals
          .removeActiveBuildContractorFromMilestone,
        removeArgs,
      ),
    ).resolves.toEqual(assignmentIds);
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .removeActiveBuildContractorFromMilestone,
        {
          ...removeArgs,
          reason: "A different removal reason.",
        },
      ),
    ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED|idempotency key/i);

    await runAuditEventBuildIdBackfill(admin);
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_assignment_audit_resource_only",
    });
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({ contractor: { canView: true } }),
        staffWorkosUserId: "user_assignment_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const assignmentResourceOnly = withIdentity(
      base,
      ["builder-staff"],
      "user_assignment_audit_resource_only",
    );
    const assignmentResourceOnlyDetail = await assignmentResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const assignmentCommands = new Set([
      "assignActiveBuildContractorToMilestone",
      "removeActiveBuildContractorFromMilestone",
    ]);
    expect(
      assignmentResourceOnlyDetail.auditEvents.some(
        (event: any) =>
          assignmentCommands.has(event.command) &&
          event.entityType === "buildSubmilestone",
      ),
    ).toBe(false);

    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId: closing.buildId,
        permissions: appPermissionGrants({
          contractor: { canView: true },
          submilestone: { canView: true },
        }),
        staffWorkosUserId: "user_assignment_audit_resource_only",
        workosOrganizationId: ORG,
      },
    );
    const assignmentAllowedDetail = await assignmentResourceOnly.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      assignmentAllowedDetail.auditEvents.some(
        (event: any) =>
          assignmentCommands.has(event.command) &&
          event.canonicalTarget?.submilestoneId === String(assignedTarget.id),
      ),
    ).toBe(true);
  });

  test("multi-target assignment canonicalizes keys and accepts per-target revisions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        { key: "forms", name: "Forms", order: 1 },
        { key: "waterproofing", name: "Waterproofing", order: 2 },
      ],
    });
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "multi-target-assignment@example.com",
        kind: "company",
        name: "Multi Target Assignment Co",
        trades: ["concrete"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        expectedRevision: 0,
        idempotencyKey: "multi-target-forms-first-001",
        milestoneKey: "foundation",
        role: "Forms crew",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .assignActiveBuildContractorToMilestone,
        {
          buildId: closing.buildId,
          contractorId,
          expectedRevision: 1,
          idempotencyKey: "multi-target-assignment-scalar-001",
          milestoneKey: "foundation",
          role: "Foundation crew",
          submilestoneKeys: ["waterproofing", "forms"],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/EXPECTED_REVISION_MAP_REQUIRED|revision map/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .assignActiveBuildContractorToMilestone,
        {
          buildId: closing.buildId,
          contractorId,
          expectedRevisions: { forms: 1 },
          idempotencyKey: "multi-target-assignment-missing-001",
          milestoneKey: "foundation",
          role: "Foundation crew",
          submilestoneKeys: ["waterproofing", "forms"],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/EXPECTED_REVISION_MAP_REQUIRED|revision map/i);
    const assignmentIds = await builder.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        expectedRevisions: { forms: 1, waterproofing: 0 },
        idempotencyKey: "multi-target-assignment-001",
        milestoneKey: "foundation",
        role: "Foundation crew",
        submilestoneKeys: ["waterproofing", "forms"],
        workosOrganizationId: ORG,
      },
    );
    expect(assignmentIds).toHaveLength(2);
    const revisions = await builder.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      return Object.fromEntries(
        rows.map((row: any) => [row.key, row.workflowRevision ?? 0]),
      );
    });
    expect(revisions).toMatchObject({ forms: 2, waterproofing: 1 });

    const multiTargetAuditAndReceipts = await builder.run(async (ctx: any) => {
      const submilestones = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      const auditEvents = (
        await Promise.all(
          submilestones
            .filter((row: any) =>
              ["forms", "waterproofing"].includes(row.key),
            )
            .map((row: any) =>
              ctx.db
                .query("auditEvents")
                .withIndex("by_entity", (q: any) =>
                  q
                    .eq("entityType", "buildSubmilestone")
                    .eq("entityId", String(row._id)),
                )
                .filter((q: any) =>
                  q.eq(
                    q.field("command"),
                    "assignActiveBuildContractorToMilestone",
                  ),
                )
                .collect(),
            ),
        )
      ).flat();
      const receipts = await ctx.db
        .query("buildSubmilestoneCommandReceipts")
        .filter((q: any) =>
          q.and(
            q.eq(q.field("buildId"), closing.buildId),
            q.eq(q.field("idempotencyKey"), "multi-target-assignment-001"),
          ),
        )
        .collect();
      return {
        audit: JSON.parse(auditEvents.at(-1)!.newState),
        receipts: receipts.map((receipt: any) => JSON.parse(receipt.resultJson)),
      };
    });
    expect(Object.keys(multiTargetAuditAndReceipts.audit.workflowRevisions)).toEqual([
      "forms",
      "waterproofing",
    ]);
    expect(multiTargetAuditAndReceipts.audit.workflowRevisions).toEqual({
      forms: 2,
      waterproofing: 1,
    });
    expect(multiTargetAuditAndReceipts.receipts).toHaveLength(2);
    for (const receipt of multiTargetAuditAndReceipts.receipts) {
      expect(receipt.workflowRevisions).toEqual({ forms: 2, waterproofing: 1 });
    }

    await expect(
      builder.mutation(
        (api as any).production_proposals.assignActiveBuildContractorToMilestone,
        {
          buildId: closing.buildId,
          contractorId,
          expectedRevisions: { waterproofing: 99, forms: 99 },
          idempotencyKey: "multi-target-assignment-001",
          milestoneKey: "foundation",
          role: "Foundation crew",
          submilestoneKeys: ["forms", "waterproofing"],
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual(assignmentIds);
  });

  test("atomic active-build attach and invite projects an invited lifecycle state", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "atomic-invite@example.com",
        kind: "company",
        name: "Atomic Invite Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachAndInviteActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Electrical crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "invited",
        onboardingStatus: "invited",
      }),
    ]);
  });

  test("builder can open a newly attached contractor relationship before milestone assignment", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        city: "Toronto",
        email: "relationship-status@example.com",
        kind: "company",
        name: "Relationship Status Co",
        trades: ["masonry"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Masonry crew",
        workosOrganizationId: ORG,
      },
    );

    const result = await builder.query(
      (api as any).production_proposals
        .getBuilderContractorRelationshipByString,
      {
        contractorId: String(contractorId),
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      availability: {
        category: "available",
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        profile: {
          email: "relationship-status@example.com",
          name: "Relationship Status Co",
        },
        relationship: {
          assignmentStatus: "not_assigned",
          brokerage: {
            displayName: expect.any(String),
          },
          lifecycleState: "attached",
          nextAction: "invite",
          scopes: [
            expect.objectContaining({
              buildId: closing.buildId,
              name: expect.any(String),
              role: "Masonry crew",
              type: "build",
            }),
          ],
        },
        workHistory: [],
      },
    });
  });

  test("builder contractor detail returns typed redacted unavailable states", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "directory-only@example.com",
        kind: "company",
        name: "Directory Only Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.query(
        (api as any).production_proposals
          .getBuilderContractorRelationshipByString,
        {
          contractorId: String(contractorId),
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual({
      availability: {
        category: "accessDenied",
        reference: "CTR-DETAIL-ACCESS",
      },
      detail: null,
    });
    await expect(
      builder.query(
        (api as any).production_proposals
          .getBuilderContractorRelationshipByString,
        {
          contractorId: "not-a-convex-id",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual({
      availability: {
        category: "invalidLink",
        reference: "CTR-DETAIL-INVALID",
      },
      detail: null,
    });
  });

  test("does not attach an existing contractor when the atomic active-build invite cannot be created", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        name: "No Email Build Crew",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.attachAndInviteActiveBuildContractor,
        {
          buildId: closing.buildId,
          contractorId,
          role: "Foundation",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/no email/i);

    const persisted = await admin.run(async (ctx: any) => ({
      assignment: await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q: any) =>
          q.eq("buildId", closing.buildId).eq("contractorId", contractorId),
        )
        .unique(),
      claims: await ctx.db
        .query("contractorInviteClaims")
        .withIndex("by_contractor_state", (q: any) =>
          q.eq("contractorId", contractorId).eq("state", "invited"),
        )
        .collect(),
    }));
    expect(persisted).toEqual({ assignment: null, claims: [] });
  });

  test("repeated no-op active build timeline state updates do not drift durable audit or outbox records", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "No-op timeline state build",
      location: "55 No-op Timeline Way",
    });
    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const input = {
      buildId: closing.buildId,
      currentDay: workspace.plan.currentDay,
      minimumCashReserveCents: workspace.plan.minimumCashReserveCents,
      progressValue: workspace.plan.progressValue,
      rangeMax: workspace.plan.rangeMax,
      rangeMin: workspace.plan.rangeMin,
      routeState: workspace.plan.routeState,
      startingCashCents: workspace.plan.startingCashCents,
      workosOrganizationId: ORG,
    };

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      input,
    );
    const beforeRetry = await t.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      const build = await ctx.db.get(closing.buildId);
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated",
        ).length,
        build,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
      };
    });

    expect(beforeRetry.auditCount).toBe(0);
    expect(beforeRetry.outboxCount).toBe(0);

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      input,
    );
    const afterRetry = await t.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      const build = await ctx.db.get(closing.buildId);
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated",
        ).length,
        build,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
      };
    });

    expect(afterRetry.build?.timelineRouteState).toEqual(
      beforeRetry.build?.timelineRouteState,
    );
    expect(afterRetry.build?.timelineCurrentDay).toBe(
      beforeRetry.build?.timelineCurrentDay,
    );
    expect(afterRetry.build?.timelineProgressValue).toBe(
      beforeRetry.build?.timelineProgressValue,
    );
    expect(afterRetry.auditCount).toBe(beforeRetry.auditCount);
    expect(afterRetry.outboxCount).toBe(beforeRetry.outboxCount);

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      { ...input, currentDay: input.currentDay + 1 },
    );
    const materialEvents = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .filter((q: any) =>
            q.eq(q.field("eventType"), "active_build.timeline_plan.updated"),
          )
          .collect(),
    );
    expect(materialEvents).toHaveLength(1);
    expect(materialEvents[0]).toMatchObject({
      newState: expect.stringContaining("Current day:"),
      priorState: expect.stringContaining("Current day:"),
      reason: expect.stringMatching(/updated current day/i),
    });
    expect(materialEvents[0]?.newState).not.toMatch(/^\s*\{/);
  });

  test("seeds deterministic production proposal lifecycle scenarios without demo data", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const first = await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );
    const second = await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    expect(Object.keys(first.proposals).sort()).toEqual([
      "approvedWithPermit",
      "approvedWithWaiver",
      "closed",
      "draft",
      "rejected",
      "requestedChanges",
      "submitted",
    ]);
    expect(second.proposals).toEqual(first.proposals);

    const scenarios = await t.run(async (ctx: any) => {
      const proposals = await ctx.db.query("buildProposals").collect();
      const byName = Object.fromEntries(
        proposals.map((proposal: any) => [proposal.buildName, proposal]),
      );
      const activeBuilds = await ctx.db.query("activeBuilds").collect();
      const contractors = await ctx.db.query("contractorProfiles").collect();
      const demoBuilds = await ctx.db.query("demo_builds").collect();
      const demoProposalDrafts = await ctx.db
        .query("demo_builderProposalDrafts")
        .collect();
      const events = await ctx.db.query("proposalEvents").collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        activeBuilds,
        byName,
        contractors,
        demoBuilds,
        demoProposalDrafts,
        events,
        outbox,
        proposalCount: proposals.length,
      };
    });

    expect(scenarios.proposalCount).toBe(7);
    expect(scenarios.byName["Seed Scenario - Draft"]).toMatchObject({
      reviewOutcome: "none",
      status: "draft",
    });
    expect(scenarios.byName["Seed Scenario - Submitted"]).toMatchObject({
      reviewOutcome: "none",
      status: "submitted",
    });
    expect(
      scenarios.byName["Seed Scenario - Approved With Permit"],
    ).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(
      scenarios.byName["Seed Scenario - Approved With Waiver"],
    ).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(scenarios.byName["Seed Scenario - Requested Changes"]).toMatchObject(
      {
        reviewOutcome: "requested_changes",
        status: "draft",
      },
    );
    expect(scenarios.byName["Seed Scenario - Rejected"]).toMatchObject({
      reviewOutcome: "rejected",
      status: "submitted",
    });
    expect(scenarios.byName["Seed Scenario - Closed"]).toMatchObject({
      reviewOutcome: "approved",
      status: "closed",
    });
    expect(scenarios.activeBuilds).toHaveLength(1);
    expect(scenarios.activeBuilds[0]).toMatchObject({
      proposalId: first.proposals.closed,
      status: "future_start",
    });
    expect(scenarios.contractors).toHaveLength(1);
    expect(scenarios.contractors[0].accountWorkosUserId).toBeUndefined();
    expect(scenarios.contractors[0]).toMatchObject({
      name: "Seed Scenario Contractor LLC",
    });
    expect(scenarios.events.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.changes_requested",
        "proposal.rejected",
        "proposal.closed",
      ]),
    );
    expect(scenarios.outbox.map((event: any) => event.eventType)).toContain(
      "active_build.created",
    );
    expect(scenarios.demoBuilds).toHaveLength(0);
    expect(scenarios.demoProposalDrafts).toHaveLength(0);
  });

  test("projects the backoffice dashboard from production proposals and active builds only", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const serialized = JSON.stringify(dashboard);

    expect(serialized).not.toMatch(/demo_|demo-timeline|mock_|Mock/);
    expect(dashboard.activeBuilds).toHaveLength(1);
    expect(dashboard.activeBuilds[0]).toMatchObject({
      address: "Closed Site, Toronto, ON",
      builder: "Production Builder",
      statusLabel: "Future start",
    });
    expect(dashboard.activeBuilds[0].id).not.toContain("Approved");
    expect(dashboard.activeBuilds[0].href).toMatch(/^\/backoffice\/builds\//);

    expect(dashboard.milestones).toEqual([]);

    expect(dashboard.proposalColumns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
    expect(dashboard.proposals.map((proposal: any) => proposal.name)).toEqual(
      expect.arrayContaining([
        "Seed Scenario - Approved With Permit",
        "Seed Scenario - Approved With Waiver",
        "Seed Scenario - Closed",
      ]),
    );

    expect(
      dashboard.submittedProposals.map((proposal: any) => proposal.name),
    ).toEqual(["Seed Scenario - Submitted"]);
    expect(
      dashboard.approvedPendingClosing.map((proposal: any) => proposal.name),
    ).toEqual([
      "Seed Scenario - Approved With Permit",
      "Seed Scenario - Approved With Waiver",
    ]);
    expect(dashboard.approvedPendingClosing[0]).toMatchObject({
      lenderDrawPolicyLimitCents: 55_000_000,
      statusLabel: "Approved - pending closing",
    });
    expect(
      dashboard.activeBuilds.some((build: any) =>
        build.id.includes("Approved With Permit"),
      ),
    ).toBe(false);
  });

  test("searches and filters the complete proposal directory with attached builder identity", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const byEmail = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "builder@example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(byEmail.isDone).toBe(true);
    expect(byEmail.page.length).toBeGreaterThan(0);
    expect(byEmail.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          builderEmail: "builder@example.com",
          builderName: "Production Builder",
          builderProfileId: expect.any(String),
        }),
      ]),
    );

    const byName = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "Production Builder",
        workosOrganizationId: ORG,
      },
    );
    expect(byName.page.length).toBeGreaterThan(0);
    expect(
      byName.page.every(
        (proposal: any) => proposal.builderName === "Production Builder",
      ),
    ).toBe(true);

    const builderProfileId = byEmail.page.find(
      (proposal: any) => proposal.builderProfileId,
    )?.builderProfileId as string;
    expect(builderProfileId).toBeTruthy();

    await t.run(async (ctx: any) => {
      const builderProfile = await ctx.db.get(builderProfileId);
      expect(builderProfile).toBeTruthy();
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_builder_staff_search",
        createdAt: now,
        email: "builder.staff@example.com",
        emailVerified: true,
        firstName: "Casey",
        lastName: "Crew",
        name: "Casey Crew",
        sourceEventId: "test_builder_staff_search_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder_staff_search",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_builder_staff_search_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_builder_staff_search",
        workosOrganizationId: ORG,
        workosUserId: "user_builder_staff_search",
      });
      await ctx.db.insert("builderAccountLinks", {
        assignedEmail: "builder.staff@example.com",
        brokerageId: builderProfile.brokerageId,
        builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_builder_staff_search",
        workosUserId: "user_builder_staff_search",
      });
    });

    const byAttachedStaff = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "builder.staff@example.com Casey",
        workosOrganizationId: ORG,
      },
    );
    expect(byAttachedStaff.page.length).toBeGreaterThan(0);
    expect(
      byAttachedStaff.page.every(
        (proposal: any) => proposal.builderProfileId === builderProfileId,
      ),
    ).toBe(true);

    const approvedPendingClosing = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        filters: {
          assignment: "assigned",
          closingState: "pending_closing",
          reviewOutcome: "approved",
          stage: "approved",
        },
        paginationOpts: { cursor: null, numItems: 100 },
        search: "approved Toronto 55000000",
        workosOrganizationId: ORG,
      },
    );

    expect(approvedPendingClosing.page).toHaveLength(2);
    expect(
      approvedPendingClosing.page.every(
        (proposal: any) =>
          proposal.column === "approved" &&
          proposal.reviewOutcome === "approved" &&
          proposal.activeBuildId === undefined,
      ),
    ).toBe(true);
  });

  test("keeps the proposal directory restricted to backoffice roles", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.query(
        (api as any).production_proposals.listBackofficeProposalDirectory,
        {
          paginationOpts: { cursor: null, numItems: 25 },
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/forbidden/i);
  });

  test("projects an accountable operations queue from canonical proposal records", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );

    expect(dashboard.quickActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "Review proposal",
          authorityLabel: "Lender Admin decision",
          blocker: "Awaiting underwriting decision",
          entityLabel: "Seed Scenario - Submitted",
          href: expect.stringMatching(/^\/backoffice\/proposals\//),
          ownerLabel: "Assigned broker",
          recommendationLabel: "Review submission and record a decision",
          type: "proposal",
        }),
        expect.objectContaining({
          actionLabel: "Record closing",
          authorityLabel: "Lender Admin authority",
          blocker: "Approved loan has not been recorded as closed",
          entityLabel: "Seed Scenario - Approved With Permit",
          ownerLabel: "Assigned broker",
          type: "proposal",
        }),
      ]),
    );
    expect(JSON.stringify(dashboard.quickActions)).not.toMatch(
      /payloadPreview|requestId|stack|validator|mutation/i,
    );
  });

  test("records an explicit operations escalation, admin return decision, and acknowledgement", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    const queueItem = dashboard.quickActions.find((action: any) =>
      action.id.startsWith("proposal-review:"),
    );

    const escalation = await broker.mutation(
      (api as any).production_proposals.escalateOperationsQueueItem,
      {
        decisionPreview:
          "Approve the submitted proposal or return it for changes.",
        evidenceSummary:
          "Underwriting package and selected plan are ready for review.",
        queueItemId: queueItem.id,
        reason: "Lender Admin authority is required for the final decision.",
        recommendation: "Approve subject to the recorded closing conditions.",
        requiredAction: "Record the proposal decision.",
        warnings: [
          "Closing remains blocked until a final decision is recorded.",
        ],
        workosOrganizationId: ORG,
      },
    );

    expect(escalation).toMatchObject({
      acknowledgementState: "pending_decision",
      queueItemId: queueItem.id,
      escalatedByWorkosUserId: "user_broker",
      recommendation: "Approve subject to the recorded closing conditions.",
    });

    await expect(
      broker.mutation(
        (api as any).production_proposals.returnOperationsEscalationDecision,
        {
          decision: "continue",
          followUpAssignment: "Broker must confirm closing conditions.",
          handoffId: escalation._id,
          reason: "Proceed after the closing conditions are confirmed.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    const returned = await admin.mutation(
      (api as any).production_proposals.returnOperationsEscalationDecision,
      {
        decision: "continue",
        followUpAssignment: "Broker must confirm closing conditions.",
        handoffId: escalation._id,
        reason: "Proceed after the closing conditions are confirmed.",
        workosOrganizationId: ORG,
      },
    );

    expect(returned).toMatchObject({
      acknowledgementState: "returned",
      returnDecision: "continue",
      returnReason: "Proceed after the closing conditions are confirmed.",
      returnedByWorkosUserId: "user_admin",
    });

    const acknowledged = await broker.mutation(
      (api as any).production_proposals.acknowledgeOperationsEscalationReturn,
      {
        handoffId: escalation._id,
        workosOrganizationId: ORG,
      },
    );

    expect(acknowledged).toMatchObject({
      acknowledgedByWorkosUserId: "user_broker",
      acknowledgementState: "acknowledged",
    });

    const projected = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      projected.quickActions.find((action: any) => action.id === queueItem.id),
    ).toMatchObject({
      handoff: expect.objectContaining({
        acknowledgementState: "acknowledged",
        returnDecision: "continue",
        returnReason: "Proceed after the closing conditions are confirmed.",
      }),
    });
  });

  test("projects deterministic backoffice dashboard dates from an explicit as-of date", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const asOfDate = "2100-09-02";
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate, workosOrganizationId: ORG },
    );
    const expectedDaysActive = Math.floor(
      (Date.parse(`${asOfDate}T00:00:00Z`) -
        Date.parse("2099-09-01T00:00:00Z")) /
        86_400_000,
    );

    expect(dashboard.scheduleDate).toBe("2100-09-02T00:00:00.000Z");
    expect(dashboard.activeBuilds[0].daysActive).toBe(expectedDaysActive);
    expect(dashboard.activeBuilds[0]).toMatchObject({
      buildName: expect.any(String),
      builder: expect.any(String),
      drawCount: expect.any(Number),
      milestoneCount: expect.any(Number),
      milestonesBehindSchedule: expect.any(Number),
      pendingDrawRequestCount: expect.any(Number),
    });
  });

  test("lists the backoffice build roster with phase rollups and operational signals", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );

    expect(roster.summary.total).toBeGreaterThanOrEqual(1);
    expect(roster.builds.length).toBe(roster.summary.total);
    expect(roster.builds[0]).toMatchObject({
      buildName: expect.any(String),
      displayId: expect.stringMatching(/^B-/),
      href: expect.stringMatching(/^\/backoffice\/builds\//),
      phase: expect.stringMatching(/scheduled|active|attention|completed/),
    });
    expect(
      roster.summary.scheduled +
        roster.summary.active +
        roster.summary.attention +
        roster.summary.completed,
    ).toBe(roster.summary.total);
  });

  test("paginates and filters the backoffice build roster without returning the full set", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const summary = await t.query(
      (api as any).production_proposals.getBackofficeBuildRosterSummary,
      { workosOrganizationId: ORG },
    );
    const legacyRoster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );
    const firstPage = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        paginationOpts: { cursor: null, numItems: 1 },
        workosOrganizationId: ORG,
      },
    );

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.page[0]).toMatchObject({
      buildName: expect.any(String),
      imageUrl: null,
      phase: expect.stringMatching(/scheduled|active|attention|completed/),
    });
    expect(firstPage.page.length).toBeLessThanOrEqual(1);
    expect(summary.total).toBeGreaterThanOrEqual(firstPage.page.length);
    expect(summary).toEqual(legacyRoster.summary);

    const searched = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        paginationOpts: { cursor: null, numItems: 15 },
        search: firstPage.page[0].buildName,
        workosOrganizationId: ORG,
      },
    );
    expect(searched.page.map((build: any) => build.buildId)).toContain(
      firstPage.page[0].buildId,
    );

    const filtered = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        paginationOpts: { cursor: null, numItems: 15 },
        phase: firstPage.page[0].phase,
        workosOrganizationId: ORG,
      },
    );
    expect(
      filtered.page.every((build: any) => build.phase === firstPage.page[0].phase),
    ).toBe(true);

    const sortedByBudget = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        paginationOpts: { cursor: null, numItems: 15 },
        sortBy: "budget",
        sortDirection: "asc",
        workosOrganizationId: ORG,
      },
    );
    expect(sortedByBudget.page.length).toBeGreaterThan(0);
    expect(sortedByBudget.page.length).toBeLessThanOrEqual(15);
  });

  test("keeps filtered roster pagination cursor-safe across nonmatching builds", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const matchingBuild = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Cursor-safe matching build",
    });
    const nonMatchingBuild = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Cursor-safe nonmatching build",
    });

    await t.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.patch(matchingBuild.buildId, { updatedAt: now - 1_000 });
      await ctx.db.patch(nonMatchingBuild.buildId, {
        status: "future_start",
        updatedAt: now,
      });
    });

    const queryArgs = {
      paginationOpts: { cursor: null, numItems: 1 },
      sortBy: "updatedAt",
      sortDirection: "desc",
      workosOrganizationId: ORG,
    } as const;
    const firstSearchPage = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      { ...queryArgs, search: "cursor-safe matching" },
    );

    expect(firstSearchPage.page).toEqual([]);
    expect(firstSearchPage.isDone).toBe(false);
    expect(firstSearchPage.continueCursor).not.toBe("");

    const secondSearchPage = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        ...queryArgs,
        paginationOpts: {
          cursor: firstSearchPage.continueCursor,
          numItems: 1,
        },
        search: "cursor-safe matching",
      },
    );

    expect(secondSearchPage.page.map((row: any) => row.buildId)).toEqual([
      matchingBuild.buildId,
    ]);
    expect(secondSearchPage.isDone).toBe(true);
    const matchingPhase = secondSearchPage.page[0].phase;

    const firstPhasePage = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      { ...queryArgs, phase: matchingPhase },
    );
    expect(firstPhasePage.page).toEqual([]);
    expect(firstPhasePage.isDone).toBe(false);
    expect(firstPhasePage.continueCursor).not.toBe("");

    const secondPhasePage = await t.query(
      (api as any).production_proposals.listBackofficeBuildRosterPage,
      {
        ...queryArgs,
        paginationOpts: {
          cursor: firstPhasePage.continueCursor,
          numItems: 1,
        },
        phase: matchingPhase,
      },
    );

    expect(secondPhasePage.page.map((row: any) => row.buildId)).toEqual([
      matchingBuild.buildId,
    ]);
    expect(secondPhasePage.isDone).toBe(true);
  });

  test("summarizes every active build across multiple source batches", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const additionalBuildCount = 51;
    await t.run(async (ctx: any) => {
      const source = await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage", (query: any) =>
          query.eq("brokerageId", seed.brokerageId),
        )
        .first();
      if (!source) {
        throw new Error("Expected the seeded active build source row.");
      }

      const {
        _creationTime: _sourceCreationTime,
        _id: _sourceId,
        ...sourceFields
      } = source;
      for (let index = 0; index < additionalBuildCount; index += 1) {
        await ctx.db.insert("activeBuilds", {
          ...sourceFields,
          buildName: `Summary batch build ${index + 1}`,
          updatedAt: source.updatedAt + index + 1,
        });
      }
    });

    const expectedBuildCount = await t.run(async (ctx: any) => {
      const builds = await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage", (query: any) =>
          query.eq("brokerageId", seed.brokerageId),
        )
        .collect();
      return builds.filter((build: any) => build.organizationId === ORG).length;
    });
    expect(expectedBuildCount).toBeGreaterThan(50);

    const summary = await t.query(
      (api as any).production_proposals.getBackofficeBuildRosterSummary,
      { workosOrganizationId: ORG },
    );

    expect(summary.total).toBe(expectedBuildCount);
  });

  test("admin sees every brokerage build regardless of their own builder assignment", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const secondBuilderProfileId = await t.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_admin",
      });
      return await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Other Builder Co.",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });

    const assignedBuild = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Admin-assigned build",
    });
    const otherBuilderBuild = await createClosedSingleMilestoneBuild(
      t,
      { ...seed, builderProfileId: secondBuilderProfileId },
      { buildName: "Other builder build" },
    );
    const expectedBuildIds = [
      String(assignedBuild.buildId),
      String(otherBuilderBuild.buildId),
    ].sort();

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );

    expect(
      dashboard.activeBuilds
        .map((build: any) => build.buildKey)
        .filter((buildId: string) => expectedBuildIds.includes(buildId))
        .sort(),
    ).toEqual(expectedBuildIds);
    expect(
      roster.builds
        .map((build: any) => String(build.buildId))
        .filter((buildId: string) => expectedBuildIds.includes(buildId))
        .sort(),
    ).toEqual(expectedBuildIds);
  });

  test("repairs a legacy closed proposal so every admin can see its active build", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const secondBuilderProfileId = await t.run(async (ctx: any) => {
      const now = Date.now();
      return await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Legacy Builder Co.",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: secondBuilderProfileId,
        buildName: "Legacy hidden build",
        location: "91 Legacy Build Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "legacy-permit-v1.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
          {
            documentType: "permit",
            fileName: "legacy-permit-v2.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Legacy build was approved before active-build materialization.",
      workosOrganizationId: ORG,
    });
    await t.run(async (ctx: any) => {
      const closedAt = Date.parse("2026-04-30T12:00:00.000Z");
      await ctx.db.patch(proposalId, {
        closedAt,
        status: "closed",
        updatedAt: closedAt,
        updatedByWorkosUserId: "legacy_system",
      });
    });

    const before = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      before.activeBuilds.some(
        (build: any) => build.buildName === "Legacy hidden build",
      ),
    ).toBe(false);

    await expect(
      withIdentity(base, ["builder"], "user_builder").mutation(
        (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
        {
          buildStartDate: "2026-05-01",
          proposalId,
          reason: "A builder must not run a backoffice data repair.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow();

    const repaired = await t.mutation(
      (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
      {
        buildStartDate: "2026-05-01",
        proposalId,
        reason:
          "Restore the missing Active Build aggregate for a legacy closing.",
        workosOrganizationId: ORG,
      },
    );

    expect(repaired).toMatchObject({
      operation: "created",
      warnings: ["loan_facility_not_reconstructed_missing_authoritative_terms"],
    });
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.activeBuilds.some(
        (build: any) => build.buildKey === String(repaired.buildId),
      ),
    ).toBe(true);
    expect(
      roster.builds.some((build: any) => build.buildId === repaired.buildId),
    ).toBe(true);
    expect(
      await t.run(async (ctx: any) =>
        ctx.db
          .query("loanFacilities")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .first(),
      ),
    ).toBeNull();

    const firstRepairState = await t.run(async (ctx: any) => ({
      audits: (
        await ctx.db
          .query("auditEvents")
          .filter((q: any) =>
            q.eq(q.field("command"), "repairLegacyClosedProposalActiveBuild"),
          )
          .collect()
      ).map((event: any) => ({
        actorRoles: event.actorRoles,
        actorWorkosUserId: event.actorWorkosUserId,
        reason: event.reason,
        warnings: event.warnings,
      })),
      buildCount: (
        await ctx.db
          .query("activeBuilds")
          .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
          .collect()
      ).length,
      capitalPlanCount: (
        await ctx.db
          .query("buildCapitalPlans")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
      documentCount: (
        await ctx.db
          .query("buildDocuments")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
      documents: await ctx.db
        .query("buildDocuments")
        .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
        .collect(),
      milestoneCount: (
        await ctx.db
          .query("buildMilestones")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
    }));
    expect(firstRepairState).toMatchObject({
      audits: [
        {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          reason:
            "Restore the missing Active Build aggregate for a legacy closing.",
          warnings: [
            "loan_facility_not_reconstructed_missing_authoritative_terms",
          ],
        },
        {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          reason:
            "Restore the missing Active Build aggregate for a legacy closing.",
          warnings: [
            "loan_facility_not_reconstructed_missing_authoritative_terms",
          ],
        },
      ],
      buildCount: 1,
      capitalPlanCount: 1,
      documentCount: 2,
      milestoneCount: 1,
    });
    const [permitV1, permitV2] = firstRepairState.documents.sort(
      (left: any, right: any) => left.version - right.version,
    );
    expect(permitV1).toMatchObject({
      fileName: "legacy-permit-v1.pdf",
      status: "superseded",
      supersededByDocumentId: permitV2._id,
      version: 1,
    });
    expect(permitV2).toMatchObject({
      fileName: "legacy-permit-v2.pdf",
      status: "uploaded",
      supersedesDocumentId: permitV1._id,
      version: 2,
    });

    await expect(
      t.mutation(
        (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
        {
          buildStartDate: "2026-05-01",
          proposalId,
          reason: "Verify the repair is idempotent.",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({
      buildId: repaired.buildId,
      operation: "already_repaired",
    });
    const secondRepairState = await t.run(async (ctx: any) => ({
      auditCount: (
        await ctx.db
          .query("auditEvents")
          .filter((q: any) =>
            q.eq(q.field("command"), "repairLegacyClosedProposalActiveBuild"),
          )
          .collect()
      ).length,
      buildCount: (
        await ctx.db
          .query("activeBuilds")
          .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
          .collect()
      ).length,
    }));
    expect(secondRepairState).toEqual({ auditCount: 2, buildCount: 1 });
  });

  test("dashboard milestone queue includes completion claims and overdue work", async () => {
    const { base, t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const initialDashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(initialDashboard.milestones).toEqual([]);
    expect(
      initialDashboard.milestoneColumns.map((column: any) => column.id),
    ).toEqual([
      "backlog",
      "needsSiteVisit",
      "inProgress",
      "behindSchedule",
      "inReview",
    ]);

    const buildId = initialDashboard.activeBuilds[0].buildKey;
    const overdueDashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      overdueDashboard.milestones.find(
        (milestone: any) => milestone.milestoneKey === "foundation",
      ),
    ).toMatchObject({
      column: "behindSchedule",
      dueLabel: expect.stringMatching(/^\d+d overdue$/),
      milestoneKey: "foundation",
      name: "Foundation",
      priority: "high",
    });

    const builder = withIdentity(base, ["builder"], "user_builder");
    for (const submilestoneKey of ["forms-and-pour", "waterproofing"]) {
      await builder.mutation(
        (api as any).production_proposals
          .updateActiveBuildSubmilestoneExecution,
        {
          actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
          buildId,
          expectedRevision: 0,
          idempotencyKey: `dashboard-submilestone-${submilestoneKey}`,
          milestoneKey: "foundation",
          status: "complete",
          submilestoneKey,
          workosOrganizationId: ORG,
        },
      );
    }
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 50_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId,
        completedDay: 30,
        expectedRevision: 1,
        idempotencyKey: "dashboard-milestone-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );

    const dashboardAfterClaim = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(dashboardAfterClaim.milestones).toEqual([
      expect.objectContaining({
        column: "backlog",
        milestoneKey: "foundation",
        name: "Foundation",
      }),
    ]);

    await seedCanonicalSiteVisitGuidanceForBuild(t, buildId);
    await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId,
        idempotencyKey: "assign-site-visit-dashboard-queue",
        milestoneKey: "foundation",
        note: "Verify completion claim.",
        requestedDay: 31,
        workosOrganizationId: ORG,
      },
    );

    const dashboardAfterSiteVisit = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      dashboardAfterSiteVisit.milestones.find(
        (milestone: any) => milestone.milestoneKey === "foundation",
      ),
    ).toEqual(
      expect.objectContaining({
        column: "needsSiteVisit",
        milestoneKey: "foundation",
        name: "Foundation",
      }),
    );

  });

  test("active build draw requests keep approved availability when actual cost is lower", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const initialWorkspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const drawKey = initialWorkspace.draws[0].drawKey;
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "draw-availability-completion-001",
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Completion evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 40_000_000,
        buildId: closing.buildId,
        drawKey,
        note: "Requesting approved reimbursement.",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(
      workspace.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({
      amountCents: 40_000_000,
      requestNote: "Requesting approved reimbursement.",
      requestStatus: "requested",
    });
  });

  test("lender admins approve an in-review draw without an operations handoff", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const initialWorkspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const drawKey = initialWorkspace.draws[0].drawKey;
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "draw-approval-completion-001",
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Completion evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 40_000_000,
        buildId: closing.buildId,
        drawKey,
        note: "Requested against original budget.",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Approve release.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toBeNull();

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(
      workspace.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({
      amountCents: 40_000_000,
      requestStatus: "approved",
    });
  });

  test("reserves final milestone decisions and draw release for lender admins", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const staff = withIdentity(base, ["broker"], "user_broker");

    await expect(
      staff.mutation(
        (api as any).production_proposals.approveActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "Staff recommendation must not be a final approval.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: role");
    await expect(
      staff.mutation(
        (api as any).production_proposals.rejectActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "Staff recommendation must not be a final rejection.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: role");
    await expect(
      staff.mutation((api as any).production_proposals.releaseActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: "draw-request-awaiting-admin",
        note: "Staff cannot release funds.",
        releaseDate: "2026-07-16",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: role");
  });

  test("keeps staff evidence acceptance and site-visit recommendations pending admin approval", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const staff = withIdentity(base, ["broker"], "user_broker");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "staff-review-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for lender review.",
        workosOrganizationId: ORG,
      },
    );
    await staff.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: true,
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Evidence accepted; recommend admin approval.",
        workosOrganizationId: ORG,
      },
    );

    let milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone).toMatchObject({
      evidenceState: "Accepted",
      status: "in_progress",
    });
    expect(milestone.completionReview).toMatchObject({
      evidenceReview: {
        accepted: true,
        note: "Evidence accepted; recommend admin approval.",
      },
      status: "pending",
    });
    expect(milestone.completionReview?.note).toBeUndefined();

    const visit = await staff.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        idempotencyKey: "assign-site-visit-staff-review",
        milestoneKey: "foundation",
        note: "Verify the accepted package on site.",
        requestedDay: 21,
        workosOrganizationId: ORG,
      },
    );
    await seedTokenizedSiteVisitEvidence(admin, {
      buildId: String(closing.buildId),
      token: visit.visitId,
    });
    await admin.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(closing.buildId),
        completionObserved: true,
        locationAttempt: {
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          permissionOutcome: "granted",
          verified: true,
        },
        missingPrerequisites: [],
        recommendedOutcome: "approve",
        reportNotes: "<p>Observed completed foundation work.</p>",
        token: visit.visitId,
      },
    );

    milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.status).toBe("in_progress");
    expect(milestone.completionReview?.status).toBe("pending");
    expect(milestone.completionReview?.siteVisit).toMatchObject({
      recommendedOutcome: "approve",
      status: "complete",
    });
  });

  test("requires a concrete change request and clears it when the builder resubmits", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      admin.mutation(
        (api as any).production_proposals.requestActiveBuildMilestoneInfo,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "   ",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("A requested change note is required.");

    await admin.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: " Upload the signed inspection report. ",
        workosOrganizationId: ORG,
      },
    );
    let milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.completionReview).toMatchObject({
      note: "Upload the signed inspection report.",
      status: "revisionRequested",
    });

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "change-request-completion-001",
        milestoneKey: "foundation",
        note: "Signed report attached.",
        workosOrganizationId: ORG,
      },
    );
    milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.completionReview?.status).toBe("pending");
    expect(milestone.completionReview?.note).toBeUndefined();
  });

  test("repairs only malformed revision states without requested-change notes", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const milestoneId = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      await ctx.db.patch(milestone._id, {
        completionReview: {
          reviewedAt: "2026-07-15T12:00:00.000Z",
          status: "revisionRequested",
        },
      });
      return milestone._id;
    });

    const repaired = await admin.mutation(
      (api as any).production_proposals.repairActiveBuildMilestoneReviewStates,
      {
        buildId: closing.buildId,
        workosOrganizationId: ORG,
      },
    );
    expect(repaired).toEqual({
      milestoneKeys: ["foundation"],
      repaired: 1,
    });
    let milestone = await admin.run(async (ctx: any) =>
      ctx.db.get(milestoneId),
    );
    expect(milestone.completionReview?.status).toBe("pending");

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(milestoneId, {
        completionReview: {
          note: "Upload a clearer inspection photo.",
          reviewedAt: "2026-07-15T13:00:00.000Z",
          status: "revisionRequested",
        },
      });
    });
    expect(
      await admin.mutation(
        (api as any).production_proposals
          .repairActiveBuildMilestoneReviewStates,
        {
          buildId: closing.buildId,
          workosOrganizationId: ORG,
        },
      ),
    ).toEqual({ milestoneKeys: [], repaired: 0 });
    milestone = await admin.run(async (ctx: any) => ctx.db.get(milestoneId));
    expect(milestone.completionReview).toMatchObject({
      note: "Upload a clearer inspection photo.",
      status: "revisionRequested",
    });
  });

  test("deduplicates legacy draw requests without client operation IDs before reducing capacity again", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const input = {
      amountCents: 20_000_000,
      buildId: closing.buildId,
      drawKey: "draw-01",
      note: "Legacy builder draw request without explicit operation ID.",
      workosOrganizationId: ORG,
    };

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const retry = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );

    expect(receipt.availableAfterCents).toBe(20_000_000);
    expect(retry).toEqual(receipt);

    const detailAfterRetry = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detailAfterRetry.draws).toHaveLength(1);
    expect(detailAfterRetry.draws[0]).toMatchObject({
      amountCents: 20_000_000,
      drawKey: receipt.requestKey,
      status: "requested",
    });

    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        ...input,
        clientOperationId: "draw-operation-explicit-after-legacy",
      },
    );

    expect(secondReceipt.displayId).not.toBe(receipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(receipt.requestKey);
    expect(secondReceipt.availableAfterCents).toBe(0);

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.plannedDraws).toHaveLength(1);
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 20_000_000,
          drawKey: receipt.requestKey,
          status: "requested",
        }),
        expect.objectContaining({
          amountCents: 20_000_000,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
  });

  test("keeps legacy fallback draw operation IDs independent even when the old weak hash would collide", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const collision = findLegacyDrawOperationCollision({
      buildId: String(closing.buildId),
      requestedByWorkosUserId: "user_builder",
    });

    const firstReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: collision.first.amountCents,
        buildId: closing.buildId,
        drawKey: collision.first.drawKey,
        note: `Legacy fallback collision probe ${collision.legacyOperationId}.`,
        workosOrganizationId: ORG,
      },
    );
    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: collision.second.amountCents,
        buildId: closing.buildId,
        drawKey: collision.second.drawKey,
        note: `Legacy fallback collision probe ${collision.legacyOperationId}.`,
        workosOrganizationId: ORG,
      },
    );

    expect(secondReceipt.displayId).not.toBe(firstReceipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(firstReceipt.requestKey);
    expect(firstReceipt.availableAfterCents).toBe(
      40_000_000 - collision.first.amountCents,
    );
    expect(secondReceipt.availableAfterCents).toBe(
      40_000_000 - collision.first.amountCents - collision.second.amountCents,
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: collision.first.amountCents,
          drawKey: firstReceipt.requestKey,
          status: "requested",
        }),
        expect.objectContaining({
          amountCents: collision.second.amountCents,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
  });

  test("keeps draw requests independent, idempotent, exact, and withdrawable before approval", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const input = {
      amountCents: 12_345_67,
      buildId: closing.buildId,
      clientOperationId: "draw-operation-exact-01",
      drawKey: "draw-01",
      note: "Exact partial reimbursement.",
      workosOrganizationId: ORG,
    };

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const retry = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        ...input,
        amountCents: 2_000_000,
        clientOperationId: "draw-operation-exact-02",
        note: "Second exact partial reimbursement.",
      },
    );
    expect(retry).toEqual(receipt);
    expect(secondReceipt.displayId).not.toBe(receipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(receipt.requestKey);
    expect(receipt).toMatchObject({
      amountCents: 1_234_567,
      availableAfterCents: 38_765_433,
      sourceAllocations: [
        {
          amountCents: 1_234_567,
          drawGroupKey: "draw-01",
          milestoneKey: "foundation",
          milestoneName: "Foundation",
          sourceOrder: 0,
        },
      ],
      status: "requested",
    });
    expect(receipt.workOrderKey).toMatch(/^DRWO-\d{4}$/);

    let detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.plannedDraws).toHaveLength(1);
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 1_234_567,
          drawKey: receipt.requestKey,
          sourceAllocations: receipt.sourceAllocations,
          status: "requested",
          workOrderKey: receipt.workOrderKey,
        }),
        expect.objectContaining({
          amountCents: 2_000_000,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
    expect(detail.drawFunding).toMatchObject({
      approvedMilestoneCents: 40_000_000,
      availableCents: 36_765_433,
      reservedCents: 3_234_567,
      unlockedCents: 40_000_000,
    });
    const persistedAttribution = await t.run(async (ctx: any) => {
      const persistedRequest = detail.draws.find(
        (draw: any) => draw.drawKey === receipt.requestKey,
      );
      return await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", persistedRequest._id),
        )
        .collect();
    });
    expect(persistedAttribution).toEqual([
      expect.objectContaining({
        amountCents: 1_234_567,
        brokerageId: seed.brokerageId,
        drawGroupKey: "draw-01",
        milestoneKey: "foundation",
        organizationId: ORG,
        sourceOrder: 0,
      }),
    ]);

    const brokerageDraws = await t.query(
      (api as any).production_proposals.listBrokerageDraws,
      { workosOrganizationId: ORG },
    );
    expect(brokerageDraws.summary.requested).toBe(2);
    expect(
      brokerageDraws.draws
        .filter((draw: any) => draw.status === "requested")
        .map((draw: any) => draw.drawKey)
        .sort(),
    ).toEqual([receipt.requestKey, secondReceipt.requestKey].sort());

    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        { ...input, amountCents: 99_000_000, clientOperationId: "too-large" },
      ),
    ).rejects.toThrow("exceeds the available draw limit");
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        { ...input, amountCents: 100.5, clientOperationId: "fractional-cents" },
      ),
    ).rejects.toThrow("positive whole number of cents");
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          ...input,
          clientOperationId: "note-too-long",
          note: "x".repeat(501),
        },
      ),
    ).rejects.toThrow("500 characters or fewer");

    await builder.mutation(
      (api as any).production_proposals.withdrawActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Correcting the request amount.",
        workosOrganizationId: ORG,
      },
    );
    detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      detail.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({ status: "withdrawn" });
    expect(
      detail.draws.find(
        (draw: any) => draw.drawKey === secondReceipt.requestKey,
      ),
    ).toMatchObject({ status: "requested" });

    const terminalRetry = await builder
      .mutation((api as any).production_proposals.requestActiveBuildDraw, input)
      .then(
        () => null,
        (error: any) => error,
      );

    expect(terminalRetry).toMatchObject({
      data: expect.objectContaining({
        code: "ACTIVE_BUILD_DRAW_REQUEST_TERMINAL_OPERATION_CONFLICT",
        currentStatus: "withdrawn",
        recoverable: true,
        request: expect.objectContaining({
          amountCents: receipt.amountCents,
          displayId: receipt.displayId,
          requestKey: receipt.requestKey,
          requestedAt: receipt.requestedAt,
        }),
        safeMessage: expect.stringContaining("withdrawn"),
      }),
    });

    detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws).toHaveLength(2);
    expect(
      detail.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({ status: "withdrawn" });
    expect(
      detail.draws.find(
        (draw: any) => draw.drawKey === secondReceipt.requestKey,
      ),
    ).toMatchObject({ status: "requested" });
    expect(detail.plannedDraws[0]).toMatchObject({
      amountCents: 40_000_000,
      status: "planned",
    });
    expect(detail.drawFunding).toMatchObject({
      availableCents: 38_000_000,
      reservedCents: 2_000_000,
    });
    const drawAuditEvents = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
    );
    expect(
      drawAuditEvents
        .filter((event: any) =>
          ["requestActiveBuildDraw", "withdrawActiveBuildDraw"].includes(
            event.command,
          ),
        )
        .map((event: any) => ({
          actorRoles: event.actorRoles,
          actorWorkosUserId: event.actorWorkosUserId,
          command: event.command,
          organizationId: event.organizationId,
          reason: event.reason,
        })),
    ).toEqual([
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "requestActiveBuildDraw",
        organizationId: ORG,
        reason: "Exact partial reimbursement.",
      },
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "requestActiveBuildDraw",
        organizationId: ORG,
        reason: "Second exact partial reimbursement.",
      },
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "withdrawActiveBuildDraw",
        organizationId: ORG,
        reason: "Correcting the request amount.",
      },
    ]);
  });

  test("deterministically allocates pooled availability and audits the complete draw work-order lifecycle", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Pooled draw attribution build",
      milestones: [
        {
          budgetCents: 25_000_000,
          dayEnd: 20,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 20,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [],
        },
        {
          budgetCents: 25_000_000,
          dayEnd: 40,
          dayStart: 20,
          dependencyKeys: ["foundation"],
          durationDays: 20,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [],
        },
      ],
    });
    await unlockActiveBuildMilestoneForDraw(
      admin,
      closing.buildId,
      "foundation",
    );
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId, "framing");
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const staff = withIdentity(base, ["broker"], "user_broker");
    const initialWorkspace = await builder.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 30_000_000,
        buildId: closing.buildId,
        clientOperationId: "pooled-attribution-01",
        drawKey: initialWorkspace.draws[0].drawKey,
        note: "Reimburse completed foundation and framing work.",
        workosOrganizationId: ORG,
      },
    );
    expect(receipt.sourceAllocations).toEqual([
      expect.objectContaining({
        amountCents: 20_000_000,
        milestoneKey: "foundation",
        milestoneName: "Foundation",
        sourceOrder: 0,
      }),
      expect.objectContaining({
        amountCents: 10_000_000,
        milestoneKey: "framing",
        milestoneName: "Framing",
        sourceOrder: 1,
      }),
    ]);
    expect(
      receipt.sourceAllocations.reduce(
        (sum: number, allocation: any) => sum + allocation.amountCents,
        0,
      ),
    ).toBe(receipt.amountCents);

    let detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      approvedMilestoneCents: 40_000_000,
      availableCents: 10_000_000,
      reservedCents: 30_000_000,
      unlockedCents: 40_000_000,
    });
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: receipt.sourceAllocations,
      status: "requested",
      workOrderKey: receipt.workOrderKey,
    });
    await admin.run(async (ctx: any) => {
      const facility = await ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      await ctx.db.patch(facility._id, { principalCents: 35_000_000 });
    });
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      availableCents: 5_000_000,
      reservedCents: 30_000_000,
      unlockedCents: 35_000_000,
    });
    expect(
      detail.drawFunding.sources.reduce(
        (sum: number, source: any) => sum + source.availableCents,
        0,
      ),
    ).toBe(5_000_000);

    await staff.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations review started.",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0].status).toBe("in_review");

    await staff.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Evidence, allocation, and lender policy checks passed.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      staff.mutation((api as any).production_proposals.approveActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Staff cannot make the final release decision.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: role");
    await admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Admin approved the attributed reimbursement.",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0].status).toBe("approved_for_release");

    await admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Funds released against the approved source allocation.",
        releaseDate: "2026-07-27",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: receipt.sourceAllocations,
      status: "released",
    });

    const lifecycleEvents = await admin.run(async (ctx: any) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter((event: any) =>
        [
          "requestActiveBuildDraw",
          "startActiveBuildDrawReview",
          "submitActiveBuildDrawForAdmin",
          "approveActiveBuildDraw",
          "releaseActiveBuildDraw",
        ].includes(event.command),
      ),
    );
    expect(lifecycleEvents.map((event: any) => event.command)).toEqual([
      "requestActiveBuildDraw",
      "startActiveBuildDrawReview",
      "submitActiveBuildDrawForAdmin",
      "approveActiveBuildDraw",
      "releaseActiveBuildDraw",
    ]);
    expect(
      lifecycleEvents.every(
        (event: any) =>
          event.organizationId === ORG &&
          event.actorWorkosUserId &&
          event.actorRoles.length > 0 &&
          event.newState,
      ),
    ).toBe(true);
    expect(
      lifecycleEvents
        .slice(1)
        .every((event: any) => event.priorState && event.reason),
    ).toBe(true);
  });

  test("excludes superseded milestone funding, planned draw forecasts, and stale allocations", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Superseded funding exclusion build",
      milestones: [
        {
          budgetCents: 25_000_000,
          dayEnd: 20,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 20,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [],
        },
        {
          budgetCents: 25_000_000,
          dayEnd: 40,
          dayStart: 20,
          dependencyKeys: ["foundation"],
          durationDays: 20,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [],
        },
      ],
    });
    await unlockActiveBuildMilestoneForDraw(
      admin,
      closing.buildId,
      "foundation",
    );
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId, "framing");
    await admin.run(async (ctx: any) => {
      const framing = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "framing"),
        )
        .unique();
      await ctx.db.patch(framing._id, {
        drawAvailabilityCents: 999_000_000,
        planningState: "superseded",
      });
      const framingDraw = (
        await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
          .collect()
      ).find((draw: any) => draw.milestoneKey === "framing");
      expect(framingDraw).toBeDefined();
      await ctx.db.patch(framingDraw._id, {
        amountCents: 999_000_000,
        status: "planned",
      });
      const staleRequestId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 1_000_000,
        brokerageId: seed.brokerageId,
        buildId: closing.buildId,
        clientOperationId: "superseded-allocation-001",
        createdAt: Date.now(),
        displayId: "DR-STALE",
        label: "Stale superseded allocation",
        organizationId: ORG,
        requestedAt: "2026-07-01T12:00:00.000Z",
        requestedByWorkosUserId: "user_builder",
        requestKey: "draw-stale-superseded",
        status: "withdrawn",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("activeBuildDrawRequestAllocations", {
        amountCents: 1_000_000,
        brokerageId: seed.brokerageId,
        buildId: closing.buildId,
        buildMilestoneId: framing._id,
        drawGroupKey: "framing",
        drawRequestId: staleRequestId,
        milestoneKey: "framing",
        organizationId: ORG,
        sourceOrder: 0,
        createdAt: Date.now(),
      });
    });

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      approvedMilestoneCents: 20_000_000,
      availableCents: 20_000_000,
      reservedCents: 0,
      unlockedCents: 20_000_000,
    });
    expect(detail.drawFunding.sources).toEqual([
      expect.objectContaining({
        drawGroupKey: "draw-01",
        milestoneKey: "foundation",
        reservedCents: 0,
        unlockedCents: 20_000_000,
      }),
    ]);
  });

  test("backfills legacy request attribution and normalizes approved work orders", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const legacyRequestId = await admin.run(async (ctx: any) =>
      ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 10_000_000,
        brokerageId: seed.brokerageId,
        buildId: closing.buildId,
        clientOperationId: "legacy-request-0042",
        createdAt: 42,
        displayId: "DR-0042",
        label: "Legacy approved reimbursement",
        organizationId: ORG,
        requestedAt: "2026-07-01T12:00:00.000Z",
        requestedByWorkosUserId: "user_builder",
        requestKey: "dr-0042-legacy",
        status: "approved",
        updatedAt: 42,
      }),
    );

    const legacyDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(legacyDetail.drawFunding).toMatchObject({
      attributionShortfallCents: 0,
      availableCents: 30_000_000,
      legacyUnattributedRequestCount: 1,
      requiresAttributionMigration: true,
      reservedCents: 10_000_000,
      unlockedCents: 40_000_000,
    });
    expect(legacyDetail.draws[0]).toMatchObject({
      sourceAllocations: [],
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });
    await expect(
      admin.mutation((api as any).production_proposals.requestActiveBuildDraw, {
        amountCents: 1_000_000,
        buildId: closing.buildId,
        clientOperationId: "blocked-until-attributed",
        drawKey: "draw-01",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("run the active-build draw attribution migration");

    const migrationReason =
      "Normalize legacy draw attribution and work orders.";
    const migrationPlan = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      {
        buildId: closing.buildId,
        dryRun: true,
        reason: migrationReason,
        workosOrganizationId: ORG,
      },
    );
    expect(migrationPlan).toMatchObject({
      applied: false,
      attributed: 1,
      availableCents: 30_000_000,
      dryRun: true,
      migrated: 0,
      normalized: 1,
      replayed: false,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    expect(migrationPlan.planToken).toMatch(
      /^draw-release-work-order-attribution-v1:[a-f0-9]{64}$/,
    );
    const afterDryRun = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) => event.command === "migrateActiveBuildDrawRequests",
      ),
      request: await ctx.db.get(legacyRequestId),
    }));
    expect(afterDryRun.request.workOrderKey).toBeUndefined();
    expect(afterDryRun.allocations).toHaveLength(0);
    expect(afterDryRun.migrationAudits).toHaveLength(0);

    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: false,
          reason: "Execute legacy Draw Release Work Order attribution.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Run dryRun=true again");

    const applied = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      {
        buildId: closing.buildId,
        dryRun: false,
        expectedPlanToken: migrationPlan.planToken,
        reason: "Execute legacy Draw Release Work Order attribution.",
        workosOrganizationId: ORG,
      },
    );
    expect(applied).toMatchObject({
      applied: true,
      attributed: 1,
      availableCents: 30_000_000,
      dryRun: false,
      migrated: 0,
      normalized: 1,
      replayed: false,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });

    const migrated = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      request: await ctx.db.get(legacyRequestId),
    }));
    expect(migrated.request).toMatchObject({
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });
    expect(migrated.allocations).toEqual([
      expect.objectContaining({
        amountCents: 10_000_000,
        drawGroupKey: "draw-01",
        milestoneKey: "foundation",
        organizationId: ORG,
      }),
    ]);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      availableCents: 30_000_000,
      reservedCents: 10_000_000,
    });
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: [
        expect.objectContaining({
          amountCents: 10_000_000,
          milestoneKey: "foundation",
        }),
      ],
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });

    const replay = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      {
        buildId: closing.buildId,
        dryRun: false,
        expectedPlanToken: migrationPlan.planToken,
        reason: "Replay the confirmed migration command safely.",
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 30_000_000,
      dryRun: false,
      migrated: 0,
      normalized: 0,
      replayed: true,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    const afterReplay = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) => event.command === "migrateActiveBuildDrawRequests",
      ),
    }));
    expect(afterReplay.allocations).toHaveLength(1);
    expect(afterReplay.migrationAudits).toHaveLength(1);
    expect(afterReplay.migrationAudits[0]).toMatchObject({
      actorWorkosUserId: "user_admin",
      organizationId: ORG,
      reason: "Execute legacy Draw Release Work Order attribution.",
    });
    expect(afterReplay.migrationAudits[0].actorRoles).toContain("admin");
    expect(afterReplay.migrationAudits[0].newState).toContain(
      migrationPlan.planToken,
    );
  });

  test("reserves active-build draw migration for approver roles", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Approver-only draw migration build",
      location: "42 Draw Migration Lane",
    });
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const broker = withIdentity(base, ["broker"], "user_broker");

    await expect(
      broker.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: true,
          reason: "Broker migration attempt must be denied.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden: role/i);
  });

  test("dry-runs, applies, and idempotently replays legacy lifecycle-row migration", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const legacy = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      if (!row) throw new Error("Test planned draw row not found.");
      const proposalRow = await ctx.db.get(row.proposalDrawScheduleRowId);
      if (!proposalRow) throw new Error("Test proposal draw row not found.");
      await ctx.db.patch(row._id, {
        amountCents: 12_000_000,
        requestNote: "Legacy foundation reimbursement.",
        requestedAt: "2026-07-01T12:00:00.000Z",
        status: "requested",
        updatedAt: 100,
      });
      return {
        originalProposalAmountCents: proposalRow.amountCents,
        rowId: row._id,
      };
    });
    const args = {
      buildId: closing.buildId,
      dryRun: true,
      reason: "Preview legacy lifecycle-row work order migration.",
      workosOrganizationId: ORG,
    };
    const preview = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      args,
    );
    expect(preview).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 28_000_000,
      dryRun: true,
      migrated: 1,
      normalized: 0,
      replayed: false,
      reservedCents: 12_000_000,
      restoredForecasts: 1,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    expect(preview.warnings).toEqual([
      expect.stringContaining("original requester identity"),
    ]);
    const dryRunState = await admin.run(async (ctx: any) => ({
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      row: await ctx.db.get(legacy.rowId),
    }));
    expect(dryRunState.requests).toHaveLength(0);
    expect(dryRunState.row).toMatchObject({
      amountCents: 12_000_000,
      status: "requested",
    });

    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          ...args,
          dryRun: false,
          expectedPlanToken: `${preview.planToken}-stale`,
        },
      ),
    ).rejects.toThrow("plan changed or was not confirmed");

    const scheduledRow = await admin.run(async (ctx: any) =>
      ctx.db.get(legacy.rowId),
    );
    expect(scheduledRow?.scheduledActivationJobId).toEqual(expect.any(String));

    const applyArgs = {
      ...args,
      dryRun: false,
      expectedPlanToken: preview.planToken,
      reason: "Execute approved legacy lifecycle-row work order migration.",
    };
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(legacy.rowId, {
        requestNote: "Substantive lifecycle change after preview.",
      });
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        applyArgs,
      ),
    ).rejects.toThrow("plan changed or was not confirmed");
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(legacy.rowId, {
        requestNote: "Legacy foundation reimbursement.",
        updatedAt: 100,
      });
    });
    const applied = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      applyArgs,
    );
    expect(applied).toMatchObject({
      applied: true,
      migrated: 1,
      replayed: false,
      restoredForecasts: 1,
    });
    const migratedState = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      capitalEvents: (
        await ctx.db
          .query("capitalEvents")
          .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
          .collect()
      ).filter((event: any) => event.eventType === "draw_release"),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      row: await ctx.db.get(legacy.rowId),
    }));
    expect(migratedState.requests).toHaveLength(1);
    expect(migratedState.requests[0]).toMatchObject({
      amountCents: 12_000_000,
      clientOperationId: `migration:${String(legacy.rowId)}`,
      organizationId: ORG,
      requestedByWorkosUserId: "user_admin",
      status: "requested",
      workOrderKey: "DRWO-0001",
    });
    expect(migratedState.allocations).toEqual([
      expect.objectContaining({
        amountCents: 12_000_000,
        milestoneKey: "foundation",
        organizationId: ORG,
      }),
    ]);
    expect(migratedState.row).toMatchObject({
      amountCents: legacy.originalProposalAmountCents,
      status: "planned",
    });
    expect(migratedState.capitalEvents).toHaveLength(0);

    const replay = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      applyArgs,
    );
    expect(replay).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 28_000_000,
      migrated: 0,
      normalized: 0,
      replayed: true,
      reservedCents: 12_000_000,
      restoredForecasts: 0,
      skipped: 1,
      unlockedCents: 40_000_000,
    });
    const replayCounts = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) => event.command === "migrateActiveBuildDrawRequests",
      ),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
    }));
    expect(replayCounts.requests).toHaveLength(1);
    expect(replayCounts.allocations).toHaveLength(1);
    expect(replayCounts.migrationAudits).toHaveLength(1);
  });

  test("rejects non-reimbursement and cross-organization legacy draw migration", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const legacyRowId = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      if (!row) throw new Error("Test planned draw row not found.");
      await ctx.db.patch(row._id, {
        amountCents: 1_000_000,
        requestedAt: "2026-07-01T12:00:00.000Z",
        status: "requested",
      });
      return row._id;
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: true,
          reason: "Verify reimbursement eligibility enforcement.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("available source buckets");
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(legacyRowId, { organizationId: "org_other" });
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: true,
          reason: "Verify organization attribution enforcement.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("organization, brokerage, or build attribution");
    const state = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
    }));
    expect(state.requests).toHaveLength(0);
    expect(state.allocations).toHaveLength(0);
  });

  test("serializes competing draw reservations without over-allocating capacity", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");

    const results = await Promise.allSettled([
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 30_000_000,
          buildId: closing.buildId,
          clientOperationId: "competing-reservation-a",
          drawKey: "draw-01",
          note: "Competing reservation A.",
          workosOrganizationId: ORG,
        },
      ),
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 30_000_000,
          buildId: closing.buildId,
          clientOperationId: "competing-reservation-b",
          drawKey: "draw-01",
          note: "Competing reservation B.",
          workosOrganizationId: ORG,
        },
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const reservedCents = detail.draws
      .filter((draw: any) => draw.status === "requested")
      .reduce((total: number, draw: any) => total + draw.amountCents, 0);
    expect(reservedCents).toBe(30_000_000);
    expect(reservedCents).toBeLessThanOrEqual(40_000_000);
  });

  test("keeps impossible or stale auto-requested draws out of backoffice review queues", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 1_000_000,
          buildId: closing.buildId,
          clientOperationId: "blocked-before-admin-gates",
          drawKey: "draw-01",
          note: "Attempting to request before milestone approval.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("exceeds the available draw limit");

    const beforeCorruption = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(beforeCorruption.drawRequests).toHaveLength(0);

    await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      expect(plannedRows).toHaveLength(1);
      await ctx.db.patch(plannedRows[0]._id, {
        requestNote: "Stale auto-request should not surface for review.",
        requestedAt: "2026-07-15T12:00:00.000Z",
        status: "requested",
        updatedAt: Date.now(),
      });
    });

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(dashboard.drawRequests).toHaveLength(0);

    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );
    expect(
      roster.builds.find((build: any) => build.buildId === closing.buildId),
    ).toMatchObject({ drawRequestsPending: 0 });
  });

  test("invalid active build draw requests leave no partial mutation and surface typed recovery context", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Typed draw error build",
      location: "73 Typed Error Way",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");

    const before = await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      const drawRequests = await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) => event.eventType === "active_build.draw.requested",
        ).length,
        drawRequestCount: drawRequests.length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.draw.requested" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
        plannedRows: plannedRows.map((row: any) => ({
          drawKey: row.drawKey,
          requestNote: row.requestNote,
          requestedAt: row.requestedAt,
          status: row.status,
        })),
      };
    });

    const rejection = await builder
      .mutation((api as any).production_proposals.requestActiveBuildDraw, {
        amountCents: 1_000_000,
        buildId: closing.buildId,
        clientOperationId: "typed-recovery-error",
        drawKey: "draw-01",
        note: "Attempting a draw before milestone approval.",
        workosOrganizationId: ORG,
      })
      .then(
        () => null,
        (error: any) => error,
      );

    expect(rejection).toBeTruthy();

    const after = await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      const drawRequests = await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) => event.eventType === "active_build.draw.requested",
        ).length,
        drawRequestCount: drawRequests.length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.draw.requested" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
        plannedRows: plannedRows.map((row: any) => ({
          drawKey: row.drawKey,
          requestNote: row.requestNote,
          requestedAt: row.requestedAt,
          status: row.status,
        })),
      };
    });
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );

    expect(after).toEqual(before);
    expect(dashboard.drawRequests).toHaveLength(0);
    expect(rejection).toMatchObject({
      data: expect.objectContaining({
        code: "ACTIVE_BUILD_DRAW_REQUEST_INVALID",
        recoverable: true,
        safeMessage: expect.any(String),
      }),
    });
  });

  test("requires a nonblank rejection reason for active build draws", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: closing.buildId,
        clientOperationId: "reject-reason-required",
        drawKey: "draw-01",
        note: "Ready for review.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations review complete.",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "   ",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/reason/i);

    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/note/i);
    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/reason/i);

    const reason = "Invoice total does not match verified work.";
    await t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: receipt.requestKey,
      note: reason,
      workosOrganizationId: ORG,
    });
    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      nextAction: "Correct the request and submit it again for review.",
      requestReviewNote: reason,
      reviewedByWorkosUserId: "user_admin",
      status: "rejected",
    });
    const rejectionAudit = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .filter((q: any) =>
            q.eq(q.field("eventType"), "active_build.draw.rejected"),
          )
          .unique(),
    );
    expect(rejectionAudit).toMatchObject({
      actorRoles: expect.arrayContaining(["admin"]),
      actorWorkosUserId: "user_admin",
      command: "rejectActiveBuildDraw",
      newState: expect.any(String),
      priorState: expect.any(String),
      reason,
      warnings: [],
    });
  });

  test("requires backoffice authorization for the production backoffice dashboard", async () => {
    const { base, t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    await expect(
      withIdentity(base, ["builder"], "user_builder").query(
        (api as any).production_proposals.getBackofficeDashboard,
        { workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Forbidden: backoffice/);
    await expect(
      t.query((api as any).production_proposals.getBackofficeDashboard, {
        workosOrganizationId: "org_other",
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("allows brokerage proposal reads while limiting broker writes by assignment", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scoped proposal",
        location: "789 Scope Street",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    const broker = withIdentity(base, ["broker"], "user_broker");
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      proposal: { buildName: "Scoped proposal", status: "submitted" },
    });
    let brokerKanban = await broker.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerKanban.columns.flatMap((column: any) =>
        column.cards.map((card: any) => card.proposalId),
      ),
    ).toEqual([proposalId]);
    const brokerDashboard = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerDashboard.submittedProposals.map(
        (proposal: any) => proposal.proposalId,
      ),
    ).toEqual([proposalId]);
    await expect(
      broker.mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          drawKey: "draw-01",
          label: "Broker unassigned edit",
          proposalId,
          reason: "Unassigned broker should not edit submitted draw schedule.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden: proposal write/);

    await t.run(async (ctx: any) => {
      await ctx.db.patch(ctx.db.normalizeId("buildProposals", proposalId)!, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      proposal: { assignedBrokerWorkosUserId: "user_broker" },
    });
    await expect(
      broker.mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          drawKey: "draw-01",
          label: "Assigned broker edit",
          proposalId,
          reason: "Assigned broker edits submitted draw schedule.",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toBeNull();

    brokerKanban = await broker.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerKanban.columns.flatMap((column: any) =>
        column.cards.map((card: any) => card.proposalId),
      ),
    ).toEqual([proposalId]);

    const wrongOrg = "org_other";
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        createdAt: Date.now(),
        domains: [],
        name: "Other Org",
        sourceEventId: "seed_other_org",
        sourceEventType: "seed.production_foundation",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: wrongOrg,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: Date.now(),
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "seed_other_membership",
        sourceEventType: "seed.production_foundation",
        status: "active",
        updatedAt: Date.now(),
        workosMembershipId: "seed_other_membership",
        workosOrganizationId: wrongOrg,
        workosUserId: "user_broker",
      });
    });
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: wrongOrg,
      }),
    ).rejects.toThrow(/Forbidden/);

    await t.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_staff",
        email: "user_staff@example.com",
        name: "Staff",
        sourceEventId: "seed_staff",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosUserId: "user_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker-staff",
        roleSlugs: ["broker-staff"],
        sourceEventId: "seed_staff_membership",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosMembershipId: "seed_staff_membership",
        workosOrganizationId: ORG,
        workosUserId: "user_staff",
      });
    });
    const staffWithoutPermission = withIdentity(
      base,
      ["broker-staff"],
      "user_staff",
    );
    await expect(
      staffWithoutPermission.query(
        (api as any).production_proposals.getProposalDetail,
        {
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizationRoles", {
        name: "Broker Staff",
        permissionSlugs: ["proposals:read"],
        resourceTypeSlug: "organization",
        slug: "broker-staff",
        sourceEventId: "seed_staff_role",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosOrganizationId: ORG,
      });
    });
    await expect(
      staffWithoutPermission.query(
        (api as any).production_proposals.getProposalDetail,
        {
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({ proposal: { buildName: "Scoped proposal" } });
  });
});

describe("Sub-milestone Scope and Field Guidance lineage", () => {
  test("closing preserves canonical Scope and Guidance IDs, bytes, and active Build references", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Scope closing lineage proposal",
      "18 Scope Closing Lane",
    );
    const scope = '{ "type":"doc", "content": [{"type":"paragraph","content":[{"type":"text","text":"Exact Scope bytes before closing"}]}] }';
    const guidance = {
      cameraAnglesTiptapJson: tiptapDocument(
        "Capture north and east faces before the pour.",
      ),
      whatToVerifyTiptapJson: tiptapDocument(
        "Verify excavation depth and form dimensions.",
      ),
    };
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "scope-closing-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 128,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 50_000_000,
                durationDays: 12,
                fieldGuidance: guidance,
                key: "forms",
                name: "Forms and pour",
                order: 1,
                scopeOfWorkTiptapJson: scope,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    const before = await t.run(async (ctx: any) => {
      const proposalSubmilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .unique();
      const proposalMilestone = proposalSubmilestone
        ? await ctx.db.get(proposalSubmilestone.proposalMilestoneId)
        : null;
      const proposalDraws = await ctx.db
        .query("proposalDrawScheduleRows")
        .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
        .collect();
      const contract = proposalSubmilestone
        ? await ctx.db
            .query("submilestoneScopeContracts")
            .withIndex("by_proposalSubmilestoneId", (query: any) =>
              query.eq("proposalSubmilestoneId", proposalSubmilestone._id),
            )
            .unique()
        : null;
      const revision = contract?.activeDraftRevisionId
        ? await ctx.db.get(contract.activeDraftRevisionId)
        : null;
      const guidanceRow = proposalSubmilestone
        ? await ctx.db
            .query("submilestoneFieldGuidance")
            .withIndex("by_proposalSubmilestoneId", (query: any) =>
              query.eq("proposalSubmilestoneId", proposalSubmilestone._id),
            )
            .unique()
        : null;
      return {
        contract,
        guidance: guidanceRow,
        proposalMilestone,
        proposalDraws,
        proposalSubmilestone,
        revision,
      };
    });
    expect(before.revision).toMatchObject({
      scopeOfWorkTiptapJson: scope,
      status: "draft",
      version: 1,
    });
    expect(before.guidance).toMatchObject(guidance);

    await t.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.patch(before.proposalSubmilestone.brokerageId, {
        principalBrokerWorkosUserId: "user_admin",
      });
      await ctx.db.insert("users", {
        authId: "user_admin",
        createdAt: now,
        email: "user_admin@example.com",
        name: "Scope Closing Admin",
        sourceEventId: "scope_closing_admin_user",
        sourceEventType: "test.production_proposals",
        status: "active",
        updatedAt: now,
        workosUserId: "user_admin",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "principle-broker",
        roleSlugs: ["principle-broker"],
        sourceEventId: "scope_closing_admin_membership",
        sourceEventType: "test.production_proposals",
        status: "active",
        updatedAt: now,
        workosMembershipId: "scope_closing_admin_membership",
        workosOrganizationId: ORG,
        workosUserId: "user_admin",
      });
    });
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Scope closing lineage is approved.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-20",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Close the approved Scope package.",
        workosOrganizationId: ORG,
    });

    const after = await t.run(async (ctx: any) => {
      const contract = before.contract
        ? await ctx.db.get(before.contract._id)
        : null;
      const revision = before.revision
        ? await ctx.db.get(before.revision._id)
        : null;
      const guidanceRow = before.guidance
        ? await ctx.db.get(before.guidance._id)
        : null;
      const buildSubmilestone = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", before.proposalSubmilestone._id),
        )
        .unique();
      const buildMilestone = buildSubmilestone
        ? await ctx.db.get(buildSubmilestone.buildMilestoneId)
        : null;
      const plannedDraws = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query: any) => query.eq("buildId", closing.buildId))
        .collect();
      const evidenceAssets = await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (query: any) => query.eq("buildId", closing.buildId))
        .collect();
      return {
        buildMilestone,
        buildSubmilestone,
        contract,
        evidenceAssets,
        guidance: guidanceRow,
        plannedDraws,
        revision,
      };
    });
    expect(after.buildMilestone).toMatchObject({
      budgetCents: 50_000_000,
      dayEnd: before.proposalMilestone.dayEnd,
      dayStart: before.proposalMilestone.dayStart,
      durationDays: before.proposalMilestone.durationDays,
      key: "foundation",
      name: "Foundation",
      planningState: "active",
      status: "planned",
    });
    expect(after.buildSubmilestone).toMatchObject({
      buildId: closing.buildId,
      budgetCents: 50_000_000,
      durationDays: 12,
      key: "forms",
      name: "Forms and pour",
      order: 1,
      proposalSubmilestoneId: before.proposalSubmilestone._id,
      planningState: "active",
      startDay: before.proposalSubmilestone.startDay,
      status: "planned",
    });
    expect(after.buildSubmilestone).not.toHaveProperty(
      "scopeOfWorkTiptapJson",
    );
    expect(after.buildSubmilestone).not.toHaveProperty("actualCostCents");
    expect(after.buildSubmilestone).not.toHaveProperty("fieldNote");
    expect(after.buildSubmilestone).not.toHaveProperty("progressPercent");
    expect(after.buildSubmilestone).not.toHaveProperty(
      "completionForecastDate",
    );
    expect(after.buildSubmilestone).not.toHaveProperty(
      "evidencePackageRevisionId",
    );
    expect(after.buildSubmilestone).not.toHaveProperty("evidenceReviewState");
    expect(after.buildSubmilestone).not.toHaveProperty("reviewDecisionState");
    expect(after.buildSubmilestone).not.toHaveProperty("actualStartedAt");
    expect(after.buildSubmilestone).not.toHaveProperty("completedAt");
    expect(after.plannedDraws).toHaveLength(before.proposalDraws.length);
    expect(after.plannedDraws).toEqual(
      expect.arrayContaining(
        before.proposalDraws.map((draw: any) =>
          expect.objectContaining({
            amountCents: draw.amountCents,
            drawKey: draw.drawKey,
            label: draw.label,
            milestoneKey: draw.milestoneKey,
            order: draw.order,
            status: "planned",
            timingDay: draw.timingDay,
          }),
        ),
      ),
    );
    expect(after.evidenceAssets).toEqual([]);
    expect(after.contract).toMatchObject({
      _id: before.contract._id,
      buildId: closing.buildId,
      buildSubmilestoneId: after.buildSubmilestone._id,
      effectiveRevisionId: before.revision._id,
      latestVersion: 1,
    });
    expect(after.guidance).toMatchObject({
      _id: before.guidance._id,
      buildId: closing.buildId,
      buildSubmilestoneId: after.buildSubmilestone._id,
      ...guidance,
    });
    expect(after.revision).toMatchObject({
      _id: before.revision._id,
      scopeOfWorkTiptapJson: scope,
      status: "published",
      version: 1,
    });
  });

  test("rejects legacy active-Build Scope writes in execution and planning inputs", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        { budgetCents: 20_000_000, key: "forms", name: "Forms", order: 1 },
      ],
    });
    const before = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
    );

    await expect(
      admin.mutation(
        (api as any).production_proposals
          .updateActiveBuildSubmilestoneExecution,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          scopeOfWorkTiptapJson: tiptapDocument(
            "Legacy active execution Scope must be rejected.",
          ),
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        } as any,
      ),
    ).rejects.toThrow(/scopeOfWorkTiptapJson|extra|validator/i);

    await expect(
      admin.mutation(
        (api as any).production_proposals.updateActiveBuildTimelineMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          submilestones: [
            {
              budgetCents: 20_000_000,
              durationDays: 10,
              key: "forms",
              name: "Forms",
              order: 1,
              scopeOfWorkTiptapJson: tiptapDocument(
                "Legacy active planning Scope must be rejected.",
              ),
            },
          ],
          workosOrganizationId: ORG,
        } as any,
      ),
    ).rejects.toThrow(/scopeOfWorkTiptapJson|extra|validator/i);

    const after = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
    );
    expect(after).toEqual(before);
  });

  test("creates canonical Scope and Guidance lineage for new active-Build planning rows", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        { budgetCents: 20_000_000, key: "forms", name: "Forms", order: 1 },
      ],
    });
    const submilestones = [
      {
        budgetCents: 20_000_000,
        durationDays: 10,
        key: "forms",
        name: "Forms",
        order: 1,
      },
      {
        budgetCents: 5_000_000,
        durationDays: 3,
        key: "drainage",
        name: "Foundation drainage",
        order: 2,
      },
    ];

    for (let replay = 0; replay < 2; replay += 1) {
      await admin.mutation(
        (api as any).production_proposals.updateActiveBuildTimelineMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          submilestones,
          workosOrganizationId: ORG,
        },
      );
    }

    const lineage = await admin.run(async (ctx: any) => {
      const buildSubmilestones = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      const drainage = buildSubmilestones.find(
        (row: any) => row.key === "drainage" && row.planningState === "active",
      );
      if (!drainage) throw new Error("Expected active drainage Sub-milestone.");
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", drainage.proposalSubmilestoneId),
        )
        .unique();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", drainage.proposalSubmilestoneId),
        )
        .unique();
      const revisions = contract
        ? await ctx.db
            .query("submilestoneScopeRevisions")
            .withIndex("by_contractId_and_version", (query: any) =>
              query.eq("contractId", contract._id),
            )
            .collect()
        : [];
      return { contract, drainage, guidance, revisions };
    });

    expect(lineage.contract).toMatchObject({
      activeDraftRevisionId: lineage.revisions[0]?._id,
      buildId: closing.buildId,
      buildSubmilestoneId: lineage.drainage._id,
      latestVersion: 1,
      proposalSubmilestoneId: lineage.drainage.proposalSubmilestoneId,
    });
    expect(lineage.guidance).toMatchObject({
      buildId: closing.buildId,
      buildSubmilestoneId: lineage.drainage._id,
      cameraAnglesTiptapJson: JSON.stringify({
        content: [{ type: "paragraph" }],
        type: "doc",
      }),
      proposalSubmilestoneId: lineage.drainage.proposalSubmilestoneId,
      whatToVerifyTiptapJson: JSON.stringify({
        content: [{ type: "paragraph" }],
        type: "doc",
      }),
    });
    expect(lineage.revisions).toEqual([
      expect.objectContaining({
        scopeOfWorkTiptapJson: JSON.stringify({
          content: [{ type: "paragraph" }],
          type: "doc",
        }),
        status: "draft",
        version: 1,
      }),
    ]);
  });

  test("materializes dedicated Scope and Field Guidance owners from a draft package", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Canonical authoring proposal",
      "17 Canonical Authoring Lane",
    );
    const scope = tiptapDocument("Excavate and form to the issued drawings.");
    const guidance = {
      cameraAnglesTiptapJson: tiptapDocument("Capture the north and east faces."),
      whatToVerifyTiptapJson: tiptapDocument("Verify excavation depth and forms."),
    };
    const saveArgs = {
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 30,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 30,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [
            {
              budgetCents: 20_000_000,
              durationDays: 12,
              fieldGuidance: guidance,
              key: "forms",
              name: "Forms and pour",
              order: 1,
              scopeOfWorkTiptapJson: scope,
            },
          ],
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    };

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      saveArgs,
    );
    const firstState = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      scopes: await ctx.db.query("submilestoneScopeContracts").collect(),
      submilestones: await ctx.db.query("proposalSubmilestones").collect(),
    }));
    expect(firstState.scopes).toHaveLength(1);
    expect(firstState.revisions).toHaveLength(1);
    expect(firstState.revisions[0]).toMatchObject({
      scopeOfWorkTiptapJson: scope,
      status: "draft",
      version: 1,
    });
    expect(firstState.guidance).toHaveLength(1);
    expect(firstState.guidance[0]).toMatchObject(guidance);

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      saveArgs,
    );
    const secondState = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      scopes: await ctx.db.query("submilestoneScopeContracts").collect(),
      submilestones: await ctx.db.query("proposalSubmilestones").collect(),
    }));
    expect(secondState.scopes).toHaveLength(1);
    expect(secondState.revisions).toHaveLength(1);
    expect(secondState.guidance).toHaveLength(1);
    expect(secondState.scopes[0]._id).toBe(firstState.scopes[0]._id);
    expect(secondState.revisions[0]._id).toBe(firstState.revisions[0]._id);
    expect(secondState.guidance[0]._id).toBe(firstState.guidance[0]._id);
    expect(secondState.submilestones[0]._id).toBe(
      firstState.submilestones[0]._id,
    );
  });

  test("publishes non-empty v1 Scope drafts atomically with submission and skips empty optional Scope", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Scope submission proposal",
      "19 Scope Submission Lane",
    );
    const scope = tiptapDocument("Complete the concrete foundation work.");
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                key: "concrete",
                name: "Concrete",
                order: 1,
                scopeOfWorkTiptapJson: scope,
              },
              {
                key: "inspection",
                name: "Inspection",
                order: 2,
                scopeOfWorkTiptapJson: EMPTY_TIPTAP_DOCUMENT,
              },
              {
                key: "cleanup",
                name: "Cleanup",
                order: 3,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const snapshotId = await submitProposalForTest(t, proposalId);
    expect(snapshotId).toBeTruthy();
    const state = await t.run(async (ctx: any) => ({
      audits: await ctx.db.query("auditEvents").collect(),
      contracts: await ctx.db.query("submilestoneScopeContracts").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(state.proposal?.status).toBe("submitted");
    expect(state.contracts).toHaveLength(3);
    const published = state.revisions.find(
      (revision: any) => revision.scopeOfWorkTiptapJson === scope,
    );
    const empty = state.revisions.filter(
      (revision: any) =>
        revision.scopeOfWorkTiptapJson === EMPTY_TIPTAP_DOCUMENT,
    );
    expect(published).toMatchObject({ status: "published", version: 1 });
    expect(empty).toHaveLength(2);
    expect(empty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "draft", version: 1 }),
        expect.objectContaining({ status: "draft", version: 1 }),
      ]),
    );
    const publishedContract = state.contracts.find(
      (contract: any) => contract.effectiveRevisionId === published?._id,
    );
    expect(publishedContract?.activeDraftRevisionId).toBeUndefined();
    const emptyRevisionIds = new Set(empty.map((revision: any) => revision._id));
    const emptyContracts = state.contracts.filter(
      (contract: any) => emptyRevisionIds.has(contract.activeDraftRevisionId),
    );
    expect(emptyContracts).toHaveLength(2);
    expect(
      emptyContracts.every(
        (contract: any) => contract.effectiveRevisionId === undefined,
      ),
    ).toBe(true);
    expect(
      state.audits.filter(
        (audit: any) =>
          audit.eventType === "submilestone_scope_revision.published",
      ),
    ).toEqual([
      expect.objectContaining({
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        command: "publishSubmilestoneScopeRevision",
        entityId: String(published?._id),
        entityType: "submilestoneScopeRevision",
        newState: expect.any(String),
        priorState: expect.any(String),
        warnings: [],
      }),
    ]);
  });

  test("keeps an empty v1 unpublished until post-submission borrower acknowledgement", async () => {
    const {
      base,
      brokerageId,
      builderProfileId,
      proposalId,
      t,
    } = await directAdminProposalFixture(
      "Post-submission Scope proposal",
      "21 Post-submission Scope Lane",
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                key: "inspection",
                name: "Inspection",
                order: 1,
                scopeOfWorkTiptapJson: EMPTY_TIPTAP_DOCUMENT,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    const initial = await t.run(async (ctx: any) => {
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .unique();
      const revision = contract?.activeDraftRevisionId
        ? await ctx.db.get(contract.activeDraftRevisionId)
        : null;
      return { contract, revision };
    });
    expect(initial.contract).toBeTruthy();
    expect(initial.revision).toMatchObject({ status: "draft", version: 1 });

    const revisionId = initial.revision._id;
    await t.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId,
        scopeOfWorkTiptapJson: tiptapDocument(
          "Complete the inspection against the issued drawings.",
        ),
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).submilestone_scope_contracts
        .publishSubmilestoneScopeRevision,
      { revisionId, workosOrganizationId: ORG },
    );
    const publishedBeforeAck = await t.run(async (ctx: any) => {
      const revision = await ctx.db.get(revisionId);
      const contract = revision ? await ctx.db.get(revision.contractId) : null;
      return { contract, revision };
    });
    expect(publishedBeforeAck.revision).toMatchObject({
      _id: revisionId,
      status: "published",
      version: 1,
    });
    expect(publishedBeforeAck.contract?.effectiveRevisionId).toBeUndefined();

    await base.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        brokerageId,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const acknowledgement = await builder.mutation(
      (api as any).submilestone_scope_contracts
        .acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "post-submission-scope-ack-001",
        revisionId,
        workosOrganizationId: ORG,
      },
    );
    expect(acknowledgement.effectiveRevisionId).toBe(revisionId);
    const effectiveContract = await t.run(async (ctx: any) => {
      const revision = await ctx.db.get(revisionId);
      return revision ? await ctx.db.get(revision.contractId) : null;
    });
    expect(effectiveContract?.effectiveRevisionId).toBe(revisionId);
  });

  test("does not make a v1 effective when re-submitting a previously submitted draft", async () => {
    const {
      base,
      brokerageId,
      builderProfileId,
      proposalId,
      t,
    } = await directAdminProposalFixture(
      "Resubmitted Scope proposal",
      "22 Resubmitted Scope Lane",
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                key: "inspection",
                name: "Inspection",
                order: 1,
                scopeOfWorkTiptapJson: EMPTY_TIPTAP_DOCUMENT,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.requestChanges, {
      proposalId,
      reason: "Return the proposal for a scope correction.",
      workosOrganizationId: ORG,
    });

    const initial = await t.run(async (ctx: any) => {
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .unique();
      const revision = contract?.activeDraftRevisionId
        ? await ctx.db.get(contract.activeDraftRevisionId)
        : null;
      const proposal = await ctx.db.get(proposalId);
      return { contract, proposal, revision };
    });
    expect(initial.proposal).toMatchObject({
      status: "draft",
      submittedAt: expect.any(Number),
    });
    expect(initial.revision).toMatchObject({ status: "draft", version: 1 });
    const revisionId = initial.revision._id;

    await t.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId,
        scopeOfWorkTiptapJson: tiptapDocument(
          "Complete the inspection against the issued drawings.",
        ),
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    const afterResubmission = await t.run(async (ctx: any) => {
      const revision = await ctx.db.get(revisionId);
      const contract = revision ? await ctx.db.get(revision.contractId) : null;
      const proposal = await ctx.db.get(proposalId);
      return { contract, proposal, revision };
    });
    expect(afterResubmission.proposal).toMatchObject({ status: "submitted" });
    expect(afterResubmission.revision).toMatchObject({
      _id: revisionId,
      status: "published",
      version: 1,
    });
    expect(afterResubmission.contract?.effectiveRevisionId).toBeUndefined();

    await base.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        brokerageId,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder",
      });
      await ctx.db.patch(proposalId, { status: "approved", updatedAt: now });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const lenderAdmin = withIdentity(
      base,
      ["principle-broker"],
      "user_principle_broker",
    );
    const acknowledgement = await builder.mutation(
      (api as any).submilestone_scope_contracts
        .acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "resubmitted-scope-ack-001",
        revisionId,
        workosOrganizationId: ORG,
      },
    );
    expect(acknowledgement.effectiveRevisionId).toBeNull();

    const approval = await lenderAdmin.mutation(
      (api as any).submilestone_scope_contracts
        .approveSubmilestoneScopeRevision,
      {
        idempotencyKey: "resubmitted-scope-approval-001",
        revisionId,
        workosOrganizationId: ORG,
      },
    );
    expect(approval.effectiveRevisionId).toBe(revisionId);
  });

  test("removes abandoned draft Scope and Guidance while preserving same-key lineage IDs", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Draft Scope removal proposal",
      "23 Draft Scope Removal Lane",
    );
    const keepScope = tiptapDocument("Keep the foundation forms aligned.");
    const removeScope = tiptapDocument("Remove this abandoned excavation scope.");
    const keepGuidance = {
      cameraAnglesTiptapJson: tiptapDocument("Capture the kept forms from two angles."),
      whatToVerifyTiptapJson: tiptapDocument("Verify the kept forms before the pour."),
    };
    const removeGuidance = {
      cameraAnglesTiptapJson: tiptapDocument("Capture the abandoned excavation."),
      whatToVerifyTiptapJson: tiptapDocument("Verify the abandoned excavation."),
    };
    const packageArgs = (submilestones: Array<Record<string, unknown>>) => ({
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 30,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 30,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones,
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    });

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      packageArgs([
        {
          budgetCents: 20_000_000,
          fieldGuidance: keepGuidance,
          key: "keep",
          name: "Keep this sub-milestone",
          order: 1,
          scopeOfWorkTiptapJson: keepScope,
        },
        {
          budgetCents: 30_000_000,
          fieldGuidance: removeGuidance,
          key: "remove",
          name: "Remove this sub-milestone",
          order: 2,
          scopeOfWorkTiptapJson: removeScope,
        },
      ]),
    );
    const firstState = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      scopes: await ctx.db.query("submilestoneScopeContracts").collect(),
      submilestones: await ctx.db.query("proposalSubmilestones").collect(),
    }));
    const firstKeep = firstState.submilestones.find(
      (row: any) => row.key === "keep",
    );
    const firstRemove = firstState.submilestones.find(
      (row: any) => row.key === "remove",
    );
    const firstKeepScope = firstState.scopes.find(
      (row: any) => row.proposalSubmilestoneId === firstKeep?._id,
    );
    const firstRemoveScope = firstState.scopes.find(
      (row: any) => row.proposalSubmilestoneId === firstRemove?._id,
    );
    const firstKeepRevision = firstState.revisions.find(
      (row: any) => row.contractId === firstKeepScope?._id,
    );
    const firstRemoveRevision = firstState.revisions.find(
      (row: any) => row.contractId === firstRemoveScope?._id,
    );
    const firstKeepGuidance = firstState.guidance.find(
      (row: any) => row.proposalSubmilestoneId === firstKeep?._id,
    );
    const firstRemoveGuidance = firstState.guidance.find(
      (row: any) => row.proposalSubmilestoneId === firstRemove?._id,
    );
    expect(firstKeep).toBeTruthy();
    expect(firstRemove).toBeTruthy();
    expect(firstKeepScope).toBeTruthy();
    expect(firstRemoveScope).toBeTruthy();
    expect(firstKeepRevision).toMatchObject({ status: "draft", version: 1 });
    expect(firstRemoveRevision).toMatchObject({ status: "draft", version: 1 });
    expect(firstKeepGuidance).toBeTruthy();
    expect(firstRemoveGuidance).toBeTruthy();

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      packageArgs([
        {
          budgetCents: 50_000_000,
          fieldGuidance: keepGuidance,
          key: "keep",
          name: "Keep this sub-milestone",
          order: 1,
          scopeOfWorkTiptapJson: keepScope,
        },
      ]),
    );
    const secondState = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      scopes: await ctx.db.query("submilestoneScopeContracts").collect(),
      submilestones: await ctx.db.query("proposalSubmilestones").collect(),
    }));
    expect(secondState.submilestones).toHaveLength(1);
    expect(secondState.submilestones[0]).toMatchObject({ key: "keep" });
    expect(secondState.submilestones[0]._id).toBe(firstKeep._id);
    expect(secondState.scopes).toHaveLength(1);
    expect(secondState.scopes[0]._id).toBe(firstKeepScope._id);
    expect(secondState.scopes[0].proposalSubmilestoneId).toBe(firstKeep._id);
    expect(secondState.revisions).toHaveLength(1);
    expect(secondState.revisions[0]._id).toBe(firstKeepRevision._id);
    expect(secondState.guidance).toHaveLength(1);
    expect(secondState.guidance[0]._id).toBe(firstKeepGuidance._id);
    const removedRows = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.get(firstRemoveGuidance._id),
      revision: await ctx.db.get(firstRemoveRevision._id),
      scope: await ctx.db.get(firstRemoveScope._id),
      submilestone: await ctx.db.get(firstRemove._id),
    }));
    expect(removedRows).toEqual({
      guidance: null,
      revision: null,
      scope: null,
      submilestone: null,
    });
  });

  test("fails closed when draft package replacement would remove published Scope lineage", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Published Scope removal proposal",
      "25 Published Scope Removal Lane",
    );
    const scope = tiptapDocument("Publish this Scope before replacement.");
    const packageArgs = (submilestones: Array<Record<string, unknown>>) => ({
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 30,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 30,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones,
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    });

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      packageArgs([
        {
          budgetCents: 50_000_000,
          key: "published",
          name: "Published Scope",
          order: 1,
          scopeOfWorkTiptapJson: scope,
        },
      ]),
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.requestChanges, {
      proposalId,
      reason: "Replace the draft timeline after review.",
      workosOrganizationId: ORG,
    });
    const before = await t.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .unique();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .unique();
      const revision = contract?.effectiveRevisionId
        ? await ctx.db.get(contract.effectiveRevisionId)
        : null;
      return { contract, revision, submilestone };
    });
    expect(before.revision).toMatchObject({ status: "published", version: 1 });
    expect(before.contract?.effectiveRevisionId).toBe(before.revision?._id);

    await expect(
      t.mutation(
        (api as any).production_proposals.saveDraftProposalPackage,
        packageArgs([
          {
            budgetCents: 50_000_000,
            key: "replacement",
            name: "Replacement Scope",
            order: 1,
          },
        ]),
      ),
    ).rejects.toThrow(/Published Scope lineage cannot be removed/);

    const after = await t.run(async (ctx: any) => {
      const submilestones = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .collect();
      const contract = await ctx.db.get(before.contract?._id);
      const revision = await ctx.db.get(before.revision?._id);
      return { contract, revision, submilestones };
    });
    expect(after.submilestones).toEqual([before.submilestone]);
    expect(after.contract).toEqual(before.contract);
    expect(after.revision).toEqual(before.revision);
  });

  test("rejects package Scope and Guidance writes after first submission even when status returns to draft", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Post-submission package write proposal",
      "27 Post-submission Package Write Lane",
    );
    const packageArgs = (submilestone: Record<string, unknown>) => ({
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 30,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 30,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [submilestone],
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      packageArgs({
        budgetCents: 50_000_000,
        key: "inspection",
        name: "Inspection",
        order: 1,
      }),
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.requestChanges, {
      proposalId,
      reason: "Return the package for a lender review correction.",
      workosOrganizationId: ORG,
    });
    const scope = tiptapDocument("Scope must not be written post-submission.");
    const fieldGuidance = {
      cameraAnglesTiptapJson: tiptapDocument(
        "Guidance must not be written post-submission.",
      ),
      whatToVerifyTiptapJson: tiptapDocument(
        "Verification must not be written post-submission.",
      ),
    };
    await expect(
      t.mutation(
        (api as any).production_proposals.saveDraftProposalPackage,
        packageArgs({
          budgetCents: 50_000_000,
          fieldGuidance,
          key: "inspection",
          name: "Inspection",
          order: 1,
          scopeOfWorkTiptapJson: scope,
        }),
      ),
    ).rejects.toThrow(/Scope authoring is unavailable/);
    const state = await t.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
      submilestones: await ctx.db.query("proposalSubmilestones").collect(),
    }));
    expect(state.guidance).toHaveLength(1);
    expect(state.revisions).toEqual([
      expect.objectContaining({
        scopeOfWorkTiptapJson: EMPTY_TIPTAP_DOCUMENT,
        status: "draft",
        version: 1,
      }),
    ]);
    expect(state.submilestones).toHaveLength(1);
    expect("scopeOfWorkTiptapJson" in state.submilestones[0]).toBe(false);
  });

  test("fails closed instead of inserting a duplicate v1 after a published pointer is cleared", async () => {
    const { proposalId, t } = await directAdminProposalFixture(
      "Cleared Scope pointer proposal",
      "29 Cleared Scope Pointer Lane",
    );
    const scope = tiptapDocument("Published v1 must remain unique.");
    const packageArgs = {
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 40_000_000,
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 30,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 30,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [
            {
              budgetCents: 50_000_000,
              key: "inspection",
              name: "Inspection",
              order: 1,
              scopeOfWorkTiptapJson: scope,
            },
          ],
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    };
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      packageArgs,
    );
    await submitProposalForTest(t, proposalId);
    const published = await t.run(async (ctx: any) => {
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .unique();
      const revision = contract?.effectiveRevisionId
        ? await ctx.db.get(contract.effectiveRevisionId)
        : null;
      await ctx.db.patch(proposalId, {
        status: "draft",
        submittedAt: undefined,
      });
      if (contract) {
        await ctx.db.patch(contract._id, {
          activeDraftRevisionId: undefined,
          effectiveRevisionId: undefined,
          latestVersion: 1,
        });
      }
      return { contract, revision };
    });
    expect(published.revision).toMatchObject({ status: "published", version: 1 });

    await expect(
      t.mutation(
        (api as any).production_proposals.saveDraftProposalPackage,
        packageArgs,
      ),
    ).rejects.toThrow(/Published Scope revisions cannot be changed/);
    const state = await t.run(async (ctx: any) => ({
      contracts: await ctx.db.query("submilestoneScopeContracts").collect(),
      revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
    }));
    expect(state.contracts).toHaveLength(1);
    expect(state.revisions).toHaveLength(1);
    expect(state.revisions[0]).toMatchObject({
      _id: published.revision?._id,
      scopeOfWorkTiptapJson: scope,
      status: "published",
      version: 1,
    });
  });
});

describe("Site Visit Field Guidance snapshots", () => {
  test("rejects trimmed-empty Sub-milestone keys instead of silently selecting the whole milestone", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms and pour", order: 1 }],
    });

    await expect(
      admin.mutation(
        (api as any).production_proposals.scheduleActiveBuildSiteVisit,
        {
          buildId: closing.buildId,
          idempotencyKey: "site-visit-guidance-empty-key",
          milestoneKey: "foundation",
          requestedDay: 21,
          submilestoneKeys: ["  "],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/empty Sub-milestone key/i);

    const visits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
    );
    expect(visits).toHaveLength(0);
  });

  test("assigns unique deterministic snapshot order when roadmap rows share an order", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        { key: "forms", name: "Forms and pour", order: 1 },
        { key: "excavation", name: "Excavation", order: 1 },
      ],
    });
    const lineage = await admin.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      return rows.map((row: any) => ({
        buildSubmilestoneId: row._id,
        proposalSubmilestoneId: row.proposalSubmilestoneId,
      }));
    });
    const guidanceSections = lineage.map((row: any, index: number) => ({
      ...row,
      cameraAnglesTiptapJson: tiptapDocument(`Angle ${index}.`),
      whatToVerifyTiptapJson: tiptapDocument(`Verify ${index}.`),
    }));

    const visit = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        idempotencyKey: "site-visit-guidance-duplicate-order",
        milestoneKey: "foundation",
        requestedDay: 21,
        submilestoneGuidanceSections: guidanceSections,
        submilestoneKeys: ["forms", "excavation"],
        workosOrganizationId: ORG,
      },
    );
    const snapshotOrders = await admin.run(async (ctx: any) => {
      const visitRow = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (query: any) => query.eq("visitId", visit.visitId))
        .unique();
      const sections = await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildSiteVisitId_and_order", (query: any) =>
          query.eq("buildSiteVisitId", visitRow?._id),
        )
        .collect();
      return sections
        .sort((left: any, right: any) => left.order - right.order)
        .map((section: any) => ({
          key: section.submilestoneKey,
          order: section.order,
        }));
    });

    expect(snapshotOrders.map((section: any) => section.order)).toEqual([1, 2]);
    expect(snapshotOrders.map((section: any) => section.key)).toEqual([
      "excavation",
      "forms",
    ]);
  });

  test("assign retries return the original Visit and reject a changed request", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const args = {
      buildId: closing.buildId,
      idempotencyKey: "assign-site-visit-retry",
      milestoneKey: "foundation",
      note: "Inspect the foundation.",
      requestedDay: 21,
      workosOrganizationId: ORG,
    };

    const first = await admin.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      args,
    );
    const replay = await admin.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      args,
    );
    expect(replay.visitId).toBe(first.visitId);

    await expect(
      admin.mutation(
        (api as any).production_proposals.scheduleActiveBuildSiteVisit,
        args,
      ),
    ).rejects.toThrow(/idempotency key/i);

    await expect(
      admin.mutation(
        (api as any).production_proposals.assignActiveBuildSiteVisit,
        { ...args, note: "Changed request must conflict." },
      ),
    ).rejects.toThrow(/idempotency key/i);

    const visits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
    );
    expect(visits).toHaveLength(1);
  });

  test("replays a schedule row written with the pre-command fingerprint", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms and pour", order: 1 }],
    });
    const verification = tiptapDocument("Verify the forms.");
    const cameraAngles = tiptapDocument("Capture the forms from the east.");
    const args = {
      buildId: closing.buildId,
      idempotencyKey: "schedule-pre-command-replay",
      milestoneKey: "foundation",
      requestedDay: 21,
      submilestoneKeys: ["forms"],
      submilestoneGuidanceSections: [] as Array<{
        buildSubmilestoneId: any;
        proposalSubmilestoneId: any;
        whatToVerifyTiptapJson: string;
        cameraAnglesTiptapJson: string;
      }>,
      workosOrganizationId: ORG,
    };
    const lineage = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .unique();
      return {
        buildSubmilestoneId: row._id,
        proposalSubmilestoneId: row.proposalSubmilestoneId,
      };
    });
    args.submilestoneGuidanceSections = [
      {
        ...lineage,
        cameraAnglesTiptapJson: cameraAngles,
        whatToVerifyTiptapJson: verification,
      },
    ];
    const first = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      args,
    );
    const persisted = await admin.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (query: any) => query.eq("visitId", first.visitId))
        .unique();
      const sections = await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildSiteVisitId_and_order", (query: any) =>
          query.eq("buildSiteVisitId", visit._id),
        )
        .collect();
      return { sections, visit };
    });
    const legacyFingerprint = await operationalRequestFingerprint({
      milestoneKey: "foundation",
      note: null,
      requestedDay: 21,
      requestedTime: null,
      siteVisitGuidance: first.siteVisitGuidance,
      submilestoneGuidanceSections: persisted.sections
        .slice()
        .sort((left: any, right: any) => left.order - right.order)
        .map((section: any) => ({
          buildSubmilestoneId: String(section.buildSubmilestoneId),
          cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
          proposalSubmilestoneId: String(section.proposalSubmilestoneId),
          whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
        })),
      submilestoneKeys: ["forms"],
    });
    expect(legacyFingerprint).not.toBe(persisted.visit.scheduleRequestFingerprint);
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(persisted.visit._id, {
        scheduleRequestFingerprint: legacyFingerprint,
      });
    });

    const replay = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      args,
    );
    expect(replay.visitId).toBe(first.visitId);
    const visits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query: any) => query.eq("buildId", closing.buildId))
        .collect(),
    );
    expect(visits).toHaveLength(1);
  });

  test("returns a dedicated invalid state when Visit guidance snapshots exceed capacity", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms and pour", order: 1 }],
    });
    const lineage = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .unique();
      return {
        buildSubmilestoneId: row._id,
        proposalSubmilestoneId: row.proposalSubmilestoneId,
      };
    });
    const visit = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        idempotencyKey: "site-visit-guidance-capacity",
        milestoneKey: "foundation",
        requestedDay: 21,
        submilestoneKeys: ["forms"],
        submilestoneGuidanceSections: [
          {
            ...lineage,
            cameraAnglesTiptapJson: tiptapDocument("Capture the forms."),
            whatToVerifyTiptapJson: tiptapDocument("Verify the forms."),
          },
        ],
        workosOrganizationId: ORG,
      },
    );
    const source = await admin.run(async (ctx: any) => {
      const visitRow = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (query: any) => query.eq("visitId", visit.visitId))
        .unique();
      const section = await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildSiteVisitId_and_order", (query: any) =>
          query.eq("buildSiteVisitId", visitRow._id),
        )
        .unique();
      return { section, visitRow };
    });
    await admin.run(async (ctx: any) => {
      const { _id, _creationTime, ...snapshot } = source.section;
      for (let order = 2; order <= 501; order += 1) {
        await ctx.db.insert("buildSiteVisitGuidanceSections", {
          ...snapshot,
          order,
        });
      }
    });

    const state = await admin.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      { buildId: String(closing.buildId), token: visit.visitId },
    );
    expect(state).toMatchObject({
      available: false,
      build: expect.any(Object),
      files: [],
      reason: "guidance_sections_overflow",
      status: "invalid",
      targets: [],
      visit: null,
    });
  });

  test("saves canonical pairs and immutable ordered snapshots atomically", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [
        { key: "forms", name: "Forms and pour", order: 1 },
        { key: "excavation", name: "Excavation", order: 2 },
      ],
    });
    const lineage = await admin.run(async (ctx: any) => {
      const buildSubmilestones = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      return buildSubmilestones
        .sort((left: any, right: any) => left.order - right.order)
        .map((buildSubmilestone: any) => ({
          buildSubmilestoneId: buildSubmilestone._id,
          proposalSubmilestoneId: buildSubmilestone.proposalSubmilestoneId,
        }));
    });
    const [forms, excavation] = lineage;
    const formsVerification = tiptapDocument("Verify the forms.");
    const formsAngles = tiptapDocument("Capture the forms from the east.");
    const excavationVerification = tiptapDocument("Verify excavation depth.");
    const excavationAngles = tiptapDocument("Capture the excavation from north.");

    await expect(
      admin.mutation(
        (api as any).production_proposals.scheduleActiveBuildSiteVisit,
        {
          buildId: closing.buildId,
          idempotencyKey: "site-visit-guidance-invalid",
          milestoneKey: "foundation",
          requestedDay: 21,
          submilestoneKeys: ["forms", "excavation"],
          submilestoneGuidanceSections: [
            {
              buildSubmilestoneId: forms.buildSubmilestoneId,
              proposalSubmilestoneId: forms.proposalSubmilestoneId,
              whatToVerifyTiptapJson: EMPTY_TIPTAP_DOCUMENT,
              cameraAnglesTiptapJson: formsAngles,
            },
            {
              buildSubmilestoneId: excavation.buildSubmilestoneId,
              proposalSubmilestoneId: excavation.proposalSubmilestoneId,
              whatToVerifyTiptapJson: excavationVerification,
              cameraAnglesTiptapJson: excavationAngles,
            },
          ],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/whatToVerify|semantic|content|empty/i);

    const beforeValid = await admin.run(async (ctx: any) => ({
      visits: await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
      sections: await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildId", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect(),
      guidance: await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", forms.proposalSubmilestoneId),
        )
        .unique(),
    }));
    expect(beforeValid.visits).toHaveLength(0);
    expect(beforeValid.sections).toHaveLength(0);
    expect(beforeValid.guidance).toMatchObject({
      cameraAnglesTiptapJson: EMPTY_TIPTAP_DOCUMENT,
      whatToVerifyTiptapJson: EMPTY_TIPTAP_DOCUMENT,
    });

    const visitArgs = {
      buildId: closing.buildId,
      idempotencyKey: "site-visit-guidance-valid",
      milestoneKey: "foundation",
      note: "Confirm the ordered guidance package.",
      requestedDay: 21,
      submilestoneKeys: ["forms", "excavation"],
      submilestoneGuidanceSections: [
        {
          buildSubmilestoneId: forms.buildSubmilestoneId,
          proposalSubmilestoneId: forms.proposalSubmilestoneId,
          whatToVerifyTiptapJson: formsVerification,
          cameraAnglesTiptapJson: formsAngles,
        },
        {
          buildSubmilestoneId: excavation.buildSubmilestoneId,
          proposalSubmilestoneId: excavation.proposalSubmilestoneId,
          whatToVerifyTiptapJson: excavationVerification,
          cameraAnglesTiptapJson: excavationAngles,
        },
      ],
      workosOrganizationId: ORG,
    };
    const visit = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      visitArgs,
    );
    const persisted = await admin.run(async (ctx: any) => {
      const visitRow = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (query: any) => query.eq("visitId", visit.visitId))
        .unique();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", forms.proposalSubmilestoneId),
        )
        .unique();
      const sections = await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildSiteVisitId_and_order", (query: any) =>
          query.eq("buildSiteVisitId", visitRow?._id),
        )
        .collect();
      return { guidance, sections, visitRow };
    });
    expect(persisted.guidance).toMatchObject({
      buildId: closing.buildId,
      buildSubmilestoneId: forms.buildSubmilestoneId,
      cameraAnglesTiptapJson: formsAngles,
      whatToVerifyTiptapJson: formsVerification,
    });
    expect(persisted.sections).toEqual([
      expect.objectContaining({
        buildSiteVisitId: persisted.visitRow?._id,
        buildSubmilestoneId: forms.buildSubmilestoneId,
        cameraAnglesTiptapJson: formsAngles,
        order: 1,
        submilestoneKey: "forms",
        submilestoneName: "Forms and pour",
        whatToVerifyTiptapJson: formsVerification,
      }),
      expect.objectContaining({
        buildSiteVisitId: persisted.visitRow?._id,
        buildSubmilestoneId: excavation.buildSubmilestoneId,
        cameraAnglesTiptapJson: excavationAngles,
        order: 2,
        submilestoneKey: "excavation",
        submilestoneName: "Excavation",
        whatToVerifyTiptapJson: excavationVerification,
      }),
    ]);
    const updatedAt = persisted.guidance?.updatedAt;
    const replay = await admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      visitArgs,
    );
    expect(replay.visitId).toBe(visit.visitId);
    const afterReplay = await admin.run(async (ctx: any) => {
      const guidance = await ctx.db.get(persisted.guidance!._id);
      const sections = await ctx.db
        .query("buildSiteVisitGuidanceSections")
        .withIndex("by_buildSiteVisitId_and_order", (query: any) =>
          query.eq("buildSiteVisitId", persisted.visitRow?._id),
        )
        .collect();
      return { guidance, sections };
    });
    expect(afterReplay.guidance?.updatedAt).toBe(updatedAt);
    expect(afterReplay.sections).toHaveLength(2);

    await admin.mutation(
      (api as any).submilestone_field_guidance.saveSubmilestoneFieldGuidance,
      {
        proposalSubmilestoneId: forms.proposalSubmilestoneId,
        whatToVerifyTiptapJson: tiptapDocument("Changed after scheduling."),
        cameraAnglesTiptapJson: tiptapDocument("New angle after scheduling."),
        workosOrganizationId: ORG,
      },
    );
    const tokenState = await admin.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      { buildId: String(closing.buildId), token: visit.visitId },
    );
    expect(tokenState.targets[0].guidanceSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildSubmilestoneId: String(forms.buildSubmilestoneId),
          whatToVerifyTiptapJson: formsVerification,
          cameraAnglesTiptapJson: formsAngles,
        }),
      ]),
    );

    await admin.run(async (ctx: any) => {
      const { _creationTime, _id, ...snapshot } = persisted.sections[0];
      await ctx.db.insert("buildSiteVisitGuidanceSections", {
        ...snapshot,
        order: 99,
        organizationId: "org_other",
      });
    });
    const corruptTokenState = await admin.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      { buildId: String(closing.buildId), token: visit.visitId },
    );
    expect(corruptTokenState).toMatchObject({
      available: false,
      reason: "not_found",
      status: "invalid",
    });
  });
});

describe("recipient delivery inbox", () => {
  test("serves only recipient-scoped deliveries and supports legal read, dismiss, and resolve actions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const builderDeliveryId = await admin.run(async (ctx: any) =>
      ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open build",
        actionRequired: true,
        body: "Review the returned milestone decision and continue the build.",
        brokerageId: seed.brokerageId,
        createdAt: now,
        dedupeKey: "milestone-return:build-01:foundation",
        entityId: "build-01",
        entityLabel: "Builder Active Build · Foundation",
        entityType: "activeBuild",
        href: "/builder/builds/build-01?milestone=foundation",
        organizationId: ORG,
        recipientWorkosUserId: "user_builder",
        resolutionMode: "recipient",
        sourceLabel: "Lender Operations",
        status: "unread",
        title: "Milestone decision returned",
        updatedAt: now,
      }),
    );
    await admin.run(async (ctx: any) =>
      ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open proposal",
        actionRequired: true,
        body: "This delivery belongs to another recipient.",
        brokerageId: seed.brokerageId,
        createdAt: now,
        dedupeKey: "proposal-review:other",
        entityId: "proposal-other",
        entityLabel: "Other proposal",
        entityType: "proposal",
        href: "/builder/proposals/proposal-other",
        organizationId: ORG,
        recipientWorkosUserId: "user_other",
        resolutionMode: "domain",
        sourceLabel: "DrawFlow",
        status: "unread",
        title: "Other recipient delivery",
        updatedAt: now,
      }),
    );
    await grantOrgMembership(admin, {
      roleSlugs: ["builder"],
      subject: "user_other",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const other = withIdentity(base, ["builder"], "user_other");

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox).toMatchObject({
      actionRequiredCount: 1,
      unreadCount: 1,
    });
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        _id: builderDeliveryId,
        actionLabel: "Open build",
        entityLabel: "Builder Active Build · Foundation",
        resolutionMode: "recipient",
        sourceLabel: "Lender Operations",
        status: "unread",
        title: "Milestone decision returned",
      }),
    ]);
    expect(JSON.stringify(inbox)).not.toMatch(
      /recipientWorkosUserId|payloadPreview|requestId|stack/i,
    );

    await builder.mutation(
      (api as any).production_proposals.markRecipientDeliveryRead,
      { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
    );
    await expect(
      other.mutation(
        (api as any).production_proposals.dismissRecipientDelivery,
        { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Delivery unavailable/);
    await builder.mutation(
      (api as any).production_proposals.resolveRecipientDelivery,
      { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
    );

    await expect(
      builder.query((api as any).production_proposals.listRecipientInbox, {
        includeResolved: true,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      actionRequiredCount: 0,
      deliveries: [expect.objectContaining({ status: "resolved" })],
      unreadCount: 0,
    });
  });

  test("deduplicates repeated milestone decision deliveries while preserving workflow audit", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "delivery-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );
    for (const note of [
      "Add the missing footing photos.",
      "Add the missing footing photos before resubmitting.",
    ]) {
      await admin.mutation(
        (api as any).production_proposals.rejectActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note,
          workosOrganizationId: ORG,
        },
      );
    }

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        actionLabel: "Review milestone",
        entityId: String(closing.buildId),
        resolutionMode: "domain",
        status: "unread",
        title: "Foundation changes requested",
      }),
    ]);
    expect(inbox.deliveries[0].body).toContain(
      "Add the missing footing photos before resubmitting.",
    );

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        buildId: closing.buildId,
        completedDay: 21,
        expectedRevision: 2,
        idempotencyKey: "delivery-completion-resubmit-002",
        milestoneKey: "foundation",
        note: "Footing photos added for review.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.query((api as any).production_proposals.listRecipientInbox, {
        includeResolved: true,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      actionRequiredCount: 0,
      deliveries: [expect.objectContaining({ status: "resolved" })],
      unreadCount: 0,
    });

    const records = await admin.run(async (ctx: any) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "activeBuild").eq("entityId", closing.buildId),
        )
        .collect(),
      deliveries: await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_builder")
            .eq(
              "dedupeKey",
              `milestone-decision:${closing.buildId}:foundation:rejected`,
            ),
        )
        .collect(),
    }));
    expect(records.deliveries).toHaveLength(1);
    expect(
      records.audits.filter(
        (event: any) => event.eventType === "active_build.milestone.rejected",
      ),
    ).toHaveLength(2);
  });

  test("delivers draw approval and release handoffs with canonical links and borrower acknowledgement", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 12_000_000,
        buildId: closing.buildId,
        clientOperationId: "draw-handoff-001",
        drawKey: "draw-01",
        note: "Foundation reimbursement handoff.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations recommends release.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Reimbursement released.",
        releaseDate: "2026-06-15",
        workosOrganizationId: ORG,
      },
    );

    const builderDetail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const builderDraw = builderDetail.draws.find(
      (draw: any) => draw.drawKey === receipt.requestKey,
    );
    expect(builderDraw).toMatchObject({
      releaseDate: "2026-06-15",
      releasedAt: expect.any(String),
      requestedAt: expect.any(String),
    });
    expect(builderDraw).not.toHaveProperty("releaseNote");

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "View draw",
          href: `/builder/builds/${closing.buildId}?tab=details&rail=open`,
          resolutionMode: "domain",
          title: `${receipt.displayId} approved`,
        }),
        expect.objectContaining({
          actionLabel: "Acknowledge release",
          actionRequired: true,
          href: `/builder/builds/${closing.buildId}?tab=details&rail=open`,
          resolutionMode: "recipient",
          title: `${receipt.displayId} funds released`,
        }),
      ]),
    );
    const releaseDelivery = inbox.deliveries.find(
      (delivery: any) => delivery.actionLabel === "Acknowledge release",
    );
    await builder.mutation(
      (api as any).production_proposals.resolveRecipientDelivery,
      { deliveryId: releaseDelivery._id, workosOrganizationId: ORG },
    );
    const acknowledged = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { includeResolved: true, workosOrganizationId: ORG },
    );
    expect(
      acknowledged.deliveries.find(
        (delivery: any) => delivery._id === releaseDelivery._id,
      ),
    ).toMatchObject({ status: "resolved" });
  });

  test("delivers administrative draw cancellation with the lender reason", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 8_000_000,
        buildId: closing.buildId,
        clientOperationId: "draw-cancellation-delivery-001",
        drawKey: "draw-01",
        note: "Reimbursement request awaiting scope confirmation.",
        workosOrganizationId: ORG,
      },
    );
    const cancellationNote =
      "Lender cancelled the request after scope reconciliation.";
    await admin.mutation(
      (api as any).production_proposals.cancelActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: cancellationNote,
        workosOrganizationId: ORG,
      },
    );

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        actionLabel: "View draw",
        actionRequired: true,
        body: cancellationNote,
        entityId: String(closing.buildId),
        resolutionMode: "domain",
        sourceLabel: "Lender Admin",
        title: `${receipt.displayId} cancelled`,
      }),
    ]);
    const records = await admin.run(async (ctx: any) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "activeBuild").eq("entityId", String(closing.buildId)),
        )
        .collect(),
      deliveries: await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_builder")
            .eq(
              "dedupeKey",
              `draw-decision:${closing.buildId}:${receipt.requestKey}:cancelled`,
            ),
        )
        .collect(),
    }));
    expect(records.deliveries).toHaveLength(1);
    expect(
      records.audits.find(
        (event: any) => event.command === "cancelActiveBuildDraw",
      ),
    ).toMatchObject({
      actorRoles: ["admin"],
      actorWorkosUserId: "user_admin",
      reason: cancellationNote,
    });
  });
});

describe("draft builder assignment and deletion", () => {
  test("lists bounded active brokerage builder options without account projection data", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Acme Builders",
        organizationId: ORG,
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Retired Builders",
        organizationId: ORG,
        status: "inactive",
        updatedAt: Date.now(),
      });
    });

    const builders = await admin.query(
      (api as any).production_proposals.listActiveBrokerageBuilderOptions,
      { workosOrganizationId: ORG },
    );

    expect(builders.map((builder: any) => builder.displayName)).toEqual([
      "Acme Builders",
      "Production Builder",
    ]);
    expect(builders[0]).toEqual({
      _id: expect.any(String),
      displayName: "Acme Builders",
    });
    expect(builders[0]).not.toHaveProperty("email");
    expect(builders[0]).not.toHaveProperty("workosUserIds");
  });

  test("lists active brokerage builders sorted by name", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Acme Builders",
        organizationId: ORG,
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Retired Builders",
        organizationId: ORG,
        status: "inactive",
        updatedAt: Date.now(),
      });
    });

    const builders = await broker.query(
      (api as any).production_proposals.listBrokerageBuilders,
      { workosOrganizationId: ORG },
    );
    const names = builders.map((builder: any) => builder.displayName);
    expect(names).toContain("Acme Builders");
    expect(names).not.toContain("Retired Builders");
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("uses a verified builder account email in assignment options", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Connor Beleznay",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        authId: "user_builder_unverified",
        email: "builder@example.com",
        emailVerified: false,
        name: "builder",
        status: "active",
        workosUserId: "user_builder_unverified",
      });
      await ctx.db.insert("users", {
        authId: "user_builder_verified",
        email: "c.beleznay@humanfeedback.com",
        emailVerified: true,
        name: "Connor Beleznay",
        status: "active",
        workosUserId: "user_builder_verified",
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder_unverified",
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId,
        createdAt: now + 1,
        role: "owner",
        status: "active",
        updatedAt: now + 1,
        workosUserId: "user_builder_verified",
      });
    });

    const builders = await broker.query(
      (api as any).production_proposals.listBrokerageBuilders,
      { workosOrganizationId: ORG },
    );
    expect(
      builders.find(
        (builder: any) => builder.displayName === "Connor Beleznay",
      ),
    ).toMatchObject({ email: "c.beleznay@humanfeedback.com" });
  });

  test("assigns a builder to an unassigned draft and reflects it on the kanban", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Unassigned draft", workosOrganizationId: ORG },
    );

    const before = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftBefore = before.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftBefore).toMatchObject({
      builderAssigned: false,
      builderName: "Unassigned builder",
    });
    await admin.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.delete(assignment._id);
    });

    await admin.mutation((api as any).production_proposals.assignDraftBuilder, {
      builderProfileId: seed.builderProfileId,
      proposalId,
      workosOrganizationId: ORG,
    });

    const after = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftAfter = after.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftAfter.builderAssigned).toBe(true);
    expect(draftAfter.builderName).not.toBe("Unassigned builder");

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
    const brokerAssignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );
    expect(brokerAssignment).toMatchObject({
      assignedBrokerWorkosUserId: "user_admin",
      builderProfileId: seed.builderProfileId,
      status: "active",
    });
  });

  test("assigns a broker from the proposal packet and transfers the attached Builder relationship", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Broker assignment packet",
        location: "11 Assignment Way",
        workosOrganizationId: ORG,
      },
    );
    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.patch(proposalId, {
        assignedBrokerWorkosUserId: undefined,
      });
      await ctx.db.insert("builderBrokerAssignments", {
        assignedBrokerWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        createdAt: now,
        effectiveAt: now,
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });

    const result = await admin.mutation(
      (api as any).production_proposals.assignProposalBroker,
      {
        assignedBrokerWorkosUserId: "user_broker",
        proposalId,
        reason: "Assign River to own underwriting and proposal review.",
        workosOrganizationId: ORG,
      },
    );

    expect(result.operation).toBe("assigned");
    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.assignment.broker.workosUserId).toBe("user_broker");
    expect(detail.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "proposal.broker_assigned",
          reason: "Assign River to own underwriting and proposal review.",
        }),
      ]),
    );

    const assignments = await admin.run((ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q.eq("builderProfileId", seed.builderProfileId),
        )
        .collect(),
    );
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignedBrokerWorkosUserId: "user_admin",
          status: "transferred",
        }),
        expect.objectContaining({
          assignedBrokerWorkosUserId: "user_broker",
          status: "active",
        }),
      ]),
    );

    const broker = withIdentity(base, ["broker"], "user_broker");
    await expect(
      broker.mutation((api as any).production_proposals.assignProposalBroker, {
        assignedBrokerWorkosUserId: "user_admin",
        proposalId,
        reason: "Attempt a broker reassignment without principal authority.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden: role/);
  });

  test("assigns a builder to an unassigned submitted proposal", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Submitted builder intake", workosOrganizationId: ORG },
    );
    await admin.run((ctx: any) =>
      ctx.db.patch(proposalId, { status: "submitted" }),
    );
    await admin.mutation(
      (api as any).production_proposals.assignProposalBuilder,
      {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.assignment.builderAssigned).toBe(true);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
  });

  test("assigns a builder after proposal approval", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Approved builder intake", workosOrganizationId: ORG },
    );
    await admin.run((ctx: any) =>
      ctx.db.patch(proposalId, { status: "approved" }),
    );

    await admin.mutation(
      (api as any).production_proposals.assignProposalBuilder,
      {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("approved");
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.assignment.builderAssigned).toBe(true);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
  });

  test("unassigns a builder from a draft and reflects it on the kanban", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned draft",
        location: "1 Assigned Rd",
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(
      (api as any).production_proposals.unassignDraftBuilder,
      { proposalId, workosOrganizationId: ORG },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBeUndefined();
    expect(detail.assignment.builder).toBeNull();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_unassigned",
    );

    const kanban = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftCard = kanban.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftCard).toMatchObject({
      builderAssigned: false,
      builderName: "Unassigned builder",
    });
  });

  test("creates a builder claim link and claims an unassigned draft into a builder profile", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const claimant = withIdentity(base, ["member"], "user_claimant");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Unclaimed proposal", workosOrganizationId: ORG },
    );
    const link = await admin.mutation(
      (api as any).production_proposals.createDraftProposalClaimLink,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(link.claimPath).toContain("/proposal-claim/");
    const preview = await base.query(
      (api as any).production_proposals.getProposalClaimPreview,
      { claimToken: link.claimToken },
    );
    expect(preview).toMatchObject({
      claimStatus: "active",
      milestoneCount: 0,
      proposal: { buildName: "Unclaimed proposal" },
      workosOrganizationId: ORG,
    });

    const claimed = await claimant.action(
      (api as any).production_proposals.claimDraftProposalLink,
      { claimToken: link.claimToken, workosOrganizationId: ORG },
    );
    expect(claimed.proposalId).toBe(proposalId);
    expect(claimed.workosMembershipId).toBe(
      `fake_membership_${ORG}_user_claimant`,
    );

    const claimantDetail = await claimant.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(claimantDetail.proposal.builderProfileId).toBe(
      claimed.builderProfileId,
    );
    expect(claimantDetail.assignment.builder.displayName).toBe("user_claimant");
    const brokerAssignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", claimed.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );
    expect(brokerAssignment).toMatchObject({
      assignedBrokerWorkosUserId: "user_admin",
      builderProfileId: claimed.builderProfileId,
      organizationId: ORG,
      status: "active",
    });

    const claimedPreview = await base.query(
      (api as any).production_proposals.getProposalClaimPreview,
      { claimToken: link.claimToken },
    );
    expect(claimedPreview.claimStatus).toBe("claimed");
  });

  test("claim link onboards a fresh signed-in builder into the link brokerage", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const claimant = withIdentity(base, [], "user_fresh_claimant");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Fresh claimant proposal", workosOrganizationId: ORG },
    );
    const link = await admin.mutation(
      (api as any).production_proposals.createDraftProposalClaimLink,
      { proposalId, workosOrganizationId: ORG },
    );

    const claimed = await claimant.action(
      (api as any).production_proposals.claimDraftProposalLink,
      { claimToken: link.claimToken, workosOrganizationId: ORG },
    );
    expect(claimed.workosMembershipId).toBe(
      `fake_membership_${ORG}_user_fresh_claimant`,
    );

    const claimantDetail = await claimant.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(claimantDetail.proposal.builderProfileId).toBe(
      claimed.builderProfileId,
    );
    expect(claimantDetail.assignment.builder.displayName).toBe(
      "user_fresh_claimant",
    );
  });

  test("rejects assigning a builder to an already-assigned draft", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Already assigned",
        location: "1 Assigned Rd",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation((api as any).production_proposals.assignDraftBuilder, {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/already assigned/);
  });

  test("rejects assigning a builder once the proposal leaves draft", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Will be submitted", workosOrganizationId: ORG },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { status: "submitted" });
    });
    await expect(
      admin.mutation((api as any).production_proposals.assignDraftBuilder, {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Only draft proposals/);
  });

  test("deletes a draft along with its kanban card and plan children", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Deletable draft", workosOrganizationId: ORG },
    );

    await admin.mutation(
      (api as any).production_proposals.deleteDraftProposal,
      { proposalId, workosOrganizationId: ORG },
    );

    const kanban = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const ids = kanban.columns.flatMap((column: any) =>
      column.cards.map((card: any) => card.proposalId),
    );
    expect(ids).not.toContain(proposalId);

    const leftovers = await admin.run(async (ctx: any) => ({
      card: await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .unique(),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(leftovers.card).toBeNull();
    expect(leftovers.proposal).toBeNull();
  });

  test("rejects deleting a non-draft proposal", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Non-draft", workosOrganizationId: ORG },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { status: "submitted" });
    });
    await expect(
      admin.mutation((api as any).production_proposals.deleteDraftProposal, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Only draft proposals/);
  });

  test("projects pending budget governance into access-valid builder live-build rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Budget revision build",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.requestActiveBuildBudgetRevision,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        buildId: closing.buildId,
        lenderDrawPolicyLimitCents: 60_000_000,
        reason: "Approved framing costs increased.",
        workosOrganizationId: ORG,
      },
    );

    const kanban = await builder.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const liveBuildCard = kanban.columns
      .flatMap((column: any) => column.cards)
      .find((card: any) => card.activeBuildId === String(closing.buildId));

    expect(liveBuildCard).toMatchObject({
      activeBuildId: String(closing.buildId),
      buildName: "Budget revision build",
      builderName: expect.any(String),
      drawCount: 1,
      milestoneCount: 1,
      milestonesBehindSchedule: 1,
      pendingDrawRequestCount: 0,
      budgetGovernance: {
        activeVersion: 1,
        affectedDrawRequestCount: 0,
        affectedMilestoneCount: 1,
        currentOwner: "Lender Admin",
        decisionStatus: "pending",
        proposedVersion: 2,
        revisionDeadline: null,
        revisionPriority: "required",
        varianceBps: 909,
        varianceCents: 5_000_000,
      },
    });
  });

  test("deletes an active build and clears the proposal link", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Closable build",
        location: "12 Delete Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "delete-build-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(admin, proposalId);
    await admin.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to close.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(admin, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 50_000_000,
        },
        proposalId,
        reason: "Closed for delete test.",
        workosOrganizationId: ORG,
    });

    await admin.mutation((api as any).production_proposals.deleteActiveBuild, {
      buildId: closing.buildId,
      reason: "QA cleanup.",
      workosOrganizationId: ORG,
    });

    const leftovers = await admin.run(async (ctx: any) => ({
      build: await ctx.db.get(closing.buildId),
      milestones: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      proposal: await ctx.db.get(proposalId),
      submilestones: await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
    }));
    expect(leftovers.build).toBeNull();
    expect(leftovers.milestones).toEqual([]);
    expect(leftovers.proposal?.activeBuildId).toBeUndefined();
    expect(leftovers.submilestones).toEqual([]);

    const dashboard = await admin.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.activeBuilds.some(
        (build: { buildKey: string }) =>
          build.buildKey === String(closing.buildId),
      ),
    ).toBe(false);
  });
});

describe("integration operations", () => {
  test("keeps tenant endpoint secrets one-time, validated, and admin scoped", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const created = await admin.mutation(
      (api as any).production_proposals.createIntegrationEndpoint,
      {
        endpointUrl: "https://hooks.example.test/drawflow",
        eventTypes: ["draw.released", "milestone.approved"],
        name: "Accounting webhook",
        payloadVersion: "2026-07-01",
        reason: "Connect the accounting workflow.",
        workosOrganizationId: ORG,
      },
    );

    expect(created.signingSecret).toMatch(/^dfwhsec_/);
    expect(created.endpoint).toMatchObject({
      endpointUrl: "https://hooks.example.test/drawflow",
      eventTypes: ["draw.released", "milestone.approved"],
      name: "Accounting webhook",
      secretVersion: 1,
      status: "draft",
    });
    expect(created.endpoint).not.toHaveProperty("validatedAt");
    expect(JSON.stringify(created.endpoint)).not.toContain(
      created.signingSecret,
    );
    expect(JSON.stringify(created.endpoint)).not.toMatch(
      /secretHash|signingSecret/i,
    );

    await expect(
      admin.mutation(
        (api as any).production_proposals.activateIntegrationEndpoint,
        {
          endpointId: created.endpoint._id,
          reason: "Activate the accounting connection.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/validate/i);

    await admin.mutation(
      (api as any).production_proposals.validateIntegrationEndpoint,
      {
        endpointId: created.endpoint._id,
        reason: "Endpoint ownership confirmed.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.activateIntegrationEndpoint,
      {
        endpointId: created.endpoint._id,
        reason: "Activate the accounting connection.",
        workosOrganizationId: ORG,
      },
    );

    const operations = await admin.query(
      (api as any).production_proposals.getIntegrationOperations,
      { workosOrganizationId: ORG },
    );
    expect(operations.endpoints).toEqual([
      expect.objectContaining({
        _id: created.endpoint._id,
        secretVersion: 1,
        status: "active",
        validatedAt: expect.any(Number),
      }),
    ]);
    expect(JSON.stringify(operations)).not.toMatch(
      /dfwhsec_|secretHash|signingSecret|requestId|stack/i,
    );

    await expect(
      broker.query((api as any).production_proposals.getIntegrationOperations, {
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("retries failed deliveries without mutating the original attempt or exposing secrets", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const endpointId = await admin.run(async (ctx: any) =>
      ctx.db.insert("integrationEndpoints", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        endpointUrl: "https://hooks.example.test/drawflow",
        eventTypes: ["draw.released"],
        name: "Accounting webhook",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        secretFingerprint: "…4f2a9c",
        secretHash: "ab".repeat(32),
        secretVersion: 1,
        status: "active",
        updatedAt: now,
        validatedAt: now,
      }),
    );
    const failedAttemptId = await admin.run(async (ctx: any) =>
      ctx.db.insert("integrationDeliveryAttempts", {
        attemptNumber: 1,
        attemptedAt: now,
        brokerageId: seed.brokerageId,
        createdAt: now,
        deliveryId: "delivery_draw_001",
        endpointId,
        eventId: "event_draw_001",
        eventType: "draw.released",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        responseCode: 503,
        safeError:
          "Endpoint unavailable. No secret or payload data was stored.",
        status: "failed",
        updatedAt: now,
      }),
    );

    const retried = await admin.mutation(
      (api as any).production_proposals.retryIntegrationDeliveryAttempt,
      {
        attemptId: failedAttemptId,
        reason: "Endpoint recovered after maintenance.",
        workosOrganizationId: ORG,
      },
    );
    expect(retried).toMatchObject({
      attemptNumber: 2,
      eventId: "event_draw_001",
      eventType: "draw.released",
      payloadVersion: "2026-07-01",
      retryOfAttemptId: failedAttemptId,
      status: "retry_pending",
    });
    expect(retried.deliveryId).not.toBe("delivery_draw_001");

    const deliveryFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.headers.get("X-DrawFlow-Delivery")).toBe(
        retried.deliveryId,
      );
      expect(request.headers.get("X-DrawFlow-Signature")).toMatch(
        /^v1=[a-f0-9]{64}$/,
      );
      expect(request.headers.get("X-DrawFlow-Timestamp")).toMatch(/^\d+$/);
      const payload = await request.json();
      expect(payload).toMatchObject({
        deliveryId: retried.deliveryId,
        eventId: "event_draw_001",
        eventType: "draw.released",
        payloadVersion: "2026-07-01",
      });
      return new Response(null, { status: 204 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = deliveryFetch as typeof fetch;
    let delivered;
    try {
      delivered = await admin.action(
        (api as any).production_proposals.dispatchIntegrationDeliveryAttempt,
        { attemptId: retried._id, workosOrganizationId: ORG },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(delivered).toMatchObject({
      completedAt: expect.any(Number),
      responseCode: 204,
      status: "delivered",
    });
    expect(deliveryFetch).toHaveBeenCalledOnce();

    const pendingAttemptId = await admin.run((ctx: any) =>
      ctx.db.insert("integrationDeliveryAttempts", {
        attemptNumber: 1,
        attemptedAt: now + 1,
        brokerageId: seed.brokerageId,
        createdAt: now + 1,
        deliveryId: "delivery_draw_002",
        endpointId,
        eventId: "event_draw_002",
        eventType: "draw.released",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        status: "pending",
        updatedAt: now + 1,
      }),
    );
    const failingFetch = vi.fn(
      async () => new Response("sensitive upstream response", { status: 503 }),
    );
    globalThis.fetch = failingFetch as typeof fetch;
    let failedDispatch;
    try {
      failedDispatch = await admin.action(
        (api as any).production_proposals.dispatchIntegrationDeliveryAttempt,
        { attemptId: pendingAttemptId, workosOrganizationId: ORG },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(failedDispatch).toMatchObject({
      completedAt: expect.any(Number),
      nextRetryAt: expect.any(Number),
      responseCode: 503,
      safeError: "Endpoint returned HTTP 503. Response content was not stored.",
      status: "failed",
    });
    expect(JSON.stringify(failedDispatch)).not.toContain(
      "sensitive upstream response",
    );

    const records = await admin.run(async (ctx: any) => ({
      failed: await ctx.db.get(failedAttemptId),
      retry: await ctx.db.get(retried._id),
    }));
    expect(records.failed).toMatchObject({
      deliveryId: "delivery_draw_001",
      safeError: "Endpoint unavailable. No secret or payload data was stored.",
      status: "failed",
    });
    expect(records.retry).toMatchObject({
      responseCode: 204,
      status: "delivered",
    });
    expect(JSON.stringify(retried)).not.toMatch(
      /secretHash|signingSecret|payloadPreview|stack/i,
    );
  });

  test("versions active Build budgets through audited builder requests and admin decisions", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Versioned budget Build",
    });

    const requestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildBudgetRevision,
      {
        borrowerCoPayBps: 2_500,
        borrowerWorkingCapitalLimitCents: 37_000_000,
        buildId: closing.buildId,
        lenderDrawPolicyLimitCents: 58_000_000,
        reason: "Updated subcontractor pricing requires a governed revision.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildBudgetRevision,
        {
          borrowerCoPayBps: 2_600,
          borrowerWorkingCapitalLimitCents: 38_000_000,
          buildId: closing.buildId,
          lenderDrawPolicyLimitCents: 59_000_000,
          reason: "Duplicate pending request.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/already awaiting review/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "Builder cannot self-approve.",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/role|permission|forbidden/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "   ",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/reason is required/i);

    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildBudgetRevision,
      {
        note: "Approved after variance and policy review.",
        requestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "Duplicate decision.",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/already been reviewed/i);

    const state = await t.run(async (ctx: any) => ({
      events: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
      plans: await ctx.db
        .query("buildCapitalPlans")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      request: await ctx.db.get(requestId),
    }));
    expect(state.plans.map((plan: any) => plan.version).sort()).toEqual([1, 2]);
    expect(state.plans.find((plan: any) => plan.version === 1)).toMatchObject({
      lenderDrawPolicyLimitCents: 55_000_000,
      source: "proposal_closing_copy",
    });
    expect(state.plans.find((plan: any) => plan.version === 2)).toMatchObject({
      borrowerCoPayBps: 2_500,
      borrowerWorkingCapitalLimitCents: 37_000_000,
      lenderDrawPolicyLimitCents: 58_000_000,
      revisionRequestId: requestId,
      source: "approved_budget_revision",
    });
    expect(state.request).toMatchObject({
      approvedCapitalPlanId: expect.anything(),
      baseVersion: 1,
      reason: "Updated subcontractor pricing requires a governed revision.",
      requestedByWorkosUserId: "user_builder",
      reviewerWorkosUserId: "user_admin",
      status: "approved",
      varianceCents: 3_000_000,
    });
    expect(state.events.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.budget_revision.requested",
        "active_build.budget_revision.reviewed",
      ]),
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.capitalPlan).toMatchObject({
      lenderDrawPolicyLimitCents: 58_000_000,
      version: 2,
    });
  });

  test("preserves T−30 Home Equity Takeouts through atomic three-draw replacement and closing", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "T−30 takeout proposal",
        location: "30 Equity Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 5_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 100_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation(
        (api as any).production_proposals.createProductionTimelineCapitalEvent,
        {
          amountCents: 12_500_000,
          capitalEventKey: "missing-rate",
          eventKind: "homeEquityTakeout",
          label: "Missing rate",
          proposalId,
          workosOrganizationId: ORG,
          x: -30,
        },
      ),
    ).rejects.toThrow(/interest rate/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.createProductionTimelineCapitalEvent,
        {
          amountCents: 12_500_000,
          capitalEventKey: "too-early",
          eventKind: "homeEquityTakeout",
          interestAnnualBps: 875,
          label: "Too early",
          proposalId,
          workosOrganizationId: ORG,
          x: -31,
        },
      ),
    ).rejects.toThrow(/between T−30/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.createProductionTimelineCapitalEvent,
        {
          amountCents: 12_500_000,
          capitalEventKey: "past-modeled-end",
          eventKind: "homeEquityTakeout",
          interestAnnualBps: 875,
          label: "Past modeled end",
          proposalId,
          workosOrganizationId: ORG,
          x: 61,
        },
      ),
    ).rejects.toThrow(/T\+60/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.createProductionTimelineCapitalEvent,
        {
          amountCents: 0,
          capitalEventKey: "zero-principal",
          eventKind: "homeEquityTakeout",
          interestAnnualBps: 875,
          label: "Zero principal",
          proposalId,
          workosOrganizationId: ORG,
          x: -30,
        },
      ),
    ).rejects.toThrow(/greater than zero/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          dayStart: -1,
          milestoneKey: "foundation",
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/on or after T0/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.createProductionTimelineDraw,
        {
          amountCents: 1_000_000,
          drawKey: "pre-start-draw",
          label: "Pre-start draw",
          proposalId,
          workosOrganizationId: ORG,
          x: -1,
        },
      ),
    ).rejects.toThrow(/on or after T0/i);

    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCapitalEvent,
      {
        amountCents: 12_500_000,
        capitalEventKey: "builder-residence-heloc",
        eventKind: "homeEquityTakeout",
        interestAnnualBps: 875,
        label: "Builder residence HELOC",
        proposalId,
        workosOrganizationId: ORG,
        x: -30,
      },
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelinePlanState,
      {
        currentDay: 0,
        minimumCashReserveCents: 1_000_000,
        progressValue: 0,
        proposalId,
        rangeMax: 120,
        rangeMin: 0,
        routeState: {
          selectedPanelOpen: true,
          straightLine: true,
        },
        startingCashCents: 5_000_000,
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.selectProposalPlan,
      {
        metrics: {
          drawCount: 1,
          drawFeesCents: 50_000,
          interestCostCents: 100_000,
          minimumCashReserveCents: 1_000_000,
          projectedDurationDays: 120,
          requiredWorkingCapitalCents: 5_000_000,
          startingCashCents: 5_000_000,
          totalCostCents: 150_000,
          totalDrawAmountCents: 80_000_000,
        },
        planKey: "capitalConstrained",
        proposalId,
        recommendationReason:
          "Exact three-draw plan includes the pre-start secondary facility.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.replaceProductionTimelineDrawSchedule,
      {
        draws: [
          {
            amountCents: 20_000_000,
            customDate: true,
            drawKey: "optimized-draw-1",
            label: "Draw 01",
            order: 1,
            x: 34,
          },
          {
            amountCents: 25_000_000,
            customDate: true,
            drawKey: "optimized-draw-2",
            label: "Draw 02",
            order: 2,
            x: 64,
          },
          {
            amountCents: 35_000_000,
            customDate: true,
            drawKey: "optimized-draw-3",
            label: "Draw 03",
            order: 3,
            x: 94,
          },
        ],
        metrics: {
          drawCount: 3,
          drawFeesCents: 150_000,
          interestCostCents: 725_000,
          totalCostCents: 875_000,
          totalDrawAmountCents: 80_000_000,
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.plan.rangeMin).toBe(-30);
    expect(workspace.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 12_500_000,
          capitalEventKey: "builder-residence-heloc",
          eventKind: "homeEquityTakeout",
          interestAnnualBps: 875,
          x: -30,
        }),
      ]),
    );
    expect(workspace.draws).toHaveLength(3);
    expect(workspace.proposal.selectedPlan.metrics).toMatchObject({
      drawCount: 3,
      interestCostCents: 725_000,
      totalCostCents: 875_000,
    });

    const replacementAudit = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "buildProposal")
            .eq("entityId", String(proposalId)),
        )
        .filter((q: any) =>
          q.eq(q.field("command"), "replaceProductionTimelineDrawSchedule"),
        )
        .collect(),
    );
    expect(replacementAudit).toHaveLength(1);

    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approved with documented secondary takeout.",
      workosOrganizationId: ORG,
    });
    const closing = await closeAndActivateProposal(t, {
        buildStartDate: "2026-08-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 80_000_000,
        },
        proposalId,
        reason: "Closed with approved secondary facility.",
        workosOrganizationId: ORG,
    });

    const closedState = await t.run(async (ctx: any) => ({
      capitalEvents: await ctx.db
        .query("capitalEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      facilities: await ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
    }));
    expect(closedState.facilities).toHaveLength(2);
    expect(closedState.facilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          facilityKind: "construction",
          principalCents: 80_000_000,
        }),
        expect.objectContaining({
          facilityKind: "homeEquityTakeout",
          interestAccrualStartDate: "2026-07-02",
          interestAnnualBps: 875,
          principalCents: 12_500_000,
          sourceCapitalEventKey: "builder-residence-heloc",
        }),
      ]),
    );
    expect(closedState.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capitalEventKey: "builder-residence-heloc",
          eventDate: "2026-07-02",
          eventType: "home_equity_takeout",
          loanFacilityId: expect.anything(),
        }),
      ]),
    );

    const activeWorkspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(activeWorkspace.plan.rangeMin).toBe(-30);
    expect(activeWorkspace.loanFacilities[0]).toMatchObject({
      facilityKind: "construction",
      principalCents: 80_000_000,
    });
    expect(activeWorkspace.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capitalEventKey: "builder-residence-heloc",
          eventKind: "homeEquityTakeout",
          interestAnnualBps: 875,
          x: -30,
        }),
      ]),
    );
  });
});
