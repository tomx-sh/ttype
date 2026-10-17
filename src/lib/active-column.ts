import { countColumn } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export const highlightActiveColumn = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.sync(view);
    }

    sync(view: EditorView) {
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      const column = countColumn(
        line.text.slice(0, head - line.from),
        view.state.tabSize,
      );
      view.contentDOM.style.setProperty("--active-column", String(column));
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) this.sync(update.view);
    }
  },
);
