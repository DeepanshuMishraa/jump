import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import cssText from "./styles.css?inline";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

// Events from the closed shadow root are retargeted to `host` outside the
// shadow tree. Stop them at the boundary after the palette's handlers run so
// bubble-phase shortcuts on the host page cannot observe palette keystrokes.
// Capture-phase page listeners run before the event reaches the shadow tree;
// they cannot be blocked here without also preventing the palette from
// receiving the event.
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

