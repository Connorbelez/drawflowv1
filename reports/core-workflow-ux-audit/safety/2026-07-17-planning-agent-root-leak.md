# Planning red-test root leak and recovery

During Phase 1 red-test batch three, the planning test agent wrote three test-only changes to the checkpoint source root instead of the clean remediation worktree:

- `src/features/production-proposals/ProductionProposalSurfaces.test.tsx`
- `src/routes/backoffice/-proposals.$planId.test.tsx`
- `src/routes/builder/proposals/-proposal.$proposalId.test.ts`

The source root had been verified clean at checkpoint `42d6d212c5b43fa316c10a6141bf2ec760fc670a` before this task. Recovery preserved the agent-authored diff at `reports/core-workflow-ux-audit/safety/planning-red-root-leak.patch`, applied that patch to the remediation worktree, and restored only those three source-root paths from checkpoint HEAD.

Post-recovery verification:

- source-root status for all three paths: clean;
- remediation-worktree status for all three paths: modified;
- no product implementation file was changed in the source root;
- future mutating prompts must state the absolute remediation worktree path in every file allowlist and explicitly reject the source-root path.
