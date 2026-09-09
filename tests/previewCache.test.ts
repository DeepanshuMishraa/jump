import assert from "node:assert/strict";
import test from "node:test";
import { retainOpenTabPreviews, type PreviewEntry } from "../src/previewCache.ts";

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
