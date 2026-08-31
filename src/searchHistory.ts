const STORAGE_KEY = "jump_search_history";
const MAX_HISTORY_ITEMS = 12;

export type SearchHistoryEntry = {
  query: string;
  usedAt: number;
};

function parseHistory(value: unknown): SearchHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SearchHistoryEntry =>
    typeof entry === "object" && entry !== null &&
    "query" in entry && typeof entry.query === "string" && entry.query.trim() !== "" &&
    "usedAt" in entry && typeof entry.usedAt === "number"
  );
}

export async function getSearchHistory(): Promise<SearchHistoryEntry[]> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return parseHistory(stored[STORAGE_KEY]).sort((a, b) => b.usedAt - a.usedAt);
  }

  try {
    return parseHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
      .sort((a, b) => b.usedAt - a.usedAt);
  } catch {
    return [];
  }
}

export async function recordSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const nextEntry = { query: trimmed, usedAt: Date.now() };
  const history = await getSearchHistory();
  const next = [nextEntry, ...history.filter((entry) => entry.query !== trimmed)].slice(0, MAX_HISTORY_ITEMS);

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
