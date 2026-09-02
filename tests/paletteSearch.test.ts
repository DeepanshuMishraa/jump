import assert from "node:assert/strict";
import test from "node:test";
import { browserUrlFor, buildSearchResults, parseBang, searchTabs } from "../src/paletteSearch.ts";
import type { PaletteTab, PinnedTab } from "../src/types.ts";

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
    index: id,
    active: false,
    windowFocused: false,
    pinned,
  });

  assert.deepEqual(
    searchTabs([tab(1, "Other", false), tab(2, "Match", true)], "match").map(({ id }) => id),
    [2],
  );
});

test("includes browser history even when an open tab matches", () => {
  const openTab: PaletteTab = {
    id: 1,
    windowId: 1,
    title: "Example",
    url: "https://example.com/",
    hostname: "example.com",
    index: 0,
    active: false,
    windowFocused: true,
    pinned: false,
  };
  const visited = { id: "2", title: "Example docs", url: "https://docs.example.com/" };

  assert.deepEqual(buildSearchResults([openTab], "example", [], [visited]), [
    { kind: "tab", tab: openTab },
    { kind: "search", query: "example" },
    { kind: "visited", item: visited },
  ]);
});

test("keeps closed pinned tabs in the palette", () => {
  const pinnedTab: PinnedTab = {
    tabId: 42,
    identity: "https://example.com/",
    url: "https://example.com/",
    title: "Example",
    hostname: "example.com",
  };

  assert.deepEqual(buildSearchResults([], "", [], [], [pinnedTab]), [
    { kind: "pinned", tab: pinnedTab },
  ]);
  assert.deepEqual(buildSearchResults([], "missing", [], [], [pinnedTab]), [
    { kind: "search", query: "missing" },
  ]);
});

test("keeps a saved pin separate when its original browser tab navigates away", () => {
  const videoTab: PaletteTab = {
    id: 42,
    windowId: 1,
    title: "A YouTube video",
    url: "https://www.youtube.com/watch?v=example",
    hostname: "youtube.com",
    index: 0,
    active: true,
    windowFocused: true,
    pinned: false,
  };
  const youtubePin: PinnedTab = {
    tabId: 42,
    identity: "https://www.youtube.com/",
    url: "https://www.youtube.com/",
    title: "YouTube",
    hostname: "youtube.com",
  };

  assert.deepEqual(buildSearchResults([videoTab], "", [], [], [youtubePin]), [
    { kind: "pinned", tab: youtubePin },
    { kind: "tab", tab: videoTab },
  ]);
});

test("recognizes real URLs without treating dotted words as hosts", () => {
  assert.equal(browserUrlFor("https://example.com/docs"), "https://example.com/docs");
  assert.equal(browserUrlFor("x.com"), "https://x.com");
  assert.equal(browserUrlFor("python3.12"), undefined);
  assert.deepEqual(buildSearchResults([], "python3.12"), [{ kind: "search", query: "python3.12" }]);
});
