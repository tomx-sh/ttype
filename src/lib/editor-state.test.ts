import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@codemirror/commands";
import {
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { ESC, parseAnsi, serializeAnsi } from "./ansi";
import {
  formatSelection,
  getDocument,
  initialStyles,
  replaceStyles,
  richHistory,
  richStyles,
} from "./editor-state";

function editor(source: string) {
  const document = parseAnsi(source);
  const view = {
    state: EditorState.create({
      doc: document.text,
      extensions: [history(), initialStyles(document), richHistory],
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
