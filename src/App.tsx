import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateTab, getBrowserHistory, getTabPreviews, getTabs, notifyPaletteClosed, notifyPaletteOpened, openUrl, searchWeb, setTabMuted, setTabPinned, type BrowserHistoryItem } from "./browser";
import { ArrowRightIcon, InfoIcon, PinIcon, SearchIcon, XIcon } from "./icons";
import { PaletteAction } from "./PaletteAction";
import { canStartPaletteDrag, dragPreviewCellForPoint, isAltModifierActive, nextFreeDragPosition, snapPalettePosition } from "./paletteDrag";
import { buildSearchResults, type SearchResult } from "./paletteSearch";
import { stalePreviewTabIds } from "./previewCache";
import { getSearchHistory, recordSearch, type SearchHistoryEntry } from "./searchHistory";
import { DEFAULT_SETTINGS, getStoredSettings, pinnedTabIdentity, saveStoredSettings, subscribeToSettings } from "./settings";
import { useMountEffect } from "./hooks/useMountEffect";
import { TabFavicon, TabSoundIndicator } from "./components/TabVisuals";
import { GalleryCard, SwitcherCard } from "./components/TabCards";
import { BookmarkManager } from "./components/BookmarkManager";
import type { BrowserMessage, PalettePosition, PaletteTab, UserSettings } from "./types";

export function App({
  onClose,
  initialMode = "search",
  initialActiveTabId,
}: {
  onClose: () => void;
  initialMode?: "search" | "switcher" | "bookmarks";
  initialActiveTabId?: number;
}) {
  const [tabs, setTabs] = useState<PaletteTab[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [recentBrowserHistory, setRecentBrowserHistory] = useState<BrowserHistoryItem[]>([]);
  const [browserHistory, setBrowserHistory] = useState<BrowserHistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "switcher" | "bookmarks">(initialMode);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const requestedPreviewIds = useRef(new Set<number>());
  const requestedPreviewUrls = useRef(new Map<number, string>());
  const previewRequestSequence = useRef(0);
  const previewRequestVersions = useRef(new Map<number, number>());
  const [isDraggingPalette, setIsDraggingPalette] = useState(false);
  const [isPaletteDragReady, setIsPaletteDragReady] = useState(false);
  const paletteDragModifierRef = useRef(false);
  const [dragPosition, setDragPosition] = useState<PalettePosition | undefined>();
  const [dragPreviewCell, setDragPreviewCell] = useState<{ column: number; row: number }>();
  const paletteCardRef = useRef<HTMLDivElement>(null);
  const paletteDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPosition: PalettePosition;
    moved: boolean;
  } | undefined>(undefined);
  const pointerDownAnchorRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    button: number;
  } | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const isSwitcher = mode === "switcher";
  const isBookmarks = mode === "bookmarks";
  const isGallery = settings.viewMode === "gallery";
  const [isExpanded, setIsExpanded] = useState(isSwitcher);
  const [selectedIndex, setSelectedIndex] = useState(isSwitcher ? 1 : 0);
  const initialSwitcherSelectionPending = useRef(isSwitcher && initialActiveTabId !== undefined);
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<SearchResult[]>([]);
  const tabsRef = useRef(tabs);
  const modeRef = useRef(mode);
  const selectedIndexRef = useRef(selectedIndex);
  const refreshTabsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const switchTabRef = useRef<(targetTab?: PaletteTab) => Promise<void>>(() => Promise.resolve());
  const muteTabRef = useRef<(targetTab?: PaletteTab) => Promise<void>>(() => Promise.resolve());
  const handleCloseRef = useRef<() => void>(() => undefined);
  tabsRef.current = tabs;
  modeRef.current = mode;
  const tabsRequestIdRef = useRef(0);

  useMountEffect(() => {
    void notifyPaletteOpened().catch(() => undefined);
    return () => {
      void notifyPaletteClosed().catch(() => undefined);
    };
  });

  // Load and subscribe to persistent settings
  useMountEffect(() => {
    void getStoredSettings().then((loaded) => {
      setSettings(loaded);
      if (modeRef.current === "search") setIsExpanded(loaded.paletteViewMode === "expanded");
    });
    void getSearchHistory().then(setHistory).catch(() => setHistory([]));
    void getBrowserHistory("", 8).then(setRecentBrowserHistory).catch(() => setRecentBrowserHistory([]));
    return subscribeToSettings(setSettings);
  });

  const historySearchTimerRef = useRef<number | undefined>(undefined);
  const historyRequestIdRef = useRef(0);
  const requestTabPreviews = useCallback((tabIds: number[]) => {
    const currentTabUrls = new Map(tabsRef.current.map((tab) => [tab.id, tab.url]));
    const missingTabIds = tabIds.filter((tabId) => {
      const currentUrl = currentTabUrls.get(tabId);
      if (currentUrl === undefined) return false;
      if (!requestedPreviewIds.current.has(tabId)) return true;
      if (requestedPreviewUrls.current.get(tabId) === currentUrl) return false;
      requestedPreviewIds.current.delete(tabId);
      previewRequestVersions.current.delete(tabId);
      requestedPreviewUrls.current.delete(tabId);
      return true;
    });
    if (missingTabIds.length === 0) return;

    const requestVersion = previewRequestSequence.current + 1;
    previewRequestSequence.current = requestVersion;
    const requestedUrls = new Map(missingTabIds.map((tabId) => [tabId, currentTabUrls.get(tabId)]));
    missingTabIds.forEach((tabId) => {
      requestedPreviewIds.current.add(tabId);
      requestedPreviewUrls.current.set(tabId, requestedUrls.get(tabId) ?? "");
      previewRequestVersions.current.set(tabId, requestVersion);
    });

    void getTabPreviews(missingTabIds).then((previews) => {
      const validPreviews = Object.fromEntries(Object.entries(previews).filter(([tabId]) => {
        const numericTabId = Number(tabId);
        const currentTab = tabsRef.current.find((tab) => tab.id === numericTabId);
        return previewRequestVersions.current.get(numericTabId) === requestVersion &&
          currentTab?.url === requestedUrls.get(numericTabId);
      }));
      if (Object.keys(validPreviews).length > 0) {
        setPreviewUrls((current) => ({ ...current, ...validPreviews }));
      }
      missingTabIds.forEach((tabId) => {
        if (!(String(tabId) in previews) && previewRequestVersions.current.get(tabId) === requestVersion) {
          requestedPreviewIds.current.delete(tabId);
          requestedPreviewUrls.current.delete(tabId);
          previewRequestVersions.current.delete(tabId);
        }
      });
    }).catch(() => {
      missingTabIds.forEach((tabId) => {
        requestedPreviewIds.current.delete(tabId);
        requestedPreviewUrls.current.delete(tabId);
        previewRequestVersions.current.delete(tabId);
      });
    });
  }, []);

  const invalidateTabPreviews = useCallback((tabIds: number[]) => {
    if (tabIds.length === 0) return;
    tabIds.forEach((tabId) => {
      requestedPreviewIds.current.delete(tabId);
      requestedPreviewUrls.current.delete(tabId);
      previewRequestVersions.current.delete(tabId);
    });
    setPreviewUrls((current) => {
      const next = { ...current };
      tabIds.forEach((tabId) => delete next[String(tabId)]);
      return next;
    });
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;
    setQuery(value);
    setSelectedIndex(0);
    setIsExpanded(Boolean(value.trim()));
    if (historySearchTimerRef.current !== undefined) window.clearTimeout(historySearchTimerRef.current);
    const trimmed = value.trim().toLowerCase();
    const localMatches = trimmed
      ? recentBrowserHistory.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(trimmed))
      : [];
    setBrowserHistory(localMatches);
    if (!trimmed) return;
    historySearchTimerRef.current = window.setTimeout(() => {
      void getBrowserHistory(trimmed, 8).then((items) => {
        if (historyRequestIdRef.current !== requestId) return;
        const seen = new Set(localMatches.map((item) => item.id));
        setBrowserHistory([...localMatches, ...items.filter((item) => !seen.has(item.id))]);
      }).catch(() => {
        // Keep locally available history visible when Chrome history is unavailable.
      });
    }, 100);
  }, [recentBrowserHistory]);

  useMountEffect(() => () => {
    historyRequestIdRef.current += 1;
    if (historySearchTimerRef.current !== undefined) window.clearTimeout(historySearchTimerRef.current);
  });

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 130);
  }, [onClose]);
  handleCloseRef.current = handleClose;

  const refreshTabs = useCallback(async () => {
    const requestId = tabsRequestIdRef.current + 1;
    tabsRequestIdRef.current = requestId;
    try {
      const tabList = await getTabs();
      if (requestId !== tabsRequestIdRef.current) return;
      const staleTabIds = stalePreviewTabIds(tabsRef.current, tabList);
      invalidateTabPreviews(staleTabIds);
      tabsRef.current = tabList;
      setTabs(tabList);
      if (isSwitcher && initialSwitcherSelectionPending.current && tabList.length > 0) {
        const activeIndex = initialActiveTabId === undefined
          ? -1
          : tabList.findIndex((tab) => tab.id === initialActiveTabId);
        setSelectedIndex((activeIndex + 1 + tabList.length) % tabList.length);
        initialSwitcherSelectionPending.current = false;
      }
    } catch {
      if (requestId === tabsRequestIdRef.current) setTabs([]);
    }
  }, [initialActiveTabId, invalidateTabPreviews, isSwitcher]);
  refreshTabsRef.current = refreshTabs;

  useMountEffect(() => {
    if (modeRef.current !== "switcher") inputRef.current?.focus();
    void refreshTabsRef.current();
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void refreshTabsRef.current();
      }, 50);
    };
    const events =
      chrome.tabs && chrome.windows
        ? [
            chrome.tabs.onCreated,
            chrome.tabs.onRemoved,
            chrome.tabs.onActivated,
            chrome.windows.onFocusChanged,
          ]
        : [];
    const handleTabUpdated = (tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url !== undefined) invalidateTabPreviews([tabId]);
      scheduleRefresh();
    };
    events.forEach((event) => event.addListener(scheduleRefresh));
    chrome.tabs?.onUpdated.addListener(handleTabUpdated);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      events.forEach((event) => event.removeListener(scheduleRefresh));
      chrome.tabs?.onUpdated.removeListener(handleTabUpdated);
    };
  });

  // Unified message listener for both in-page overlay and new tab page
  useMountEffect(() => {
    const handleMessage = (message: BrowserMessage) => {
      if (isClosingRef.current) return;
      if (message.type === "open-palette") {
        if (message.mode === "bookmarks") {
          setMode("bookmarks");
          setIsExpanded(false);
        } else if (message.mode === "switcher") {
          setMode("switcher");
          setIsExpanded(true);
          setSelectedIndex((currentIndex) => {
            const currentTabs = tabsRef.current;
            if (currentTabs.length === 0) return 0;
            if (modeRef.current === "switcher") return (currentIndex + 1) % currentTabs.length;
            const activeIndex = message.activeTabId === undefined
              ? -1
              : currentTabs.findIndex((tab) => tab.id === message.activeTabId);
            return (activeIndex + 1 + currentTabs.length) % currentTabs.length;
          });
        } else {
          setMode("search");
          handleQueryChange("");
          setIsExpanded(settingsRef.current.paletteViewMode === "expanded");
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      } else if (message.type === "cycle-tab-switcher") {
        setSelectedIndex((curr) => {
          const currentTabs = tabsRef.current;
          if (currentTabs.length === 0) return 0;
          return message.direction === "prev"
            ? (curr - 1 + currentTabs.length) % currentTabs.length
            : (curr + 1) % currentTabs.length;
        });
      } else if (message.type === "request-pin-selected-tab") {
        const currentTabs = tabsRef.current;
        const currentIndex = selectedIndexRef.current;
        const selectedResult = modeRef.current === "switcher"
          ? (currentTabs[currentIndex] ? { kind: "tab" as const, tab: currentTabs[currentIndex] } : undefined)
          : resultsRef.current[currentIndex];
        if (selectedResult?.kind === "tab") {
          void setTabPinned(selectedResult.tab, !selectedResult.tab.pinned).then(() => void refreshTabsRef.current());
        } else if (selectedResult?.kind === "pinned") {
          void setTabPinned(selectedResult.tab, false);
        }
      } else if (message.type === "request-mute-selected-tab") {
        const currentTabs = tabsRef.current;
        const currentIndex = selectedIndexRef.current;
        const result = resultsRef.current[currentIndex];
        const selectedResult = modeRef.current === "switcher"
          ? currentTabs[currentIndex]
          : result?.kind === "tab" ? result.tab : undefined;
        void muteTabRef.current(selectedResult);
      }
    };

    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  });

  // Switch to selected tab
  const switchTab = useCallback(
    async (targetTab?: PaletteTab) => {
      if (!targetTab) return;
      await activateTab(targetTab);
      handleClose();
    },
    [handleClose]
  );
  switchTabRef.current = switchTab;

  const muteTab = useCallback(async (targetTab?: PaletteTab) => {
    if (!targetTab || (!targetTab.audible && !targetTab.muted)) return;
    const result = await setTabMuted(targetTab);
    if (!result.ok) return;
    tabsRequestIdRef.current += 1;
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === targetTab.id
      ? { ...tab, muted: result.muted }
      : tab));
  }, []);
  muteTabRef.current = muteTab;

  const executeResult = useCallback((result?: SearchResult) => {
    if (!result) return;
    if (result.kind === "tab") {
      void switchTab(result.tab);
      return;
    }

    const openerTabId = tabs.find((tab) => tab.active && tab.windowFocused)?.id;
    if (result.kind === "visited" || result.kind === "pinned") {
      void openUrl(result.kind === "visited" ? result.item.url : result.tab.url, openerTabId);
      handleClose();
      return;
    }

    const input = result.kind === "history" ? result.query : query;
    const action = result.kind === "history" ? buildSearchResults([], result.query)[0] : result;
    if (!action || action.kind === "tab" || action.kind === "pinned" || action.kind === "history" || action.kind === "visited") return;

    void recordSearch(input).then(() => getSearchHistory().then(setHistory));
    if (action.kind === "url" || action.kind === "bang") void openUrl(action.url, openerTabId);
    else void searchWeb(action.query);
    handleClose();
  }, [handleClose, switchTab, query, tabs]);

  // Global keyup/keydown handler for releasing Alt key and cycling in switcher mode
  useMountEffect(() => {
    const handleWindowKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Alt" || !isAltModifierActive(event)) {
        paletteDragModifierRef.current = false;
        setIsPaletteDragReady(false);
      }
      if (modeRef.current !== "switcher") return;
      if (event.key === "Alt" || !event.altKey) {
        const currentTabs = tabsRef.current;
        const currentIndex = selectedIndexRef.current;
        if (currentTabs.length > 0 && currentIndex < currentTabs.length) {
          void switchTabRef.current(currentTabs[currentIndex]);
        } else {
          handleCloseRef.current();
        }
      }
    };

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isAltModifierActive(event)) {
        paletteDragModifierRef.current = true;
        setIsPaletteDragReady(!settingsRef.current.disableMouseCommandPalette);
      }
      if (event.altKey && (event.key.toLowerCase() === "m" || event.code === "KeyM")) {
        event.preventDefault();
        event.stopPropagation();
        const currentTabs = tabsRef.current;
        const selectedResult = resultsRef.current[selectedIndexRef.current];
        const targetTab = modeRef.current === "switcher"
          ? currentTabs[selectedIndexRef.current]
          : selectedResult?.kind === "tab" ? selectedResult.tab : undefined;
        void muteTabRef.current(targetTab);
        return;
      }

      if (modeRef.current !== "switcher") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleCloseRef.current();
        return;
      }

      if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((curr) => (tabsRef.current.length ? (curr - 1 + tabsRef.current.length) % tabsRef.current.length : 0));
      } else if (event.key === "ArrowRight" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((curr) => (tabsRef.current.length ? (curr + 1) % tabsRef.current.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const currentTab = tabsRef.current[selectedIndexRef.current];
        if (currentTab) {
          void switchTabRef.current(currentTab);
        }
      }
    };

    window.addEventListener("keyup", handleWindowKeyUp, { capture: true });
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keyup", handleWindowKeyUp, { capture: true });
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
    };
  });

  // Keep saved pins visible even when their browser tab is closed.
  const closedPinnedTabs = useMemo(() => {
    const openIdentities = new Set(tabs.map((tab) => pinnedTabIdentity(tab.url)));
    return settings.pinnedTabs.filter((tab) => !openIdentities.has(tab.identity));
  }, [settings.pinnedTabs, tabs]);
  const results = useMemo(
    () => buildSearchResults(tabs, query, history, browserHistory, closedPinnedTabs),
    [query, tabs, history, browserHistory, closedPinnedTabs],
  );
  // Keep the latest result set available to the external message listener without syncing state.
  resultsRef.current = results;
  useLayoutEffect(() => {
    const itemCount = isSwitcher ? tabs.length : results.length;
    setSelectedIndex((index) => Math.min(index, Math.max(0, itemCount - 1)));
  }, [isSwitcher, results.length, tabs.length]);
  const activeIndex = isSwitcher
    ? Math.min(selectedIndex, Math.max(0, tabs.length - 1))
    : Math.min(selectedIndex, Math.max(0, results.length - 1));
  selectedIndexRef.current = activeIndex;

  useLayoutEffect(() => {
    if (isSwitcher && tabs.length > 0) {
      const selectedCard = trackRef.current?.querySelector<HTMLElement>(
        `[data-switcher-index="${activeIndex}"]`,
      );
      selectedCard?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
      const start = Math.max(0, activeIndex - 3);
      requestTabPreviews(tabs.slice(start, activeIndex + 5).map((tab) => tab.id));
      return;
    }

    const selectedItem = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    const list = listRef.current;
    if (selectedItem && list) {
      const listRect = list.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      if (itemRect.top < listRect.top) {
        list.scrollTop -= listRect.top - itemRect.top;
      } else if (itemRect.bottom > listRect.bottom) {
        list.scrollTop += itemRect.bottom - listRect.bottom;
      }
    }

    if (isGallery) {
      const start = Math.max(0, activeIndex - 4);
      requestTabPreviews(results.slice(start, activeIndex + 8).flatMap((result) =>
        result.kind === "tab" ? [result.tab.id] : []
      ));
    }
  }, [activeIndex, isGallery, isSwitcher, requestTabPreviews, results, tabs]);

  const autocompleteFocusedSuggestion = useCallback(() => {
    const result = results[activeIndex];
    const value = result?.kind === "pinned" || (result?.kind === "tab" && result.tab.pinned)
      ? result.tab.url
      : result?.kind === "visited"
        ? result.item.url
        : result?.kind === "history"
          ? result.query
          : undefined;
    if (value === undefined) return false;
    handleQueryChange(value);
    inputRef.current?.focus();
    window.setTimeout(() => inputRef.current?.setSelectionRange(value.length, value.length), 0);
    return true;
  }, [activeIndex, handleQueryChange, results]);

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        handleQueryChange("");
        setIsExpanded(false);
      } else {
        handleClose();
      }
      return;
    }

    if (!isExpanded && (event.key === "ArrowDown" || event.key === "Tab")) {
      event.preventDefault();
      setIsExpanded(true);
      setSelectedIndex(0);
      return;
    }

    if ((isExpanded || Boolean(query.trim())) && event.key === "ArrowRight" && autocompleteFocusedSuggestion()) {
      event.preventDefault();
    } else if (isGallery && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setSelectedIndex((index) => Math.max(0, Math.min(index + direction, results.length - 1)));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsExpanded(true);
      const step = isGallery ? 2 : 1;
      setSelectedIndex((index) => isGallery
        ? Math.min(index + step, Math.max(0, results.length - 1))
        : results.length ? (index + step) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const step = isGallery ? 2 : 1;
      if (activeIndex < step && !query) {
        setIsExpanded(false);
      } else {
        setSelectedIndex((index) => isGallery
          ? Math.max(index - step, 0)
          : results.length ? (index - step + results.length) % results.length : 0);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      executeResult(results[activeIndex]);
    }
  }

  const visiblePalettePosition = dragPosition ?? settings.palettePosition;

  // Minimal Search Mode (Command + Shift + P)
  // By default, initially only shows the search input bar.
  // Expands only when user types or presses Down arrow.
  const showDropdown = isExpanded || Boolean(query.trim());

  const startPaletteDrag = useCallback((clientX: number, clientY: number, pointerId: number, moved = false) => {
    const position = settingsRef.current.palettePosition;
    paletteDragRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      startPosition: position,
      moved,
    };
    setDragPosition(position);
    setDragPreviewCell(dragPreviewCellForPoint({
      clientX,
      clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    setIsDraggingPalette(true);
  }, []);

  const updatePaletteDrag = useCallback((clientX: number, clientY: number, pointerId: number) => {
    const drag = paletteDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (Math.abs(clientX - drag.startX) > 3 || Math.abs(clientY - drag.startY) > 3) drag.moved = true;
    setDragPosition(nextFreeDragPosition({
      startX: drag.startX,
      startY: drag.startY,
      startPosition: drag.startPosition,
      clientX,
      clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    setDragPreviewCell(dragPreviewCellForPoint({
      clientX,
      clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);

  const releasePalettePointerCapture = useCallback((pointerId: number) => {
    try {
      const card = paletteCardRef.current;
      if (card?.hasPointerCapture?.(pointerId)) card.releasePointerCapture(pointerId);
    } catch {
      // Releasing capture is best-effort; window listeners already track the drag.
    }
  }, []);

  const finishPaletteDragAt = useCallback((clientX: number, clientY: number, pointerId: number) => {
    const drag = paletteDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    const card = paletteCardRef.current;
    const width = card?.getBoundingClientRect().width ?? 640;
    const height = card?.getBoundingClientRect().height ?? 54;
    const nextPosition = snapPalettePosition({
      ...dragPreviewCellForPoint({
        clientX,
        clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      cardWidth: width,
      cardHeight: height,
    });
    paletteDragRef.current = undefined;
    pointerDownAnchorRef.current = undefined;
    releasePalettePointerCapture(pointerId);
    setIsDraggingPalette(false);
    setDragPosition(undefined);
    setDragPreviewCell(undefined);
    if (drag.moved) {
      setSettings((current) => ({ ...current, palettePosition: nextPosition }));
      void saveStoredSettings({ palettePosition: nextPosition }).then(setSettings);
    }
  }, [releasePalettePointerCapture]);

  const cancelPaletteDragAt = useCallback((pointerId: number) => {
    const drag = paletteDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    paletteDragRef.current = undefined;
    pointerDownAnchorRef.current = undefined;
    releasePalettePointerCapture(pointerId);
    setIsDraggingPalette(false);
    setDragPosition(undefined);
    setDragPreviewCell(undefined);
  }, [releasePalettePointerCapture]);

  // Track the drag at window level so moves keep arriving even when pointer
  // capture fails or events retarget outside the card (fast drags, native
  // input behaviors, shadow-DOM retargeting). Also starts the drag when Alt
  // is pressed mid-press, so both press orders work.
  useMountEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      if (paletteDragRef.current) {
        updatePaletteDrag(event.clientX, event.clientY, event.pointerId);
        return;
      }
      const anchor = pointerDownAnchorRef.current;
      if (!anchor || anchor.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1) || anchor.button !== 0) return;
      if (!isAltModifierActive(event) || settingsRef.current.disableMouseCommandPalette) return;
      if (Math.abs(event.clientX - anchor.startX) <= 3 && Math.abs(event.clientY - anchor.startY) <= 3) return;
      startPaletteDrag(event.clientX, event.clientY, event.pointerId, true);
    };
    const clearAnchorWithoutDrag = (pointerId: number) => {
      if (pointerDownAnchorRef.current?.pointerId === pointerId && !paletteDragRef.current) {
        pointerDownAnchorRef.current = undefined;
      }
    };
    const handleWindowPointerUp = (event: globalThis.PointerEvent) => {
      clearAnchorWithoutDrag(event.pointerId);
      finishPaletteDragAt(event.clientX, event.clientY, event.pointerId);
    };
    const handleWindowPointerCancel = (event: globalThis.PointerEvent) => {
      clearAnchorWithoutDrag(event.pointerId);
      cancelPaletteDragAt(event.pointerId);
    };
    const handleWindowBlur = () => {
      const drag = paletteDragRef.current;
      paletteDragModifierRef.current = false;
      setIsPaletteDragReady(false);
      if (drag) cancelPaletteDragAt(drag.pointerId);
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  });

  const handlePalettePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 0) {
      pointerDownAnchorRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        button: event.button,
      };
    }
    if (!canStartPaletteDrag({
      altKey: isAltModifierActive(event) || paletteDragModifierRef.current,
      button: event.button,
      mouseDisabled: settingsRef.current.disableMouseCommandPalette,
    })) return;
    event.preventDefault();
    startPaletteDrag(event.clientX, event.clientY, event.pointerId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; window-level listeners keep tracking the drag.
    }
  };

  const handlePalettePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paletteDragRef.current) {
      updatePaletteDrag(event.clientX, event.clientY, event.pointerId);
      return;
    }
    const altActive = isAltModifierActive(event);
    if (paletteDragModifierRef.current !== altActive) {
      paletteDragModifierRef.current = altActive;
      setIsPaletteDragReady(altActive && !settingsRef.current.disableMouseCommandPalette);
    }
  };

  const finishPaletteDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    finishPaletteDragAt(event.clientX, event.clientY, event.pointerId);
  };

  const cancelPaletteDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    cancelPaletteDragAt(event.pointerId);
  };

  if (isBookmarks) {
    return (
      <BookmarkManager
        theme={settings.theme}
        useVibrancy={settings.useVibrancy}
        opacity={settings.paletteOpacity}
        disableMouse={settings.disableMouseBookmarks}
        position={visiblePalettePosition}
        isClosing={isClosing}
        onClose={handleClose}
      />
    );
  }

  // Visual Horizontal Switcher Mode (Alt + Q)
  if (isSwitcher) {
    return (
      <div
        className={`palette-backdrop switcher-backdrop ${isClosing ? "is-closing" : ""}`}
        data-theme={settings.theme}
        data-vibrancy={settings.useVibrancy ? "on" : "off"}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div className={`switcher-hud ${isClosing ? "is-closing" : ""}`} role="dialog" aria-label="Tab Switcher" style={{ opacity: settings.paletteOpacity }}>
          <div
            className={`switcher-track ${tabs.length <= 3 ? "is-centered" : ""}`}
            ref={trackRef}
            role="listbox"
          >
            {tabs.length === 0 ? (
              <div className="empty-state">
                <span>No open tabs</span>
              </div>
            ) : (
              tabs.map((tab, index) => (
                <SwitcherCard
                  key={`switcher-${tab.windowId}-${tab.id}`}
                  tab={tab}
                  index={index}
                  isSelected={index === activeIndex}
                  previewUrl={previewUrls[String(tab.id)]}
                  onClick={settings.disableMouseTabSwitcher ? undefined : () => void switchTab(tab)}
                  onMouseEnter={settings.disableMouseTabSwitcher ? undefined : () => setSelectedIndex(index)}
                  onToggleMute={settings.disableMouseTabSwitcher ? undefined : () => void muteTab(tab)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`palette-backdrop ${isClosing ? "is-closing" : ""}`}
      data-theme={settings.theme}
      data-vibrancy={settings.useVibrancy ? "on" : "off"}
      onMouseDown={(event) => {
        if (event.altKey) return;
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      {isDraggingPalette && (
        <div className="palette-placement-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={index}
              className={`palette-placement-cell ${dragPreviewCell?.column === index % 3 && dragPreviewCell?.row === Math.floor(index / 3) ? "is-preview" : ""}`}
            />
          ))}
        </div>
      )}
      <div
        ref={paletteCardRef}
        className={`palette-card ${showDropdown ? "is-expanded" : ""} ${isGallery && showDropdown ? "is-gallery-view" : ""} ${isClosing ? "is-closing" : ""} ${isPaletteDragReady ? "is-drag-ready" : ""} ${isDraggingPalette ? "is-dragging" : ""}`}
        style={{ left: `${visiblePalettePosition.x * 100}%`, top: `${visiblePalettePosition.y * 100}%`, opacity: settings.paletteOpacity }}
        role="dialog"
        aria-modal="true"
        onPointerDown={handlePalettePointerDown}
        onPointerMove={handlePalettePointerMove}
        onPointerUp={finishPaletteDrag}
        onPointerCancel={cancelPaletteDrag}
        onClickCapture={(event) => {
          // Alt+click is a drag gesture, never an activation: block buttons,
          // clear/expand toggles, and rows from firing while Alt is held.
          if (isAltModifierActive(event) || paletteDragModifierRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onPointerEnter={(event) => {
          const altActive = isAltModifierActive(event);
          paletteDragModifierRef.current = altActive;
          setIsPaletteDragReady(altActive && !settingsRef.current.disableMouseCommandPalette);
        }}
        onPointerLeave={() => {
          if (paletteDragRef.current) return;
          paletteDragModifierRef.current = false;
          setIsPaletteDragReady(false);
        }}
      >
        {/* Elevated 3D Search Bar Input Row */}
        <div className="search-bar-row">
          <SearchIcon size={17} className="search-lead-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search open tabs or web..."
            aria-label="Search open tabs or the web"
            autoComplete="off"
            spellCheck="false"
          />

          {query ? (
            <button
              type="button"
              className="clear-icon-btn"
              onClick={() => {
                handleQueryChange("");
                setSelectedIndex(0);
                setIsExpanded(false);
                inputRef.current?.focus();
              }}
              aria-label="Clear query"
            >
              <XIcon size={13} />
            </button>
          ) : (
            <button
              type="button"
              className={`expand-toggle-btn ${showDropdown ? "active" : ""}`}
              onClick={() => {
                setIsExpanded((open) => !open);
                inputRef.current?.focus();
              }}
              aria-label={showDropdown ? "Hide open tabs" : "Show open tabs"}
              title={showDropdown ? "Hide open tabs" : "Show open tabs"}
            >
              <InfoIcon size={15} />
            </button>
          )}
        </div>

        {/* Dropdown Suggestions & Tabs */}
        {showDropdown && (
          <>
            <div className="palette-divider" />
            <div
              className={`item-list ${isGallery ? "gallery-grid" : ""}`}
              ref={listRef}
              role="listbox"
            >
              {results.length === 0 ? (
                <div className="empty-state">
                  <span>No matching tabs</span>
                </div>
              ) : isGallery ? (
                results.map((result, index) => result.kind === "tab" ? (
                  <GalleryCard
                    key={`gal-${result.tab.windowId}-${result.tab.id}`}
                    tab={result.tab}
                    index={index}
                    isSelected={index === activeIndex}
                    previewUrl={previewUrls[String(result.tab.id)]}
                    onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                    onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                    onToggleMute={settings.disableMouseCommandPalette ? undefined : () => void muteTab(result.tab)}
                  />
                ) : (
                  <PaletteAction
                    key={`${result.kind}-${index}`}
                    result={result}
                    index={index}
                    isSelected={index === activeIndex}
                    onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                    onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                  />
                ))
              ) : (
                results.map((result, index) => {
                  const isSelected = index === activeIndex;
                  if (result.kind !== "tab") {
                    return (
                      <PaletteAction
                        key={`${result.kind}-${index}`}
                        result={result}
                        index={index}
                        isSelected={isSelected}
                        onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                        onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                      />
                    );
                  }
                  const tab = result.tab;
                  return (
                    <div
                      key={`tab-${tab.windowId}-${tab.id}`}
                      data-index={index}
                      style={{ "--item-index": index } as React.CSSProperties}
                      className={`list-row ${isSelected ? "selected" : ""}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                      onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                    >
                      <div className="list-row-left">
                        <span className="tab-favicon-wrapper">
                          <TabFavicon tab={tab} size={18} />
                        </span>
                        <div className="row-content">
                          <span className="row-title">{tab.title}</span>
                          {tab.pinned && <PinIcon className="tab-pinned-icon" size={12} />}
                          {tab.hostname && tab.hostname !== tab.title && (
                            <span className="row-domain">— {tab.hostname}</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <TabSoundIndicator
                          tab={tab}
                          size={16}
                          onToggleMute={settings.disableMouseCommandPalette ? undefined : () => void muteTab(tab)}
                        />
                        {!tab.active || !tab.windowFocused ? (
                          <div className={`list-row-action ${isSelected ? "selected" : ""}`}>
                            <span className="action-text">Switch to Tab</span>
                            <span className="action-arrow-badge">
                              <ArrowRightIcon size={12} />
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
