// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const createEndpoint = vi.fn();
const validateEndpoint = vi.fn();
const activateEndpoint = vi.fn();
const disableEndpoint = vi.fn();
const rotateSecret = vi.fn();
const revokeEndpoint = vi.fn();
const retryAttempt = vi.fn();
const updateEndpoint = vi.fn();
const useMutation = vi.fn();
const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => useMutation(reference),
  useQuery: (reference: unknown, args: unknown) => useQuery(reference, args),
}));

import { IntegrationOperationsConsole } from "./integration-operations-console.tsx";

const endpoint = {
  _id: "endpoint-01",
  activatedAt: Date.now() - 120_000,
  createdAt: Date.now() - 300_000,
  endpointUrl: "https://hooks.example.test/drawflow",
  eventTypes: ["draw.released", "milestone.approved"],
  name: "Accounting webhook",
  payloadVersion: "2026-07-01",
  secretFingerprint: "…4f2a9c",
  secretVersion: 2,
  status: "active" as const,
  updatedAt: Date.now() - 120_000,
  validatedAt: Date.now() - 180_000,
};

const failedAttempt = {
  _id: "attempt-01",
  attemptNumber: 1,
  attemptedAt: Date.now() - 60_000,
  deliveryId: "delivery_draw_001",
  endpointId: "endpoint-01",
  endpointName: "Accounting webhook",
  endpointUrl: "https://hooks.example.test/drawflow",
  eventId: "event_draw_001",
  eventType: "draw.released",
  payloadVersion: "2026-07-01",
  responseCode: 503,
  safeError: "Endpoint unavailable. No secret or payload data was stored.",
  status: "failed" as const,
  updatedAt: Date.now() - 60_000,
};

describe("IntegrationOperationsConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mutations = [
      createEndpoint,
      updateEndpoint,
      validateEndpoint,
      activateEndpoint,
      disableEndpoint,
      rotateSecret,
      revokeEndpoint,
      retryAttempt,
    ];
    useMutation.mockImplementation(
      () => mutations[(useMutation.mock.calls.length - 1) % mutations.length]
    );
    useQuery.mockReturnValue({ attempts: [failedAttempt], endpoints: [endpoint] });
    createEndpoint.mockResolvedValue({
      endpoint: { ...endpoint, _id: "endpoint-02", name: "ERP webhook" },
      signingSecret: "dfwhsec_shown_once",
    });
    retryAttempt.mockResolvedValue({
      ...failedAttempt,
      _id: "attempt-02",
      attemptNumber: 2,
      deliveryId: "delivery_draw_002",
      retryOfAttemptId: "attempt-01",
      status: "retry_pending",
    });
  });

  afterEach(() => cleanup());

  test("creates a secret-safe endpoint and exposes actionable delivery recovery", async () => {
    render(
      <IntegrationOperationsConsole workosOrganizationId="org_production_foundation" />
    );

    expect(screen.getByRole("heading", { name: "Integration operations" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Accounting webhook" })).toBeTruthy();
    expect(screen.getByText("event_draw_001")).toBeTruthy();
    expect(screen.getByText("delivery_draw_001")).toBeTruthy();
    expect(screen.getByText("HTTP 503")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable Accounting webhook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rotate Accounting webhook secret" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke Accounting webhook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry delivery delivery_draw_001" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/secretHash|payloadPreview|requestId|stack/i);

    fireEvent.change(screen.getByLabelText("Endpoint name"), {
      target: { value: "ERP webhook" },
    });
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://erp.example.test/events" },
    });
    fireEvent.change(screen.getByLabelText("Event subscriptions"), {
      target: { value: "draw.released, milestone.approved" },
    });
    fireEvent.change(screen.getByLabelText("Payload version"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("Configuration reason"), {
      target: { value: "Connect the ERP workflow." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));

    await waitFor(() => {
      expect(createEndpoint).toHaveBeenCalledWith({
        endpointUrl: "https://erp.example.test/events",
        eventTypes: ["draw.released", "milestone.approved"],
        name: "ERP webhook",
        payloadVersion: "2026-07-01",
        reason: "Connect the ERP workflow.",
        workosOrganizationId: "org_production_foundation",
      });
    });
    expect(
      screen.getAllByRole("status").some((status) => /shown once/i.test(status.textContent ?? ""))
    ).toBe(true);
    expect(screen.getByText("dfwhsec_shown_once")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Reason for Accounting webhook"), {
      target: { value: "Endpoint recovered after maintenance." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry delivery delivery_draw_001" })
    );
    await waitFor(() => {
      expect(retryAttempt).toHaveBeenCalledWith({
        attemptId: "attempt-01",
        reason: "Endpoint recovered after maintenance.",
        workosOrganizationId: "org_production_foundation",
      });
    });
  });
});
