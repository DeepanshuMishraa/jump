import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateTab, getBrowserHistory, getTabs, openUrl, searchWeb, setTabPinned, type BrowserHistoryItem } from "./browser";
import { ArrowRightIcon, ChevronDownIcon, GlobeIcon, InfoIcon, MuteIcon, PinIcon, SearchIcon, SpeakerIcon, XIcon } from "./icons";
import { PaletteAction } from "./PaletteAction";
import { buildSearchResults, type SearchResult } from "./paletteSearch";
import { getSearchHistory, recordSearch, type SearchHistoryEntry } from "./searchHistory";
import { DEFAULT_SETTINGS, getStoredSettings, pinnedTabIdentity, subscribeToSettings } from "./settings";
import type { BrowserMessage, PaletteTab, UserSettings } from "./types";

function TabFavicon({ tab, size = 16 }: { tab: PaletteTab; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!tab.faviconUrl || failed) {
    return (
      <span className="item-icon fallback-favicon" style={{ width: size, height: size }} aria-hidden="true">
        <GlobeIcon size={Math.round(size * 0.75)} />
      </span>
    );
  }
  return (
    <img
      className="item-icon tab-favicon"
      style={{ width: size, height: size }}
      src={tab.faviconUrl}
      alt=""
      onError={() => setFailed(true)}
      loading="eager"
    />
  );
}

function TabSoundIndicator({ tab, size = 14 }: { tab: PaletteTab; size?: number }) {
  if (tab.muted) return <MuteIcon size={size} className="tab-audible-icon" />;
  if (tab.audible) return <SpeakerIcon size={size} className="tab-audible-icon" />;
  return null;
}

function SwitcherCard({
  tab,
  isSelected,
  previewUrl,
  index,
  onClick,
  onMouseEnter,
}: {
  tab: PaletteTab;
  isSelected: boolean;
  previewUrl?: string;
  index: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const effectivePreview = tab.previewUrl || (tab.active && tab.windowFocused ? previewUrl : undefined);

  return (
    <div
      data-switcher-index={index}
      className={`switcher-card ${isSelected ? "is-selected" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={isSelected}
    >
      <div className="switcher-thumbnail">
        {effectivePreview ? (
          <img src={effectivePreview} alt="" className="switcher-thumbnail-image" loading="eager" />
        ) : (
          <div className="switcher-placeholder">
            <div className="switcher-placeholder-icon">
              <TabFavicon tab={tab} size={32} />
            </div>
            <span className="switcher-placeholder-domain">{tab.hostname || "Web Page"}</span>
          </div>
        )}
        <div className="switcher-thumbnail-glass" />
      </div>

      <div className="switcher-card-footer">
        <TabFavicon tab={tab} size={18} />
        <span className="switcher-card-title">{tab.title}</span>
        {tab.pinned && <PinIcon className="tab-pinned-icon" size={13} />}
        <TabSoundIndicator tab={tab} />
      </div>
    </div>
  );
}

function GalleryCard({
  tab,
  index,
  isSelected,
  previewUrl,
  onClick,
  onMouseEnter,
}: {
  tab: PaletteTab;
  index: number;
  isSelected: boolean;
  previewUrl?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  const effectivePreview = tab.previewUrl || (tab.active && tab.windowFocused ? previewUrl : undefined);

  return (
    <div
      data-index={index}
      className={`gallery-card ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={isSelected}
    >
      <div className="gallery-thumbnail">
        {effectivePreview ? (
          <img src={effectivePreview} alt="" className="gallery-thumbnail-image" loading="eager" />
        ) : (
          <div className="gallery-placeholder">
            <TabFavicon tab={tab} size={28} />
            <span className="gallery-placeholder-domain">{tab.hostname || "Web Page"}</span>
          </div>
        )}
      </div>

      <div className="gallery-meta">
        <div className="gallery-meta-left">
          <TabFavicon tab={tab} size={15} />
          <span className="gallery-title">{tab.title}</span>
          {tab.pinned && <PinIcon className="tab-pinned-icon" size={12} />}
          <TabSoundIndicator tab={tab} />
        </div>
        {tab.hostname && <span className="gallery-domain">{tab.hostname}</span>}
      </div>
    </div>
  );
}

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

  // Load and subscribe to persistent settings
  useEffect(() => {
    void getStoredSettings().then(setSettings);
    void getSearchHistory().then(setHistory).catch(() => setHistory([]));
    void getBrowserHistory("", 8).then(setRecentBrowserHistory).catch(() => setRecentBrowserHistory([]));
    return subscribeToSettings(setSettings);
  }, []);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();
    const localMatches = trimmed
      ? recentBrowserHistory.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(trimmed))
      : [];
    setBrowserHistory(localMatches);
    if (!trimmed) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void getBrowserHistory(trimmed, 8).then((items) => {
        if (!cancelled) {
          const seen = new Set(localMatches.map((item) => item.id));
          setBrowserHistory([...localMatches, ...items.filter((item) => !seen.has(item.id))]);
        }
      }).catch(() => {
        // Keep locally available history visible when Chrome history is unavailable.
      });
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, recentBrowserHistory]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 130);
  }, [onClose]);

  const refreshTabs = useCallback(async () => {
    try {
      const tabList = await getTabs();
      setTabs(tabList);
      if (isSwitcher && initialSwitcherSelectionPending.current && tabList.length > 0) {
        const activeIndex = initialActiveTabId === undefined
          ? -1
          : tabList.findIndex((tab) => tab.id === initialActiveTabId);
        setSelectedIndex((activeIndex + 1 + tabList.length) % tabList.length);
        initialSwitcherSelectionPending.current = false;
      }
    } catch {
      setTabs([]);
    }
  }, [isSwitcher]);

  useEffect(() => {
    if (!isSwitcher) {
      inputRef.current?.focus();
    }
    void refreshTabs();
    const refresh = () => void refreshTabs();
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
    events.forEach((event) => event.addListener(refresh));
    return () => events.forEach((event) => event.removeListener(refresh));
  }, [refreshTabs, isSwitcher, initialActiveTabId]);

  // Unified message listener for both in-page overlay and new tab page
  useEffect(() => {
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
            if (tabs.length === 0) return 0;
            if (isSwitcher) return (currentIndex + 1) % tabs.length;
            const activeIndex = message.activeTabId === undefined
              ? -1
              : tabs.findIndex((tab) => tab.id === message.activeTabId);
            return (activeIndex + 1 + tabs.length) % tabs.length;
          });
        } else {
          setMode("search");
          if (message.previewUrl !== undefined) setCurrentPreviewUrl(message.previewUrl);
          setIsExpanded(false);
          setQuery("");
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      } else if (message.type === "cycle-tab-switcher") {
        setSelectedIndex((curr) => {
          if (tabs.length === 0) return 0;
          return message.direction === "prev"
            ? (curr - 1 + tabs.length) % tabs.length
            : (curr + 1) % tabs.length;
        });
      } else if (message.type === "request-pin-selected-tab") {
        const selectedResult = isSwitcher
          ? (tabs[selectedIndex] ? { kind: "tab" as const, tab: tabs[selectedIndex] } : undefined)
          : resultsRef.current[selectedIndex];
        if (selectedResult?.kind === "tab") {
          void setTabPinned(selectedResult.tab, !selectedResult.tab.pinned).then(() => void refreshTabs());
        } else if (selectedResult?.kind === "pinned") {
          void setTabPinned(selectedResult.tab, false);
        }
      }
    };

    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [tabs, selectedIndex, refreshTabs, isSwitcher]);

  // Switch to selected tab
  const switchTab = useCallback(
    async (targetTab?: PaletteTab) => {
      if (!targetTab) return;
      await activateTab(targetTab);
      handleClose();
    },
    [handleClose]
  );

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
  useEffect(() => {
    if (!isSwitcher) return;

    const handleWindowKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Alt" || !event.altKey) {
        if (tabs.length > 0 && selectedIndex < tabs.length) {
          void switchTab(tabs[selectedIndex]);
        } else {
          handleClose();
        }
      }
    };

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((curr) => (tabs.length ? (curr + 1) % tabs.length : 0));
      } else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((curr) => (tabs.length ? (curr - 1 + tabs.length) % tabs.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (tabs[selectedIndex]) {
          void switchTab(tabs[selectedIndex]);
        }
      }
    };

    window.addEventListener("keyup", handleWindowKeyUp, { capture: true });
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keyup", handleWindowKeyUp, { capture: true });
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
    };
  }, [isSwitcher, tabs, selectedIndex, switchTab, handleClose]);

  // Auto-scroll active card into view
  useEffect(() => {
    if (isSwitcher && trackRef.current) {
      const activeEl = trackRef.current.querySelector(`[data-switcher-index="${selectedIndex}"]`);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
      activeEl?.scrollIntoView({ behavior, inline: "center", block: "nearest" });
    }
  }, [selectedIndex, isSwitcher]);

  // Keep saved pins visible even when their browser tab is closed.
  const closedPinnedTabs = useMemo(() => {
    const openIdentities = new Set(tabs.map((tab) => pinnedTabIdentity(tab.url)));
    return settings.pinnedTabs.filter((tab) => !openIdentities.has(tab.identity));
  }, [settings.pinnedTabs, tabs]);
  const results = useMemo(
    () => buildSearchResults(tabs, query, history, browserHistory, closedPinnedTabs),
    [query, tabs, history, browserHistory, closedPinnedTabs],
  );
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Adjust selected index bounds for search list
  useEffect(() => {
    if (!isSwitcher) {
      setSelectedIndex((index) => Math.min(index, Math.max(0, results.length - 1)));
    }
  }, [results.length, isSwitcher]);

  // Ensure selected item is visible in search list
  useEffect(() => {
    if (isSwitcher || !isExpanded || results.length === 0) return;
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, isExpanded, results.length, isSwitcher]);

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        setQuery("");
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

    if (isGallery && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
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
      if (selectedIndex < step && !query) {
        setIsExpanded(false);
      } else {
        setSelectedIndex((index) => isGallery
          ? Math.max(index - step, 0)
          : results.length ? (index - step + results.length) % results.length : 0);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      executeResult(results[selectedIndex]);
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
                  isSelected={index === selectedIndex}
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
            onChange={(event) => {
              const val = event.target.value;
              setQuery(val);
              // Start each new query at the best open-tab match. The web search
              // action becomes the default only when no tab matches.
              setSelectedIndex(0);
              if (val.trim()) {
                setIsExpanded(true);
              }
            }}
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
                setQuery("");
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
                    isSelected={index === selectedIndex}
                    previewUrl={currentPreviewUrl}
                    onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                    onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                  />
                ) : (
                  <PaletteAction
                    key={`${result.kind}-${index}`}
                    result={result}
                    index={index}
                    isSelected={index === selectedIndex}
                    onMouseEnter={settings.disableMouseCommandPalette ? undefined : () => setSelectedIndex(index)}
                    onClick={settings.disableMouseCommandPalette ? undefined : () => executeResult(result)}
                  />
                ))
              ) : (
                results.map((result, index) => {
                  const isSelected = index === selectedIndex;
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
