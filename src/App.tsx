import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateTab, getTabs } from "./browser";
import { ChevronDownIcon, GlobeIcon, XIcon } from "./icons";
import { DEFAULT_SETTINGS, getStoredSettings, subscribeToSettings } from "./settings";
import type { BrowserMessage, PaletteTab, UserSettings, ViewMode } from "./types";

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
        <TabFavicon tab={tab} size={18} />
        <span className="switcher-card-title">{tab.title}</span>
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
  onClick: () => void;
  onMouseEnter: () => void;
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
}: {
  onClose: () => void;
  initialMode?: "search" | "switcher";
  previewUrl?: string;
}) {
  const [tabs, setTabs] = useState<PaletteTab[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "switcher">(initialMode);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl);

  const isSwitcher = mode === "switcher";
  const [isExpanded, setIsExpanded] = useState(isSwitcher);
  const [selectedIndex, setSelectedIndex] = useState(isSwitcher ? 1 : 0);
  const [isClosing, setIsClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Load and subscribe to persistent settings
  useEffect(() => {
    void getStoredSettings().then((s) => {
      setSettings(s);
      setViewMode(s.viewMode);
    });

    return subscribeToSettings((s) => {
      setSettings(s);
      setViewMode(s.viewMode);
    });
  }, []);

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

  // Unified message listener for both in-page overlay and new tab page
  useEffect(() => {
    const handleMessage = (message: BrowserMessage) => {
      if (message.type === "update-switcher-preview") {
        setCurrentPreviewUrl(message.previewUrl);
      } else if (message.type === "open-palette") {
        if (message.mode === "switcher") {
          setMode("switcher");
          setCurrentPreviewUrl(message.previewUrl);
          setIsExpanded(true);
          setSelectedIndex((curr) => {
            if (tabs.length === 0) return 0;
            return (curr + 1) % tabs.length;
          });
        } else {
          setMode("search");
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
      }
    };

    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [tabs.length]);

  // Switch to selected tab
  const switchTab = useCallback(
    async (targetTab?: PaletteTab) => {
      if (!targetTab) return;
      await activateTab(targetTab);
      handleClose();
    },
    [handleClose]
  );

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
      activeEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedIndex, isSwitcher]);

  // Filter open tabs strictly
  const items = useMemo<PaletteTab[]>(() => {
    const trimmed = query.trim();
    return tabs
      .map((tab, index) => ({ tab, score: scoreTab(tab, trimmed), index }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ tab }) => tab);
  }, [query, tabs]);

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
      if (items.length > 0 && items[selectedIndex]) {
        void switchTab(items[selectedIndex]);
      }
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
  // By default, initially only shows the search input bar.
  // Expands only when user types or presses Down arrow.
  const isGallery = viewMode === "gallery";
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
            placeholder="Search open tabs..."
            aria-label="Search open tabs"
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
              <ChevronDownIcon size={14} />
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
              {items.length === 0 ? (
                <div className="empty-state">
                  <span>No matching tabs</span>
                </div>
              ) : isGallery ? (
                items.map((tab, index) => (
                  <GalleryCard
                    key={`gal-${tab.windowId}-${tab.id}`}
                    tab={tab}
                    index={index}
                    isSelected={index === selectedIndex}
                    previewUrl={currentPreviewUrl}
                    onClick={() => void switchTab(tab)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  />
                ))
              ) : (
                items.map((tab, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={`tab-${tab.windowId}-${tab.id}`}
                      data-index={index}
                      style={{ "--item-index": index } as React.CSSProperties}
                      className={`list-row ${isSelected ? "selected" : ""}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => void switchTab(tab)}
                    >
                      <TabFavicon tab={tab} />
                      <div className="row-content">
                        <span className="row-title">{tab.title}</span>
                        <span className="row-subtitle">{tab.hostname || tab.url}</span>
                      </div>
                      {tab.active && tab.windowFocused && <span className="status-badge">Current</span>}
                      {tab.pinned && <span className="status-badge">Pinned</span>}
                    </div>
                  );
                })
              )}
            </div>

            {/* Clean, minimal footer */}
            <div className="palette-footer">
              <div className="footer-group">
                <span className="meta-count">
                  {tabs.length} {tabs.length === 1 ? "tab" : "tabs"}
                </span>
              </div>

              <div className="footer-keys">
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>↵</kbd>
                <kbd>esc</kbd>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
