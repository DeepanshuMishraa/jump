import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateTab, getTabs, openUrl } from "./browser";
import { registerCycleCallback } from "./content";
import { ArrowUpRightIcon, ChevronDownIcon, CornerDownLeftIcon, GlobeIcon, SearchIcon, XIcon } from "./icons";
import type { PaletteTab } from "./types";

type ActionItem = {
  type: "action";
  id: string;
  title: string;
  subtitle: string;
  action: () => Promise<void> | void;
  icon: "globe" | "search";
};

type TabItem = {
  type: "tab";
  tab: PaletteTab;
};

type ListItem = TabItem | ActionItem;

function isUrlLike(text: string) {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) return true;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed)) return true;
  return false;
}

function normalizeUrl(text: string) {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function scoreTab(tab: PaletteTab, query: string) {
  if (!query) return tab.windowFocused ? 100 : tab.active ? 90 : tab.lastAccessed ? 50 : 10;
  const normalized = query.toLowerCase();
  const title = tab.title.toLowerCase();
  const hostname = tab.hostname.toLowerCase();
  const url = tab.url.toLowerCase();
  if (title === normalized || hostname === normalized) return 1000;
  if (title.startsWith(normalized) || hostname.startsWith(normalized)) return 800;
  if (title.includes(normalized)) return 600;
  if (hostname.includes(normalized)) return 500;
  if (url.includes(normalized)) return 300;
  return -1;
}

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
  onClick: () => void;
  onMouseEnter: () => void;
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
        <TabFavicon tab={tab} size={20} />
        <span className="switcher-card-title">{tab.title}</span>
      </div>
    </div>
  );
}

export function App({
  onClose,
  initialMode = "search",
  previewUrl,
}: {
  onClose: () => void;
  initialMode?: "search" | "switcher";
  previewUrl?: string;
}) {
  const [tabs, setTabs] = useState<PaletteTab[]>([]);
  const [query, setQuery] = useState("");
  const isSwitcher = initialMode === "switcher";
  const [isExpanded, setIsExpanded] = useState(isSwitcher);
  const [selectedIndex, setSelectedIndex] = useState(isSwitcher ? 1 : 0);
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

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
      if (isSwitcher && tabList.length > 1) {
        setSelectedIndex(1);
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
  }, [refreshTabs, isSwitcher]);

  // Register cycle callback for Alt+Q repeat triggers
  useEffect(() => {
    if (!isSwitcher) return;
    return registerCycleCallback((direction) => {
      setSelectedIndex((curr) => {
        if (tabs.length === 0) return 0;
        if (direction === "next") return (curr + 1) % tabs.length;
        return (curr - 1 + tabs.length) % tabs.length;
      });
    });
  }, [isSwitcher, tabs.length]);


  // Switch to selected tab
  const switchTab = useCallback(
    async (targetTab?: PaletteTab) => {
      if (!targetTab) return;
      await activateTab(targetTab);
      handleClose();
    },
    [handleClose]
  );

  // Global keyup handler for releasing Alt key in switcher mode
  useEffect(() => {
    if (!isSwitcher) return;

    let hasInteracted = false;

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
        handleClose();
        return;
      }

      if ((event.altKey || event.metaKey) && event.key.toLowerCase() === "q") {
        event.preventDefault();
        hasInteracted = true;
        setSelectedIndex((curr) => {
          if (tabs.length === 0) return 0;
          if (event.shiftKey) return (curr - 1 + tabs.length) % tabs.length;
          return (curr + 1) % tabs.length;
        });
        return;
      }

      if (event.key === "ArrowRight" || event.key === "Tab") {
        event.preventDefault();
        setSelectedIndex((curr) => (tabs.length ? (curr + 1) % tabs.length : 0));
      } else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        setSelectedIndex((curr) => (tabs.length ? (curr - 1 + tabs.length) % tabs.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (tabs[selectedIndex]) {
          void switchTab(tabs[selectedIndex]);
        }
      }
    };

    window.addEventListener("keyup", handleWindowKeyUp);
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keyup", handleWindowKeyUp);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isSwitcher, tabs, selectedIndex, switchTab, handleClose]);

  // Auto-scroll active card into view
  useEffect(() => {
    if (isSwitcher && trackRef.current) {
      const activeEl = trackRef.current.querySelector(`[data-switcher-index="${selectedIndex}"]`);
      activeEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedIndex, isSwitcher]);

  // Generate list items (matching tabs + URL/Search actions) for search mode
  const items = useMemo<ListItem[]>(() => {
    const trimmed = query.trim();
    const matchedTabs: ListItem[] = tabs
      .map((tab, index) => ({ tab, score: scoreTab(tab, trimmed), index }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ tab }) => ({ type: "tab", tab }));

    if (!trimmed) {
      return matchedTabs;
    }

    const actionList: ListItem[] = [];

    if (isUrlLike(trimmed)) {
      const targetUrl = normalizeUrl(trimmed);
      actionList.push({
        type: "action",
        id: "open-url",
        title: `Open ${targetUrl}`,
        subtitle: "Navigate in new tab",
        action: async () => {
          await openUrl(targetUrl);
          handleClose();
        },
        icon: "globe",
      });
    }

    actionList.push({
      type: "action",
      id: "search-google",
      title: `Search Google for "${trimmed}"`,
      subtitle: "Web search",
      action: async () => {
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
        await openUrl(googleUrl);
        handleClose();
      },
      icon: "search",
    });

    return [...matchedTabs, ...actionList];
  }, [query, tabs, handleClose]);

  // Adjust selected index bounds for search list
  useEffect(() => {
    if (!isSwitcher) {
      setSelectedIndex((index) => Math.min(index, Math.max(0, items.length - 1)));
    }
  }, [items.length, isSwitcher]);

  // Ensure selected item is visible in search list
  useEffect(() => {
    if (isSwitcher || !isExpanded || items.length === 0) return;
    const activeEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, isExpanded, items.length, isSwitcher]);

  const executeItem = useCallback(
    async (item?: ListItem) => {
      if (!item) return;
      if (item.type === "tab") {
        await activateTab(item.tab);
        handleClose();
      } else if (item.type === "action") {
        await item.action();
      }
    },
    [handleClose]
  );

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

    if (event.key === "ArrowDown" || (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      setIsExpanded(true);
      setSelectedIndex((index) => (items.length ? (index + 1) % items.length : 0));
    } else if (event.key === "ArrowUp" || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      if (selectedIndex === 0 && !query) {
        setIsExpanded(false);
      } else {
        setSelectedIndex((index) => (items.length ? (index - 1 + items.length) % items.length : 0));
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (items.length > 0) {
        void executeItem(items[selectedIndex]);
      } else if (query.trim()) {
        const url = isUrlLike(query)
          ? normalizeUrl(query)
          : `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
        void openUrl(url).then(() => handleClose());
      }
    }
  }

  // Visual Horizontal Switcher Mode (Alt + Q)
  if (isSwitcher) {
    return (
      <div
        className={`palette-backdrop switcher-backdrop ${isClosing ? "is-closing" : ""}`}
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
                  previewUrl={previewUrl}
                  onClick={() => void switchTab(tab)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Minimal Search Mode (Command + Shift + P)
  const showDropdown = isExpanded || Boolean(query.trim());

  return (
    <div
      className={`palette-backdrop ${isClosing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className={`palette-card ${showDropdown ? "is-expanded" : ""} ${isClosing ? "is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Search Bar Input Row */}
        <div className="search-bar-row">
          <span className="search-lead-icon" aria-hidden="true">
            <SearchIcon size={16} />
          </span>

          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={query}
            onChange={(event) => {
              const val = event.target.value;
              setQuery(val);
              if (val.trim()) {
                setIsExpanded(true);
              }
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Enter URL or search..."
            aria-label="Search open tabs or enter URL"
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
              <ChevronDownIcon size={14} />
            </button>
          )}
        </div>

        {/* Dropdown Suggestions & Tabs */}
        {showDropdown && (
          <>
            <div className="palette-divider" />
            <div className="item-list" ref={listRef} role="listbox">
              {items.length === 0 ? (
                <div className="empty-state">
                  <span>No matching tabs</span>
                </div>
              ) : (
                items.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  if (item.type === "tab") {
                    const tab = item.tab;
                    return (
                      <div
                        key={`tab-${tab.windowId}-${tab.id}`}
                        data-index={index}
                        style={{ "--item-index": index } as React.CSSProperties}
                        className={`list-row ${isSelected ? "selected" : ""}`}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => void executeItem(item)}
                      >
                        <TabFavicon tab={tab} />
                        <div className="row-content">
                          <span className="row-title">{tab.title}</span>
                          <span className="row-subtitle">{tab.hostname || tab.url}</span>
                        </div>
                        {tab.active && tab.windowFocused && <span className="status-badge">Current</span>}
                        {tab.pinned && <span className="status-badge">Pinned</span>}
                        {isSelected && (
                          <span className="action-hint" aria-hidden="true">
                            <CornerDownLeftIcon size={12} />
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      data-index={index}
                      style={{ "--item-index": index } as React.CSSProperties}
                      className={`list-row ${isSelected ? "selected" : ""}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => void executeItem(item)}
                    >
                      <span className="item-icon action-icon" aria-hidden="true">
                        {item.icon === "globe" ? <ArrowUpRightIcon size={14} /> : <SearchIcon size={14} />}
                      </span>
                      <div className="row-content">
                        <span className="row-title">{item.title}</span>
                        <span className="row-subtitle">{item.subtitle}</span>
                      </div>
                      {isSelected && (
                        <span className="action-hint" aria-hidden="true">
                          <CornerDownLeftIcon size={12} />
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Clean, minimal footer hint */}
            <div className="palette-footer">
              <div className="footer-group">
                <span className="meta-count">
                  {tabs.length} {tabs.length === 1 ? "tab" : "tabs"}
                </span>
              </div>
              <div className="footer-keys">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> navigate
                </span>
                <span>
                  <kbd>↵</kbd> select
                </span>
                <span>
                  <kbd>esc</kbd> close
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
