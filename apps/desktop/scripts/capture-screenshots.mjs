import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const OUT = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";

const pages = [
  { name: "01-portal", path: "/" },
  { name: "02-share-dialog", path: "/?preview=share" },
  { name: "03-share-success", path: "/?preview=share-success" },
  { name: "04-connect-dialog", path: "/?preview=connect" },
  { name: "05-connect-mounted", path: "/?preview=connect-success" },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});

const page = await context.newPage();

for (const entry of pages) {
  const url = `${BASE}${entry.path}`;
  console.log(`Capturing ${entry.name} ← ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const file = path.join(OUT, `${entry.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${file}`);
}

await browser.close();
console.log("Done.");
