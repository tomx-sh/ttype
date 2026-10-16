import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

type FontGlyph = {
  id: number;
  advanceWidth: number;
  bbox: { minY: number; maxY: number };
};
type TerminalFont = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  getVariation: (axes: { wght: number }) => TerminalFont;
  glyphForCodePoint: (code: number) => FontGlyph;
};

// Use Next's existing font parser to validate the shipped assets, without a
// browser or a new runtime dependency.
const require = createRequire(import.meta.url);
const parseFont = require("next/dist/compiled/@next/font/dist/fontkit")
  .default as (buffer: Buffer) => TerminalFont;

for (const file of [
  "JetBrainsMono-Variable.ttf",
  "JetBrainsMono-Italic-Variable.ttf",
]) {
  test(`${file} includes real box-drawing and block glyphs at regular and bold weights`, () => {
    const font = parseFont(
      readFileSync(new URL(`../app/fonts/${file}`, import.meta.url)),
    );
    for (const weight of [400, 800]) {
      const variant = font.getVariation({ wght: weight });
      const advance = variant.glyphForCodePoint(0x4d).advanceWidth;
      for (let code = 0x2500; code <= 0x259f; code++) {
        const glyph = variant.glyphForCodePoint(code);
        assert.notEqual(
          glyph.id,
          0,
          `missing U+${code.toString(16)} at weight ${weight}`,
        );
        assert.equal(
          glyph.advanceWidth,
          advance,
          `wrong cell width for U+${code.toString(16)}`,
        );
      }
      const block = variant.glyphForCodePoint(0x2588).bbox;
      const vertical = variant.glyphForCodePoint(0x2502).bbox;
      assert.equal(block.maxY, font.ascent);
      assert.equal(block.minY, font.descent);
      assert.equal((block.maxY - block.minY) / font.unitsPerEm, 1.32);
      assert.ok(
        vertical.maxY >= block.maxY && vertical.minY <= block.minY,
        "vertical strokes must reach adjacent cells",
      );
    }
  });
}
