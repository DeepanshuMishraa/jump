import type { PaletteTab } from "./types";

export type SearchResult =
  | { kind: "tab"; tab: PaletteTab }
  | { kind: "url"; url: string }
  | { kind: "search"; query: string };

export function browserUrlFor(input: string) {
  const value = input.trim();
  if (!value) return undefined;
  if (/^(https?:\/\/|ftp:\/\/|file:\/\/)/i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?([/?#].*)?$/i.test(value) || /^[^\s/]+\.[^\s/]+(?:[/?#].*)?$/.test(value)) {
    return `https://${value}`;
  }
  return undefined;
}

export function scoreTab(tab: PaletteTab, query: string) {
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
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const searchable = `${title} ${hostname} ${url}`;
  if (tokens.length > 1 && tokens.every((token) => searchable.includes(token))) return 200;
  return -1;
}

export function searchTabs(tabs: PaletteTab[], query: string) {
  const trimmed = query.trim();
  return tabs
    .map((tab, index) => ({ tab, score: scoreTab(tab, trimmed), index }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ tab }) => tab);
}

export function buildSearchResults(tabs: PaletteTab[], query: string): SearchResult[] {
  const trimmed = query.trim();
  const tabResults = searchTabs(tabs, trimmed).map((tab) => ({ kind: "tab" as const, tab }));
  if (!trimmed) return tabResults;

  const url = browserUrlFor(trimmed);
  const actions: SearchResult[] = url
    ? [{ kind: "url", url }, { kind: "search", query: trimmed }]
    : [{ kind: "search", query: trimmed }];
  return [...tabResults, ...actions];
}
