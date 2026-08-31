import type { BrowserMessage, PaletteTab } from "./types";

export type BrowserHistoryItem = {
  id: string;
  url: string;
  title: string;
  faviconUrl?: string;
  lastVisitTime?: number;
};

export async function getTabs(): Promise<PaletteTab[]> {
  return chrome.runtime.sendMessage({ type: "get-tabs" } satisfies BrowserMessage);
}

export async function getBrowserHistory(query: string, maxResults = 8): Promise<BrowserHistoryItem[]> {
  return chrome.runtime.sendMessage({ type: "search-history", query, maxResults } satisfies BrowserMessage);
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

export async function searchWeb(query: string) {
  await chrome.runtime.sendMessage({ type: "search-web", query } satisfies BrowserMessage);
}

