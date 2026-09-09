import { parsePreviewEntries, retainOpenTabPreviews, type PreviewEntry } from "./previewCache";
import { getStoredSettings, pinnedTabIdentity, saveStoredSettings } from "./settings";
import type { BrowserMessage, PaletteTab } from "./types";

const LEGACY_PREVIEW_CACHE_KEY = "recent-tab-previews";
const LEGACY_PREVIEW_CACHE_PREFIX = "tab-preview:";
const PREVIEW_CACHE_PREFIX = "tab-preview-v2:";
const PREVIEW_CAPTURE_INTERVAL_MS = 550;
const PREVIEW_MAX_WIDTH = 640;
const PREVIEW_MAX_HEIGHT = 400;
const HISTORY_CACHE_LIMIT = 100;

type HistoryResult = {
  id: string;
  url: string;
  title: string;
  faviconUrl?: string;
  lastVisitTime?: number;
};

const historyCache = new Map<string, HistoryResult[]>();
const historyRequests = new Map<string, Promise<HistoryResult[]>>();
function invalidateHistoryCache() {
  historyCache.clear();
}
let pinUpdateQueue = Promise.resolve();

function enqueuePinUpdate(update: () => Promise<void>) {
  const operation = pinUpdateQueue.catch(() => undefined).then(update);
  pinUpdateQueue = operation.catch(() => undefined);
  return operation;
}

const previewCache = new Map<number, PreviewEntry>();
const overlayTabIds = new Set<number>();
let lastPreviewCaptureStartedAt = 0;

function hostnameFor(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "").split("/")[0];
  }
}

function previewStorageKey(tabId: number) {
  return `${PREVIEW_CACHE_PREFIX}${tabId}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function compactPreview(dataUrl: string) {
  try {
    const source = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / source.width, PREVIEW_MAX_HEIGHT / source.height);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      source.close();
      return null;
    }
    context.drawImage(source, 0, 0, width, height);
    source.close();
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
    return `data:image/webp;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

async function persistPreview(entry: PreviewEntry) {
  try {
    await chrome.storage.session.set({ [previewStorageKey(entry.tabId)]: entry });
  } catch {
    // The in-memory cache remains usable if session storage is unavailable.
  }
}

const previewCacheReady = chrome.storage.session
  .get(null)
  .then(async (stored) => {
    const keyedEntries = Object.entries(stored).flatMap(([key, value]) =>
      key.startsWith(PREVIEW_CACHE_PREFIX) ? parsePreviewEntries([value]) : []
    );
    keyedEntries.forEach((entry) => previewCache.set(entry.tabId, entry));

    // Version 1 previews may contain the palette itself and used a much lower
    // quality encode. Drop them instead of carrying bad images forward.
    const obsoletePreviewKeys = Object.keys(stored).filter((key) =>
      key === LEGACY_PREVIEW_CACHE_KEY || key.startsWith(LEGACY_PREVIEW_CACHE_PREFIX)
    );
    if (obsoletePreviewKeys.length > 0) {
      await chrome.storage.session.remove(obsoletePreviewKeys);
    }
  })
  .catch(() => {});

async function removeCachedPreview(tabId: number) {
  await previewCacheReady;
  previewCache.delete(tabId);
  await chrome.storage.session.remove(previewStorageKey(tabId)).catch(() => undefined);
}

async function capturePreview(tabId: number, windowId: number) {
  await previewCacheReady;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (overlayTabIds.has(tabId) || !tab.active || tab.discarded || !tab.url) return null;

    const capturedDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const currentTab = await chrome.tabs.get(tabId);
    if (overlayTabIds.has(tabId) || !capturedDataUrl || currentTab.url !== tab.url || !currentTab.active) return null;

    const capturedAt = Date.now();
    const entry = {
      tabId,
      url: tab.url,
      dataUrl: capturedDataUrl,
      capturedAt,
    };
    previewCache.set(tabId, entry);

    // Make the raw preview available immediately. Compression and storage are
    // background work so they cannot delay the switcher or its repeat rate.
    void compactPreview(capturedDataUrl).then(async (dataUrl) => {
      if (dataUrl === null) return;
      const currentEntry = previewCache.get(tabId);
      if (currentEntry?.capturedAt !== capturedAt || currentEntry.url !== tab.url) return;
      const compactedEntry = { ...entry, dataUrl };
      previewCache.set(tabId, compactedEntry);
      await persistPreview(compactedEntry);
    }).catch(() => undefined);
    return entry;
  } catch {
    // Restricted browser pages and closed tabs cannot be captured.
    return null;
  }
}

async function sendToTab(tab: chrome.tabs.Tab, message: BrowserMessage) {
  if (tab.id === undefined) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    // Content scripts run declaratively on regular web pages. Browser-owned
    // pages and tabs opened before an extension reload cannot host the palette.
    return false;
  }
}

function searchHistory(query: string, maxResults: number) {
  const key = query.trim().toLowerCase();
  const cached = historyCache.get(key);
  if (cached) return Promise.resolve(cached.slice(0, maxResults));

  const allHistory = historyCache.get("");
  const activeRequest = historyRequests.get(key);
  if (activeRequest) return activeRequest.then((items) => items.slice(0, maxResults));

  const request = chrome.history.search({ text: key, maxResults: HISTORY_CACHE_LIMIT })
    .then((items) => items
      .filter((item): item is chrome.history.HistoryItem & { id: string; url: string } =>
        typeof item.id === "string" && typeof item.url === "string" && item.url !== ""
      )
      .map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title?.trim() || item.url,
        faviconUrl: "faviconUrl" in item && typeof item.faviconUrl === "string" ? item.faviconUrl : undefined,
        lastVisitTime: item.lastVisitTime,
      }))
    );
  historyRequests.set(key, request);
  void request.then((items) => {
    historyCache.set(key, items);
    historyRequests.delete(key);
  }, () => historyRequests.delete(key));
  return request.then((items) => items.slice(0, maxResults));
}

async function sendToActiveTab(message: BrowserMessage) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await sendToTab(tab, message);
}

async function getTabs(): Promise<PaletteTab[]> {
  const [tabs, windows, settings] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll({ populate: false }),
    getStoredSettings(),
    previewCacheReady,
  ]);
  const browserTabs = tabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number; windowId: number } => tab.id !== undefined,
  );
  const pinnedTabs = settings.pinnedTabs.flatMap((pinnedTab) => {
    if (pinnedTab.identity) return [pinnedTab];
    const matchingTab = browserTabs.find((tab) => tab.id === pinnedTab.tabId);
    if (!matchingTab?.url) return [];
    return [{
      ...pinnedTab,
      identity: pinnedTabIdentity(matchingTab.url),
      url: matchingTab.url,
      title: matchingTab.title?.trim() || pinnedTab.title,
      hostname: hostnameFor(matchingTab.url),
      ...(matchingTab.favIconUrl ? { faviconUrl: matchingTab.favIconUrl } : {}),
    }];
  });
  if (JSON.stringify(pinnedTabs) !== JSON.stringify(settings.pinnedTabs)) {
    void enqueuePinUpdate(async () => {
      const latestSettings = await getStoredSettings();
      const migratedTabs = latestSettings.pinnedTabs.flatMap((pinnedTab) => {
        if (pinnedTab.identity) return [pinnedTab];
        const matchingTab = browserTabs.find((tab) => tab.id === pinnedTab.tabId);
        if (!matchingTab?.url) return [];
        return [{
          ...pinnedTab,
          identity: pinnedTabIdentity(matchingTab.url),
          url: matchingTab.url,
          title: matchingTab.title?.trim() || pinnedTab.title,
          hostname: hostnameFor(matchingTab.url),
          ...(matchingTab.favIconUrl ? { faviconUrl: matchingTab.favIconUrl } : {}),
        }];
      });
      await saveStoredSettings({ pinnedTabs: migratedTabs });
    });
  }
  const retainedPreviews = retainOpenTabPreviews(previewCache.values(), browserTabs);
  const retainedTabIds = new Set(retainedPreviews.map((entry) => entry.tabId));
  const staleTabIds = [...previewCache.keys()].filter((tabId) => !retainedTabIds.has(tabId));
  staleTabIds.forEach((tabId) => previewCache.delete(tabId));
  if (staleTabIds.length > 0) {
    void chrome.storage.session.remove(staleTabIds.map(previewStorageKey)).catch(() => undefined);
  }

  const focusedWindows = new Set(windows.filter((window) => window.focused).map((window) => window.id));

  return browserTabs
    .map((tab) => {
      return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title?.trim() || "Untitled tab",
        url: tab.url || "",
        hostname: hostnameFor(tab.url),
        index: tab.index,
        faviconUrl: tab.favIconUrl,
        active: Boolean(tab.active),
        windowFocused: focusedWindows.has(tab.windowId),
        pinned: pinnedTabs.some((pinnedTab) => {
          if (pinnedTab.identity !== pinnedTabIdentity(tab.url || "")) return false;
          const liveIdMatch = browserTabs.some((candidate) => candidate.id === pinnedTab.tabId);
          return !liveIdMatch || pinnedTab.tabId === tab.id;
        }),
        audible: Boolean(tab.audible),
        muted: Boolean(tab.mutedInfo?.muted),
        lastAccessed: tab.lastAccessed,
      };
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (settings.tabSwitchMode === "order") return a.index - b.index;
      if (a.windowFocused !== b.windowFocused) return a.windowFocused ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
}

chrome.history.onVisited.addListener(invalidateHistoryCache);
chrome.history.onVisitRemoved.addListener(invalidateHistoryCache);

chrome.tabs.onRemoved.addListener((tabId) => {
  overlayTabIds.delete(tabId);
  void removeCachedPreview(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url !== undefined) {
    overlayTabIds.delete(tabId);
    void removeCachedPreview(tabId);
  }
});

async function openSearchPalette() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;

  // Search mode does not need a fresh screenshot. Open it immediately and let
  // the switcher own screenshot capture, so the command never feels delayed.
  if (tab.id !== undefined) overlayTabIds.add(tab.id);
  const opened = await sendToTab(tab, { type: "open-palette", mode: "search" });
  if (!opened && tab.id !== undefined) overlayTabIds.delete(tab.id);
}

let switcherOpenInFlight = false;

async function openTabSwitcher() {
  if (switcherOpenInFlight) return;
  switcherOpenInFlight = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return;

    // Capture only when the active tab has no valid cached preview. The raw
    // frame is available before compression, and overlapping shortcut events
    // are dropped instead of queued for delivery after Alt is released.
    await previewCacheReady;
    const cachedPreview = tab.id !== undefined ? previewCache.get(tab.id) : undefined;
    const canCaptureNow = Date.now() - lastPreviewCaptureStartedAt >= PREVIEW_CAPTURE_INTERVAL_MS;
    if (tab.id !== undefined && cachedPreview?.url !== tab.url && canCaptureNow) {
      lastPreviewCaptureStartedAt = Date.now();
      await capturePreview(tab.id, tab.windowId);
    }

    // getTabs supplies every cached preview in one response after mount. Keep
    // this command message small instead of sending the active image twice.
    if (tab.id !== undefined) overlayTabIds.add(tab.id);
    const opened = await sendToTab(tab, {
      type: "open-palette",
      mode: "switcher",
      activeTabId: tab.id,
    });
    if (!opened && tab.id !== undefined) overlayTabIds.delete(tab.id);
  } finally {
    switcherOpenInFlight = false;
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-palette") void openSearchPalette();
  if (command === "open-tab-switcher") void openTabSwitcher();
  if (command === "pin-tab") void sendToActiveTab({ type: "request-pin-selected-tab" });
  if (command === "mute-tab") void sendToActiveTab({ type: "request-mute-selected-tab" });
});

chrome.action.onClicked.addListener(() => void openSearchPalette());

chrome.runtime.onMessage.addListener((message: BrowserMessage, sender, sendResponse) => {
  if (message.type === "palette-opened") {
    if (sender.tab?.id !== undefined) overlayTabIds.add(sender.tab.id);
    return false;
  }

  if (message.type === "palette-closed") {
    if (sender.tab?.id !== undefined) overlayTabIds.delete(sender.tab.id);
    return false;
  }

  if (message.type === "get-tabs") {
    void getTabs().then(sendResponse);
    return true;
  }

  if (message.type === "get-tab-previews") {
    const tabIds = message.tabIds
      .filter((tabId) => Number.isInteger(tabId) && tabId > 0)
      .slice(0, 12);
    void previewCacheReady.then(() => {
      sendResponse(Object.fromEntries(tabIds.flatMap((tabId) => {
        const preview = previewCache.get(tabId);
        return preview ? [[String(tabId), preview.dataUrl]] : [];
      })));
    });
    return true;
  }

  if (message.type === "search-history") {
    void searchHistory(message.query, Math.min(message.maxResults ?? 8, 8)).then(sendResponse);
    return true;
  }

  if (message.type === "activate-tab") {
    void chrome.tabs.update(message.tab.id, { active: true })
      .then(() => chrome.windows.update(message.tab.windowId, { focused: true }))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "toggle-tab-muted") {
    void chrome.tabs.update(message.tabId, { muted: message.muted })
      .then(() => sendResponse({ ok: true, muted: message.muted }), () => sendResponse({ ok: false, muted: false }));
    return true;
  }

  if (message.type === "set-tab-pinned") {
    const operation = enqueuePinUpdate(async () => {
      const settings = await getStoredSettings();
      const pinnedTabs = settings.pinnedTabs.filter((tab) => tab.identity !== message.tab.identity);
      if (message.pinned) pinnedTabs.push(message.tab);
      await saveStoredSettings({ pinnedTabs });
    });
    void operation.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "open-url") {
    void chrome.tabs.create({ url: message.url, openerTabId: message.openerTabId })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "search-web") {
    void chrome.search.query({ text: message.query, disposition: "NEW_TAB" })
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
