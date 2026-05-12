import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

import type { BuildWorkspaceAdapter } from "./types";

const BuildWorkspaceContext = createContext<BuildWorkspaceAdapter | null>(null);

export function BuildWorkspaceProvider({
  workspace,
  children,
}: {
  workspace: BuildWorkspaceAdapter;
  children: ReactNode;
}): ReactElement {
  return (
    <BuildWorkspaceContext.Provider value={workspace}>
      {children}
    </BuildWorkspaceContext.Provider>
  );
}

export function useBuildWorkspace(): BuildWorkspaceAdapter {
  const workspace = useContext(BuildWorkspaceContext);

  if (!workspace) {
    throw new Error(
      "useBuildWorkspace must be used inside BuildWorkspaceProvider"
    );
  }

  return workspace;
}
