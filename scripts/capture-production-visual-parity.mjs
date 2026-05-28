import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.DRAWFLOW_VISUAL_PARITY_PORT ?? 3177);
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = [
  { height: 1000, label: "1440x1000", width: 1440 },
  { height: 768, label: "1024x768", width: 1024 },
  { height: 844, label: "390x844", width: 390 },
];

const screens = [
  {
    id: "vp-000",
    path: "/builder",
    waitFor: async (page) => {
      await page.getByText("Builder dashboard").waitFor();
      await page.getByText("Recent proposal workspaces").waitFor();
    },
  },
  {
    id: "vp-001",
    path: "/builder/proposals",
    waitFor: async (page) => {
      await page.getByText("Proposal registry").waitFor();
    },
  },
  {
    id: "vp-002",
    path: "/builder/proposals/new",
    waitFor: async (page) => {
      await page.getByTestId("timeline-setup-template-screen").waitFor();
    },
  },
  {
    id: "vp-003",
    path: "/builder/proposals/new",
    prepare: async (page) => {
      await page.getByTestId("timeline-setup-continue-budget").click();
    },
    waitFor: async (page) => {
      await page.getByTestId("timeline-setup-budget-table").waitFor();
    },
  },
  {
    id: "vp-004",
    path: "/builder/proposals/proposal_visual_parity/roadmap",
    waitFor: async (page) => {
      await page.getByTestId("animated-curved-timeline").waitFor();
      await page.getByTestId("production-roadmap-cashflow-chart").waitFor();
    },
  },
  {
    id: "vp-005",
    path: "/builder/proposals/proposal_visual_parity",
    waitFor: async (page) => {
      await page.getByText("Proposal identity").waitFor();
      await page.getByText("Draw schedule", { exact: true }).waitFor();
    },
  },
  {
    id: "vp-006",
    path: "/backoffice/proposals",
    waitFor: async (page) => {
      await page.getByText("Proposal kanban").waitFor();
      await page.getByText("Submitted").waitFor();
    },
  },
  {
    id: "vp-007",
    path: "/backoffice/proposals/proposal_visual_parity",
    waitFor: async (page) => {
      await page.getByText("Review decision").waitFor();
      await page.getByText("Backoffice draw schedule").waitFor();
    },
  },
  {
    id: "vp-008",
    path: "/backoffice/settings",
    waitFor: async (page) => {
      await page.getByText("Production proposal settings").waitFor();
      await page.getByText("Proposal-flow foundation").waitFor();
    },
  },
  {
    id: "vp-009",
    path: "/backoffice/user-management",
    waitFor: async (page) => {
      await page.getByText("Brokerage provisioning").waitFor();
      await page.getByText("Oakline Lending").first().waitFor();
    },
  },
];

const server = spawn(
  "bun",
  ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(port)],
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
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        await page.goto(`${baseUrl}${screen.path}`, {
          waitUntil: "domcontentloaded",
        });
        await screen.prepare?.(page);
        await screen.waitFor(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const outPath = resolve(
          root,
          "reports",
          "visual-parity",
          screen.id,
          `production-${viewport.label}.png`,
        );
        mkdirSync(dirname(outPath), { recursive: true });
        await page.screenshot({
          animations: "disabled",
          caret: "hide",
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
