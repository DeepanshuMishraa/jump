export type ColorTheme =
  | "default"
  | "catppuccin-latte"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "catppuccin-mocha"
  | "rose-pine-dawn"
  | "rose-pine-main"
  | "rose-pine-moon"
  | "tokyo-night"
  | "nord"
  | "gruvbox-dark"
  | "gruvbox-light"
  | "vesper";

export type ViewMode = "list" | "gallery";
export type TabSwitchMode = "recent" | "order";

export type PalettePosition = {
  x: number;
  y: number;
};

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
  useVibrancy: boolean;
  disableMouseTabSwitcher: boolean;
  disableMouseCommandPalette: boolean;
  tabSwitchMode: TabSwitchMode;
  pinnedTabs: PinnedTab[];
  palettePosition: PalettePosition;
};

export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string[];
  dateAdded?: number;
  faviconUrl?: string;
};

export type PaletteTab = {
  id: number;
  windowId: number;
  title: string;
  url: string;
  hostname: string;
  index: number;
  faviconUrl?: string;
  active: boolean;
  windowFocused: boolean;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  lastAccessed?: number;
};

export type BrowserMessage =
  | { type: "get-tabs" }
  | { type: "get-tab-previews"; tabIds: number[] }
  | { type: "palette-opened" }
  | { type: "palette-closed" }
  | { type: "search-history"; query: string; maxResults?: number }
  | { type: "activate-tab"; tab: PaletteTab }
  | { type: "toggle-tab-muted"; tabId: number; muted: boolean }
  | { type: "open-url"; url: string; openerTabId?: number }
  | { type: "search-web"; query: string }
  | { type: "open-shortcut-settings" }
  | { type: "open-palette"; mode?: "search" | "switcher" | "bookmarks"; activeTabId?: number }
  | { type: "cycle-tab-switcher"; direction?: "next" | "prev" }
  | { type: "request-pin-selected-tab" }
  | { type: "request-mute-selected-tab" }
  | { type: "get-bookmarks" }
  | { type: "open-bookmark"; url: string }
  | { type: "set-tab-pinned"; tab: PinnedTab; pinned: boolean }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: Partial<UserSettings> };


