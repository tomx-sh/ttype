import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  type AnsiDocument,
  parseAnsi,
  sameStyle,
  serializeAnsi,
  type TextStyle,
} from "./ansi";
import { cssForStyle, insertedStyles, richStyles } from "./editor-state";

export const RICH_CLIPBOARD_TYPE = "application/x-ttype-ansi+json";

type ClipboardContent = { fragments: AnsiDocument[]; linewise: boolean };
type ClipboardView = Pick<EditorView, "state"> & {
  dispatch: (spec: TransactionSpec) => void;
};

function joinFragments(fragments: AnsiDocument[]): AnsiDocument {
  const styles: TextStyle[] = [];
  for (const [index, fragment] of fragments.entries()) {
    if (index) styles.push({});
    for (const style of fragment.styles) styles.push(style);
  }
  return {
    text: fragments.map((fragment) => fragment.text).join("\n"),
    styles,
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function styledHtml(document: AnsiDocument): string {
  let html = "";
  for (let from = 0; from < document.text.length; ) {
    const style = document.styles[from];
    let to = from + 1;
    while (to < document.text.length && sameStyle(style, document.styles[to]))
      to++;
    html += `<span style="${escapeHtml(cssForStyle(style))}">${escapeHtml(document.text.slice(from, to))}</span>`;
    from = to;
  }
  return html;
}

export function copyRichText(
  event: ClipboardEvent,
  view: ClipboardView,
): boolean {
  const data = event.clipboardData;
  const field = view.state.field(richStyles, false);
  if (!data || !field) return false;
  let ranges: { from: number; to: number }[] =
    view.state.selection.ranges.filter((range) => !range.empty);
  const linewise = ranges.length === 0;
  if (linewise) {
    const starts = new Set<number>();
    ranges = [];
    for (const range of view.state.selection.ranges) {
      const line = view.state.doc.lineAt(range.head);
      if (starts.has(line.from)) continue;
      starts.add(line.from);
      ranges.push({ from: line.from, to: line.to });
    }
  }
  const fragments = ranges.map(({ from, to }) => ({
    text: view.state.doc.sliceString(from, to),
    styles: field.styles.slice(from, to),
  }));
  const document = joinFragments(fragments);
  const payload = JSON.stringify({
    version: 1,
    linewise,
    fragments: fragments.map(serializeAnsi),
  });
  data.clearData();
  data.setData("text/plain", document.text);
  data.setData(
    "text/html",
    `<pre data-ttype-clipboard="${encodeURIComponent(payload)}" style="white-space:pre;font-family:monospace">${styledHtml(document)}</pre>`,
  );
  // Some browsers only permit the standard formats. The HTML also carries the
  // same payload, so formatting survives when custom clipboard types are lost.
  try {
    data.setData(RICH_CLIPBOARD_TYPE, payload);
  } catch {
    /* HTML fallback. */
  }
  event.preventDefault();
  if (event.type === "cut" && !view.state.readOnly)
    view.dispatch({
      changes: ranges.map(({ from, to }) => ({
        from,
        to: linewise ? Math.min(to + 1, view.state.doc.length) : to,
      })),
      annotations: isolateHistory.of("full"),
      userEvent: "delete.cut",
      scrollIntoView: true,
    });
  return true;
}

export function readRichClipboard(
  data: Pick<DataTransfer, "getData">,
): ClipboardContent | null {
  try {
    let source = data.getData(RICH_CLIPBOARD_TYPE);
    if (!source) {
      const match = /data-ttype-clipboard="([^"]+)"/.exec(
        data.getData("text/html"),
      );
      if (!match) return null;
      source = decodeURIComponent(match[1]);
    }
    const payload = JSON.parse(source);
    if (
      payload?.version !== 1 ||
      typeof payload.linewise !== "boolean" ||
      !Array.isArray(payload.fragments) ||
      payload.fragments.length === 0 ||
      !payload.fragments.every(
        (fragment: unknown) => typeof fragment === "string",
      )
    )
      return null;
    const fragments: AnsiDocument[] = payload.fragments.map(parseAnsi);
    if (
      joinFragments(fragments).text !==
      data.getData("text/plain").replaceAll("\r\n", "\n")
    )
      return null;
    return { fragments, linewise: payload.linewise };
  } catch {
    return null;
  }
}

function splitLines(document: AnsiDocument): AnsiDocument[] {
  let offset = 0;
  return document.text.split("\n").map((text) => {
    const styles = document.styles.slice(offset, offset + text.length);
    offset += text.length + 1;
    return { text, styles };
  });
}

export function pasteRichText(
  event: ClipboardEvent,
  view: ClipboardView,
): boolean {
  if (
    !event.clipboardData ||
    !view.state.field(richStyles, false) ||
    view.state.readOnly
  )
    return false;
  const content = readRichClipboard(event.clipboardData);
  if (!content) return false;
  const { state } = view;
  const combined = joinFragments(content.fragments);
  const lines = splitLines(combined);
  const byLine = lines.length === state.selection.ranges.length;
  const linewise =
    content.linewise && state.selection.ranges.every((range) => range.empty);
  let index = 0;
  let lastLine = -1;
  const changes = state.changeByRange((range) => {
    let document = byLine ? lines[index++] : combined;
    let from = range.from;
    let to = range.to;
    if (linewise) {
      const line = state.doc.lineAt(range.head);
      if (line.from === lastLine) return { range };
      lastLine = line.from;
      from = to = line.from;
      document = {
        text: `${document.text}\n`,
        styles: [...document.styles, {}],
      };
    }
    return {
      changes: { from, to, insert: document.text },
      range: EditorSelection.cursor(
        (linewise ? range.from : from) + document.text.length,
      ),
      effects: insertedStyles.of({ from, styles: document.styles }),
    };
  });
  event.preventDefault();
  view.dispatch({
    ...changes,
    annotations: isolateHistory.of("full"),
    userEvent: "input.paste",
    scrollIntoView: true,
  });
  return true;
}

export const richClipboard = EditorView.domEventHandlers({
  copy: copyRichText,
  cut: copyRichText,
  paste: pasteRichText,
});
