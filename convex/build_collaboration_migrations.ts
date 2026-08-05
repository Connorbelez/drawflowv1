import { internal } from "./_generated/api.js";
import { migrations } from "./migrations";

export const backfillBuildNotesIntoCollaboration = migrations.define({
  table: "buildNotes",
  migrateOne: () => {
    throw new Error(
      "The unguarded legacy-note backfill is disabled. Use the paged build_collaboration_legacy_note_plan preview/manifest workflow, then the bounded import and parity workflows."
    );
  },
});

export const runBuildCollaborationNoteBackfill = migrations.runner([
  internal.build_collaboration_migrations.backfillBuildNotesIntoCollaboration,
]);
