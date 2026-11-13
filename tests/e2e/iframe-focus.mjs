#!/usr/bin/env node
/**
 * Keyboard isolation when the page steals focus into an iframe.
 *
 * The keyboard guard listens on the top frame's window, so keys typed while an
 * iframe has focus never reach it. While the palette is open, a page that moves
 * focus into a same-origin or cross-site iframe must not receive the keys: the
 * palette pulls focus back as soon as focus enters a frame.
 *
 * Usage (after `pnpm build`; playwright-core is not a project dependency, so
 * install it without saving: `npm i --no-save playwright-core`):
 *   xvfb-run -a node tests/e2e/iframe-focus.mjs
 */
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const extensionDir = path.resolve(process.env.EXT_DIST ?? path.join(repoRoot, "dist"));

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

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A frame that focuses its own text box when told to (cross-site pages can only
// be focused from inside).
const frameHtml = `<!doctype html><textarea id="t"></textarea>
<script>addEventListener("message", (event) => { if (event.data === "steal") document.getElementById("t").focus(); });</script>`;

const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  if (request.url.startsWith("/frame")) {
    response.end(frameHtml);
    return;
  }
  const port = server.address().port;
  response.end(`<!doctype html><title>Iframe fixture</title>
<iframe id="same" srcdoc="<textarea id=t></textarea>"></iframe>
<iframe id="cross" src="http://localhost:${port}/frame"></iframe>
<div id="closed-host"></div>
<script>
  const closedRoot = document.getElementById("closed-host").attachShadow({ mode: "closed" });
  closedRoot.innerHTML = '<iframe srcdoc="<textarea id=t></textarea>"></iframe>';
  window.closedFrameTextarea = () => closedRoot.querySelector("iframe").contentDocument.getElementById("t");
</script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(path.join(os.tmpdir(), "jump-iframe-focus-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromiumExecutable(),
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--site-per-process"],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30000 }));
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.bringToFront();
  await sleep(1500);
  const crossFrame = page.frames().find((frame) => frame.url().includes("/frame"));

  const paletteValue = async () => {
    const session = await context.newCDPSession(page);
    try {
      const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
      // The shadow root is closed: find the input through the pierced DOM tree.
      const find = (node) => {
        if (node.nodeName === "INPUT" && (node.attributes ?? []).some((value) => /search-input/.test(value))) return node;
        for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
          const found = find(child);
          if (found) return found;
        }
        return undefined;
      };
      const input = find(root);
      if (!input) return null;
      const resolved = await session.send("DOM.resolveNode", { backendNodeId: input.backendNodeId });
      const value = await session.send("Runtime.callFunctionOn", {
        objectId: resolved.object.objectId,
        functionDeclaration: "function(){ return this.value; }",
        returnByValue: true,
      });
      return value.result.value;
    } finally {
      await session.detach();
    }
  };

  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id, `${origin}/`);
  await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: "open-palette", mode: "search" }), tabId);
  await sleep(800);
  check("palette opens", (await paletteValue()) === "", `value=${JSON.stringify(await paletteValue())}`);

  // Same-origin iframe: the page focuses the frame's text box directly.
  await page.evaluate(() => document.getElementById("same").contentDocument.getElementById("t").focus());
  await sleep(150);
  await page.keyboard.type("abc");
  await sleep(150);
  const sameValue = await page.evaluate(() => document.getElementById("same").contentDocument.getElementById("t").value);
  check("same-origin iframe gets no keys", sameValue === "", `iframe=${JSON.stringify(sameValue)}`);
  check("palette keeps the keys typed after a same-origin iframe steal", (await paletteValue()) === "abc", `palette=${JSON.stringify(await paletteValue())}`);

  // Cross-site iframe (its own process): the frame focuses its own text box.
  await crossFrame.evaluate(() => postMessage("steal", "*"));
  await sleep(300);
  await page.keyboard.type("xyz");
  await sleep(150);
  const crossValue = await crossFrame.evaluate(() => document.getElementById("t").value);
  check("cross-site iframe gets no keys", crossValue === "", `iframe=${JSON.stringify(crossValue)}`);
  check("palette keeps the keys typed after a cross-site iframe steal", (await paletteValue()) === "abcxyz", `palette=${JSON.stringify(await paletteValue())}`);

  // The page focuses the iframe element itself.
  await page.evaluate(() => document.getElementById("cross").focus());
  await sleep(300);
  await page.keyboard.type("q");
  await sleep(150);
  check("palette keeps the keys typed after the iframe element is focused", (await paletteValue()) === "abcxyzq", `palette=${JSON.stringify(await paletteValue())}`);

  // An iframe inside a closed page shadow root.
  await page.evaluate(() => window.closedFrameTextarea().focus());
  await sleep(300);
  await page.keyboard.type("w");
  await sleep(150);
  const closedValue = await page.evaluate(() => window.closedFrameTextarea().value);
  check("iframe in a closed shadow root gets no keys", closedValue === "", `iframe=${JSON.stringify(closedValue)}`);
  check("palette keeps the keys typed after a closed-shadow iframe steal", (await paletteValue()) === "abcxyzqw", `palette=${JSON.stringify(await paletteValue())}`);

  // Closed palette: iframes work normally again.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sleep(400);
  await page.evaluate(() => document.getElementById("same").contentDocument.getElementById("t").focus());
  await page.keyboard.type("ok");
  const afterClose = await page.evaluate(() => document.getElementById("same").contentDocument.getElementById("t").value);
  check("after closing, the iframe receives keys again", afterClose === "ok", `iframe=${JSON.stringify(afterClose)}`);
} finally {
  await context?.close().catch(() => undefined);
  rmSync(profile, { recursive: true, force: true });
  server.close();
}

const passed = checks.filter(Boolean).length;
console.log(`RESULT: ${passed === checks.length ? "PASS" : "FAIL"} (${passed}/${checks.length} checks)`);
process.exitCode = passed === checks.length ? 0 : 1;
