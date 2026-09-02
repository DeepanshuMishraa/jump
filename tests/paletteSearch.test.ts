import assert from "node:assert/strict";
import test from "node:test";
import { browserUrlFor, buildSearchResults, parseBang, searchTabs } from "../src/paletteSearch.ts";
import type { PaletteTab } from "../src/types.ts";

test("parses supported bang searches", () => {
  assert.deepEqual(parseBang("!gh react hooks"), {
    bang: "gh",
    label: "GitHub",
    query: "react hooks",
    url: "https://github.com/search?q=react%20hooks",
  });
});

test("keeps unknown bangs as regular web searches", () => {
  const results = buildSearchResults([], "!unknown query");
  assert.deepEqual(results, [{ kind: "search", query: "!unknown query" }]);
  assert.deepEqual(buildSearchResults([], "!constructor query"), [{ kind: "search", query: "!constructor query" }]);
});

test("keeps pinned tabs above unpinned matches", () => {
  const tab = (id: number, title: string, pinned: boolean): PaletteTab => ({
    id,
    windowId: 1,
    title,
    url: `https://${title.toLowerCase()}.com`,
    hostname: `${title.toLowerCase()}.com`,
    active: false,
    windowFocused: false,
    pinned,
  });

  assert.deepEqual(
    searchTabs([tab(1, "Other", false), tab(2, "Match", true)], "match").map(({ id }) => id),
    [2],
  );
});

test("recognizes real URLs without treating dotted words as hosts", () => {
  assert.equal(browserUrlFor("https://example.com/docs"), "https://example.com/docs");
  assert.equal(browserUrlFor("x.com"), "https://x.com");
  assert.equal(browserUrlFor("python3.12"), undefined);
  assert.deepEqual(buildSearchResults([], "python3.12"), [{ kind: "search", query: "python3.12" }]);
});
