import { describe, expect, test, vi } from "vitest";

import {
  DEV_SERVICE_WORKER_RECOVERY_SCRIPT,
  recoverStaleDevelopmentServiceWorkers,
  type DevServiceWorkerRecoveryEnvironment,
} from "./dev-service-worker-recovery.ts";

function recoveryEnvironment(
  overrides: Partial<DevServiceWorkerRecoveryEnvironment> = {}
) {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
  const environment: DevServiceWorkerRecoveryEnvironment = {
    cacheStorage: {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([]),
    },
    hostname: "localhost",
    reload: vi.fn(),
    serviceWorker: {
      controller: null,
      getRegistrations: vi.fn().mockResolvedValue([]),
    },
    storage,
    ...overrides,
  };
  return { environment, storage, values };
}

describe("development service-worker recovery", () => {
  test("unregisters stale same-origin workers, clears caches, and reloads", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const { environment, storage } = recoveryEnvironment({
      cacheStorage: {
        delete: vi.fn().mockResolvedValue(true),
        keys: vi
          .fn()
          .mockResolvedValue(["fairlend-assets-v1", "fairlend-pages-v1"]),
      },
      serviceWorker: {
        controller: {},
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });

    await expect(
      recoverStaleDevelopmentServiceWorkers(environment)
    ).resolves.toBe(true);

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(environment.cacheStorage?.delete).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenCalledWith(
      "drawflow:dev-service-worker-recovery-attempts",
      "1"
    );
    expect(environment.reload).toHaveBeenCalledTimes(1);
  });

  test("does nothing outside local development origins", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const { environment } = recoveryEnvironment({
      hostname: "drawflow.example.com",
      serviceWorker: {
        controller: {},
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });

    await expect(
      recoverStaleDevelopmentServiceWorkers(environment)
    ).resolves.toBe(false);

    expect(unregister).not.toHaveBeenCalled();
    expect(environment.reload).not.toHaveBeenCalled();
  });

  test("clears the retry guard when the origin is already clean", async () => {
    const { environment, storage, values } = recoveryEnvironment();
    values.set("drawflow:dev-service-worker-recovery-attempts", "1");

    await expect(
      recoverStaleDevelopmentServiceWorkers(environment)
    ).resolves.toBe(false);

    expect(storage.removeItem).toHaveBeenCalledWith(
      "drawflow:dev-service-worker-recovery-attempts"
    );
    expect(environment.reload).not.toHaveBeenCalled();
  });

  test("ships a self-contained inline script for pre-hydration recovery", () => {
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain(
      "drawflow:dev-service-worker-recovery-attempts"
    );
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain("serviceWorker");
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).toContain("caches.delete");
    expect(DEV_SERVICE_WORKER_RECOVERY_SCRIPT).not.toContain("toString");
  });
});
