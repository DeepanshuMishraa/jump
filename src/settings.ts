import type { ColorTheme, UserSettings, ViewMode } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  viewMode: "list",
  theme: "default",
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
    id: "catppuccin",
    name: "Catppuccin",
    badge: "Mocha",
    bg: "#1e1e2e",
    accent: "#cba6f7",
    text: "#cdd6f4",
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    badge: "Moon",
    bg: "#191724",
    accent: "#ebbcba",
    text: "#e0def4",
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
    bg: "#242933",
    accent: "#88c0d0",
    text: "#eceff4",
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    badge: "Retro",
    bg: "#282828",
    accent: "#fe8019",
    text: "#ebdbb2",
  },
];

const LOCAL_SETTINGS_KEY = "jump_settings";
type SettingsBackend = "sync" | "localStorage";

let selectedBackend: SettingsBackend | undefined;
let saveQueue = Promise.resolve<UserSettings>(DEFAULT_SETTINGS);
const subscribers = new Set<(settings: UserSettings) => void>();

function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "gallery";
}

function isColorTheme(value: unknown): value is ColorTheme {
  return value === "default" ||
    value === "catppuccin" ||
    value === "rose-pine" ||
    value === "tokyo-night" ||
    value === "nord" ||
    value === "gruvbox";
}

export function parseStoredSettings(value: unknown): UserSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;

  const viewMode = "viewMode" in value && isViewMode(value.viewMode)
    ? value.viewMode
    : DEFAULT_SETTINGS.viewMode;
  const theme = "theme" in value && isColorTheme(value.theme)
    ? value.theme
    : DEFAULT_SETTINGS.theme;

  return { viewMode, theme };
}

function parseSettingsUpdate(value: unknown): Partial<UserSettings> {
  if (typeof value !== "object" || value === null) return {};

  return {
    ...("viewMode" in value && isViewMode(value.viewMode) ? { viewMode: value.viewMode } : {}),
    ...("theme" in value && isColorTheme(value.theme) ? { theme: value.theme } : {}),
  };
}

function canUseSyncStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.sync !== undefined;
}

function usesLocalStorage() {
  return selectedBackend === "localStorage";
}

async function readSyncSettings() {
  if (!canUseSyncStorage()) throw new Error("Sync storage is unavailable");
  const stored: unknown = await chrome.storage.sync.get(["viewMode", "theme"]);
  return parseStoredSettings(stored);
}

function readLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    return parseStoredSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeLocalSettings(settings: UserSettings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The validated settings remain available to the current caller.
  }
}

function notifySubscribers(settings: UserSettings) {
  subscribers.forEach((callback) => callback(settings));
}

export async function getStoredSettings(): Promise<UserSettings> {
  if (selectedBackend === "localStorage") return readLocalSettings();

  if (canUseSyncStorage()) {
    try {
      const settings = await readSyncSettings();
      if (usesLocalStorage()) return readLocalSettings();
      selectedBackend = "sync";
      return settings;
    } catch {
      selectedBackend = "localStorage";
      return readLocalSettings();
    }
  }

  selectedBackend = "localStorage";
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
      selectedBackend = "localStorage";
    }
  }

  writeLocalSettings(next);
  notifySubscribers(next);
  return next;
}

export function saveStoredSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const pendingSave = saveQueue.then(
    () => saveSettings(partial),
    () => saveSettings(partial),
  );
  saveQueue = pendingSave;
  return pendingSave;
}

export function subscribeToSettings(callback: (settings: UserSettings) => void) {
  subscribers.add(callback);

  const syncListener = (_changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== "sync" || selectedBackend === "localStorage") return;
    void getStoredSettings().then(callback);
  };
  const localListener = (event: StorageEvent) => {
    if (event.key !== LOCAL_SETTINGS_KEY || selectedBackend === "sync") return;
    callback(readLocalSettings());
  };

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(syncListener);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("storage", localListener);
  }

  return () => {
    subscribers.delete(callback);
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(syncListener);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", localListener);
    }
  };
}
