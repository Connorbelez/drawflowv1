// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  action: vi.fn().mockResolvedValue("action-result"),
  mutation: vi.fn().mockResolvedValue("mutation-result"),
  rejected: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useAction: () => mocks.action,
  useMutation: () => mocks.mutation,
}));

import {
  BuildCollaborationMutationGate,
  useBuildCollaborationAction,
  useBuildCollaborationMutation,
} from "./BuildCollaborationMutationGate.tsx";

afterEach(() => {
  cleanup();
  mocks.action.mockClear();
  mocks.mutation.mockClear();
  mocks.rejected.mockClear();
});

describe("BuildCollaborationMutationGate", () => {
  test("blocks every nested shared mutation and action while offline", async () => {
    render(
      <BuildCollaborationMutationGate sharedMutationsAllowed={false}>
        <MutationHarness />
      </BuildCollaborationMutationGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(mocks.rejected).toHaveBeenCalledTimes(2));
    expect(mocks.rejected).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Reconnect before changing shared Build collaboration state. Offline work stays private.",
      })
    );
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.action).not.toHaveBeenCalled();
  });

  test("passes shared effects through unchanged after reconnect", async () => {
    render(
      <BuildCollaborationMutationGate sharedMutationsAllowed>
        <MutationHarness />
      </BuildCollaborationMutationGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    fireEvent.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() => expect(mocks.mutation).toHaveBeenCalledWith({}));
    expect(mocks.action).toHaveBeenCalledWith({});
    expect(mocks.rejected).not.toHaveBeenCalled();
  });
});

function MutationHarness() {
  const mutate = useBuildCollaborationMutation({} as never);
  const act = useBuildCollaborationAction({} as never);
  return (
    <>
      <button onClick={() => mutate({}).catch(mocks.rejected)} type="button">
        Mutate
      </button>
      <button onClick={() => act({}).catch(mocks.rejected)} type="button">
        Act
      </button>
    </>
  );
}
