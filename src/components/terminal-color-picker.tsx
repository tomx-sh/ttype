"use client";

import { Check, ChevronDown, PaintBucket, Type } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PALETTE } from "@/lib/ansi";

export function TerminalColorPicker({
  target,
  value,
  disabled,
  onChange,
  editorFocus,
}: {
  target: "foreground" | "background";
  value?: string;
  disabled: boolean;
  onChange: (color: string | undefined) => void;
  editorFocus: () => HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const label = target === "foreground" ? "Text color" : "Background color";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={label}
            title={label}
          />
        }
      >
        {target === "foreground" ? <Type /> : <PaintBucket />}
        <span
          className="size-2 border"
          style={{ backgroundColor: value ?? "currentColor" }}
        />
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent align="start" finalFocus={editorFocus}>
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
        </PopoverHeader>
        <div className="grid grid-cols-8 gap-1">
          {PALETTE.map((color) => (
            <Button
              key={color}
              variant="outline"
              size="icon-sm"
              style={{ backgroundColor: color }}
              title={color}
              aria-label={`Apply ${color}`}
              aria-pressed={value === color}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
            >
              {value === color && (
                <Check
                  style={{
                    color: PALETTE.indexOf(color) > 7 ? "#000000" : "#ffffff",
                  }}
                />
              )}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId}>Custom color</Label>
          <Input
            id={inputId}
            type="color"
            className="w-12"
            value={value ?? "#000000"}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          Reset to default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
