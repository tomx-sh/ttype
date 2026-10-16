import { isolateHistory } from "@codemirror/commands";
import {
  countColumn,
  type EditorState,
  findColumn,
  type TransactionSpec,
} from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

// Rows and columns are zero-based. Only the destination line needs padding;
// intermediate empty lines remain empty.
export function cursorAtCell(
  state: EditorState,
  row: number,
  column: number,
): TransactionSpec {
  let from: number;
  let padding: string;
  if (row >= state.doc.lines) {
    from = state.doc.length;
    padding = "\n".repeat(row - state.doc.lines + 1) + " ".repeat(column);
  } else {
    const line = state.doc.line(row + 1);
    const width = countColumn(line.text, state.tabSize);
    if (column <= width) {
      return {
        selection: {
          anchor: line.from + findColumn(line.text, column, state.tabSize),
        },
        scrollIntoView: true,
      };
    }
    from = line.to;
    padding = " ".repeat(column - width);
  }
  return {
    changes: { from, insert: padding },
    selection: { anchor: from + padding.length },
    annotations: isolateHistory.of("full"),
    userEvent: "input.place",
    scrollIntoView: true,
  };
}

export function placeCursorAtClick(
  view: EditorView,
  event: MouseEvent,
): boolean {
  if (
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return false;
  const cell = cellAtPointer(view, event);
  if (!cell) return false;
  view.dispatch(cursorAtCell(view.state, cell.row, cell.column));
  view.focus();
  return true;
}

function cellAtPointer(
  view: EditorView,
  point: { clientX: number; clientY: number },
) {
  const line = view.contentDOM.querySelector<HTMLElement>(".cm-line");
  if (!line) return null;
  const bounds = view.contentDOM.getBoundingClientRect();
  const left =
    bounds.left +
    Number.parseFloat(getComputedStyle(line).paddingLeft) * view.scaleX;
  const x = point.clientX - left;
  const y = point.clientY - view.documentTop;
  if (
    x < 0 ||
    y < 0 ||
    point.clientX >= bounds.right ||
    point.clientY >= bounds.bottom
  )
    return null;
  // documentTop and the content rect follow both scroll axes. Use the same
  // measured dimensions as the grid rather than rounding the CSS cell size.
  const row = Math.floor(y / (view.defaultLineHeight * view.scaleY));
  const column = Math.floor(x / (view.defaultCharacterWidth * view.scaleX));
  return { row, column };
}

export function placementCellHover(isEnabled: () => boolean) {
  return ViewPlugin.fromClass(
    class {
      pointer: { clientX: number; clientY: number } | null = null;

      constructor(readonly view: EditorView) {}

      measure() {
        if (!this.pointer) return;
        this.view.requestMeasure({
          key: this,
          read: (view) =>
            isEnabled() && this.pointer
              ? cellAtPointer(view, this.pointer)
              : null,
          write: (cell, view) => {
            if (!cell) {
              view.contentDOM.removeAttribute("data-placement-hover");
              return;
            }
            view.contentDOM.style.setProperty(
              "--placement-row",
              String(cell.row),
            );
            view.contentDOM.style.setProperty(
              "--placement-column",
              String(cell.column),
            );
            view.contentDOM.setAttribute("data-placement-hover", "");
          },
        });
      }

      update(update: ViewUpdate) {
        if (update.geometryChanged) this.measure();
      }

      clear() {
        this.pointer = null;
        this.view.contentDOM.removeAttribute("data-placement-hover");
      }

      destroy() {
        this.clear();
        this.view.contentDOM.style.removeProperty("--placement-row");
        this.view.contentDOM.style.removeProperty("--placement-column");
      }
    },
    {
      eventObservers: {
        mousemove(event) {
          if (!isEnabled()) {
            this.clear();
            return;
          }
          this.pointer = { clientX: event.clientX, clientY: event.clientY };
          this.measure();
        },
        mouseleave() {
          this.clear();
        },
        scroll() {
          this.measure();
        },
      },
    },
  );
}
