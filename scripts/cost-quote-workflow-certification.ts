import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCostQuoteWorkflowCertification } from "./cost-quote-workflow-runner";

// biome-ignore lint/performance/noBarrelFile: This file is the stable package-command facade.
export {
  type AutomatedGateDefinition,
  COST_QUOTE_AUTOMATED_GATES,
  COST_QUOTE_CERTIFICATION_SCHEMA_VERSION,
  COST_QUOTE_MANUAL_BROWSER_WORKFLOWS,
  COST_QUOTE_MANUAL_QA_SCHEMA_VERSION,
  COST_QUOTE_WORKFLOW_INVARIANTS,
  type EvidenceAnchor,
  type ManualBrowserQaEvidence,
  type ManualBrowserWorkflow,
  type WorkflowInvariant,
} from "./cost-quote-workflow-contract";
export { runCostQuoteWorkflowCertification } from "./cost-quote-workflow-runner";
export {
  validateAutomatedGateInputs,
  validateEvidenceAnchors,
  validateExecutedEvidenceAnchors,
  validateManualBrowserQaEvidence,
} from "./cost-quote-workflow-validation";

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    runCostQuoteWorkflowCertification(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
