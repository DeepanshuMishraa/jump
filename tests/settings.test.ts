import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, parseStoredSettings } from "../src/settings.ts";
import { resolveSettingsRead } from "../src/popup/settingsState.ts";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
    },
  });
  return values;
}

function installChromeStorage(
  get: () => Promise<Record<string, unknown>>,
  set: (settings: Record<string, unknown>) => Promise<void>,
) {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        sync: { get, set },
        onChanged: {
          addListener() {},
          removeListener() {},
        },
      },
    },
  });
}

test("a pending popup read does not replace a newer user selection", () => {
  const userSelection = { ...DEFAULT_SETTINGS, viewMode: "gallery" as const };
  const resolved = resolveSettingsRead(
    userSelection,
    DEFAULT_SETTINGS,
    0,
    1,
  );

  assert.equal(resolved.viewMode, "gallery");
});

test("persisted settings validate fields independently", () => {
  assert.deepEqual(
    parseStoredSettings({ viewMode: "unsupported", theme: "nord", extra: "ignored" }),
    { viewMode: "list", theme: "nord" },
  );
  assert.deepEqual(
    parseStoredSettings({ viewMode: { value: "gallery" }, theme: "unknown" }),
    DEFAULT_SETTINGS,
  );
});

test("overlapping saves preserve both partial updates", async () => {
  installLocalStorage();
  let stored: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  let activeWrites = 0;
  let maximumActiveWrites = 0;

  installChromeStorage(
    async () => ({ ...stored }),
    async (settings) => {
      activeWrites += 1;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 10));
      stored = { ...stored, ...settings };
      activeWrites -= 1;
    },
  );

  const settings = await import(`../src/settings.ts?concurrent=${Date.now()}`);
  await Promise.all([
    settings.saveStoredSettings({ viewMode: "gallery" }),
    settings.saveStoredSettings({ theme: "nord" }),
  ]);

  assert.deepEqual(stored, { viewMode: "gallery", theme: "nord" });
  assert.equal(maximumActiveWrites, 1);
});

test("a failed sync write selects localStorage for later reads", async () => {
  const localValues = installLocalStorage();
  let syncReads = 0;

  installChromeStorage(
    async () => {
      syncReads += 1;
      return { ...DEFAULT_SETTINGS };
    },
    async () => {
      throw new Error("sync unavailable");
    },
  );

  const settings = await import(`../src/settings.ts?fallback=${Date.now()}`);
  await settings.saveStoredSettings({ viewMode: "gallery" });
  const loaded = await settings.getStoredSettings();

  assert.equal(loaded.viewMode, "gallery");
  assert.equal(syncReads, 1);
  assert.equal(
    JSON.parse(localValues.get("jump_settings") ?? "null").viewMode,
    "gallery",
  );
});
