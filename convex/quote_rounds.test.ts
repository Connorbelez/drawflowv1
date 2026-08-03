/// <reference types="vite/client" />

import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationUrl,
  quoteInvitationSecretVerifier,
} from "./quote_invitation_access";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_quote_rounds";

beforeEach(() => {
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
    }));
    expect(persisted.drafts).toHaveLength(0);
    expect(persisted.submissions).toHaveLength(1);
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
    (api as any).production_proposals.dev_seedProductionFoundation,
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
      scopeOfWorkTiptapJson: tiptap("Install engineered wall system exactly."),
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
      scopeOfWorkTiptapJson: tiptap("Install engineered wall system exactly."),
      startDay: 10,
      status: "planned",
      updatedAt: now,
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
      recipientId,
      submilestoneId,
      supporting,
      templateVersionId,
    };
  });
  return { admin, base, builder, ...seeded };
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

describe("Quote Round draft-to-open aggregate", () => {
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
      const messages = await ctx.db
        .query("emailMessages")
        .withIndex("by_organization_and_idempotencyKey", (q) =>
          q.eq("organizationId", ORGANIZATION_ID)
        )
        .collect();
      return {
        attachments,
        credentials,
        fields,
        invitations,
        messages,
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
    expect(persisted.messages).toHaveLength(1);
    expect(persisted.messages[0]).toMatchObject({
      idempotencyKey: `quote-invitation:${persisted.invitations[0]!._id}:access-generation:1:credential:1`,
      organizationId: ORGANIZATION_ID,
      recipientEmail: "quote-recipient@example.com",
      relatedEntityType: "quoteRoundInvitation",
      status: "queued",
    });
    expect(persisted.credentials[0]?.deliveryEmailMessageId).toBe(
      persisted.messages[0]?._id
    );

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.submilestoneId, {
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

    const first = await fixture.base.mutation(
      api.quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken }
    );
    expect(first.status).toBe("available");
    if (first.status !== "available") {
      throw new Error("Expected Quote invitation access.");
    }
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

  test("blocks unclassified documents before any publish writes and excludes non-builder callers", async () => {
    const fixture = await seedQuoteFixture("unclassified");
    await expect(
      fixture.admin.mutation((api as any).quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Admin must not author",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Builder or Builder Staff/);
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
        responseDeadline: Date.now() + 2 * DAY_MS,
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
        responseDeadline: reopenedDeadline,
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
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "quoteRound").eq("entityId", String(quoteRoundId))
        )
        .collect();
      return { acknowledgement, audits, invitations, notices, revisions, round };
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
      return { audits, credentials, invitations, round, sessions };
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
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRoundInvitation")
            .eq("entityId", String(fixture.invitation._id))
        )
        .collect();
      return { audits, credentials, invitation, sessions };
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

  test("Reminder revokes prior access and leaves exactly one active credential and browser session", async () => {
    const fixture = await openedSubmissionFixture();
    const oldSessionToken = fixture.exchanged.sessionToken;
    const reminded = await fixture.builder.mutation(
      (api as any).quote_round_lifecycle.remindQuoteInvitationAccess,
      {
        buildId: fixture.buildId,
        confirmed: true,
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
    expect(oldExchange).toEqual({ status: "unavailable" });
    const oldSessionRead = await fixture.base.query(
      (api as any).quote_response_drafts.getQuoteInvitationResponseDraft,
      {
        presentationNow: Date.now(),
        quoteRoundInvitationId: fixture.invitation._id,
        sessionToken: oldSessionToken,
      }
    );
    expect(oldSessionRead).toEqual({ status: "unavailable" });
    const replacementExchange = await fixture.base.mutation(
      (api as any).quote_invitation_access.exchangeQuoteInvitationAccess,
      { magicToken: "reminder-browser-token" }
    );
    expect(replacementExchange.status).toBe("available");

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
      return { credentials, sessions };
    });
    expect(accessRows.credentials).toHaveLength(1);
    expect(accessRows.credentials[0]?._id).toBe(reminded.credentialId);
    expect(accessRows.sessions).toHaveLength(1);
    expect(accessRows.sessions[0]?.quoteInvitationAccessCredentialId).toBe(
      reminded.credentialId
    );
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

  test("migrates a prior-revision Draft by stable package identities before acknowledgement unlocks writes", async () => {
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
        sourcePackageRevisionResponseFieldId: priorField.sourceFieldId,
        storageId,
      });
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
    ).not.toBe(priorField.sourceFieldId);

    const drafts = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("quoteInvitationResponseDrafts")
        .withIndex(
          "by_quoteRoundInvitationId_and_quotePackageRevisionId",
          (query) => query.eq("quoteRoundInvitationId", fixture.invitation._id)
        )
        .collect()
    );
    expect(drafts).toHaveLength(2);
    expect(
      drafts.some(
        (draft) => draft.quotePackageRevisionId === reopened.packageRevisionId
      )
    ).toBe(true);
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
      await ctx.db.patch(credential._id, {
        state: "expired",
        updatedAt: Date.now(),
      });
      const messages = await ctx.db
        .query("emailMessages")
        .withIndex("by_entity_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "quoteRoundInvitation")
            .eq("relatedEntityId", String(fixture.invitation._id))
        )
        .collect();
      for (const message of messages) {
        await ctx.db.patch(message._id, {
          lastError: "Provider rejected this delivery.",
          status: "failed",
          updatedAt: Date.now(),
        });
      }
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
      responses: { drafting: 1, submitted: 0, total: 1 },
      scope: "Frame exterior walls · Framing lumber",
      state: "open",
    });
    expect(row.responseDeadline).toBeGreaterThan(Date.now());
    expect(row.lastActivityAt).toEqual(expect.any(Number));
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
      if (!second?.deliveryEmailMessageId) {
        throw new Error("Expected second dispatched email.");
      }
      await ctx.db.patch(second.deliveryEmailMessageId, {
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
    ).rejects.toThrow(/Builder or Builder Staff/);
  });
});
