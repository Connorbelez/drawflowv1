import { BuildWorkspaceDemo } from "./BuildWorkspaceDemo";
import { useConvexBuildWorkspace } from "./convex-workspace-adapter";
import { BuildWorkspaceProvider } from "./workspace-adapter";
import type { WorkspaceMode } from "./types";

export function ConvexBuildWorkspaceRoute({ mode }: { mode: WorkspaceMode }) {
  const workspace = useConvexBuildWorkspace(mode);

  return (
    <BuildWorkspaceProvider workspace={workspace}>
      <BuildWorkspaceDemo />
    </BuildWorkspaceProvider>
  );
}
