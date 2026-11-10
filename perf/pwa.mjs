// Checks that the production build installs and starts offline: the manifest is valid and its icons
// load, the service worker activates and precaches the build, and after going offline the app still
// opens (start screen and sample project) with no failed same-origin request and no CSP violation.
// Run `npm run build` first, then `npm run test:pwa`.
/* global window, document, navigator, caches -- referenced only inside page.evaluate callbacks, which run in the browser. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PWA_PORT || 4186);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, action) {
  process.stdout.write(`${name}… `);
  await action();
  console.log("ok");
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(Buffer.from(bytes.subarray(0, 8)).equals(signature), "icon is not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return `${view.getUint32(16)}x${view.getUint32(20)}`;
}

const server = await startPreview();
let browser;
const problems = [];
try {
  browser = await chromium.launch(
    process.env.SMOKE_CHROMIUM_PATH ? { executablePath: process.env.SMOKE_CHROMIUM_PATH } : {},
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => problems.push(`Page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`Console error: ${message.text()}`);
  });
  const sameOrigin = (request) => request.url().startsWith(new URL(url).origin);
  let offline = false;
  page.on("requestfailed", (request) => {
    if (offline && sameOrigin(request)) {
      problems.push(`Failed offline request: ${request.url()} (${request.failure()?.errorText})`);
    }
  });
  page.on("response", (response) => {
    if (sameOrigin(response.request()) && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  const readCspViolations = () => page.evaluate(() => window.__cspViolations);
  const appStarts = () =>
    page.getByRole("heading", { name: "Open a plan to start measuring" }).waitFor();

  const worker = await (await fetch(`${url}sw.js`)).text();
  const version = /const VERSION = "(\w+)"/.exec(worker)?.[1];
  const precache = JSON.parse(/const PRECACHE_URLS = (\[[\s\S]*?\]);/.exec(worker)?.[1] ?? "null");
  assert(version && Array.isArray(precache) && precache.length > 0, "sw.js has no version or list");
  assert(precache.includes("index.html"), "index.html is not precached");
  assert(
    !precache.some((file) => file.startsWith("pdfjs/")),
    "pdf.js resources must be cached at run time, not precached",
  );

  await check("Manifest and icons", async () => {
    await page.goto(url);
    await appStarts();
    const manifestUrl = await page.evaluate(
      () => document.querySelector('link[rel="manifest"]')?.href,
    );
    assert(manifestUrl === `${url}manifest.webmanifest`, `Manifest link is ${manifestUrl}`);
    const manifest = await (await fetch(manifestUrl)).json();
    assert(manifest.name === "Plan Measure" && manifest.short_name, "Manifest has no name");
    assert(manifest.display === "standalone", "Manifest is not standalone");
    assert(new URL(manifest.start_url, manifestUrl).href === url, "start_url is not the app");
    assert(new URL(manifest.scope, manifestUrl).href === url, "scope is not the app");
    assert(/^#[0-9a-f]{6}$/i.test(manifest.theme_color), "Manifest has no theme_color");
    assert(/^#[0-9a-f]{6}$/i.test(manifest.background_color), "Manifest has no background_color");
    const sizes = [];
    for (const icon of manifest.icons) {
      const response = await fetch(new URL(icon.src, manifestUrl));
      assert(response.ok, `Icon ${icon.src} not served (${response.status})`);
      const actual = pngSize(new Uint8Array(await response.arrayBuffer()));
      assert(actual === icon.sizes, `Icon ${icon.src} is ${actual}, manifest says ${icon.sizes}`);
      sizes.push(`${icon.sizes}${icon.purpose === "maskable" ? " maskable" : ""}`);
    }
    for (const required of ["192x192", "512x512", "512x512 maskable"]) {
      assert(sizes.includes(required), `Manifest has no ${required} icon`);
    }
  });

  await check("Service worker precaches the build", async () => {
    await waitUntil(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === "activated";
      }),
    );
    const missing = await page.evaluate(
      async ([name, files]) => {
        const cache = await caches.open(name);
        const missing = [];
        for (const file of files) {
          if (!(await cache.match(new URL(file, document.baseURI)))) missing.push(file);
        }
        return missing;
      },
      [`plan-measure-precache-${version}`, precache],
    );
    assert(missing.length === 0, `Not precached: ${missing.join(", ")}`);
  });

  await check("Online reload is served by the worker", async () => {
    await page.reload();
    await appStarts();
    assert(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
      "The page is not controlled by the worker",
    );
  });

  await check("Offline start screen", async () => {
    await context.setOffline(true);
    offline = true;
    await page.reload();
    await appStarts();
    assert(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
      "The offline page is not controlled by the worker",
    );
  });

  await check("Offline sample project", async () => {
    await page.goto(`${url}?sample=1`);
    const canvas = page.locator('canvas[aria-label^="PDF page"]').first();
    await canvas.waitFor();
    await waitUntil(() => canvas.evaluate((element) => element.width > 1 && element.height > 1));
    await page.locator("[data-measurement-id]").first().waitFor({ state: "attached" });
  });

  await check("No CSP violations", async () => {
    const violations = await readCspViolations();
    assert(violations.length === 0, `CSP violations: ${violations.join("; ")}`);
  });
} catch (error) {
  problems.push(String(error));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

if (problems.length) {
  console.error(`\nPWA test failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
