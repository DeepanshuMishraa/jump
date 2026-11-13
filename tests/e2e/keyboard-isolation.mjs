#!/usr/bin/env node
/**
 * Keyboard isolation end-to-end check for the in-page palette.
 *
 * Runs headful Chromium with the built extension loaded against a fixture page
 * that mimics ChatGPT (document keydown focuses a composer) and T3 Code (window
 * capture keydown logs and swallows navigation keys).
 *
 * Usage:
 *   xvfb-run -a node tests/e2e/keyboard-isolation.mjs
 *   EXT_DIST=/path/to/dist xvfb-run -a node tests/e2e/keyboard-isolation.mjs
 *
 * Assertions:
 *   1. typing reaches the palette input and the page sees none of it
 *   2. ArrowDown moves the palette selection
 *   3. Escape closes the palette and the page gets its keys back
 *   4. Enter opens the matched tab
 *   5. switcher mode: Alt+Tab cycles inside the palette, Alt release activates
 *      the expected tab, and the page never sees the keys
 *
 * Needs playwright-core (not a project dependency, so install it without saving:
 * `npm i --no-save playwright-core`),
 * a Playwright Chromium in ~/.cache/ms-playwright (or CHROME_PATH), and `pnpm build`.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const extensionDir = path.resolve(process.env.EXT_DIST ?? path.join(repoRoot, "dist"));
const artifactDir = path.join(here, "artifacts");
const profileDir = path.join(here, ".profile");
const fixturePath = path.join(here, "fixture.html");

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = await predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function checkEventually(name, predicate, timeout = 5000) {
  try {
    const value = await waitFor(name, predicate, timeout);
    check(name, true, value === true ? "" : String(value));
    return true;
  } catch (error) {
    check(name, false, error.message);
    return false;
  }
}

function chromiumExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cacheDir = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!existsSync(cacheDir)) throw new Error(`no Playwright browser cache at ${cacheDir}`);
  const builds = readdirSync(cacheDir)
    .filter((entry) => /^chromium-\d+$/.test(entry))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const candidate = path.join(cacheDir, build, relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error("no chromium binary in the Playwright browser cache");
}

function startServer(html) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function walkNodes(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walkNodes(child, visit);
  for (const shadow of node.shadowRoots ?? []) walkNodes(shadow, visit);
  if (node.contentDocument) walkNodes(node.contentDocument, visit);
  if (node.templateContent) walkNodes(node.templateContent, visit);
}

function isPaletteHost(node) {
  const attributes = node.attributes ?? [];
  for (let index = 0; index < attributes.length; index += 2) {
    if (attributes[index] === "id" && attributes[index + 1] === "jump-command-palette") return true;
  }
  return false;
}

/**
 * Handle on the palette's closed shadow root. DevTools (and therefore CDP) can
 * pierce closed shadow roots, which is how these checks read the palette
 * without shipping a production test hook.
 */
async function paletteHandle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  let hostNode;
  walkNodes(root, (node) => {
    if (!hostNode && isPaletteHost(node)) hostNode = node;
  });
  if (!hostNode) {
    await cdp.detach().catch(() => undefined);
    return undefined;
  }
  let shadowNode = hostNode.shadowRoots?.[0];
  if (!shadowNode && hostNode.backendNodeId !== undefined) {
    const described = await cdp.send("DOM.describeNode", { backendNodeId: hostNode.backendNodeId, pierce: true });
    shadowNode = described.node.shadowRoots?.[0];
  }
  if (!shadowNode) throw new Error("closed shadow root not reachable over CDP");
  const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: shadowNode.backendNodeId });
  const objectId = object?.objectId;
  if (!objectId) throw new Error("could not resolve the palette shadow root to a JS object");
  const call = async (functionDeclaration) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return { cdp, call, detach: () => cdp.detach().catch(() => undefined) };
}

const paletteMounted = (page) => page.evaluate(() => Boolean(document.getElementById("jump-command-palette")));

const INPUT_FOCUSED =
  "function(){ const input = this.querySelector('.search-input'); return Boolean(input) && this.activeElement === input; }";

const fixtureState = (page) =>
  page.evaluate(() => {
    const composer = document.getElementById("composer");
    const active = document.activeElement;
    return {
      log: window.__fixtureLog.slice(),
      composer: composer.value,
      composerFocused: active === composer,
      activeElement: active ? active.id || active.tagName : null,
    };
  });

async function tabIdOf(worker, url) {
  return worker.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === targetUrl)?.id;
  }, url);
}

async function activeTabUrl(worker) {
  return worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0]?.url;
  });
}

async function sendOpenPalette(worker, tabId, mode, activeTabId) {
  await worker.evaluate(
    async ({ tabId: targetTabId, mode: paletteMode, activeTabId: initialTabId }) => {
      const message = { type: "open-palette", mode: paletteMode };
      if (initialTabId !== undefined) message.activeTabId = initialTabId;
      await chrome.tabs.sendMessage(targetTabId, message);
    },
    { tabId, mode, activeTabId },
  );
}

async function main() {
  if (!existsSync(extensionDir)) throw new Error(`extension build not found at ${extensionDir} (run pnpm build)`);
  if (!process.env.DISPLAY) throw new Error("no DISPLAY: run under `xvfb-run -a`");
  mkdirSync(artifactDir, { recursive: true });
  rmSync(profileDir, { recursive: true, force: true });

  const server = await startServer(readFileSync(fixturePath, "utf8"));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath: chromiumExecutable(),
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-search-engine-choice-screen",
      ],
    });

    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30000 });

    const palettePage = context.pages()[0] ?? (await context.newPage());
    const paletteUrl = `${baseUrl}/fixture.html?title=${encodeURIComponent("Palette Fixture")}`;
    const githubUrl = `${baseUrl}/github?title=GitHub`;
    const docsUrl = `${baseUrl}/docs?title=Docs`;
    await palettePage.goto(paletteUrl);
    const githubPage = await context.newPage();
    await githubPage.goto(githubUrl);
    const docsPage = await context.newPage();
    await docsPage.goto(docsUrl);
    await palettePage.bringToFront();
    await sleep(300);

    const paletteTabId = await tabIdOf(worker, paletteUrl);
    check("three fixture tabs are open", paletteTabId !== undefined, `tabId=${paletteTabId}`);

    // ---------------------------------------------------------------- search
    // __fixtureReset() blurs the composer, so page focus starts on <body>.
    await palettePage.evaluate(() => window.__fixtureReset());
    await sendOpenPalette(worker, paletteTabId, "search");
    await waitFor("palette mounted", () => paletteMounted(palettePage));
    let palette = await paletteHandle(palettePage);
    await checkEventually("search input takes focus inside the shadow root", () => palette.call(INPUT_FOCUSED));

    await palettePage.keyboard.type("github", { delay: 30 });
    const typed = await waitFor(
      "typed text in the palette input",
      async () => {
        const value = await palette.call("function(){ return this.querySelector('.search-input').value; }");
        return value === "github" ? "value=github" : undefined;
      },
      5000,
    ).catch(() => undefined);
    check("typing lands in the palette input", typed !== undefined, typed ?? "input did not receive the text");

    const searchState = await fixtureState(palettePage);
    check("page key listeners saw no palette keystrokes", searchState.log.length === 0, `log=${JSON.stringify(searchState.log.slice(0, 8))}`);
    check("ChatGPT-style composer stayed empty", searchState.composer === "", `composer=${JSON.stringify(searchState.composer)}`);
    check("composer did not steal focus", searchState.composerFocused === false, `activeElement=${searchState.activeElement}`);
    await palettePage.screenshot({ path: path.join(artifactDir, "01-search-typed.png") });

    // -------------------------------------------------------------- ArrowDown
    const selectedBefore = await palette.call(
      "function(){ const row = this.querySelector('.list-row.selected'); return row ? { index: Number(row.dataset.index), title: row.querySelector('.row-title')?.textContent ?? '' } : null; }",
    );
    await palettePage.keyboard.press("ArrowDown");
    await sleep(150);
    const selectedAfter = await palette.call(
      "function(){ const row = this.querySelector('.list-row.selected'); return row ? { index: Number(row.dataset.index), title: row.querySelector('.row-title')?.textContent ?? '' } : null; }",
    );
    check(
      "ArrowDown moves the palette selection",
      Boolean(selectedBefore && selectedAfter) && selectedAfter.index === selectedBefore.index + 1,
      `before=${JSON.stringify(selectedBefore)} after=${JSON.stringify(selectedAfter)}`,
    );
    await palettePage.screenshot({ path: path.join(artifactDir, "02-search-arrowdown.png") });

    // ------------------------------------------------------- focus stolen
    // The page moves focus to its composer while the palette is open; the
    // next keystrokes must still reach the palette input.
    await palettePage.evaluate(() => document.getElementById("composer").focus());
    await palettePage.keyboard.type("x", { delay: 30 });
    const afterSteal = await waitFor(
      "typing after focus steal",
      async () => {
        const value = await palette.call("function(){ return this.querySelector('.search-input').value; }");
        return value === "githubx" ? "value=githubx" : undefined;
      },
      3000,
    ).catch(() => undefined);
    check("typing reaches the palette after the page steals focus", afterSteal !== undefined, afterSteal ?? "input did not receive x");
    const stealState = await fixtureState(palettePage);
    check("composer stays empty after the focus steal", stealState.composer === "", `composer=${JSON.stringify(stealState.composer)}`);

    // ----------------------------------------------------------------- Escape
    await palettePage.keyboard.press("Escape");
    await checkEventually(
      "first Escape clears the query",
      async () => {
        const value = await palette.call("function(){ return this.querySelector('.search-input').value; }");
        return value === "" ? "query empty" : undefined;
      },
    );
    await palettePage.keyboard.press("Escape");
    await checkEventually("second Escape closes the palette", async () => (await paletteMounted(palettePage)) === false);
    await palette.detach();

    await palettePage.evaluate(() => window.__fixtureReset());
    await palettePage.keyboard.press("a");
    await sleep(150);
    const afterClose = await fixtureState(palettePage);
    check("page listeners fire again after the palette closes", afterClose.log.length > 0, `log=${JSON.stringify(afterClose.log)}`);
    check("page receives the keystroke after close", afterClose.composer === "a", `composer=${JSON.stringify(afterClose.composer)} focused=${afterClose.composerFocused}`);
    await palettePage.screenshot({ path: path.join(artifactDir, "03-after-close.png") });

    // ------------------------------------------------------------------ Enter
    await palettePage.bringToFront();
    await sleep(200);
    // __fixtureReset() blurs the composer, so page focus starts on <body>.
    await palettePage.evaluate(() => window.__fixtureReset());
    await sendOpenPalette(worker, paletteTabId, "search");
    await waitFor("palette mounted again", () => paletteMounted(palettePage));
    palette = await paletteHandle(palettePage);
    await waitFor("search input focused again", () => palette.call(INPUT_FOCUSED));
    await palettePage.keyboard.type("github", { delay: 30 });
    await checkEventually(
      "query typed for Enter",
      async () => {
        const value = await palette.call("function(){ return this.querySelector('.search-input').value; }");
        return value === "github" ? "value=github" : undefined;
      },
    );
    await palettePage.screenshot({ path: path.join(artifactDir, "04-enter-before.png") });
    await palettePage.keyboard.press("Enter");
    const enterOk = await waitFor("github tab activated", async () => (await activeTabUrl(worker)) === githubUrl, 8000).catch(
      () => undefined,
    );
    check("Enter opens the matched tab", enterOk !== undefined, `active=${await activeTabUrl(worker)}`);
    await checkEventually("palette closes after opening a tab", async () => (await paletteMounted(palettePage)) === false);
    await palette.detach();

    // -------------------------------------------------------------- switcher
    await palettePage.bringToFront();
    await sleep(400);
    await palettePage.evaluate(() => window.__fixtureReset());
    await sendOpenPalette(worker, paletteTabId, "switcher", paletteTabId);
    await waitFor("switcher mounted", () => paletteMounted(palettePage));
    palette = await paletteHandle(palettePage);
    await checkEventually(
      "switcher container holds focus",
      () => palette.call("function(){ return this.activeElement === this.querySelector('.switcher-hud'); }"),
    );
    const readSelection = () =>
      palette.call(
        "function(){ const card = this.querySelector('[data-switcher-index].is-selected'); return card ? Number(card.getAttribute('data-switcher-index')) : null; }",
      );
    await waitFor("switcher cards rendered", () =>
      palette.call("function(){ return this.querySelectorAll('[data-switcher-index]').length === 3; }"),
    );
    const switcherCardCount = await palette.call("function(){ return this.querySelectorAll('[data-switcher-index]').length; }");
    check("switcher lists all three tabs", switcherCardCount === 3, `cards=${switcherCardCount}`);
    const selectionOpen = await readSelection();
    check("switcher selects the next tab on open", selectionOpen === 1, `selected=${selectionOpen}`);
    await palettePage.screenshot({ path: path.join(artifactDir, "05-switcher-open.png") });

    await palettePage.keyboard.down("Alt");
    await palettePage.keyboard.press("Tab");
    await sleep(120);
    const selectionFirstTab = await readSelection();
    await palettePage.keyboard.press("Tab");
    await sleep(120);
    const selectionSecondTab = await readSelection();
    const switcherState = await fixtureState(palettePage);
    await palettePage.screenshot({ path: path.join(artifactDir, "06-switcher-cycled.png") });

    check("first Alt+Tab moves the switcher selection", selectionFirstTab === 2, `selected=${selectionFirstTab}`);
    check("second Alt+Tab wraps the switcher selection", selectionSecondTab === 0, `selected=${selectionSecondTab}`);
    check("page saw no switcher keystrokes", switcherState.log.length === 0, `log=${JSON.stringify(switcherState.log.slice(0, 8))}`);

    // Index 0 is this (already active) tab, so a missing activation would go
    // unnoticed there: move on to another tab before releasing Alt.
    await palettePage.keyboard.press("Tab");
    await sleep(120);
    const selectionThirdTab = await readSelection();
    const selectedTitle = await palette.call(
      "function(){ return this.querySelector('[data-switcher-index].is-selected .switcher-card-title')?.textContent ?? null; }",
    );
    check("third Alt+Tab selects another tab", selectionThirdTab === 1 && Boolean(selectedTitle), `selected=${selectionThirdTab} title=${selectedTitle}`);

    await palettePage.keyboard.up("Alt");
    const switcherClosed = await waitFor("switcher closed", async () => (await paletteMounted(palettePage)) === false, 8000).catch(
      () => undefined,
    );
    check("releasing Alt closes the switcher", switcherClosed !== undefined);
    const activeAfterSwitcher = await waitFor(
      "selected tab activated",
      () => worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return tab ? { url: tab.url, title: tab.title } : undefined;
      }).then((tab) => (tab && tab.url !== paletteUrl ? tab : undefined)),
      8000,
    ).catch(() => undefined);
    check(
      "releasing Alt activates the tab selected by Alt+Tab",
      activeAfterSwitcher !== undefined && activeAfterSwitcher.title === selectedTitle,
      `active=${JSON.stringify(activeAfterSwitcher)} expected title=${selectedTitle}`,
    );
    // Later sections type into the fixture tab again.
    await palettePage.bringToFront();
    await sleep(300);
    await palette.detach();

    // ------------------------------------------- new-tab page (window event root)
    // The new-tab page renders App in a normal document with no shadow root, so
    // its keyboard handlers must keep working on the default (window) root.
    const extensionId = new URL(worker.url()).host;
    const appPage = await context.newPage();
    await appPage.goto(`chrome-extension://${extensionId}/index.html`);
    await appPage.bringToFront();
    await sleep(200);
    await appPage.keyboard.press("Control+Shift+P");
    await checkEventually("new-tab page palette opens", () =>
      appPage.evaluate(() => Boolean(document.querySelector(".search-input"))),
    );
    await appPage.keyboard.type("abc");
    await checkEventually(
      "new-tab page palette receives keystrokes",
      async () => {
        const value = await appPage.evaluate(() => document.querySelector(".search-input")?.value ?? null);
        return value === "abc" ? "value=abc" : undefined;
      },
    );
    await appPage.keyboard.press("Escape");
    await appPage.keyboard.press("Escape");
    await checkEventually("new-tab page palette closes on Escape", async () =>
      (await appPage.evaluate(() => Boolean(document.querySelector(".search-input")))) === false,
    );

    const failed = checks.filter((entry) => !entry.ok);
    writeFileSync(
      path.join(artifactDir, "last-run.json"),
      JSON.stringify({ extensionDir, checks, failed: failed.length }, null, 2),
    );
    console.log(`\n${failed.length === 0 ? "RESULT: PASS" : "RESULT: FAIL"} (${checks.length - failed.length}/${checks.length} checks)`);
    return failed.length === 0;
  } finally {
    await context?.close().catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error(`FAIL  harness error: ${error.stack ?? error}`);
    try {
      writeFileSync(path.join(artifactDir, "last-run.json"), JSON.stringify({ error: String(error), checks }, null, 2));
    } catch {
      // Artifact writing is best-effort.
    }
    process.exit(1);
  });
