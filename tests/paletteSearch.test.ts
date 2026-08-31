import assert from "node:assert/strict";
import test from "node:test";
import { browserUrlFor, buildSearchResults, parseBang } from "../src/paletteSearch.ts";

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

test("recognizes real URLs without treating dotted words as hosts", () => {
  assert.equal(browserUrlFor("https://example.com/docs"), "https://example.com/docs");
  assert.equal(browserUrlFor("x.com"), "https://x.com");
  assert.equal(browserUrlFor("python3.12"), undefined);
  assert.deepEqual(buildSearchResults([], "python3.12"), [{ kind: "search", query: "python3.12" }]);
});
