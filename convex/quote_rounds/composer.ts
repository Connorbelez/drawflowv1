import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "../build_operational_idempotency";
import { assertOrganizationRetentionWritable } from "../data_retention";
import { assertQuoteAuthoringRole } from "../quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
} from "../quote_invitation_access";
import {
  quoteInvitationCommunicationProjection,
  quoteInvitationCommunicationProjectionValidator,
} from "../quote_notifications";
import {
  getPreferredState,
  preferredPointerFromState,
} from "../quote_preferred";
import { resolveEffectiveScopeRevisionForBuildSubmilestone } from "../submilestone_scope_contracts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  MAX_DRAFT_LABOUR_LINES,
  MAX_DRAFT_MATERIAL_LINES,
  MAX_DRAFT_RECIPIENTS,
  MAX_REGISTER_INVITATIONS,
  MAX_REGISTER_ACTIVE_INVITATIONS,
  MAX_REGISTER_CREDENTIALS_PER_INVITATION,
  MAX_REGISTER_NOTICES_PER_ROUND,
  MAX_MATERIAL_ASSIGNMENTS_PER_ROW,
  MAX_TOTAL_MATERIAL_ASSIGNMENTS,
  MAX_DISTINCT_MATERIAL_SUBMILESTONES,
  MAX_INHERITED_ATTACHMENTS,
  MAX_INHERITED_LINKS_SCANNED,
  MAX_CURRENT_PERMIT_CANDIDATES,
  MAX_PACKAGE_REVISION_HISTORY,
  MAX_TIPTAP_JSON_LENGTH,
  MATERIAL_ROW_KEY_PATTERN,
  quoteRoundModeValidator,
  quoteRoundStateValidator,
  quoteRoundAttentionReasonValidator,
  quoteRoundAttentionToneValidator,
  quoteRoundDeliveryStatusValidator,
  quoteRoundMaterialSourceValidator,
  quoteRecipientCapabilityValidator,
  quoteResponseTemplateAudienceValidator,
  quoteResponseTemplateFieldKindValidator,
  quoteResponseTemplateFieldScopeValidator,
  quoteResponseTemplateFieldRendererValidator,
  quoteResponseTemplateFieldValidationValidator,
  quoteResponseTemplateTaxValidator,
  materialDraftRowInputValidator,
  quoteTemplateFieldProjectionValidator,
  quoteTemplateVersionProjectionValidator,
  labourSourceProjectionValidator,
  materialSourceProjectionValidator,
  quoteRecipientProjectionValidator,
  composerProjectionValidator,
  draftMaterialRowProjectionValidator,
  quoteRoundDraftProjectionValidator,
  packageAttachmentProjectionValidator,
  packageLabourLineProjectionValidator,
  packageMaterialAssignmentProjectionValidator,
  packageMaterialLineProjectionValidator,
  packageResponseFieldProjectionValidator,
  quotePackageRevisionProjectionValidator,
  quoteInvitationProjectionValidator,
  quoteRoundProjectionValidator,
  quoteRoundSummaryValidator,
  quoteRoundListValidator,
  quoteRoundScopePinTransitionValidator,
  quoteRoundDraftMutationResultValidator,
  quoteRoundScopeRefreshMutationResultValidator,
  quoteRoundPublicationResultValidator,
  QuoteRoundCtx,
  DraftMaterialRowInput,
  NormalizedAdHocMaterialRow,
  DraftState,
  EffectiveQuoteScope,
  QuoteRoundScopePinTransition,
  QuoteScopeCache,
} from "./contracts";


import {
  requiredText,
  optionalText,
  requiredFiniteNumber,
  requiredInteger,
  requiredNonNegativeInteger,
  normalizeTiptapJson,
  assertAuthoringRole,
  assertReadRole,
  canSearchQuoteRecipientIdentities,
  authorizeQuoteRoundPath,
  authorizeQuoteRoundReadPath,
  requireRoundScope,
  requireDraftState,
  assertExpectedRevision,
  requireModeScope,
  capabilityRequirement,
  profileCapabilities,
  mapUrlForBuild,
  rowKey,
  normalizedAdHocMaterialRow,
  requireBuildCostItemSourceId,
  assertAdHocSourceInput,
  readDraftState,
  requireBuildSubmilestone,
  quoteScopeLineageInput,
  quoteScopeFromEffectiveRevision,
  quoteScopeForBuildSubmilestone,
  quoteScopeForBuildSubmilestoneCached,
  requireEffectiveQuoteScope,
  draftScopePinMatches,
  packageScopePinMatches,
  validateLabourSubmilestoneIds,
  validateMaterialAssignments,
  assertAggregateMaterialAssignments,
  assertDistinctMaterialSubmilestones,
} from "./access";
import {
  requireBuildCostItem,
  materialFieldsFromSource,
  validateDraftMaterialRows,
  validateRecipients,
} from "./draft_validation";
import {
  requirePublishedTemplateVersion,
  requireGovernedBuildDocument,
  governedAssetContentHash,
  resolveCurrentPermitDocument,
  currentPermitDocument,
  draftScopeUpdateAvailable,
  packageScopeUpdateAvailable,
} from "./publication_validation";
import {
  draftProjection,
  packageRevisionProjection,
  quoteRoundProjection,
} from "./projections";
import {
  preparePublication,
  replayQuoteRoundPublication,
  publishedTemplateProjection,
} from "./publication";

export const getQuoteRoundComposer = authenticatedQuery
  .input({ buildId: v.string(), workosOrganizationId: v.string() })
  .returns(v.union(composerProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const authorization = await authorizeQuoteRoundPath(ctx, {
      buildId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const [milestones, submilestones, costItems, profiles, templates] =
      await Promise.all([
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build_order", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("buildSubmilestones")
          .withIndex("by_build", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("buildCostItems")
          .withIndex("by_build", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("contractorProfiles")
          .withIndex("by_brokerage", (query) =>
            query.eq("brokerageId", authorization.brokerage._id)
          )
          .take(MAX_DRAFT_RECIPIENTS + 1),
        ctx.db
          .query("quoteResponseTemplates")
          .withIndex("by_organization_status", (query) =>
            query
              .eq("organizationId", authorization.organizationId)
              .eq("status", "active")
          )
          .take(101),
      ]);
    if (
      milestones.length > 500 ||
      submilestones.length > 500 ||
      costItems.length > 500 ||
      profiles.length > MAX_DRAFT_RECIPIENTS ||
      templates.length > 100
    ) {
      throw new ConvexError(
        "Quote Round composer source exceeds supported limits."
      );
    }

    const milestoneById = new Map(
      milestones.map((milestone) => [milestone._id, milestone])
    );
    const labourSubmilestoneRows = await Promise.all(
      submilestones
        .filter(
          (submilestone) =>
            submilestone.organizationId === authorization.organizationId &&
            submilestone.brokerageId === authorization.brokerage._id
        )
        .sort(
          (left, right) =>
            left.order - right.order || left.name.localeCompare(right.name)
        )
        .map(async (submilestone) => {
          const milestone = milestoneById.get(submilestone.buildMilestoneId);
          if (
            !milestone ||
            milestone.organizationId !== authorization.organizationId ||
            milestone.brokerageId !== authorization.brokerage._id
          ) {
            throw new ConvexError("Build roadmap source is inconsistent.");
          }
          let effectiveRevision: Awaited<
            ReturnType<typeof resolveEffectiveScopeRevisionForBuildSubmilestone>
          >;
          try {
            effectiveRevision =
              await resolveEffectiveScopeRevisionForBuildSubmilestone(
                ctx,
                quoteScopeLineageInput(authorization, submilestone)
              );
          } catch (error) {
            // A corrupt canonical lineage makes this row unavailable for
            // selection.  Do not turn unrelated database/runtime failures
            // into an apparently empty composer row.
            if (error instanceof ConvexError) {
              return null;
            }
            throw error;
          }
          const scope = quoteScopeFromEffectiveRevision(effectiveRevision);
          if (!scope) {
            return null;
          }
          return {
            _id: submilestone._id,
            budgetCents: submilestone.budgetCents,
            buildMilestoneId: milestone._id,
            durationDays: submilestone.durationDays,
            milestoneKey: milestone.key,
            milestoneName: milestone.name,
            name: submilestone.name,
            order: submilestone.order,
            scopeOfWorkTiptapJson: scope.scopeOfWorkTiptapJson,
            sourceScopeChangeReason: scope.sourceScopeChangeReason,
            sourceScopeRevisionId: scope.sourceScopeRevisionId,
            sourceScopeVersion: scope.sourceScopeVersion,
            startDay: submilestone.startDay,
            submilestoneKey: submilestone.key,
          };
        })
    );
    const labourSubmilestones = labourSubmilestoneRows.filter(
      (submilestone): submilestone is Exclude<typeof submilestone, null> =>
        submilestone !== null
    );
    const materialCostItems = costItems
      .filter(
        (item) =>
          item.itemType === "material" &&
          item.organizationId === authorization.organizationId &&
          item.brokerageId === authorization.brokerage._id &&
          item.proposalId === authorization.proposal._id
      )
      .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
      .map((item) => ({
        _id: item._id,
        deliveryEndDay: item.deliveryEndDay,
        deliveryInstructions: item.deliveryInstructions,
        deliveryLocation: item.deliveryLocation,
        deliveryStartDay: item.deliveryStartDay,
        description: item.description,
        milestoneKey: item.milestoneKey,
        quantity: item.quantity,
        relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
        specificationTiptapJson: item.specificationTiptapJson,
        title: item.title,
        unit: item.unit,
      }));
    const currentPermit = await resolveCurrentPermitDocument(
      ctx,
      authorization
    );
    const responseTemplates: NonNullable<
      Awaited<ReturnType<typeof publishedTemplateProjection>>
    >[] = [];
    for (const template of templates) {
      const versionId = template.selectedVersionId ?? template.currentVersionId;
      if (!versionId) {
        continue;
      }
      const version = await publishedTemplateProjection(
        ctx,
        authorization,
        versionId
      );
      if (version) {
        responseTemplates.push(version);
      }
    }
    return {
      build: {
        _id: authorization.build._id,
        buildName: authorization.build.buildName,
        location: authorization.build.location,
        locationLatitude: authorization.build.locationLatitude,
        locationLongitude: authorization.build.locationLongitude,
        locationPlaceId: authorization.build.locationPlaceId,
        startDate: authorization.build.startDate,
        timelineCurrentDay: authorization.build.timelineCurrentDay,
        timelineRangeMax: authorization.build.timelineRangeMax,
        timelineRangeMin: authorization.build.timelineRangeMin,
      },
      eligibleRecipients: profiles
        .filter(
          (profile) =>
            profile.organizationId === authorization.organizationId &&
            profile.status === "active" &&
            profileCapabilities(profile).length > 0
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((profile) => {
          const email = profile.email?.trim().toLowerCase();
          return email
            ? [
                {
                  _id: profile._id,
                  email,
                  name: profile.name,
                  quoteRecipientCapabilities: profileCapabilities(profile),
                  quoteRecipientProvisioningState:
                    profile.quoteRecipientProvisioningState,
                },
              ]
            : [];
        }),
      labourSubmilestones,
      materialCostItems,
      permit: currentPermit
        ? {
            _id: currentPermit._id,
            fileName: currentPermit.fileName,
            governedAssetId: currentPermit.governedAssetId,
            mimeType: currentPermit.mimeType,
            version: currentPermit.version ?? 1,
          }
        : null,
      responseTemplates,
    };
  })
  .public();

interface QuoteRoundRegisterAttention {
  detail: string;
  label: string;
  rank: number;
  reason:
    | "delivery_failure"
    | "deadline_overdue"
    | "deadline_imminent"
    | "revision_wait"
    | "reminder_eligible"
    | "scheduling_readiness";
  tone: "critical" | "warning" | "neutral";
}

interface QuoteRoundRegisterDelivery {
  delivered: number;
  failed: number;
  pending: number;
  status:
    | "not_dispatched"
    | "partially_dispatched"
    | "pending"
    | "delivered"
    | "failed"
    | "mixed";
  total: number;
  undispatched: number;
}
