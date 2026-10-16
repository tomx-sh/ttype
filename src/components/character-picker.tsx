"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CHARACTER_GROUPS = [
  { name: "Light & rounded", characters: "─│┌┐└┘├┤┬┴┼╭╮╰╯┄┆┈┊" },
  { name: "Heavy", characters: "━┃┏┓┗┛┣┫┳┻╋┅┇┉┋" },
  { name: "Double", characters: "═║╔╗╚╝╠╣╦╩╬╒╕╘╛╞╡╤╧╪" },
  { name: "Blocks & shading", characters: "█▓▒░▀▄▌▐▖▗▘▝▙▛▜▟▁▂▃▅▆▇▏▎▍▋▊▉" },
  { name: "Arrows", characters: "←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕▴▾◂▸" },
  { name: "Symbols", characters: "○●◉◌□■▪▫◇◆✓✗×±•·…«»" },
  { name: "ASCII", characters: "/\\|+-_=#*.:<>[]{}()~^" },
];

export function CharacterPicker({
  open,
  onOpenChange,
  onInsert,
  editorFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (character: string) => void;
  editorFocus: () => HTMLElement | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto]"
        finalFocus={editorFocus}
      >
        <DialogHeader>
          <DialogTitle>TUI characters</DialogTitle>
          <DialogDescription>
            Click a character to insert it at your cursor using the current text
            style.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {CHARACTER_GROUPS.map(({ name, characters }) => (
            <section className="space-y-2" key={name} aria-label={name}>
              <h3>{name}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1">
                {Array.from(characters).map((character) => {
                  const code = `U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`;
                  return (
                    <Button
                      key={character}
                      variant="outline"
                      size="icon"
                      title={`${character} · ${code}`}
                      aria-label={`Insert ${character} (${code})`}
                      onClick={() => onInsert(character)}
                    >
                      {character}
                    </Button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
