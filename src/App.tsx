import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateTab, getBrowserHistory, getTabs, openUrl, searchWeb, setTabPinned, type BrowserHistoryItem } from "./browser";
import { ArrowRightIcon, InfoIcon, PinIcon, SearchIcon, XIcon } from "./icons";
import { PaletteAction } from "./PaletteAction";
import { buildSearchResults, type SearchResult } from "./paletteSearch";
import { getSearchHistory, recordSearch, type SearchHistoryEntry } from "./searchHistory";
import { DEFAULT_SETTINGS, getStoredSettings, pinnedTabIdentity, subscribeToSettings } from "./settings";
import { useMountEffect } from "./hooks/useMountEffect";
import { TabFavicon, TabSoundIndicator } from "./components/TabVisuals";
import { GalleryCard, SwitcherCard } from "./components/TabCards";
import type { BrowserMessage, PaletteTab, UserSettings } from "./types";

export function App({
  onClose,
  initialMode = "search",
  previewUrl,
  initialActiveTabId,
}: {
  onClose: () => void;
  initialMode?: "search" | "switcher";
  previewUrl?: string;
  initialActiveTabId?: number;
}) {
  const [tabs, setTabs] = useState<PaletteTab[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [recentBrowserHistory, setRecentBrowserHistory] = useState<BrowserHistoryItem[]>([]);
  const [browserHistory, setBrowserHistory] = useState<BrowserHistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "switcher">(initialMode);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl);

  const isSwitcher = mode === "switcher";
  const isGallery = settings.viewMode === "gallery";
  const [isExpanded, setIsExpanded] = useState(isSwitcher);
  const [selectedIndex, setSelectedIndex] = useState(isSwitcher ? 1 : 0);
  const initialSwitcherSelectionPending = useRef(isSwitcher && initialActiveTabId !== undefined);
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<SearchResult[]>([]);
  const tabsRef = useRef(tabs);
  const modeRef = useRef(mode);
  const selectedIndexRef = useRef(selectedIndex);
  const refreshTabsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const switchTabRef = useRef<(targetTab?: PaletteTab) => Promise<void>>(() => Promise.resolve());
  const handleCloseRef = useRef<() => void>(() => undefined);
  tabsRef.current = tabs;
  modeRef.current = mode;
  selectedIndexRef.current = selectedIndex;
  const tabsRequestIdRef = useRef(0);

  // Load and subscribe to persistent settings
  useMountEffect(() => {
    void getStoredSettings().then(setSettings);
    void getSearchHistory().then(setHistory).catch(() => setHistory([]));
    void getBrowserHistory("", 8).then(setRecentBrowserHistory).catch(() => setRecentBrowserHistory([]));
    return subscribeToSettings(setSettings);
  });

  const historySearchTimerRef = useRef<number | undefined>(undefined);
  const historyRequestIdRef = useRef(0);
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
  }, [isSwitcher, initialActiveTabId]);
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
            chrome.tabs.onUpdated,
            chrome.tabs.onActivated,
            chrome.windows.onFocusChanged,
          ]
        : [];
    events.forEach((event) => event.addListener(scheduleRefresh));
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      events.forEach((event) => event.removeListener(scheduleRefresh));
    };
  });

  // Unified message listener for both in-page overlay and new tab page
  useMountEffect(() => {
    const handleMessage = (message: BrowserMessage) => {
      if (message.type === "update-switcher-preview") {
        setCurrentPreviewUrl(message.previewUrl);
      } else if (message.type === "open-palette") {
        if (message.mode === "switcher") {
          setMode("switcher");
          if (message.previewUrl !== undefined) {
            setCurrentPreviewUrl(message.previewUrl);
          }
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
          if (message.previewUrl !== undefined) setCurrentPreviewUrl(message.previewUrl);
          setIsExpanded(false);
          handleQueryChange("");
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
    setSelectedIndex((index) => Math.min(index, Math.max(0, results.length - 1)));
  }, [results.length]);
  const activeIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

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

  // Visual Horizontal Switcher Mode (Alt + Q)
  if (isSwitcher) {
    return (
      <div
        className={`palette-backdrop switcher-backdrop ${isClosing ? "is-closing" : ""}`}
        data-theme={settings.theme}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div className={`switcher-hud ${isClosing ? "is-closing" : ""}`} role="dialog" aria-label="Tab Switcher">
          <div className="switcher-track" ref={trackRef} role="listbox">
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
                  previewUrl={currentPreviewUrl}
                  onClick={settings.disableMouseTabSwitcher ? undefined : () => void switchTab(tab)}
                  onMouseEnter={settings.disableMouseTabSwitcher ? undefined : () => setSelectedIndex(index)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Minimal Search Mode (Command + Shift + P)
  // By default, initially only shows the search input bar.
  // Expands only when user types or presses Down arrow.
  const showDropdown = isExpanded || Boolean(query.trim());

  return (
    <div
      className={`palette-backdrop ${isClosing ? "is-closing" : ""}`}
      data-theme={settings.theme}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className={`palette-card ${showDropdown ? "is-expanded" : ""} ${isGallery && showDropdown ? "is-gallery-view" : ""} ${isClosing ? "is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
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
                    previewUrl={currentPreviewUrl}
                    onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                    onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
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
                        <TabSoundIndicator tab={tab} size={16} />
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
