import { invertedEffects, isolateHistory } from "@codemirror/commands";
import {
  type EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type KeyBinding,
} from "@codemirror/view";
import { type AnsiDocument, sameStyle, type TextStyle } from "./ansi";

export type RichState = { styles: TextStyle[]; typing: TextStyle };
export const replaceStyles = StateEffect.define<RichState>();
type StyleRange = { from: number; styles: TextStyle[] };
const restoreRanges = StateEffect.define<StyleRange[]>({
  map(ranges, changes) {
    const mapped: StyleRange[] = [];
    changes.iterGaps((from, mappedFrom, length) => {
      for (const range of ranges) {
        const start = Math.max(from, range.from);
        const end = Math.min(from + length, range.from + range.styles.length);
        if (start < end)
          mapped.push({
            from: mappedFrom + start - from,
            styles: range.styles.slice(start - range.from, end - range.from),
          });
      }
    });
    return mapped;
  },
});
const restoreTyping = StateEffect.define<TextStyle>();

export function styleAt(state: EditorState): TextStyle {
  const field = state.field(richStyles);
  const selection = state.selection.main;
  return selection.empty ? field.typing : (field.styles[selection.from] ?? {});
}

export function cssForStyle(style: TextStyle): string {
  let foreground = style.foreground ?? "var(--foreground)";
  let background = style.background ?? "transparent";
  if (style.inverse)
    [foreground, background] = [
      style.background ?? "var(--background)",
      foreground,
    ];
  const lines = [
    (style.underline || style.doubleUnderline) && "underline",
    style.strike && "line-through",
    style.overline && "overline",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `color:${foreground}`,
    `background-color:${background}`,
    style.bold && "font-weight:800",
    style.italic && "font-style:italic",
    style.dim && "opacity:0.55",
    style.hidden && "visibility:hidden",
    lines && `text-decoration-line:${lines}`,
    style.doubleUnderline && "text-decoration-style:double",
  ]
    .filter(Boolean)
    .join(";");
}

function decorations({ styles }: RichState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let from = 0; from < styles.length; ) {
    const style = styles[from];
    let to = from + 1;
    while (to < styles.length && sameStyle(styles[to], style)) to++;
    if (Object.keys(style).length) {
      builder.add(
        from,
        to,
        Decoration.mark({
          attributes: { style: cssForStyle(style) },
          class: style.blink ? "ansi-blink" : "",
        }),
      );
    }
    from = to;
  }
  return builder.finish();
}

export const richStyles = StateField.define<RichState>({
  create: (state) => ({ styles: Array(state.doc.length).fill({}), typing: {} }),
  update(value, transaction) {
    let next = value;
    if (transaction.docChanged) {
      const styles: TextStyle[] = [];
      let cursor = 0;
      transaction.changes.iterChanges(
        (from, to, _fromNew, _toNew, inserted) => {
          for (let i = cursor; i < from; i++) styles.push(value.styles[i]);
          for (let i = 0; i < inserted.length; i++) styles.push(value.typing);
          cursor = to;
        },
      );
      for (let i = cursor; i < value.styles.length; i++)
        styles.push(value.styles[i]);
      next = { styles, typing: value.typing };
    } else if (transaction.selection) {
      const position = transaction.newSelection.main.from;
      const index = position > 0 ? position - 1 : 0;
      next = { ...value, typing: value.styles[index] ?? {} };
    }
    for (const effect of transaction.effects) {
      if (effect.is(replaceStyles)) next = effect.value;
      else if (effect.is(restoreTyping))
        next = { ...next, typing: effect.value };
      else if (effect.is(restoreRanges)) {
        const styles = next.styles.slice();
        for (const range of effect.value) {
          for (let i = 0; i < range.styles.length; i++)
            styles[range.from + i] = range.styles[i];
        }
        next = { ...next, styles };
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, decorations),
});

// History retains only affected attributes, rather than a full copy of the
// document's styles for every keystroke. Effects map through grouped edits.
export const richHistory = invertedEffects.of((transaction) => {
  if (
    !transaction.docChanged &&
    !transaction.effects.some(
      (effect) =>
        effect.is(replaceStyles) ||
        effect.is(restoreRanges) ||
        effect.is(restoreTyping),
    )
  )
    return [];
  const before = transaction.startState.field(richStyles);
  const ranges: StyleRange[] = [];
  if (transaction.docChanged) {
    transaction.changes.iterChanges((from, to) => {
      if (from < to)
        ranges.push({ from, styles: before.styles.slice(from, to) });
    });
  } else {
    const after = transaction.state.field(richStyles);
    for (let from = 0; from < before.styles.length; ) {
      if (sameStyle(before.styles[from], after.styles[from])) {
        from++;
        continue;
      }
      let to = from + 1;
      while (
        to < before.styles.length &&
        !sameStyle(before.styles[to], after.styles[to])
      )
        to++;
      ranges.push({ from, styles: before.styles.slice(from, to) });
      from = to;
    }
  }
  return [restoreRanges.of(ranges), restoreTyping.of(before.typing)];
});

export function initialStyles(document: AnsiDocument) {
  return richStyles.init(() => ({
    styles: document.styles,
    typing: document.styles[0] ?? {},
  }));
}

type FormattingView = {
  state: EditorState;
  dispatch: (spec: TransactionSpec) => void;
  focus: () => void;
};

function updateSelectionStyles(
  view: FormattingView,
  apply: (style: TextStyle) => TextStyle,
  focus: boolean,
) {
  const current = view.state.field(richStyles);
  const styles = current.styles.slice();
  for (const range of view.state.selection.ranges) {
    for (let i = range.from; i < range.to; i++) styles[i] = apply(styles[i]);
  }
  view.dispatch({
    effects: replaceStyles.of({ styles, typing: apply(current.typing) }),
    annotations: isolateHistory.of("full"),
    userEvent: "format",
  });
  if (focus) view.focus();
}

export function copyStyle(state: EditorState): TextStyle {
  return { ...styleAt(state) };
}

export function styleClipboardKeymap(
  onCopy: () => boolean,
  onPaste: () => boolean,
): KeyBinding[] {
  return [
    { key: "Mod-Alt-c", run: onCopy },
    { key: "Mod-Alt-v", run: onPaste },
  ];
}

export function pasteStyle(
  view: FormattingView,
  style: TextStyle,
  focus = true,
) {
  const copied = { ...style };
  updateSelectionStyles(view, () => copied, focus);
}

export function formatSelection(
  view: FormattingView,
  patch: Partial<TextStyle> | null,
  focus = true,
) {
  const apply = (style: TextStyle): TextStyle => {
    if (!patch) return {};
    const next = { ...style, ...patch };
    if (patch.underline) delete next.doubleUnderline;
    if (patch.doubleUnderline) delete next.underline;
    for (const key of Object.keys(next) as (keyof TextStyle)[]) {
      if (next[key] === undefined || next[key] === false) delete next[key];
    }
    return next;
  };
  updateSelectionStyles(view, apply, focus);
}

export function getDocument(state: EditorState): AnsiDocument {
  return { text: state.doc.toString(), styles: state.field(richStyles).styles };
}
