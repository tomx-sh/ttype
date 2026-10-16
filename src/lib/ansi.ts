// Styles use UTF-16 offsets, matching CodeMirror. Adjacent characters share styles.
export type TextStyle = {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  doubleUnderline?: boolean;
  strike?: boolean;
  overline?: boolean;
  blink?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  foreground?: string;
  background?: string;
};

export type AnsiDocument = { text: string; styles: TextStyle[] };
export const ESC = "\x1b";
export const PALETTE = [
  "#181b20",
  "#e06c75",
  "#98c379",
  "#e5c07b",
  "#61afef",
  "#c678dd",
  "#56b6c2",
  "#abb2bf",
  "#5c6370",
  "#ff8b94",
  "#b5e890",
  "#ffdc96",
  "#8ac9ff",
  "#e4a3f5",
  "#89e0e8",
  "#f4f4f5",
];

export function sameStyle(a: TextStyle, b: TextStyle): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) => a[key as keyof TextStyle] === b[key as keyof TextStyle],
  );
}

function indexedColor(index: number): string {
  if (index < 16) return PALETTE[index];
  if (index >= 232) {
    const value = (8 + (index - 232) * 10).toString(16).padStart(2, "0");
    return `#${value.repeat(3)}`;
  }
  const levels = [0, 95, 135, 175, 215, 255];
  const n = index - 16;
  return `#${[levels[Math.floor(n / 36)], levels[Math.floor(n / 6) % 6], levels[n % 6]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function applySgr(current: TextStyle, params: string): TextStyle {
  let style = { ...current };
  const codes = params.split(";").map((value) => Number(value || 0));
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) style = {};
    else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) {
      style.underline = true;
      delete style.doubleUnderline;
    } else if (code === 5 || code === 6) style.blink = true;
    else if (code === 7) style.inverse = true;
    else if (code === 8) style.hidden = true;
    else if (code === 9) style.strike = true;
    else if (code === 21) {
      style.doubleUnderline = true;
      delete style.underline;
    } else if (code === 22) {
      delete style.bold;
      delete style.dim;
    } else if (code === 23) delete style.italic;
    else if (code === 24) {
      delete style.underline;
      delete style.doubleUnderline;
    } else if (code === 25) delete style.blink;
    else if (code === 27) delete style.inverse;
    else if (code === 28) delete style.hidden;
    else if (code === 29) delete style.strike;
    else if (code === 53) style.overline = true;
    else if (code === 55) delete style.overline;
    else if (code === 39) delete style.foreground;
    else if (code === 49) delete style.background;
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      style.foreground = PALETTE[code >= 90 ? code - 90 + 8 : code - 30];
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      style.background = PALETTE[code >= 100 ? code - 100 + 8 : code - 40];
    } else if (code === 38 || code === 48) {
      const key = code === 38 ? "foreground" : "background";
      const mode = codes[++i];
      const count = mode === 2 ? 3 : mode === 5 ? 1 : 0;
      const values = codes.slice(i + 1, i + 1 + count);
      if (
        !count ||
        values.length !== count ||
        values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
      ) {
        throw new Error(
          "Incomplete ANSI color. Use 38;2;R;G;B or 38;5;N (48 for background).",
        );
      }
      style[key] =
        mode === 5
          ? indexedColor(values[0])
          : `#${values.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      i += count;
    } else
      throw new Error(
        `SGR ${code} is not supported in visual mode. Your source is preserved.`,
      );
  }
  return style;
}

export function parseAnsi(source: string): AnsiDocument {
  let text = "";
  const styles: TextStyle[] = [];
  let style: TextStyle = {};
  for (let i = 0; i < source.length; ) {
    if (source[i] === ESC) {
      const match = /^\[([\d;]*)m/.exec(source.slice(i + 1));
      if (!match)
        throw new Error(
          "Visual mode supports ANSI SGR text formatting. Other control sequences must stay in source mode.",
        );
      style = applySgr(style, match[1]);
      i += match[0].length + 1;
    } else {
      const code = source.charCodeAt(i);
      if (
        (code < 32 && code !== 9 && code !== 10) ||
        code === 127 ||
        (code >= 128 && code <= 159)
      ) {
        throw new Error(
          "This document contains terminal controls other than tabs and newlines. Edit it in source mode.",
        );
      }
      text += source[i++];
      styles.push(style);
    }
  }
  return { text, styles };
}

export function styleCodes(style: TextStyle): number[] {
  const codes: number[] = [];
  const attributes: [keyof TextStyle, number][] = [
    ["bold", 1],
    ["dim", 2],
    ["italic", 3],
    ["underline", 4],
    ["doubleUnderline", 21],
    ["blink", 5],
    ["inverse", 7],
    ["hidden", 8],
    ["strike", 9],
    ["overline", 53],
  ];
  for (const [key, code] of attributes) if (style[key]) codes.push(code);
  for (const [key, code] of [
    ["foreground", 38],
    ["background", 48],
  ] as const) {
    const color = style[key];
    if (color)
      codes.push(
        code,
        2,
        ...[1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        ),
      );
  }
  return codes;
}

export function serializeAnsi({ text, styles }: AnsiDocument): string {
  let output = "";
  let previous: TextStyle = {};
  for (let i = 0; i < text.length; i++) {
    const style = styles[i] ?? {};
    if (!sameStyle(previous, style)) {
      output += `${ESC}[${[0, ...styleCodes(style)].join(";")}m`;
      previous = style;
    }
    output += text[i];
  }
  if (styleCodes(previous).length) output += `${ESC}[0m`;
  return output;
}

// Escape controls that CodeMirror would normalize (such as carriage returns),
// plus backslashes so literal "\\x1b" remains literal after source editing.
export function readableSource(raw: string): string {
  let result = "";
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (character === "\\") result += "\\\\";
    else if (
      (code < 32 && code !== 9 && code !== 10) ||
      (code >= 127 && code <= 159)
    ) {
      result += `\\x${code.toString(16).padStart(2, "0")}`;
    } else result += character;
  }
  return result;
}

export function rawSource(readable: string): string {
  return readable.replace(/\\(\\|x[0-9a-fA-F]{2})/g, (_, value: string) =>
    value === "\\"
      ? "\\"
      : String.fromCharCode(Number.parseInt(value.slice(1), 16)),
  );
}

export const WELCOME = `\x1b[0;1;38;2;86;156;214mttype — text with character.\x1b[0m
A small space for terminal text. Try editing anything below.
\x1b[0;2m─────────────────────────────────────────────────────────────────────\x1b[0;1m
\x1b[0m
\x1b[0;1mBold\x1b[0m  \x1b[0;2mDim\x1b[0m  \x1b[0;3mItalic\x1b[0m  \x1b[0;4mUnder\x1b[0m  \x1b[0;21mDouble\x1b[0m \x1b[0;9mStrike\x1b[0m  \x1b[0;53mOver\x1b[0m  \x1b[0;7m Inverse \x1b[0m  \x1b[0;38;2;24;27;32;48;2;255;220;150m Highlight \x1b[0m
Concealed: [\x1b[0;8msecret\x1b[0m] ← reveal the text in Source.

\x1b[0;38;2;24;27;32;48;2;255;139;148m red \x1b[0m \x1b[0;38;2;24;27;32;48;2;255;220;150m gold \x1b[0m \x1b[0;38;2;24;27;32;48;2;181;232;144m green \x1b[0m \x1b[0;38;2;24;27;32;48;2;137;224;232m cyan \x1b[0m \x1b[0;38;2;24;27;32;48;2;138;201;255m blue \x1b[0m \x1b[0;38;2;24;27;32;48;2;228;163;245m violet \x1b[0m
RGB  \x1b[0;38;2;224;108;117m█\x1b[0;38;2;229;156;107m█\x1b[0;38;2;229;192;123m█\x1b[0;38;2;152;195;121m█\x1b[0;38;2;86;182;194m█\x1b[0;38;2;97;175;239m█\x1b[0;38;2;198;120;221m█\x1b[0m  256-color  \x1b[0;38;2;0;135;255m█\x1b[0;38;2;95;135;255m█\x1b[0;38;2;135;135;255m█\x1b[0;38;2;175;135;255m█\x1b[0;38;2;215;135;255m█\x1b[0m

╭────────────────────────────────────────────────────────────────────╮
│  \x1b[0;1mTERMINAL STATUS\x1b[0m                                                   │
│  \x1b[0;5;38;2;76;175;80m● LIVE\x1b[0m  ·  This indicator blinks (if your terminal is compatible) │
│                                                                    │
│  Upload  \x1b[0;38;2;76;175;80m████████████████\x1b[0;2;38;2;76;175;80m░░░░░░░░\x1b[0m  67%                             │
│  Result  \x1b[0;38;2;76;175;80m✓\x1b[0m Styled text, ready for the terminal.                    │
╰────────────────────────────────────────────────────────────────────╯

\x1b[0;1mBOX DRAWING & BLOCKS\x1b[0m
┌─┬─┐  ╔═╦═╗  ░▒▓█  ▁▂▃▄▅▆▇█  ← ↑ → ↓
├─┼─┤  ╠═╬═╣
└─┴─┘  ╚═╩═╝
\x1b[0;2m─────────────────────────────────────────────────────────────────────\x1b[0m
Select text → style it. Ω → insert characters.
Source → inspect ANSI. Copy / Export → use it in your terminal.
\x1b[0;2mYour draft stays in this browser. Reset → start here again.\x1b[0m
`;
