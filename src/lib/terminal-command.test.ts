import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { ESC } from "./ansi";
import { terminalCommand } from "./terminal-command";

const clearMarker = "<screen cleared>";

function preview(shell: string, document: string) {
  // Stub clear to verify invocation and order independently of TERM/terminfo.
  return spawnSync(shell, [
    "-c",
    `clear() { printf '%s' '${clearMarker}'; }\n${terminalCommand(document)}`,
  ]);
}

for (const shell of ["/bin/sh", "/bin/bash", "/bin/zsh"]) {
  test(`terminal command preserves ANSI, Unicode, and literal shell syntax in ${shell}`, () => {
    const document = `${ESC}[1;38;2;100;200;50m┌─ Hello 🌍 ─┐${ESC}[0m\n'quoted' "double" $HOME $(printf injected >&2) \`printf injected >&2\` %s \\c \\n \\033\t\r\x00\x85`;
    const result = preview(shell, document);
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stderr.toString(), "");
    assert.deepEqual(
      result.stdout,
      Buffer.from(`${clearMarker}${document}${ESC}[0m\n`),
    );
  });
}

test("preview clears first, resets formatting, and finishes without extra blank lines", () => {
  for (const document of ["", "hello", "hello\n"]) {
    const result = preview("/bin/sh", document);
    assert.equal(result.status, 0);
    assert.equal(
      result.stdout.toString(),
      `${clearMarker}${document}${ESC}[0m${document.endsWith("\n") ? "" : "\n"}`,
    );
    assert.ok(!terminalCommand(document).includes(ESC));
  }
});
