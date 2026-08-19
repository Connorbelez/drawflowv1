/// <reference types="vite/client" />

import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationUrl,
  quoteInvitationSecretVerifier,
} from "./quote_invitation_access";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_quote_rounds";

beforeEach(() => {
  vi.stubEnv(
    "COMMUNICATION_TOKEN_SECRET",
    "quote-rounds-test-secret-at-least-32-bytes"
  );
  vi.stubEnv("RESEND_API_KEY", "re_quote_rounds_test_key");
  vi.stubEnv(
    "RESEND_FROM_EMAIL",
    "DrawFlow <notifications@updates.fairlend.ca>"
  );
  vi.stubEnv("QUOTE_INVITATION_PUBLIC_ORIGIN", "https://drawflow.test");
  vi.stubEnv("CONVEX_SITE_URL", "https://drawflow.convex.site");
});

describe("Quote Invitation Field Ledger drafts", () => {
  async function openedLedgerFixture() {
    const fixture = await seedQuoteFixture();
    const { credential, invitation } = await publishCombinedRound(
      fixture,
      "field-ledger-publish-001"
    );
    const magicToken = "field-ledger-browser-token";
    await replaceCredentialMagicToken(fixture, credential._id, magicToken);
    const exchanged = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    if (exchanged.status !== "available") {
      throw new Error("Expected a usable Quote Invitation browser session.");
    }
    return { ...fixture, exchanged, invitation, magicToken };
  }

  test("does not create on read, creates one canonical draft on first edit, and resumes it across browser sessions", async () => {
    const fixture = await openedLedgerFixture();
    const before = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(before).toMatchObject({ draft: null, status: "available" });
    const noDraftRows = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseDrafts").take(2)
    );
    expect(noDraftRows).toHaveLength(0);

    const labourLine = before.access.package.labourLines[0];
    const firstSave = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 125_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(firstSave).toMatchObject({
      status: "saved",
      draft: { completedPricingLineCount: 1, version: 1 },
    });

    const resumedSession = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: fixture.magicToken }
    );
    expect(resumedSession).toMatchObject({ status: "available" });
    const resumed = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: resumedSession.sessionToken,
      }
    );
    expect(resumed).toMatchObject({
      status: "available",
      draft: {
        completedPricingLineCount: 1,
        lineItems: [
          {
            lineKey: `labour:${labourLine.sourceLineId}`,
            quotedAmountCents: 125_000_00,
          },
        ],
        version: 1,
      },
    });
    const allDrafts = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseDrafts").take(2)
    );
    expect(allDrafts).toHaveLength(1);
  });

  test("uses server time for public draft reads even when a caller reports a stale presentation clock", async () => {
    const fixture = await openedLedgerFixture();
    const session = await fixture.base.run((ctx) =>
      ctx.db
        .query("quoteInvitationBrowserSessions")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("state", "active")
        )
        .unique()
    );
    if (!session) {
      throw new Error("Expected the browser lease created by the fixture.");
    }
    await fixture.base.run((ctx) =>
      ctx.db.patch(session._id, {
        sessionExpiresAt: Date.now() - 1,
        updatedAt: Date.now(),
      })
    );

    const expired = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        // This deliberately predates the lease. A client clock must never make
        // the expired bearer session readable again.
        presentationNow: 0,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );

    expect(expired).toEqual({ status: "unavailable" });
  });

  test("returns a recoverable optimistic conflict without overwriting the recipient's local pending input", async () => {
    const fixture = await openedLedgerFixture();
    const access = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const labourLine = access.access.package.labourLines[0];
    const saved = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 111_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(saved).toMatchObject({ status: "saved", draft: { version: 1 } });
    const stale = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          commentsHtml: "<p>Keep this browser's pending wording.</p>",
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(stale).toMatchObject({
      status: "conflict",
      draft: {
        lineItems: [{ quotedAmountCents: 111_000_00 }],
        version: 1,
      },
    });
    expect(stale.draft?.commentsHtml).toBeUndefined();
  });

  test("reserves the 25-file ceiling before issuing response upload URLs", async () => {
    const fixture = await openedLedgerFixture();
    const uploadIntent = (index: number) => ({
      fileName: `scope-${index}.pdf`,
      mimeType: "application/pdf",
      quoteRoundInvitationId: fixture.invitation._id,
      sessionToken: fixture.exchanged.sessionToken,
      sizeBytes: 4,
    });
    for (let index = 1; index <= 25; index += 1) {
      await fixture.base.mutation(
        (api as any).quote_response_drafts
          .beginQuoteInvitationResponseDraftAttachmentUpload,
        uploadIntent(index)
      );
    }
    await expect(
      fixture.base.mutation(
        (api as any).quote_response_drafts
          .beginQuoteInvitationResponseDraftAttachmentUpload,
        uploadIntent(26)
      )
    ).rejects.toThrow(/at most 25 response files/);
    const stages = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteInvitationResponseDraftAttachmentStagingSessions")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId_and_state",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq(
                "quotePackageRevisionId",
                fixture.invitation.quotePackageRevisionId
              )
              .eq("state", "open")
        )
        .take(26)
    );
    expect(stages).toHaveLength(25);
  });

  test("stores and binds response bytes through the one-time staged HTTP endpoint", async () => {
    const fixture = await openedLedgerFixture();
    const began = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "bound-scope.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    const uploadUrl = new URL(began.uploadUrl);
    const uploadPath = `${uploadUrl.pathname}${uploadUrl.search}`;
    const preflight = await fixture.base.fetch(uploadPath, {
      headers: {
        "Access-Control-Request-Headers":
          "Content-Type, X-Quote-Upload-Secret",
        "Access-Control-Request-Method": "POST",
        Origin: "http://localhost:3000",
      },
      method: "OPTIONS",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Quote-Upload-Secret"
    );
    const uploaded = await fixture.base.fetch(uploadPath, {
      body: new Blob(["file"], { type: "application/pdf" }),
      headers: {
        "Content-Type": "application/pdf",
        Origin: "http://localhost:3000",
        "X-Quote-Upload-Secret": began.uploadSecret,
      },
      method: "POST",
    });
    expect(uploaded.status).toBe(201);
    const { storageId } = (await uploaded.json()) as { storageId: Id<"_storage"> };
    const bound = await fixture.base.run(async (ctx) => ({
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(bound.stage).toMatchObject({
      pendingStorageId: storageId,
      state: "finalized",
    });
    expect(bound.storage).not.toBeNull();
    const replay = await fixture.base.fetch(uploadPath, {
      body: new Blob(["file"], { type: "application/pdf" }),
      headers: {
        "Content-Type": "application/pdf",
        Origin: "http://localhost:3000",
        "X-Quote-Upload-Secret": began.uploadSecret,
      },
      method: "POST",
    });
    expect(replay.status).toBe(410);
  });

  test("keeps a registered response file staged through an optimistic conflict so it can attach on retry", async () => {
    const fixture = await openedLedgerFixture();
    const began = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "scope.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    expect(began).toMatchObject({ status: "available" });
    const storageId = await fixture.base.run(async (ctx) =>
      await ctx.storage.store(
        new Blob(["file"], { type: "application/pdf" })
      )
    );
    expect(
      await fixture.base.mutation(
        (internal as any).quote_response_drafts
          .completeQuoteInvitationResponseDraftAttachmentHttpUpload,
        {
          actualMimeType: "application/pdf",
          stagingSessionId: began.stagingSessionId,
          storageId,
          uploadSecretVerifier: await quoteInvitationSecretVerifier(
            began.uploadSecret
          ),
        }
      )
    ).toBe(true);
    await fixture.base.mutation(
      (api as any).quote_response_drafts
        .registerQuoteInvitationResponseDraftAttachmentUpload,
      {
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        stagingSessionId: began.stagingSessionId,
        storageId,
      }
    );
    const savedDraft = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: { commentsHtml: "<p>Concurrent saved wording.</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(savedDraft).toMatchObject({ status: "saved", draft: { version: 1 } });

    const conflict = await fixture.base.mutation(
      (api as any).quote_response_drafts.attachQuoteInvitationResponseDraftFile,
      {
        expectedVersion: 0,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        stagingSessionId: began.stagingSessionId,
        storageId,
      }
    );
    expect(conflict).toMatchObject({ status: "conflict", draft: { version: 1 } });
    const preserved = await fixture.base.run(async (ctx) => ({
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(preserved.stage).toMatchObject({
      pendingStorageId: storageId,
      state: "finalized",
    });
    expect(preserved.storage).not.toBeNull();

    const retried = await fixture.base.mutation(
      (api as any).quote_response_drafts.attachQuoteInvitationResponseDraftFile,
      {
        expectedVersion: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        stagingSessionId: began.stagingSessionId,
        storageId,
      }
    );
    expect(retried).toMatchObject({
      status: "saved",
      draft: { attachmentCount: 1, version: 2 },
    });
    const consumed = await fixture.base.run(async (ctx) => ({
      attachments: await ctx.db
        .query("quoteInvitationResponseDraftAttachments")
        .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
        .take(2),
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(consumed.attachments).toHaveLength(1);
    expect(consumed.stage).toMatchObject({ state: "consumed" });
    expect(consumed.storage).not.toBeNull();
  });

  test("deletes registered but unconsumed response upload storage after staging expiry", async () => {
    const fixture = await openedLedgerFixture();
    const began = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "interrupted.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    const storageId = await fixture.base.run(async (ctx) =>
      await ctx.storage.store(
        new Blob(["file"], { type: "application/pdf" })
      )
    );
    expect(
      await fixture.base.mutation(
        (internal as any).quote_response_drafts
          .completeQuoteInvitationResponseDraftAttachmentHttpUpload,
        {
          actualMimeType: "application/pdf",
          stagingSessionId: began.stagingSessionId,
          storageId,
          uploadSecretVerifier: await quoteInvitationSecretVerifier(
            began.uploadSecret
          ),
        }
      )
    ).toBe(true);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: Date.now() - 1,
      });
    });
    await fixture.base.mutation(
      (api as any).quote_response_drafts
        .registerQuoteInvitationResponseDraftAttachmentUpload,
      {
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        stagingSessionId: began.stagingSessionId,
        storageId,
      }
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(began.stagingSessionId, {
        expiresAt: Date.now() - 1,
        updatedAt: Date.now(),
      });
    });
    await fixture.base.mutation(
      (internal as any).quote_response_drafts
        .expireQuoteInvitationResponseDraftAttachmentStagingSession,
      { stagingSessionId: began.stagingSessionId }
    );
    const expired = await fixture.base.run(async (ctx) => ({
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(expired.stage).toMatchObject({ state: "abandoned" });
    expect(expired.storage).toBeNull();
  });

  test("never lets public registration claim or delete an arbitrary storage object", async () => {
    const fixture = await openedLedgerFixture();
    const began = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "must-be-a-pdf.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    const storageId = await fixture.base.run(async (ctx) =>
      await ctx.storage.store(new Blob(["files"], { type: "text/plain" }))
    );
    const registration = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .registerQuoteInvitationResponseDraftAttachmentUpload,
      {
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        stagingSessionId: began.stagingSessionId,
        storageId,
      }
    );
    expect(registration).toMatchObject({ status: "attachment_rejected" });
    const rejected = await fixture.base.run(async (ctx) => ({
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(rejected.stage).toMatchObject({ state: "open" });
    expect(rejected.storage).not.toBeNull();
  });

  test("rejects mismatched actual MIME metadata from bound upload completion", async () => {
    const fixture = await openedLedgerFixture();
    const began = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "must-have-content-type.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    const storageId = await fixture.base.run(async (ctx) =>
      await ctx.storage.store(new Blob(["file"]))
    );
    expect(
      await fixture.base.mutation(
        (internal as any).quote_response_drafts
          .completeQuoteInvitationResponseDraftAttachmentHttpUpload,
        {
          actualMimeType: "application/octet-stream",
          stagingSessionId: began.stagingSessionId,
          storageId,
          uploadSecretVerifier: await quoteInvitationSecretVerifier(
            began.uploadSecret
          ),
        }
      )
    ).toBe(false);
    const rejected = await fixture.base.run(async (ctx) => ({
      stage: await ctx.db.get(began.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(rejected.stage).toMatchObject({ state: "open" });
    expect(rejected.storage).not.toBeNull();
  });

  test("allows a claimed account to resume the same draft, while deadline closure remains server-enforced", async () => {
    const fixture = await openedLedgerFixture();
    const access = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const materialLine = access.access.package.materialLines[0];
    await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `material:${materialLine.sourceLineId}`,
              quotedAmountCents: 87_500_00,
              scope: "materials",
              source: "package_material",
              sourcePackageRevisionMaterialLineId: materialLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const recipient = withIdentity(
      fixture.base,
      ["member"],
      "claimed-field-ledger-recipient",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );
    await fixture.base.run((ctx) =>
      ctx.db.insert("users", {
        authId: "auth_claimed_field_ledger_recipient",
        email: "quote-recipient@example.com",
        emailVerified: true,
        name: "Claimed Field Ledger recipient",
        status: "active",
        workosUserId: "claimed-field-ledger-recipient",
      })
    );
    await recipient.mutation(
      (api as any).quote_invitation_access.claimQuoteInvitationProfile,
      { sessionToken: fixture.exchanged.sessionToken }
    );
    const claimed = await recipient.query(
      (api as any).quote_response_drafts.getClaimedQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(claimed).toMatchObject({
      status: "available",
      draft: { lineItems: [{ quotedAmountCents: 87_500_00 }], version: 1 },
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: Date.now() - 1,
      });
    });
    const readOnly = await recipient.query(
      (api as any).quote_response_drafts.getClaimedQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(readOnly).toMatchObject({ status: "read_only" });
    const blockedSave = await recipient.mutation(
      (api as any).quote_response_drafts.saveClaimedQuoteInvitationResponseDraft,
      {
        expectedVersion: 1,
        patch: { commentsHtml: "<p>Late local text</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(blockedSave).toEqual({ status: "read_only" });
  });

  test("marks only a prior package revision as superseded after a revision cutover", async () => {
    const fixture = await openedLedgerFixture();
    await fixture.base.run(async (ctx) => {
      const currentRevision = await ctx.db.get(
        fixture.invitation.quotePackageRevisionId
      );
      if (!currentRevision) {
        throw new Error("Expected a published Quote Package Revision.");
      }
      const { _creationTime, _id, ...replacementSnapshot } = currentRevision;
      const replacementRevisionId = await ctx.db.insert(
        "quotePackageRevisions",
        {
          ...replacementSnapshot,
          publishedAt: Date.now(),
          revision: currentRevision.revision + 1,
        }
      );
      await ctx.db.patch(fixture.invitation.quoteRoundId, {
        currentPackageRevisionId: replacementRevisionId,
        updatedAt: Date.now(),
      });
    });

    const superseded = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(superseded).toEqual({ status: "superseded" });
  });

  test("never crosses invitation tenancy and gives internal users progress metadata without draft content", async () => {
    const fixture = await openedLedgerFixture();
    const access = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const labourLine = access.access.package.labourLines[0];
    await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          commentsHtml: "<p>Private assumptions only.</p>",
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 200_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const wrongPublication = await publishCombinedRound(
      fixture,
      "field-ledger-wrong-invitation-001"
    );
    const wrongInvitation = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: wrongPublication.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(wrongInvitation).toEqual({ status: "unavailable" });

    const progress = await fixture.builder.query(
      (api as any).quote_response_drafts.getQuoteRoundInvitationResponseProgress,
      {
        buildId: fixture.buildId,
        quoteRoundId: fixture.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      completedPricingLineCount: 1,
      quoteRoundInvitationId: fixture.invitation._id,
      status: "drafting",
    });
    expect(Object.keys(progress[0]).sort()).toEqual([
      "answeredFieldCount",
      "attachmentCount",
      "completedPricingLineCount",
      "quotePackageRevisionId",
      "quoteRoundInvitationId",
      "status",
      "updatedAt",
    ]);
    expect(JSON.stringify(progress)).not.toContain("Private assumptions");
    expect(JSON.stringify(progress)).not.toContain("20000000");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Quote Invitation immutable response submissions", () => {
  test("atomically snapshots a current Field Ledger draft and clears the mutable draft", async () => {
    const fixture = await openedSubmissionFixture();
    const before = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const labourLine = before.access.package.labourLines[0];
    const requiredAnswer = before.access.package.responseFields.find(
      (field: { fieldKey: string }) => field.fieldKey === "approach"
    );
    expect(requiredAnswer).toBeDefined();
    const saved = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          answerPatches: [
            {
              sourcePackageRevisionResponseFieldId: requiredAnswer.sourceFieldId,
              value: "<p>We will stage the crew before framing.</p>",
            },
          ],
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 125_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(saved).toMatchObject({ status: "saved", draft: { version: 1 } });

    const accepted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-first-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(accepted).toMatchObject({
      idempotentReplay: false,
      status: "accepted",
      submission: {
        canonicalTotalCents: 125_000_00,
        revision: 1,
      },
    });
    const persisted = await fixture.base.run(async (ctx) => ({
      drafts: await ctx.db.query("quoteInvitationResponseDrafts").collect(),
      submissions: await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .collect(),
      intents: await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect(),
    }));
    expect(persisted.drafts).toHaveLength(0);
    expect(persisted.submissions).toHaveLength(1);
    expect(persisted.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_response_submitted",
          payloadSnapshot: expect.stringContaining('"event":"submitted"'),
          relatedEntityType: "quoteResponseSubmissionRevision",
          status: "pending",
          templateKey: "quote_response",
        }),
      ])
    );
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      hasMoreRevisions: false,
      revisionCount: 1,
      revisions: [
        {
          canonicalTotalCents: 125_000_00,
          revision: 1,
          status: "active",
        },
      ],
    });
    expect(lifecycle.revisions[0]).not.toHaveProperty("lineItems");
    expect(lifecycle.revisions[0]).not.toHaveProperty("responses");
    expect(lifecycle.revisions[0]).not.toHaveProperty("attachments");
    const revision = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseSubmissionRevision,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        revision: 1,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(revision).toMatchObject({
      status: "available",
      submission: {
        canonicalTotalCents: 125_000_00,
        lineItems: [{ quotedAmountCents: 125_000_00 }],
        revision: 1,
      },
    });
  });

  test("counts represented immutable revisions instead of trusting the latest revision number", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-sparse-revision-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.run(async (ctx) => {
      const submission = await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("revision", 1)
        )
        .unique();
      const state = await ctx.db
        .query("quoteInvitationResponseSubmissionStates")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq(
                "quotePackageRevisionId",
                fixture.invitation.quotePackageRevisionId
              )
        )
        .unique();
      if (!(submission && state)) {
        throw new Error("Expected the immutable submission projections.");
      }
      await ctx.db.patch(submission._id, { revision: 7 });
      await ctx.db.patch(state._id, { latestRevision: 7 });
    });

    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      hasMoreRevisions: false,
      revisionCount: 1,
      revisions: [{ revision: 7 }],
    });
  });

  test("rejects a historical submission whose Package Revision is a sibling", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-sibling-revision-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.run(async (ctx) => {
      const root = await ctx.db.get(fixture.invitation.quotePackageRevisionId);
      const submission = await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("revision", 1)
        )
        .unique();
      if (!(root && submission)) {
        throw new Error("Expected the published Package Revision and submission.");
      }
      const { _creationTime, _id, ...siblingSnapshot } = root;
      const siblingId = await ctx.db.insert("quotePackageRevisions", {
        ...siblingSnapshot,
        revision: root.revision + 1,
      });
      await ctx.db.patch(submission._id, {
        quotePackageRevisionId: siblingId,
      });
    });

    await expect(
      fixture.base.query(
        (api as any).quote_response_submissions
          .getQuoteInvitationResponseSubmissionRevision,
        {
          presentationNow: Date.now(),
          quoteRoundInvitationId: fixture.invitation._id,
          revision: 1,
          sessionToken: fixture.exchanged.sessionToken,
        }
      )
    ).rejects.toThrow("Historical Quote Package Revision is unavailable.");
  });

  test("returns the same immutable receipt for a lost submission response or a double tap", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 141_000_00);
    const input = {
      expectedDraftVersion: 1,
      idempotencyKey: "submission-replay-001",
      quoteRoundInvitationId: fixture.invitation._id,
      sessionToken: fixture.exchanged.sessionToken,
    };
    const accepted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      input
    );
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (setting) {
        await ctx.db.patch(setting._id, {
          serviceLifecycle: "restricted_archive",
          status: "disabled",
          updatedAt: now,
        });
        return;
      }
      await ctx.db.insert("buildCollaborationTenantSettings", {
        brokerageId: fixture.brokerageId,
        createdAt: now,
        generousRateLimitMultiplier: 1,
        organizationId: ORGANIZATION_ID,
        serviceLifecycle: "restricted_archive",
        status: "disabled",
        updatedAt: now,
      });
    });
    const replay = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      input
    );
    expect(accepted).toMatchObject({
      idempotentReplay: false,
      status: "accepted",
      submission: { canonicalTotalCents: 141_000_00, revision: 1 },
    });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      status: "accepted",
      submission: { canonicalTotalCents: 141_000_00, revision: 1 },
    });
    const persisted = await fixture.base.run(async (ctx) => ({
      requests: await ctx
        .db
        .query("quoteInvitationResponseSubmissionRequests")
        .collect(),
      submissions: await ctx
        .db
        .query("quoteInvitationResponseSubmissionRevisions")
        .collect(),
    }));
    expect(persisted.requests).toHaveLength(1);
    expect(persisted.submissions).toHaveLength(1);
  });

  test("retains auditable prior and new lifecycle state for submit and withdrawal", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 124_000_00);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-audit-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.withdrawQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const audits = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "quoteInvitationResponseSubmission")
        )
        .collect()
    );
    const submitted = audits.find(
      (audit) => audit.eventType === "quote_response.submitted"
    );
    const withdrawn = audits.find(
      (audit) => audit.eventType === "quote_response.withdrawn"
    );
    expect(JSON.parse(submitted?.priorState ?? "{}"))
      .toEqual({ status: "none" });
    expect(JSON.parse(submitted?.newState ?? "{}"))
      .toMatchObject({ canonicalTotalCents: 124_000_00, revision: 1, status: "active" });
    expect(JSON.parse(withdrawn?.priorState ?? "{}"))
      .toMatchObject({ canonicalTotalCents: 124_000_00, revision: 1, status: "active" });
    expect(JSON.parse(withdrawn?.newState ?? "{}"))
      .toEqual({ revision: 1, status: "withdrawn" });
  });

  test("rejects a stale Draft version without replacing the newer Field Ledger", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    const newer = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 1,
        patch: { commentsHtml: "<p>Newer local wording.</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(newer).toMatchObject({ status: "saved", draft: { version: 2 } });
    const stale = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-stale-draft-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(stale).toMatchObject({
      draft: { commentsHtml: "<p>Newer local wording.</p>", version: 2 },
      status: "conflict",
    });
    const submissions = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseSubmissionRevisions").collect()
    );
    expect(submissions).toHaveLength(0);
  });

  test("does not accept a draft until its required immutable Package fields are valid", async () => {
    const fixture = await openedSubmissionFixture();
    const access = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const labourLine = access.access.package.labourLines[0];
    await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 83_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const invalid = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-required-field-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(invalid).toMatchObject({ status: "invalid" });
    expect(invalid.validationErrors).toContain("Approach is required.");
  });

  test("recomputes total from valid pricing rows and rejects tampered invalid totals", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 73_000_00);
    await fixture.base.run(async (ctx) => {
      const draft = await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq(
                "quotePackageRevisionId",
                fixture.invitation.quotePackageRevisionId
              )
        )
        .unique();
      if (!draft) {
        throw new Error("Expected a Field Ledger draft.");
      }
      const line = await ctx.db
        .query("quoteInvitationResponseDraftLineItems")
        .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
          query.eq("quoteInvitationResponseDraftId", draft._id)
        )
        .unique();
      if (!line) {
        throw new Error("Expected a Field Ledger line.");
      }
      await ctx.db.patch(line._id, { quotedAmountCents: -1 });
    });
    const invalid = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-invalid-total-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(invalid).toMatchObject({ status: "invalid" });
    expect(invalid.validationErrors).toContain(
      "Quoted amount must be a non-negative whole-cent value."
    );
    const submissions = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseSubmissionRevisions").collect()
    );
    expect(submissions).toHaveLength(0);
  });

  test("keeps the prior immutable quote authoritative while a revision Draft is abandoned", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 109_000_00);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-abandoned-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const started = await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(started).toMatchObject({
      draft: { lineItems: [{ quotedAmountCents: 109_000_00 }], version: 1 },
      status: "draft_ready",
    });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      currentSubmission: {
        canonicalTotalCents: 109_000_00,
        revision: 1,
        status: "active",
      },
      draft: { version: 1 },
      eligibility: { canRevise: false, canSubmit: true, canWithdraw: true },
      revisions: [{ revision: 1, status: "active" }],
      status: "available",
    });
  });

  test("requires explicit revision start before autosave or attachment-first edits can recreate a submitted Draft", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-explicit-revision-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const bypassSave = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: { commentsHtml: "<p>Stale autosave must not make a revision.</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const bypassAttachment = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .beginQuoteInvitationResponseDraftAttachmentUpload,
      {
        fileName: "stale.pdf",
        mimeType: "application/pdf",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
        sizeBytes: 4,
      }
    );
    expect(bypassSave).toEqual({ status: "revision_required" });
    expect(bypassAttachment).toEqual({ status: "revision_required" });
    const noDraft = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseDrafts").collect()
    );
    expect(noDraft).toHaveLength(0);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const resumed = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 1,
        patch: { commentsHtml: "<p>Explicit revision wording.</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(resumed).toMatchObject({ status: "saved", draft: { version: 2 } });
  });

  test("supersedes only after explicit resubmission and retains immutable revision history", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 82_000_00);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-resubmit-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const draft = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const labourLine = draft.access.package.labourLines[0];
    const revisedDraft = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 1,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${labourLine.sourceLineId}`,
              quotedAmountCents: 94_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(revisedDraft).toMatchObject({
      draft: { version: 2 },
      status: "saved",
    });
    const resubmitted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 2,
        idempotencyKey: "submission-resubmit-final-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(resubmitted).toMatchObject({
      status: "accepted",
      submission: { canonicalTotalCents: 94_000_00, revision: 2 },
    });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      currentSubmission: {
        canonicalTotalCents: 94_000_00,
        revision: 2,
        status: "active",
      },
      revisions: [
        { revision: 1, status: "superseded", supersededByRevision: 2 },
        { revision: 2, status: "active" },
      ],
    });
    const intents = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect()
    );
    expect(intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_response_submitted",
          payloadSnapshot: expect.stringContaining('"revision":1'),
          status: "pending",
        }),
        expect.objectContaining({
          kind: "quote_response_resubmitted",
          payloadSnapshot: expect.stringContaining('"revision":2'),
          status: "pending",
        }),
      ])
    );
  });

  test("withdraws only after confirmation, keeps the event immutable, and permits resubmission", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 66_000_00);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-withdraw-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const confirmationRequired = await fixture.base.mutation(
      (api as any).quote_response_submissions.withdrawQuoteInvitationResponse,
      {
        confirmed: false,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(confirmationRequired).toEqual({ status: "confirmation_required" });
    const withdrawn = await fixture.base.mutation(
      (api as any).quote_response_submissions.withdrawQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        explanation: "Scope has changed; please ignore this quote.",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(withdrawn).toMatchObject({
      status: "withdrawn",
      submission: {
        revision: 1,
        status: "withdrawn",
        withdrawalExplanation: "Scope has changed; please ignore this quote.",
      },
    });
    const withdrawnLifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(withdrawnLifecycle).toMatchObject({
      currentSubmission: { revision: 1, status: "withdrawn" },
      eligibility: { canRevise: true, canSubmit: false, canWithdraw: false },
      revisions: [{ revision: 1, status: "withdrawn" }],
    });
    const draft = await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(draft).toMatchObject({ status: "draft_ready", draft: { version: 1 } });
    const resubmitted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-after-withdraw-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(resubmitted).toMatchObject({
      status: "accepted",
      submission: { revision: 2, status: "active" },
    });
    const intents = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect()
    );
    expect(intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_response_submitted",
          status: "pending",
        }),
        expect.objectContaining({
          kind: "quote_response_withdrawn",
          payloadSnapshot: expect.stringContaining(
            "Scope has changed; please ignore this quote."
          ),
          status: "pending",
        }),
        expect.objectContaining({
          kind: "quote_response_resubmitted",
          status: "pending",
        }),
      ])
    );
  });

  test("uses server deadline time to make drafts read-only and never writes a late response", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: Date.now() - 1,
      });
    });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now() - 60_000,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      draft: { version: 1 },
      eligibility: { canRevise: false, canSubmit: false, canWithdraw: false },
      status: "read_only",
    });
    const lateSave = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 1,
        patch: { commentsHtml: "<p>Late local wording.</p>" },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const lateSubmit = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-late-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lateSave).toEqual({ status: "read_only" });
    expect(lateSubmit).toEqual({ status: "read_only" });
    const persisted = await fixture.base.run(async (ctx) => ({
      drafts: await ctx.db.query("quoteInvitationResponseDrafts").collect(),
      submissions: await ctx
        .db
        .query("quoteInvitationResponseSubmissionRevisions")
        .collect(),
    }));
    expect(persisted.drafts).toHaveLength(1);
    expect(persisted.submissions).toHaveLength(0);
  });

  test("rechecks the server deadline after validation before it writes a submission", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    const authorizationNow = Date.now();
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: authorizationNow + 1,
      });
    });
    let monotonicReads = 0;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(authorizationNow);
    const performanceSpy = vi
      .spyOn(performance, "now")
      .mockImplementation(() => {
        monotonicReads += 1;
        return monotonicReads * 10;
      });
    let raced: unknown;
    try {
      raced = await fixture.base.mutation(
        (api as any).quote_response_submissions.submitQuoteInvitationResponse,
        {
          expectedDraftVersion: 1,
          idempotencyKey: "submission-deadline-race-001",
          quoteRoundInvitationId: fixture.invitation._id,
          sessionToken: fixture.exchanged.sessionToken,
        }
      );
    } finally {
      performanceSpy.mockRestore();
      nowSpy.mockRestore();
    }
    expect(monotonicReads).toBeGreaterThanOrEqual(2);
    expect(raced).toEqual({ status: "read_only" });
    const submissions = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseSubmissionRevisions").collect()
    );
    expect(submissions).toHaveLength(0);
  });

  test("stamps an accepted receipt with the same below-deadline server timestamp it checked", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    const checkedAt = Date.now();
    const deadline = checkedAt + 10_000;
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: deadline,
      });
    });
    let wallClockReads = 0;
    let monotonicReads = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      wallClockReads += 1;
      return checkedAt;
    });
    const performanceSpy = vi
      .spyOn(performance, "now")
      .mockImplementation(() => {
        monotonicReads += 1;
        return 100;
      });
    let accepted: any;
    try {
      accepted = await fixture.base.mutation(
        (api as any).quote_response_submissions.submitQuoteInvitationResponse,
        {
          expectedDraftVersion: 1,
          idempotencyKey: "submission-deadline-boundary-001",
          quoteRoundInvitationId: fixture.invitation._id,
          sessionToken: fixture.exchanged.sessionToken,
        }
      );
    } finally {
      performanceSpy.mockRestore();
      nowSpy.mockRestore();
    }
    expect(accepted).toMatchObject({ status: "accepted" });
    expect(accepted.submission.submittedAt).toBe(checkedAt);
    expect(accepted.submission.submittedAt).toBeLessThan(deadline);
    expect(wallClockReads).toBeGreaterThan(0);
    expect(monotonicReads).toBeGreaterThanOrEqual(2);
  });

  test("blocks a claimed internal actor who is also linked to the recipient profile from withdrawing", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-internal-claimed-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.recipientId, {
        accountWorkosUserId: "user_builder",
      });
    });
    const denied = await fixture.builder.mutation(
      (api as any).quote_response_submissions
        .withdrawClaimedQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(denied).toEqual({ status: "unavailable" });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle.currentSubmission).toMatchObject({
      revision: 1,
      status: "active",
    });
  });

  test("refuses the next submission at the durable revision cap without clearing its Draft", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-cap-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.run(async (ctx) => {
      const state = await ctx.db
        .query("quoteInvitationResponseSubmissionStates")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq(
                "quotePackageRevisionId",
                fixture.invitation.quotePackageRevisionId
              )
        )
        .unique();
      if (!state) {
        throw new Error("Expected the immutable submission state projection.");
      }
      await ctx.db.patch(state._id, { latestRevision: 100 });
    });
    const capped = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-cap-final-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(capped).toMatchObject({
      status: "invalid",
      validationErrors: [
        "Quote response revision history has reached its safe limit.",
      ],
    });
    const draft = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(draft).toMatchObject({ draft: { version: 1 }, status: "available" });
  });

  test("requires the invitation's acknowledged Package Revision to remain current at submission", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.run(async (ctx) => {
      const current = await ctx.db.get(
        fixture.invitation.quotePackageRevisionId
      );
      if (!current) {
        throw new Error("Expected the current Quote Package Revision.");
      }
      const { _creationTime, _id, ...snapshot } = current;
      const replacementId = await ctx.db.insert("quotePackageRevisions", {
        ...snapshot,
        publishedAt: Date.now(),
        revision: current.revision + 1,
      });
      await ctx.db.patch(fixture.invitation.quoteRoundId, {
        currentPackageRevisionId: replacementId,
        updatedAt: Date.now(),
      });
    });
    const superseded = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-stale-package-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(superseded).toEqual({ status: "superseded" });
    const submissions = await fixture.base.run(async (ctx) =>
      await ctx.db.query("quoteInvitationResponseSubmissionRevisions").collect()
    );
    expect(submissions).toHaveLength(0);
  });

  test("still returns the original accepted receipt when its network retry arrives after the deadline", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 71_000_00);
    const input = {
      expectedDraftVersion: 1,
      idempotencyKey: "submission-lost-response-after-deadline-001",
      quoteRoundInvitationId: fixture.invitation._id,
      sessionToken: fixture.exchanged.sessionToken,
    };
    const accepted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      input
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: Date.now() - 1,
      });
    });
    const replay = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      input
    );
    expect(accepted).toMatchObject({
      idempotentReplay: false,
      submission: { revision: 1 },
      status: "accepted",
    });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      submission: { revision: 1 },
      status: "accepted",
    });
  });

  test("treats early Round closure as an immediate write cutoff while preserving the submitted response", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-closed-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.invitation.quoteRoundId, {
        state: "closed",
        updatedAt: Date.now(),
      });
    });
    const start = await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const withdraw = await fixture.base.mutation(
      (api as any).quote_response_submissions.withdrawQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(start).toEqual({ status: "read_only" });
    expect(withdraw).toEqual({ status: "read_only" });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle).toMatchObject({
      currentSubmission: { revision: 1, status: "active" },
      status: "read_only",
    });
  });

  test("never reveals or changes another invitation's response, including to an internal user", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-isolation-base-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const wrongPublication = await publishCombinedRound(
      fixture,
      "submission-isolation-wrong-round-001"
    );
    const wrongLifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: wrongPublication.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const wrongSubmit = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "submission-isolation-wrong-submit-001",
        quoteRoundInvitationId: wrongPublication.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    const internalWithdraw = await fixture.builder.mutation(
      (api as any).quote_response_submissions
        .withdrawClaimedQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(wrongLifecycle).toEqual({
      currentSubmission: null,
      draft: null,
      hasMoreRevisions: false,
      eligibility: {
        canRevise: false,
        canSubmit: false,
        canWithdraw: false,
        reason: "This Quote Invitation is unavailable.",
      },
      revisionCount: 0,
      revisionAcknowledgement: {
        acknowledgedFieldKeys: [],
        changedFieldKeys: [],
        required: false,
        status: "acknowledged",
      },
      revisions: [],
      status: "unavailable",
    });
    expect(wrongSubmit).toEqual({ status: "unavailable" });
    expect(internalWithdraw).toEqual({ status: "unavailable" });
    const lifecycle = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(lifecycle.currentSubmission).toMatchObject({
      revision: 1,
      status: "active",
    });
  });

  test("lets an exact claimed recipient continue the same invitation lifecycle without granting internal access", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 91_000_00);
    const recipient = withIdentity(
      fixture.base,
      ["member"],
      "claimed-submission-recipient",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "auth_claimed_submission_recipient",
        email: "quote-recipient@example.com",
        emailVerified: true,
        name: "Claimed submission recipient",
        status: "active",
        workosUserId: "claimed-submission-recipient",
      });
    });
    await recipient.mutation(
      (api as any).quote_invitation_access.claimQuoteInvitationProfile,
      { sessionToken: fixture.exchanged.sessionToken }
    );
    const claimedLifecycle = await recipient.query(
      (api as any).quote_response_submissions
        .getClaimedQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(claimedLifecycle).toMatchObject({
      draft: { lineItems: [{ quotedAmountCents: 91_000_00 }], version: 1 },
      status: "available",
    });
    const accepted = await recipient.mutation(
      (api as any).quote_response_submissions
        .submitClaimedQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "claimed-submission-001",
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(accepted).toMatchObject({
      status: "accepted",
      submission: { canonicalTotalCents: 91_000_00, revision: 1 },
    });
    const builderLifecycle = await fixture.builder.query(
      (api as any).quote_response_submissions
        .getClaimedQuoteInvitationResponseLifecycle,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
      }
    );
    expect(builderLifecycle).toEqual({
      currentSubmission: null,
      draft: null,
      hasMoreRevisions: false,
      eligibility: {
        canRevise: false,
        canSubmit: false,
        canWithdraw: false,
        reason: "This Quote Invitation is unavailable.",
      },
      revisionCount: 0,
      revisionAcknowledgement: {
        acknowledgedFieldKeys: [],
        changedFieldKeys: [],
        required: false,
        status: "acknowledged",
      },
      revisions: [],
      status: "unavailable",
    });
  });
});

function withIdentity(
  base: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
  organizationId = ORGANIZATION_ID,
  email = `${subject}@example.com`
) {
  return base.withIdentity({
    email,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

function tiptap(text: string) {
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

async function seedQuoteFixture(
  linkedVisibility: "recipient_shareable" | "unclassified" | "internal" =
    "recipient_shareable"
) {
  const base = convexTest(schema, modules);
  resendTest.register(base);
  const admin = withIdentity(base, ["admin", "principle-broker"], "user_admin");
  const builder = withIdentity(base, ["builder"], "user_builder");
  const foundation = await admin.mutation(
    (internal as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      brokerageId: foundation.brokerageId,
      buildName: "Quote Round Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "147 Cedar Ridge Road, Toronto, ON",
      locationLatitude: 43.654,
      locationLongitude: -79.383,
      locationPlaceId: "place_quote_fixture",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      timelineCurrentDay: 12,
      timelineRangeMax: 180,
      timelineRangeMin: 0,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId: foundation.brokerageId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: false,
      ruleKey: "quote-round-fixture",
      settings: {},
      version: 1,
      workflowRuleId: foundation.workflowRuleId,
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Quote Round Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road, Toronto, ON",
      locationLatitude: 43.654,
      locationLongitude: -79.383,
      locationPlaceId: "place_quote_fixture",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      timelineCurrentDay: 12,
      timelineRangeMax: 180,
      timelineRangeMin: 0,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now,
      displayNameSnapshot: "Builder Author",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "builder",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_builder",
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      createdAt: now,
      dayEnd: 30,
      dayStart: 10,
      dependencyKeys: [],
      drawAvailabilityCents: 75_000_000,
      durationDays: 20,
      key: "framing",
      name: "Framing",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      updatedAt: now,
    });
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      buildId,
      createdAt: now,
      dayEnd: 30,
      dayStart: 10,
      dependencyKeys: [],
      drawAvailabilityCents: 75_000_000,
      durationDays: 20,
      key: "framing",
      name: "Framing",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalMilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert("proposalSubmilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      createdAt: now,
      durationDays: 20,
      key: "frame-walls",
      milestoneKey: "framing",
      name: "Frame exterior walls",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalMilestoneId,
      startDay: 10,
      updatedAt: now,
    });
    const submilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      buildId,
      buildMilestoneId,
      createdAt: now,
      durationDays: 20,
      key: "frame-walls",
      milestoneKey: "framing",
      name: "Frame exterior walls",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalSubmilestoneId,
      startDay: 10,
      status: "planned",
      updatedAt: now,
    });
    const scopeContractId = await ctx.db.insert("submilestoneScopeContracts", {
      brokerageId: foundation.brokerageId,
      buildId,
      buildSubmilestoneId: submilestoneId,
      createdAt: now,
      latestVersion: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalSubmilestoneId,
      updatedAt: now,
    });
    const scopeRevisionId = await ctx.db.insert("submilestoneScopeRevisions", {
      authoredByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      changeReason: "Initial construction Scope.",
      contractId: scopeContractId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalSubmilestoneId,
      publishedAt: now,
      publishedByWorkosUserId: "user_admin",
      savedAt: now,
      scopeOfWorkTiptapJson: tiptap(
        "Install engineered wall system exactly."
      ),
      status: "published",
      version: 1,
    });
    await ctx.db.patch(scopeContractId, {
      effectiveRevisionId: scopeRevisionId,
    });
    const costItemId = await ctx.db.insert("buildCostItems", {
      brokerageId: foundation.brokerageId,
      budgetTreatment: "add",
      buildId,
      buildMilestoneId,
      costCents: 12_500_00,
      createdAt: now,
      createdByWorkosUserId: "user_builder",
      deliveryEndDay: 15,
      deliveryInstructions: "Stage inside the locked west gate.",
      deliveryLocation: "West gate laydown area",
      deliveryStartDay: 14,
      description: "Pressure-treated lumber package",
      itemKey: "lumber-package",
      itemType: "material",
      milestoneKey: "framing",
      organizationId: ORGANIZATION_ID,
      proposalId,
      quantity: 120,
      relevantSubmilestoneKeys: ["frame-walls"],
      specificationTiptapJson: tiptap("SPF #2, kiln dried, 2x6.") ,
      supplier: "Existing Materials Co.",
      title: "Framing lumber",
      unit: "pieces",
      updatedAt: now,
      updatedByWorkosUserId: "user_builder",
    });
    const makeGovernedDocument = async (
      documentType: "permit" | "supporting",
      fileName: string,
      contentHashSha256: string
    ) => {
      const storageId = await ctx.storage.store(
        new Blob([fileName], { type: "application/pdf" })
      );
      const assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: foundation.brokerageId,
        buildId,
        contentHashSha256,
        createdAt: now,
        fileName,
        maximumAudienceMode: "build_wide",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        scanCompletedAt: now,
        scanState: "clean",
        sizeBytes: fileName.length,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      const documentId = await ctx.db.insert("buildDocuments", {
        brokerageId: foundation.brokerageId,
        buildId,
        createdAt: now,
        documentType,
        fileName,
        governedAssetId: assetId,
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        proposalId,
        sizeBytes: fileName.length,
        status: "uploaded",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      return { assetId, documentId };
    };
    const permit = await makeGovernedDocument("permit", "permit.pdf", "a".repeat(64));
    const supporting = await makeGovernedDocument(
      "supporting",
      "framing-plan.pdf",
      "b".repeat(64)
    );
    await ctx.db.insert("buildSubmilestoneDocumentLinks", {
      brokerageId: foundation.brokerageId,
      buildDocumentId: supporting.documentId,
      buildId,
      buildSubmilestoneId: submilestoneId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      organizationId: ORGANIZATION_ID,
      updatedAt: now,
      visibility: linkedVisibility,
    });
    const recipientId = await ctx.db.insert("contractorProfiles", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      email: "quote-recipient@example.com",
      name: "Existing Trade and Supply Co.",
      normalizedEmail: "quote-recipient@example.com",
      organizationId: ORGANIZATION_ID,
      quoteRecipientCapabilities: ["contractor", "supplier"],
      status: "active",
      trades: ["framing", "materials"],
      updatedAt: now,
    });
    const contractorOnlyRecipientId = await ctx.db.insert("contractorProfiles", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      email: "contractor-only@example.com",
      name: "Existing Contractor Only Co.",
      organizationId: ORGANIZATION_ID,
      quoteRecipientCapabilities: ["contractor"],
      status: "active",
      trades: ["framing"],
      updatedAt: now,
    });
    const templateId = await ctx.db.insert("quoteResponseTemplates", {
      audience: "either",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      name: "Pinned quote response",
      organizationId: ORGANIZATION_ID,
      status: "active",
      templateKey: "pinned-quote-response",
      updatedAt: now,
    });
    const templateVersionId = await ctx.db.insert("quoteResponseTemplateVersions", {
      audience: "either",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      name: "Pinned quote response",
      organizationId: ORGANIZATION_ID,
      publishedAt: now,
      publishedByWorkosUserId: "user_admin",
      status: "published",
      templateId,
      updatedAt: now,
      validationState: "valid",
      version: 1,
    });
    await ctx.db.patch(templateId, {
      currentVersionId: templateVersionId,
      selectedVersionId: templateVersionId,
    });
    await ctx.db.insert("quoteResponseTemplateFields", {
      allowAlternates: false,
      allowExclusions: false,
      brokerageId: foundation.brokerageId,
      createdAt: now,
      fieldKey: "approach",
      isPermanent: true,
      kind: "long_text",
      label: "Approach",
      organizationId: ORGANIZATION_ID,
      order: 0,
      renderer: "tiptap",
      repeatable: false,
      required: true,
      richTextDefaultHtml: "<p>Describe the approach.</p>",
      scope: "whole_quote",
      supportsTax: false,
      templateId,
      updatedAt: now,
      versionId: templateVersionId,
    });
    return {
      brokerageId: foundation.brokerageId,
      buildId,
      contractorOnlyRecipientId,
      costItemId,
      permit,
      proposalId,
      proposalSubmilestoneId,
      recipientId,
      scopeContractId,
      scopeRevisionId,
      submilestoneId,
      supporting,
      templateVersionId,
    };
  });
  return { admin, base, builder, ...seeded };
}

async function addScopeRevision(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  input: {
    changeReason?: string;
    content: string;
    effective?: boolean;
    status?: "draft" | "published";
    version: number;
  }
) {
  return await fixture.base.run(async (ctx) => {
    const now = Date.now();
    const prior = await ctx.db.get(fixture.scopeRevisionId);
    if (!prior) {
      throw new Error("Expected seeded prior Scope revision in quote fixture.");
    }
    const contract = await ctx.db.get(fixture.scopeContractId);
    if (!contract) {
      throw new Error("Expected seeded Scope contract in quote fixture.");
    }
    const status = input.status ?? "published";
    const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
      authoredByWorkosUserId: "user_admin",
      basedOnRevisionId: prior._id,
      brokerageId: fixture.brokerageId,
      changeReason: input.changeReason,
      contractId: fixture.scopeContractId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalId: prior.proposalId,
      proposalSubmilestoneId: fixture.proposalSubmilestoneId,
      ...(status === "published"
        ? {
            publishedAt: now,
            publishedByWorkosUserId: "user_admin",
          }
        : {}),
      savedAt: now,
      scopeOfWorkTiptapJson: tiptap(input.content),
      status,
      version: input.version,
    });
    await ctx.db.patch(fixture.scopeContractId, {
      ...(input.effective ? { effectiveRevisionId: revisionId } : {}),
      ...(status === "draft" ? { activeDraftRevisionId: revisionId } : {}),
      latestVersion: Math.max(input.version, contract.latestVersion),
      updatedAt: now,
    });
    return revisionId;
  });
}

async function configureRound(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  mode: "labour" | "material" | "combined",
  input: {
    materialRows?: unknown[];
    recipientProfileIds?: Id<"contractorProfiles">[];
  } = {}
) {
  const created = await fixture.builder.mutation(
    (api as any).quote_rounds.createQuoteRoundDraft,
    {
      buildId: fixture.buildId,
      mode,
      title: `${mode} quote`,
      workosOrganizationId: ORGANIZATION_ID,
    }
  );
  await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
    buildId: fixture.buildId,
    expectedRevision: created.revision,
    ...(mode !== "material" ? { labourSubmilestoneIds: [fixture.submilestoneId] } : {}),
    ...(mode !== "labour"
      ? {
          materialRows:
            input.materialRows ??
            [
              {
                assignedSubmilestoneIds: [fixture.submilestoneId],
                rowKey: "canonical-lumber",
                source: "build_cost_item",
                sourceBuildCostItemId: fixture.costItemId,
              },
            ],
        }
      : {}),
    recipientProfileIds: input.recipientProfileIds ?? [fixture.recipientId],
    responseDeadline: Date.now() + 86_400_000,
    templateVersionId: fixture.templateVersionId,
    quoteRoundId: created.quoteRoundId,
    workosOrganizationId: ORGANIZATION_ID,
  });
  return created;
}

async function publishCombinedRound(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  idempotencyKey: string
) {
  const created = await configureRound(fixture, "combined");
  await fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
    buildId: fixture.buildId,
    expectedRevision: 1,
    idempotencyKey,
    quoteRoundId: created.quoteRoundId,
    workosOrganizationId: ORGANIZATION_ID,
  });
  return await fixture.base.run(async (ctx) => {
    const invitation = await ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query
          .eq("quoteRoundId", created.quoteRoundId)
          .eq("participationState", "active")
      )
      .unique();
    if (!invitation) {
      throw new Error("Expected a published Quote invitation.");
    }
    const credential = await ctx.db
      .query("quoteInvitationAccessCredentials")
      .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
        query
          .eq("quoteRoundInvitationId", invitation._id)
          .eq("state", "active")
      )
      .unique();
    if (!credential) {
      throw new Error("Expected an active Quote invitation credential.");
    }
    return { credential, invitation };
  });
}

async function openedSubmissionFixture() {
  const fixture = await seedQuoteFixture();
  const { credential, invitation } = await publishCombinedRound(
    fixture,
    "response-submission-publish-001"
  );
  const magicToken = "response-submission-browser-token";
  await replaceCredentialMagicToken(fixture, credential._id, magicToken);
  const exchanged = await fixture.base.mutation(
    (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
    { magicToken }
  );
  if (exchanged.status !== "available") {
    throw new Error("Expected a usable Quote Invitation browser session.");
  }
  return { ...fixture, exchanged, invitation, magicToken };
}

async function saveCompleteSubmissionDraft(
  fixture: Awaited<ReturnType<typeof openedSubmissionFixture>>,
  amountCents = 125_000_00
) {
  const before = await fixture.base.query(
    (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
    {
      presentationNow: Date.now(),
      quoteRoundInvitationId: fixture.invitation._id,
      sessionToken: fixture.exchanged.sessionToken,
    }
  );
  const labourLine = before.access.package.labourLines[0];
  const requiredAnswer = before.access.package.responseFields.find(
    (field: { fieldKey: string }) => field.fieldKey === "approach"
  );
  if (!requiredAnswer) {
    throw new Error("Expected the required approach response field.");
  }
  const saved = await fixture.base.mutation(
    (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
    {
      expectedVersion: 0,
      patch: {
        answerPatches: [
          {
            sourcePackageRevisionResponseFieldId: requiredAnswer.sourceFieldId,
            value: "<p>We will stage the crew before framing.</p>",
          },
        ],
        linePatches: [
          {
            lineKey: `labour:${labourLine.sourceLineId}`,
            quotedAmountCents: amountCents,
            scope: "labour",
            source: "package_labour",
            sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
          },
        ],
      },
      quoteRoundInvitationId: fixture.invitation._id,
      sessionToken: fixture.exchanged.sessionToken,
    }
  );
  expect(saved).toMatchObject({ status: "saved", draft: { version: 1 } });
  return { before, saved };
}

async function replaceCredentialMagicToken(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  credentialId: Id<"quoteInvitationAccessCredentials">,
  magicToken: string,
  accessExpiresAt?: number
) {
  const credentialVerifier = await quoteInvitationSecretVerifier(magicToken);
  await fixture.base.run(async (ctx) => {
    await ctx.db.patch(credentialId, {
      ...(accessExpiresAt === undefined ? {} : { accessExpiresAt }),
      credentialVerifier,
      state: "active",
      updatedAt: Date.now(),
    });
  });
}

async function publishComparisonRound(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  recipientProfileIds: Id<"contractorProfiles">[] = [fixture.recipientId]
) {
  const created = await configureRound(fixture, "combined", {
    recipientProfileIds,
  });
  await fixture.builder.mutation(
    (api as any).quote_rounds.publishQuoteRoundDraft,
    {
      buildId: fixture.buildId,
      expectedRevision: 1,
      idempotencyKey: `comparison-publish-${String(created.quoteRoundId)}`,
      quoteRoundId: created.quoteRoundId,
      workosOrganizationId: ORGANIZATION_ID,
    }
  );
  const invitations = await fixture.base.run(async (ctx) =>
    await ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query
          .eq("quoteRoundId", created.quoteRoundId)
          .eq("participationState", "active")
      )
      .take(recipientProfileIds.length + 1)
  );
  expect(invitations).toHaveLength(recipientProfileIds.length);
  return { invitations, quoteRoundId: created.quoteRoundId };
}

async function submitComparisonCandidate(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  invitation: Doc<"quoteRoundInvitations">,
  input: {
    attachment?: boolean;
    commentsHtml?: string;
    labourCents: number;
    materialCents: number;
    tokenSuffix: string;
  }
) {
  const credential = await fixture.base.run(async (ctx) =>
    await ctx.db
      .query("quoteInvitationAccessCredentials")
      .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
        query.eq("quoteRoundInvitationId", invitation._id).eq("state", "active")
      )
      .first()
  );
  if (!credential) {
    throw new Error("Expected an active comparison credential.");
  }
  const magicToken = `comparison-browser-${input.tokenSuffix}`;
  await replaceCredentialMagicToken(fixture, credential._id, magicToken);
  const exchanged = await fixture.base.mutation(
    (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
    { magicToken }
  );
  if (exchanged.status !== "available") {
    throw new Error("Expected comparison invitation access.");
  }
  const access = await fixture.base.query(
    (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
    {
      presentationNow: Date.now(),
      quoteRoundInvitationId: invitation._id,
      sessionToken: exchanged.sessionToken,
    }
  );
  const labourLine = access.access.package.labourLines[0];
  const materialLine = access.access.package.materialLines[0];
  const requiredAnswer = access.access.package.responseFields.find(
    (field: { fieldKey: string }) => field.fieldKey === "approach"
  );
  if (!(labourLine && materialLine && requiredAnswer)) {
    throw new Error("Expected mixed comparison Package facts.");
  }
  const saved = await fixture.base.mutation(
    (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
    {
      expectedVersion: 0,
      patch: {
        answerPatches: [
          {
            sourcePackageRevisionResponseFieldId: requiredAnswer.sourceFieldId,
            value: `<p>Schedule ${input.tokenSuffix}: mobilize in 5 days.</p>`,
          },
        ],
        commentsHtml:
          input.commentsHtml ?? `<p>Commercial note ${input.tokenSuffix}.</p>`,
        linePatches: [
          {
            lineKey: `labour:${labourLine.sourceLineId}`,
            quotedAmountCents: input.labourCents,
            scope: "labour",
            source: "package_labour",
            sourcePackageRevisionLabourLineId: labourLine.sourceLineId,
          },
          {
            lineKey: `material:${materialLine.sourceLineId}`,
            quotedAmountCents: input.materialCents,
            scope: "materials",
            source: "package_material",
            sourcePackageRevisionMaterialLineId: materialLine.sourceLineId,
          },
          {
            lineKey: `expanded:alternate-${input.tokenSuffix}`,
            quotedAmountCents: 250_00,
            scope: "labour",
            source: "expanded_scope",
            title: `Alternate ${input.tokenSuffix}`,
          },
          {
            lineKey: `expanded:exclusion-${input.tokenSuffix}`,
            scope: "materials",
            source: "expanded_scope",
            title: `Exclusion ${input.tokenSuffix}`,
          },
        ],
      },
      quoteRoundInvitationId: invitation._id,
      sessionToken: exchanged.sessionToken,
    }
  );
  expect(saved).toMatchObject({ status: "saved", draft: { version: 1 } });

  if (input.attachment) {
    await fixture.base.run(async (ctx) => {
      const draft = await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", invitation._id)
              .eq("quotePackageRevisionId", invitation.quotePackageRevisionId)
        )
        .unique();
      if (!draft) {
        throw new Error("Expected comparison response Draft.");
      }
      const bytes = new Blob([`comparison-${input.tokenSuffix}`], {
        type: "application/pdf",
      });
      const storageId = await ctx.storage.store(bytes);
      await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
        brokerageId: invitation.brokerageId,
        buildId: invitation.buildId,
        createdAt: Date.now(),
        fileName: `comparison-${input.tokenSuffix}.pdf`,
        mimeType: "application/pdf",
        organizationId: invitation.organizationId,
        quoteInvitationResponseDraftId: draft._id,
        quotePackageRevisionId: invitation.quotePackageRevisionId,
        quoteRoundId: invitation.quoteRoundId,
        quoteRoundInvitationId: invitation._id,
        sizeBytes: bytes.size,
        storageId,
      });
      await ctx.db.patch(draft._id, {
        attachmentCount: draft.attachmentCount + 1,
        updatedAt: Date.now(),
      });
    });
  }

  const submitted = await fixture.base.mutation(
    (api as any).quote_response_submissions.submitQuoteInvitationResponse,
    {
      expectedDraftVersion: 1,
      idempotencyKey: `comparison-submit-${input.tokenSuffix}`,
      quoteRoundInvitationId: invitation._id,
      sessionToken: exchanged.sessionToken,
    }
  );
  expect(submitted).toMatchObject({ status: "accepted", submission: { revision: 1 } });
  const submissionRevisionId = await fixture.base.run(async (ctx) => {
    const state = await ctx.db
      .query("quoteInvitationResponseSubmissionStates")
      .withIndex(
        "by_quoteRoundInvitationId_and_quotePackageRevisionId",
        (query) =>
          query
            .eq("quoteRoundInvitationId", invitation._id)
            .eq("quotePackageRevisionId", invitation.quotePackageRevisionId)
      )
      .unique();
    if (!state?.activeSubmissionRevisionId) {
      throw new Error("Expected an active comparison submission.");
    }
    return state.activeSubmissionRevisionId;
  });
  return { exchanged, submissionRevisionId, submitted };
}

describe("Quote Round draft-to-open aggregate", () => {
  test.each([
    ["Admin", ["admin"]],
    ["Principle Broker", ["principle-broker"]],
  ] as const)(
    "%s can create a Quote Round and continue a Builder-created draft",
    async (_label, roles) => {
      const fixture = await seedQuoteFixture();
      const backofficeAuthor = withIdentity(
        fixture.base,
        [...roles],
        `user_${roles[0]}_quote_author`
      );
      const builderDraft = await fixture.builder.mutation(
        api.quote_rounds.createQuoteRoundDraft,
        {
          buildId: fixture.buildId,
          mode: "combined",
          title: "Builder-started shared draft",
          workosOrganizationId: ORGANIZATION_ID,
        }
      );

      await expect(
        backofficeAuthor.query(api.quote_rounds.getQuoteRoundComposer, {
          buildId: fixture.buildId,
          workosOrganizationId: ORGANIZATION_ID,
        })
      ).resolves.toMatchObject({ build: { _id: fixture.buildId } });
      await expect(
        backofficeAuthor.mutation(api.quote_rounds.updateQuoteRoundDraft, {
          buildId: fixture.buildId,
          expectedRevision: builderDraft.revision,
          quoteRoundId: builderDraft.quoteRoundId,
          title: `${roles[0]} continued draft`,
          workosOrganizationId: ORGANIZATION_ID,
        })
      ).resolves.toMatchObject({ revision: 1, state: "draft" });
      await expect(
        backofficeAuthor.mutation(api.quote_rounds.createQuoteRoundDraft, {
          buildId: fixture.buildId,
          mode: "labour",
          title: `${roles[0]} created draft`,
          workosOrganizationId: ORGANIZATION_ID,
        })
      ).resolves.toMatchObject({ revision: 0, state: "draft" });
    }
  );

  test("deletes only a mutable Quote Round draft and preserves its deletion audit", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "combined");

    await expect(
      fixture.admin.mutation((api as any).quote_rounds.deleteQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();

    const persisted = await fixture.base.run(async (ctx) => ({
      assignments: await ctx.db
        .query("quoteRoundDraftMaterialAssignments")
        .collect(),
      audit: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRound")
            .eq("entityId", String(created.quoteRoundId))
        )
        .collect(),
      draft: await ctx.db.query("quoteRoundDrafts").collect(),
      labour: await ctx.db.query("quoteRoundDraftLabourScope").collect(),
      materialRows: await ctx.db.query("quoteRoundDraftMaterialRows").collect(),
      recipients: await ctx.db.query("quoteRoundDraftRecipients").collect(),
      round: await ctx.db.get(created.quoteRoundId),
    }));
    expect(persisted).toMatchObject({
      assignments: [],
      draft: [],
      labour: [],
      materialRows: [],
      recipients: [],
      round: null,
    });
    expect(persisted.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRole: "admin",
          command: "deleteQuoteRoundDraft",
          eventType: "quote_round.draft_deleted",
        }),
      ])
    );
  });

  test("rejects deleting a published Quote Round", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishCombinedRound(
      fixture,
      "draft-delete-published-001"
    );

    await expect(
      fixture.admin.mutation((api as any).quote_rounds.deleteQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 2,
        quoteRoundId: published.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Only draft Quote Rounds may be deleted/);
  });

  test("rejects deleting a draft row that retains an immutable Package Revision", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishCombinedRound(
      fixture,
      "draft-delete-package-revision-001"
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(published.invitation.quoteRoundId, { state: "draft" });
    });

    await expect(
      fixture.admin.mutation((api as any).quote_rounds.deleteQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 2,
        quoteRoundId: published.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Published Quote Round rows are immutable/);
    await expect(
      fixture.base.run((ctx) =>
        ctx.db.get(published.invitation.quoteRoundId)
      )
    ).resolves.toMatchObject({ state: "draft" });
  });

  test("requires HTTPS for bearer invitation URLs outside explicit loopback development origins", () => {
    vi.stubEnv("QUOTE_INVITATION_PUBLIC_ORIGIN", "http://drawflow.test");
    expect(() => quoteInvitationUrl("raw-bearer-token")).toThrow(/HTTPS/);

    vi.stubEnv("QUOTE_INVITATION_PUBLIC_ORIGIN", "http://127.0.0.1:3000");
    expect(quoteInvitationUrl("raw-bearer-token")).toBe(
      "http://127.0.0.1:3000/quote-invitation/raw-bearer-token"
    );
  });

  test("caps the default invitation access window at 90 days after publication", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(() =>
      defaultQuoteInvitationAccessExpiry({
        publishedAt: 0,
        responseDeadline: 90 * day,
      })
    ).toThrow(/90 days after publication/);
    expect(
      defaultQuoteInvitationAccessExpiry({
        publishedAt: 0,
        responseDeadline: 83 * day,
      })
    ).toBe(90 * day);
  });

  test("opens a combined round atomically with immutable rich scope, hashed attachments, credentials, and idempotency", async () => {
    const fixture = await seedQuoteFixture();
    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer.materialCostItems[0]).toMatchObject({
      _id: fixture.costItemId,
      deliveryInstructions: "Stage inside the locked west gate.",
      unit: "pieces",
    });
    expect(composer.labourSubmilestones[0]?.scopeOfWorkTiptapJson).toBe(
      tiptap("Install engineered wall system exactly.")
    );
    expect(composer.labourSubmilestones[0]).toMatchObject({
      sourceScopeChangeReason: "Initial construction Scope.",
      sourceScopeRevisionId: fixture.scopeRevisionId,
      sourceScopeVersion: 1,
    });
    expect(composer.responseTemplates[0]?._id).toBe(fixture.templateVersionId);

    const created = await configureRound(fixture, "combined", {
      materialRows: [
        {
          assignedSubmilestoneIds: [fixture.submilestoneId],
          rowKey: "canonical-lumber",
          source: "build_cost_item",
          sourceBuildCostItemId: fixture.costItemId,
        },
        {
          assignedSubmilestoneIds: [fixture.submilestoneId],
          deliveryEndDay: 22,
          deliveryInstructions: "Call the superintendent before unloading.",
          deliveryLocation: "Driveway staging bay",
          deliveryStartDay: 21,
          description: "Custom brackets",
          quantity: 14,
          rowKey: "ad-hoc-brackets",
          source: "ad_hoc",
          specificationTiptapJson: tiptap("Powder-coated galvanized brackets."),
          title: "Custom brackets",
          unit: "each",
        },
      ],
    });
    const updated = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(updated).toMatchObject({ revision: 1, state: "draft" });
    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-combined-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(published).toMatchObject({
      idempotentReplay: false,
      invitationCount: 1,
      packageRevisionNumber: 1,
      state: "open",
    });
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (setting) {
        await ctx.db.patch(setting._id, {
          serviceLifecycle: "restricted_archive",
          status: "disabled",
          updatedAt: now,
        });
        return;
      }
      await ctx.db.insert("buildCollaborationTenantSettings", {
        brokerageId: fixture.brokerageId,
        createdAt: now,
        generousRateLimitMultiplier: 1,
        organizationId: ORGANIZATION_ID,
        serviceLifecycle: "restricted_archive",
        status: "disabled",
        updatedAt: now,
      });
    });
    const replay = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-combined-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(replay).toEqual({ ...published, idempotentReplay: true });
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) {
        throw new Error("Expected restricted-archive tenant settings.");
      }
      await ctx.db.patch(setting._id, {
        serviceLifecycle: "active",
        status: "active",
        updatedAt: Date.now(),
      });
    });

    const quoteRoundId = created.quoteRoundId as Id<"quoteRounds">;
    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      if (!round?.currentPackageRevisionId) throw new Error("Package was not published.");
      const packageRevision = await ctx.db.get(round.currentPackageRevisionId);
      const attachments = await ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (q) =>
          q.eq("quotePackageRevisionId", round.currentPackageRevisionId!)
        )
        .collect();
      const invitations = await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (q) =>
          q.eq("quoteRoundId", quoteRoundId).eq("participationState", "active")
        )
        .collect();
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (q) =>
          q.eq("quoteRoundInvitationId", invitations[0]!._id).eq("state", "active")
        )
        .collect();
      const fields = await ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (q) =>
          q.eq("quotePackageRevisionId", round.currentPackageRevisionId!)
        )
        .collect();
      const labourLines = await ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (q) =>
          q.eq("quotePackageRevisionId", round.currentPackageRevisionId!)
        )
        .collect();
      const communicationIntents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (q) =>
          q.eq("quoteRoundInvitationId", invitations[0]!._id)
        )
        .collect();
      return {
        attachments,
        credentials,
        fields,
        invitations,
        labourLines,
        communicationIntents,
        packageRevision,
        round,
      };
    });
    expect(persisted.round).toMatchObject({ revision: 2, state: "open" });
    expect(persisted.packageRevision).toMatchObject({
      permitDocumentId: fixture.permit.documentId,
      siteAddressSnapshot: "147 Cedar Ridge Road, Toronto, ON",
      siteMapUrlSnapshot: expect.stringContaining("43.654%2C-79.383"),
      templateVersionId: fixture.templateVersionId,
      timelineCurrentDaySnapshot: 12,
    });
    expect(persisted.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentHashSha256Snapshot: "a".repeat(64),
          kind: "permit",
          sourceBuildDocumentId: fixture.permit.documentId,
        }),
        expect.objectContaining({
          contentHashSha256Snapshot: "b".repeat(64),
          kind: "inherited",
          sourceBuildDocumentId: fixture.supporting.documentId,
        }),
      ])
    );
    expect(persisted.fields).toHaveLength(1);
    expect(persisted.labourLines).toEqual([
      expect.objectContaining({
        scopeOfWorkTiptapJson: tiptap(
          "Install engineered wall system exactly."
        ),
        sourceScopeChangeReason: "Initial construction Scope.",
        sourceScopeRevisionId: fixture.scopeRevisionId,
        sourceScopeVersion: 1,
      }),
    ]);
    expect(persisted.credentials).toHaveLength(1);
    expect(persisted.credentials[0]).toMatchObject({
      accessGeneration: 1,
      credentialVersion: 1,
      purpose: "initial",
      state: "active",
    });
    expect(persisted.credentials[0]?.credentialVerifier).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.packageRevision?.accessExpiresAt).toBeGreaterThan(
      persisted.packageRevision?.responseDeadline ?? 0
    );
    expect(persisted.communicationIntents).toHaveLength(1);
    expect(persisted.communicationIntents[0]).toMatchObject({
      idempotencyKey: `quote-invitation:${persisted.invitations[0]!._id}:access-generation:1:credential:1`,
      kind: "quote_invitation_initial",
      organizationId: ORGANIZATION_ID,
      recipientEmailSnapshot: "quote-recipient@example.com",
      relatedEntityType: "quoteRoundInvitation",
      status: "pending",
      templateKey: "quote_invitation",
    });
    expect(persisted.communicationIntents[0]?.quoteInvitationAccessCredentialId).toBe(
      persisted.credentials[0]?._id
    );
    expect(persisted.credentials[0]?.deliveryEmailMessageId).toBeUndefined();

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.scopeRevisionId, {
        scopeOfWorkTiptapJson: tiptap("Mutated after publication."),
      });
      await ctx.db.patch(fixture.costItemId, {
        deliveryInstructions: "Mutated after publication.",
        title: "Mutated material",
      });
    });
    const opened = await fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
      buildId: fixture.buildId,
      quoteRoundId: created.quoteRoundId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    expect(opened.packageRevision.labourLines[0]?.scopeOfWorkTiptapJson).toBe(
      tiptap("Install engineered wall system exactly.")
    );
    expect(opened.packageRevision.materialLines[0]).toMatchObject({
      deliveryInstructions: "Stage inside the locked west gate.",
      title: "Framing lumber",
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 2,
        quoteRoundId: created.quoteRoundId,
        title: "Illegal post-open edit",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/immutable/);
  });

  test("does not expose an execution note as Quote Scope when a closed Build row has no legacy Scope", async () => {
    const fixture = await seedQuoteFixture();
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(fixture.scopeRevisionId);
      await ctx.db.delete(fixture.scopeContractId);
      await ctx.db.patch(fixture.submilestoneId, {
        fieldNote: "Execution-only note: verify the west elevation.",
      });
    });

    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );

    expect(
      composer?.labourSubmilestones.some(
        (submilestone: { _id: Id<"buildSubmilestones"> }) =>
          submilestone._id === fixture.submilestoneId
      )
    ).toBe(false);
    expect(JSON.stringify(composer)).not.toContain(
      "Execution-only note: verify the west elevation."
    );
  });

  test("uses the effective canonical Scope revision as the sole Scope source", async () => {
    const fixture = await seedQuoteFixture();

    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer?.labourSubmilestones[0]?.scopeOfWorkTiptapJson).toBe(
      tiptap("Install engineered wall system exactly.")
    );
    expect(composer?.labourSubmilestones[0]).toMatchObject({
      sourceScopeRevisionId: fixture.scopeRevisionId,
      sourceScopeVersion: 1,
    });
  });

  test("keeps a successor draft out of Quote composition and publication", async () => {
    const fixture = await seedQuoteFixture();
    const successorDraftId = await addScopeRevision(fixture, {
      changeReason: "Draft structural revision.",
      content: "Unpublished successor Scope must stay private.",
      status: "draft",
      version: 2,
    });

    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer?.labourSubmilestones[0]).toMatchObject({
      scopeOfWorkTiptapJson: tiptap(
        "Install engineered wall system exactly."
      ),
      sourceScopeRevisionId: fixture.scopeRevisionId,
      sourceScopeVersion: 1,
    });
    expect(JSON.stringify(composer)).not.toContain(String(successorDraftId));
    expect(JSON.stringify(composer)).not.toContain(
      "Unpublished successor Scope must stay private."
    );

    const published = await publishCombinedRound(
      fixture,
      "publish-with-successor-draft-001"
    );
    const labourLine = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq(
            "quotePackageRevisionId",
            published.invitation.quotePackageRevisionId
          )
        )
        .unique()
    );
    expect(labourLine).toMatchObject({
      scopeOfWorkTiptapJson: tiptap(
        "Install engineered wall system exactly."
      ),
      sourceScopeRevisionId: fixture.scopeRevisionId,
      sourceScopeVersion: 1,
    });
  });

  test("pins draft Scope until an explicit refresh adopts the current effective revision", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");
    const initial = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(initial).toMatchObject({
      draft: {
        labourLines: [
          {
            buildSubmilestoneId: fixture.submilestoneId,
            scopeOfWorkTiptapJson: tiptap(
              "Install engineered wall system exactly."
            ),
            sourceScopeRevisionId: fixture.scopeRevisionId,
            sourceScopeVersion: 1,
          },
        ],
        scopeUpdateAvailable: false,
      },
      scopeUpdateAvailable: false,
      state: "draft",
    });

    const revision2Id = await addScopeRevision(fixture, {
      changeReason: "Clarify structural fastening quantities.",
      content: "Effective v2 structural Scope.",
      effective: true,
      version: 2,
    });
    const stale = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(stale).toMatchObject({
      draft: {
        labourLines: [
          {
            scopeOfWorkTiptapJson: tiptap(
              "Install engineered wall system exactly."
            ),
            sourceScopeRevisionId: fixture.scopeRevisionId,
            sourceScopeVersion: 1,
          },
        ],
        scopeUpdateAvailable: true,
      },
      scopeUpdateAvailable: true,
    });
    const registerBeforeRefresh = await fixture.builder.query(
      (api as any).quote_rounds.listQuoteRounds,
      {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(registerBeforeRefresh.rounds[0]).toMatchObject({
      scopeUpdateAvailable: true,
    });

    const ordinarySave = await fixture.builder.mutation(
      (api as any).quote_rounds.updateQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        labourSubmilestoneIds: [fixture.submilestoneId],
        quoteRoundId: created.quoteRoundId,
        title: "Ordinary edit preserves pinned Scope",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(ordinarySave).toMatchObject({ revision: 2 });
    const preserved = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteRoundDraftLabourScope")
        .withIndex("by_quoteRoundId_and_order", (query) =>
          query.eq("quoteRoundId", created.quoteRoundId)
        )
        .unique()
    );
    expect(preserved).toMatchObject({
      scopeOfWorkTiptapJson: tiptap(
        "Install engineered wall system exactly."
      ),
      sourceScopeRevisionId: fixture.scopeRevisionId,
      sourceScopeVersion: 1,
    });

    const refreshed = await fixture.builder.mutation(
      (api as any).quote_rounds.refreshQuoteRoundDraftScope,
      {
        buildId: fixture.buildId,
        expectedRevision: ordinarySave.revision,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(refreshed).toMatchObject({
      revision: 3,
      scopePinTransitions: [
        {
          buildSubmilestoneId: fixture.submilestoneId,
          newSourceScopeRevisionId: revision2Id,
          priorSourceScopeRevisionId: fixture.scopeRevisionId,
        },
      ],
      state: "draft",
    });
    const refreshAudit = await fixture.base.run(async (ctx) => {
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRound")
            .eq("entityId", String(created.quoteRoundId))
        )
        .collect();
      return audits.find(
        (audit) => audit.eventType === "quote_round.draft_scope_refreshed"
      );
    });
    expect(refreshAudit).toBeDefined();
    expect(JSON.parse(refreshAudit?.priorState ?? "{}")).toMatchObject({
      labourLineCount: 1,
      revision: 2,
      scopePinTransitions: [
        {
          buildSubmilestoneId: fixture.submilestoneId,
          sourceScopeRevisionId: fixture.scopeRevisionId,
        },
      ],
    });
    expect(JSON.parse(refreshAudit?.newState ?? "{}")).toMatchObject({
      labourLineCount: 1,
      revision: 3,
      scopePinTransitions: [
        {
          buildSubmilestoneId: fixture.submilestoneId,
          sourceScopeRevisionId: revision2Id,
        },
      ],
    });
    const refreshedRound = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(refreshedRound).toMatchObject({
      draft: {
        labourLines: [
          {
            scopeOfWorkTiptapJson: tiptap("Effective v2 structural Scope."),
            sourceScopeChangeReason:
              "Clarify structural fastening quantities.",
            sourceScopeRevisionId: revision2Id,
            sourceScopeVersion: 2,
          },
        ],
        scopeUpdateAvailable: false,
      },
      scopeUpdateAvailable: false,
    });

    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: refreshed.revision,
        idempotencyKey: "publish-refreshed-scope-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const packageLine = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", published.packageRevisionId)
        )
        .unique()
    );
    expect(packageLine).toMatchObject({
      scopeOfWorkTiptapJson: tiptap("Effective v2 structural Scope."),
      sourceScopeChangeReason: "Clarify structural fastening quantities.",
      sourceScopeRevisionId: revision2Id,
      sourceScopeVersion: 2,
    });
  });

  test("requires mutable draft Scope pins while preserving optional historical Package pins", async () => {
    const fixture = await seedQuoteFixture();
    const draft = await configureRound(fixture, "labour");
    const draftScope = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteRoundDraftLabourScope")
        .withIndex("by_quoteRoundId_and_order", (query) =>
          query.eq("quoteRoundId", draft.quoteRoundId)
        )
        .unique()
    );
    if (!draftScope) {
      throw new Error("Expected the configured draft Labour Scope row.");
    }
    await expect(
      fixture.base.run((ctx) =>
        ctx.db.patch(draftScope._id, {
          scopeOfWorkTiptapJson: undefined,
        })
      )
    ).rejects.toThrow(/required/i);

    const published = await publishCombinedRound(
      fixture,
      "historical-package-scope-pins-optional-001"
    );
    const packageLine = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq(
            "quotePackageRevisionId",
            published.invitation.quotePackageRevisionId
          )
        )
        .unique()
    );
    if (!packageLine) {
      throw new Error("Expected the published historical Package Labour row.");
    }
    await fixture.base.run((ctx) =>
      ctx.db.patch(packageLine._id, {
        sourceScopeRevisionId: undefined,
        sourceScopeVersion: undefined,
      })
    );
    const historical = await fixture.base.run((ctx) =>
      ctx.db.get(packageLine._id)
    );
    expect(historical).toMatchObject({
      scopeOfWorkTiptapJson: tiptap("Install engineered wall system exactly."),
    });
    expect(historical?.sourceScopeRevisionId).toBeUndefined();
    expect(historical?.sourceScopeVersion).toBeUndefined();
  });

  test("rejects publication when a pinned revision is no longer effective instead of reading legacy Scope", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.scopeContractId, {
        effectiveRevisionId: undefined,
      });
    });

    await expect(
      fixture.builder.mutation(
        (api as any).quote_rounds.publishQuoteRoundDraft,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          idempotencyKey: "publish-stale-scope-pin-001",
          quoteRoundId: created.quoteRoundId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/refresh.*Scope|effective.*Scope/i);
  });

  test("does not advertise a Scope update when no effective Scope exists", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");

    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.scopeContractId, { effectiveRevisionId: undefined })
    );
    const draftDetail = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const draftRegister = await fixture.builder.query(
      (api as any).quote_rounds.listQuoteRounds,
      {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(draftDetail).toMatchObject({
      draft: { scopeUpdateAvailable: false },
      scopeUpdateAvailable: false,
    });
    expect(draftRegister.rounds).toEqual([
      expect.objectContaining({
        _id: created.quoteRoundId,
        scopeUpdateAvailable: false,
        state: "draft",
      }),
    ]);

    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.scopeContractId, {
        effectiveRevisionId: fixture.scopeRevisionId,
      })
    );
    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-scope-update-null-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.scopeContractId, { effectiveRevisionId: undefined })
    );

    const openDetail = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: published.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const openRegister = await fixture.builder.query(
      (api as any).quote_rounds.listQuoteRounds,
      {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(openDetail).toMatchObject({
      scopeUpdateAvailable: false,
      state: "open",
    });
    expect(openRegister.rounds).toEqual([
      expect.objectContaining({
        _id: published.quoteRoundId,
        scopeUpdateAvailable: false,
        state: "open",
      }),
    ]);
  });

  test("never includes Field Guidance in Quote composer, package, or recipient access", async () => {
    const fixture = await seedQuoteFixture();
    const guidanceSentinel = "FIELD-GUIDANCE-MUST-NOT-ENTER-QUOTE";
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("submilestoneFieldGuidance", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildSubmilestoneId: fixture.submilestoneId,
        cameraAnglesTiptapJson: tiptap(`${guidanceSentinel}-CAMERA`),
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        proposalSubmilestoneId: fixture.proposalSubmilestoneId,
        updatedAt: now,
        updatedByWorkosUserId: "user_admin",
        whatToVerifyTiptapJson: tiptap(`${guidanceSentinel}-VERIFY`),
      });
    });
    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(JSON.stringify(composer)).not.toContain(guidanceSentinel);

    const published = await publishCombinedRound(
      fixture,
      "publish-with-field-guidance-001"
    );
    const round = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: published.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(JSON.stringify(round)).not.toContain(guidanceSentinel);

    const magicToken = "field-guidance-exclusion-browser-token";
    await replaceCredentialMagicToken(
      fixture,
      published.credential._id,
      magicToken
    );
    const access = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    expect(access).toMatchObject({
      access: {
        package: {
          labourLines: [
            {
              sourceScopeChangeReason: "Initial construction Scope.",
              sourceScopeRevisionId: fixture.scopeRevisionId,
              sourceScopeVersion: 1,
            },
          ],
        },
      },
      status: "available",
    });
    expect(JSON.stringify(access)).not.toContain(guidanceSentinel);
  });

  test("omits corrupt canonical Scope rows from the composer but rejects them at publication", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(fixture.scopeRevisionId);
      await ctx.db.delete(fixture.scopeContractId);
      const buildSubmilestone = await ctx.db.get(fixture.submilestoneId);
      if (!buildSubmilestone) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const proposalSubmilestone = await ctx.db.get(
        buildSubmilestone.proposalSubmilestoneId
      );
      const build = await ctx.db.get(buildSubmilestone.buildId);
      if (!proposalSubmilestone || !build) {
        throw new Error("Fixture Scope lineage is unavailable.");
      }
      const {
        _creationTime: _proposalCreationTime,
        _id: _proposalSubmilestoneId,
        ...siblingSource
      } = proposalSubmilestone;
      const siblingProposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          ...siblingSource,
          key: "wrong-scope-lineage",
          name: "Wrong Scope lineage",
        }
      );
      const contractId = await ctx.db.insert("submilestoneScopeContracts", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildSubmilestoneId: buildSubmilestone._id,
        createdAt: build.createdAt,
        latestVersion: 1,
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        proposalSubmilestoneId: buildSubmilestone.proposalSubmilestoneId,
        updatedAt: build.updatedAt,
      });
      const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
        authoredByWorkosUserId: "user_admin",
        brokerageId: build.brokerageId,
        createdAt: build.createdAt,
        contractId,
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        proposalSubmilestoneId: siblingProposalSubmilestoneId,
        savedAt: build.updatedAt,
        scopeOfWorkTiptapJson: tiptap("Corrupt Scope lineage."),
        status: "published",
        version: 1,
        publishedAt: build.updatedAt,
        publishedByWorkosUserId: "user_admin",
      });
      await ctx.db.patch(contractId, { effectiveRevisionId: revisionId });
    });

    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(
      composer?.labourSubmilestones.some(
        (submilestone: { _id: Id<"buildSubmilestones"> }) =>
          submilestone._id === fixture.submilestoneId
      )
    ).toBe(false);
    expect(JSON.stringify(composer)).not.toContain("Corrupt Scope lineage.");

    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "corrupt-scope-lineage-publish-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Effective Scope revision is unavailable/);
  });

  test("provisions one brokerage-scoped cold recipient and attaches the complete mode capability", async () => {
    const fixture = await seedQuoteFixture();
    const draft = await fixture.builder.mutation(
      api.quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "combined",
        title: "Cold recipient round",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const first = await fixture.builder.mutation(
      api.quote_invitation_access.ensureQuoteRoundRecipient,
      {
        buildId: fixture.buildId,
        displayName: "Cold Trade and Supply Co.",
        email: " Cold.Recipient@Example.com ",
        quoteRoundId: draft.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const replay = await fixture.builder.mutation(
      api.quote_invitation_access.ensureQuoteRoundRecipient,
      {
        buildId: fixture.buildId,
        email: "cold.recipient@example.com",
        quoteRoundId: draft.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );

    expect(first).toEqual({
      capabilities: ["contractor", "supplier"],
      created: true,
      email: "cold.recipient@example.com",
      name: "Cold Trade and Supply Co.",
      profileId: first.profileId,
      provisioningState: "provisional",
    });
    expect(replay).toEqual({ ...first, created: false });
    const profiles = await fixture.base.run((ctx) =>
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage_normalized_email", (query) =>
          query
            .eq("brokerageId", fixture.brokerageId)
            .eq("normalizedEmail", "cold.recipient@example.com")
        )
        .collect()
    );
    // The direct profile read below deliberately avoids trusting a client-side
    // identity cache; the one canonical profile owns both capabilities.
    const profile = await fixture.base.run((ctx) => ctx.db.get(first.profileId));
    expect(profile).toMatchObject({
      email: "cold.recipient@example.com",
      normalizedEmail: "cold.recipient@example.com",
      onboardingStatus: "profile_only",
      quoteRecipientCapabilities: ["contractor", "supplier"],
      quoteRecipientProvisioningState: "provisional",
      source: "builder_created",
      status: "active",
    });
    expect(profiles).toHaveLength(1);

    const updated = await fixture.builder.mutation(
      api.quote_rounds.updateQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        labourSubmilestoneIds: [fixture.submilestoneId],
        materialRows: [
          {
            assignedSubmilestoneIds: [fixture.submilestoneId],
            rowKey: "cold-recipient-lumber",
            source: "build_cost_item",
            sourceBuildCostItemId: fixture.costItemId,
          },
        ],
        quoteRoundId: draft.quoteRoundId,
        recipientProfileIds: [first.profileId],
        responseDeadline: Date.now() + 86_400_000,
        templateVersionId: fixture.templateVersionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation(api.quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: updated.revision,
        idempotencyKey: "publish-cold-recipient-001",
        quoteRoundId: draft.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ invitationCount: 1, state: "open" });
  });

  test("reuses and canonicalizes an exact legacy recipient email before creating a provisional identity", async () => {
    const fixture = await seedQuoteFixture();
    const draft = await fixture.builder.mutation(
      api.quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Legacy recipient round",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const reused = await fixture.builder.mutation(
      api.quote_invitation_access.ensureQuoteRoundRecipient,
      {
        buildId: fixture.buildId,
        email: " CONTRACTOR-ONLY@EXAMPLE.COM ",
        quoteRoundId: draft.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(reused).toMatchObject({
      created: false,
      profileId: fixture.contractorOnlyRecipientId,
    });
    expect(
      await fixture.base.run((ctx) =>
        ctx.db.get(fixture.contractorOnlyRecipientId)
      )
    ).toMatchObject({ normalizedEmail: "contractor-only@example.com" });
  });

  test("exchanges a reusable private credential into a bounded browser lease without exposing recipient peers", async () => {
    const fixture = await seedQuoteFixture();
    const { credential } = await publishCombinedRound(
      fixture,
      "access-session-exchange-001"
    );
    const magicToken = "a".repeat(64);
    await replaceCredentialMagicToken(fixture, credential._id, magicToken);
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (setting) {
        await ctx.db.patch(setting._id, {
          serviceLifecycle: "restricted_archive",
          status: "disabled",
          updatedAt: now,
        });
        return;
      }
      await ctx.db.insert("buildCollaborationTenantSettings", {
        brokerageId: fixture.brokerageId,
        createdAt: now,
        generousRateLimitMultiplier: 1,
        organizationId: ORGANIZATION_ID,
        serviceLifecycle: "restricted_archive",
        status: "disabled",
        updatedAt: now,
      });
    });

    const first = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    expect(first.status).toBe("available");
    if (first.status !== "available") {
      throw new Error("Expected Quote invitation access.");
    }
    await expect(
      fixture.builder.mutation(api.quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "combined",
        title: "Archived tenant write must fail",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/restricted archive/);
    const replay = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken, sessionToken: first.sessionToken }
    );
    expect(replay).toMatchObject({
      sessionToken: first.sessionToken,
      status: "available",
    });
    if (replay.status !== "available") {
      throw new Error("Expected reusable Quote invitation access.");
    }
    expect(first.access).toMatchObject({
      accessExpiresAt: credential.accessExpiresAt,
      roundState: "open",
    });
    expect(first.access.package).not.toHaveProperty("recipients");
    expect(replay.sessionExpiresAt).toBeLessThanOrEqual(
      replay.access.accessExpiresAt
    );

    const persisted = await fixture.base.run(async (ctx) => ({
      events: await ctx.db
        .query("quoteInvitationAccessEvents")
        .withIndex("by_quoteInvitationAccessCredentialId_and_createdAt", (query) =>
          query.eq("quoteInvitationAccessCredentialId", credential._id)
        )
        .collect(),
      sessions: await ctx.db
        .query("quoteInvitationBrowserSessions")
        .withIndex("by_quoteInvitationAccessCredentialId_and_state", (query) =>
          query
            .eq("quoteInvitationAccessCredentialId", credential._id)
            .eq("state", "active")
        )
        .collect(),
    }));
    expect(persisted.sessions).toHaveLength(1);
    expect(persisted.sessions[0]?.sessionVerifier).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["session_exchanged", "session_reused"])
    );
  });

  test("returns expiry-only access failure and never discloses a revoked invitation", async () => {
    const fixture = await seedQuoteFixture();
    const { credential, invitation } = await publishCombinedRound(
      fixture,
      "access-expiry-and-revocation-001"
    );
    const magicToken = "b".repeat(64);
    const expiresAt = Date.now() - 1;
    await replaceCredentialMagicToken(
      fixture,
      credential._id,
      magicToken,
      expiresAt
    );

    const expired = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    expect(expired).toMatchObject({ expiresAt, status: "expired" });
    expect(Object.keys(expired).sort()).toEqual([
      "expiresAt",
      "issuerName",
      "status",
    ]);

    await fixture.base.run((ctx) =>
      ctx.db.patch(invitation._id, {
        participationState: "revoked",
        updatedAt: Date.now(),
      })
    );
    await expect(
      fixture.base.mutation(api.quote_invitation_access.exchangeQuoteInvitationAccess, {
        magicToken,
      })
    ).resolves.toEqual({ status: "unavailable" });
  });

  test("claims a recipient only for an exact verified WorkOS email and retains invitation-scoped access", async () => {
    const fixture = await seedQuoteFixture();
    const { credential, invitation } = await publishCombinedRound(
      fixture,
      "exact-workos-claim-001"
    );
    const magicToken = "c".repeat(64);
    await replaceCredentialMagicToken(fixture, credential._id, magicToken);
    const exchanged = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    if (exchanged.status !== "available") {
      throw new Error("Expected a live Quote invitation session.");
    }
    await fixture.base.run((ctx) =>
      ctx.db.insert("users", {
        authId: "auth_quote_claimant",
        email: "quote-recipient@example.com",
        emailVerified: true,
        name: "Quote claimant",
        status: "active",
        workosUserId: "user_quote_claimant",
      })
    );
    const claimant = withIdentity(
      fixture.base,
      ["member"],
      "user_quote_claimant",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );
    const claimed = await claimant.mutation(
      api.quote_invitation_access.claimQuoteInvitationProfile,
      { sessionToken: exchanged.sessionToken }
    );
    expect(claimed).toMatchObject({
      invitationId: invitation._id,
      profileId: fixture.recipientId,
      status: "claimed",
    });
    const profile = await fixture.base.run((ctx) =>
      ctx.db.get(fixture.recipientId)
    );
    expect(profile).toMatchObject({
      accountWorkosUserId: "user_quote_claimant",
      onboardingStatus: "account_linked",
      quoteRecipientProvisioningState: "claimed",
    });
    const claimedAccess = await claimant.query(
      api.quote_invitation_access.getClaimedQuoteInvitationAccess,
      { quoteRoundInvitationId: invitation._id }
    );
    expect(claimedAccess).toMatchObject({
      invitationId: invitation._id,
      package: { responseDeadline: expect.any(Number) },
      roundState: "open",
    });
  });

  test("rejects a claim from a deleted WorkOS user projection", async () => {
    const fixture = await seedQuoteFixture();
    const { credential } = await publishCombinedRound(
      fixture,
      "deleted-workos-claim-001"
    );
    const magicToken = "e".repeat(64);
    await replaceCredentialMagicToken(fixture, credential._id, magicToken);
    const exchanged = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    if (exchanged.status !== "available") {
      throw new Error("Expected a live Quote invitation session.");
    }
    await fixture.base.run((ctx) =>
      ctx.db.insert("users", {
        authId: "auth_deleted_quote_claimant",
        deletedAt: Date.now(),
        email: "quote-recipient@example.com",
        emailVerified: true,
        name: "Deleted quote claimant",
        status: "deleted",
        workosUserId: "user_deleted_quote_claimant",
      })
    );
    const claimant = withIdentity(
      fixture.base,
      ["member"],
      "user_deleted_quote_claimant",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );

    await expect(
      claimant.mutation(
        api.quote_invitation_access.claimQuoteInvitationProfile,
        { sessionToken: exchanged.sessionToken }
      )
    ).rejects.toThrow(/verified WorkOS email/);
    const profile = await fixture.base.run((ctx) =>
      ctx.db.get(fixture.recipientId)
    );
    expect(profile?.accountWorkosUserId).toBeUndefined();
  });

  test("refuses an exact-email WorkOS claim when that account already owns another brokerage profile", async () => {
    const fixture = await seedQuoteFixture();
    const { credential } = await publishCombinedRound(
      fixture,
      "conflicting-workos-claim-001"
    );
    const magicToken = "d".repeat(64);
    await replaceCredentialMagicToken(fixture, credential._id, magicToken);
    const exchanged = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    if (exchanged.status !== "available") {
      throw new Error("Expected a live Quote invitation session.");
    }
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("users", {
        authId: "auth_quote_claim_conflict",
        email: "quote-recipient@example.com",
        emailVerified: true,
        name: "Conflicting quote claimant",
        status: "active",
        workosUserId: "user_quote_claim_conflict",
      });
      const now = Date.now();
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Foreign claim-conflict Brokerage",
        legalName: "Foreign claim-conflict Brokerage Ltd.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_quote_claim_conflict_foreign",
      });
      for (let index = 0; index < 21; index += 1) {
        await ctx.db.insert("contractorProfiles", {
          accountWorkosUserId: "user_quote_claim_conflict",
          brokerageId: foreignBrokerageId,
          createdAt: Date.now() + index,
          email: `foreign-${index}@example.com`,
          name: `Foreign linked identity ${index}`,
          normalizedEmail: `foreign-${index}@example.com`,
          organizationId: "org_quote_claim_conflict_foreign",
          status: "active",
          trades: [],
          updatedAt: Date.now() + index,
        });
      }
      await ctx.db.insert("contractorProfiles", {
        accountWorkosUserId: "user_quote_claim_conflict",
        brokerageId: fixture.brokerageId,
        createdAt: Date.now(),
        email: "already-linked@example.com",
        name: "Already linked identity",
        normalizedEmail: "already-linked@example.com",
        organizationId: ORGANIZATION_ID,
        status: "active",
        trades: [],
        updatedAt: Date.now(),
      });
    });
    const claimant = withIdentity(
      fixture.base,
      ["member"],
      "user_quote_claim_conflict",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );
    await expect(
      claimant.mutation(api.quote_invitation_access.claimQuoteInvitationProfile, {
        sessionToken: exchanged.sessionToken,
      })
    ).rejects.toThrow(/already linked to another Quote recipient/);
    const profile = await fixture.base.run((ctx) =>
      ctx.db.get(fixture.recipientId)
    );
    expect(profile?.accountWorkosUserId).toBeUndefined();
  });

  test("publishes Labour and Material independently and enforces canonical source and recipient capability", async () => {
    const fixture = await seedQuoteFixture();
    const labour = await configureRound(fixture, "labour");
    const labourPublished = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-labour-001",
        quoteRoundId: labour.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const material = await configureRound(fixture, "material");
    const materialPublished = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-material-001",
        quoteRoundId: material.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const [labourRead, materialRead] = await Promise.all([
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: labourPublished.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }),
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: materialPublished.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }),
    ]);
    expect(labourRead.packageRevision.labourLines).toHaveLength(1);
    expect(labourRead.packageRevision.materialLines).toHaveLength(0);
    expect(materialRead.packageRevision.labourLines).toHaveLength(0);
    expect(materialRead.packageRevision.materialLines).toHaveLength(1);

    const invalid = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Invalid source round",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          {
            assignedSubmilestoneIds: [fixture.submilestoneId],
            rowKey: "forged-canonical",
            source: "build_cost_item",
            sourceBuildCostItemId: fixture.costItemId,
            title: "Client override is forbidden",
          },
        ],
        quoteRoundId: invalid.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/server-derived/);
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        quoteRoundId: invalid.quoteRoundId,
        recipientProfileIds: [fixture.contractorOnlyRecipientId],
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/required capability/);
  });

  test("caps aggregate Material assignments at a publication-safe boundary", async () => {
    const fixture = await seedQuoteFixture();
    const assignmentIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const extraIds: Id<"buildSubmilestones">[] = [];
      for (let index = 1; index < 100; index += 1) {
        extraIds.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `assignment-${index}`,
            name: `Assignment Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      return [fixture.submilestoneId, ...extraIds];
    });
    const materialRows = Array.from({ length: 30 }, (_, index) => ({
      assignedSubmilestoneIds: assignmentIds,
      rowKey: `bounded-${index}`,
      source: "build_cost_item" as const,
      sourceBuildCostItemId: fixture.costItemId,
    }));
    const accepted = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Bounded Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows,
        quoteRoundId: accepted.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ revision: 1, state: "draft" });
    await fixture.builder.mutation(
      (api as any).quote_rounds.updateQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        quoteRoundId: accepted.quoteRoundId,
        recipientProfileIds: [fixture.recipientId],
        responseDeadline: Date.now() + 86_400_000,
        templateVersionId: fixture.templateVersionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).quote_rounds.publishQuoteRoundDraft,
        {
        buildId: fixture.buildId,
        expectedRevision: 2,
        idempotencyKey: "publish-max-material-assignments",
        quoteRoundId: accepted.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({
      packageRevisionNumber: 1,
      state: "open",
    });

    const rejected = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Over-limit Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          ...materialRows,
          {
            assignedSubmilestoneIds: [assignmentIds[0]],
            rowKey: "over-limit",
            source: "build_cost_item",
            sourceBuildCostItemId: fixture.costItemId,
          },
        ],
        quoteRoundId: rejected.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/at most 3,000 Material Sub-milestone assignments/);

    const distinctAssignmentIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const ids = [...assignmentIds];
      for (let index = 100; index <= 500; index += 1) {
        ids.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `distinct-assignment-${index}`,
            name: `Distinct Assignment Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      return ids;
    });
    const highCardinality = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "High-cardinality Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: Array.from({ length: 6 }, (_, index) => ({
          assignedSubmilestoneIds: distinctAssignmentIds.slice(
            index * 100,
            Math.min((index + 1) * 100, distinctAssignmentIds.length)
          ),
          rowKey: `distinct-${index}`,
          source: "build_cost_item" as const,
          sourceBuildCostItemId: fixture.costItemId,
        })),
        quoteRoundId: highCardinality.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/at most 500 distinct Material Sub-milestones/);
  });

  test("rejects negative ad-hoc delivery days before replacing a draft", async () => {
    const fixture = await seedQuoteFixture();
    const created = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Negative delivery days",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          {
            assignedSubmilestoneIds: [fixture.submilestoneId],
            deliveryEndDay: 2,
            deliveryInstructions: "Keep clear of the lane.",
            deliveryLocation: "North staging area",
            deliveryStartDay: -1,
            quantity: 1,
            rowKey: "negative-delivery-day",
            source: "ad_hoc",
            specificationTiptapJson: tiptap("Temporary weather protection."),
            title: "Weather protection",
            unit: "bundle",
          },
        ],
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Delivery start day must be on or after T0/);
  });

  test("bounds inherited link discovery across every scoped Sub-milestone", async () => {
    const fixture = await seedQuoteFixture();
    const scopedIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const ids = [fixture.submilestoneId];
      for (let index = 1; index < 6; index += 1) {
        ids.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `link-scan-${index}`,
            name: `Link scan Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("buildSubmilestoneDocumentLinks", {
          brokerageId: original.brokerageId,
          buildDocumentId: fixture.supporting.documentId,
          buildId: fixture.buildId,
          buildSubmilestoneId: ids[index % ids.length]!,
          createdAt: source.createdAt + index,
          createdByWorkosUserId: "user_admin",
          organizationId: ORGANIZATION_ID,
          updatedAt: source.updatedAt + index,
          visibility: "internal",
        });
      }
      return ids;
    });
    const round = await configureRound(fixture, "material", {
      materialRows: [
        {
          assignedSubmilestoneIds: scopedIds,
          rowKey: "bounded-link-scan",
          source: "build_cost_item",
          sourceBuildCostItemId: fixture.costItemId,
        },
      ],
    });
    await expect(
      fixture.builder.mutation(
        (api as any).quote_rounds.publishQuoteRoundDraft,
        {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "bounded-inherited-link-scan",
        quoteRoundId: round.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/linked-document discovery exceeded its safe scan limit/);
  });

  test("freezes attachment metadata to its clean governed asset", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.permit.documentId, {
        fileName: "forged-permit-name.pdf",
      });
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "reject-mismatched-permit-metadata-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/metadata does not match its clean governed Build asset/);
  });

  test("resolves the current Permit newest-first across 26-plus historical rows", async () => {
    const fixture = await seedQuoteFixture();
    const currentPermit = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.permit.documentId);
      if (!original) {
        throw new Error("Fixture Permit is unavailable.");
      }
      let newestPermitId = fixture.permit.documentId;
      for (let index = 1; index <= 26; index += 1) {
        const fileName = `permit-history-${index}.pdf`;
        const storageId = await ctx.storage.store(
          new Blob([fileName], { type: "application/pdf" })
        );
        const assetId = await ctx.db.insert("buildCollaborationAssets", {
          brokerageId: original.brokerageId,
          buildId: original.buildId,
          contentHashSha256: `${index}`.padStart(64, "0"),
          createdAt: original.createdAt + index,
          fileName,
          maximumAudienceMode: "build_wide",
          mimeType: "application/pdf",
          organizationId: original.organizationId,
          scanCompletedAt: original.createdAt + index,
          scanState: "clean",
          sizeBytes: fileName.length,
          state: "available",
          storageId,
          updatedAt: original.updatedAt + index,
          uploadedByWorkosUserId: original.uploadedByWorkosUserId,
          version: index + 1,
        });
        newestPermitId = await ctx.db.insert("buildDocuments", {
          brokerageId: original.brokerageId,
          buildId: original.buildId,
          createdAt: original.createdAt + index,
          documentType: "permit",
          fileName,
          governedAssetId: assetId,
          mimeType: "application/pdf",
          organizationId: original.organizationId,
          proposalId: original.proposalId,
          sizeBytes: fileName.length,
          status: index === 26 ? "uploaded" : "superseded",
          storageId,
          updatedAt: original.updatedAt + index,
          uploadedByWorkosUserId: original.uploadedByWorkosUserId,
          version: index + 1,
        });
      }
      return newestPermitId;
    });
    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer.permit).toMatchObject({
      _id: currentPermit,
      fileName: "permit-history-26.pdf",
      version: 27,
    });
    const created = await configureRound(fixture, "labour");
    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "newest-permit-26-history-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const packageRevision = await fixture.base.run(async (ctx) => {
      const packageRevisionId = ctx.db.normalizeId(
        "quotePackageRevisions",
        published.packageRevisionId
      );
      return packageRevisionId ? await ctx.db.get(packageRevisionId) : null;
    });
    expect(packageRevision?.permitDocumentId).toBe(currentPermit);
  });

  test("treats malformed route IDs as an unavailable Quote Round", async () => {
    const fixture = await seedQuoteFixture();
    await expect(
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: "not-a-convex-id",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      fixture.builder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: "not-a-convex-id",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
  });

  test("blocks unclassified documents before any publish writes and excludes non-authoring callers", async () => {
    const fixture = await seedQuoteFixture("unclassified");
    const broker = withIdentity(fixture.base, ["broker"], "user_broker");
    await expect(
      broker.mutation((api as any).quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Broker must not author",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Builder, Builder Staff, Admin, or Principle Broker/);
    const inaccessibleBuilder = withIdentity(fixture.base, ["builder"], "unassigned_builder");
    await expect(
      inaccessibleBuilder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/active build participation/);
    const otherTenantBuilder = withIdentity(
      fixture.base,
      ["builder"],
      "other_tenant_builder",
      "org_other_quote_rounds"
    );
    await expect(
      otherTenantBuilder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/WorkOS membership|organization scope/);
    const created = await configureRound(fixture, "labour");
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-unclassified-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/classified/);
    const quoteRoundId = created.quoteRoundId as Id<"quoteRounds">;
    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const packages = await ctx.db.query("quotePackageRevisions").collect();
      const invitations = await ctx.db.query("quoteRoundInvitations").collect();
      return { invitations, packages, round };
    });
    expect(persisted.round).toMatchObject({ state: "draft" });
    expect(persisted.round?.currentPackageRevisionId).toBeUndefined();
    expect(persisted.packages).toHaveLength(0);
    expect(persisted.invitations).toHaveLength(0);

    const noRecipient = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "labour",
        title: "No recipient",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
      buildId: fixture.buildId,
      expectedRevision: 0,
      labourSubmilestoneIds: [fixture.submilestoneId],
      quoteRoundId: noRecipient.quoteRoundId,
      responseDeadline: Date.now() + 86_400_000,
      templateVersionId: fixture.templateVersionId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-no-recipient-001",
        quoteRoundId: noRecipient.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/At least one compatible Quote recipient/);

    const expiredDeadline = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Expired deadline",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
      buildId: fixture.buildId,
      expectedRevision: 0,
      labourSubmilestoneIds: [fixture.submilestoneId],
      quoteRoundId: expiredDeadline.quoteRoundId,
      recipientProfileIds: [fixture.recipientId],
      responseDeadline: Date.now() - 1,
      templateVersionId: fixture.templateVersionId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-expired-deadline-001",
        quoteRoundId: expiredDeadline.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/must be in the future/);
  });
});

describe("Quote Round immutable response comparison and Preferred Quote", () => {
  const compare = async (
    fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
    quoteRoundId: Id<"quoteRounds">,
    viewer = fixture.builder,
    organizationId = ORGANIZATION_ID,
    readerKind?: "backoffice" | "builder" | "homeowner"
  ) =>
    await viewer.query((api as any).quote_comparisons.getQuoteRoundComparison, {
      buildId: fixture.buildId,
      now: Date.now(),
      quoteRoundId,
      ...(readerKind ? { readerKind } : {}),
      workosOrganizationId: organizationId,
    });

  const setPreferred = async (
    fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
    quoteRoundId: Id<"quoteRounds">,
    submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">,
    expectedStateVersion = 0
  ) =>
    await fixture.builder.mutation(
      (api as any).quote_comparisons.setPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        expectedStateVersion,
        quoteRoundId,
        reason: "Best commercial fit after normalized review.",
        submissionRevisionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );

  async function preferredFixture(tokenSuffix: string) {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const candidate = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        labourCents: 90_000_00,
        materialCents: 40_000_00,
        tokenSuffix,
      }
    );
    await setPreferred(
      fixture,
      published.quoteRoundId,
      candidate.submissionRevisionId
    );
    return { candidate, fixture, invitation: published.invitations[0]!, published };
  }

  test("renders an empty immutable comparison without projecting Draft content", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const access = await fixture.base.run(async (ctx) => {
      const credential = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", published.invitations[0]!._id)
            .eq("state", "active")
        )
        .first();
      if (!credential) {
        throw new Error("Expected an invitation credential.");
      }
      return credential;
    });
    await replaceCredentialMagicToken(fixture, access._id, "comparison-draft-only");
    const exchanged = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "comparison-draft-only" }
    );
    if (exchanged.status !== "available") {
      throw new Error("Expected invitation access.");
    }
    await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: { commentsHtml: "<p>Private recipient Draft wording.</p>" },
        quoteRoundInvitationId: published.invitations[0]!._id,
        sessionToken: exchanged.sessionToken,
      }
    );

    const result = await compare(fixture, published.quoteRoundId);
    expect(result).toMatchObject({
      candidates: [],
      canClearPreferred: false,
      preferred: null,
      stateVersion: 0,
      status: "available",
    });
    expect(JSON.stringify(result)).not.toContain("Private recipient Draft wording");
  });

  test("rejects a same-round sibling Package Revision outside the current ancestry chain", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const siblingPackageRevisionId = await fixture.base.run(async (ctx) => {
      const root = await ctx.db.get(published.invitations[0]!.quotePackageRevisionId);
      if (!root) {
        throw new Error("Expected the current Quote Package Revision.");
      }
      const { _creationTime: _ignoredCreationTime, _id: _ignoredId, ...snapshot } =
        root;
      return await ctx.db.insert("quotePackageRevisions", {
        ...snapshot,
        revision: root.revision + 1,
      });
    });

    const result = await fixture.builder.query(
      (api as any).quote_comparisons.getQuoteRoundComparison,
      {
        buildId: fixture.buildId,
        now: Date.now(),
        packageRevisionId: siblingPackageRevisionId,
        quoteRoundId: published.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(result).toEqual({
      reason: "Selected Quote Package Revision is unavailable.",
      status: "unavailable",
    });
  });

  test("normalizes one immutable mixed response while preserving package, provenance, schedule, comments, attachment, tax, alternate, and exclusion facts", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    await fixture.base.run(async (ctx) => {
      const field = await ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_fieldKey", (query) =>
          query
            .eq(
              "quotePackageRevisionId",
              published.invitations[0]!.quotePackageRevisionId
            )
            .eq("fieldKey", "approach")
        )
        .unique();
      if (!field) {
        throw new Error("Expected immutable Package response facts.");
      }
      await ctx.db.patch(field._id, {
        allowAlternates: true,
        allowExclusions: true,
        supportsTax: true,
        tax: { label: "HST", rateBps: 1300 },
      });
    });
    const submitted = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        attachment: true,
        commentsHtml: "<p>Pricing valid for thirty days.</p>",
        labourCents: 80_000_00,
        materialCents: 45_000_00,
        tokenSuffix: "single",
      }
    );

    const result = await compare(fixture, published.quoteRoundId);
    expect(result).toMatchObject({
      candidates: [
        {
          attachments: [
            {
              fileName: "comparison-single.pdf",
              mimeType: "application/pdf",
            },
          ],
          commentsHtml: "<p>Pricing valid for thirty days.</p>",
          invitation: { _id: published.invitations[0]!._id },
          labourLines: [
            {
              quotedAmountCents: 80_000_00,
              source: "package_labour",
            },
          ],
          materialLines: [
            {
              quotedAmountCents: 45_000_00,
              source: "package_material",
            },
          ],
          answers: [
            { fieldKey: "approach", value: expect.stringContaining("5 days") },
          ],
          submission: {
            _id: submitted.submissionRevisionId,
            canonicalTotalCents: 125_250_00,
            revision: 1,
          },
          totals: {
            canonicalTotalCents: 125_250_00,
            expandedScopeCents: 250_00,
            labourCents: 80_000_00,
            materialsCents: 45_000_00,
          },
        },
      ],
      package: {
        attachments: expect.arrayContaining([
          expect.objectContaining({ fileNameSnapshot: "permit.pdf" }),
          expect.objectContaining({ fileNameSnapshot: "framing-plan.pdf" }),
        ]),
        responseFields: expect.arrayContaining([
          expect.objectContaining({
            allowAlternates: true,
            allowExclusions: true,
            fieldKey: "approach",
            supportsTax: true,
            tax: { label: "HST", rateBps: 1300 },
          }),
        ]),
        revision: 1,
      },
      status: "available",
    });
    expect(result.candidates[0].expandedScopeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quotedAmountCents: 250_00,
          source: "expanded_scope",
          title: "Alternate single",
        }),
        expect.objectContaining({
          source: "expanded_scope",
          title: "Exclusion single",
        }),
      ])
    );
    expect(result.candidates[0].totals.canonicalTotalCents).toBe(
      result.candidates[0].labourLines.reduce(
        (total: number, row: { quotedAmountCents?: number }) =>
          total + (row.quotedAmountCents ?? 0),
        0
      ) +
        result.candidates[0].materialLines.reduce(
          (total: number, row: { quotedAmountCents?: number }) =>
            total + (row.quotedAmountCents ?? 0),
          0
        ) +
        result.candidates[0].expandedScopeLines.reduce(
          (total: number, row: { quotedAmountCents?: number }) =>
            total + (row.quotedAmountCents ?? 0),
          0
        )
    );
  });

  test("compares multiple current submissions only and never leaks another Build or recipient route", async () => {
    const fixture = await seedQuoteFixture();
    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.contractorOnlyRecipientId, {
        quoteRecipientCapabilities: ["contractor", "supplier"],
        updatedAt: Date.now(),
      })
    );
    const published = await publishComparisonRound(fixture, [
      fixture.recipientId,
      fixture.contractorOnlyRecipientId,
    ]);
    const first = await submitComparisonCandidate(fixture, published.invitations[0]!, {
      labourCents: 90_000_00,
      materialCents: 40_000_00,
      tokenSuffix: "multi-a",
    });
    const second = await submitComparisonCandidate(fixture, published.invitations[1]!, {
      labourCents: 84_000_00,
      materialCents: 44_000_00,
      tokenSuffix: "multi-b",
    });
    const result = await compare(fixture, published.quoteRoundId);
    expect(result.candidates).toHaveLength(2);
    expect(
      new Set(
        result.candidates.map((candidate: { submission: { _id: string } }) =>
          candidate.submission._id
        )
      )
    ).toEqual(new Set([first.submissionRevisionId, second.submissionRevisionId]));

    const wrongBuildId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected comparison Build.");
      }
      const { _creationTime: _ignoredCreationTime, _id: _ignoredId, ...copy } =
        build;
      return await ctx.db.insert("activeBuilds", {
        ...copy,
        buildName: "Wrong comparison Build",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.builder.query((api as any).quote_comparisons.getQuoteRoundComparison, {
        buildId: wrongBuildId,
        now: Date.now(),
        quoteRoundId: published.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/unavailable|Build|Quote Round/i);

    const foreignOrganizationBuilder = withIdentity(
      fixture.base,
      ["builder"],
      "user_builder",
      "org_foreign_comparison"
    );
    await expect(
      compare(
        fixture,
        published.quoteRoundId,
        foreignOrganizationBuilder,
        "org_foreign_comparison"
      )
    ).rejects.toThrow(/organization|brokerage|access|unavailable/i);
  });

  test("admits authorized Builder and Builder Staff reads while excluding recipient access, superseded revisions, and withdrawn submissions", async () => {
    const fixture = await seedQuoteFixture();
    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.contractorOnlyRecipientId, {
        quoteRecipientCapabilities: ["contractor", "supplier"],
        updatedAt: Date.now(),
      })
    );
    const published = await publishComparisonRound(fixture, [
      fixture.recipientId,
      fixture.contractorOnlyRecipientId,
    ]);
    const current = await submitComparisonCandidate(fixture, published.invitations[0]!, {
      labourCents: 81_000_00,
      materialCents: 42_000_00,
      tokenSuffix: "role-current",
    });
    const withdrawn = await submitComparisonCandidate(
      fixture,
      published.invitations[1]!,
      {
        labourCents: 83_000_00,
        materialCents: 43_000_00,
        tokenSuffix: "role-withdrawn",
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: published.invitations[0]!._id,
        sessionToken: current.exchanged.sessionToken,
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "comparison-role-resubmit",
        quoteRoundInvitationId: published.invitations[0]!._id,
        sessionToken: current.exchanged.sessionToken,
      }
    );
    await fixture.base.mutation(
      (api as any).quote_response_submissions.withdrawQuoteInvitationResponse,
      {
        confirmed: true,
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: published.invitations[1]!._id,
        sessionToken: withdrawn.exchanged.sessionToken,
      }
    );

    const builderResult = await compare(fixture, published.quoteRoundId);
    expect(builderResult.candidates).toHaveLength(1);
    expect(builderResult.candidates[0]).toMatchObject({
      history: [
        { revision: 2, status: "active" },
        { revision: 1, status: "superseded", supersededByRevision: 2 },
      ],
      submission: { revision: 2 },
    });
    expect(JSON.stringify(builderResult)).not.toContain(
      String(current.submissionRevisionId)
    );
    expect(JSON.stringify(builderResult)).not.toContain(
      String(withdrawn.submissionRevisionId)
    );

    const builderStaff = withIdentity(
      fixture.base,
      ["builder-staff"],
      "user_builder"
    );
    expect(await compare(fixture, published.quoteRoundId, builderStaff)).toEqual(
      builderResult
    );
    const recipient = withIdentity(
      fixture.base,
      ["member"],
      "comparison-recipient",
      ORGANIZATION_ID,
      "quote-recipient@example.com"
    );
    await expect(
      compare(fixture, published.quoteRoundId, recipient)
    ).rejects.toThrow(/Builder|Staff|participation|access/i);

    await expect(
      setPreferred(
        fixture,
        published.quoteRoundId,
        withdrawn.submissionRevisionId
      )
    ).rejects.toThrow(/current|withdrawn|eligible|active/i);
    await expect(
      setPreferred(
        fixture,
        published.quoteRoundId,
        current.submissionRevisionId
      )
    ).rejects.toThrow(/current|superseded|eligible|active/i);
  });

  test("admits an assigned Homeowner and redacts recipient email, storage handles, and Preferred actor identity", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const submitted = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        attachment: true,
        commentsHtml: "<p>Visible submitted response.</p>",
        labourCents: 80_000_00,
        materialCents: 45_000_00,
        tokenSuffix: "homeowner-read",
      }
    );
    await setPreferred(
      fixture,
      published.quoteRoundId,
      submitted.submissionRevisionId
    );
    const storedResponseAttachmentId = await fixture.base.run(async (ctx) =>
      (
        await ctx.db
          .query("quoteInvitationResponseSubmissionAttachments")
          .withIndex(
            "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
            (query) =>
              query.eq(
                "quoteInvitationResponseSubmissionRevisionId",
                submitted.submissionRevisionId
              )
          )
          .first()
      )?.storageId
    );
    const homeownerParticipant = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        displayNameSnapshot: "Homeowner Viewer",
        emailSnapshot: "homeowner@example.com",
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "homeowner",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_homeowner",
      });
    });
    const homeowner = withIdentity(
      fixture.base,
      ["member"],
      "user_homeowner",
      ORGANIZATION_ID,
      "homeowner@example.com"
    );
    const homeownerResult = await compare(
      fixture,
      published.quoteRoundId,
      homeowner,
      ORGANIZATION_ID,
      "homeowner"
    );
    expect(homeownerResult).toMatchObject({
      preferred: { selectedByWorkosUserId: "redacted" },
      status: "available",
    });
    expect(
      homeownerResult.candidates[0]?.invitation.recipientEmailSnapshot
    ).toBe("Recipient email redacted");
    expect(
      homeownerResult.invitations[0]?.recipientEmailSnapshot
    ).toBe("Recipient email redacted");
    expect(JSON.stringify(homeownerResult)).not.toContain(
      "quote-recipient@example.com"
    );
    expect(JSON.stringify(homeownerResult)).not.toContain(
      String(storedResponseAttachmentId)
    );

    const builderResult = await compare(fixture, published.quoteRoundId);
    expect(
      builderResult.candidates[0]?.invitation.recipientEmailSnapshot
    ).toBe("quote-recipient@example.com");
    expect(JSON.stringify(builderResult)).toContain(
      String(storedResponseAttachmentId)
    );

    const backoffice = withIdentity(
      fixture.base,
      ["admin", "builder"],
      "user_builder",
      ORGANIZATION_ID,
      "builder@example.com"
    );
    const backofficeResult = await compare(
      fixture,
      published.quoteRoundId,
      backoffice,
      ORGANIZATION_ID,
      "backoffice"
    );
    expect(backofficeResult).toMatchObject({
      canClearPreferred: true,
      canSetPreferred: true,
      preferred: { selectedByWorkosUserId: "user_builder" },
      status: "available",
    });
    expect(JSON.stringify(backofficeResult)).toContain(
      "quote-recipient@example.com"
    );
    expect(JSON.stringify(backofficeResult)).toContain(
      String(storedResponseAttachmentId)
    );

    await fixture.base.run((ctx) =>
      ctx.db.patch(homeownerParticipant, {
        removedAt: Date.now(),
        status: "removed",
        updatedAt: Date.now(),
      })
    );
    await expect(
      compare(fixture, published.quoteRoundId, homeowner)
    ).rejects.toThrow(/participation revoked|participation|access/i);
  });

  test("sets and reversibly clears exactly one Preferred pointer in Open and Closed rounds with optimistic concurrency and audit only", async () => {
    const fixture = await seedQuoteFixture();
    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.contractorOnlyRecipientId, {
        quoteRecipientCapabilities: ["contractor", "supplier"],
        updatedAt: Date.now(),
      })
    );
    const published = await publishComparisonRound(fixture, [
      fixture.recipientId,
      fixture.contractorOnlyRecipientId,
    ]);
    const first = await submitComparisonCandidate(fixture, published.invitations[0]!, {
      labourCents: 90_000_00,
      materialCents: 40_000_00,
      tokenSuffix: "preferred-a",
    });
    const second = await submitComparisonCandidate(fixture, published.invitations[1]!, {
      labourCents: 84_000_00,
      materialCents: 44_000_00,
      tokenSuffix: "preferred-b",
    });
    const beforeSideEffects = await comparisonSideEffectCounts(fixture);

    const selected = await setPreferred(
      fixture,
      published.quoteRoundId,
      first.submissionRevisionId
    );
    expect(selected).toMatchObject({
      idempotentReplay: false,
      preferred: { submissionRevisionId: first.submissionRevisionId },
      stateVersion: 1,
      status: "selected",
    });
    const replay = await setPreferred(
      fixture,
      published.quoteRoundId,
      first.submissionRevisionId,
      1
    );
    expect(replay).toMatchObject({
      idempotentReplay: true,
      preferred: { submissionRevisionId: first.submissionRevisionId },
      stateVersion: 1,
      status: "selected",
    });
    const conflict = await setPreferred(
      fixture,
      published.quoteRoundId,
      second.submissionRevisionId,
      0
    );
    expect(conflict).toMatchObject({
      idempotentReplay: false,
      preferred: { submissionRevisionId: first.submissionRevisionId },
      stateVersion: 1,
      status: "conflict",
    });
    const pointerRows = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteRoundPreferredSubmissionStates")
        .withIndex("by_quoteRoundId", (query) =>
          query.eq("quoteRoundId", published.quoteRoundId)
        )
        .take(2)
    );
    expect(pointerRows).toHaveLength(1);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(published.quoteRoundId, {
        state: "closed",
        updatedAt: Date.now(),
      });
    });
    const changed = await setPreferred(
      fixture,
      published.quoteRoundId,
      second.submissionRevisionId,
      1
    );
    expect(changed).toMatchObject({
      preferred: { submissionRevisionId: second.submissionRevisionId },
      stateVersion: 2,
      status: "selected",
    });
    const cleared = await fixture.builder.mutation(
      (api as any).quote_comparisons.clearPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedStateVersion: 2,
        quoteRoundId: published.quoteRoundId,
        reason: "Commercial review reopened.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(cleared).toMatchObject({
      preferred: null,
      stateVersion: 3,
      status: "cleared",
    });
    const afterSideEffects = await comparisonSideEffectCounts(fixture);
    expect(afterSideEffects).toEqual(beforeSideEffects);
    const audits = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRound")
            .eq("entityId", String(published.quoteRoundId))
        )
        .collect()
    );
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "quote_round.preferred_quote_set",
        "quote_round.preferred_quote_cleared",
      ])
    );
  });

  test("keeps a stale Preferred pointer recoverable without projecting an ineligible target", async () => {
    const { candidate, fixture, invitation, published } =
      await preferredFixture("stale-recovery");
    await fixture.base.run((ctx) =>
      ctx.db.patch(invitation._id, {
        participationState: "revoked",
        revokedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const comparison = await compare(fixture, published.quoteRoundId);
    expect(comparison).toMatchObject({
      canClearPreferred: true,
      preferred: null,
      stateVersion: 1,
      status: "available",
    });
    const conflict = await setPreferred(
      fixture,
      published.quoteRoundId,
      candidate.submissionRevisionId,
      0
    );
    expect(conflict).toMatchObject({
      preferred: null,
      stateVersion: 1,
      status: "conflict",
    });
    const cleared = await fixture.builder.mutation(
      (api as any).quote_comparisons.clearPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedStateVersion: 1,
        quoteRoundId: published.quoteRoundId,
        reason: "Clear a stale Preferred Quote pointer after reconciliation.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(cleared).toMatchObject({
      preferred: null,
      stateVersion: 2,
      status: "cleared",
    });
  });

  test("clears Preferred instead of migrating it on resubmit, withdrawal, revocation, recipient replacement, Package supersession, and cancellation", async () => {
    const cases = [
      "resubmit",
      "withdraw",
      "revoke",
      "replace",
      "supersede_package",
      "cancel",
    ] as const;

    for (const lifecycleCase of cases) {
      const { candidate, fixture, invitation, published } =
        await preferredFixture(`clear-${lifecycleCase}`);

      switch (lifecycleCase) {
        case "resubmit": {
          const started = await fixture.base.mutation(
            (api as any).quote_response_submissions
              .startQuoteInvitationResponseRevision,
            {
              expectedSubmissionRevision: 1,
              quoteRoundInvitationId: invitation._id,
              sessionToken: candidate.exchanged.sessionToken,
            }
          );
          expect(started).toMatchObject({
            draft: { version: 1 },
            status: "draft_ready",
          });
          await fixture.base.mutation(
            (api as any).quote_response_submissions
              .submitQuoteInvitationResponse,
            {
              expectedDraftVersion: 1,
              idempotencyKey: "comparison-preferred-resubmit",
              quoteRoundInvitationId: invitation._id,
              sessionToken: candidate.exchanged.sessionToken,
            }
          );
          break;
        }
        case "withdraw":
          await fixture.base.mutation(
            (api as any).quote_response_submissions
              .withdrawQuoteInvitationResponse,
            {
              confirmed: true,
              expectedSubmissionRevision: 1,
              explanation: "Withdraw the previously Preferred commercial response.",
              quoteRoundInvitationId: invitation._id,
              sessionToken: candidate.exchanged.sessionToken,
            }
          );
          break;
        case "revoke":
          await fixture.builder.mutation(
            (api as any).quote_round_lifecycle.revokeQuoteRoundInvitation,
            {
              buildId: fixture.buildId,
              confirmed: true,
              quoteRoundInvitationId: invitation._id,
              reason: "Recipient is no longer eligible for this solicitation.",
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          break;
        case "replace":
          await fixture.builder.mutation(
            (api as any).quote_round_lifecycle.replaceQuoteRoundInvitationEmail,
            {
              buildId: fixture.buildId,
              confirmed: true,
              correctedEmail: "preferred.replacement@example.com",
              quoteRoundInvitationId: invitation._id,
              reason: "Correct the recipient identity without transferring history.",
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          break;
        case "supersede_package": {
          const round = await fixture.builder.query(
            (api as any).quote_rounds.getQuoteRound,
            {
              buildId: fixture.buildId,
              quoteRoundId: published.quoteRoundId,
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          const closed = await fixture.builder.mutation(
            (api as any).quote_round_lifecycle.closeQuoteRound,
            {
              buildId: fixture.buildId,
              confirmed: true,
              expectedRevision: round.revision,
              quoteRoundId: published.quoteRoundId,
              reason: "Close before publishing a superseding Package Revision.",
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          await fixture.builder.mutation(
            (api as any).quote_round_lifecycle.reopenQuoteRoundWithRevision,
            {
              buildId: fixture.buildId,
              changedFieldKeys: ["responseDeadline"],
              confirmed: true,
              expectedRevision: closed.revision,
              quoteRoundId: published.quoteRoundId,
              reason: "Publish the superseding Package Revision.",
              deadlinePolicy: {
                kind: "replace",
                responseDeadline: Date.now() + 2 * 24 * 60 * 60 * 1000,
              },
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          break;
        }
        case "cancel": {
          const round = await fixture.builder.query(
            (api as any).quote_rounds.getQuoteRound,
            {
              buildId: fixture.buildId,
              quoteRoundId: published.quoteRoundId,
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          await fixture.builder.mutation(
            (api as any).quote_round_lifecycle.cancelQuoteRound,
            {
              buildId: fixture.buildId,
              confirmed: true,
              expectedRevision: round.revision,
              quoteRoundId: published.quoteRoundId,
              reason: "Cancel the solicitation and clear commercial tracking.",
              workosOrganizationId: ORGANIZATION_ID,
            }
          );
          break;
        }
      }

      const after = await compare(fixture, published.quoteRoundId);
      if (lifecycleCase === "cancel") {
        expect(after, lifecycleCase).toMatchObject({ status: "unavailable" });
      } else {
        expect(after.preferred, lifecycleCase).toBeNull();
      }
      const state = await fixture.base.run(async (ctx) =>
        await ctx.db
          .query("quoteRoundPreferredSubmissionStates")
          .withIndex("by_quoteRoundId", (query) =>
            query.eq("quoteRoundId", published.quoteRoundId)
          )
          .unique()
      );
      expect(state, lifecycleCase).toMatchObject({ stateVersion: 2 });
      expect(
        state?.quoteInvitationResponseSubmissionRevisionId,
        lifecycleCase
      ).toBeUndefined();
      const audits = await fixture.base.run(async (ctx) =>
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "quoteRound")
              .eq("entityId", String(published.quoteRoundId))
          )
          .collect()
      );
      expect(
        audits.some(
          (audit) =>
            audit.eventType === "quote_round.preferred_quote_cleared" &&
            Boolean(audit.reason?.trim())
        ),
        lifecycleCase
      ).toBe(true);
    }
  });
});

async function comparisonSideEffectCounts(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>
) {
  return await fixture.base.run(async (ctx) => ({
    activeBuildBudgetRevisionRequests: (
      await ctx.db.query("activeBuildBudgetRevisionRequests").collect()
    ).length,
    activeBuildDrawRequests: (
      await ctx.db.query("activeBuildDrawRequests").collect()
    ).length,
    buildContractorAssignments: (
      await ctx.db.query("buildContractorAssignments").collect()
    ).length,
    communicationIntents: (
      await ctx.db.query("communicationIntents").collect()
    ).length,
    costDocuments: (await ctx.db.query("costDocuments").collect()).length,
    eventOutbox: (await ctx.db.query("eventOutbox").collect()).length,
    milestoneContractorAssignments: (
      await ctx.db.query("milestoneContractorAssignments").collect()
    ).length,
    noticeIntents: (
      await ctx.db.query("quoteRoundRecipientNoticeIntents").collect()
    ).length,
    plannedDrawScheduleRows: (
      await ctx.db.query("plannedDrawScheduleRows").collect()
    ).length,
  }));
}

describe("Quote Round governed lifecycle", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function closeOpenRound(
    fixture: Awaited<ReturnType<typeof openedSubmissionFixture>>,
    reason = "Close this Quote Round for lifecycle coverage."
  ) {
    const round = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: fixture.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    return await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.closeQuoteRound,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedRevision: round.revision,
        quoteRoundId: fixture.invitation.quoteRoundId,
        reason,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
  }

  async function reopenClosedRound(
    fixture: Awaited<ReturnType<typeof openedSubmissionFixture>>,
    expectedRevision: number,
    changedFieldKeys: string[] = ["responseDeadline"]
  ) {
    return await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.reopenQuoteRoundWithRevision,
      {
        buildId: fixture.buildId,
        changedFieldKeys,
        confirmed: true,
        expectedRevision,
        quoteRoundId: fixture.invitation.quoteRoundId,
        reason: "Reopen this Quote Round for lifecycle coverage.",
        deadlinePolicy: {
          kind: "replace",
          responseDeadline: Date.now() + 2 * DAY_MS,
        },
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
  }

  test("closes read-only, reopens with the same Invitation identity, and gates the new Package Revision until acknowledgement", async () => {
    const fixture = await openedSubmissionFixture();
    const quoteRoundId = fixture.invitation.quoteRoundId;
    const beforeClose = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(beforeClose).toMatchObject({ revision: 2, state: "open" });

    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.closeQuoteRound,
        {
          buildId: fixture.buildId,
          confirmed: false,
          expectedRevision: beforeClose.revision,
          quoteRoundId,
          reason: "Close after the bidding window.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/Explicit confirmation/);
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.closeQuoteRound,
        {
          buildId: fixture.buildId,
          confirmed: true,
          expectedRevision: beforeClose.revision,
          quoteRoundId,
          reason: "   ",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/closure reason is required/);

    const closed = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.closeQuoteRound,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedRevision: beforeClose.revision,
        quoteRoundId,
        reason: "Close after the bidding window.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(closed).toMatchObject({
      quoteRoundId,
      revision: 3,
      state: "closed",
      status: "closed",
    });

    const closedAccess = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(closedAccess.status).toBe("read_only");
    const closedLine = closedAccess.access.package.labourLines[0];
    const blockedSave = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${closedLine.sourceLineId}`,
              quotedAmountCents: 145_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: closedLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(blockedSave).toEqual({ status: "read_only" });

    const reopenedDeadline = Date.now() + 2 * DAY_MS;
    const reopened = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.reopenQuoteRoundWithRevision,
      {
        buildId: fixture.buildId,
        changedFieldKeys: ["responseDeadline"],
        confirmed: true,
        expectedRevision: closed.revision,
        quoteRoundId,
        reason: "Extend the response window for the corrected schedule.",
        deadlinePolicy: {
          kind: "replace",
          responseDeadline: reopenedDeadline,
        },
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(reopened).toMatchObject({
      invitationIds: [fixture.invitation._id],
      packageRevisionNumber: 2,
      quoteRoundId,
      revision: 4,
      responseDeadline: reopenedDeadline,
      state: "open",
      status: "reopened",
    });
    expect(reopened.packageRevisionId).not.toBe(
      fixture.invitation.quotePackageRevisionId
    );

    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const invitations = await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (query) =>
          query.eq("quoteRoundId", quoteRoundId).eq("participationState", "active")
        )
        .collect();
      const revisions = await ctx.db
        .query("quotePackageRevisions")
        .withIndex("by_quoteRoundId_and_revision", (query) =>
          query.eq("quoteRoundId", quoteRoundId)
        )
        .collect();
      const acknowledgement = await ctx.db
        .query("quoteInvitationPackageRevisionAcknowledgements")
        .withIndex("by_quoteRoundInvitationId_and_quotePackageRevisionId", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("quotePackageRevisionId", reopened.packageRevisionId)
        )
        .unique();
      const notices = await ctx.db
        .query("quoteRoundRecipientNoticeIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .order("desc")
        .collect();
      const intents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .order("desc")
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "quoteRound").eq("entityId", String(quoteRoundId))
        )
        .collect();
      return {
        acknowledgement,
        audits,
        intents,
        invitations,
        notices,
        revisions,
        round,
      };
    });
    expect(persisted.round).toMatchObject({
      currentPackageRevisionId: reopened.packageRevisionId,
      revision: 4,
      state: "open",
    });
    expect(persisted.invitations).toHaveLength(1);
    expect(persisted.invitations[0]).toMatchObject({
      _id: fixture.invitation._id,
      currentQuotePackageRevisionId: reopened.packageRevisionId,
      participationState: "active",
      quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
    });
    expect(persisted.revisions).toHaveLength(2);
    expect(persisted.revisions.find((row) => row._id === reopened.packageRevisionId)).toMatchObject({
      previousPackageRevisionId: fixture.invitation.quotePackageRevisionId,
      revision: 2,
    });
    expect(persisted.acknowledgement).toMatchObject({
      acknowledgedFieldKeys: [],
      changedFieldKeys: ["responseDeadline"],
      status: "pending",
    });
    expect(persisted.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_invitation_initial",
          status: "pending",
        }),
        expect.objectContaining({
          kind: "quote_package_revision",
          payloadSnapshot: expect.stringContaining(
            "Extend the response window for the corrected schedule."
          ),
          quotePackageRevisionId: reopened.packageRevisionId,
          status: "pending",
        }),
      ])
    );
    expect(persisted.notices[0]).toMatchObject({
      kind: "package_revision_published",
      reason: "Extend the response window for the corrected schedule.",
      status: "pending",
    });
    expect(persisted.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "quote_round.closed",
          reason: "Close after the bidding window.",
        }),
        expect.objectContaining({
          eventType: "quote_round.reopened",
          reason: "Extend the response window for the corrected schedule.",
        }),
      ])
    );

    const reopenedAccess = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(reopenedAccess).toMatchObject({
      access: { package: { revision: 2 } },
      status: "available",
    });
    const reopenedLine = reopenedAccess.access.package.labourLines[0];
    const acknowledgementRequired = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${reopenedLine.sourceLineId}`,
              quotedAmountCents: 145_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: reopenedLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(acknowledgementRequired).toEqual({
      status: "acknowledgement_required",
    });

    const acknowledged = await fixture.base.mutation(
      (api as any).quote_round_lifecycle.acknowledgeQuoteInvitationPackageRevision,
      {
        acknowledgedFieldKeys: ["responseDeadline"],
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(acknowledged).toMatchObject({
      acknowledgedFieldKeys: ["responseDeadline"],
      quotePackageRevisionId: reopened.packageRevisionId,
      status: "acknowledged",
    });
    const savedAfterAcknowledgement = await fixture.base.mutation(
      (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
      {
        expectedVersion: 0,
        patch: {
          linePatches: [
            {
              lineKey: `labour:${reopenedLine.sourceLineId}`,
              quotedAmountCents: 145_000_00,
              scope: "labour",
              source: "package_labour",
              sourcePackageRevisionLabourLineId: reopenedLine.sourceLineId,
            },
          ],
        },
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(savedAfterAcknowledgement).toMatchObject({
      draft: { version: 1 },
      status: "saved",
    });

    const acknowledgementAfterSave = await fixture.base.run(async (ctx) => {
      const acknowledgement = await ctx.db
        .query("quoteInvitationPackageRevisionAcknowledgements")
        .withIndex("by_quoteRoundInvitationId_and_quotePackageRevisionId", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("quotePackageRevisionId", reopened.packageRevisionId)
        )
        .unique();
      const notice = await ctx.db
        .query("quoteRoundRecipientNoticeIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .order("desc")
        .first();
      return { acknowledgement, notice };
    });
    expect(acknowledgementAfterSave.acknowledgement).toMatchObject({
      acknowledgedFieldKeys: ["responseDeadline"],
      status: "acknowledged",
    });
    expect(acknowledgementAfterSave.notice).toMatchObject({
      acknowledgedAt: expect.any(Number),
      status: "acknowledged",
    });
  });

  test("cancels terminally without relabeling active Invitations and removes all recipient access", async () => {
    const fixture = await openedSubmissionFixture();
    const quoteRoundId = fixture.invitation.quoteRoundId;
    const beforeCancel = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.cancelQuoteRound,
        {
          buildId: fixture.buildId,
          confirmed: false,
          expectedRevision: beforeCancel.revision,
          quoteRoundId,
          reason: "Cancel this solicitation.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/Explicit confirmation/);
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.cancelQuoteRound,
        {
          buildId: fixture.buildId,
          confirmed: true,
          expectedRevision: beforeCancel.revision,
          quoteRoundId,
          reason: "  ",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cancellation reason is required/);

    const cancelled = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.cancelQuoteRound,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedRevision: beforeCancel.revision,
        quoteRoundId,
        reason: "Solicitation cancelled after the scope was withdrawn.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(cancelled).toMatchObject({
      quoteRoundId,
      revision: beforeCancel.revision + 1,
      state: "cancelled",
      status: "cancelled",
    });
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.cancelQuoteRound,
        {
          buildId: fixture.buildId,
          confirmed: true,
          expectedRevision: cancelled.revision,
          quoteRoundId,
          reason: "Try to cancel it twice.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/terminal/);

    const unavailable = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(unavailable).toEqual({ status: "unavailable" });
    const exchangedAfterCancel = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: fixture.magicToken }
    );
    expect(exchangedAfterCancel).toEqual({ status: "unavailable" });

    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const invitations = await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (query) =>
          query.eq("quoteRoundId", quoteRoundId).eq("participationState", "active")
        )
        .collect();
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const sessions = await ctx.db
        .query("quoteInvitationBrowserSessions")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "quoteRound").eq("entityId", String(quoteRoundId))
        )
        .collect();
      const intents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_relatedEntityType_and_relatedEntityId_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "quoteRound")
            .eq("relatedEntityId", String(quoteRoundId))
        )
        .collect();
      return { audits, credentials, intents, invitations, round, sessions };
    });
    expect(persisted.round).toMatchObject({
      cancellationReason: "Solicitation cancelled after the scope was withdrawn.",
      state: "cancelled",
    });
    expect(persisted.invitations).toHaveLength(1);
    expect(persisted.invitations[0]).toMatchObject({
      _id: fixture.invitation._id,
      currentQuotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
      participationState: "active",
      quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
    });
    expect(persisted.credentials).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "revoked" })])
    );
    expect(persisted.sessions).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "revoked" })])
    );
    expect(persisted.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_round_cancelled",
          payloadSnapshot: expect.stringContaining(
            "Solicitation cancelled after the scope was withdrawn."
          ),
          status: "pending",
          templateKey: "quote_invitation_cancelled",
        }),
      ])
    );
    expect(persisted.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "quote_round.cancelled",
          reason: "Solicitation cancelled after the scope was withdrawn.",
        }),
      ])
    );
  });

  test("rotates and revokes Invitation credentials and browser sessions, and preserves audit reasons", async () => {
    const fixture = await openedSubmissionFixture();
    const oldCredential = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("state", "active")
        )
        .unique()
    );
    if (!oldCredential) {
      throw new Error("Expected the initial active Quote Invitation credential.");
    }
    const rotated = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.rotateQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Rotate the link after a delivery security review.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(rotated).toMatchObject({
      accessGeneration: 2,
      invitationId: fixture.invitation._id,
      status: "rotated",
    });
    if (!rotated.credentialId) {
      throw new Error("Expected a replacement credential after rotation.");
    }
    await replaceCredentialMagicToken(
      fixture,
      rotated.credentialId,
      "rotated-browser-token"
    );

    const oldExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: fixture.magicToken }
    );
    expect(oldExchange).toEqual({ status: "unavailable" });
    const oldSessionRead = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(oldSessionRead).toEqual({ status: "unavailable" });
    const rotatedExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "rotated-browser-token" }
    );
    if (rotatedExchange.status !== "available") {
      throw new Error("Expected the rotated credential to exchange.");
    }

    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.revokeQuoteRoundInvitation,
        {
          buildId: fixture.buildId,
          confirmed: false,
          quoteRoundInvitationId: fixture.invitation._id,
          reason: "Revoke the Invitation after the project was withdrawn.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/Explicit confirmation/);
    const revoked = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.revokeQuoteRoundInvitation,
      {
        buildId: fixture.buildId,
        confirmed: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Revoke the Invitation after the project was withdrawn.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(revoked).toMatchObject({
      invitationId: fixture.invitation._id,
      status: "revoked",
    });
    const rotatedExchangeAfterRevoke = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "rotated-browser-token" }
    );
    expect(rotatedExchangeAfterRevoke).toEqual({ status: "unavailable" });
    const revokedSessionRead = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: rotatedExchange.sessionToken,
      }
    );
    expect(revokedSessionRead).toEqual({ status: "unavailable" });

    const persisted = await fixture.base.run(async (ctx) => {
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const sessions = await ctx.db
        .query("quoteInvitationBrowserSessions")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const invitation = await ctx.db.get(fixture.invitation._id);
      const intents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRoundInvitation")
            .eq("entityId", String(fixture.invitation._id))
        )
        .collect();
      return { audits, credentials, intents, invitation, sessions };
    });
    expect(persisted.invitation).toMatchObject({
      participationState: "revoked",
      revocationReason: "Revoke the Invitation after the project was withdrawn.",
    });
    expect(persisted.credentials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: oldCredential._id, state: "rotated" }),
        expect.objectContaining({ _id: rotated.credentialId, state: "revoked" }),
      ])
    );
    expect(persisted.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "revoked" }),
      ])
    );
    expect(persisted.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_invitation_rotation",
          status: "pending",
          templateKey: "quote_invitation_rotation",
        }),
        expect.objectContaining({
          kind: "quote_invitation_revoked",
          payloadSnapshot: expect.stringContaining(
            "Revoke the Invitation after the project was withdrawn."
          ),
          status: "pending",
        }),
      ])
    );
    expect(persisted.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "quote_invitation.access_rotated",
          reason: "Rotate the link after a delivery security review.",
        }),
        expect.objectContaining({
          eventType: "quote_invitation.revoked",
          reason: "Revoke the Invitation after the project was withdrawn.",
        }),
      ])
    );
  });

  test("replaces a corrected recipient email without transferring Draft or submission history", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture, 102_000_00);
    const accepted = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "recipient-replacement-submit-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(accepted).toMatchObject({
      status: "accepted",
      submission: { revision: 1 },
    });
    const started = await fixture.base.mutation(
      (api as any).quote_response_submissions.startQuoteInvitationResponseRevision,
      {
        expectedSubmissionRevision: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(started).toMatchObject({ status: "draft_ready", draft: { version: 1 } });

    const replaced = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.replaceQuoteRoundInvitationEmail,
      {
        buildId: fixture.buildId,
        confirmed: true,
        correctedEmail: " Corrected.Recipient@Example.com ",
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Correct a typo in the recipient email address.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(replaced).toMatchObject({
      invitationId: fixture.invitation._id,
      status: "replaced",
    });
    if (!replaced.replacementInvitationId) {
      throw new Error("Expected a replacement Invitation row.");
    }

    const persisted = await fixture.base.run(async (ctx) => {
      const oldInvitation = await ctx.db.get(fixture.invitation._id);
      const replacement = await ctx.db.get(replaced.replacementInvitationId!);
      const drafts = await ctx.db.query("quoteInvitationResponseDrafts").collect();
      const submissions = await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .collect();
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      const replacementCredentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query.eq("quoteRoundInvitationId", replaced.replacementInvitationId!)
        )
        .collect();
      const replacementIntents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", replaced.replacementInvitationId!)
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRoundInvitation")
            .eq("entityId", String(fixture.invitation._id))
        )
        .collect();
      const outbox = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "quoteRoundInvitation")
            .eq("relatedEntityId", String(fixture.invitation._id))
        )
        .collect();
      return {
        audits,
        credentials,
        drafts,
        oldInvitation,
        outbox,
        replacement,
        replacementCredentials,
        replacementIntents,
        submissions,
      };
    });
    expect(persisted.oldInvitation).toMatchObject({
      participationState: "revoked",
      recipientEmailSnapshot: "quote-recipient@example.com",
      revocationReason: "Correct a typo in the recipient email address.",
    });
    expect(persisted.replacement).toMatchObject({
      _id: replaced.replacementInvitationId,
      currentQuotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
      participationState: "active",
      quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
      recipientEmailSnapshot: "corrected.recipient@example.com",
      supersedesInvitationId: fixture.invitation._id,
    });
    expect(persisted.drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quoteRoundInvitationId: fixture.invitation._id,
          version: 1,
        }),
      ])
    );
    expect(persisted.drafts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quoteRoundInvitationId: replaced.replacementInvitationId,
        }),
      ])
    );
    expect(persisted.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quoteRoundInvitationId: fixture.invitation._id,
          revision: 1,
        }),
      ])
    );
    expect(persisted.submissions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quoteRoundInvitationId: replaced.replacementInvitationId,
        }),
      ])
    );
    expect(persisted.credentials).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "revoked" })])
    );
    expect(persisted.replacementCredentials).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: "active" })])
    );
    expect(persisted.replacementIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_invitation_recipient_replaced",
          payloadSnapshot: expect.stringContaining(
            "Correct a typo in the recipient email address."
          ),
          recipientEmailSnapshot: "corrected.recipient@example.com",
          status: "pending",
        }),
      ])
    );
    expect(JSON.stringify(persisted.replacementIntents)).not.toContain(
      "magicToken"
    );
    expect(persisted.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "quote_invitation.recipient_replaced",
          reason: "Correct a typo in the recipient email address.",
        }),
      ])
    );
    const replacementOutbox = persisted.outbox.find(
      (event) => event.eventType === "quote_invitation.recipient_replaced"
    );
    expect(replacementOutbox).toBeDefined();
    expect(replacementOutbox?.payloadPreview).not.toContain(
      "corrected.recipient@example.com"
    );

    const oldSessionRead = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(oldSessionRead).toEqual({ status: "unavailable" });
  });

  test("requires Reminder and Rotation to target an open Quote Round", async () => {
    const fixture = await openedSubmissionFixture();
    await closeOpenRound(fixture);

    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
        {
          buildId: fixture.buildId,
          confirmed: true,
          quoteRoundInvitationId: fixture.invitation._id,
          reason: "Reminder must not reopen a closed Round.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/live Round/);
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.rotateQuoteInvitationAccess,
        {
          buildId: fixture.buildId,
          confirmed: true,
          quoteRoundInvitationId: fixture.invitation._id,
          reason: "Rotation must not reopen a closed Round.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/live Round/);
  });

  test("Reminder is previewable, additive, and cooldown-guarded without invalidating the old link", async () => {
    const fixture = await openedSubmissionFixture();
    const oldSessionToken = fixture.exchanged.sessionToken;
    const preview = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: false,
        preview: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Preview a fresh access reminder.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(preview).toMatchObject({
      invitationId: fixture.invitation._id,
      status: "preview",
    });
    expect(preview.cooldownUntil).toBeUndefined();
    const reminded = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: true,
        preview: false,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Send a fresh access reminder.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(reminded).toMatchObject({
      accessGeneration: 1,
      status: "reminded",
    });
    if (!reminded.credentialId) {
      throw new Error("Expected the Reminder credential.");
    }
    await replaceCredentialMagicToken(
      fixture,
      reminded.credentialId,
      "reminder-browser-token"
    );
    const oldExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: fixture.magicToken }
    );
    expect(oldExchange).toMatchObject({ status: "available" });
    const oldSessionRead = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: oldSessionToken,
      }
    );
    expect(oldSessionRead).toMatchObject({ status: "available" });
    const replacementExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "reminder-browser-token" }
    );
    expect(replacementExchange.status).toBe("available");

    const cooldownPreview = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: false,
        preview: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Preview a duplicate reminder during cooldown.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(cooldownPreview).toMatchObject({
      invitationId: fixture.invitation._id,
      status: "preview",
      cooldownUntil: expect.any(Number),
    });
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
        {
          buildId: fixture.buildId,
          confirmed: true,
          preview: false,
          quoteRoundInvitationId: fixture.invitation._id,
          reason: "Try to send a duplicate reminder during cooldown.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/already sent recently|cooldown/i);

    const accessRows = await fixture.base.run(async (ctx) => {
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("state", "active")
        )
        .collect();
      const sessions = await ctx.db
        .query("quoteInvitationBrowserSessions")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("state", "active")
        )
        .collect();
      const intents = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect();
      return { credentials, intents, sessions };
    });
    expect(accessRows.credentials).toHaveLength(2);
    expect(accessRows.credentials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "active" }),
        expect.objectContaining({
          _id: reminded.credentialId,
          purpose: "reminder",
          state: "active",
        }),
      ])
    );
    expect(accessRows.sessions).toHaveLength(3);
    expect(accessRows.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "active" }),
        expect.objectContaining({
          quoteInvitationAccessCredentialId: reminded.credentialId,
          state: "active",
        }),
      ])
    );
    expect(accessRows.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quote_invitation_initial",
          status: "pending",
        }),
        expect.objectContaining({
          kind: "quote_invitation_reminder_manual",
          payloadSnapshot: expect.stringContaining(
            "Send a fresh access reminder."
          ),
          quoteInvitationAccessCredentialId: reminded.credentialId,
          status: "pending",
        }),
      ])
    );
  });

  test("schedules automatic 72h and 24h reminder intents with bounded eligibility", async () => {
    const publishReminderFixture = async (remainingMs: number, label: string) => {
      const fixture = await openedSubmissionFixture();
      const now = Date.now();
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
          responseDeadline: now + remainingMs,
        });
        const initialIntent = await ctx.db
          .query("communicationIntents")
          .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
            query.eq("quoteRoundInvitationId", fixture.invitation._id)
          )
          .unique();
        if (!initialIntent) {
          throw new Error("Expected the initial Quote Invitation intent.");
        }
        await ctx.db.patch(initialIntent._id, {
          createdAt: now - 13 * 60 * 60 * 1000,
          status: "sent",
          updatedAt: now - 13 * 60 * 60 * 1000,
        });
      });
      await fixture.base.action(
        internal.quote_notifications.scheduleQuoteInvitationReminders,
        { now }
      );
      const persisted = await fixture.base.run(async (ctx) => ({
        intents: await ctx.db
          .query("communicationIntents")
          .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
            query.eq("quoteRoundInvitationId", fixture.invitation._id)
          )
          .collect(),
        notices: await ctx.db
          .query("quoteRoundRecipientNoticeIntents")
          .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
            query.eq("quoteRoundInvitationId", fixture.invitation._id)
          )
          .collect(),
      }));
      const reminder = persisted.intents.find(
        (intent) => intent.kind === "quote_invitation_reminder_auto"
      );
      expect(reminder, label).toMatchObject({
        kind: "quote_invitation_reminder_auto",
        payloadSnapshot: expect.stringContaining(`"stage":"${label}"`),
        status: "pending",
        templateKey: "quote_invitation_reminder",
      });
      expect(JSON.stringify(reminder)).not.toContain("magicToken");
      expect(persisted.notices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "access_reminder",
            reason: `Automatic ${label} reminder.`,
            status: "pending",
          }),
        ])
      );
    };

    await publishReminderFixture(60 * 60 * 60 * 1000, "72h");
    await publishReminderFixture(12 * 60 * 60 * 1000, "24h");
  });

  test("suppresses automatic reminders inside the twelve-hour post-send window and skips valid submissions", async () => {
    const suppressedFixture = await openedSubmissionFixture();
    const suppressionNow = Date.now();
    await suppressedFixture.base.run(async (ctx) => {
      await ctx.db.patch(suppressedFixture.invitation.quotePackageRevisionId, {
        responseDeadline: suppressionNow + 60 * 60 * 60 * 1000,
      });
      const initialIntent = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", suppressedFixture.invitation._id)
        )
        .unique();
      if (!initialIntent) {
        throw new Error("Expected the initial Quote Invitation intent.");
      }
      await ctx.db.patch(initialIntent._id, {
        createdAt: suppressionNow - 60 * 60 * 1000,
        status: "sent",
        updatedAt: suppressionNow - 60 * 60 * 1000,
      });
    });
    await suppressedFixture.base.action(
      internal.quote_notifications.scheduleQuoteInvitationReminders,
      { now: suppressionNow }
    );
    await suppressedFixture.base.action(
      internal.quote_notifications.scheduleQuoteInvitationReminders,
      { now: suppressionNow }
    );
    const suppressed = await suppressedFixture.base.run(async (ctx) => ({
      intent: await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", suppressedFixture.invitation._id)
        )
        .order("desc")
        .first(),
      outcomes: await ctx.db.query("communicationOutcomes").collect(),
    }));
    expect(suppressed.intent).toMatchObject({
      kind: "quote_invitation_reminder_auto",
      status: "suppressed",
      suppressionReason: "post_send_suppression",
    });
    expect(suppressed.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcomeType: "dispatch_suppressed",
          safeDetail: "post_send_suppression",
        }),
      ])
    );
    expect(
      suppressed.outcomes.filter(
        (outcome) => outcome.outcomeType === "dispatch_suppressed"
      )
    ).toHaveLength(1);
    await suppressedFixture.base.action(
      internal.quote_notifications.scheduleQuoteInvitationReminders,
      { now: suppressionNow + 13 * 60 * 60 * 1000 }
    );
    const resumedIntents = await suppressedFixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", suppressedFixture.invitation._id)
        )
        .collect()
    );
    expect(resumedIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: expect.stringContaining(":72h:suppressed"),
          status: "suppressed",
        }),
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/:72h$/),
          status: "pending",
        }),
      ])
    );

    const submittedFixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(submittedFixture);
    await submittedFixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "auto-reminder-submission-exclusion-001",
        quoteRoundInvitationId: submittedFixture.invitation._id,
        sessionToken: submittedFixture.exchanged.sessionToken,
      }
    );
    const submissionNow = Date.now();
    await submittedFixture.base.run(async (ctx) => {
      await ctx.db.patch(submittedFixture.invitation.quotePackageRevisionId, {
        responseDeadline: submissionNow + 60 * 60 * 60 * 1000,
      });
      const initialIntent = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", submittedFixture.invitation._id)
        )
        .filter((query) =>
          query.eq(query.field("kind"), "quote_invitation_initial")
        )
        .unique();
      if (!initialIntent) {
        throw new Error("Expected the submitted fixture initial intent.");
      }
      await ctx.db.patch(initialIntent._id, {
        createdAt: submissionNow - 13 * 60 * 60 * 1000,
        status: "sent",
        updatedAt: submissionNow - 13 * 60 * 60 * 1000,
      });
    });
    await submittedFixture.base.action(
      internal.quote_notifications.scheduleQuoteInvitationReminders,
      { now: submissionNow }
    );
    const submissionIntents = await submittedFixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", submittedFixture.invitation._id)
        )
        .collect()
    );
    expect(
      submissionIntents.some(
        (intent) => intent.kind === "quote_invitation_reminder_auto"
      )
    ).toBe(false);
  });

  test("acknowledgement patches only the current package-published notice, not access notices", async () => {
    const fixture = await openedSubmissionFixture();
    const closed = await closeOpenRound(fixture);
    const reopened = await reopenClosedRound(fixture, closed.revision);

    const reminded = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Remind after publishing the revised package.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    if (!reminded.credentialId) {
      throw new Error("Expected the Reminder credential.");
    }
    await replaceCredentialMagicToken(
      fixture,
      reminded.credentialId,
      "notice-reminder-browser-token"
    );
    await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "notice-reminder-browser-token" }
    );

    const rotated = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.rotateQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: true,
        quoteRoundInvitationId: fixture.invitation._id,
        reason: "Rotate the reminder credential before acknowledgement.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    if (!rotated.credentialId) {
      throw new Error("Expected the Rotation credential.");
    }
    await replaceCredentialMagicToken(
      fixture,
      rotated.credentialId,
      "notice-rotation-browser-token"
    );
    const rotationExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "notice-rotation-browser-token" }
    );
    if (rotationExchange.status !== "available") {
      throw new Error("Expected the Rotation credential exchange.");
    }

    await fixture.base.mutation(
      (api as any).quote_round_lifecycle.acknowledgeQuoteInvitationPackageRevision,
      {
        acknowledgedFieldKeys: ["responseDeadline"],
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: rotationExchange.sessionToken,
      }
    );
    const notices = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteRoundRecipientNoticeIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect()
    );
    expect(
      notices.find(
        (notice) =>
          notice.kind === "package_revision_published" &&
          notice.quotePackageRevisionId === reopened.packageRevisionId
      )
    ).toMatchObject({ status: "acknowledged" });
    expect(
      notices.find((notice) => notice.kind === "access_reminder")
    ).toMatchObject({ status: "pending" });
    expect(
      notices.find((notice) => notice.kind === "access_rotated")
    ).toMatchObject({ status: "pending" });
  });

  test("uses the active Build authorization role instead of a caller JWT role claim", async () => {
    const fixture = await openedSubmissionFixture();
    const memberIdentity = withIdentity(
      fixture.base,
      ["member"],
      "user_builder",
      ORGANIZATION_ID
    );
    const round = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: fixture.invitation.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const closed = await memberIdentity.mutation(
      (api as any).quote_round_lifecycle.closeQuoteRound,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedRevision: round.revision,
        quoteRoundId: fixture.invitation.quoteRoundId,
        reason: "Close using the active Build participant grant.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(closed).toMatchObject({ state: "closed", status: "closed" });
  });

  test("rejects an expired kept deadline and requires the replace action", async () => {
    const fixture = await openedSubmissionFixture();
    await fixture.base.run((ctx) =>
      ctx.db.patch(fixture.invitation.quotePackageRevisionId, {
        responseDeadline: Date.now() - 1,
      })
    );
    const closed = await closeOpenRound(fixture);
    await expect(
      fixture.builder.mutation(
        (api as any).quote_round_lifecycle.reopenQuoteRoundWithRevision,
        {
          buildId: fixture.buildId,
          changedFieldKeys: ["responseDeadline"],
          confirmed: true,
          deadlinePolicy: { kind: "keep" },
          expectedRevision: closed.revision,
          quoteRoundId: fixture.invitation.quoteRoundId,
          reason: "Keep the existing response window.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/choose replace/i);
  });

  test("keeps changed fields and the required responseDeadline within the 100-field cap", async () => {
    const fixture = await openedSubmissionFixture();
    const closed = await closeOpenRound(fixture);
    const tooMany = Array.from({ length: 100 }, (_, index) => `changed-${index}`);
    await expect(
      reopenClosedRound(fixture, closed.revision, tooMany)
    ).rejects.toThrow(/at most 100 changed fields/);

    const accepted = await reopenClosedRound(
      fixture,
      closed.revision,
      Array.from({ length: 99 }, (_, index) => `changed-${index}`)
    );
    if (!accepted.packageRevisionId) {
      throw new Error("Expected the reopened Package Revision.");
    }
    const packageRevision = await fixture.base.run((ctx) =>
      ctx.db.get(accepted.packageRevisionId as Id<"quotePackageRevisions">)
    );
    expect(packageRevision?.changedFieldKeys).toHaveLength(100);
    expect(packageRevision?.changedFieldKeys).toContain("responseDeadline");
  });

  test("rejects acknowledgement input above the changed-field safety cap", async () => {
    const fixture = await openedSubmissionFixture();
    const closed = await closeOpenRound(fixture);
    await reopenClosedRound(fixture, closed.revision, ["responseDeadline"]);
    await expect(
      fixture.base.mutation(
        (api as any).quote_round_lifecycle.acknowledgeQuoteInvitationPackageRevision,
        {
          acknowledgedFieldKeys: Array.from(
            { length: 101 },
            (_, index) => `ack-${index}`
          ),
          quoteRoundInvitationId: fixture.invitation._id,
          sessionToken: fixture.exchanged.sessionToken,
        }
      )
    ).rejects.toThrow(/acknowledgement may include at most 100 fields/);
  });

  test("copies a prior Package response by stable identities and requires explicit confirmation", async () => {
    const fixture = await openedSubmissionFixture();
    const { before } = await saveCompleteSubmissionDraft(fixture);
    const priorLine = before.access.package.labourLines[0];
    const priorField = before.access.package.responseFields.find(
      (field: { fieldKey: string }) => field.fieldKey === "approach"
    );
    if (!(priorLine && priorField)) {
      throw new Error("Expected the prior Package Revision response fields.");
    }
    await fixture.base.run(async (ctx) => {
      const draft = await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq(
                "quotePackageRevisionId",
                fixture.invitation.quotePackageRevisionId
              )
        )
        .unique();
      if (!draft) {
        throw new Error("Expected the prior Field Ledger draft.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["migration attachment"], { type: "text/plain" })
      );
      await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
        brokerageId: fixture.invitation.brokerageId,
        buildId: fixture.invitation.buildId,
        createdAt: Date.now(),
        fileName: "migration.txt",
        mimeType: "text/plain",
        organizationId: fixture.invitation.organizationId,
        quoteInvitationResponseDraftId: draft._id,
        quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
        quoteRoundId: fixture.invitation.quoteRoundId,
        quoteRoundInvitationId: fixture.invitation._id,
        sizeBytes: 20,
        storageId,
      });
      await ctx.db.patch(draft._id, {
        attachmentCount: 1,
        updatedAt: Date.now(),
      });
    });
    const priorSubmission = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "prior-package-response-before-republish-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(priorSubmission).toMatchObject({
      status: "accepted",
      submission: {
        quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
        revision: 1,
      },
    });
    const closed = await closeOpenRound(fixture);
    const reopened = await reopenClosedRound(fixture, closed.revision);
    if (!reopened.packageRevisionId) {
      throw new Error("Expected the reopened Package Revision.");
    }
    await expect(
      fixture.base.mutation(
        (api as any).quote_response_drafts.saveQuoteInvitationResponseDraft,
        {
          expectedVersion: 1,
          patch: {
            commentsHtml: "<p>Must remain acknowledgement-gated.</p>",
          },
          quoteRoundInvitationId: fixture.invitation._id,
          sessionToken: fixture.exchanged.sessionToken,
        }
      )
    ).resolves.toEqual({ status: "acknowledgement_required" });

    const acknowledged = await fixture.base.mutation(
      (api as any).quote_round_lifecycle.acknowledgeQuoteInvitationPackageRevision,
      {
        acknowledgedFieldKeys: ["responseDeadline"],
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(acknowledged).toMatchObject({ status: "acknowledged" });

    const migrated = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(migrated).toMatchObject({
      access: { package: { revision: 2 } },
      draft: {
        copiedFromQuotePackageRevisionId:
          fixture.invitation.quotePackageRevisionId,
        copiedValuesConfirmationState: "pending",
        version: 1,
      },
      status: "available",
    });
    if (migrated.status !== "available" || !migrated.draft) {
      throw new Error("Expected a migrated current-revision Draft.");
    }
    const migratedLine = migrated.draft.lineItems.find(
      (line: { source: string }) => line.source === "package_labour"
    );
    const migratedAnswer = migrated.draft.responses.find(
      (answer: { value: string }) =>
        answer.value === "<p>We will stage the crew before framing.</p>"
    );
    expect(migratedLine).toMatchObject({ quotedAmountCents: 125_000_00 });
    expect(migratedLine?.sourcePackageRevisionLabourLineId).not.toBe(
      priorLine.sourceLineId
    );
    expect(migratedAnswer?.sourcePackageRevisionResponseFieldId).not.toBe(
      priorField.sourceFieldId
    );
    expect(migrated.draft.attachments).toHaveLength(1);
    expect(
      migrated.draft.attachments[0]?.sourcePackageRevisionResponseFieldId
    ).toBeUndefined();

    const blockedSubmission = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 1,
        idempotencyKey: "copied-response-before-confirmation-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(blockedSubmission).toMatchObject({
      status: "invalid",
      validationErrors: [
        "Confirm all copied response values and pricing before submitting.",
      ],
    });
    const confirmed = await fixture.base.mutation(
      (api as any).quote_response_drafts
        .confirmCopiedQuoteInvitationResponseDraftValues,
      {
        expectedVersion: 1,
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(confirmed).toMatchObject({
      draft: {
        copiedValuesConfirmationState: "confirmed",
        version: 2,
      },
      status: "confirmed",
    });
    const confirmationAudit = await fixture.base.run(async (ctx) => {
      const draft = await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) =>
            query
              .eq("quoteRoundInvitationId", fixture.invitation._id)
              .eq("quotePackageRevisionId", reopened.packageRevisionId!)
        )
        .unique();
      if (!draft) {
        throw new Error("Expected the confirmed current-revision Draft.");
      }
      return await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteInvitationResponseDraft")
            .eq("entityId", String(draft._id))
        )
        .collect();
    });
    expect(confirmationAudit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRoles: ["quote-recipient"],
          eventType: "quote_response.copied_values_confirmed",
          newState: JSON.stringify({
            copiedFromQuotePackageRevisionId:
              fixture.invitation.quotePackageRevisionId,
            copiedValuesConfirmationState: "confirmed",
            version: 2,
          }),
          priorState: JSON.stringify({
            copiedFromQuotePackageRevisionId:
              fixture.invitation.quotePackageRevisionId,
            copiedValuesConfirmationState: "pending",
            version: 1,
          }),
          reason: "Recipient confirmed copied response values and pricing.",
          warnings: [],
        }),
      ])
    );
    const acceptedCopy = await fixture.base.mutation(
      (api as any).quote_response_submissions.submitQuoteInvitationResponse,
      {
        expectedDraftVersion: 2,
        idempotencyKey: "copied-response-after-confirmation-001",
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(acceptedCopy).toMatchObject({
      status: "accepted",
      submission: {
        quotePackageRevisionId: reopened.packageRevisionId,
        revision: 2,
      },
    });
    const historical = await fixture.base.query(
      (api as any).quote_response_submissions
        .getQuoteInvitationResponseSubmissionRevision,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        revision: 1,
        sessionToken: fixture.exchanged.sessionToken,
      }
    );
    expect(historical).toMatchObject({
      status: "available",
      submission: {
        quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
        revision: 1,
      },
    });

    const drafts = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) => query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect()
    );
    expect(drafts).toHaveLength(0);
  });

  test("rejects an oversized Package Revision clone before changing the closed Round", async () => {
    const fixture = await openedSubmissionFixture();
    const quoteRoundId = fixture.invitation.quoteRoundId;
    const previousPackageRevisionId = fixture.invitation.quotePackageRevisionId;
    const oversizedFileName = `oversized-${"x".repeat(799_992)}`;

    // Keep setup transactions small while making the source revision's
    // serialized clone payload exceed the lifecycle safety threshold.
    for (let index = 0; index < 16; index += 1) {
      await fixture.base.run(async (ctx) => {
        await ctx.db.insert("quotePackageRevisionAttachments", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          contentHashSha256Snapshot: "c".repeat(64),
          createdAt: Date.now() + index,
          fileNameSnapshot: oversizedFileName,
          kind: "inherited",
          mimeTypeSnapshot: "application/pdf",
          order: 10 + index,
          organizationId: ORGANIZATION_ID,
          quotePackageRevisionId: previousPackageRevisionId,
          quoteRoundId,
          sizeBytesSnapshot: oversizedFileName.length,
          sourceBuildDocumentId: fixture.supporting.documentId,
          sourceDocumentVersionSnapshot: 1,
        });
      });
    }

    const closed = await closeOpenRound(fixture);
    await expect(reopenClosedRound(fixture, closed.revision)).rejects.toThrow(
      /transaction size safety limit/
    );

    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const revisions = await ctx.db
        .query("quotePackageRevisions")
        .withIndex("by_quoteRoundId_and_revision", (query) =>
          query.eq("quoteRoundId", quoteRoundId)
        )
        .collect();
      return { revisions, round };
    });
    expect(persisted.round).toMatchObject({
      currentPackageRevisionId: previousPackageRevisionId,
      revision: closed.revision,
      state: "closed",
    });
    expect(persisted.revisions).toHaveLength(1);
  });

  test("rejects republish at the 20-package-revision boundary before reopening", async () => {
    const fixture = await openedSubmissionFixture();
    const quoteRoundId = fixture.invitation.quoteRoundId;
    const initial = await fixture.base.run((ctx) =>
      ctx.db.get(fixture.invitation.quotePackageRevisionId)
    );
    if (!initial) {
      throw new Error("Expected the initial Quote Package Revision.");
    }
    const { _creationTime, _id, ...snapshot } = initial;
    await fixture.base.run(async (ctx) => {
      for (let revision = 2; revision <= 20; revision += 1) {
        await ctx.db.insert("quotePackageRevisions", {
          ...snapshot,
          previousPackageRevisionId: initial._id,
          publishedAt: initial.publishedAt + revision,
          revision,
        });
      }
    });

    const closed = await closeOpenRound(fixture);
    await expect(reopenClosedRound(fixture, closed.revision)).rejects.toThrow(
      /20 Package Revision limit/
    );

    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const revisions = await ctx.db
        .query("quotePackageRevisions")
        .withIndex("by_quoteRoundId_and_revision", (query) =>
          query.eq("quoteRoundId", quoteRoundId)
        )
        .collect();
      return { revisions, round };
    });
    expect(persisted.round).toMatchObject({
      currentPackageRevisionId: initial._id,
      revision: closed.revision,
      state: "closed",
    });
    expect(persisted.revisions).toHaveLength(20);
  });
});

describe("Quote Round operations register projection", () => {
  async function publishRegisterRound(
    fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
    mode: "labour" | "material" | "combined",
    idempotencyKey: string
  ) {
    const created = await configureRound(fixture, mode);
    return await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
  }

  async function register(
    fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
    viewer = fixture.builder,
    input: Record<string, unknown> = {}
  ) {
    return await viewer.query(
      (api as any).quote_rounds.listQuoteRounds,
      {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
        ...input,
      }
    );
  }

  test("projects the exact Preferred Submission Revision into the control register without duplicating commercial state", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const candidate = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        labourCents: 90_000_00,
        materialCents: 40_000_00,
        tokenSuffix: "register-preferred",
      }
    );

    await fixture.builder.mutation(
      (api as any).quote_comparisons.setPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        expectedStateVersion: 0,
        quoteRoundId: published.quoteRoundId,
        reason: "Expose the reviewed immutable revision in the register.",
        submissionRevisionId: candidate.submissionRevisionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );

    const result = await register(fixture);
    const row = result.rounds.find(
      (candidateRow: { _id: string }) =>
        candidateRow._id === published.quoteRoundId
    );
    expect(row?.preferredQuote).toMatchObject({
      canonicalTotalCents: 130_250_00,
      invitationId: published.invitations[0]!._id,
      packageRevisionId: published.invitations[0]!.quotePackageRevisionId,
      revision: 1,
      submissionRevisionId: candidate.submissionRevisionId,
    });
    expect(row?.preferredQuote?.submittedAt).toEqual(expect.any(Number));
    expect(row?.preferredQuote).not.toHaveProperty("commentsHtml");
    expect(row?.preferredQuote).not.toHaveProperty("lineItems");
  });

  test("treats an inactive Preferred invitation as a stale register projection", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const candidate = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        labourCents: 90_000_00,
        materialCents: 40_000_00,
        tokenSuffix: "register-inactive-preferred",
      }
    );
    await fixture.builder.mutation(
      (api as any).quote_comparisons.setPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        expectedStateVersion: 0,
        quoteRoundId: published.quoteRoundId,
        reason: "Select before simulating a stale invitation projection.",
        submissionRevisionId: candidate.submissionRevisionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(published.invitations[0]!._id, {
        participationState: "revoked",
        updatedAt: Date.now(),
      });
    });

    const result = await register(fixture);
    expect(
      result.rounds.find(
        (row: { _id: string }) => row._id === published.quoteRoundId
      )?.preferredQuote
    ).toBeNull();
  });

  test("treats an old-package Preferred pointer as a stale register projection", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishComparisonRound(fixture);
    const otherRound = await publishComparisonRound(fixture);
    const candidate = await submitComparisonCandidate(
      fixture,
      published.invitations[0]!,
      {
        labourCents: 90_000_00,
        materialCents: 40_000_00,
        tokenSuffix: "register-stale-package-preferred",
      }
    );
    await fixture.builder.mutation(
      (api as any).quote_comparisons.setPreferredQuoteSubmissionRevision,
      {
        buildId: fixture.buildId,
        expectedStateVersion: 0,
        quoteRoundId: published.quoteRoundId,
        reason: "Select before simulating a stale package pointer.",
        submissionRevisionId: candidate.submissionRevisionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.base.run(async (ctx) => {
      const state = await ctx.db
        .query("quoteRoundPreferredSubmissionStates")
        .withIndex("by_quoteRoundId", (query) =>
          query.eq("quoteRoundId", published.quoteRoundId)
        )
        .unique();
      if (!state) {
        throw new Error("Expected Preferred Quote state.");
      }
      await ctx.db.patch(state._id, {
        quotePackageRevisionId:
          otherRound.invitations[0]!.quotePackageRevisionId,
        updatedAt: Date.now(),
      });
    });

    const result = await register(fixture);
    expect(
      result.rounds.find(
        (row: { _id: string }) => row._id === published.quoteRoundId
      )?.preferredQuote
    ).toBeNull();
  });

  test("projects independent recipient, delivery, participation, access, response, deadline, and attention facts", async () => {
    const fixture = await openedSubmissionFixture();
    await saveCompleteSubmissionDraft(fixture);
    const credential = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", fixture.invitation._id)
            .eq("state", "active")
        )
        .unique()
    );
    if (!credential) {
      throw new Error("Expected the initial Quote Invitation credential.");
    }
    await fixture.base.run(async (ctx) => {
      const intent = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .unique();
      if (!intent) {
        throw new Error("Expected the initial Quote Invitation communication intent.");
      }
      const now = Date.now();
      const emailMessageId = await ctx.db.insert("emailMessages", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        communicationIntentId: intent._id,
        createdAt: now,
        idempotencyKey: intent.idempotencyKey,
        organizationId: ORGANIZATION_ID,
        recipientEmail: intent.recipientEmailSnapshot,
        relatedEntityId: intent.relatedEntityId,
        relatedEntityType: intent.relatedEntityType,
        resendEmailId: "projection-provider-email",
        sender: "DrawFlow <notifications@updates.fairlend.ca>",
        status: "failed",
        subject: "Quote requested",
        updatedAt: now,
        lastError: "Provider rejected this delivery.",
      });
      await ctx.db.patch(intent._id, {
        actionRequiredReason: "Provider rejected this delivery.",
        lastError: "Provider rejected this delivery.",
        status: "action_required",
        updatedAt: now,
      });
      await ctx.db.patch(credential._id, {
        state: "expired",
        deliveryEmailMessageId: emailMessageId,
        updatedAt: now,
      });
    });

    const result = await register(fixture);
    const row = result.rounds.find(
      (candidate: { _id: string }) => candidate._id === fixture.invitation.quoteRoundId
    );
    expect(row).toMatchObject({
      access: { active: 0, expired: 1, total: 1 },
      attention: {
        rank: 1,
        reason: "delivery_failure",
      },
      delivery: {
        delivered: 0,
        failed: 1,
        pending: 0,
        status: "failed",
        total: 1,
        undispatched: 0,
      },
      invitationCount: 1,
      mode: "combined",
      participation: { active: 1, revoked: 0, total: 1 },
      preferredQuote: null,
      recipients: { active: 1, revoked: 0, total: 1 },
      recipientDelivery: [
        expect.objectContaining({
          actionRequired: true,
          invitationId: fixture.invitation._id,
          latestStatus: "action_required",
          recoveryState: "action_required",
          reminderEligible: true,
        }),
      ],
      responses: { drafting: 1, submitted: 0, total: 1 },
      scope: "Frame exterior walls · Framing lumber",
      state: "open",
    });
    expect(row.responseDeadline).toBeGreaterThan(Date.now());
    expect(row.lastActivityAt).toEqual(expect.any(Number));
    expect(row.recipientDelivery[0]?.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: "Delivery attempt failed.",
          kind: "quote_invitation_initial",
          status: "action_required",
        }),
      ])
    );
    expect(JSON.stringify(row.recipientDelivery)).not.toContain(
      "Provider rejected this delivery."
    );
  });

  test("supports deterministic scope search and mode filtering without changing round identity", async () => {
    const fixture = await seedQuoteFixture();
    const labour = await publishRegisterRound(fixture, "labour", "register-labour-001");
    const material = await publishRegisterRound(
      fixture,
      "material",
      "register-material-001"
    );
    const combined = await publishRegisterRound(
      fixture,
      "combined",
      "register-combined-001"
    );

    const allFirst = await register(fixture);
    const allSecond = await register(fixture);
    expect(allSecond.rounds.map((row: { _id: string }) => row._id)).toEqual(
      allFirst.rounds.map((row: { _id: string }) => row._id)
    );
    expect(allFirst.rounds).toHaveLength(3);

    const labourOnly = await register(fixture, fixture.builder, { mode: "labour" });
    expect(labourOnly.rounds).toHaveLength(1);
    expect(labourOnly.rounds[0]).toMatchObject({
      _id: labour.quoteRoundId,
      mode: "labour",
    });

    const materialSearch = await register(fixture, fixture.builder, {
      search: "MATERIAL",
    });
    expect(materialSearch.rounds).toHaveLength(1);
    expect(materialSearch.rounds[0]).toMatchObject({
      _id: material.quoteRoundId,
      mode: "material",
    });
    expect(
      allFirst.rounds.map((row: { _id: string }) => row._id)
    ).toEqual(
      expect.arrayContaining([
        labour.quoteRoundId,
        material.quoteRoundId,
        combined.quoteRoundId,
      ])
    );
  });

  test("resolves draft labour scope labels from canonical Build Sub-milestones", async () => {
    const fixture = await seedQuoteFixture();
    const draft = await configureRound(fixture, "labour");

    const result = await register(fixture);
    const row = result.rounds.find(
      (candidate: { _id: string }) => candidate._id === draft.quoteRoundId
    );
    expect(row).toMatchObject({
      scope: "Frame exterior walls",
      state: "draft",
    });
  });

  test("does not advertise or resolve Scope updates for terminal register rows", async () => {
    const fixture = await seedQuoteFixture();
    const published = await publishRegisterRound(
      fixture,
      "labour",
      "register-terminal-scope-001"
    );
    const beforeClose = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: published.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.closeQuoteRound,
      {
        buildId: fixture.buildId,
        confirmed: true,
        expectedRevision: beforeClose.revision,
        quoteRoundId: published.quoteRoundId,
        reason: "Close before terminal register projection coverage.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    // Remove the canonical Scope contract after publication. A terminal
    // register row still has its immutable Package snapshot and must not try
    // to resolve live Scope merely to calculate an action badge.
    await fixture.base.run((ctx) =>
      ctx.db.delete(fixture.scopeContractId)
    );

    const result = await register(fixture);
    expect(result.rounds).toEqual([
      expect.objectContaining({
        _id: published.quoteRoundId,
        scopeUpdateAvailable: false,
        state: "closed",
      }),
    ]);
  });

  test("classifies fully and partially undispatched recipients without losing dispatched facts", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour", {
      recipientProfileIds: [
        fixture.recipientId,
        fixture.contractorOnlyRecipientId,
      ],
    });
    await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "register-undispatched-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const invitations = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (query) =>
          query
            .eq("quoteRoundId", created.quoteRoundId)
            .eq("participationState", "active")
        )
        .collect()
    );
    expect(invitations).toHaveLength(2);
    const credentials = await fixture.base.run(async (ctx) =>
      await Promise.all(
        invitations.map(async (invitation) =>
          await ctx.db
            .query("quoteInvitationAccessCredentials")
            .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
              query
                .eq("quoteRoundInvitationId", invitation._id)
                .eq("state", "active")
            )
            .unique()
        )
      )
    );
    expect(credentials.every(Boolean)).toBe(true);
    await fixture.base.run(async (ctx) => {
      const first = credentials[0];
      if (!first) throw new Error("Expected first active credential.");
      await ctx.db.patch(first._id, { deliveryEmailMessageId: undefined });
      const second = credentials[1];
      if (!second) {
        throw new Error("Expected second active credential.");
      }
      const intent = await ctx.db
        .query("communicationIntents")
        .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
          query.eq("quoteRoundInvitationId", second.quoteRoundInvitationId)
        )
        .unique();
      if (!intent) {
        throw new Error("Expected second communication intent.");
      }
      const now = Date.now();
      const emailMessageId = await ctx.db.insert("emailMessages", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        communicationIntentId: intent._id,
        createdAt: now,
        idempotencyKey: intent.idempotencyKey,
        organizationId: ORGANIZATION_ID,
        recipientEmail: intent.recipientEmailSnapshot,
        relatedEntityId: intent.relatedEntityId,
        relatedEntityType: intent.relatedEntityType,
        resendEmailId: `projection-provider-${String(second._id)}`,
        sender: "DrawFlow <notifications@updates.fairlend.ca>",
        status: "delivered",
        subject: "Quote requested",
        updatedAt: now,
      });
      await ctx.db.patch(second._id, {
        deliveryEmailMessageId: emailMessageId,
        updatedAt: now,
      });
      await ctx.db.patch(intent._id, {
        providerEmailMessageId: emailMessageId,
        status: "delivered",
        updatedAt: now,
      });
      await ctx.db.patch(emailMessageId, {
        status: "delivered",
      });
    });

    const result = await register(fixture);
    const row = result.rounds.find(
      (candidate: { _id: string }) => candidate._id === created.quoteRoundId
    );
    expect(row?.delivery).toMatchObject({
      delivered: 1,
      failed: 0,
      pending: 0,
      status: "partially_dispatched",
      total: 2,
      undispatched: 1,
    });
    await fixture.base.run(async (ctx) => {
      const second = credentials[1];
      if (!second) throw new Error("Expected second active credential.");
      await ctx.db.patch(second._id, { deliveryEmailMessageId: undefined });
    });
    const fullyUndispatched = await register(fixture);
    const fullyUndispatchedRow = fullyUndispatched.rounds.find(
      (candidate: { _id: string }) => candidate._id === created.quoteRoundId
    );
    expect(fullyUndispatchedRow?.delivery).toMatchObject({
      delivered: 0,
      status: "not_dispatched",
      total: 2,
      undispatched: 2,
    });
  });

  test("retains newest notice and credential history without rejecting older overflow", async () => {
    const fixture = await openedSubmissionFixture();
    const now = Date.now();
    await fixture.base.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert("quoteRoundRecipientNoticeIntents", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          kind: "access_reminder",
          organizationId: ORGANIZATION_ID,
          quotePackageRevisionId: fixture.invitation.quotePackageRevisionId,
          quoteRoundId: fixture.invitation.quoteRoundId,
          quoteRoundInvitationId: fixture.invitation._id,
          reason: `Recent reminder ${index}`,
          status: "pending",
        });
      }
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert("quoteInvitationAccessCredentials", {
          accessExpiresAt: now + 90 * 24 * 60 * 60 * 1000,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          credentialVerifier: `${"b".repeat(60)}${index
            .toString(16)
            .padStart(4, "0")}`,
          credentialVersion: index + 2,
          createdAt: now + index,
          organizationId: ORGANIZATION_ID,
          purpose: "rotation",
          quoteRoundId: fixture.invitation.quoteRoundId,
          quoteRoundInvitationId: fixture.invitation._id,
          state: "rotated",
          updatedAt: now + index,
        });
      }
    });

    const result = await register(fixture);
    const row = result.rounds.find(
      (candidate: { _id: string }) =>
        candidate._id === fixture.invitation.quoteRoundId
    );
    expect(row).toMatchObject({
      access: { rotated: 50, total: 50 },
      delivery: { status: "not_dispatched" },
    });
    expect(row?.lastActivityAt).toBeGreaterThanOrEqual(now + 500);
  });

  test("allows read-only Build roles to see the same register while preserving authoring boundaries", async () => {
    const fixture = await openedSubmissionFixture();
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        displayNameSnapshot: "Homeowner Viewer",
        emailSnapshot: "homeowner@example.com",
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "homeowner",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_homeowner",
      });
    });
    const builderStaff = withIdentity(
      fixture.base,
      ["builder-staff"],
      "user_builder"
    );
    const homeowner = withIdentity(
      fixture.base,
      ["member"],
      "user_homeowner"
    );
    const backoffice = withIdentity(fixture.base, ["admin"], "user_admin");
    const builderRows = await register(fixture);
    const staffRows = await register(fixture, builderStaff);
    const homeownerRows = await register(fixture, homeowner);
    const backofficeRows = await register(fixture, backoffice);

    expect(staffRows).toEqual(builderRows);
    expect(homeownerRows).toEqual(builderRows);
    expect(backofficeRows).toEqual(builderRows);

    const builderRecipientSearch = await register(fixture, fixture.builder, {
      search: "quote-recipient@example.com",
    });
    const staffRecipientSearch = await register(fixture, builderStaff, {
      search: "quote-recipient@example.com",
    });
    const backofficeRecipientSearch = await register(fixture, backoffice, {
      search: "quote-recipient@example.com",
    });
    const homeownerRecipientSearch = await register(fixture, homeowner, {
      search: "quote-recipient@example.com",
    });
    expect(builderRecipientSearch.rounds).toHaveLength(1);
    expect(staffRecipientSearch.rounds).toHaveLength(1);
    expect(backofficeRecipientSearch.rounds).toHaveLength(1);
    expect(homeownerRecipientSearch.rounds).toHaveLength(0);

    await expect(
      homeowner.mutation((api as any).quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Homeowner cannot author",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Builder, Builder Staff, Admin, or Principle Broker/);
  });
});
