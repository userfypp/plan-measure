// Cross-browser guard for keyboard navigation. Opens the production build in Chromium and WebKit
// (Safari's engine) and fails when Tab behaves differently between them or stops being usable:
// the same Tab and Shift+Tab sequence, focus that follows a mouse press, a dialog that traps Tab
// and gives focus back. Run `npm run build` first, then `npm run test:keyboard`.
// Real Safari cannot run in CI; its two known differences (buttons are not focused by a press, and
// Tab skips buttons unless the user enables "Press Tab to highlight each item") are covered by
// src/utils/clickFocus.ts and src/components/ui/tabNavigation.ts, with unit tests for both.
/* global document, window -- referenced only inside page.evaluate callbacks, which run in the browser. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.KEYBOARD_PORT || 4185);
// "localhost", not 127.0.0.1: WebKit only treats the former as a secure context, and IndexedDB needs one.
const url = `http://localhost:${port}/plan-measure/`;
const engines = { chromium, webkit };
const requested = (process.env.KEYBOARD_ENGINES || "chromium,webkit").split(",");

async function startPreview() {
  const vite = path.join(repo, "node_modules/vite/bin/vite.js");
  const server = spawn(
    process.execPath,
    [vite, "preview", "--host", "localhost", "--port", String(port), "--strictPort"],
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

/** A stable description of the focused element, or "<body>" when nothing is focused. */
const describeFocus = () => {
  const element = document.activeElement;
  if (!element || element === document.body || element === document.documentElement)
    return "<body>";
  const name =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    (element.textContent || "").trim().slice(0, 40) ||
    element.getAttribute("name") ||
    "";
  const role = element.getAttribute("role");
  return `${element.tagName.toLowerCase()}${role ? `[${role}]` : ""}:${name}`;
};

async function focused(page) {
  return page.evaluate(describeFocus);
}

async function sequence(page, key, count) {
  const seen = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    seen.push(await focused(page));
  }
  return seen;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runEngine(name) {
  // A persistent profile: WebKit refuses to store Blobs in IndexedDB in a throwaway context, which
  // would put the app in its "storage unavailable" state and change the Tab sequence.
  const profile = mkdtempSync(path.join(tmpdir(), `keyboard-${name}-`));
  const browser = await engines[name].launchPersistentContext(profile, {
    viewport: { width: 1440, height: 900 },
  });
  const results = {};
  try {
    const page = browser.pages()[0] ?? (await browser.newPage());
    page.setDefaultTimeout(30_000);
    const problems = [];
    page.on("pageerror", (error) => problems.push(`Page error: ${error.message}`));

    // Start screen: Tab visits every action once, in reading order, and never lands on <body>.
    await page.goto(url);
    await page.getByRole("heading", { name: "Open a plan to start measuring" }).waitFor();
    // The actions are disabled while the app starts, and "What's new" loads in an idle chunk; wait
    // for both so the sequence is the same every run.
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].every(
        (button) =>
          !/^(Open PDF|Try a sample)$/.test(button.textContent.trim()) || !button.disabled,
      ),
    );
    await page.getByRole("button", { name: /^What.s new/ }).waitFor();
    const startTabs = await sequence(page, "Tab", 4);
    assert(
      !startTabs.includes("<body>"),
      `${name}: Tab reached <body> on the start screen: ${startTabs.join(" > ")}`,
    );
    assert(
      startTabs.indexOf("button:Open PDF") !== -1 &&
        startTabs.indexOf("button:Open PDF") < startTabs.indexOf("button:Try a sample"),
      `${name}: start screen Tab order is ${startTabs.join(" > ")}`,
    );
    results.startTabs = startTabs;

    // A mouse press on a button must leave it focused (WebKit does not do this by itself), so the
    // next Tab continues from there instead of restarting at the top.
    const sample = page.getByRole("button", { name: "Try a sample" });
    await page.getByRole("button", { name: "Open PDF" }).focus();
    await page.mouse.click(0, 0);
    const trigger = page.getByRole("button", { name: /^What.s new/ });
    if (await trigger.count()) {
      const box = await trigger.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      assert(
        (await focused(page)).startsWith("dialog") ||
          (await page.locator("dialog[open]").count()) === 1,
        `${name}: What's new did not open`,
      );
      // The dialog traps Tab: a full lap stays inside and returns to where it started.
      const lap = await sequence(page, "Tab", 6);
      const inside = await page.evaluate(
        () => document.activeElement?.closest("dialog[open]") !== null,
      );
      assert(inside, `${name}: Tab left the dialog (${lap.join(" > ")})`);
      assert(!lap.includes("<body>"), `${name}: Tab reached <body> inside the dialog`);
      results.dialogLap = lap;
      await page.keyboard.press("Escape");
      await page.locator("dialog[open]").waitFor({ state: "detached" });
      const back = await focused(page);
      assert(
        back.startsWith("button:What"),
        `${name}: focus did not return to What's new, it is on ${back}`,
      );
      results.dialogReturn = back;
    }
    await sample.waitFor();

    // Sample project: the full Tab and Shift+Tab sequences are identical in every engine.
    await page.goto(`${url}?sample=1`);
    await page.locator('canvas[aria-label^="PDF page"]').first().waitFor();
    await page.locator("[data-measurement-id]").first().waitFor({ state: "attached" });
    // Tab walks the whole workspace once and then leaves the page (to <body> here), never earlier
    // and never in a loop; Shift+Tab retraces the same stops in reverse.
    // The app must drive every in-app Tab itself (the event arrives already handled): Safari's own
    // Tab skips buttons and links, so any step left to the browser is one Safari users cannot take.
    await page.evaluate(() => {
      window.__tabHandled = [];
      window.addEventListener("keydown", (event) => {
        if (event.key === "Tab") window.__tabHandled.push(event.defaultPrevented);
      });
    });
    await page.mouse.click(1, 1);
    const forward = [];
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press("Tab");
      const where = await focused(page);
      if (where === "<body>") break;
      forward.push(where);
    }
    assert(
      forward.length > 10 && forward.length < 200,
      `${name}: Tab walk is ${forward.length} long`,
    );
    assert(
      new Set(forward).size === forward.length,
      `${name}: Tab revisits a stop: ${forward.join(" > ")}`,
    );
    results.forward = forward;
    const handled = await page.evaluate(() => window.__tabHandled);
    assert(
      handled.length === forward.length + 1 && handled.slice(0, -1).every(Boolean),
      `${name}: some Tab presses inside the app were left to the browser: ${handled.join(",")}`,
    );
    await page.mouse.click(1, 1);
    for (let i = 0; i < forward.length; i++) await page.keyboard.press("Tab");
    assert((await focused(page)) === forward.at(-1), `${name}: Tab does not end on the last stop`);
    const backward = await sequence(page, "Shift+Tab", forward.length - 1);
    assert(
      JSON.stringify(backward) === JSON.stringify(forward.slice(0, -1).reverse()),
      `${name}: Shift+Tab does not retrace Tab: ${backward.join(" > ")}`,
    );
    results.backward = backward;

    // After a press on a toolbar button, Tab moves on from that button.
    const firstButton = page.locator("[data-tab-navigation-root] button:not([disabled])").first();
    await firstButton.waitFor();
    const box = await firstButton.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const pressed = await focused(page);
    assert(pressed !== "<body>", `${name}: a pressed button did not keep focus`);
    await page.keyboard.press("Tab");
    const afterPress = await focused(page);
    assert(
      afterPress !== "<body>" && afterPress !== pressed,
      `${name}: Tab after a press is stuck`,
    );
    results.afterPress = [pressed, afterPress];

    assert(problems.length === 0, `${name}: ${problems.join("; ")}`);
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
  return results;
}

const server = await startPreview();
const problems = [];
const all = {};
try {
  for (const name of requested) {
    process.stdout.write(`${name}… `);
    try {
      all[name] = await runEngine(name);
      console.log("ok");
    } catch (error) {
      console.log("failed");
      problems.push(String(error.message || error));
    }
  }
  const names = Object.keys(all);
  for (const key of [
    "startTabs",
    "dialogLap",
    "dialogReturn",
    "forward",
    "backward",
    "afterPress",
  ]) {
    const [first, ...rest] = names;
    for (const other of rest) {
      const a = JSON.stringify(all[first]?.[key]);
      const b = JSON.stringify(all[other]?.[key]);
      if (a !== b) problems.push(`${key} differs: ${first} ${a} vs ${other} ${b}`);
    }
  }
} finally {
  server.kill("SIGTERM");
}

if (problems.length) {
  console.error(`\nKeyboard test failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
