import assert from "node:assert/strict";
import test from "node:test";
import { parsePreviewEntries, retainOpenTabPreviews, stalePreviewTabIds, type PreviewEntry } from "../src/previewCache.ts";

test("rejects preview entries without data URLs", () => {
  assert.deepEqual(parsePreviewEntries([
    { tabId: 1, url: "https://example.com", dataUrl: "broken", capturedAt: 1 },
    { tabId: 2, url: "https://example.com", dataUrl: "data:image/webp;base64,valid", capturedAt: 2 },
  ]), [{ tabId: 2, url: "https://example.com", dataUrl: "data:image/webp;base64,valid", capturedAt: 2 }]);
});

test("retains a preview for every open tab without a fixed cache limit", () => {
  const previews: PreviewEntry[] = Array.from({ length: 100 }, (_, index) => ({
    tabId: index + 1,
    url: `https://example.com/${index + 1}`,
    dataUrl: `data:image/jpeg;base64,preview-${index + 1}`,
    capturedAt: index,
  }));
  const tabs = previews.map(({ tabId: id, url }) => ({ id, url }));

  assert.equal(retainOpenTabPreviews(previews, tabs).length, tabs.length);
});

test("identifies preview entries invalidated by navigation or tab closure", () => {
  assert.deepEqual(
    stalePreviewTabIds(
      [{ id: 1, url: "https://old.example" }, { id: 2, url: "https://closed.example" }],
      [{ id: 1, url: "https://new.example" }, { id: 3, url: "https://added.example" }],
    ),
    [1, 2],
  );
});

test("removes previews for closed or navigated tabs", () => {
  const previews: PreviewEntry[] = [
    { tabId: 1, url: "https://old.example", dataUrl: "old", capturedAt: 1 },
    { tabId: 2, url: "https://closed.example", dataUrl: "closed", capturedAt: 2 },
    { tabId: 3, url: "https://current.example", dataUrl: "current", capturedAt: 3 },
  ];

  assert.deepEqual(
    retainOpenTabPreviews(previews, [
      { id: 1, url: "https://new.example" },
      { id: 3, url: "https://current.example" },
    ]),
    [previews[2]],
  );
});
