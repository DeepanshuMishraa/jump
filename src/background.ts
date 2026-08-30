import type { BrowserMessage, PaletteTab } from "./types";

const previewCache = new Map<number, string>();

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
    // If the content script hasn't been injected into this tab yet, inject it on-demand
    if (tab.id !== undefined && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://") && !tab.url.startsWith("about:")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets/content.js"],
        });
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Restricted page
      }
    }
  }
}

async function openTabSwitcher() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  // Open the switcher before capturing a preview. captureVisibleTab can take
  // long enough to make the shortcut feel unresponsive.
  await sendToActiveTab({ type: "open-palette", mode: "switcher" });

  if (tab?.windowId === undefined || tab.id === undefined) return;

  try {
    const currentPreview = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 60,
    });
    if (currentPreview) {
      previewCache.set(tab.id, currentPreview);
      await sendToActiveTab({ type: "update-switcher-preview", previewUrl: currentPreview });
    }
  } catch {
    // Restricted pages fallback to icons.
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
      previewUrl: previewCache.get(tab.id),
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

chrome.tabs.onRemoved.addListener((tabId) => {
  previewCache.delete(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-palette") void sendToActiveTab({ type: "open-palette", mode: "search" });
  if (command === "open-tab-switcher") void openTabSwitcher();
});

chrome.action.onClicked.addListener(() => void sendToActiveTab({ type: "open-palette", mode: "search" }));

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
