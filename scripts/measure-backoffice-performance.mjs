import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_READY_BUDGET_MS = 2500;
const DEFAULT_TTFB_BUDGET_MS = 750;
const HTTP_PROTOCOL_PATTERN = /^https?:$/;

async function main() {
  const configuration = await readConfiguration();
  if (!configuration.ok) {
    printResult({
      outcome: "configuration-error",
      pass: false,
      reason: configuration.reason,
    });
    process.exitCode = 2;
    return;
  }

  const { baseURL, browserChannel, readyBudgetMs, storageState, ttfbBudgetMs } =
    configuration;
  const browser = await chromium.launch({
    channel: browserChannel,
    headless: true,
  });

  try {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        error: request.failure()?.errorText ?? "unknown",
        url: redactURL(request.url()),
      });
    });

    const targetURL = new URL("/backoffice", baseURL);
    const startedAt = performance.now();
    const response = await page.goto(targetURL.href, {
      timeout: readyBudgetMs + 10_000,
      waitUntil: "domcontentloaded",
    });
    const domContentLoadedMs = performance.now() - startedAt;
    const finalURL = new URL(page.url());

    let outcome;
    let dashboardReadyMs = null;
    let routeError = null;

    if (response && response.status() >= 400) {
      outcome = "http-error";
      routeError = await page
        .locator("body")
        .innerText()
        .then((text) => text.slice(0, 2000));
    } else if (
      finalURL.origin !== targetURL.origin ||
      !finalURL.pathname.startsWith("/backoffice")
    ) {
      outcome = "auth-redirect";
    } else {
      const routeState = await waitForRouteOutcome(page, readyBudgetMs);
      dashboardReadyMs = Math.round(performance.now() - startedAt);
      outcome = routeState;
      if (routeState === "route-error") {
        routeError = await page
          .locator("body")
          .innerText()
          .then((text) => text.slice(0, 2000));
      }
    }

    await page
      .waitForLoadState("load", { timeout: 5000 })
      .catch(() => undefined);
    const browserMetrics = await collectBrowserMetrics(page);
    const budgetFailures = [];

    if (browserMetrics.ttfbMs > ttfbBudgetMs) {
      budgetFailures.push(
        `TTFB ${browserMetrics.ttfbMs}ms exceeded ${ttfbBudgetMs}ms.`
      );
    }
    if (dashboardReadyMs === null || dashboardReadyMs > readyBudgetMs) {
      budgetFailures.push(
        dashboardReadyMs === null
          ? "The dashboard never became ready."
          : `Dashboard ready ${dashboardReadyMs}ms exceeded ${readyBudgetMs}ms.`
      );
    }

    const pass = outcome === "ready" && budgetFailures.length === 0;
    printResult({
      ...browserMetrics,
      budgets: {
        dashboardReadyMs: readyBudgetMs,
        ttfbMs: ttfbBudgetMs,
      },
      budgetFailures,
      consoleErrorCount: consoleErrors.length,
      consoleErrors: consoleErrors.slice(0, 20),
      dashboardReadyMs,
      domContentLoadedMs: Math.round(domContentLoadedMs),
      failedRequestCount: failedRequests.length,
      failedRequests: failedRequests.slice(0, 20),
      finalURL: redactURL(finalURL.href),
      httpStatus: response?.status() ?? null,
      outcome,
      pass,
      routeError,
    });

    if (!pass) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

async function readConfiguration() {
  const baseURLInput = process.env.BACKOFFICE_BASE_URL ?? DEFAULT_BASE_URL;
  let baseURL;
  try {
    baseURL = new URL(baseURLInput);
  } catch {
    return {
      ok: false,
      reason: `BACKOFFICE_BASE_URL is not a valid URL: ${baseURLInput}`,
    };
  }

  if (!HTTP_PROTOCOL_PATTERN.test(baseURL.protocol)) {
    return {
      ok: false,
      reason: "BACKOFFICE_BASE_URL must use http or https.",
    };
  }

  const storageStateInput = process.env.BACKOFFICE_STORAGE_STATE;
  if (!storageStateInput) {
    return {
      ok: false,
      reason:
        "BACKOFFICE_STORAGE_STATE must point to a Playwright storage-state JSON for an authenticated backoffice session.",
    };
  }

  const storageState = resolve(storageStateInput);
  try {
    const parsed = JSON.parse(await readFile(storageState, "utf8"));
    if (!(Array.isArray(parsed.cookies) && Array.isArray(parsed.origins))) {
      throw new Error("missing cookies/origins arrays");
    }
  } catch (error) {
    return {
      ok: false,
      reason: `BACKOFFICE_STORAGE_STATE could not be read as Playwright storage state (${error instanceof Error ? error.message : String(error)}).`,
    };
  }

  const readyBudget = readPositiveNumber(
    "BACKOFFICE_READY_BUDGET_MS",
    DEFAULT_READY_BUDGET_MS
  );
  if (!readyBudget.ok) {
    return readyBudget;
  }
  const ttfbBudget = readPositiveNumber(
    "BACKOFFICE_TTFB_BUDGET_MS",
    DEFAULT_TTFB_BUDGET_MS
  );
  if (!ttfbBudget.ok) {
    return ttfbBudget;
  }

  return {
    baseURL,
    browserChannel: process.env.BACKOFFICE_BROWSER_CHANNEL?.trim() || "chrome",
    ok: true,
    readyBudgetMs: readyBudget.value,
    storageState,
    ttfbBudgetMs: ttfbBudget.value,
  };
}

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      reason: `${name} must be a positive number of milliseconds.`,
    };
  }
  return { ok: true, value };
}

async function waitForRouteOutcome(page, readyBudgetMs) {
  try {
    await page.waitForFunction(
      () => {
        if (
          document.querySelector('[data-testid="backoffice-dashboard-grid"]')
        ) {
          return "ready";
        }
        const routeError = [...document.querySelectorAll("h1")].some(
          (heading) =>
            heading.textContent?.trim() ===
            "DrawFlow could not load this screen."
        );
        return routeError ? "route-error" : false;
      },
      undefined,
      { timeout: readyBudgetMs }
    );
  } catch {
    return "timeout";
  }

  return page
    .getByTestId("backoffice-dashboard-grid")
    .isVisible()
    .then((visible) => (visible ? "ready" : "route-error"));
}

async function collectBrowserMetrics(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        return {
          decodedBytes: resources.reduce(
            (sum, resource) => sum + (resource.decodedBodySize || 0),
            0
          ),
          loadEventMs: Math.round(navigation?.loadEventEnd ?? 0),
          resourceCount: resources.length,
          scriptCount: resources.filter(
            (resource) => resource.initiatorType === "script"
          ).length,
          transferBytes: resources.reduce(
            (sum, resource) => sum + (resource.transferSize || 0),
            0
          ),
          ttfbMs: Math.round(navigation?.responseStart ?? 0),
        };
      });
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(100);
    }
  }

  throw new Error("Unable to collect browser performance metrics.");
}

function redactURL(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  printResult({
    outcome: "runtime-error",
    pass: false,
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 2;
});
