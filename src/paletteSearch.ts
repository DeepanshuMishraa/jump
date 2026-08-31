import type { PaletteTab } from "./types";

export type SearchResult =
  | { kind: "tab"; tab: PaletteTab }
  | { kind: "search"; query: string }
  | { kind: "bang"; bang: string; label: string; query: string; url: string };

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

export function parseBang(input: string) {
  const match = input.trim().match(/^!(\S+)\s+(.+)$/);
  if (!match) return undefined;
  const [, bang, query] = match;
  const provider = BANGS[bang.toLowerCase()];
  if (!provider || !query.trim()) return undefined;
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
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ tab }) => tab);
}

export function buildSearchResults(tabs: PaletteTab[], query: string): SearchResult[] {
  const trimmed = query.trim();
  const tabResults = searchTabs(tabs, trimmed).map((tab) => ({ kind: "tab" as const, tab }));
  if (!trimmed) return tabResults;

  const bang = parseBang(trimmed);
  if (bang) return [...tabResults, { kind: "bang", bang: bang.bang, label: bang.label, query: bang.query, url: bang.url }];
  return [...tabResults, { kind: "search", query: trimmed }];
}
