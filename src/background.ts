import type { BrowserMessage, PaletteTab } from "./types";

function hostnameFor(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "").split("/")[0];
  }
}

async function sendToActiveTab(message: BrowserMessage) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Restricted browser pages cannot host content scripts; leave the page untouched.
  }
}

async function getTabs(): Promise<PaletteTab[]> {
  const [tabs, windows] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll({ populate: false }),
  ]);
  const focusedWindows = new Set(windows.filter((window) => window.focused).map((window) => window.id));

  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; windowId: number } => tab.id !== undefined)
    .map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title?.trim() || "Untitled tab",
      url: tab.url || "",
      hostname: hostnameFor(tab.url),
      faviconUrl: tab.favIconUrl,
      active: Boolean(tab.active),
      windowFocused: focusedWindows.has(tab.windowId),
      pinned: Boolean(tab.pinned),
      lastAccessed: tab.lastAccessed,
    }))
    .sort((a, b) => {
      if (a.windowFocused !== b.windowFocused) return a.windowFocused ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-palette") void sendToActiveTab({ type: "open-palette" });
});

chrome.action.onClicked.addListener(() => void sendToActiveTab({ type: "open-palette" }));

chrome.runtime.onMessage.addListener((message: BrowserMessage, _sender, sendResponse) => {
  if (message.type === "get-tabs") {
    void getTabs().then(sendResponse);
    return true;
  }

  if (message.type === "activate-tab") {
    void chrome.tabs.update(message.tab.id, { active: true })
      .then(() => chrome.windows.update(message.tab.windowId, { focused: true }))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "open-url") {
    void chrome.tabs.create({ url: message.url })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "open-shortcut-settings") {
    void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

