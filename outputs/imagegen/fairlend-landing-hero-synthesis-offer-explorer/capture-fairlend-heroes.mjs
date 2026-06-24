import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const outDir = path.resolve(
  "outputs/imagegen/fairlend-landing-hero-synthesis-offer-explorer"
);
const htmlUrl = pathToFileURL(
  path.join(outDir, "fairlend-hero-concepts.html")
).href;
const concepts = [
  "01-licensed-project-review",
  "02-company-trust-with-quiz",
  "03-progress-draw-control-plane",
  "04-site-verified-brokerage",
  "05-two-door-priority-builder",
  "06-capital-confidence-meter",
  "07-permit-to-payout-path",
  "08-brokerage-card-as-conversion-anchor",
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1728, height: 1212 },
  deviceScaleFactor: 1,
});

for (const concept of concepts) {
  const number = concept.slice(0, 2);
  await page.goto(`${htmlUrl}?concept=${number}&capture=1`, {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: path.join(outDir, `${concept}.png`),
    fullPage: false,
  });
}

await browser.close();
console.log(`Captured ${concepts.length} FairLend hero mockups in ${outDir}`);
