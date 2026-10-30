// Opens the production build in Chromium and fails on any page error: the start screen, then the
// sample project with its PDF drawn and its measurements listed. Run `npm run build` first.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SMOKE_PORT || 4184);
const url = `http://127.0.0.1:${port}/plan-measure/`;

async function startPreview() {
  const vite = path.join(repo, "node_modules/vite/bin/vite.js");
  const server = spawn(
    process.execPath,
    [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: repo, stdio: "pipe" },
  );
  let stderr = "";
  server.stderr.on("data", (data) => {
    stderr += data;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited: ${stderr}`);
    try {
      if ((await fetch(url)).ok) return server;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  throw new Error("vite preview did not start");
}

async function waitUntil(condition, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function check(name, action) {
  process.stdout.write(`${name}… `);
  await action();
  console.log("ok");
}

const server = await startPreview();
let browser;
const problems = [];
try {
  browser = await chromium.launch(
    process.env.SMOKE_CHROMIUM_PATH ? { executablePath: process.env.SMOKE_CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => problems.push(`Page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`Console error: ${message.text()}`);
  });

  await check("Start screen", async () => {
    await page.goto(url);
    await page.getByRole("heading", { name: "Open a plan to start measuring" }).waitFor();
  });

  await check("Sample project", async () => {
    await page.goto(`${url}?sample=1`);
    const canvas = page.locator('canvas[aria-label^="PDF page"]').first();
    await canvas.waitFor();
    await waitUntil(() => canvas.evaluate((element) => element.width > 1 && element.height > 1));
    // The sample ships with measurements; the list holds them even while its panel is closed.
    await page.locator("[data-measurement-id]").first().waitFor({ state: "attached" });
    if (process.env.SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.SMOKE_SCREENSHOT });
  });
} catch (error) {
  problems.push(String(error));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (problems.length) {
  console.error(`\nSmoke test failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
