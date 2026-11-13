#!/usr/bin/env node
/**
 * One-shot real-site check: open a URL, open the Jump palette, type "hello",
 * press Escape twice, and report whether the site's text boxes stayed empty and
 * the palette handled the keys.
 *
 * Usage: xvfb-run -a node tests/e2e/site-check.mjs <url> [name]
 *
 * Needs playwright-core (not a project dependency): `pnpm add -D playwright-core`,
 * a Playwright Chromium in ~/.cache/ms-playwright (or CHROME_PATH), and `pnpm build`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const extensionDir = path.resolve(process.env.EXT_DIST ?? path.join(repoRoot, "dist"));
const artifactDir = path.join(here, "artifacts");
const siteUrl = process.argv[2];
if (!siteUrl) throw new Error("usage: site-check.mjs <url> [name]");
const siteOrigin = new URL(siteUrl).origin;
const siteName = process.argv[3] ?? new URL(siteUrl).hostname;
const profileDir = path.join(here, ".site-profile");

function chromiumExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cacheDir = path.join(os.homedir(), ".cache", "ms-playwright");
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

async function paletteShadowRoot(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  let hostNode;
  const walk = (node) => {
    const attributes = node.attributes ?? [];
    for (let index = 0; index < attributes.length; index += 2) {
      if (attributes[index] === "id" && attributes[index + 1] === "jump-command-palette") hostNode = node;
    }
    for (const child of node.children ?? []) walk(child);
    for (const shadow of node.shadowRoots ?? []) walk(shadow);
  };
  walk(root);
  const shadowNode = hostNode?.shadowRoots?.[0];
  if (!shadowNode) return undefined;
  const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: shadowNode.backendNodeId });
  return {
    call: async (functionDeclaration) => {
      const { result } = await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration,
        returnByValue: true,
      });
      return result.value;
    },
    detach: () => cdp.detach().catch(() => undefined),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// KEEP_PROFILE=1 keeps the browser profile (and any login/pairing) between runs.
const keepProfile = process.env.KEEP_PROFILE === "1";
mkdirSync(artifactDir, { recursive: true });
if (!keepProfile) rmSync(profileDir, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: chromiumExecutable(),
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

try {
  let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30000 }));
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);
  // PAIR_TOKEN_FILE: pair a T3 Code environment first. The token is never printed.
  if (process.env.PAIR_TOKEN_FILE && new URL(page.url()).pathname.startsWith("/pair")) {
    const token = readFileSync(process.env.PAIR_TOKEN_FILE, "utf8").trim();
    await page.locator("input").first().fill(token);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/pair"), { timeout: 30000 });
    await sleep(6000);
    console.log("paired: yes");
  }
  // Focus the site's own text box first, like a user typing in it who then
  // presses the palette shortcut.
  const focusedComposer = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 40 && rect.height > 10;
      });
    const composer = candidates.at(-1);
    if (!composer) return null;
    composer.focus();
    return `${composer.tagName.toLowerCase()}${composer.id ? `#${composer.id}` : ""}`;
  });
  console.log(`site text box focused before opening: ${focusedComposer ?? "none found"}`);
  console.log(`url: ${page.url()}`);
  console.log(`title: ${await page.title()}`);
  const blocked = await page.evaluate(() =>
    /just a moment|verify you are human|cloudflare/i.test(`${document.title} ${document.body?.innerText?.slice(0, 400) ?? ""}`),
  );
  if (blocked) {
    console.log("BLOCKED  Cloudflare/challenge page; not fighting it");
    await page.screenshot({ path: path.join(artifactDir, `${siteName}-blocked.png`) });
    process.exitCode = 2;
  } else {
    const tabId = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url?.startsWith(url))?.id;
    }, siteOrigin);
    if (tabId === undefined) throw new Error(`no ${siteOrigin} tab visible to the extension`);
    await page.screenshot({ path: path.join(artifactDir, `${siteName}-before.png`) });
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { type: "open-palette", mode: "search" });
    }, tabId);
    await sleep(800);
    const palette = await paletteShadowRoot(page);
    if (!palette) throw new Error(`palette did not mount on ${siteName}`);
    console.log(`palette mounted: yes`);
    await page.keyboard.type("hello", { delay: 40 });
    await sleep(400);
    const paletteValue = await palette.call("function(){ return this.querySelector('.search-input')?.value ?? null; }");
    const siteState = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')];
      const visible = candidates.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 40 && rect.height > 10;
      });
      const composer = document.querySelector("#prompt-textarea") ?? visible.at(-1) ?? null;
      const textOf = (element) => (element ? (element.value ?? element.innerText ?? element.textContent ?? "").trim() : null);
      return {
        composerPresent: Boolean(composer),
        composerTag: composer ? `${composer.tagName.toLowerCase()}${composer.id ? `#${composer.id}` : ""}` : null,
        composerText: textOf(composer),
        visibleComposers: visible.map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}=${JSON.stringify(textOf(element))}`),
        activeElement: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
        activeInsideComposer: Boolean(composer && document.activeElement === composer),
      };
    });
    console.log(`palette input value: ${JSON.stringify(paletteValue)}`);
    console.log(`site text boxes: ${JSON.stringify(siteState)}`);
    // Require a composer: `every` on no composers would pass without testing anything.
    const composerStayedEmpty = siteState.composerPresent && siteState.visibleComposers.length > 0 &&
      siteState.visibleComposers.every((entry) => entry.endsWith('=""'));
    console.log(
      paletteValue === "hello" && composerStayedEmpty && !siteState.activeInsideComposer
        ? "RESULT: PASS  palette kept the keystrokes and the composer stayed empty"
        : "RESULT: FAIL  see values above",
    );
    await page.screenshot({ path: path.join(artifactDir, `${siteName}-palette-typed.png`) });
    await page.keyboard.press("Escape");
    await sleep(300);
    const afterFirstEscape = await palette.call("function(){ return this.querySelector('.search-input')?.value ?? null; }");
    await page.keyboard.press("Escape");
    await sleep(500);
    const stillMounted = await page.evaluate(() => Boolean(document.getElementById("jump-command-palette")));
    console.log(`after Escape: query=${JSON.stringify(afterFirstEscape)}; after 2nd Escape palette mounted=${stillMounted}`);
    const escapeOk = afterFirstEscape === "" && !stillMounted;
    console.log(escapeOk ? "RESULT: PASS  Escape cleared the query, then closed the palette" : "RESULT: FAIL  Escape did not reach the palette");
    await palette.detach();
    process.exitCode = paletteValue === "hello" && composerStayedEmpty && !siteState.activeInsideComposer && escapeOk ? 0 : 1;
  }
} finally {
  await context.close().catch(() => undefined);
  if (!keepProfile) rmSync(profileDir, { recursive: true, force: true });
}
