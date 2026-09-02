import { pinnedTabIdentity } from "./settings";
import type { BrowserMessage, PaletteTab, PinnedTab } from "./types";

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

export async function setTabPinned(tab: PaletteTab | PinnedTab, pinned: boolean) {
  if ("id" in tab && !pinnedTabIdentity(tab.url)) return;
  const savedTab: PinnedTab = "id" in tab
    ? {
        tabId: tab.id,
        identity: pinnedTabIdentity(tab.url),
        url: tab.url,
        title: tab.title,
        hostname: tab.hostname,
        ...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {}),
      }
    : tab;
  await chrome.runtime.sendMessage({ type: "set-tab-pinned", tab: savedTab, pinned } satisfies BrowserMessage);
}

export async function openShortcutSettings() {
  await chrome.runtime.sendMessage({ type: "open-shortcut-settings" } satisfies BrowserMessage);
}

export async function openUrl(url: string, openerTabId?: number) {
  await chrome.runtime.sendMessage({ type: "open-url", url, openerTabId } satisfies BrowserMessage);
}

export async function searchWeb(query: string) {
  await chrome.runtime.sendMessage({ type: "search-web", query } satisfies BrowserMessage);
}

