import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { ESC } from "./ansi";
import { terminalCommand } from "./terminal-command";

for (const shell of ["/bin/sh", "/bin/bash", "/bin/zsh"]) {
  test(`terminal command preserves ANSI, Unicode, and literal shell syntax in ${shell}`, () => {
    const document = `${ESC}[1;38;2;100;200;50m┌─ Hello 🌍 ─┐${ESC}[0m\n'quoted' "double" $HOME $(printf injected >&2) \`printf injected >&2\` %s \\c \\n \\033\t\r\x00\x85`;
    const result = spawnSync(shell, ["-c", terminalCommand(document)]);
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stderr.toString(), "");
    assert.deepEqual(result.stdout, Buffer.from(`${document}${ESC}[0m\n`));
  });
}

test("preview resets formatting and finishes on a fresh line without extra blank lines", () => {
  for (const document of ["", "hello", "hello\n"]) {
    const result = spawnSync("/bin/sh", ["-c", terminalCommand(document)]);
    assert.equal(result.status, 0);
    assert.equal(
      result.stdout.toString(),
      `${document}${ESC}[0m${document.endsWith("\n") ? "" : "\n"}`,
    );
    assert.ok(!terminalCommand(document).includes(ESC));
  }
});
