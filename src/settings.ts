import type { ColorTheme, PalettePosition, PinnedTab, TabSwitchMode, UserSettings, ViewMode } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  viewMode: "list",
  theme: "default",
  disableMouseTabSwitcher: false,
  disableMouseCommandPalette: false,
  tabSwitchMode: "recent",
  pinnedTabs: [],
  palettePosition: { x: 0.5, y: 0.28 },
};

export type ThemeInfo = {
  id: ColorTheme;
  name: string;
  badge: string;
  bg: string;
  accent: string;
  text: string;
};

export const THEMES: ThemeInfo[] = [
  {
    id: "default",
    name: "OLED Black",
    badge: "Pitch Dark",
    bg: "#08080a",
    accent: "#38bdf8",
    text: "#ffffff",
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin",
    badge: "Mocha",
    bg: "#1e1e2e",
    accent: "#cba6f7",
    text: "#cdd6f4",
  },
  {
    id: "rose-pine-main",
    name: "Rosé Pine",
    badge: "Main",
    bg: "#191724",
    accent: "#ebbcba",
    text: "#e0def4",
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin",
    badge: "Latte",
    bg: "#eff1f5",
    accent: "#8839ef",
    text: "#4c4f69",
  },
  {
    id: "catppuccin-frappe",
    name: "Catppuccin",
    badge: "Frappé",
    bg: "#303446",
    accent: "#ca9ee6",
    text: "#c6d0f5",
  },
  {
    id: "catppuccin-macchiato",
    name: "Catppuccin",
    badge: "Macchiato",
    bg: "#24273a",
    accent: "#c6a0f6",
    text: "#cad3f5",
  },
  {
    id: "rose-pine-dawn",
    name: "Rosé Pine",
    badge: "Dawn",
    bg: "#faf4ed",
    accent: "#d7827e",
    text: "#575279",
  },
  {
    id: "rose-pine-moon",
    name: "Rosé Pine",
    badge: "Moon",
    bg: "#232136",
    accent: "#ea9a97",
    text: "#e0def4",
  },
  {
    id: "vesper",
    name: "Vesper",
    badge: "Peppermint",
    bg: "#101010",
    accent: "#ffc799",
    text: "#ffffff",
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox",
    badge: "Light",
    bg: "#fbf1c7",
    accent: "#af3a03",
    text: "#3c3836",
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    badge: "Night",
    bg: "#1a1b26",
    accent: "#7aa2f7",
    text: "#c0caf5",
  },
  {
    id: "nord",
    name: "Nord",
    badge: "Arctic",
    bg: "#2e3440",
    accent: "#88c0d0",
    text: "#eceff4",
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox",
    badge: "Dark",
    bg: "#282828",
    accent: "#fe8019",
    text: "#ebdbb2",
  },
];

const LOCAL_SETTINGS_KEY = "jump_settings";
type SettingsBackend = "sync" | "local" | "localStorage";

let selectedBackend: SettingsBackend | undefined;
let saveQueue = Promise.resolve<UserSettings>(DEFAULT_SETTINGS);
const subscribers = new Set<(settings: UserSettings) => void>();

function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "gallery";
}

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "default" || value === "catppuccin-latte" || value === "catppuccin-frappe" ||
    value === "catppuccin-macchiato" || value === "catppuccin-mocha" || value === "rose-pine-dawn" ||
    value === "rose-pine-main" || value === "rose-pine-moon" || value === "tokyo-night" ||
    value === "nord" || value === "vesper" || value === "gruvbox-dark" || value === "gruvbox-light";
}

function parseColorTheme(value: unknown): ColorTheme {
  if (isColorTheme(value)) return value;
  if (value === "catppuccin") return "catppuccin-mocha";
  if (value === "rose-pine") return "rose-pine-main";
  if (value === "gruvbox") return "gruvbox-dark";
  return DEFAULT_SETTINGS.theme;
}

function isTabSwitchMode(value: unknown): value is TabSwitchMode {
  return value === "recent" || value === "order";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function parsePalettePosition(value: unknown): PalettePosition {
  if (typeof value !== "object" || value === null || !("x" in value) || !("y" in value)) {
    return DEFAULT_SETTINGS.palettePosition;
  }
  const { x, y } = value;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
    : DEFAULT_SETTINGS.palettePosition;
}

function parsePinnedTabs(value: unknown): PinnedTab[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tab): PinnedTab[] => {
    if (typeof tab !== "object" || tab === null ||
      !("tabId" in tab) || typeof tab.tabId !== "number" || !Number.isInteger(tab.tabId) || tab.tabId <= 0) {
      return [];
    }
    const url = "url" in tab && typeof tab.url === "string" ? tab.url : "";
    const identity = "identity" in tab && typeof tab.identity === "string" ? tab.identity : pinnedTabIdentity(url);
    if (!identity) return [];
    return [{
      tabId: tab.tabId,
      identity,
      url: url || identity,
      title: "title" in tab && typeof tab.title === "string" ? tab.title : url || identity,
      hostname: "hostname" in tab && typeof tab.hostname === "string" ? tab.hostname : hostnameForPinnedTab(url || identity),
      ...( "faviconUrl" in tab && typeof tab.faviconUrl === "string" ? { faviconUrl: tab.faviconUrl } : {}),
    }];
  });
}

function hostnameForPinnedTab(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function pinnedTabIdentity(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseLegacyPinnedTabs(value: unknown): PinnedTab[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tabId): tabId is number => typeof tabId === "number" && Number.isInteger(tabId) && tabId > 0)
    .map((tabId) => ({ tabId, identity: "", url: "", title: "Pinned tab", hostname: "" }));
}

export function parseStoredSettings(value: unknown): UserSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const viewMode = "viewMode" in value && isViewMode(value.viewMode) ? value.viewMode : DEFAULT_SETTINGS.viewMode;
  const theme = "theme" in value ? parseColorTheme(value.theme) : DEFAULT_SETTINGS.theme;
  const disableMouseTabSwitcher = "disableMouseTabSwitcher" in value && isBoolean(value.disableMouseTabSwitcher)
    ? value.disableMouseTabSwitcher
    : DEFAULT_SETTINGS.disableMouseTabSwitcher;
  const disableMouseCommandPalette = "disableMouseCommandPalette" in value && isBoolean(value.disableMouseCommandPalette)
    ? value.disableMouseCommandPalette
    : DEFAULT_SETTINGS.disableMouseCommandPalette;
  const tabSwitchMode = "tabSwitchMode" in value && isTabSwitchMode(value.tabSwitchMode)
    ? value.tabSwitchMode
    : DEFAULT_SETTINGS.tabSwitchMode;
  const pinnedTabs = "pinnedTabs" in value
    ? parsePinnedTabs(value.pinnedTabs)
    : "pinnedTabIds" in value
      ? parseLegacyPinnedTabs(value.pinnedTabIds)
      : DEFAULT_SETTINGS.pinnedTabs;
  const palettePosition = "palettePosition" in value ? parsePalettePosition(value.palettePosition) : DEFAULT_SETTINGS.palettePosition;
  return { viewMode, theme, disableMouseTabSwitcher, disableMouseCommandPalette, tabSwitchMode, pinnedTabs, palettePosition };
}

function parseSettingsUpdate(value: unknown): Partial<UserSettings> {
  if (typeof value !== "object" || value === null) return {};
  return {
    ...( "viewMode" in value && isViewMode(value.viewMode) ? { viewMode: value.viewMode } : {}),
    ...( "theme" in value && isColorTheme(value.theme) ? { theme: value.theme } : {}),
    ...( "disableMouseTabSwitcher" in value && isBoolean(value.disableMouseTabSwitcher)
      ? { disableMouseTabSwitcher: value.disableMouseTabSwitcher }
      : {}),
    ...( "disableMouseCommandPalette" in value && isBoolean(value.disableMouseCommandPalette)
      ? { disableMouseCommandPalette: value.disableMouseCommandPalette }
      : {}),
    ...( "tabSwitchMode" in value && isTabSwitchMode(value.tabSwitchMode)
      ? { tabSwitchMode: value.tabSwitchMode }
      : {}),
    ...( "pinnedTabs" in value ? { pinnedTabs: parsePinnedTabs(value.pinnedTabs) } : {}),
    ...( "pinnedTabIds" in value && Array.isArray(value.pinnedTabIds)
      ? { pinnedTabs: parseLegacyPinnedTabs(value.pinnedTabIds) }
      : {}),
    ...( "palettePosition" in value ? { palettePosition: parsePalettePosition(value.palettePosition) } : {}),
  };
}

function canUseSyncStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.sync !== undefined;
}

function canUseChromeLocalStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local !== undefined;
}

function readLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return raw === null ? DEFAULT_SETTINGS : parseStoredSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeLocalSettings(settings: UserSettings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Keep the in-memory result available to the current caller.
  }
}

async function readChromeLocalSettings() {
  if (!canUseChromeLocalStorage()) throw new Error("Local extension storage is unavailable");
  const stored: unknown = await chrome.storage.local.get([
    "viewMode",
    "theme",
    "disableMouseTabSwitcher",
    "disableMouseCommandPalette",
    "tabSwitchMode",
    "pinnedTabs",
    "pinnedTabIds",
    "palettePosition",
  ]);
  return parseStoredSettings(stored);
}

async function writeChromeLocalSettings(settings: UserSettings) {
  if (!canUseChromeLocalStorage()) throw new Error("Local extension storage is unavailable");
  await chrome.storage.local.set(settings);
}

function notifySubscribers(settings: UserSettings) {
  subscribers.forEach((callback) => callback(settings));
}

export async function getStoredSettings(): Promise<UserSettings> {
  if (selectedBackend === "local") return readChromeLocalSettings();
  if (selectedBackend === "localStorage") return readLocalSettings();

  if (canUseSyncStorage()) {
    try {
      const settings = parseStoredSettings(await chrome.storage.sync.get([
        "viewMode",
        "theme",
        "disableMouseTabSwitcher",
        "disableMouseCommandPalette",
        "tabSwitchMode",
        "pinnedTabs",
        "pinnedTabIds",
        "palettePosition",
      ]));
      selectedBackend = "sync";
      return settings;
    } catch {
      if (canUseChromeLocalStorage()) {
        selectedBackend = "local";
        return readChromeLocalSettings();
      }
      selectedBackend = "localStorage";
    }
  } else if (canUseChromeLocalStorage()) {
    selectedBackend = "local";
    return readChromeLocalSettings();
  } else {
    selectedBackend = "localStorage";
  }

  return readLocalSettings();
}

async function saveSettings(partial: Partial<UserSettings>) {
  const current = await getStoredSettings();
  const update = parseSettingsUpdate(partial);
  const next: UserSettings = { ...current, ...update };

  if (selectedBackend === "sync" && canUseSyncStorage()) {
    try {
      await chrome.storage.sync.set(update);
      return next;
    } catch {
      selectedBackend = canUseChromeLocalStorage() ? "local" : "localStorage";
    }
  }

  if (selectedBackend === "local") {
    try {
      await writeChromeLocalSettings(next);
    } catch {
      selectedBackend = "localStorage";
      writeLocalSettings(next);
    }
  } else {
    writeLocalSettings(next);
  }
  notifySubscribers(next);
  return next;
}

export function saveStoredSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const pendingSave = saveQueue.then(() => saveSettings(partial), () => saveSettings(partial));
  saveQueue = pendingSave;
  return pendingSave;
}

export function subscribeToSettings(callback: (settings: UserSettings) => void) {
  subscribers.add(callback);
  const storageListener = (_changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== "sync" && areaName !== "local") return;
    if (areaName === "sync" && selectedBackend !== "sync") return;
    if (areaName === "local" && selectedBackend !== "local") return;
    void getStoredSettings().then(callback);
  };
  const localStorageListener = (event: StorageEvent) => {
    if (selectedBackend !== "localStorage" || (event.key !== null && event.key !== LOCAL_SETTINGS_KEY)) return;
    callback(readLocalSettings());
  };

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) chrome.storage.onChanged.addListener(storageListener);
  if (typeof window !== "undefined") window.addEventListener("storage", localStorageListener);

  return () => {
    subscribers.delete(callback);
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) chrome.storage.onChanged.removeListener(storageListener);
    if (typeof window !== "undefined") window.removeEventListener("storage", localStorageListener);
  };
}
