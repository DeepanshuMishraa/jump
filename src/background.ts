import { parsePreviewEntries, retainOpenTabPreviews, type PreviewEntry } from "./previewCache";
import { getStoredSettings, pinnedTabIdentity, saveStoredSettings } from "./settings";
import type { BrowserMessage, PaletteTab } from "./types";

const LEGACY_PREVIEW_CACHE_KEY = "recent-tab-previews";
const PREVIEW_CACHE_PREFIX = "tab-preview:";
const PREVIEW_CAPTURE_DELAY_MS = 600;
const PREVIEW_CAPTURE_INTERVAL_MS = 550;
const PREVIEW_MAX_WIDTH = 480;
const PREVIEW_MAX_HEIGHT = 300;
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
const previewCaptureTimers = new Map<number, { tabId: number; timer: ReturnType<typeof setTimeout> }>();
let previewCaptureQueue = Promise.resolve();
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
      return dataUrl;
    }
    context.drawImage(source, 0, 0, width, height);
    source.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.55 });
    return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  } catch {
    return dataUrl;
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
    const legacyEntries = parsePreviewEntries(stored[LEGACY_PREVIEW_CACHE_KEY]);
    const keyedEntries = Object.entries(stored).flatMap(([key, value]) =>
      key.startsWith(PREVIEW_CACHE_PREFIX) ? parsePreviewEntries([value]) : []
    );
    [...legacyEntries, ...keyedEntries].forEach((entry) => previewCache.set(entry.tabId, entry));

    const keyedTabIds = new Set(keyedEntries.map((entry) => entry.tabId));
    const entriesToMigrate = legacyEntries.filter((entry) => !keyedTabIds.has(entry.tabId));
    if (legacyEntries.length > 0) {
      if (entriesToMigrate.length > 0) {
        await chrome.storage.session.set(Object.fromEntries(
          entriesToMigrate.map((entry) => [previewStorageKey(entry.tabId), entry]),
        ));
      }
      await chrome.storage.session.remove(LEGACY_PREVIEW_CACHE_KEY);
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
    if (!tab.active || tab.discarded || !tab.url) return;

    const capturedDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 45,
    });
    const currentTab = await chrome.tabs.get(tabId);
    if (!capturedDataUrl || currentTab.url !== tab.url || !currentTab.active) return;

    const entry = {
      tabId,
      url: tab.url,
      dataUrl: await compactPreview(capturedDataUrl),
      capturedAt: Date.now(),
    };
    previewCache.set(tabId, entry);
    await persistPreview(entry);
  } catch {
    // Restricted browser pages and closed tabs cannot be captured.
  }
}

function enqueuePreviewCapture(tabId: number, windowId: number) {
  const operation = previewCaptureQueue.catch(() => undefined).then(async () => {
    const waitMs = Math.max(0, PREVIEW_CAPTURE_INTERVAL_MS - (Date.now() - lastPreviewCaptureStartedAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastPreviewCaptureStartedAt = Date.now();
    await capturePreview(tabId, windowId);
  });
  previewCaptureQueue = operation.catch(() => undefined);
  return operation;
}

function schedulePreviewCapture(tabId: number, windowId: number) {
  const pendingCapture = previewCaptureTimers.get(windowId);
  if (pendingCapture !== undefined) clearTimeout(pendingCapture.timer);

  const timer = setTimeout(() => {
    previewCaptureTimers.delete(windowId);
    void enqueuePreviewCapture(tabId, windowId);
  }, PREVIEW_CAPTURE_DELAY_MS);
  previewCaptureTimers.set(windowId, { tabId, timer });
}

async function scheduleActiveTabCaptures() {
  const activeTabs = await chrome.tabs.query({ active: true });
  activeTabs.forEach((tab) => {
    if (tab.id !== undefined) schedulePreviewCapture(tab.id, tab.windowId);
  });
}

async function sendToTab(tab: chrome.tabs.Tab, message: BrowserMessage) {
  if (tab.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Content scripts run declaratively on regular web pages. Browser-owned
    // pages and tabs opened before an extension reload cannot host the palette.
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
      const preview = previewCache.get(tab.id);
      return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title?.trim() || "Untitled tab",
        url: tab.url || "",
        hostname: hostnameFor(tab.url),
        index: tab.index,
        faviconUrl: tab.favIconUrl,
        previewUrl: preview && preview.url === tab.url ? preview.dataUrl : undefined,
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

chrome.runtime.onInstalled.addListener(() => void scheduleActiveTabCaptures());
chrome.runtime.onStartup.addListener(() => void scheduleActiveTabCaptures());

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  schedulePreviewCapture(tabId, windowId);
});

chrome.tabs.onRemoved.addListener((tabId, { windowId }) => {
  const pendingCapture = previewCaptureTimers.get(windowId);
  if (pendingCapture?.tabId === tabId) {
    clearTimeout(pendingCapture.timer);
    previewCaptureTimers.delete(windowId);
  }
  void removeCachedPreview(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) void removeCachedPreview(tabId);
  if (tab.active && (changeInfo.status === "complete" || changeInfo.url !== undefined)) {
    schedulePreviewCapture(tabId, tab.windowId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
    if (tab?.id !== undefined) schedulePreviewCapture(tab.id, windowId);
  });
});

async function openSearchPalette() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;

  // Search mode does not need a fresh screenshot. Open it immediately and let
  // the switcher own screenshot capture, so the command never feels delayed.
  await sendToTab(tab, { type: "open-palette", mode: "search" });
}

async function openTabSwitcher() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;

  // Active tabs are captured as they settle. Only block the first switcher open
  // when no preview exists; cached opens remain instantaneous and never capture
  // the switcher UI itself.
  if (tab.id !== undefined && !previewCache.has(tab.id)) {
    const pendingCapture = previewCaptureTimers.get(tab.windowId);
    if (pendingCapture !== undefined) clearTimeout(pendingCapture.timer);
    previewCaptureTimers.delete(tab.windowId);
    await enqueuePreviewCapture(tab.id, tab.windowId);
  }

  const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const preview = tab.id !== undefined ? previewCache.get(tab.id) : undefined;
  const previewUrl = currentTab?.id === tab.id && currentTab.url === preview?.url
    ? preview?.dataUrl
    : undefined;

  if (currentTab) {
    await sendToTab(currentTab, {
      type: "open-palette",
      mode: "switcher",
      previewUrl,
      activeTabId: currentTab.id,
    });
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-palette") void openSearchPalette();
  if (command === "open-tab-switcher") void openTabSwitcher();
  if (command === "pin-tab") void sendToActiveTab({ type: "request-pin-selected-tab" });
  if (command === "mute-tab") void sendToActiveTab({ type: "request-mute-selected-tab" });
});

chrome.action.onClicked.addListener(() => void openSearchPalette());

chrome.runtime.onMessage.addListener((message: BrowserMessage, _sender, sendResponse) => {
  if (message.type === "get-tabs") {
    void getTabs().then(sendResponse);
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
