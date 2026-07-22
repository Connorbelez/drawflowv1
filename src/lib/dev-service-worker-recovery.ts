export interface DevServiceWorkerRegistration {
  unregister: () => Promise<boolean>;
}

export interface DevServiceWorkerRecoveryEnvironment {
  cacheStorage?: {
    delete: (cacheName: string) => Promise<boolean>;
    keys: () => Promise<string[]>;
  };
  hostname: string;
  reload: () => void;
  serviceWorker?: {
    controller: unknown;
    getRegistrations: () => Promise<readonly DevServiceWorkerRegistration[]>;
  };
  storage?: {
    getItem: (key: string) => string | null;
    removeItem: (key: string) => unknown;
    setItem: (key: string, value: string) => unknown;
  };
}

const LOCAL_DEVELOPMENT_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

function browserRecoveryEnvironment(): DevServiceWorkerRecoveryEnvironment {
  return {
    cacheStorage: globalThis.caches,
    hostname: globalThis.location?.hostname ?? "",
    reload: () => globalThis.location.reload(),
    serviceWorker: globalThis.navigator?.serviceWorker,
    storage: globalThis.sessionStorage,
  };
}

/**
 * Removes service workers and CacheStorage left by another app on a shared
 * localhost origin before TanStack Router hydrates the current route graph.
 */
export async function recoverStaleDevelopmentServiceWorkers(
  environment?: DevServiceWorkerRecoveryEnvironment
): Promise<boolean> {
  const recoveryKey = "drawflow:dev-service-worker-recovery-attempts";
  const maximumReloadAttempts = 2;
  const runtime = environment ?? browserRecoveryEnvironment();

  if (!LOCAL_DEVELOPMENT_HOSTNAMES.has(runtime.hostname)) {
    return false;
  }

  const registrations = runtime.serviceWorker
    ? await runtime.serviceWorker.getRegistrations().catch(() => [])
    : [];
  const cacheKeys = runtime.cacheStorage
    ? await runtime.cacheStorage.keys().catch(() => [])
    : [];
  const hasStaleBrowserState =
    Boolean(runtime.serviceWorker?.controller) ||
    registrations.length > 0 ||
    cacheKeys.length > 0;

  if (!hasStaleBrowserState) {
    runtime.storage?.removeItem(recoveryKey);
    return false;
  }

  await Promise.allSettled([
    ...registrations.map((registration) => registration.unregister()),
    ...cacheKeys.map((cacheKey) => runtime.cacheStorage?.delete(cacheKey)),
  ]);

  const parsedAttempts = Number.parseInt(
    runtime.storage?.getItem(recoveryKey) ?? "0",
    10
  );
  const attempts = Number.isFinite(parsedAttempts) ? parsedAttempts : 0;
  if (attempts >= maximumReloadAttempts) {
    runtime.storage?.removeItem(recoveryKey);
    return false;
  }

  runtime.storage?.setItem(recoveryKey, String(attempts + 1));
  runtime.reload();
  return true;
}

export const DEV_SERVICE_WORKER_RECOVERY_SCRIPT = `void (async () => {
  const recoveryKey = "drawflow:dev-service-worker-recovery-attempts";
  const localHostnames = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (!localHostnames.includes(globalThis.location?.hostname ?? "")) return;

  const serviceWorker = globalThis.navigator?.serviceWorker;
  const registrations = serviceWorker
    ? await serviceWorker.getRegistrations().catch(() => [])
    : [];
  const cacheKeys = globalThis.caches
    ? await globalThis.caches.keys().catch(() => [])
    : [];
  const hasStaleState =
    Boolean(serviceWorker?.controller) ||
    registrations.length > 0 ||
    cacheKeys.length > 0;

  if (!hasStaleState) {
    globalThis.sessionStorage?.removeItem(recoveryKey);
    return;
  }

  await Promise.allSettled([
    ...registrations.map((registration) => registration.unregister()),
    ...cacheKeys.map((cacheKey) => globalThis.caches.delete(cacheKey)),
  ]);

  const parsedAttempts = Number.parseInt(
    globalThis.sessionStorage?.getItem(recoveryKey) ?? "0",
    10
  );
  const attempts = Number.isFinite(parsedAttempts) ? parsedAttempts : 0;
  if (attempts >= 2) {
    globalThis.sessionStorage?.removeItem(recoveryKey);
    return;
  }

  globalThis.sessionStorage?.setItem(recoveryKey, String(attempts + 1));
  globalThis.location.reload();
})().catch(() => undefined);`;
