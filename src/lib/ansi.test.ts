import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";
import {
  ESC,
  PALETTE,
  parseAnsi,
  rawSource,
  readableSource,
  serializeAnsi,
  WELCOME,
} from "./ansi";

const sgr = (codes: string) => `${ESC}[${codes}m`;

test("rich text round-trips through real ANSI, including emoji and multiline styles", () => {
  const input = `${sgr("1;3;4;9;53;38;2;12;123;234;48;2;1;2;3")}Hello 🌍\nworld${sgr("0")} plain`;
  const document = parseAnsi(input);
  assert.equal(document.text, "Hello 🌍\nworld plain");
  assert.equal(document.styles.length, document.text.length);
  assert.deepEqual(parseAnsi(serializeAnsi(document)), document);
  assert.deepEqual(
    parseAnsi(serializeAnsi(parseAnsi(WELCOME))),
    parseAnsi(WELCOME),
  );
});

test("parses basic, bright, 256-color cube and grayscale colors", () => {
  const document = parseAnsi(
    `${sgr("31;104")}a${sgr("38;5;196;48;5;244")}b${sgr("38;5;15")}c`,
  );
  assert.deepEqual(document.styles[0], {
    foreground: PALETTE[1],
    background: PALETTE[12],
  });
  assert.deepEqual(document.styles[1], {
    foreground: "#ff0000",
    background: "#808080",
  });
  assert.equal(document.styles[2].foreground, PALETTE[15]);
});

test("selective resets clear only their own attributes", () => {
  const document = parseAnsi(
    `${sgr("1;2;3;21;5;7;8;9;53;31;41")}a${sgr("22;23;24;25;27;28;29;55;39;49")}b`,
  );
  assert.equal(document.styles[0].doubleUnderline, true);
  assert.deepEqual(document.styles[1], {});
  assert.deepEqual(parseAnsi(`${sgr("")}x`).styles, [{}]);
});

test("source notation preserves literal backslashes and real escape characters", () => {
  const raw = `literal \\x1b[31m \\ path \\n ${sgr("31")}red${sgr("0")}\n\t`;
  assert.equal(rawSource(readableSource(raw)), raw);
  assert.equal(rawSource("\\x1b[1m"), sgr("1"));
});

test("unsupported controls and malformed colors cannot silently disappear in visual mode", () => {
  for (const source of [
    sgr("38;2;12"),
    sgr("38;5;256"),
    sgr("48;2;1;2;999"),
    sgr("999"),
    `${ESC}[2J`,
    `${ESC}]8;;https://example.com\x07link`,
    "line\rreturn",
  ]) {
    assert.throws(() => parseAnsi(source));
    assert.equal(rawSource(readableSource(source)), source);
  }
});

test("export resets formatting so it cannot leak into the terminal prompt", () => {
  const document = parseAnsi(`${sgr("1")}bold`);
  assert.ok(serializeAnsi(document).endsWith(sgr("0")));
  assert.equal(
    serializeAnsi({ text: "plain", styles: Array(5).fill({}) }),
    "plain",
  );
});

test("source editing preserves controls that an editor would otherwise normalize", () => {
  const raw = `line\rreturn\x00\x7f\x85${ESC}]title\x07\n`;
  const state = EditorState.create({ doc: readableSource(raw) });
  assert.equal(rawSource(state.doc.toString()), raw);
});
