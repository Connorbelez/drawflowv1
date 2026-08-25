"use client";

import { useEffect } from "react";
import type { AssistantClientAction } from "#/features/assistant/assistantClientActionBridge.ts";
import {
  consumeQueuedAssistantClientActions,
  normalizeAssistantRoute,
  queueAssistantClientActions,
  readQueuedAssistantClientActions,
  registerAssistantClientAction,
} from "#/features/assistant/assistantClientActionBridge.ts";
import type { GoogleAddressPlaceDetails } from "#/lib/google-maps.ts";
import type { IsometricIconKey } from "./-timeline-share-snapshot.ts";
import {
  ASSISTANT_SETUP_CLIENT_ACTION_KEYS,
  DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
  DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
  normalizeDurationText,
  type SetupStep,
  type TimelineSetupMilestoneRow,
  type TimelineSetupTemplate,
} from "./TimelineSetupFlowContracts.ts";
import {
  assistantActionInput,
  assistantBoolean,
  assistantBorrowerContributionText,
  assistantCurrencyText,
  assistantLoanPercentageText,
  assistantNumber,
  assistantString,
  makeSetupSubmilestoneId,
  resolveAgentTemplate,
  setupRowWithSubmilestoneBudgetRollup,
} from "./TimelineSetupFlowPlanning.ts";
import {
  createCustomMilestoneRow,
  withSubMilestoneDetails,
} from "./TimelineSetupFlowTemplates.ts";

export interface TimelineSetupAssistantState {
  budgetText: string;
  continueToBudget: () => void;
  selectTemplate: (templateKey: string) => void;
  setAssistantNotice: React.Dispatch<React.SetStateAction<string>>;
  setBudgetText: React.Dispatch<React.SetStateAction<string>>;
  setCascadeBudgetEdits: React.Dispatch<React.SetStateAction<boolean>>;
  setCashText: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setLoanPercentageText: React.Dispatch<React.SetStateAction<string>>;
  setPermitsSkipped: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectAddress: React.Dispatch<React.SetStateAction<string>>;
  setProjectAddressPlace: React.Dispatch<
    React.SetStateAction<GoogleAddressPlaceDetails | null>
  >;
  setProposedStartDate: React.Dispatch<React.SetStateAction<string>>;
  setRows: React.Dispatch<React.SetStateAction<TimelineSetupMilestoneRow[]>>;
  setStep: React.Dispatch<React.SetStateAction<SetupStep>>;
  settingsTemplates?: TimelineSetupTemplate[];
  templates: TimelineSetupTemplate[];
}

export function useTimelineSetupAssistant({
  budgetText,
  continueToBudget,
  selectTemplate,
  settingsTemplates,
  templates,
  setAssistantNotice,
  setBudgetText,
  setCascadeBudgetEdits,
  setCashText,
  setError,
  setLoanPercentageText,
  setPermitsSkipped,
  setProjectAddress,
  setProjectAddressPlace,
  setProposedStartDate,
  setRows,
  setStep,
}: TimelineSetupAssistantState) {
  useEffect(() => {
    const templateListLoaded = settingsTemplates !== undefined;
    const executeSetupAction = (action: AssistantClientAction) => {
      const input = assistantActionInput(action);
      const rowKey = assistantString(input, ["rowKey", "milestoneKey", "key"]);
      const subMilestoneId = assistantString(input, [
        "subMilestoneId",
        "submilestoneId",
        "subMilestoneKey",
        "submilestoneKey",
      ]);

      switch (action.actionKey) {
        case "select_proposal_template": {
          const requestedTemplateKey = assistantString(input, ["templateKey"]);
          const resolvedTemplate = resolveAgentTemplate(
            requestedTemplateKey,
            templates
          );
          if (!resolvedTemplate) {
            if (!templateListLoaded) {
              queueAssistantClientActions([
                {
                  actionKey: "select_proposal_template",
                  input: { templateKey: requestedTemplateKey },
                  route: action.route ?? window.location.pathname,
                },
              ]);
              return {
                ok: false,
                reason: "Proposal templates are still loading.",
                retryable: true,
              };
            }
            const message = `Template ${requestedTemplateKey} is not available on this proposal setup screen.`;
            setError(message);
            return { ok: false, reason: message };
          }
          setStep("template");
          selectTemplate(resolvedTemplate.templateKey);
          setError("");
          setAssistantNotice(`${resolvedTemplate.title} selected`);
          return {
            ok: true,
            templateKey: resolvedTemplate.templateKey,
            title: resolvedTemplate.title,
          };
        }
        case "set_proposal_setup_field": {
          const field = assistantString(input, ["field"]).toLowerCase();
          if (field.includes("start")) {
            setProposedStartDate(
              assistantString(input, ["value", "proposedStartDate"])
            );
          } else if (field.includes("budget")) {
            setBudgetText(
              assistantCurrencyText(input, [
                "value",
                "budgetCents",
                "totalBudgetCents",
                "totalBudget",
              ])
            );
          } else if (
            field.includes("cash") ||
            field.includes("workingcapital") ||
            field.includes("working capital")
          ) {
            setCashText(
              assistantCurrencyText(input, [
                "value",
                "cashCents",
                "maxCashOnHandCents",
                "borrowerStartingCashCents",
              ])
            );
          } else if (
            field.includes("loan") ||
            field.includes("reimbursement") ||
            field.includes("ltv")
          ) {
            setLoanPercentageText(
              assistantLoanPercentageText(input, [
                "value",
                "loanPercentage",
                "loanPercentagePercent",
                "reimbursementPercentage",
              ])
            );
          } else if (field.includes("pay") || field.includes("contribution")) {
            setLoanPercentageText(
              assistantBorrowerContributionText(input, [
                "value",
                "coPay",
                "coPayPercent",
                "borrowerCoPayPercent",
                "borrowerContribution",
                "borrowerContributionPercent",
              ])
            );
          } else {
            return { ok: false, reason: `Unsupported setup field: ${field}` };
          }
          setError("");
          return { field, ok: true };
        }
        case "set_proposal_setup_address": {
          setProjectAddress(
            assistantString(input, ["address", "label", "value"])
          );
          setProjectAddressPlace(null);
          setError("");
          return { ok: true };
        }
        case "set_proposal_setup_permit_status": {
          const skipped = assistantBoolean(input, [
            "skipped",
            "value",
            "status",
          ]);
          setPermitsSkipped(skipped);
          setError("");
          return { ok: true, skipped };
        }
        case "advance_proposal_setup_step": {
          const targetStep = assistantString(input, ["step", "targetStep"]);
          if (targetStep === "template" || targetStep === "back") {
            setStep("template");
            return { ok: true, step: "template" };
          }
          if (!targetStep || targetStep === "budget" || targetStep === "next") {
            continueToBudget();
            return { ok: true, step: "budget" };
          }
          return {
            ok: false,
            reason:
              "Completing setup must go through create_build_proposal_from_setup HITL.",
          };
        }
        case "set_setup_milestone_included": {
          const included = assistantBoolean(input, ["included", "value"], true);
          setRows((current) =>
            current.map((row) =>
              row.key === rowKey ? { ...row, excluded: !included } : row
            )
          );
          setStep("budget");
          setError("");
          return { included, ok: true, rowKey };
        }
        case "create_setup_milestone": {
          const name = assistantString(
            input,
            ["name", "title"],
            "New milestone"
          );
          let createdKey = "";
          setRows((current) => {
            const row = createCustomMilestoneRow({
              name,
              order: current.length + 1,
              rows: current,
            });
            createdKey = row.key;
            return [...current, row];
          });
          setStep("budget");
          setError("");
          return { ok: true, rowKey: createdKey };
        }
        case "reorder_setup_milestones": {
          const orderKeys = Array.isArray(input.orderKeys)
            ? input.orderKeys.map(String)
            : [];
          if (orderKeys.length === 0) {
            return { ok: false, reason: "orderKeys is required." };
          }
          setRows((current) => {
            const byKey = new Map(current.map((row) => [row.key, row]));
            const ordered = orderKeys
              .map((key) => byKey.get(key))
              .filter((row): row is TimelineSetupMilestoneRow => Boolean(row));
            const missing = current.filter(
              (row) => !orderKeys.includes(row.key)
            );
            return [...ordered, ...missing].map((row, index) => ({
              ...row,
              order: index + 1,
            }));
          });
          setStep("budget");
          setError("");
          return { ok: true, orderKeys };
        }
        case "update_setup_milestone":
        case "update_setup_milestone_schedule_budget": {
          setRows((current) =>
            current.map((row) => {
              if (row.key !== rowKey) {
                return row;
              }
              const budgetText =
                input.budgetCents !== undefined ||
                input.budgetText !== undefined
                  ? assistantCurrencyText(input, ["budgetCents", "budgetText"])
                  : row.budgetText;
              const durationDays = assistantNumber(input, [
                "durationDays",
                "duration",
              ]);
              return {
                ...row,
                ...(input.dependencyKeys && Array.isArray(input.dependencyKeys)
                  ? { dependencyKeys: input.dependencyKeys.map(String) }
                  : {}),
                budgetText,
                durationText: Number.isFinite(durationDays)
                  ? normalizeDurationText(String(durationDays))
                  : row.durationText,
                icon: assistantString(
                  input,
                  ["icon"],
                  row.icon
                ) as IsometricIconKey,
                name: assistantString(input, ["name", "title"], row.name),
                startDay: Number.isFinite(
                  assistantNumber(input, ["startDay", "dayStart"])
                )
                  ? Math.max(
                      0,
                      Math.round(
                        assistantNumber(input, ["startDay", "dayStart"])
                      )
                    )
                  : row.startDay,
                type: assistantString(input, ["type"], row.type),
              };
            })
          );
          setStep("budget");
          setError("");
          return { ok: true, rowKey };
        }
        case "set_setup_budget_cascade_mode": {
          const enabled = assistantBoolean(input, ["enabled", "value"], true);
          setCascadeBudgetEdits(enabled);
          return { enabled, ok: true };
        }
        case "create_setup_submilestone": {
          let createdId = "";
          setRows((current) =>
            current.map((row) => {
              if (row.key !== rowKey) {
                return row;
              }
              const name = assistantString(
                input,
                ["name", "title"],
                "New sub-milestone"
              );
              const id =
                assistantString(input, ["id", "subMilestoneId"]) ||
                makeSetupSubmilestoneId(row, name);
              createdId = id;
              return setupRowWithSubmilestoneBudgetRollup(
                withSubMilestoneDetails(row, [
                  ...row.subMilestoneDetails,
                  {
                    budgetText: assistantCurrencyText(
                      input,
                      ["budgetCents", "budgetText"],
                      DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT
                    ),
                    description: assistantString(
                      input,
                      ["description"],
                      "Define reimbursable scope, evidence, and acceptance criteria"
                    ),
                    durationText: normalizeDurationText(
                      assistantString(
                        input,
                        ["durationDays", "durationText"],
                        DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT
                      )
                    ),
                    id,
                    name,
                    startDay: Number.isFinite(
                      assistantNumber(input, ["startDay", "dayStart"])
                    )
                      ? Math.max(
                          0,
                          Math.round(
                            assistantNumber(input, ["startDay", "dayStart"])
                          )
                        )
                      : undefined,
                  },
                ])
              );
            })
          );
          setStep("budget");
          setError("");
          return { ok: true, subMilestoneId: createdId };
        }
        case "update_setup_submilestone":
        case "update_setup_field_guidance": {
          setRows((current) =>
            current.map((row) => {
              if (rowKey && row.key !== rowKey) {
                return row;
              }
              if (
                !row.subMilestoneDetails.some(
                  (detail) => detail.id === subMilestoneId
                )
              ) {
                return row;
              }
              return setupRowWithSubmilestoneBudgetRollup(
                withSubMilestoneDetails(
                  row,
                  row.subMilestoneDetails.map((detail) => {
                    if (detail.id !== subMilestoneId) {
                      return detail;
                    }
                    const durationDays = assistantNumber(input, [
                      "durationDays",
                      "duration",
                    ]);
                    const startDay = assistantNumber(input, [
                      "startDay",
                      "dayStart",
                    ]);
                    return {
                      ...detail,
                      ...(input.budgetCents !== undefined ||
                      input.budgetText !== undefined
                        ? {
                            budgetText: assistantCurrencyText(input, [
                              "budgetCents",
                              "budgetText",
                            ]),
                          }
                        : {}),
                      description: assistantString(
                        input,
                        ["description", "guidance", "verificationNote"],
                        detail.description
                      ),
                      durationText: Number.isFinite(durationDays)
                        ? normalizeDurationText(String(durationDays))
                        : detail.durationText,
                      name: assistantString(
                        input,
                        ["name", "title"],
                        detail.name
                      ),
                      startDay: Number.isFinite(startDay)
                        ? Math.max(0, Math.round(startDay))
                        : detail.startDay,
                    };
                  })
                )
              );
            })
          );
          setStep("budget");
          setError("");
          return { ok: true, subMilestoneId };
        }
        case "move_setup_submilestone": {
          const targetRowKey = assistantString(input, [
            "targetRowKey",
            "targetMilestoneKey",
          ]);
          const targetIndex = assistantNumber(input, ["targetIndex", "index"]);
          if (!(subMilestoneId && targetRowKey)) {
            return {
              ok: false,
              reason: "subMilestoneId and targetRowKey are required.",
            };
          }
          setRows((current) =>
            current.map((row) => {
              const moved = current
                .flatMap((source) => source.subMilestoneDetails)
                .find((detail) => detail.id === subMilestoneId);
              if (!moved) {
                return row;
              }
              if (
                row.subMilestoneDetails.some(
                  (detail) => detail.id === subMilestoneId
                )
              ) {
                return setupRowWithSubmilestoneBudgetRollup(
                  withSubMilestoneDetails(
                    row,
                    row.subMilestoneDetails.filter(
                      (detail) => detail.id !== subMilestoneId
                    )
                  )
                );
              }
              if (row.key === targetRowKey) {
                const index = Number.isFinite(targetIndex)
                  ? Math.max(
                      0,
                      Math.min(row.subMilestoneDetails.length, targetIndex)
                    )
                  : row.subMilestoneDetails.length;
                return setupRowWithSubmilestoneBudgetRollup(
                  withSubMilestoneDetails(row, [
                    ...row.subMilestoneDetails.slice(0, index),
                    moved,
                    ...row.subMilestoneDetails.slice(index),
                  ])
                );
              }
              return row;
            })
          );
          setStep("budget");
          setError("");
          return { ok: true, subMilestoneId, targetRowKey };
        }
        case "delete_setup_submilestone": {
          setRows((current) =>
            current.map((row) =>
              rowKey && row.key !== rowKey
                ? row
                : setupRowWithSubmilestoneBudgetRollup(
                    withSubMilestoneDetails(
                      row,
                      row.subMilestoneDetails.filter(
                        (detail) => detail.id !== subMilestoneId
                      )
                    )
                  )
            )
          );
          setStep("budget");
          setError("");
          return { ok: true, subMilestoneId };
        }
        case "create_setup_cost_item": {
          const itemId =
            assistantString(input, ["itemId", "id"]) ||
            `setup-cost-${Date.now()}`;
          const relevantSubMilestoneIds = [
            ...(Array.isArray(input.relevantSubmilestoneKeys)
              ? input.relevantSubmilestoneKeys.map(String)
              : []),
            ...(Array.isArray(input.relevantSubMilestoneIds)
              ? input.relevantSubMilestoneIds.map(String)
              : []),
            ...(subMilestoneId ? [subMilestoneId] : []),
          ];
          setRows((current) =>
            current.map((row) =>
              row.key === rowKey
                ? {
                    ...row,
                    costItems: [
                      ...(row.costItems ?? []),
                      {
                        costCents: Math.max(
                          0,
                          Math.round(
                            assistantNumber(input, ["costCents", "cost"])
                          )
                        ),
                        description: assistantString(input, ["description"]),
                        id: itemId,
                        itemType:
                          assistantString(
                            input,
                            ["itemType", "type"],
                            "material"
                          ) === "equipment"
                            ? "equipment"
                            : "material",
                        quantity: Math.max(
                          1,
                          assistantNumber(input, ["quantity"]) || 1
                        ),
                        relevantSubMilestoneIds,
                        supplier: assistantString(input, ["supplier"]),
                        title: assistantString(
                          input,
                          ["title", "name"],
                          "Material"
                        ),
                      },
                    ],
                  }
                : row
            )
          );
          setStep("budget");
          setError("");
          return { itemId, ok: true };
        }
        case "update_setup_cost_item": {
          const itemId = assistantString(input, ["itemId", "id"]);
          setRows((current) =>
            current.map((row) => ({
              ...row,
              costItems: (row.costItems ?? []).map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      ...(input.costCents === undefined
                        ? {}
                        : {
                            costCents: Math.max(
                              0,
                              Math.round(
                                assistantNumber(input, ["costCents", "cost"])
                              )
                            ),
                          }),
                      description: assistantString(
                        input,
                        ["description"],
                        item.description
                      ),
                      quantity:
                        input.quantity === undefined
                          ? item.quantity
                          : Math.max(
                              1,
                              assistantNumber(input, ["quantity"]) || 1
                            ),
                      supplier: assistantString(
                        input,
                        ["supplier"],
                        item.supplier
                      ),
                      title: assistantString(
                        input,
                        ["title", "name"],
                        item.title
                      ),
                    }
                  : item
              ),
            }))
          );
          setStep("budget");
          setError("");
          return { itemId, ok: true };
        }
        case "delete_setup_cost_item": {
          const itemId = assistantString(input, ["itemId", "id"]);
          setRows((current) =>
            current.map((row) => ({
              ...row,
              costItems: (row.costItems ?? []).filter(
                (item) => item.id !== itemId
              ),
            }))
          );
          setStep("budget");
          setError("");
          return { itemId, ok: true };
        }
        case "create_setup_contractor_assignment": {
          const assignmentId =
            assistantString(input, ["assignmentId", "id"]) ||
            `setup-contractor-${Date.now()}`;
          const subMilestoneIds = Array.isArray(input.subMilestoneIds)
            ? input.subMilestoneIds.map(String)
            : subMilestoneId
              ? [subMilestoneId]
              : [];
          setRows((current) =>
            current.map((row) =>
              row.key === rowKey
                ? {
                    ...row,
                    contractorAssignments: [
                      ...(row.contractorAssignments ?? []),
                      {
                        contractorId: assistantString(input, ["contractorId"]),
                        contractorName: assistantString(
                          input,
                          ["contractorName", "name"],
                          "Contractor"
                        ),
                        estimatedCostCents: Number.isFinite(
                          assistantNumber(input, ["estimatedCostCents"])
                        )
                          ? Math.max(
                              0,
                              Math.round(
                                assistantNumber(input, ["estimatedCostCents"])
                              )
                            )
                          : undefined,
                        estimatedHours: Number.isFinite(
                          assistantNumber(input, ["estimatedHours"])
                        )
                          ? Math.max(
                              0,
                              assistantNumber(input, ["estimatedHours"])
                            )
                          : undefined,
                        id: assignmentId,
                        role: assistantString(input, ["role"], "Contractor"),
                        subMilestoneIds,
                      },
                    ],
                  }
                : row
            )
          );
          setStep("budget");
          setError("");
          return { assignmentId, ok: true };
        }
        case "delete_setup_contractor_assignment": {
          const assignmentId = assistantString(input, ["assignmentId", "id"]);
          setRows((current) =>
            current.map((row) => ({
              ...row,
              contractorAssignments: (row.contractorAssignments ?? []).filter(
                (assignment) => assignment.id !== assignmentId
              ),
            }))
          );
          setStep("budget");
          setError("");
          return { assignmentId, ok: true };
        }
        case "import_proposal_budget_workbook":
          return {
            ok: false,
            reason:
              "Budget workbook import requires a trusted file attachment and cannot be executed from a prompt-only client action.",
          };
        default:
          return { ok: false, reason: "Unsupported setup assistant action." };
      }
    };
    const route = normalizeAssistantRoute(window.location.pathname);
    const matchingQueuedActions = readQueuedAssistantClientActions().filter(
      (action) =>
        action.actionKey === "select_proposal_template" &&
        (!action.route || normalizeAssistantRoute(action.route) === route)
    );
    const hasResolvableQueuedAction = matchingQueuedActions.some((action) =>
      resolveAgentTemplate(
        assistantString(assistantActionInput(action), ["templateKey"]),
        templates
      )
    );
    if (!(templateListLoaded || hasResolvableQueuedAction)) {
      return;
    }
    const unregister = ASSISTANT_SETUP_CLIENT_ACTION_KEYS.map((actionKey) =>
      registerAssistantClientAction(actionKey, executeSetupAction)
    );
    for (const actionKey of ASSISTANT_SETUP_CLIENT_ACTION_KEYS) {
      for (const action of consumeQueuedAssistantClientActions({
        actionKey,
        route,
      })) {
        executeSetupAction(action);
      }
    }
    return () => unregister.forEach((dispose) => dispose());
  }, [budgetText, selectTemplate, settingsTemplates, templates]);
}
