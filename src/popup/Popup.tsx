import { useRef, useState } from "react";
import { openShortcutSettings } from "../browser";
import { CommandIcon, ArrowUpRightIcon, InfoIcon } from "../icons";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings, themeForScheme, themesForScheme, type ThemeInfo } from "../settings";
import type { ColorScheme, PaletteViewMode, TabSwitchMode, UserSettings } from "../types";
import { resolveSettingsRead } from "./settingsState";
import { useMountEffect } from "../hooks/useMountEffect";

type ThemeGroup = {
  theme: ThemeInfo;
  variants: ThemeInfo[];
};

function groupThemes(themes: ThemeInfo[]): ThemeGroup[] {
  const groups: ThemeGroup[] = [];
  for (const theme of themes) {
    const existing = groups.find((group) => group.theme.name === theme.name);
    if (existing) existing.variants.push(theme);
    else groups.push({ theme, variants: [] });
  }
  return groups;
}

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [shortcutsLoaded, setShortcutsLoaded] = useState(false);
  const settingsRevision = useRef(0);
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const defaultSearchShortcut = isMac ? "⌘⇧P" : "Ctrl Shift P";
  const defaultSwitcherShortcut = isMac ? "⌥Q" : "Alt Q";
  const defaultPinShortcut = isMac ? "⌘K" : "Alt K";
  const defaultBookmarksShortcut = isMac ? "⌥B" : "Alt B";
  const movePaletteShortcut = isMac ? "⌥ + drag" : "Alt + drag";
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version
    ? chrome.runtime.getManifest().version
    : "0.1.7";

  useMountEffect(() => {
    const readRevision = settingsRevision.current;
    void getStoredSettings().then((loaded) => {
      setSettings((current) => resolveSettingsRead(
        current,
        loaded,
        readRevision,
        settingsRevision.current,
      ));
    }).catch(() => {
      // Keep defaults when settings are temporarily unavailable.
    });
  });

  useMountEffect(() => {
    if (typeof chrome === "undefined" || !chrome.commands?.getAll) return;
    void chrome.commands.getAll().then((commands) => {
      const currentShortcuts: Record<string, string> = {};
      commands.forEach((command) => {
        if (command.name && command.shortcut) currentShortcuts[command.name] = command.shortcut;
      });
      setShortcuts(currentShortcuts);
      setShortcutsLoaded(true);
    }).catch(() => {
      // Commands API unavailable: keep manifest defaults and no warning,
      // since we cannot verify which keys are actually assigned.
    });
  });

  const shortcutRows = [
    { label: "Search tabs", command: "open-palette" as const, fallback: defaultSearchShortcut },
    { label: "Visual switcher", command: "open-tab-switcher" as const, fallback: defaultSwitcherShortcut },
    { label: "Pin selected tab", command: "pin-tab" as const, fallback: defaultPinShortcut },
    { label: "Bookmark manager", command: "open-bookmarks" as const, fallback: defaultBookmarksShortcut },
  ];
  const unsetCommands = shortcutRows.filter((row) => !shortcuts[row.command]);

  const openShortcutSettingsAndClose = async () => {
    try {
      await openShortcutSettings();
    } finally {
      window.close();
    }
  };

  const updateSettings = async (partial: Partial<UserSettings>) => {
    const saveRevision = settingsRevision.current + 1;
    settingsRevision.current = saveRevision;
    const previousSettings = settings;
    setSettings((current) => ({ ...current, ...partial }));
    try {
      const next = await saveStoredSettings(partial);
      if (settingsRevision.current === saveRevision) setSettings(next);
    } catch {
      if (settingsRevision.current === saveRevision) {
        try {
          setSettings(await getStoredSettings());
        } catch {
          setSettings(previousSettings);
        }
      }
    }
  };

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    await updateSettings({ [key]: value });
  };

  const visibleThemes = themesForScheme(settings.colorScheme);
  const themeGroups = groupThemes(visibleThemes);
  const chooseScheme = (scheme: ColorScheme) => {
    void updateSettings({
      colorScheme: scheme,
      theme: themeForScheme(settings.theme, scheme),
    });
  };

  return (
    <main className="popup-container" data-theme={settings.theme} data-scheme={settings.colorScheme}>
      <header className="popup-header">
        <div className="popup-brand">
          <span className="popup-mark" aria-hidden="true">
            <CommandIcon size={14} />
          </span>
          <div className="popup-brand-text">
            <div className="popup-title-row">
              <h1 className="popup-title">Jump</h1>
              <span className="popup-version-pill">v{version}</span>
            </div>
            <p className="popup-tagline">Fast tab search &amp; switcher</p>
          </div>
        </div>
      </header>

      <section className="popup-section" aria-labelledby="appearance-label">
        <div className="popup-section-heading">
          <span id="appearance-label">Appearance</span>
          <span className="popup-section-context">Light or dark</span>
        </div>
        <div className="popup-segmented" role="group" aria-label="Color scheme">
          {(["dark", "light"] as const satisfies readonly ColorScheme[]).map((scheme) => (
            <button
              key={scheme}
              type="button"
              className={`popup-segmented-item ${settings.colorScheme === scheme ? "active" : ""}`}
              aria-pressed={settings.colorScheme === scheme}
              onClick={() => chooseScheme(scheme)}
            >
              <span>{scheme === "dark" ? "Dark" : "Light"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="popup-section" aria-labelledby="theme-label">
        <div className="popup-section-heading">
          <span id="theme-label">Theme</span>
          <span className="popup-section-context">{settings.colorScheme === "light" ? "Light palettes" : "Dark palettes"}</span>
        </div>
        <label className="popup-theme-select-wrap">
          <span className="sr-only">Choose a theme</span>
          <select
            className="popup-theme-select"
            value={settings.theme}
            onChange={(event) => {
              const theme = visibleThemes.find((item) => item.id === event.target.value)?.id;
              if (theme) void updateSetting("theme", theme);
            }}
          >
            {themeGroups.map((group) => group.variants.length === 0 ? (
              <option key={group.theme.id} value={group.theme.id}>{group.theme.name} · {group.theme.badge}</option>
            ) : (
              <optgroup key={group.theme.name} label={group.theme.name}>
                {[group.theme, ...group.variants].map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.badge}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </section>

      <section className="popup-section" aria-labelledby="opacity-label">
        <div className="popup-section-heading">
          <span id="opacity-label">Opacity</span>
          <span className="popup-section-context">All overlays</span>
        </div>
        <label className="popup-range-row">
          <span className="sr-only">Overlay opacity</span>
          <input
            className="popup-range"
            type="range"
            min="0.4"
            max="1"
            step="0.05"
            value={settings.paletteOpacity}
            onChange={(event) => void updateSetting("paletteOpacity", Number(event.target.value))}
          />
          <output>{Math.round(settings.paletteOpacity * 100)}%</output>
        </label>
      </section>

      <section className="popup-section" aria-labelledby="palette-view-label">
        <div className="popup-section-heading">
          <span id="palette-view-label">Command palette</span>
          <span className="popup-section-context">Default view</span>
        </div>
        <div className="popup-segmented" role="group" aria-label="Command palette default view">
          {(["collapsed", "expanded"] as const satisfies readonly PaletteViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`popup-segmented-item ${settings.paletteViewMode === mode ? "active" : ""}`}
              aria-pressed={settings.paletteViewMode === mode}
              onClick={() => void updateSetting("paletteViewMode", mode)}
            >
              <span>{mode === "collapsed" ? "Collapsed" : "Expanded"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="popup-section" aria-labelledby="tab-switching-label">
        <div className="popup-section-heading">
          <span id="tab-switching-label">Tab switching</span>
          <span className="popup-section-context">Cycle order</span>
        </div>
        <div className="popup-segmented" role="group" aria-label="Tab switching order">
          {(["recent", "order"] as const satisfies readonly TabSwitchMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`popup-segmented-item ${settings.tabSwitchMode === mode ? "active" : ""}`}
              aria-pressed={settings.tabSwitchMode === mode}
              onClick={() => void updateSetting("tabSwitchMode", mode)}
            >
              <span>{mode === "recent" ? "Recent" : "Tab order"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="popup-section popup-mouse-settings" aria-labelledby="mouse-settings-label">
        <div className="popup-section-heading">
          <span id="mouse-settings-label">Keyboard-only navigation</span>
          <span className="popup-section-context">Disable mouse</span>
        </div>
        <label className="popup-toggle-row">
          <span>Tab switcher</span>
          <input
            type="checkbox"
            checked={settings.disableMouseTabSwitcher}
            onChange={(event) => void updateSetting("disableMouseTabSwitcher", event.target.checked)}
          />
        </label>
        <label className="popup-toggle-row">
          <span>Command palette</span>
          <input
            type="checkbox"
            checked={settings.disableMouseCommandPalette}
            onChange={(event) => void updateSetting("disableMouseCommandPalette", event.target.checked)}
          />
        </label>
        <label className="popup-toggle-row">
          <span>Bookmarks</span>
          <input
            type="checkbox"
            checked={settings.disableMouseBookmarks}
            onChange={(event) => void updateSetting("disableMouseBookmarks", event.target.checked)}
          />
        </label>
      </section>

      <section className="popup-shortcuts" aria-label="Keyboard shortcuts">
        {shortcutsLoaded && unsetCommands.length > 0 && (
          <p className="popup-shortcut-warning" role="alert">
            <InfoIcon size={14} />
            <span>
              {unsetCommands.length === 1
                ? "Shortcut not assigned: "
                : "Shortcuts not assigned: "}
              {unsetCommands.map((row) => row.label).join(", ")}.
            </span>
            <button type="button" onClick={() => void openShortcutSettingsAndClose()}>
              Fix it
            </button>
          </p>
        )}
        {shortcutRows.map((row) => (
          <div key={row.command} className="popup-shortcut-row">
            <span>{row.label}</span>
            <span className="popup-key-group">
              <kbd className={shortcutsLoaded && !shortcuts[row.command] ? "popup-key-unset" : undefined}>
                {shortcuts[row.command] ?? (shortcutsLoaded ? "Not set" : row.fallback)}
              </kbd>
            </span>
          </div>
        ))}
        <div className="popup-shortcut-row">
          <span>Move command palette</span>
          <span className="popup-key-group">
            <kbd>{movePaletteShortcut}</kbd>
          </span>
        </div>
      </section>

      <footer className="popup-footer-bar">
        <button
          type="button"
          className="popup-settings-link"
          onClick={() => void openShortcutSettingsAndClose()}
        >
          <span>Customize shortcuts</span>
          <ArrowUpRightIcon size={11} />
        </button>
      </footer>
    </main>
  );
}
