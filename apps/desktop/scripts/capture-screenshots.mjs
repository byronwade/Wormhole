import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const OUT = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";

const pages = [
  { name: "01-portal-empty", path: "/?preview=portal", w: 1280, h: 800 },
  { name: "02-portal-sessions", path: "/?preview=sessions", w: 1280, h: 800 },
  { name: "03-share-mount", path: "/?preview=share", w: 1280, h: 800 },
  { name: "04-share-drop", path: "/?preview=share-drop", w: 1280, h: 800 },
  { name: "05-share-success", path: "/?preview=share-success", w: 1280, h: 800 },
  { name: "06-connect", path: "/?preview=connect", w: 1280, h: 800 },
  { name: "07-connect-mounted", path: "/?preview=connect-success", w: 1280, h: 800 },
  { name: "08-settings", path: "/?preview=settings", w: 1280, h: 900 },
  { name: "09-sharing-history", path: "/?preview=sharing", w: 1280, h: 800 },
  { name: "10-mounts-history", path: "/?preview=mounts", w: 1280, h: 800 },
  { name: "11-portal-mobile", path: "/?preview=sessions", w: 390, h: 844 },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

for (const entry of pages) {
  const context = await browser.newContext({
    viewport: { width: entry.w, height: entry.h },
    deviceScaleFactor: entry.w < 500 ? 2 : 2,
  });
  const page = await context.newPage();
  const url = `${BASE}${entry.path}`;
  console.log(`Capturing ${entry.name} ← ${url} (${entry.w}x${entry.h})`);
  await page.goto(url, { waitUntil: "networkidle" });
  // sessions preview emits transfer-progress after ~700ms
  await page.waitForTimeout(entry.name.includes("sessions") || entry.name.includes("mobile") ? 1200 : 700);
  const file = path.join(OUT, `${entry.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${file}`);
  await context.close();
}

await browser.close();
console.log("Done.");
