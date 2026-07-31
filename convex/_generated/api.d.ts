/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activeBuildAccess from "../activeBuildAccess.js";
import type * as assistant from "../assistant.js";
import type * as assistantProvider from "../assistantProvider.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as authzTest from "../authzTest.js";
import type * as brokerAssignments from "../brokerAssignments.js";
import type * as brokerageProvisioning from "../brokerageProvisioning.js";
import type * as build_action_item_deadline_migrations from "../build_action_item_deadline_migrations.js";
import type * as build_action_item_deadline_model from "../build_action_item_deadline_model.js";
import type * as build_action_item_details from "../build_action_item_details.js";
import type * as build_action_item_governance from "../build_action_item_governance.js";
import type * as build_action_item_history from "../build_action_item_history.js";
import type * as build_action_item_queue_projection from "../build_action_item_queue_projection.js";
import type * as build_action_item_queues from "../build_action_item_queues.js";
import type * as build_action_item_rbac from "../build_action_item_rbac.js";
import type * as build_action_item_structure from "../build_action_item_structure.js";
import type * as build_action_item_structure_model from "../build_action_item_structure_model.js";
import type * as build_action_item_workflow from "../build_action_item_workflow.js";
import type * as build_action_items from "../build_action_items.js";
import type * as build_collaboration from "../build_collaboration.js";
import type * as build_collaboration_access from "../build_collaboration_access.js";
import type * as build_collaboration_acknowledgements from "../build_collaboration_acknowledgements.js";
import type * as build_collaboration_actor from "../build_collaboration_actor.js";
import type * as build_collaboration_asset_access from "../build_collaboration_asset_access.js";
import type * as build_collaboration_content from "../build_collaboration_content.js";
import type * as build_collaboration_contracts from "../build_collaboration_contracts.js";
import type * as build_collaboration_drafts from "../build_collaboration_drafts.js";
import type * as build_collaboration_editing from "../build_collaboration_editing.js";
import type * as build_collaboration_focus from "../build_collaboration_focus.js";
import type * as build_collaboration_human from "../build_collaboration_human.js";
import type * as build_collaboration_inbox from "../build_collaboration_inbox.js";
import type * as build_collaboration_migrations from "../build_collaboration_migrations.js";
import type * as build_collaboration_model from "../build_collaboration_model.js";
import type * as build_collaboration_moderation from "../build_collaboration_moderation.js";
import type * as build_collaboration_notifications from "../build_collaboration_notifications.js";
import type * as build_collaboration_pin_migration from "../build_collaboration_pin_migration.js";
import type * as build_collaboration_publication_bundle from "../build_collaboration_publication_bundle.js";
import type * as build_collaboration_references from "../build_collaboration_references.js";
import type * as build_collaboration_resolution from "../build_collaboration_resolution.js";
import type * as build_collaboration_resolution_migration from "../build_collaboration_resolution_migration.js";
import type * as build_collaboration_rollout from "../build_collaboration_rollout.js";
import type * as build_collaboration_system_events from "../build_collaboration_system_events.js";
import type * as build_collaboration_threads from "../build_collaboration_threads.js";
import type * as build_collaboration_validators from "../build_collaboration_validators.js";
import type * as build_participant_activation from "../build_participant_activation.js";
import type * as build_participant_revocation from "../build_participant_revocation.js";
import type * as build_participant_revocation_notifications from "../build_participant_revocation_notifications.js";
import type * as build_participants from "../build_participants.js";
import type * as builderRoster from "../builderRoster.js";
import type * as builderStaffIdentity from "../builderStaffIdentity.js";
import type * as contractorAuth from "../contractorAuth.js";
import type * as contractorEvidence from "../contractorEvidence.js";
import type * as contractorMerge from "../contractorMerge.js";
import type * as contractorOnboarding from "../contractorOnboarding.js";
import type * as contractorWorkspace from "../contractorWorkspace.js";
import type * as crons from "../crons.js";
import type * as demo_build_address from "../demo_build_address.js";
import type * as demo_builder_proposals from "../demo_builder_proposals.js";
import type * as demo_drawflow from "../demo_drawflow.js";
import type * as demo_drawflow_backoffice from "../demo_drawflow_backoffice.js";
import type * as demo_personas from "../demo_personas.js";
import type * as demo_settings from "../demo_settings.js";
import type * as demo_site_visit_guidance from "../demo_site_visit_guidance.js";
import type * as demo_site_visit_tokens from "../demo_site_visit_tokens.js";
import type * as demo_timeline_plans from "../demo_timeline_plans.js";
import type * as demo_timeline_snapshots from "../demo_timeline_snapshots.js";
import type * as evidence_preview from "../evidence_preview.js";
import type * as fairLendConfig from "../fairLendConfig.js";
import type * as fluent from "../fluent.js";
import type * as gardenSuiteTemplate from "../gardenSuiteTemplate.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as milestone_start from "../milestone_start.js";
import type * as production_proposals from "../production_proposals.js";
import type * as proposal_collaboration from "../proposal_collaboration.js";
import type * as proposal_collaboration_model from "../proposal_collaboration_model.js";
import type * as siteVisitGuidance from "../siteVisitGuidance.js";
import type * as todos from "../todos.js";
import type * as types from "../types.js";
import type * as workosManagement from "../workosManagement.js";
import type * as workosProjection from "../workosProjection.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activeBuildAccess: typeof activeBuildAccess;
  assistant: typeof assistant;
  assistantProvider: typeof assistantProvider;
  auth: typeof auth;
  authz: typeof authz;
  authzTest: typeof authzTest;
  brokerAssignments: typeof brokerAssignments;
  brokerageProvisioning: typeof brokerageProvisioning;
  build_action_item_deadline_migrations: typeof build_action_item_deadline_migrations;
  build_action_item_deadline_model: typeof build_action_item_deadline_model;
  build_action_item_details: typeof build_action_item_details;
  build_action_item_governance: typeof build_action_item_governance;
  build_action_item_history: typeof build_action_item_history;
  build_action_item_queue_projection: typeof build_action_item_queue_projection;
  build_action_item_queues: typeof build_action_item_queues;
  build_action_item_rbac: typeof build_action_item_rbac;
  build_action_item_structure: typeof build_action_item_structure;
  build_action_item_structure_model: typeof build_action_item_structure_model;
  build_action_item_workflow: typeof build_action_item_workflow;
  build_action_items: typeof build_action_items;
  build_collaboration: typeof build_collaboration;
  build_collaboration_access: typeof build_collaboration_access;
  build_collaboration_acknowledgements: typeof build_collaboration_acknowledgements;
  build_collaboration_actor: typeof build_collaboration_actor;
  build_collaboration_asset_access: typeof build_collaboration_asset_access;
  build_collaboration_content: typeof build_collaboration_content;
  build_collaboration_contracts: typeof build_collaboration_contracts;
  build_collaboration_drafts: typeof build_collaboration_drafts;
  build_collaboration_editing: typeof build_collaboration_editing;
  build_collaboration_focus: typeof build_collaboration_focus;
  build_collaboration_human: typeof build_collaboration_human;
  build_collaboration_inbox: typeof build_collaboration_inbox;
  build_collaboration_migrations: typeof build_collaboration_migrations;
  build_collaboration_model: typeof build_collaboration_model;
  build_collaboration_moderation: typeof build_collaboration_moderation;
  build_collaboration_notifications: typeof build_collaboration_notifications;
  build_collaboration_pin_migration: typeof build_collaboration_pin_migration;
  build_collaboration_publication_bundle: typeof build_collaboration_publication_bundle;
  build_collaboration_references: typeof build_collaboration_references;
  build_collaboration_resolution: typeof build_collaboration_resolution;
  build_collaboration_resolution_migration: typeof build_collaboration_resolution_migration;
  build_collaboration_rollout: typeof build_collaboration_rollout;
  build_collaboration_system_events: typeof build_collaboration_system_events;
  build_collaboration_threads: typeof build_collaboration_threads;
  build_collaboration_validators: typeof build_collaboration_validators;
  build_participant_activation: typeof build_participant_activation;
  build_participant_revocation: typeof build_participant_revocation;
  build_participant_revocation_notifications: typeof build_participant_revocation_notifications;
  build_participants: typeof build_participants;
  builderRoster: typeof builderRoster;
  builderStaffIdentity: typeof builderStaffIdentity;
  contractorAuth: typeof contractorAuth;
  contractorEvidence: typeof contractorEvidence;
  contractorMerge: typeof contractorMerge;
  contractorOnboarding: typeof contractorOnboarding;
  contractorWorkspace: typeof contractorWorkspace;
  crons: typeof crons;
  demo_build_address: typeof demo_build_address;
  demo_builder_proposals: typeof demo_builder_proposals;
  demo_drawflow: typeof demo_drawflow;
  demo_drawflow_backoffice: typeof demo_drawflow_backoffice;
  demo_personas: typeof demo_personas;
  demo_settings: typeof demo_settings;
  demo_site_visit_guidance: typeof demo_site_visit_guidance;
  demo_site_visit_tokens: typeof demo_site_visit_tokens;
  demo_timeline_plans: typeof demo_timeline_plans;
  demo_timeline_snapshots: typeof demo_timeline_snapshots;
  evidence_preview: typeof evidence_preview;
  fairLendConfig: typeof fairLendConfig;
  fluent: typeof fluent;
  gardenSuiteTemplate: typeof gardenSuiteTemplate;
  http: typeof http;
  migrations: typeof migrations;
  milestone_start: typeof milestone_start;
  production_proposals: typeof production_proposals;
  proposal_collaboration: typeof proposal_collaboration;
  proposal_collaboration_model: typeof proposal_collaboration_model;
  siteVisitGuidance: typeof siteVisitGuidance;
  todos: typeof todos;
  types: typeof types;
  workosManagement: typeof workosManagement;
  workosProjection: typeof workosProjection;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  timeline: import("convex-timeline/_generated/component.js").ComponentApi<"timeline">;
};
