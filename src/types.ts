export type ColorTheme =
  | "default"
  | "catppuccin"
  | "rose-pine"
  | "tokyo-night"
  | "nord"
  | "gruvbox";

export type ViewMode = "list" | "gallery";
export type TabSwitchMode = "recent" | "order";

export type PinnedTab = {
  tabId: number;
  identity: string;
  url: string;
  title: string;
  hostname: string;
  faviconUrl?: string;
};

export type UserSettings = {
  viewMode: ViewMode;
  theme: ColorTheme;
  disableMouseTabSwitcher: boolean;
  disableMouseCommandPalette: boolean;
  tabSwitchMode: TabSwitchMode;
  pinnedTabs: PinnedTab[];
};

export type PaletteTab = {
  id: number;
  windowId: number;
  title: string;
  url: string;
  hostname: string;
  index: number;
  faviconUrl?: string;
  previewUrl?: string;
  active: boolean;
  windowFocused: boolean;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  lastAccessed?: number;
};

export type BrowserMessage =
  | { type: "get-tabs" }
  | { type: "search-history"; query: string; maxResults?: number }
  | { type: "activate-tab"; tab: PaletteTab }
  | { type: "toggle-tab-muted"; tabId: number; muted: boolean }
  | { type: "open-url"; url: string; openerTabId?: number }
  | { type: "search-web"; query: string }
  | { type: "open-shortcut-settings" }
  | { type: "open-palette"; mode?: "search" | "switcher"; previewUrl?: string; activeTabId?: number }
  | { type: "update-switcher-preview"; previewUrl: string }
  | { type: "cycle-tab-switcher"; direction?: "next" | "prev" }
  | { type: "request-pin-selected-tab" }
  | { type: "request-mute-selected-tab" }
  | { type: "set-tab-pinned"; tab: PinnedTab; pinned: boolean }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<UserSettings> };


