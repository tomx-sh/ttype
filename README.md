# ttype

A fullscreen, monospace editor for ANSI terminal documents, built with Next.js and CodeMirror 6.

```sh
bun install
bun dev
```

Select text and use the toolbar to format it. With a collapsed selection, formatting applies to what you type next. The character grid can be toggled off. Lines scroll horizontally without wrapping; tabs occupy four columns. Alt-drag makes a rectangular selection.

The active line and caret column share a subtle highlight in both Visual and Source modes. The column highlight follows the character grid and tab stops, including when grid lines are hidden.

The welcome example showcases text styles, conceal, background highlights, palette/256/RGB colors, separators, a rounded status box with a blinking indicator and block progress bar, and box-drawing characters. Use **Reset** to load it into an existing draft.

Switch between **Visual** and **Source** with the shadcn tabs in the header. **Col** toggles the column ruler, hidden by default. **Blanks** toggles dots for spaces and each occupied tab cell, also off by default. Whitespace markers are display decorations, so copying and exporting preserve the original spaces and tabs.

The dashed-rectangle toolbar toggle shows terminal bounds, starting at the first character of the first line. Choose **80 × 24** (VT100), **80 × 25** (PC console), or **132 × 24** (wide terminal) with the adjacent arrow. Sizes are columns × rows. The guide uses the measured character cells and scrolls with the document, including when the document is empty. It is a visual aid: it does not insert a box, constrain typing, or change exports. Bounds are hidden in source mode.

The toolbar shows every text style directly: bold, dim, italic, underline, double underline, strikethrough, overline, blink, reverse colors, and conceal. Foreground/background controls offer palette colors and any RGB color. Concealed text is invisible in visual mode; remove the attribute or use source mode to edit it.

Normal **Copy/Cut/Paste** (⌘/Ctrl C, X, V or the browser context menu) preserves text attributes and colors between Visual editors, including across tabs. Copying with no selection copies the current line; rectangular selections also retain their formatting. Other apps receive plain text and styled HTML where supported. Text pasted from other apps follows the normal plain-text behavior. Cut and paste support undo/redo; Source mode continues to copy and paste literal source text.

**Copy style** and **Paste style** in the formatting toolbar transfer all text attributes and foreground/background colors in Visual mode. Copy uses the active typing style at the caret, or the first selected character for a selection with mixed styles. Paste replaces formatting across the selection (including rectangular selections), or sets the style for future typing at a caret. Pasting supports undo/redo. The copied style stays available for this editor session and leaves the system clipboard unchanged.

**Insert TUI characters** (the Ω icon in the toolbar) opens a dialog with box-drawing characters, blocks, shading, arrows, symbols, and ASCII characters. Click to insert at the current cursor or replace the selection. The dialog stays open for repeated insertions; close it with **Done** or Escape. Inserted characters use the current formatting and support undo/redo. The picker also works in source mode.

**Place cursor anywhere** (the Locate Fixed icon beside Ω) enables a crosshair in Visual mode and highlights the hovered cell, even with grid lines hidden. Click a cell, then type or use the character library. Clicking beyond a line adds spaces; clicking below the document adds new lines and spaces on the destination line. Existing text is preserved, and padding supports undo/redo. Click the tool again or press Escape to exit. Switching modes or opening a file also exits placement mode.

**Source** shows editable ANSI sequences using readable `\x1b` notation. Literal backslashes are doubled in this view so that source conversion is reversible. Switching back applies the changes to the visual document. Formatting and typing support undo/redo, including changes brought back from source mode.

**Open** imports UTF-8 `.ans`, `.ansi`, or `.txt` files up to 2 MB. **Export** downloads actual ESC bytes, ready for terminal rendering:

```sh
cat untitled.ans
```

The primary **Copy source** icon copies readable ANSI source, using the same `\x1b` notation as Source mode. Its adjacent dropdown offers **Copy command to preview in terminal**, which copies a `clear; printf` command for sh, bash, or zsh. Paste the command into your terminal to clear the screen and render the document. Quotes and shell syntax in the document print literally; backslashes and control characters are encoded for `printf`. The command resets formatting afterward and leaves the prompt on a fresh line. Copying requires browser clipboard access (HTTPS or localhost).

The current document and filename are saved to this browser's local storage. No account, backend, or network storage is used. Opening another file replaces the current draft. Export files you want to keep.

**Reset** in the bottom bar asks for confirmation with a standard shadcn Alert Dialog, then restores the default welcome example and the `untitled.ans` filename in either editor mode. Undo restores the previous document text and formatting. The adjacent **GitHub** link opens this repository in a new tab and uses the original Lucide GitHub icon from [Lucide 0.468.0](https://github.com/lucide-icons/lucide/blob/0.468.0/icons/github.svg), with its license included in `assets/lucide-github-LICENSE.txt`.

| Shortcut | Action |
| --- | --- |
| ⌘/Ctrl B, I, U | Bold, italic, underline |
| ⌘⌥C / Ctrl+Alt+C | Copy style (Visual mode) |
| ⌘⌥V / Ctrl+Alt+V | Paste style (Visual mode) |
| ⌘/Ctrl Z | Undo |
| ⌘/Ctrl Shift Z | Redo |
| ⌘/Ctrl Shift E | Toggle visual/source mode |
| ⌘/Ctrl S | Export ANSI file |
| Tab | Insert indentation |
| Esc, then Tab | Move keyboard focus out of the editor |

## ANSI support

Visual mode handles SGR text attributes, selective resets, 16-color and 256-color input, and 24-bit RGB colors. Export normalizes colors to 24-bit RGB and ends styled output with a reset. Appearance depends on the terminal's font, palette, and supported attributes. Blink animation respects the browser's reduced-motion setting. Monospace cells align ASCII and box-drawing characters; emoji and other wide Unicode glyphs depend on the browser's font fallback.

The app bundles the complete [official JetBrains Mono 2.305 variable fonts](https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/variable), including box-drawing and block glyphs absent from the Google Fonts subsets. Its nominal cell spans 1320 font units per 1000 units/em, so editor rows use `line-height: 1.32` (18.48px at 14px). The `█` glyph fills that cell; vertical box strokes extend past its edges to avoid seams. Each row has a fixed cell height, and the grid follows CodeMirror's measured dimensions. The fonts' SIL Open Font License is included in `src/app/fonts/OFL.txt`.

This is a document editor, not a terminal emulator. Cursor movement, screen clearing, OSC sequences (including hyperlinks), other terminal controls, and unsupported SGR attributes stay in source mode. They are preserved for editing/export; a message explains why visual mode cannot be used. Windows CRLF line endings are normalized to LF on file import.

## Branding and metadata

The production URL is `https://ttype.sh`. Shared site copy and URLs live in `src/lib/site.ts`; Next.js generates the canonical link, Open Graph and Twitter metadata, JSON-LD, `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest` from the app's metadata files.

The favicon and touch/home-screen icons reuse the header's Lucide Terminal symbol. `src/app/icon.svg` is the icon source; `assets/social-card.svg` is the editable source for the 1200 × 630 `src/app/opengraph-image.png` sharing image. The copied icon's license is included in `assets/lucide-LICENSE.txt`.

## Validation

App controls use the standard shadcn `base-lyra` components configured in `components.json`, with the existing theme tokens. Install them with `bunx --bun shadcn@latest add <component>`. Custom CSS is limited to CodeMirror's cell geometry, grid, ruler, and ANSI effects; the color swatches show actual document colors. The generated label wrapper has a narrow Biome exception because its `htmlFor` is forwarded from the caller; color inputs supply matching IDs.

The header's theme toggle offers Light, Dark, and System. `next-themes` defaults to Dark and remembers explicit choices in browser storage. Both the app controls and editor use the existing light/dark theme tokens; explicit ANSI document colors remain document colors.

```sh
bun test
bunx tsc --noEmit
bun run lint
bun run build
```

The tests cover ANSI parsing/serialization, color modes and resets, reversible source notation, and formatting/text undo and redo without browser automation.
