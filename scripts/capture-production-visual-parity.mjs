import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.DRAWFLOW_VISUAL_PARITY_PORT ?? 3177);
const baseUrl = `http://127.0.0.1:${port}`;

const desktop = { height: 1000, label: "desktop-1440x1000", width: 1440 };
const mobile = { height: 844, label: "mobile-390x844", width: 390 };

const screens = [
  {
    id: "builder-workspace-desktop",
    path: "/builder/proposals/proposal_visual_parity",
    viewports: [desktop],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByTestId("timeline-submit-proposal").waitFor();
      await page.getByTestId("timeline-roadmap-grid").waitFor();
    },
  },
  {
    id: "builder-workspace-mobile",
    path: "/builder/proposals/proposal_visual_parity",
    viewports: [mobile],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByTestId("selected-draw-mobile-drawer").waitFor();
    },
  },
  {
    id: "builder-submitted-readonly",
    path: "/builder/proposals/proposal_visual_submitted",
    viewports: [desktop],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByTestId("timeline-locked-banner").waitFor();
      await page.getByTestId("timeline-roadmap-grid").waitFor();
      await page.getByTestId("timeline-cashflow-chart").waitFor();
      await page.getByTestId("timeline-draw-availability-chart").waitFor();
    },
  },
  {
    id: "builder-approved-live-build",
    path: "/builder/proposals/proposal_visual_approved",
    viewports: [desktop],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByText("Live build", { exact: true }).waitFor();
      await page.getByText("Active build", { exact: true }).waitFor();
    },
  },
  {
    id: "selected-milestone-panel",
    path: "/builder/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectMilestone(page, "framing");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByTestId("selected-draw-panel").waitFor();
      await page.getByTestId("selected-draw-completion-form-framing").waitFor();
    },
  },
  {
    id: "evidence-upload-panel",
    path: "/builder/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectMilestone(page, "site-prep");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page
        .getByTestId("selected-draw-evidence-package-site-prep")
        .waitFor();
      await page
        .getByTestId("selected-draw-evidence-asset-fixture-foundation-photo")
        .waitFor();
    },
  },
  {
    id: "milestone-completion-form",
    path: "/builder/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectMilestone(page, "framing");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByTestId("selected-draw-completion-form-framing").waitFor();
      await page
        .getByTestId("selected-draw-evidence-package-framing")
        .waitFor();
    },
  },
  {
    id: "selected-draw-panel",
    path: "/builder/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectDraw(page, "framing");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByTestId("selected-draw-details").waitFor();
      await page.getByTestId("selected-draw-request-form-framing").waitFor();
    },
  },
  {
    id: "draw-request-form",
    path: "/builder/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectDraw(page, "framing");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByTestId("selected-draw-request-form-framing").waitFor();
      await page.getByTestId("selected-draw-submit-request-framing").waitFor();
    },
  },
  {
    id: "backoffice-proposal-review-workspace",
    path: "/backoffice/proposals/proposal_visual_submitted",
    viewports: [desktop],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByTestId("timeline-locked-banner").waitFor();
      await page.getByText("Review decision").waitFor();
    },
  },
  {
    id: "backoffice-lender-milestone-review",
    path: "/backoffice/proposals/proposal_visual_approved",
    viewports: [desktop],
    waitFor: async (page) => {
      await page
        .getByTestId("lender-milestone-review-panel-site-prep")
        .waitFor();
    },
  },
  {
    id: "backoffice-lender-draw-review",
    path: "/backoffice/proposals/proposal_visual_approved",
    prepare: async (page) => {
      await selectDraw(page, "framing");
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByTestId("lender-draw-review-panel-framing").waitFor();
    },
  },
  {
    id: "settings-template-milestone-table",
    path: "/backoffice/settings",
    viewports: [desktop],
    waitFor: async (page) => {
      await page.getByText("Production proposal settings").waitFor();
      await page.getByText("Proposal-flow foundation").waitFor();
      await page.getByTestId("timeline-settings-template-blueprint-table").waitFor();
    },
  },
  {
    id: "demo-timeline-regression",
    path: "/demo/timeline",
    prepare: async (page) => {
      await page.getByTestId("timeline-setup-continue-budget").waitFor();
      await page.getByTestId("timeline-setup-continue-budget").click();
      await page.getByTestId("timeline-setup-budget-table").waitFor();
      await page.getByTestId("timeline-setup-complete").click();
    },
    viewports: [desktop],
    waitFor: async (page) => {
      await waitForWorkspace(page);
      await page.getByTestId("timeline-cashflow-chart").waitFor();
      await page.getByTestId("timeline-draw-availability-chart").waitFor();
    },
  },
];

const server = spawn(
  "bun",
  [
    "x",
    "vite",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      DRAWFLOW_VISUAL_PARITY_FIXTURE: "1",
      VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    for (const screen of screens) {
      for (const viewport of screen.viewports) {
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(15_000);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${baseUrl}${screen.path}`, {
          waitUntil: "domcontentloaded",
        });
        await screen.prepare?.(page);
        await screen.waitFor(page);
        await page.waitForTimeout(350);
        const outPath = resolve(
          root,
          "reports",
          "production-timeline-migration",
          screen.id,
          `${viewport.label}.png`,
        );
        mkdirSync(dirname(outPath), { recursive: true });
        await page.screenshot({
          animations: "disabled",
          caret: "hide",
          fullPage: screen.id === "settings-template-milestone-table",
          path: outPath,
        });
        await page.close();
        console.log(
          `${screen.id} ${viewport.label}: ${outPath.replace(`${root}/`, "")}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}

async function waitForWorkspace(page) {
  await page.getByTestId("timeline-workspace-grid").waitFor();
  await page.getByTestId("timeline-cashflow-chart").waitFor({
    state: "attached",
  });
  await page.getByTestId("timeline-roadmap-grid").waitFor({
    state: "attached",
  });
  await page.getByTestId("timeline-draw-availability-chart").waitFor({
    state: "attached",
  });
}

async function selectMilestone(page, milestoneKey) {
  await waitForWorkspace(page);
  const node = page.getByTestId(`demo-timeline-node-${milestoneKey}`);
  await node.scrollIntoViewIfNeeded();
  await node.click({ force: true });
}

async function selectDraw(page, milestoneKey) {
  await waitForWorkspace(page);
  const marker = page.getByTestId(`timeline-draw-marker-${milestoneKey}`).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await marker.waitFor({ state: "visible" });
      await marker.scrollIntoViewIfNeeded();
      await marker.click({ force: true });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250);
    }
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(
    `Timed out waiting for ${baseUrl}. Last error: ${lastError}\n${serverOutput}`,
  );
}
