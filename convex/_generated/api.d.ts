/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as authzTest from "../authzTest.js";
import type * as brokerageProvisioning from "../brokerageProvisioning.js";
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
import type * as production_proposals from "../production_proposals.js";
import type * as proposal_collaboration from "../proposal_collaboration.js";
import type * as proposal_collaboration_model from "../proposal_collaboration_model.js";
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
  assistant: typeof assistant;
  auth: typeof auth;
  authz: typeof authz;
  authzTest: typeof authzTest;
  brokerageProvisioning: typeof brokerageProvisioning;
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
  production_proposals: typeof production_proposals;
  proposal_collaboration: typeof proposal_collaboration;
  proposal_collaboration_model: typeof proposal_collaboration_model;
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
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  timeline: import("convex-timeline/_generated/component.js").ComponentApi<"timeline">;
};
