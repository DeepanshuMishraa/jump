export type PreviewEntry = {
  tabId: number;
  url: string;
  dataUrl: string;
  capturedAt: number;
};

type OpenTab = {
  id: number;
  url?: string;
};

export function parsePreviewEntries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is PreviewEntry =>
    typeof entry === "object" &&
    entry !== null &&
    "tabId" in entry &&
    typeof entry.tabId === "number" &&
    "url" in entry &&
    typeof entry.url === "string" &&
    "dataUrl" in entry &&
    typeof entry.dataUrl === "string" &&
    "capturedAt" in entry &&
    typeof entry.capturedAt === "number"
  );
}

export function retainOpenTabPreviews(entries: Iterable<PreviewEntry>, tabs: Iterable<OpenTab>) {
  const openTabUrls = new Map([...tabs].map((tab) => [tab.id, tab.url]));
  return [...entries].filter((entry) => openTabUrls.get(entry.tabId) === entry.url);
}
