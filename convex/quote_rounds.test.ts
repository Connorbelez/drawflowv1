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
