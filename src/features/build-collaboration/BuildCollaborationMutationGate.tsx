"use client";

import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
} from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { createContext, type ReactNode, useCallback, useContext } from "react";

const OFFLINE_MUTATION_MESSAGE =
  "Reconnect before changing shared Build collaboration state. Offline work stays private.";

const BuildCollaborationMutationAllowedContext = createContext(true);

export function BuildCollaborationMutationGate({
  children,
  sharedMutationsAllowed,
}: {
  children: ReactNode;
  sharedMutationsAllowed: boolean;
}) {
  return (
    <BuildCollaborationMutationAllowedContext.Provider
      value={sharedMutationsAllowed}
    >
      {children}
    </BuildCollaborationMutationAllowedContext.Provider>
  );
}
export function useBuildCollaborationMutation<
  Mutation extends FunctionReference<"mutation">,
>(mutation: Mutation) {
  const execute = useConvexMutation(mutation);
  const allowed = useContext(BuildCollaborationMutationAllowedContext);
  return useCallback(
    async (
      args: FunctionArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      if (!allowed) {
        throw new Error(OFFLINE_MUTATION_MESSAGE);
      }
      return await execute(args);
    },
    [allowed, execute]
  );
}

export function useBuildCollaborationAction<
  Action extends FunctionReference<"action">,
>(action: Action) {
  const execute = useConvexAction(action);
  const allowed = useContext(BuildCollaborationMutationAllowedContext);
  return useCallback(
    async (args: FunctionArgs<Action>): Promise<FunctionReturnType<Action>> => {
      if (!allowed) {
        throw new Error(OFFLINE_MUTATION_MESSAGE);
      }
      return await execute(args);
    },
    [allowed, execute]
  );
}
