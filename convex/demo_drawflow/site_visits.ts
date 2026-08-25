import { v } from "convex/values";
import {
  defaultSiteVisitGuidance,
  guidanceToItems,
} from "../demo_site_visit_guidance";
import {
  createSiteVisitRecoveryReference,
  generateSiteVisitToken,
  hashSiteVisitToken,
  resolveSiteVisitGeofenceAttempt,
  validateIncludedSiteVisitMilestones,
  validateSiteVisitReplacementRequest,
  validateSiteVisitReportSubmission,
  validateSiteVisitSubmissionContext,
} from "../demo_site_visit_tokens";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";
import {
  siteVisitLocationAttemptValidator,
  siteVisitPrerequisiteExceptionValidator,
  type Scenario,
} from "./data";
import {
  appendAudit,
  appendOutbox,
  decorateSiteVisitTargetsWithGuidance,
  findMilestone,
  getDemoSiteVisitPermit,
  getMilestoneSubmilestoneNames,
  getMilestones,
  getSiteVisitFiles,
  getSiteVisitForToken,
  getSiteVisitTargets,
  latestSiteVisit,
  requireActiveSiteVisitForToken,
} from "./access";

export const demo_requestSiteVisit = publicMutation
  .use(withMutationTiming("demo_drawflow.requestSiteVisit"))
  .input({
    includedMilestoneKeys: v.optional(v.array(v.string())),
    milestoneKey: v.string(),
    persona: v.string(),
    reason: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can request site visits.");
    }
    const build = await ctx.db.get(milestone.buildId);
    if (!build) {
      throw new Error("Build not found");
    }
    const milestones = await getMilestones(ctx, "active");
    const milestoneByKey = new Map(
      milestones.map((candidate) => [candidate.key, candidate])
    );
    const includedMilestoneKeys = validateIncludedSiteVisitMilestones({
      includedMilestoneKeys: args.includedMilestoneKeys?.length
        ? args.includedMilestoneKeys
        : [milestone.key],
      milestoneOrder: milestones.map((candidate) => candidate.key),
      selectedMilestoneKey: milestone.key,
    });
    const token = generateSiteVisitToken();
    const tokenHash = await hashSiteVisitToken(token);
    const createdAt = Date.now();
    const workOrderId = `DEMO-WO-${milestone.key}-${createdAt}`;
    const evidencePackageId = `DEMO-EP-${String(milestone.buildId)}-${milestone.key}`;
    const visitId = await ctx.db.insert("demo_siteVisits", {
      assignedPersona: "site_visitor",
      buildId: milestone.buildId,
      createdAt,
      evidencePackageId,
      organizationScopeKey: "demo:active",
      scopeBoundAt: createdAt,
      workOrderId,
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      requestReason: args.reason,
      requestedByPersona: args.persona,
      scenario: "active",
      status: "requested",
      tokenExpiresAt: createdAt + 60 * 60 * 1000,
      tokenHash,
    });
    for (const milestoneKey of includedMilestoneKeys) {
      const targetMilestone = milestoneByKey.get(milestoneKey);
      if (!targetMilestone) {
        continue;
      }
      const submilestones = await getMilestoneSubmilestoneNames(
        ctx,
        targetMilestone.buildId,
        targetMilestone.key
      );
      const targetId = await ctx.db.insert("demo_siteVisitTargets", {
        buildId: targetMilestone.buildId,
        createdAt,
        milestoneId: targetMilestone._id,
        milestoneKey: targetMilestone.key,
        milestoneName: targetMilestone.name,
        milestoneOrder: targetMilestone.order,
        scenario: "active",
        siteVisitId: visitId,
        submilestones,
      });
      const guidance = defaultSiteVisitGuidance(
        targetMilestone.key,
        targetMilestone.name,
        submilestones
      );
      for (const item of guidanceToItems(guidance)) {
        await ctx.db.insert("demo_siteVisitTargetGuidanceItems", {
          buildId: targetMilestone.buildId,
          createdAt,
          kind: item.kind,
          milestoneKey: targetMilestone.key,
          milestoneName: targetMilestone.name,
          order: item.order ?? 0,
          scenario: "active",
          siteVisitId: visitId,
          siteVisitTargetId: targetId,
          sourceKind: "active_demo_default",
          sourceKey: targetMilestone.key,
          text: item.text,
        });
      }
      await ctx.db.patch(targetMilestone._id, {
        status: "site_visit_requested",
        updatedAt: createdAt,
      });
    }
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_requestSiteVisit",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "SiteVisitRequested",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
      validation: JSON.stringify({ includedMilestoneKeys }),
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.siteVisit.requested",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} site visit requested for ${includedMilestoneKeys.length} milestone(s).`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return {
      evidencePackageId,
      organizationScopeKey: "demo:active",
      workOrderId,
      token,
      tokenExpiresAt: createdAt + 60 * 60 * 1000,
      url: `/newsitevisit/${build.key}/${token}`,
      visitId,
    };
  })
  .public();
export const demo_getSiteVisitByToken = publicQuery
  .use(withQueryTiming("demo_drawflow.getSiteVisitByToken"))
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    // TODO: Require WorkOS-authenticated site visitor/admin access in addition to token possession.
    const state = await getSiteVisitForToken(ctx, args.buildId, args.token);
    if (state.state !== "active" || !(state.build && state.visit)) {
      const targets = state.visit
        ? (await getSiteVisitTargets(ctx, state.visit._id)).sort(
            (a, b) => a.milestoneOrder - b.milestoneOrder
          )
        : [];
      const targetsWithGuidance = state.visit
        ? await decorateSiteVisitTargetsWithGuidance(
            ctx,
            targets,
            state.visit._id
          )
        : targets;
      const files = state.visit
        ? await getSiteVisitFiles(ctx, state.visit._id)
        : [];
      const permit = state.visit
        ? await getDemoSiteVisitPermit(ctx, state.build)
        : null;
      return {
        available: false,
        build: state.build,
        files,
        permit,
        reason: state.reason,
        status:
          state.reason === "expired"
            ? "expired"
            : state.reason === "consumed"
              ? "completed"
              : "invalid",
        targets: targetsWithGuidance,
        visit: state.visit,
      };
    }

    const targets = (await getSiteVisitTargets(ctx, state.visit._id)).sort(
      (a, b) => a.milestoneOrder - b.milestoneOrder
    );
    const files = await getSiteVisitFiles(ctx, state.visit._id);
    const permit = await getDemoSiteVisitPermit(ctx, state.build);
    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      }))
    );
    const targetsWithGuidance = await decorateSiteVisitTargetsWithGuidance(
      ctx,
      targets,
      state.visit._id
    );

    return {
      available: true,
      build: state.build,
      files: filesWithUrls,
      permit,
      targets: targetsWithGuidance,
      visit: state.visit,
    };
  })
  .public();

export const demo_requestSiteVisitReplacementLink = publicMutation
  .use(withMutationTiming("demo_drawflow.requestSiteVisitReplacementLink"))
  .input({ buildId: v.string(), reason: v.string(), token: v.string() })
  .returns(v.object({ reference: v.string(), requested: v.literal(true) }))
  .handler(async (ctx, args) => {
    const state = await getSiteVisitForToken(ctx, args.buildId, args.token);
    const tokenState =
      state.reason === "consumed"
        ? ("consumed" as const)
        : state.reason === "expired"
          ? ("expired" as const)
          : ("active" as const);
    const request = validateSiteVisitReplacementRequest({
      reason: args.reason,
      tokenState,
    });
    if (!(state.build && state.visit)) {
      throw new Error("Site visit recovery is unavailable for this link.");
    }

    const requestedAt = Date.now();
    const reference = createSiteVisitRecoveryReference(crypto.randomUUID());
    await ctx.db.insert("siteVisitLinkRecoveryRequests", {
      buildId: String(state.build._id),
      originalVisitId: String(state.visit._id),
      reason: request.reason,
      reference,
      requestedAt,
      source: "demo",
      status: "pending",
      tokenState: request.tokenState,
    });
    await appendAudit(ctx, {
      actorPersona: "site_visitor",
      buildId: state.build._id,
      command: "demo_requestSiteVisitReplacementLink",
      entityKey: state.visit.milestoneKey,
      entityType: "site_visit",
      eventType: "SiteVisitReplacementLinkRequested",
      milestoneKey: state.visit.milestoneKey,
      reason: request.reason,
      scenario: state.visit.scenario as Scenario,
      validation: JSON.stringify({ reference, tokenState: request.tokenState }),
    });
    await appendOutbox(ctx, {
      buildId: state.build._id,
      eventType: "demo.siteVisit.replacementLinkRequested",
      milestoneKey: state.visit.milestoneKey,
      payloadPreview: `Replacement site-visit link requested (${reference}).`,
      relatedEntity: state.visit.milestoneKey,
      scenario: state.visit.scenario as Scenario,
    });
    return { reference, requested: true as const };
  })
  .public();

export const demo_generateSiteVisitUploadUrl = publicMutation
  .use(withMutationTiming("demo_drawflow.generateSiteVisitUploadUrl"))
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.string())
  .handler(async (ctx, args) => {
    // TODO: Require WorkOS-authenticated site visitor/admin access in addition to token possession.
    await requireActiveSiteVisitForToken(ctx, args.buildId, args.token);
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const demo_markSiteVisitTokenOpened = publicMutation
  .use(withMutationTiming("demo_drawflow.markSiteVisitTokenOpened"))
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    // TODO: Require WorkOS-authenticated site visitor/admin access in addition to token possession.
    const { visit } = await requireActiveSiteVisitForToken(
      ctx,
      args.buildId,
      args.token
    );
    if (visit.status !== "requested") {
      return { ok: true, status: visit.status };
    }

    const claimedAt = Date.now();
    await ctx.db.patch(visit._id, {
      claimedAt,
      status: "claimed",
    });
    await appendAudit(ctx, {
      actorPersona: "site_visitor",
      buildId: visit.buildId,
      command: "demo_markSiteVisitTokenOpened",
      entityKey: visit.milestoneKey,
      entityType: "site_visit",
      eventType: "SiteVisitOpened",
      milestoneKey: visit.milestoneKey,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: visit.buildId,
      eventType: "demo.siteVisit.opened",
      milestoneKey: visit.milestoneKey,
      payloadPreview: `${visit.milestoneKey} site visit token opened.`,
      relatedEntity: visit.milestoneKey,
      scenario: "active",
    });

    return { ok: true, status: "claimed" };
  })
  .public();

export const demo_registerSiteVisitFile = publicMutation
  .use(withMutationTiming("demo_drawflow.registerSiteVisitFile"))
  .input({
    buildId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.id("_storage"),
    targetMilestoneKey: v.optional(v.string()),
    targetSubmilestoneKey: v.optional(v.string()),
    token: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { visit } = await requireActiveSiteVisitForToken(
      ctx,
      args.buildId,
      args.token
    );
    if (args.targetMilestoneKey) {
      const targets = await getSiteVisitTargets(ctx, visit._id);
      if (
        !targets.some(
          (target) => target.milestoneKey === args.targetMilestoneKey
        )
      ) {
        throw new Error("File target milestone is not included in this visit.");
      }
    }

    const fileId = await ctx.db.insert("demo_siteVisitFiles", {
      buildId: visit.buildId,
      fileName: args.fileName,
      mimeType: args.mimeType || "application/octet-stream",
      scenario: visit.scenario,
      siteVisitId: visit._id,
      sizeBytes: args.sizeBytes,
      storageId: args.storageId,
      targetMilestoneKey: args.targetMilestoneKey,
      targetSubmilestoneKey: args.targetSubmilestoneKey,
      uploadedAt: Date.now(),
    });

    return { fileId };
  })
  .public();

export const demo_submitTokenizedSiteVisitReport = publicMutation
  .use(withMutationTiming("demo_drawflow.submitTokenizedSiteVisitReport"))
  .input({
    buildId: v.string(),
    completionObserved: v.boolean(),
    locationAttempt: siteVisitLocationAttemptValidator,
    missingPrerequisites: v.array(
      v.union(v.literal("permit"), v.literal("site_plan"))
    ),
    prerequisiteException: v.optional(siteVisitPrerequisiteExceptionValidator),
    recommendedOutcome: v.string(),
    reportNotes: v.string(),
    token: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { build, visit } = await requireActiveSiteVisitForToken(
      ctx,
      args.buildId,
      args.token
    );
    const permit = await getDemoSiteVisitPermit(ctx, build);
    const submissionContext = validateSiteVisitSubmissionContext({
      locationAttempt: resolveSiteVisitGeofenceAttempt({
        locationAttempt: args.locationAttempt,
        siteLatitude: build.locationLatitude,
        siteLongitude: build.locationLongitude,
      }),
      missingPrerequisites: [
        ...args.missingPrerequisites,
        ...(permit ? [] : (["permit"] as const)),
      ],
      prerequisiteException: args.prerequisiteException,
    });
    const files = await getSiteVisitFiles(ctx, visit._id);
    const validatedReport = validateSiteVisitReportSubmission({
      compressedPackageBytes: files.reduce(
        (sum, file) => sum + file.sizeBytes,
        0
      ),
      reportNotes: args.reportNotes,
      uploadedEvidenceCount: files.length,
    });
    const notes = validatedReport.reportNotes;
    const completedAt = Date.now();
    const targets = await getSiteVisitTargets(ctx, visit._id);
    const riskFlags = [
      ...(args.completionObserved ? [] : ["completion_not_observed"]),
      ...(submissionContext.locationAttempt.verified
        ? []
        : ["site_visit_location_unverified"]),
    ];

    await ctx.db.patch(visit._id, {
      claimedAt: visit.claimedAt ?? completedAt,
      completedAt,
      completionObserved: args.completionObserved,
      locationAttempt: submissionContext.locationAttempt,
      missingPrerequisites: submissionContext.missingPrerequisites,
      notes,
      notesFormat: "html",
      prerequisiteException: submissionContext.prerequisiteException,
      recommendedOutcome: args.recommendedOutcome,
      riskFlags,
      status: "completed",
      tokenConsumedAt: completedAt,
    });

    for (const target of targets) {
      await ctx.db.patch(target.milestoneId, {
        status: "site_visit_complete",
        updatedAt: completedAt,
      });
    }

    await appendAudit(ctx, {
      actorPersona: "site_visitor",
      afterSummary: `${targets.length} milestone(s) inspected`,
      buildId: visit.buildId,
      command: "demo_submitTokenizedSiteVisitReport",
      entityKey: visit.milestoneKey,
      entityType: "site_visit",
      eventType: "SiteVisitReportSubmitted",
      milestoneKey: visit.milestoneKey,
      reason: validatedReport.reportNotesText,
      scenario: "active",
      validation: JSON.stringify({
        locationAttempt: submissionContext.locationAttempt,
        missingPrerequisites: submissionContext.missingPrerequisites,
        prerequisiteException: submissionContext.prerequisiteException,
        targetMilestoneKeys: targets.map((target) => target.milestoneKey),
      }),
    });
    await appendOutbox(ctx, {
      buildId: visit.buildId,
      eventType: "demo.siteVisit.reportSubmitted",
      milestoneKey: visit.milestoneKey,
      payloadPreview: `Site visit report submitted for ${targets.length} milestone(s).`,
      relatedEntity: visit.milestoneKey,
      scenario: "active",
    });

    return { ok: true };
  })
  .public();

export const demo_claimSiteVisit = publicMutation
  .use(withMutationTiming("demo_drawflow.claimSiteVisit"))
  .input({ milestoneKey: v.string(), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const visit = await latestSiteVisit(ctx, "active", args.milestoneKey);
    if (!visit) {
      throw new Error("No site visit requested.");
    }
    if (args.persona !== "site_visitor") {
      throw new Error("Only Site Visitor can claim visits.");
    }
    await ctx.db.patch(visit._id, {
      claimedAt: Date.now(),
      status: "claimed",
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: visit.buildId,
      command: "demo_claimSiteVisit",
      entityKey: visit.milestoneKey,
      entityType: "site_visit",
      eventType: "SiteVisitClaimed",
      milestoneKey: visit.milestoneKey,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_submitSiteVisitReport = publicMutation
  .use(withMutationTiming("demo_drawflow.submitSiteVisitReport"))
  .input({
    completionObserved: v.boolean(),
    milestoneKey: v.string(),
    notes: v.string(),
    persona: v.string(),
    recommendedOutcome: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const visit = await latestSiteVisit(ctx, "active", args.milestoneKey);
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!(visit && milestone)) {
      throw new Error("Site visit or milestone not found.");
    }
    if (args.persona !== "site_visitor") {
      throw new Error("Only Site Visitor can submit reports.");
    }
    await ctx.db.patch(visit._id, {
      completedAt: Date.now(),
      completionObserved: args.completionObserved,
      notes: args.notes,
      recommendedOutcome: args.recommendedOutcome,
      riskFlags: args.completionObserved ? [] : ["completion_not_observed"],
      status: "completed",
    });
    await ctx.db.patch(milestone._id, {
      status: "site_visit_complete",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_submitSiteVisitReport",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "site_visit",
      eventType: "SiteVisitReportSubmitted",
      milestoneKey: milestone.key,
      reason: args.notes,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.siteVisit.reportSubmitted",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} site visit report submitted.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();
