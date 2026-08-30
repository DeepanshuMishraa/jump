import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import cssText from "./styles.css?inline";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

// The palette lives in a closed shadow root, which causes `event.target` to
// be retargeted to the shadow host for listeners outside the shadow tree.
// That means a host page's own "am I typing in a form field?" check (which
// inspects event.target / document.activeElement) can't tell it's an
// <input>, so its own keyboard shortcuts (e.g. "n" for a new post on
// x.com) still fire while the palette is focused. By the time a keydown
// bubbles back out past the shadow boundary to `host`, the palette's own
// (shadow-internal) handlers have already run, so stopping it here blocks
// it from reaching the page's own document/window listeners without
// affecting the palette itself.
function swallowKeyEvent(event: KeyboardEvent) {
  event.stopPropagation();
}

function closePalette() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function openPalette(message: Extract<BrowserMessage, { type: "open-palette" }> = { type: "open-palette" }) {
  if (host) {
    // Already mounted: chrome.runtime.onMessage inside App will handle cycling/mode
    return;
  }
  host = document.createElement("div");
  host.id = "jump-command-palette";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  host.addEventListener("keydown", swallowKeyEvent);
  host.addEventListener("keyup", swallowKeyEvent);
  host.addEventListener("keypress", swallowKeyEvent);

  const shadowRoot = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = cssText;
  shadowRoot.append(style);
  const mountPoint = document.createElement("div");
  shadowRoot.append(mountPoint);
  document.documentElement.append(host);
  root = createRoot(mountPoint);
  root.render(
    <App
      onClose={closePalette}
      initialMode={message.mode}
      previewUrl={message.previewUrl}
    />,
  );
}

chrome.runtime.onMessage.addListener((message: BrowserMessage) => {
  if (message.type === "open-palette") openPalette(message);
});

