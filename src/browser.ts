import type { BrowserMessage, PaletteTab } from "./types";

export async function getTabs(): Promise<PaletteTab[]> {
  return chrome.runtime.sendMessage({ type: "get-tabs" } satisfies BrowserMessage);
}

export async function activateTab(tab: PaletteTab) {
  await chrome.runtime.sendMessage({ type: "activate-tab", tab } satisfies BrowserMessage);
}

export async function openShortcutSettings() {
  await chrome.runtime.sendMessage({ type: "open-shortcut-settings" } satisfies BrowserMessage);
}

export async function openUrl(url: string) {
  await chrome.runtime.sendMessage({ type: "open-url", url } satisfies BrowserMessage);
}

