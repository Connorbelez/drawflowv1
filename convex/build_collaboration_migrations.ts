import { internal } from "./_generated/api.js";
import { migrations } from "./migrations";

export const backfillBuildNotesIntoCollaboration = migrations.define({
  table: "buildNotes",
  migrateOne: () => {
    throw new Error(
      "The unguarded legacy-note backfill is disabled. Use previewBuildCollaborationLegacyNoteMigration and applyBuildCollaborationLegacyNoteMigrationBatch."
    );
  },
});

export const runBuildCollaborationNoteBackfill = migrations.runner([
  internal.build_collaboration_migrations.backfillBuildNotesIntoCollaboration,
]);
