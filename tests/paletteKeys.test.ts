import assert from "node:assert/strict";
import test from "node:test";
import { emacsNavigationKey } from "../src/paletteKeys.ts";

const base = { ctrlKey: true, metaKey: false, shiftKey: false };

test("ctrl+n and ctrl+p map to down and up", () => {
  assert.equal(emacsNavigationKey({ ...base, key: "n", code: "KeyN" }), "ArrowDown");
  assert.equal(emacsNavigationKey({ ...base, key: "p", code: "KeyP" }), "ArrowUp");
});

test("matches by physical key when Alt changes the produced character", () => {
  assert.equal(emacsNavigationKey({ ...base, key: "˜", code: "KeyN" }), "ArrowDown");
});

test("ignores other modifier combinations", () => {
  assert.equal(emacsNavigationKey({ ...base, ctrlKey: false, key: "n" }), null);
  assert.equal(emacsNavigationKey({ ...base, metaKey: true, key: "n" }), null);
  assert.equal(emacsNavigationKey({ ...base, shiftKey: true, key: "P" }), null);
  assert.equal(emacsNavigationKey({ ...base, key: "j" }), null);
});
