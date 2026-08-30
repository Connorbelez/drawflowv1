import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { TimelineWorkspaceControllerModel } from "./TimelineWorkspaceController.ts";

const TimelineWorkspaceContext = createContext<
  TimelineWorkspaceControllerModel | null
>(null);

export function TimelineWorkspaceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: TimelineWorkspaceControllerModel;
}) {
  return (
    <TimelineWorkspaceContext.Provider value={value}>
      {children}
    </TimelineWorkspaceContext.Provider>
  );
}

export function useTimelineWorkspaceContext() {
  const value = useContext(TimelineWorkspaceContext);
  if (!value) {
    throw new Error(
      "useTimelineWorkspaceContext must be used inside TimelineWorkspaceProvider"
    );
  }
  return value;
}
