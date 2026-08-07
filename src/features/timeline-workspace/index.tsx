/**
 * Public timeline workspace entry. Helpers and subcomponents must be imported
 * from their own files — do not re-export the entire TimelineWorkspace module
 * graph from here (avoids pulling ~11k lines into unrelated consumers).
 */
export {
  TimelineDemoWorkspace,
  TimelineWorkspace,
  timelineWorkspaceSearchParsers,
  type TimelineModificationRequestView,
  type TimelineWorkspaceMode,
  type TimelineWorkspacePersistence,
  type TimelineWorkspaceProps,
} from "./TimelineWorkspace.tsx";
