import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import cssText from "./styles.css?inline";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let cycleCallback: ((direction: "next" | "prev") => void) | undefined;

export function registerCycleCallback(cb: (direction: "next" | "prev") => void) {
  cycleCallback = cb;
  return () => {
    if (cycleCallback === cb) cycleCallback = undefined;
  };
}

function closePalette() {
  cycleCallback = undefined;
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function openPalette(message: Extract<BrowserMessage, { type: "open-palette" }> = { type: "open-palette" }) {
  if (host) {
    if (message.mode === "switcher") {
      cycleCallback?.("next");
    }
    return;
  }
  host = document.createElement("div");
  host.id = "jump-command-palette";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";

  const stopPageKeyboardShortcut = (event: KeyboardEvent) => {
    // Let Alt key events through to window so keyup can detect release
    if (event.key !== "Alt") {
      event.stopPropagation();
    }
  };
  host.addEventListener("keydown", stopPageKeyboardShortcut);
  host.addEventListener("keypress", stopPageKeyboardShortcut);
  host.addEventListener("keyup", stopPageKeyboardShortcut);

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
  if (message.type === "cycle-tab-switcher") cycleCallback?.(message.direction || "next");
});

