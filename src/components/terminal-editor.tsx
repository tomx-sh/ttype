"use client";

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import {
  Bold,
  ChevronDown,
  Code2,
  Contrast,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Grid2X2,
  Info,
  Italic,
  LocateFixed,
  Omega,
  Pilcrow,
  Redo2,
  Ruler,
  Siren,
  SquareDashed,
  Strikethrough,
  SunDim,
  Terminal,
  TriangleAlert,
  Underline,
  Undo2,
  Upload,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { CharacterPicker } from "@/components/character-picker";
import { ModeToggle } from "@/components/mode-toggle";
import { TerminalColorPicker } from "@/components/terminal-color-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  type AnsiDocument,
  parseAnsi,
  rawSource,
  readableSource,
  serializeAnsi,
  type TextStyle,
  WELCOME,
} from "@/lib/ansi";
import { placeCursorAtClick, placementCellHover } from "@/lib/cell-placement";
import {
  formatSelection,
  getDocument,
  initialStyles,
  replaceStyles,
  richHistory,
  richStyles,
  styleAt,
} from "@/lib/editor-state";
import { terminalCommand } from "@/lib/terminal-command";

type Mode = "visual" | "source";
type Snapshot = {
  style: TextStyle;
  line: number;
  column: number;
  selected: number;
  lines: number;
  characters: number;
  undo: boolean;
  redo: boolean;
};
type Controller = {
  view: EditorView;
  mode: Mode;
  richState: EditorState;
  sourceState?: EditorState;
  sourceOriginal: string;
  refresh: () => void;
  extensions: ReturnType<typeof editorExtensions>;
};
const DRAFT_KEY = "ttype.document.v1";
const NAME_KEY = "ttype.filename.v1";
const TERMINAL_SIZES = [
  { id: "80x24", columns: 80, rows: 24, label: "80 × 24 — VT100" },
  { id: "80x25", columns: 80, rows: 25, label: "80 × 25 — PC console" },
  { id: "132x24", columns: 132, rows: 24, label: "132 × 24 — Wide terminal" },
] as const;

function measureCharacterGrid(view: EditorView) {
  view.requestMeasure({
    key: measureCharacterGrid,
    read: (editor) => ({
      width: editor.defaultCharacterWidth,
      height: editor.defaultLineHeight,
    }),
    write: ({ width, height }, editor) => {
      const workspace = editor.dom.closest<HTMLElement>(".editor-workspace");
      workspace?.style.setProperty("--cell-width", `${width}px`);
      workspace?.style.setProperty("--cell-height", `${height}px`);
    },
  });
}

function editorExtensions(
  onUpdate: () => void,
  onToggle: () => void,
  onSave: () => void,
  onPlace: (view: EditorView, event: MouseEvent) => boolean,
  onEscape: () => boolean,
  isPlacing: () => boolean,
) {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightWhitespace(),
    rectangularSelection(),
    crosshairCursor(),
    placementCellHover(isPlacing),
    EditorView.domEventHandlers({
      mousedown: (event, view) => onPlace(view, event),
    }),
    EditorState.tabSize.of(4),
    EditorView.contentAttributes.of({
      "aria-label": "Terminal document",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    }),
    keymap.of([
      { key: "Escape", run: onEscape },
      { key: "Mod-b", run: (view) => toggleAttribute(view, "bold") },
      { key: "Mod-i", run: (view) => toggleAttribute(view, "italic") },
      { key: "Mod-u", run: (view) => toggleAttribute(view, "underline") },
      {
        key: "Mod-Shift-e",
        run: () => {
          onToggle();
          return true;
        },
      },
      {
        key: "Mod-s",
        run: () => {
          onSave();
          return true;
        },
      },
      ...historyKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.geometryChanged) measureCharacterGrid(update.view);
      if (
        update.docChanged ||
        update.selectionSet ||
        update.transactions.some((t) => t.effects.length)
      )
        onUpdate();
    }),
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": { overflow: "auto" },
    }),
  ];
}

function toggleAttribute(
  view: EditorView,
  key: keyof TextStyle,
  focus = true,
): boolean {
  if (!view.state.field(richStyles, false)) return false;
  const { styles, typing } = view.state.field(richStyles);
  const ranges = view.state.selection.ranges;
  const allEnabled = ranges.every((range) =>
    range.empty
      ? !!typing[key]
      : styles.slice(range.from, range.to).every((style) => !!style[key]),
  );
  formatSelection(view, { [key]: !allEnabled }, focus);
  return true;
}

function richEditorState(
  document: AnsiDocument,
  extensions: Controller["extensions"],
) {
  return EditorState.create({
    doc: document.text,
    extensions: [...extensions, initialStyles(document), richHistory],
  });
}

function sourceEditorState(
  source: string,
  extensions: Controller["extensions"],
) {
  return EditorState.create({ doc: readableSource(source), extensions });
}

export function TerminalEditor() {
  const host = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<Controller | null>(null);
  const placement = useRef(false);
  const [placing, setPlacing] = useState(false);
  const actions = useRef({ toggle: () => {}, save: () => {} });
  const [mode, setMode] = useState<Mode>("visual");
  const [name, setName] = useState("untitled.ans");
  const [viewTools, setViewTools] = useState<string[]>(["grid"]);
  const grid = viewTools.includes("grid");
  const showRuler = viewTools.includes("ruler");
  const showWhitespace = viewTools.includes("whitespace");
  const showBounds = viewTools.includes("bounds");
  const [terminalSize, setTerminalSize] = useState<
    (typeof TERMINAL_SIZES)[number]
  >(TERMINAL_SIZES[0]);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved locally");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    style: {},
    line: 1,
    column: 1,
    selected: 0,
    lines: 1,
    characters: 0,
    undo: false,
    redo: false,
  });

  useEffect(() => {
    if (!host.current) return;
    let draft = WELCOME;
    try {
      draft = localStorage.getItem(DRAFT_KEY) ?? WELCOME;
      setName(localStorage.getItem(NAME_KEY) ?? "untitled.ans");
    } catch {
      setSaveStatus("Local saving unavailable");
    }
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const current = controller.current;
      if (!current) return;
      const { state } = current.view;
      const selection = state.selection.main;
      const line = state.doc.lineAt(selection.head);
      const raw =
        current.mode === "source"
          ? rawSource(state.doc.toString())
          : serializeAnsi(getDocument(state));
      setSnapshot({
        style: current.mode === "visual" ? styleAt(state) : {},
        line: line.number,
        column: selection.head - line.from + 1,
        selected: state.selection.ranges.reduce(
          (sum, range) => sum + range.to - range.from,
          0,
        ),
        lines: state.doc.lines,
        characters: state.doc.length,
        undo: undoDepth(state) > 0,
        redo: redoDepth(state) > 0,
      });
      if (current.mode === "source") {
        try {
          parseAnsi(raw);
          setSourceError("");
        } catch (error) {
          setSourceError((error as Error).message);
        }
      } else setSourceError("");
      clearTimeout(timer);
      setSaveStatus("Saving locally…");
      timer = setTimeout(() => {
        try {
          localStorage.setItem(DRAFT_KEY, raw);
          setSaveStatus("Saved locally");
        } catch {
          setSaveStatus("Local saving unavailable");
        }
      }, 250);
    };
    const extensions = editorExtensions(
      refresh,
      () => actions.current.toggle(),
      () => actions.current.save(),
      (view, event) =>
        placement.current && controller.current?.mode === "visual"
          ? placeCursorAtClick(view, event)
          : false,
      () => {
        if (!placement.current) return false;
        placement.current = false;
        setPlacing(false);
        return true;
      },
      () => placement.current && controller.current?.mode === "visual",
    );
    let initialMode: Mode = "visual";
    let richState = richEditorState(parseAnsi(WELCOME), extensions);
    let state: EditorState;
    try {
      richState = richEditorState(parseAnsi(draft), extensions);
      state = richState;
    } catch {
      initialMode = "source";
      state = sourceEditorState(draft, extensions);
    }
    const view = new EditorView({ state, parent: host.current });
    controller.current = {
      view,
      mode: initialMode,
      richState,
      sourceOriginal: draft,
      extensions,
      refresh,
    };
    setMode(initialMode);
    refresh();
    measureCharacterGrid(view);
    void document.fonts.ready.then(() => {
      if (controller.current?.view === view) measureCharacterGrid(view);
    });
    const onScroll = () => {
      if (ruler.current)
        ruler.current.style.transform = `translateX(-${view.scrollDOM.scrollLeft}px)`;
    };
    view.scrollDOM.addEventListener("scroll", onScroll);
    const flush = () => {
      const current = controller.current;
      if (!current) return;
      try {
        localStorage.setItem(
          DRAFT_KEY,
          current.mode === "visual"
            ? serializeAnsi(getDocument(current.view.state))
            : rawSource(current.view.state.doc.toString()),
        );
      } catch {
        /* Export remains available when browser storage is blocked. */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      view.destroy();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    if (showRuler && ruler.current && controller.current) {
      ruler.current.style.transform = `translateX(-${controller.current.view.scrollDOM.scrollLeft}px)`;
    }
  }, [showRuler]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  function switchMode(focus = true) {
    const current = controller.current;
    if (!current) return;
    setPlacementMode(false);
    if (current.mode === "visual") {
      current.richState = current.view.state;
      current.sourceOriginal = serializeAnsi(getDocument(current.view.state));
      const source = readableSource(current.sourceOriginal);
      const state =
        current.sourceState?.doc.toString() === source
          ? current.sourceState
          : sourceEditorState(current.sourceOriginal, current.extensions);
      current.mode = "source";
      current.view.setState(state);
    } else {
      const raw = rawSource(current.view.state.doc.toString());
      try {
        const parsed = parseAnsi(raw);
        current.sourceState = current.view.state;
        if (raw !== current.sourceOriginal) {
          current.richState = current.richState.update({
            changes: {
              from: 0,
              to: current.richState.doc.length,
              insert: parsed.text,
            },
            effects: replaceStyles.of({
              styles: parsed.styles,
              typing: parsed.styles[0] ?? {},
            }),
            selection: { anchor: 0 },
            userEvent: "input.source",
          }).state;
        }
        current.mode = "visual";
        current.view.setState(current.richState);
      } catch (error) {
        setSourceError((error as Error).message);
        return;
      }
    }
    setMode(current.mode);
    current.refresh();
    if (focus) current.view.focus();
  }

  function exportFile() {
    const current = controller.current;
    if (!current) return;
    const raw =
      current.mode === "visual"
        ? serializeAnsi(getDocument(current.view.state))
        : rawSource(current.view.state.doc.toString());
    const url = URL.createObjectURL(
      new Blob([raw], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name.trim() || "untitled.ans";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("ANSI file exported");
  }

  async function copyDocument(format: "source" | "command") {
    const current = controller.current;
    if (!current) return;
    const raw =
      current.mode === "visual"
        ? serializeAnsi(getDocument(current.view.state))
        : rawSource(current.view.state.doc.toString());
    try {
      await navigator.clipboard.writeText(
        format === "command" ? terminalCommand(raw) : readableSource(raw),
      );
      setNotice(
        format === "command"
          ? "Command copied — paste it into your terminal"
          : "Source copied",
      );
    } catch {
      setNotice(
        "Could not copy. Clipboard access needs HTTPS or localhost and browser permission.",
      );
    }
  }

  function insertCharacter(character: string) {
    const current = controller.current;
    if (!current) return;
    const text =
      current.mode === "source" ? readableSource(character) : character;
    current.view.dispatch({
      ...current.view.state.replaceSelection(text),
      annotations: isolateHistory.of("full"),
      userEvent: "input.character",
      scrollIntoView: true,
    });
  }

  useEffect(() => {
    actions.current = { toggle: switchMode, save: exportFile };
  });

  async function openFile(file: File) {
    const current = controller.current;
    if (!current) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Please open a document smaller than 2 MB.");
      return;
    }
    try {
      const raw = (await file.text()).replaceAll("\r\n", "\n");
      let state: EditorState;
      try {
        state = richEditorState(parseAnsi(raw), current.extensions);
        current.richState = state;
        current.mode = "visual";
      } catch {
        state = sourceEditorState(raw, current.extensions);
        current.mode = "source";
      }
      current.sourceState = undefined;
      current.sourceOriginal = raw;
      setPlacementMode(false);
      current.view.setState(state);
      setMode(current.mode);
      setName(file.name);
      try {
        localStorage.setItem(NAME_KEY, file.name);
      } catch {
        /* The document can still be exported. */
      }
      current.refresh();
      current.view.focus();
      setNotice(`Opened ${file.name}`);
    } catch {
      setNotice("Could not read this file.");
    }
  }

  function format(patch: Partial<TextStyle> | null, focus = true) {
    const current = controller.current;
    if (current?.mode === "visual") formatSelection(current.view, patch, focus);
  }

  function toggle(key: keyof TextStyle, focus = true) {
    const current = controller.current;
    if (current?.mode === "visual") toggleAttribute(current.view, key, focus);
  }

  function setPlacementMode(enabled: boolean) {
    placement.current = enabled;
    setPlacing(enabled);
  }

  const source = mode === "source";
  function setViewTool(tool: string, pressed: boolean) {
    setViewTools((tools) =>
      pressed
        ? [...tools.filter((value) => value !== tool), tool]
        : tools.filter((value) => value !== tool),
    );
  }

  const editorFocus = () => controller.current?.view.contentDOM ?? null;

  return (
    <Tabs
      render={<main />}
      value={mode}
      onValueChange={(value) => {
        if (value !== mode) switchMode(false);
      }}
      className={`h-dvh gap-0 overflow-hidden${grid ? " has-grid" : ""}${showWhitespace ? " show-whitespace" : ""}`}
    >
      <header className="relative flex shrink-0 flex-wrap items-center gap-2 border-b p-2">
        <div className="flex items-center gap-2">
          <Terminal />
          <h1>ttype</h1>
        </div>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ·
        </span>
        <Input
          className="w-44"
          aria-label="Document filename"
          value={name}
          spellCheck={false}
          onChange={(event) => {
            setName(event.target.value);
            try {
              localStorage.setItem(NAME_KEY, event.target.value);
            } catch {
              /* Filename is still used for export. */
            }
          }}
        />
        <div className="order-last flex w-full items-center justify-center gap-2 lg:absolute lg:left-1/2 lg:w-auto lg:-translate-x-1/2">
          <TabsList aria-label="Editor mode">
            <TabsTrigger value="visual" aria-label="Visual mode">
              <Eye />
              Visual
            </TabsTrigger>
            <TabsTrigger
              value="source"
              aria-label="Source mode"
              title="Toggle source (⌘/Ctrl Shift E)"
            >
              <Code2 />
              Source
            </TabsTrigger>
          </TabsList>
          <ButtonGroup aria-label="Copy document">
            <Button
              size="icon"
              onClick={() => copyDocument("source")}
              aria-label="Copy source"
              title="Copy source"
            >
              <Copy />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon"
                    aria-label="More copy options"
                    title="More copy options"
                  />
                }
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuItem onClick={() => copyDocument("command")}>
                  <Terminal />
                  Copy command to preview in terminal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            title="Open an ANSI or text file"
          >
            <Upload />
            Open
          </Button>
          <Button
            variant="outline"
            onClick={exportFile}
            title="Export ANSI file (⌘/Ctrl S)"
          >
            <Download />
            Export .ans
          </Button>
          <ModeToggle />
        </div>
        <Input
          ref={fileInput}
          className="hidden"
          type="file"
          accept=".ans,.ansi,.txt,text/plain"
          aria-label="Open ANSI file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openFile(file);
            event.target.value = "";
          }}
        />
      </header>

      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-b p-2"
        role="toolbar"
        aria-label="Text formatting"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo (⌘/Ctrl Z)"
          title="Undo (⌘/Ctrl Z)"
          disabled={!snapshot.undo}
          onClick={() => {
            if (controller.current) {
              undo(controller.current.view);
              controller.current.view.focus();
            }
          }}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo (⌘/Ctrl Shift Z)"
          title="Redo (⌘/Ctrl Shift Z)"
          disabled={!snapshot.redo}
          onClick={() => {
            if (controller.current) {
              redo(controller.current.view);
              controller.current.view.focus();
            }
          }}
        >
          <Redo2 />
        </Button>
        <span
          aria-hidden="true"
          className="mx-1 shrink-0 text-muted-foreground"
        >
          ·
        </span>
        {(
          [
            { key: "bold", label: "Bold (⌘/Ctrl B)", icon: <Bold /> },
            { key: "italic", label: "Italic (⌘/Ctrl I)", icon: <Italic /> },
            {
              key: "underline",
              label: "Underline (⌘/Ctrl U)",
              icon: <Underline />,
            },
            {
              key: "doubleUnderline",
              label: "Double underline",
              icon: <span className="underline decoration-double">U</span>,
            },
            { key: "strike", label: "Strikethrough", icon: <Strikethrough /> },
            {
              key: "overline",
              label: "Overline",
              icon: <span className="overline">O</span>,
            },
            { key: "dim", label: "Dim", icon: <SunDim /> },
            { key: "blink", label: "Blink", icon: <Siren /> },
            { key: "inverse", label: "Reverse colors", icon: <Contrast /> },
            { key: "hidden", label: "Conceal", icon: <EyeOff /> },
          ] as const
        ).map(({ key, label, icon }) => (
          <Toggle
            key={key}
            aria-label={label}
            title={label}
            pressed={!!snapshot.style[key]}
            disabled={source}
            onPressedChange={() => toggle(key)}
          >
            {icon}
          </Toggle>
        ))}
        <span
          aria-hidden="true"
          className="mx-1 shrink-0 text-muted-foreground"
        >
          ·
        </span>
        {(["foreground", "background"] as const).map((target) => (
          <TerminalColorPicker
            key={target}
            target={target}
            value={snapshot.style[target]}
            disabled={source}
            onChange={(color) => format({ [target]: color }, false)}
            editorFocus={editorFocus}
          />
        ))}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear formatting"
          title="Clear formatting"
          disabled={source}
          onClick={() => format(null)}
        >
          <Eraser />
        </Button>
        <span
          aria-hidden="true"
          className="mx-1 shrink-0 text-muted-foreground"
        >
          ·
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Insert TUI characters"
          title="Insert TUI characters"
          aria-haspopup="dialog"
          aria-expanded={charactersOpen}
          onClick={() => setCharactersOpen(true)}
        >
          <Omega />
        </Button>
        <Toggle
          aria-label="Place cursor anywhere"
          title="Place cursor anywhere (Escape to exit)"
          pressed={placing}
          disabled={source}
          onPressedChange={(pressed) => {
            setPlacementMode(pressed);
            controller.current?.view.focus();
          }}
        >
          <LocateFixed />
        </Toggle>
        <span className="ml-2 hidden text-xs text-muted-foreground lg:inline">
          {source
            ? "Escape codes are shown as \\x1b"
            : placing
              ? "Click a cell, then type or insert a character · Esc to exit"
              : "Select text to style it"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Toggle
            aria-label="Toggle column ruler"
            title="Show column ruler"
            pressed={showRuler}
            onPressedChange={(pressed) => setViewTool("ruler", pressed)}
          >
            <Ruler />
            Col
          </Toggle>
          <Toggle
            aria-label="Toggle whitespace"
            title="Show spaces and tabs as dots"
            pressed={showWhitespace}
            onPressedChange={(pressed) => setViewTool("whitespace", pressed)}
          >
            <Pilcrow />
            Blanks
          </Toggle>
          <Toggle
            aria-label="Toggle character grid"
            title="Toggle character grid"
            pressed={grid}
            onPressedChange={(pressed) => setViewTool("grid", pressed)}
          >
            <Grid2X2 />
            Grid
          </Toggle>
          <ButtonGroup aria-label="Terminal bounds">
            <Toggle
              variant="outline"
              aria-label="Toggle terminal bounds"
              title={`Show ${terminalSize.columns} columns × ${terminalSize.rows} rows`}
              pressed={showBounds}
              disabled={source}
              onPressedChange={(pressed) => setViewTool("bounds", pressed)}
            >
              <SquareDashed />
              {terminalSize.columns} × {terminalSize.rows}
            </Toggle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Choose terminal size"
                    title="Choose terminal size"
                    disabled={source}
                  />
                }
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56"
                finalFocus={editorFocus}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Columns × rows</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={terminalSize.id}
                    onValueChange={(value) => {
                      const preset = TERMINAL_SIZES.find(
                        (size) => size.id === value,
                      );
                      if (preset) {
                        setTerminalSize(preset);
                        setViewTool("bounds", true);
                      }
                    }}
                  >
                    {TERMINAL_SIZES.map((size) => (
                      <DropdownMenuRadioItem key={size.id} value={size.id}>
                        {size.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
      </div>

      <TabsContent
        value={mode}
        keepMounted
        className="flex min-h-0 flex-1 flex-col"
      >
        {notice && (
          <Alert>
            <Info />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {sourceError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{sourceError}</AlertDescription>
          </Alert>
        )}
        <div
          className={`editor-workspace relative flex min-h-0 flex-1 flex-col${showBounds && !source ? " has-terminal-guide" : ""}${placing ? " placement-mode" : ""}`}
          style={
            {
              "--terminal-columns": terminalSize.columns,
              "--terminal-rows": terminalSize.rows,
            } as CSSProperties
          }
        >
          {showRuler && (
            <div
              className="column-ruler relative flex h-8 shrink-0 items-center overflow-hidden border-b text-muted-foreground"
              aria-hidden="true"
            >
              <span className="ruler-corner flex h-full shrink-0 items-center bg-background">
                {source ? "ESC" : "COL"}
              </span>
              <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
                <div
                  ref={ruler}
                  className="ruler-numbers flex shrink-0 whitespace-pre"
                >
                  {Array.from({ length: 30 }, (_, i) => (i + 1) * 10).map(
                    (column) => (
                      <span key={column}>
                        {String(column).padStart(10, "·")}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={host} className="editor-host relative min-h-0 flex-1" />
        </div>
      </TabsContent>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{saveStatus}</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ·
          </span>
          <span>
            Ln {snapshot.line}, Col {snapshot.column}
          </span>
          {snapshot.selected > 0 && <span>{snapshot.selected} selected</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>
            {snapshot.lines} lines · {snapshot.characters} chars
          </span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ·
          </span>
          <span>UTF-8</span>
          <Badge variant="outline">ANSI SGR</Badge>
        </div>
      </footer>
      <CharacterPicker
        open={charactersOpen}
        onOpenChange={setCharactersOpen}
        onInsert={insertCharacter}
        editorFocus={editorFocus}
      />
    </Tabs>
  );
}
