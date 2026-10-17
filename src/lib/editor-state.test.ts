import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { type EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { ESC, parseAnsi, serializeAnsi } from "./ansi";
import {
  copyStyle,
  formatSelection,
  getDocument,
  initialStyles,
  pasteStyle,
  replaceStyles,
  richHistory,
  richStyles,
  styleClipboardKeymap,
} from "./editor-state";

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
    dispatch: (spec: TransactionSpec | Transaction) => {
      view.state =
        spec instanceof Transaction
          ? spec.state
          : view.state.update(spec).state;
    },
    focus() {},
  };
  return view;
}

test("formatting applies only to selection; undo and redo restore the style", () => {
  const view = editor("hello world");
  view.dispatch({ selection: { anchor: 0, head: 5 } });
  formatSelection(view, { bold: true, foreground: "#123456" });
  assert.equal(view.state.field(richStyles).styles[4].bold, true);
  assert.deepEqual(view.state.field(richStyles).styles[5], {});
  undo(view);
  assert.deepEqual(view.state.field(richStyles).styles[0], {});
  redo(view);
  assert.equal(view.state.field(richStyles).styles[0].foreground, "#123456");
});

test("typing inherits attributes and grouped undo restores text and styles together", () => {
  const view = editor(`${ESC}[1mabc${ESC}[0m plain`);
  view.dispatch({ selection: { anchor: 3 } });
  view.dispatch({
    changes: { from: 3, insert: "X" },
    selection: { anchor: 4 },
    userEvent: "input.type",
  });
  view.dispatch({
    changes: { from: 4, insert: "Y" },
    selection: { anchor: 5 },
    userEvent: "input.type",
  });
  assert.equal(view.state.field(richStyles).styles[4].bold, true);
  undo(view);
  assert.equal(view.state.doc.toString(), "abc plain");
  assert.equal(view.state.field(richStyles).styles.length, 9);
  assert.deepEqual(view.state.field(richStyles).styles[3], {});
  redo(view);
  assert.equal(view.state.doc.toString(), "abcXY plain");
  assert.equal(view.state.field(richStyles).styles.length, 11);
  assert.deepEqual(
    parseAnsi(serializeAnsi(getDocument(view.state))),
    getDocument(view.state),
  );
});

test("collapsed formatting changes future typing and can be undone", () => {
  const view = editor("abc");
  view.dispatch({ selection: { anchor: 3 } });
  formatSelection(view, { italic: true });
  assert.deepEqual(view.state.field(richStyles).styles, [{}, {}, {}]);
  view.dispatch({
    changes: { from: 3, insert: "!" },
    selection: { anchor: 4 },
    userEvent: "input.type",
  });
  assert.equal(view.state.field(richStyles).styles[3].italic, true);
  undo(view);
  undo(view);
  assert.deepEqual(view.state.field(richStyles).typing, {});
  assert.equal(view.state.doc.toString(), "abc");
});

test("deletion and source replacement undo preserve original styled text", () => {
  const view = editor(`a${ESC}[4mbc${ESC}[0md`);
  const original = getDocument(view.state);
  view.dispatch({ changes: { from: 1, to: 3 } });
  assert.equal(view.state.doc.toString(), "ad");
  undo(view);
  assert.deepEqual(getDocument(view.state), original);
  const replacement = parseAnsi(`${ESC}[3mnew${ESC}[0m`);
  view.dispatch({
    changes: { from: 0, to: 4, insert: replacement.text },
    effects: replaceStyles.of({ styles: replacement.styles, typing: {} }),
    userEvent: "input.source",
  });
  undo(view);
  assert.deepEqual(getDocument(view.state), original);
  redo(view);
  assert.deepEqual(getDocument(view.state), replacement);
});

test("reset and mutually exclusive underline styles stay valid", () => {
  const view = editor("text");
  view.dispatch({ selection: { anchor: 0, head: 4 } });
  formatSelection(view, { underline: true });
  formatSelection(view, { doubleUnderline: true });
  assert.deepEqual(view.state.field(richStyles).styles[0], {
    doubleUnderline: true,
  });
  formatSelection(view, null);
  assert.deepEqual(view.state.field(richStyles).styles[0], {});
});

test("copy captures the first selected style and paste replaces formatting with undo/redo", () => {
  const view = editor(
    `${ESC}[1;38;2;12;123;234;48;2;45;67;89mab${ESC}[0;3;4mcdef`,
  );
  view.dispatch({ selection: { anchor: 2, head: 0 } });
  const copied = copyStyle(view.state);
  formatSelection(view, null);
  view.dispatch({ selection: { anchor: 2, head: 4 } });
  const before = getDocument(view.state);
  pasteStyle(view, copied);
  const after = getDocument(view.state);
  assert.equal(after.text, before.text);
  assert.deepEqual(after.styles.slice(0, 2), [{}, {}]);
  assert.deepEqual(after.styles[2], {
    bold: true,
    foreground: "#0c7bea",
    background: "#2d4359",
  });
  assert.deepEqual(after.styles[3], after.styles[2]);
  assert.deepEqual(after.styles.slice(4), before.styles.slice(4));
  assert.deepEqual(parseAnsi(serializeAnsi(after)), after);
  undo(view);
  assert.deepEqual(getDocument(view.state), before);
  redo(view);
  assert.deepEqual(getDocument(view.state), after);
});

test("copying and pasting a plain style clears all destination attributes", () => {
  const view = editor(`a${ESC}[1;3;21;5;7;8;9;53;31;41mbc`);
  const plain = copyStyle(view.state);
  view.dispatch({ selection: { anchor: 1, head: 3 } });
  const before = getDocument(view.state);
  pasteStyle(view, plain);
  assert.deepEqual(view.state.field(richStyles), {
    styles: [{}, {}, {}],
    typing: {},
  });
  undo(view);
  assert.deepEqual(getDocument(view.state), before);
});

test("copy at the caret and paste without a selection styles future typing and remains undoable", () => {
  const view = editor(`${ESC}[1ma${ESC}[0m plain`);
  view.dispatch({ selection: { anchor: 1 } });
  const copied = copyStyle(view.state);
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  const before = getDocument(view.state);
  pasteStyle(view, copied);
  assert.deepEqual(getDocument(view.state), before);
  view.dispatch({
    ...view.state.replaceSelection("!"),
    userEvent: "input.type",
  });
  assert.deepEqual(view.state.field(richStyles).styles.at(-1), { bold: true });
  undo(view);
  undo(view);
  assert.deepEqual(getDocument(view.state), before);
  assert.deepEqual(view.state.field(richStyles).typing, {});
});

test("style paste applies across rectangular selection ranges without changing gaps", () => {
  const view = editor(`${ESC}[1ma${ESC}[0mbcdef`);
  const copied = copyStyle(view.state);
  view.dispatch({
    selection: EditorSelection.create([
      EditorSelection.range(1, 2),
      EditorSelection.range(4, 5),
    ]),
  });
  const before = getDocument(view.state);
  pasteStyle(view, copied);
  assert.deepEqual(getDocument(view.state), {
    text: "abcdef",
    styles: [{ bold: true }, { bold: true }, {}, {}, { bold: true }, {}],
  });
  undo(view);
  assert.deepEqual(getDocument(view.state), before);
});

test("style shortcuts invoke their commands without intercepting ordinary copy and paste", () => {
  const invoked: string[] = [];
  const state = EditorState.create({
    extensions: [
      keymap.of(
        styleClipboardKeymap(
          () => {
            invoked.push("copy");
            return true;
          },
          () => {
            invoked.push("paste");
            return true;
          },
        ),
      ),
    ],
  });
  const view = { state } as EditorView;
  const mac = /Mac/.test(globalThis.navigator?.platform ?? "");
  for (const key of ["c", "v"]) {
    const event = {
      key,
      keyCode: key.toUpperCase().charCodeAt(0),
      ctrlKey: !mac,
      altKey: true,
      metaKey: mac,
      shiftKey: false,
    } as KeyboardEvent;
    assert.equal(runScopeHandlers(view, event, "editor"), true);
    assert.equal(
      runScopeHandlers(view, { ...event, altKey: false }, "editor"),
      false,
    );
  }
  assert.deepEqual(invoked, ["copy", "paste"]);
});

test("mixed edits and formatting survive a complete undo/redo cycle", () => {
  for (let seed = 1; seed <= 32; seed++) {
    let randomState = seed;
    const random = (max: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState % max;
    };
    const view = editor(`ab${ESC}[1mcde${ESC}[0mfg${ESC}[3mhij${ESC}[0m`);
    const original = getDocument(view.state);
    for (let i = 0; i < 30; i++) {
      const from = random(view.state.doc.length + 1);
      const to = from + random(view.state.doc.length - from + 1);
      view.dispatch({ selection: { anchor: from, head: to } });
      if (random(3) === 0)
        formatSelection(view, { underline: true, foreground: "#aabbcc" });
      else {
        const insert = random(2) ? "xy" : "";
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          userEvent: insert ? "input.type" : "delete.backward",
        });
      }
    }
    const final = getDocument(view.state);
    while (undo(view)) {
      /* Undo every grouped operation. */
    }
    assert.deepEqual(getDocument(view.state), original, `undo seed ${seed}`);
    while (redo(view)) {
      /* Restore every grouped operation. */
    }
    assert.deepEqual(getDocument(view.state), final, `redo seed ${seed}`);
  }
});
