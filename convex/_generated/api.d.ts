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
import type * as active_build_document_lineage from "../active_build_document_lineage.js";
import type * as administrative_override_policy from "../administrative_override_policy.js";
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
import type * as build_action_item_post_links from "../build_action_item_post_links.js";
import type * as build_action_item_queue_projection from "../build_action_item_queue_projection.js";
import type * as build_action_item_queues from "../build_action_item_queues.js";
import type * as build_action_item_rbac from "../build_action_item_rbac.js";
import type * as build_action_item_structure from "../build_action_item_structure.js";
import type * as build_action_item_structure_model from "../build_action_item_structure_model.js";
import type * as build_action_item_tags from "../build_action_item_tags.js";
import type * as build_action_item_workflow from "../build_action_item_workflow.js";
import type * as build_action_items from "../build_action_items.js";
import type * as build_collaboration from "../build_collaboration.js";
import type * as build_collaboration_access from "../build_collaboration_access.js";
import type * as build_collaboration_acknowledgements from "../build_collaboration_acknowledgements.js";
import type * as build_collaboration_actor from "../build_collaboration_actor.js";
import type * as build_collaboration_archive from "../build_collaboration_archive.js";
import type * as build_collaboration_asset_access from "../build_collaboration_asset_access.js";
import type * as build_collaboration_asset_actions from "../build_collaboration_asset_actions.js";
import type * as build_collaboration_asset_maintenance from "../build_collaboration_asset_maintenance.js";
import type * as build_collaboration_asset_projection from "../build_collaboration_asset_projection.js";
import type * as build_collaboration_asset_publication from "../build_collaboration_asset_publication.js";
import type * as build_collaboration_assets from "../build_collaboration_assets.js";
import type * as build_collaboration_content from "../build_collaboration_content.js";
import type * as build_collaboration_contracts from "../build_collaboration_contracts.js";
import type * as build_collaboration_cutover_certification from "../build_collaboration_cutover_certification.js";
import type * as build_collaboration_cutover_rehearsals from "../build_collaboration_cutover_rehearsals.js";
import type * as build_collaboration_delivery from "../build_collaboration_delivery.js";
import type * as build_collaboration_delivery_api from "../build_collaboration_delivery_api.js";
import type * as build_collaboration_delivery_maintenance from "../build_collaboration_delivery_maintenance.js";
import type * as build_collaboration_delivery_model from "../build_collaboration_delivery_model.js";
import type * as build_collaboration_delivery_reconciliation from "../build_collaboration_delivery_reconciliation.js";
import type * as build_collaboration_delivery_transport from "../build_collaboration_delivery_transport.js";
import type * as build_collaboration_delivery_transport_provider from "../build_collaboration_delivery_transport_provider.js";
import type * as build_collaboration_drafts from "../build_collaboration_drafts.js";
import type * as build_collaboration_editing from "../build_collaboration_editing.js";
import type * as build_collaboration_export_acl from "../build_collaboration_export_acl.js";
import type * as build_collaboration_export_archive from "../build_collaboration_export_archive.js";
import type * as build_collaboration_export_plan from "../build_collaboration_export_plan.js";
import type * as build_collaboration_exports from "../build_collaboration_exports.js";
import type * as build_collaboration_focus from "../build_collaboration_focus.js";
import type * as build_collaboration_hash from "../build_collaboration_hash.js";
import type * as build_collaboration_human from "../build_collaboration_human.js";
import type * as build_collaboration_inbox from "../build_collaboration_inbox.js";
import type * as build_collaboration_legacy_note_import from "../build_collaboration_legacy_note_import.js";
import type * as build_collaboration_legacy_note_parity from "../build_collaboration_legacy_note_parity.js";
import type * as build_collaboration_legacy_note_plan from "../build_collaboration_legacy_note_plan.js";
import type * as build_collaboration_legacy_note_shared from "../build_collaboration_legacy_note_shared.js";
import type * as build_collaboration_lifecycle from "../build_collaboration_lifecycle.js";
import type * as build_collaboration_lifecycle_state from "../build_collaboration_lifecycle_state.js";
import type * as build_collaboration_links from "../build_collaboration_links.js";
import type * as build_collaboration_migrations from "../build_collaboration_migrations.js";
import type * as build_collaboration_model from "../build_collaboration_model.js";
import type * as build_collaboration_moderation from "../build_collaboration_moderation.js";
import type * as build_collaboration_notifications from "../build_collaboration_notifications.js";
import type * as build_collaboration_operational_events from "../build_collaboration_operational_events.js";
import type * as build_collaboration_pin_migration from "../build_collaboration_pin_migration.js";
import type * as build_collaboration_planning_reconciliation from "../build_collaboration_planning_reconciliation.js";
import type * as build_collaboration_projection from "../build_collaboration_projection.js";
import type * as build_collaboration_publication_bundle from "../build_collaboration_publication_bundle.js";
import type * as build_collaboration_publication_preconditions from "../build_collaboration_publication_preconditions.js";
import type * as build_collaboration_push from "../build_collaboration_push.js";
import type * as build_collaboration_push_maintenance from "../build_collaboration_push_maintenance.js";
import type * as build_collaboration_recipient_access from "../build_collaboration_recipient_access.js";
import type * as build_collaboration_references from "../build_collaboration_references.js";
import type * as build_collaboration_resolution from "../build_collaboration_resolution.js";
import type * as build_collaboration_resolution_migration from "../build_collaboration_resolution_migration.js";
import type * as build_collaboration_retention from "../build_collaboration_retention.js";
import type * as build_collaboration_rollout from "../build_collaboration_rollout.js";
import type * as build_collaboration_scheduling from "../build_collaboration_scheduling.js";
import type * as build_collaboration_scheduling_errors from "../build_collaboration_scheduling_errors.js";
import type * as build_collaboration_search from "../build_collaboration_search.js";
import type * as build_collaboration_search_authority_model from "../build_collaboration_search_authority_model.js";
import type * as build_collaboration_search_authority_projection from "../build_collaboration_search_authority_projection.js";
import type * as build_collaboration_search_index from "../build_collaboration_search_index.js";
import type * as build_collaboration_search_maintenance from "../build_collaboration_search_maintenance.js";
import type * as build_collaboration_search_migrations from "../build_collaboration_search_migrations.js";
import type * as build_collaboration_search_reader_sources from "../build_collaboration_search_reader_sources.js";
import type * as build_collaboration_search_readers from "../build_collaboration_search_readers.js";
import type * as build_collaboration_shared_effects from "../build_collaboration_shared_effects.js";
import type * as build_collaboration_system_event_access from "../build_collaboration_system_event_access.js";
import type * as build_collaboration_system_events from "../build_collaboration_system_events.js";
import type * as build_collaboration_system_post_backfill from "../build_collaboration_system_post_backfill.js";
import type * as build_collaboration_system_posts from "../build_collaboration_system_posts.js";
import type * as build_collaboration_threads from "../build_collaboration_threads.js";
import type * as build_collaboration_validation from "../build_collaboration_validation.js";
import type * as build_collaboration_validators from "../build_collaboration_validators.js";
import type * as build_collaboration_viewer from "../build_collaboration_viewer.js";
import type * as build_collaboration_webhook_contracts from "../build_collaboration_webhook_contracts.js";
import type * as build_collaboration_webhook_network from "../build_collaboration_webhook_network.js";
import type * as build_collaboration_webhook_signing from "../build_collaboration_webhook_signing.js";
import type * as build_collaboration_webhook_transport from "../build_collaboration_webhook_transport.js";
import type * as build_collaboration_webhooks from "../build_collaboration_webhooks.js";
import type * as build_collaboration_workflow_events from "../build_collaboration_workflow_events.js";
import type * as build_draw_coordination from "../build_draw_coordination.js";
import type * as build_operational_idempotency from "../build_operational_idempotency.js";
import type * as build_participant_activation from "../build_participant_activation.js";
import type * as build_participant_revocation from "../build_participant_revocation.js";
import type * as build_participant_revocation_notifications from "../build_participant_revocation_notifications.js";
import type * as build_participants from "../build_participants.js";
import type * as build_submilestone_evidence from "../build_submilestone_evidence.js";
import type * as build_submilestone_operate_authority from "../build_submilestone_operate_authority.js";
import type * as build_submilestone_review from "../build_submilestone_review.js";
import type * as builderRoster from "../builderRoster.js";
import type * as builderStaffIdentity from "../builderStaffIdentity.js";
import type * as contractorAuth from "../contractorAuth.js";
import type * as contractorEvidence from "../contractorEvidence.js";
import type * as contractorMerge from "../contractorMerge.js";
import type * as contractorOnboarding from "../contractorOnboarding.js";
import type * as contractorWorkspace from "../contractorWorkspace.js";
import type * as cost_document_access from "../cost_document_access.js";
import type * as cost_document_working_state from "../cost_document_working_state.js";
import type * as cost_documents from "../cost_documents.js";
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
import type * as email_transport from "../email_transport.js";
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
import type * as quote_comparisons from "../quote_comparisons.js";
import type * as quote_invitation_access from "../quote_invitation_access.js";
import type * as quote_notifications from "../quote_notifications.js";
import type * as quote_preferred from "../quote_preferred.js";
import type * as quote_response_drafts from "../quote_response_drafts.js";
import type * as quote_response_submissions from "../quote_response_submissions.js";
import type * as quote_response_template_migrations from "../quote_response_template_migrations.js";
import type * as quote_response_templates from "../quote_response_templates.js";
import type * as quote_round_lifecycle from "../quote_round_lifecycle.js";
import type * as quote_rounds from "../quote_rounds.js";
import type * as siteVisitGuidance from "../siteVisitGuidance.js";
import type * as todos from "../todos.js";
import type * as types from "../types.js";
import type * as workosManagement from "../workosManagement.js";
import type * as workosProjection from "../workosProjection.js";
import type * as workos_permission_access from "../workos_permission_access.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activeBuildAccess: typeof activeBuildAccess;
  active_build_document_lineage: typeof active_build_document_lineage;
  administrative_override_policy: typeof administrative_override_policy;
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
  build_action_item_post_links: typeof build_action_item_post_links;
  build_action_item_queue_projection: typeof build_action_item_queue_projection;
  build_action_item_queues: typeof build_action_item_queues;
  build_action_item_rbac: typeof build_action_item_rbac;
  build_action_item_structure: typeof build_action_item_structure;
  build_action_item_structure_model: typeof build_action_item_structure_model;
  build_action_item_tags: typeof build_action_item_tags;
  build_action_item_workflow: typeof build_action_item_workflow;
  build_action_items: typeof build_action_items;
  build_collaboration: typeof build_collaboration;
  build_collaboration_access: typeof build_collaboration_access;
  build_collaboration_acknowledgements: typeof build_collaboration_acknowledgements;
  build_collaboration_actor: typeof build_collaboration_actor;
  build_collaboration_archive: typeof build_collaboration_archive;
  build_collaboration_asset_access: typeof build_collaboration_asset_access;
  build_collaboration_asset_actions: typeof build_collaboration_asset_actions;
  build_collaboration_asset_maintenance: typeof build_collaboration_asset_maintenance;
  build_collaboration_asset_projection: typeof build_collaboration_asset_projection;
  build_collaboration_asset_publication: typeof build_collaboration_asset_publication;
  build_collaboration_assets: typeof build_collaboration_assets;
  build_collaboration_content: typeof build_collaboration_content;
  build_collaboration_contracts: typeof build_collaboration_contracts;
  build_collaboration_cutover_certification: typeof build_collaboration_cutover_certification;
  build_collaboration_cutover_rehearsals: typeof build_collaboration_cutover_rehearsals;
  build_collaboration_delivery: typeof build_collaboration_delivery;
  build_collaboration_delivery_api: typeof build_collaboration_delivery_api;
  build_collaboration_delivery_maintenance: typeof build_collaboration_delivery_maintenance;
  build_collaboration_delivery_model: typeof build_collaboration_delivery_model;
  build_collaboration_delivery_reconciliation: typeof build_collaboration_delivery_reconciliation;
  build_collaboration_delivery_transport: typeof build_collaboration_delivery_transport;
  build_collaboration_delivery_transport_provider: typeof build_collaboration_delivery_transport_provider;
  build_collaboration_drafts: typeof build_collaboration_drafts;
  build_collaboration_editing: typeof build_collaboration_editing;
  build_collaboration_export_acl: typeof build_collaboration_export_acl;
  build_collaboration_export_archive: typeof build_collaboration_export_archive;
  build_collaboration_export_plan: typeof build_collaboration_export_plan;
  build_collaboration_exports: typeof build_collaboration_exports;
  build_collaboration_focus: typeof build_collaboration_focus;
  build_collaboration_hash: typeof build_collaboration_hash;
  build_collaboration_human: typeof build_collaboration_human;
  build_collaboration_inbox: typeof build_collaboration_inbox;
  build_collaboration_legacy_note_import: typeof build_collaboration_legacy_note_import;
  build_collaboration_legacy_note_parity: typeof build_collaboration_legacy_note_parity;
  build_collaboration_legacy_note_plan: typeof build_collaboration_legacy_note_plan;
  build_collaboration_legacy_note_shared: typeof build_collaboration_legacy_note_shared;
  build_collaboration_lifecycle: typeof build_collaboration_lifecycle;
  build_collaboration_lifecycle_state: typeof build_collaboration_lifecycle_state;
  build_collaboration_links: typeof build_collaboration_links;
  build_collaboration_migrations: typeof build_collaboration_migrations;
  build_collaboration_model: typeof build_collaboration_model;
  build_collaboration_moderation: typeof build_collaboration_moderation;
  build_collaboration_notifications: typeof build_collaboration_notifications;
  build_collaboration_operational_events: typeof build_collaboration_operational_events;
  build_collaboration_pin_migration: typeof build_collaboration_pin_migration;
  build_collaboration_planning_reconciliation: typeof build_collaboration_planning_reconciliation;
  build_collaboration_projection: typeof build_collaboration_projection;
  build_collaboration_publication_bundle: typeof build_collaboration_publication_bundle;
  build_collaboration_publication_preconditions: typeof build_collaboration_publication_preconditions;
  build_collaboration_push: typeof build_collaboration_push;
  build_collaboration_push_maintenance: typeof build_collaboration_push_maintenance;
  build_collaboration_recipient_access: typeof build_collaboration_recipient_access;
  build_collaboration_references: typeof build_collaboration_references;
  build_collaboration_resolution: typeof build_collaboration_resolution;
  build_collaboration_resolution_migration: typeof build_collaboration_resolution_migration;
  build_collaboration_retention: typeof build_collaboration_retention;
  build_collaboration_rollout: typeof build_collaboration_rollout;
  build_collaboration_scheduling: typeof build_collaboration_scheduling;
  build_collaboration_scheduling_errors: typeof build_collaboration_scheduling_errors;
  build_collaboration_search: typeof build_collaboration_search;
  build_collaboration_search_authority_model: typeof build_collaboration_search_authority_model;
  build_collaboration_search_authority_projection: typeof build_collaboration_search_authority_projection;
  build_collaboration_search_index: typeof build_collaboration_search_index;
  build_collaboration_search_maintenance: typeof build_collaboration_search_maintenance;
  build_collaboration_search_migrations: typeof build_collaboration_search_migrations;
  build_collaboration_search_reader_sources: typeof build_collaboration_search_reader_sources;
  build_collaboration_search_readers: typeof build_collaboration_search_readers;
  build_collaboration_shared_effects: typeof build_collaboration_shared_effects;
  build_collaboration_system_event_access: typeof build_collaboration_system_event_access;
  build_collaboration_system_events: typeof build_collaboration_system_events;
  build_collaboration_system_post_backfill: typeof build_collaboration_system_post_backfill;
  build_collaboration_system_posts: typeof build_collaboration_system_posts;
  build_collaboration_threads: typeof build_collaboration_threads;
  build_collaboration_validation: typeof build_collaboration_validation;
  build_collaboration_validators: typeof build_collaboration_validators;
  build_collaboration_viewer: typeof build_collaboration_viewer;
  build_collaboration_webhook_contracts: typeof build_collaboration_webhook_contracts;
  build_collaboration_webhook_network: typeof build_collaboration_webhook_network;
  build_collaboration_webhook_signing: typeof build_collaboration_webhook_signing;
  build_collaboration_webhook_transport: typeof build_collaboration_webhook_transport;
  build_collaboration_webhooks: typeof build_collaboration_webhooks;
  build_collaboration_workflow_events: typeof build_collaboration_workflow_events;
  build_draw_coordination: typeof build_draw_coordination;
  build_operational_idempotency: typeof build_operational_idempotency;
  build_participant_activation: typeof build_participant_activation;
  build_participant_revocation: typeof build_participant_revocation;
  build_participant_revocation_notifications: typeof build_participant_revocation_notifications;
  build_participants: typeof build_participants;
  build_submilestone_evidence: typeof build_submilestone_evidence;
  build_submilestone_operate_authority: typeof build_submilestone_operate_authority;
  build_submilestone_review: typeof build_submilestone_review;
  builderRoster: typeof builderRoster;
  builderStaffIdentity: typeof builderStaffIdentity;
  contractorAuth: typeof contractorAuth;
  contractorEvidence: typeof contractorEvidence;
  contractorMerge: typeof contractorMerge;
  contractorOnboarding: typeof contractorOnboarding;
  contractorWorkspace: typeof contractorWorkspace;
  cost_document_access: typeof cost_document_access;
  cost_document_working_state: typeof cost_document_working_state;
  cost_documents: typeof cost_documents;
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
  email_transport: typeof email_transport;
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
  quote_comparisons: typeof quote_comparisons;
  quote_invitation_access: typeof quote_invitation_access;
  quote_notifications: typeof quote_notifications;
  quote_preferred: typeof quote_preferred;
  quote_response_drafts: typeof quote_response_drafts;
  quote_response_submissions: typeof quote_response_submissions;
  quote_response_template_migrations: typeof quote_response_template_migrations;
  quote_response_templates: typeof quote_response_templates;
  quote_round_lifecycle: typeof quote_round_lifecycle;
  quote_rounds: typeof quote_rounds;
  siteVisitGuidance: typeof siteVisitGuidance;
  todos: typeof todos;
  types: typeof types;
  workosManagement: typeof workosManagement;
  workosProjection: typeof workosProjection;
  workos_permission_access: typeof workos_permission_access;
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
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  timeline: import("convex-timeline/_generated/component.js").ComponentApi<"timeline">;
};
