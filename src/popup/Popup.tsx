import { useEffect, useRef, useState } from "react";
import { openShortcutSettings } from "../browser";
import { ArrowUpRightIcon, CommandIcon, GridIcon, ListIcon } from "../icons";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings } from "../settings";
import type { UserSettings, ViewMode } from "../types";
import { resolveSettingsRead } from "./settingsState";

const VIEW_OPTIONS = [
  { mode: "list", label: "List", Icon: ListIcon },
  { mode: "gallery", label: "Gallery", Icon: GridIcon },
] as const;

export function Popup() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const settingsRevision = useRef(0);
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const defaultSearchShortcut = isMac ? "⌘ ⇧ P" : "Ctrl Shift P";
  const defaultSwitcherShortcut = isMac ? "⌥ Q" : "Alt Q";
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version
    ? chrome.runtime.getManifest().version
    : "0.1.1";

  useEffect(() => {
    const readRevision = settingsRevision.current;
    void getStoredSettings().then((loaded) => {
      setSettings((current) => resolveSettingsRead(
        current,
        loaded,
        readRevision,
        settingsRevision.current,
      ));
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.commands?.getAll) return;
    void chrome.commands.getAll().then((commands) => {
      const currentShortcuts: Record<string, string> = {};
      commands.forEach((command) => {
        if (command.name && command.shortcut) currentShortcuts[command.name] = command.shortcut;
      });
      setShortcuts(currentShortcuts);
    });
  }, []);

  const updateViewMode = async (mode: ViewMode) => {
    const saveRevision = settingsRevision.current + 1;
    settingsRevision.current = saveRevision;
    setSettings((current) => ({ ...current, viewMode: mode }));
    const next = await saveStoredSettings({ viewMode: mode });
    if (settingsRevision.current === saveRevision) setSettings(next);
  };

  return (
    <main className="popup-container">
      <header className="popup-header">
        <div className="popup-brand">
          <span className="popup-mark" aria-hidden="true">
            <CommandIcon size={15} />
          </span>
          <div>
            <div className="popup-title-row">
              <h1 className="popup-title">Jump</h1>
              <span className="popup-version">v{version}</span>
            </div>
            <p className="popup-tagline">Move through tabs without breaking focus.</p>
          </div>
        </div>
      </header>

      <section className="popup-section" aria-labelledby="default-view-label">
        <div className="popup-section-heading">
          <span id="default-view-label">Default view</span>
          <span className="popup-section-context">Command palette</span>
        </div>

        <div className="popup-segmented" role="group" aria-label="Default command palette view">
          {VIEW_OPTIONS.map(({ mode, label, Icon }) => {
            const isActive = settings.viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`popup-segmented-item ${isActive ? "active" : ""}`}
                aria-pressed={isActive}
                onClick={() => void updateViewMode(mode)}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-shortcuts" aria-label="Keyboard shortcuts">
        <div className="popup-shortcut-row">
          <span>Search tabs</span>
          <span className="popup-key-group" aria-label={shortcuts["open-palette"] ?? defaultSearchShortcut}>
            <kbd>{shortcuts["open-palette"] ?? defaultSearchShortcut}</kbd>
          </span>
        </div>
        <div className="popup-shortcut-row">
          <span>Visual switcher</span>
          <span className="popup-key-group" aria-label={shortcuts["open-tab-switcher"] ?? defaultSwitcherShortcut}>
            <kbd>{shortcuts["open-tab-switcher"] ?? defaultSwitcherShortcut}</kbd>
          </span>
        </div>
      </section>

      <button
        type="button"
        className="popup-settings-link"
        onClick={() => {
          void openShortcutSettings();
          window.close();
        }}
      >
        <span>Customize shortcuts</span>
        <ArrowUpRightIcon size={12} />
      </button>
    </main>
  );
}
