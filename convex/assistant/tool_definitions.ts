import { toolDefinition } from "@tanstack/ai";
import { z } from "zod/v4";

import { MUTATION_ACTION_KEYS } from "./contracts";

export const drawFlowAssistantMutationToolDefinitions =
  MUTATION_ACTION_KEYS.map((name) =>
    toolDefinition({
      description:
        name === "start_active_build_milestone"
          ? "Prepare an explicit actual work-start confirmation. Provide the actual start timestamp and idempotency key; incomplete dependencies require dependencyOverrideReason."
          : name === "record_proposal_closing" ||
              name === "update_active_build_details"
            ? `DrawFlow assistant action ${name}; provide an IANA timezone in ianaTimezone for the audit timestamp and calendar semantics.`
            : `DrawFlow assistant closed-catalog mutation action: ${name}`,
      inputSchema:
        name === "start_active_build_milestone"
          ? z.object({
              actualStartedAt: z.number().int().positive(),
              buildId: z.string().min(1),
              dependencyOverrideReason: z.string().min(3).optional(),
              expectedRevision: z.number().int().nonnegative(),
              idempotencyKey: z.string().min(8),
              milestoneKey: z.string().min(1),
              startParent: z.boolean().optional(),
              submilestoneKey: z.string().min(1).optional(),
            })
          : name === "record_proposal_closing" ||
              name === "update_active_build_details"
            ? z.object({ ianaTimezone: z.string().min(1) }).passthrough()
            : z.object({}).passthrough(),
      name,
    })
  );
