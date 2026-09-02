import type { PaletteTab, PinnedTab } from "./types";
import type { BrowserHistoryItem } from "./browser";
import type { SearchHistoryEntry } from "./searchHistory";

export type SearchResult =
  | { kind: "tab"; tab: PaletteTab }
  | { kind: "pinned"; tab: PinnedTab }
  | { kind: "search"; query: string }
  | { kind: "url"; url: string }
  | { kind: "bang"; bang: string; label: string; query: string; url: string }
  | { kind: "history"; query: string; usedAt: number }
  | { kind: "visited"; item: BrowserHistoryItem };

const BANGS: Record<string, { label: string; buildUrl: (query: string) => string }> = {
  g: { label: "Google", buildUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}` },
  gh: { label: "GitHub", buildUrl: (query) => `https://github.com/search?q=${encodeURIComponent(query)}` },
  yt: { label: "YouTube", buildUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` },
  b: { label: "Bing", buildUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
  ddg: { label: "DuckDuckGo", buildUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}` },
  so: { label: "Stack Overflow", buildUrl: (query) => `https://stackoverflow.com/search?q=${encodeURIComponent(query)}` },
  npm: { label: "npm", buildUrl: (query) => `https://www.npmjs.com/search?q=${encodeURIComponent(query)}` },
  mdn: { label: "MDN", buildUrl: (query) => `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)}` },
};

export function browserUrlFor(input: string) {
  const value = input.trim();
  if (!value) return undefined;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.hostname ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#].*)?$/i.test(value)) return `http://${value}`;
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return undefined;
}

export function parseBang(input: string) {
  const match = input.trim().match(/^!(\S+)\s+(.+)$/);
  if (!match) return undefined;
  const [, bang, query] = match;
  const key = bang.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BANGS, key) || !query.trim()) return undefined;
  const provider = BANGS[key];
  return { bang: bang.toLowerCase(), label: provider.label, query: query.trim(), url: provider.buildUrl(query.trim()) };
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
    .sort((a, b) => (a.tab.pinned === b.tab.pinned ? b.score - a.score || a.index - b.index : a.tab.pinned ? -1 : 1))
    .map(({ tab }) => tab);
}

function searchActionFor(query: string): Exclude<SearchResult, { kind: "tab" | "pinned" | "history" }> {
  const bang = parseBang(query);
  if (bang) return { kind: "bang", bang: bang.bang, label: bang.label, query: bang.query, url: bang.url };
  const url = browserUrlFor(query);
  if (url) return { kind: "url", url };
  return { kind: "search", query };
}

export function buildSearchResults(
  tabs: PaletteTab[],
  query: string,
  history: SearchHistoryEntry[] = [],
  browserHistory: BrowserHistoryItem[] = [],
  closedPinnedTabs: PinnedTab[] = [],
): SearchResult[] {
  const trimmed = query.trim();
  const normalized = trimmed.toLowerCase();
  const pinnedResults = closedPinnedTabs
    .filter((tab) => !normalized || `${tab.title} ${tab.hostname} ${tab.url}`.toLowerCase().includes(normalized))
    .map((tab) => ({ kind: "pinned" as const, tab }));
  const tabResults = searchTabs(tabs, trimmed).map((tab) => ({ kind: "tab" as const, tab }));
  if (!trimmed) return [...pinnedResults, ...tabResults];

  const action = searchActionFor(trimmed);
  const openUrls = new Set([
    ...tabs.map((tab) => tab.url),
    ...closedPinnedTabs.map((tab) => tab.url),
  ]);
  const matchingHistory = history
    .filter((entry) => entry.query.toLowerCase().includes(trimmed.toLowerCase()))
    .map((entry) => ({ kind: "history" as const, query: entry.query, usedAt: entry.usedAt }));
  const visitedResults = browserHistory
    .filter((item) => !openUrls.has(item.url))
    .slice(0, 5)
    .map((item) => ({ kind: "visited" as const, item }));
  return [...pinnedResults, ...tabResults, action, ...[...visitedResults, ...matchingHistory].slice(0, 5)];
}
