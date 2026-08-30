import type { BrowserMessage, PaletteTab } from "./types";

type PreviewEntry = {
  tabId: number;
  url: string;
  dataUrl: string;
  capturedAt: number;
};

const PREVIEW_CACHE_KEY = "recent-tab-previews";
const PREVIEW_TTL_MS = 6 * 60 * 60 * 1000;
const PREVIEW_CAPTURE_DELAY_MS = 700;
const MAX_PREVIEW_COUNT = 12;
const MAX_PREVIEW_CHARACTERS = 7_000_000;

const previewCache = new Map<number, PreviewEntry>();
const captureTimers = new Map<number, ReturnType<typeof setTimeout>>();

function hostnameFor(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "").split("/")[0];
  }
}

function parsePreviewEntries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is PreviewEntry =>
    typeof entry === "object" &&
    entry !== null &&
    "tabId" in entry &&
    typeof entry.tabId === "number" &&
    "url" in entry &&
    typeof entry.url === "string" &&
    "dataUrl" in entry &&
    typeof entry.dataUrl === "string" &&
    "capturedAt" in entry &&
    typeof entry.capturedAt === "number"
  );
}

function prunePreviewCache(now = Date.now()) {
  const recentEntries = [...previewCache.values()]
    .filter((entry) => now - entry.capturedAt < PREVIEW_TTL_MS)
    .sort((a, b) => b.capturedAt - a.capturedAt);

  previewCache.clear();
  let totalCharacters = 0;

  for (const entry of recentEntries) {
    if (previewCache.size >= MAX_PREVIEW_COUNT) break;
    if (totalCharacters + entry.dataUrl.length > MAX_PREVIEW_CHARACTERS) continue;
    previewCache.set(entry.tabId, entry);
    totalCharacters += entry.dataUrl.length;
  }
}

async function persistPreviewCache() {
  await previewCacheReady;
  prunePreviewCache();
  try {
    await chrome.storage.session.set({
      [PREVIEW_CACHE_KEY]: [...previewCache.values()],
    });
  } catch {
    // The in-memory cache remains usable if session storage is unavailable.
  }
}

const previewCacheReady = chrome.storage.session
  .get(PREVIEW_CACHE_KEY)
  .then((stored) => {
    const entries = parsePreviewEntries(stored[PREVIEW_CACHE_KEY]);
    entries.forEach((entry) => previewCache.set(entry.tabId, entry));
    prunePreviewCache();
  })
  .catch(() => {});

async function removeCachedPreview(tabId: number) {
  await previewCacheReady;
  previewCache.delete(tabId);
  await persistPreviewCache();
}

async function capturePreview(tabId: number, windowId: number) {
  await previewCacheReady;

  try {
    const [tab, window] = await Promise.all([
      chrome.tabs.get(tabId),
      chrome.windows.get(windowId),
    ]);
    if (!tab.active || !window.focused || !tab.url) return;

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 35,
    });
    if (!dataUrl) return;

    previewCache.set(tabId, {
      tabId,
      url: tab.url,
      dataUrl,
      capturedAt: Date.now(),
    });
    await persistPreviewCache();
  } catch {
    // Restricted browser pages and closed tabs cannot be captured.
  }
}

function schedulePreviewCapture(tabId: number, windowId: number) {
  const pendingCapture = captureTimers.get(tabId);
  if (pendingCapture !== undefined) clearTimeout(pendingCapture);

  const timer = setTimeout(() => {
    captureTimers.delete(tabId);
    void capturePreview(tabId, windowId);
  }, PREVIEW_CAPTURE_DELAY_MS);
  captureTimers.set(tabId, timer);
}

async function scheduleActiveTabCapture() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== undefined && tab.windowId !== undefined) {
    schedulePreviewCapture(tab.id, tab.windowId);
  }
}

async function sendToActiveTab(message: BrowserMessage) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://") && !tab.url.startsWith("about:")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets/content.js"],
        });
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Browser-owned and otherwise restricted pages cannot host the palette.
      }
    }
  }
}

async function getTabs(): Promise<PaletteTab[]> {
  const [tabs, windows] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll({ populate: false }),
    previewCacheReady,
  ]);
  prunePreviewCache();

  const focusedWindows = new Set(windows.filter((window) => window.focused).map((window) => window.id));

  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; windowId: number } => tab.id !== undefined)
    .map((tab) => {
      const preview = previewCache.get(tab.id);
      return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title?.trim() || "Untitled tab",
        url: tab.url || "",
        hostname: hostnameFor(tab.url),
        faviconUrl: tab.favIconUrl,
        previewUrl: preview && preview.url === tab.url ? preview.dataUrl : undefined,
        active: Boolean(tab.active),
        windowFocused: focusedWindows.has(tab.windowId),
        pinned: Boolean(tab.pinned),
        lastAccessed: tab.lastAccessed,
      };
    })
    .sort((a, b) => {
      if (a.windowFocused !== b.windowFocused) return a.windowFocused ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  void scheduleActiveTabCapture();
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleActiveTabCapture();
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  schedulePreviewCapture(tabId, windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) {
    void removeCachedPreview(tabId);
  }
  if ((changeInfo.status === "complete" || changeInfo.url !== undefined) && tab.active) {
    schedulePreviewCapture(tabId, tab.windowId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
    if (tab?.id !== undefined) schedulePreviewCapture(tab.id, windowId);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const pendingCapture = captureTimers.get(tabId);
  if (pendingCapture !== undefined) clearTimeout(pendingCapture);
  captureTimers.delete(tabId);
  void removeCachedPreview(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-palette") void sendToActiveTab({ type: "open-palette", mode: "search" });
  if (command === "open-tab-switcher") void sendToActiveTab({ type: "open-palette", mode: "switcher" });
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
