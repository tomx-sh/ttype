import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { ESC, parseAnsi, serializeAnsi } from "./ansi";
import { getDocument, initialStyles, richHistory } from "./editor-state";
import {
  copyRichText,
  pasteRichText,
  RICH_CLIPBOARD_TYPE,
  readRichClipboard,
} from "./rich-clipboard";

class Clipboard {
  values = new Map<string, string>();
  getData(type: string) {
    return this.values.get(type) ?? "";
  }
  setData(type: string, value: string) {
    this.values.set(type, value);
  }
  clearData() {
    this.values.clear();
  }
}

function clipboardEvent(type: string, data: Clipboard) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: data });
  return event as ClipboardEvent;
}

function editor(source: string) {
  const document = parseAnsi(source);
  const view = {
    state: EditorState.create({
      doc: document.text,
      extensions: [
        history(),
        initialStyles(document),
        richHistory,
        EditorState.allowMultipleSelections.of(true),
      ],
    }),
    dispatch(spec: TransactionSpec | Transaction) {
      view.state = view.state.update(spec).state;
    },
  };
  return view;
}

function copy(view: ReturnType<typeof editor>, type = "copy") {
  const data = new Clipboard();
  assert.equal(copyRichText(clipboardEvent(type, data), view), true);
  return data;
}

test("normal copy/paste preserves mixed ANSI styles, Unicode, and undo/redo", () => {
  const source = editor(
    `${ESC}[1;38;2;12;123;234;48;2;45;67;89mA<&${ESC}[0;3;5;21m🙂\nB${ESC}[0m plain`,
  );
  source.dispatch({ selection: { anchor: 0, head: source.state.doc.length } });
  const original = getDocument(source.state);
  const data = copy(source);
  assert.equal(data.getData("text/plain"), original.text);
  assert.ok(data.getData("text/html").includes("&lt;&amp;"));
  assert.deepEqual(getDocument(source.state), original);

  const target = editor(`${ESC}[9;41mxREPLACEy`);
  target.dispatch({ selection: { anchor: 1, head: 8 } });
  const before = getDocument(target.state);
  assert.equal(pasteRichText(clipboardEvent("paste", data), target), true);
  const after = getDocument(target.state);
  assert.equal(after.text, `x${original.text}y`);
  assert.deepEqual(after.styles.slice(1, -1), original.styles);
  assert.deepEqual(after.styles[0], before.styles[0]);
  assert.deepEqual(after.styles.at(-1), before.styles.at(-1));
  assert.deepEqual(parseAnsi(serializeAnsi(after)), after);
  assert.equal(undo(target), true);
  assert.deepEqual(getDocument(target.state), before);
  assert.equal(redo(target), true);
  assert.deepEqual(getDocument(target.state), after);
});

test("cut carries formatting and undo restores the removed text and styles", () => {
  const source = editor(`a${ESC}[7;8;53;4;31mbc${ESC}[0md`);
  source.dispatch({ selection: { anchor: 1, head: 3 } });
  const before = getDocument(source.state);
  const data = copy(source, "cut");
  assert.equal(source.state.doc.toString(), "ad");
  const target = editor("");
  pasteRichText(clipboardEvent("paste", data), target);
  assert.deepEqual(getDocument(target.state), {
    text: "bc",
    styles: before.styles.slice(1, 3),
  });
  undo(source);
  assert.deepEqual(getDocument(source.state), before);
});

test("copy at a caret and linewise paste preserve complete styled lines", () => {
  const source = editor(`${ESC}[1;32mfirst${ESC}[0m\nsecond`);
  source.dispatch({ selection: { anchor: 2 } });
  const data = copy(source);
  const target = editor("before\nafter");
  target.dispatch({ selection: { anchor: 9 } });
  pasteRichText(clipboardEvent("paste", data), target);
  assert.equal(target.state.doc.toString(), "before\nfirst\nafter");
  assert.deepEqual(
    getDocument(target.state).styles.slice(7, 12),
    getDocument(source.state).styles.slice(0, 5),
  );
  assert.equal(target.state.selection.main.head, 15);
});

test("rectangular copies distribute styles across multiple paste ranges", () => {
  const source = editor(`${ESC}[1;31ma${ESC}[0mb${ESC}[3;34mc`);
  source.dispatch({
    selection: EditorSelection.create([
      EditorSelection.range(0, 1),
      EditorSelection.range(2, 3),
    ]),
  });
  const data = copy(source);
  const target = editor("XY");
  target.dispatch({
    selection: EditorSelection.create([
      EditorSelection.range(0, 1),
      EditorSelection.range(1, 2),
    ]),
  });
  pasteRichText(clipboardEvent("paste", data), target);
  assert.deepEqual(getDocument(target.state), {
    text: "ac",
    styles: [
      getDocument(source.state).styles[0],
      getDocument(source.state).styles[2],
    ],
  });
  undo(target);
  assert.equal(target.state.doc.toString(), "XY");
  const single = editor("");
  pasteRichText(clipboardEvent("paste", data), single);
  assert.deepEqual(getDocument(single.state), {
    text: "a\nc",
    styles: [
      getDocument(source.state).styles[0],
      {},
      getDocument(source.state).styles[2],
    ],
  });
});

test("HTML clipboard fallback retains styles when custom types are stripped", () => {
  const source = editor(`${ESC}[1;31mhello`);
  source.dispatch({ selection: { anchor: 0, head: 5 } });
  const data = copy(source);
  data.values.delete(RICH_CLIPBOARD_TYPE);
  const target = editor("");
  assert.equal(pasteRichText(clipboardEvent("paste", data), target), true);
  assert.deepEqual(getDocument(target.state), getDocument(source.state));
});

test("plain, unrelated HTML, malformed, and mismatched clipboard content fall back unchanged", () => {
  const target = editor("keep");
  const data = new Clipboard();
  data.setData("text/plain", "outside text");
  data.setData("text/html", "<b>outside text</b>");
  for (const payload of [
    "",
    "invalid JSON",
    JSON.stringify({ version: 1, linewise: false, fragments: [42] }),
    JSON.stringify({
      version: 1,
      linewise: false,
      fragments: [`${ESC}[999moutside text`],
    }),
    JSON.stringify({
      version: 1,
      linewise: false,
      fragments: ["different text"],
    }),
  ]) {
    data.setData(RICH_CLIPBOARD_TYPE, payload);
    const event = clipboardEvent("paste", data);
    assert.equal(readRichClipboard(data), null);
    assert.equal(pasteRichText(event, target), false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(target.state.doc.toString(), "keep");
  }
});

test("Source mode retains ordinary text clipboard behavior", () => {
  const data = new Clipboard();
  const source = {
    state: EditorState.create({ doc: "source" }),
    dispatch() {},
  };
  assert.equal(copyRichText(clipboardEvent("copy", data), source), false);
  assert.equal(pasteRichText(clipboardEvent("paste", data), source), false);
});
