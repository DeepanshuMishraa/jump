import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchResults, parseBang } from "../src/paletteSearch.ts";

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
});
