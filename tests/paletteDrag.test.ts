import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartPaletteDrag,
  dragPreviewCellForPoint,
  isAltModifierActive,
  nextFreeDragPosition,
  snapPalettePosition,
} from "../src/paletteDrag.ts";

test("starts palette dragging only for Alt plus primary pointer", () => {
  assert.equal(canStartPaletteDrag({ altKey: true, button: 0, mouseDisabled: false }), true);
  assert.equal(canStartPaletteDrag({ altKey: false, button: 0, mouseDisabled: false }), false);
  assert.equal(canStartPaletteDrag({ altKey: true, button: 1, mouseDisabled: false }), false);
  assert.equal(canStartPaletteDrag({ altKey: true, button: 0, mouseDisabled: true }), false);
});

test("alt modifier is detected from key, flag, or modifier state", () => {
  assert.equal(isAltModifierActive({ key: "Alt", altKey: false }), true);
  assert.equal(isAltModifierActive({ key: "m", altKey: true }), true);
  assert.equal(
    isAltModifierActive({ key: "Unidentified", altKey: false, getModifierState: () => true }),
    true,
  );
  assert.equal(isAltModifierActive({ key: "a", altKey: false }), false);
  assert.equal(
    isAltModifierActive({ key: "a", altKey: false, getModifierState: () => false }),
    false,
  );
});

test("free drag position follows the pointer delta and clamps to the viewport", () => {
  assert.deepEqual(
    nextFreeDragPosition({
      startX: 100,
      startY: 100,
      startPosition: { x: 0.5, y: 0.28 },
      clientX: 200,
      clientY: 150,
      viewportWidth: 1000,
      viewportHeight: 800,
    }),
    { x: 0.6, y: 0.3425 },
  );
  assert.deepEqual(
    nextFreeDragPosition({
      startX: 100,
      startY: 100,
      startPosition: { x: 0.5, y: 0.28 },
      clientX: -2000,
      clientY: 5000,
      viewportWidth: 1000,
      viewportHeight: 800,
    }),
    { x: 0, y: 1 },
  );
});

test("snap position centers the release cell and keeps the card on screen", () => {
  const centered = snapPalettePosition({
    column: 1,
    row: 1,
    viewportWidth: 1200,
    viewportHeight: 800,
    cardWidth: 640,
    cardHeight: 54,
  });
  assert.ok(Math.abs(centered.x - 0.5) < 1e-9);
  assert.ok(Math.abs(centered.y - (0.5 - 54 / 1600)) < 1e-9);

  const corner = snapPalettePosition({
    column: 0,
    row: 0,
    viewportWidth: 1200,
    viewportHeight: 800,
    cardWidth: 640,
    cardHeight: 54,
  });
  assert.ok(corner.x >= 640 / 2400);
  assert.ok(corner.y >= 0);
});

test("preview cell maps pointer points to the 3x3 grid", () => {
  assert.deepEqual(
    dragPreviewCellForPoint({ clientX: 10, clientY: 10, viewportWidth: 900, viewportHeight: 900 }),
    { column: 0, row: 0 },
  );
  assert.deepEqual(
    dragPreviewCellForPoint({ clientX: 450, clientY: 450, viewportWidth: 900, viewportHeight: 900 }),
    { column: 1, row: 1 },
  );
  assert.deepEqual(
    dragPreviewCellForPoint({ clientX: 899, clientY: 899, viewportWidth: 900, viewportHeight: 900 }),
    { column: 2, row: 2 },
  );
});
