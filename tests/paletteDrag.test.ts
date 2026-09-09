import assert from "node:assert/strict";
import test from "node:test";
import { canStartPaletteDrag } from "../src/paletteDrag.ts";

test("starts palette dragging only for Alt plus primary pointer", () => {
  assert.equal(canStartPaletteDrag({ altKey: true, button: 0 }), true);
  assert.equal(canStartPaletteDrag({ altKey: false, button: 0 }), false);
  assert.equal(canStartPaletteDrag({ altKey: true, button: 1 }), false);
});
