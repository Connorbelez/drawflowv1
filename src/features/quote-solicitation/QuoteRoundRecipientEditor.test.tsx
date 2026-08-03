// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type {
  QuoteRoundRecipientCandidate,
  QuoteRoundRecipientSelection,
} from "./QuoteRoundComposer.tsx";
import { QuoteRoundRecipientEditor } from "./QuoteRoundRecipientEditor.tsx";

const provisionalRecipient: QuoteRoundRecipientCandidate = {
  capabilities: ["contractor", "supplier"],
  contractorProfileId: "recipient-cold-1",
  displayName: "Cold Trade and Supply Co.",
  email: "cold.recipient@example.com",
  provisioningState: "provisional",
  recipientKey: "recipient-cold-1",
};

describe("QuoteRoundRecipientEditor", () => {
  test("provisions and selects a cold email through the supplied canonical identity action", async () => {
    const createColdRecipient = vi.fn().mockResolvedValue(provisionalRecipient);

    function Harness() {
      const [candidates, setCandidates] = useState<
        QuoteRoundRecipientCandidate[]
      >([]);
      const [selections, setSelections] = useState<
        QuoteRoundRecipientSelection[]
      >([]);
      return (
        <QuoteRoundRecipientEditor
          candidates={candidates}
          mode="mixed"
          onChange={setSelections}
          onCreateColdRecipient={async (input) => {
            const recipient = await createColdRecipient(input);
            setCandidates((current) => [...current, recipient]);
            return recipient;
          }}
          selections={selections}
        />
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByLabelText("New quote recipient name"), {
      target: { value: "Cold Trade and Supply Co." },
    });
    fireEvent.change(screen.getByLabelText("New quote recipient email"), {
      target: { value: " Cold.Recipient@Example.com " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add private recipient" })
    );

    await waitFor(() =>
      expect(createColdRecipient).toHaveBeenCalledWith({
        displayName: "Cold Trade and Supply Co.",
        email: "Cold.Recipient@Example.com",
      })
    );
    expect(await screen.findByText("Cold Trade and Supply Co.")).toBeTruthy();
    expect(screen.getByText("Provisional identity")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});
