import { main } from "./build-collaboration-cutover-runtime";

// biome-ignore lint/performance/noBarrelFile: This file is the stable package-command facade.
export {
  type BuildCollaborationCutoverLiveState,
  REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  REQUIRED_BUILD_COLLABORATION_MONITORS,
} from "./build-collaboration-cutover-contract";
export { validateBuildCollaborationCutoverEvidence } from "./build-collaboration-cutover-validation";

if (import.meta.main) {
  main();
}
