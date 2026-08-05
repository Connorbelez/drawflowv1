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

interface BuildCollaborationMutationGateState {
  personalMutationsAllowed: boolean;
  sharedBlockedMessage: string;
  sharedMutationsAllowed: boolean;
}

const BuildCollaborationMutationAllowedContext =
  createContext<BuildCollaborationMutationGateState>({
    personalMutationsAllowed: true,
    sharedBlockedMessage: OFFLINE_MUTATION_MESSAGE,
    sharedMutationsAllowed: true,
  });

export function BuildCollaborationMutationGate({
  children,
  personalMutationsAllowed,
  sharedBlockedMessage = OFFLINE_MUTATION_MESSAGE,
  sharedMutationsAllowed,
}: {
  children: ReactNode;
  personalMutationsAllowed: boolean;
  sharedBlockedMessage?: string;
  sharedMutationsAllowed: boolean;
}) {
  return (
    <BuildCollaborationMutationAllowedContext.Provider
      value={{
        personalMutationsAllowed,
        sharedBlockedMessage,
        sharedMutationsAllowed,
      }}
    >
      {children}
    </BuildCollaborationMutationAllowedContext.Provider>
  );
}
export function useBuildCollaborationMutation<
  Mutation extends FunctionReference<"mutation">,
>(mutation: Mutation) {
  const execute = useConvexMutation(mutation);
  const { sharedBlockedMessage, sharedMutationsAllowed } = useContext(
    BuildCollaborationMutationAllowedContext
  );
  return useCallback(
    async (
      args: FunctionArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      if (!sharedMutationsAllowed) {
        throw new Error(sharedBlockedMessage);
      }
      return await execute(args);
    },
    [execute, sharedBlockedMessage, sharedMutationsAllowed]
  );
}

export function useBuildCollaborationPersonalMutation<
  Mutation extends FunctionReference<"mutation">,
>(mutation: Mutation) {
  const execute = useConvexMutation(mutation);
  const { personalMutationsAllowed } = useContext(
    BuildCollaborationMutationAllowedContext
  );
  return useCallback(
    async (
      args: FunctionArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      if (!personalMutationsAllowed) {
        throw new Error(OFFLINE_MUTATION_MESSAGE);
      }
      return await execute(args);
    },
    [execute, personalMutationsAllowed]
  );
}

/**
 * Convex operations that authorize or audit a read without changing shared
 * collaboration content. They remain available in an online read-only archive.
 */
export function useBuildCollaborationReadMutation<
  Mutation extends FunctionReference<"mutation">,
>(mutation: Mutation) {
  return useBuildCollaborationPersonalMutation(mutation);
}

export function useBuildCollaborationAction<
  Action extends FunctionReference<"action">,
>(action: Action) {
  const execute = useConvexAction(action);
  const { sharedBlockedMessage, sharedMutationsAllowed } = useContext(
    BuildCollaborationMutationAllowedContext
  );
  return useCallback(
    async (args: FunctionArgs<Action>): Promise<FunctionReturnType<Action>> => {
      if (!sharedMutationsAllowed) {
        throw new Error(sharedBlockedMessage);
      }
      return await execute(args);
    },
    [execute, sharedBlockedMessage, sharedMutationsAllowed]
  );
}
