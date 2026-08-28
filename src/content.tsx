import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import type { BrowserMessage } from "./types";
import cssText from "./styles.css?inline";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function closePalette() {
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
}

function openPalette() {
  if (host) return;
  host = document.createElement("div");
  host.id = "jump-command-palette";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadowRoot = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = cssText;
  shadowRoot.append(style);
  const mountPoint = document.createElement("div");
  shadowRoot.append(mountPoint);
  document.documentElement.append(host);
  root = createRoot(mountPoint);
  root.render(<App onClose={closePalette} />);
}

chrome.runtime.onMessage.addListener((message: BrowserMessage) => {
  if (message.type === "open-palette") openPalette();
});
