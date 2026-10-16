import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@codemirror/commands";
import {
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { ESC, parseAnsi, serializeAnsi } from "./ansi";
import { cursorAtCell } from "./cell-placement";
import { getDocument, initialStyles, richHistory } from "./editor-state";

function editor(source: string) {
  const document = parseAnsi(source);
  const view = {
    state: EditorState.create({
      doc: document.text,
      extensions: [
        EditorState.tabSize.of(4),
        history(),
        initialStyles(document),
        richHistory,
      ],
    }),
    dispatch(spec: TransactionSpec | Transaction) {
      view.state =
        spec instanceof Transaction
          ? spec.state
          : view.state.update(spec).state;
    },
  };
  return view;
}

test("placement pads only the chosen line and typing starts in the chosen cell", () => {
  const view = editor("ab\nnext");
  view.dispatch(cursorAtCell(view.state, 0, 6));
  view.dispatch(view.state.replaceSelection("│"));
  assert.equal(view.state.doc.toString(), "ab    │\nnext");
});

test("placement below the document adds empty lines and destination spaces", () => {
  const view = editor("abc");
  view.dispatch(cursorAtCell(view.state, 3, 4));
  view.dispatch(view.state.replaceSelection("┌"));
  assert.equal(view.state.doc.toString(), "abc\n\n\n    ┌");
  const empty = editor("");
  empty.dispatch(cursorAtCell(empty.state, 0, 3));
  assert.equal(empty.state.doc.toString(), "   ");
  assert.equal(empty.state.selection.main.head, 3);
});

test("placement within existing text only moves the cursor without deleting a selection", () => {
  const view = editor("abcd\nefgh");
  view.dispatch({ selection: { anchor: 0, head: 7 } });
  view.dispatch(cursorAtCell(view.state, 1, 2));
  assert.equal(view.state.doc.toString(), "abcd\nefgh");
  assert.equal(view.state.selection.main.head, 7);
  assert.equal(view.state.selection.main.empty, true);
  view.dispatch(cursorAtCell(view.state, 0, 0));
  assert.equal(view.state.selection.main.head, 0);
});

test("placement counts tab stops and keeps Unicode graphemes intact", () => {
  const view = editor("a\tb\ne\u0301🙂│");
  view.dispatch(cursorAtCell(view.state, 0, 7));
  assert.equal(view.state.doc.line(1).text, "a\tb  ");
  view.dispatch(cursorAtCell(view.state, 1, 2));
  assert.equal(view.state.selection.main.head, view.state.doc.line(2).from + 4);
  view.dispatch(cursorAtCell(view.state, 1, 5));
  assert.equal(view.state.doc.line(2).text, "e\u0301🙂│  ");
});

test("padding is one undo step and preserves ANSI styles through redo and export", () => {
  const view = editor(`${ESC}[1;31mab${ESC}[0m\nplain`);
  const original = getDocument(view.state);
  view.dispatch(cursorAtCell(view.state, 3, 5));
  const padded = getDocument(view.state);
  view.dispatch({
    ...view.state.replaceSelection("─"),
    userEvent: "input.type",
  });
  const final = getDocument(view.state);
  assert.deepEqual(
    final.styles.slice(0, original.styles.length),
    original.styles,
  );
  assert.equal(undo(view), true);
  assert.deepEqual(getDocument(view.state), padded);
  assert.equal(undo(view), true);
  assert.deepEqual(getDocument(view.state), original);
  assert.equal(redo(view), true);
  assert.equal(redo(view), true);
  assert.deepEqual(getDocument(view.state), final);
  assert.deepEqual(parseAnsi(serializeAnsi(final)), final);
});
