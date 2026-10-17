import { ESC } from "./ansi";

/** A pasteable POSIX shell command. Document text is always a quoted argument,
 * never shell code or a printf format string. %b only sees escapes we generate.
 */
export function terminalCommand(document: string): string {
  const output = `${document}${ESC}[0m${document.endsWith("\n") ? "" : "\n"}`;
  let argument = "";
  for (const character of output) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\" || code < 32 || (code >= 127 && code <= 159)) {
      for (const byte of new TextEncoder().encode(character)) {
        argument += `\\0${byte.toString(8).padStart(3, "0")}`;
      }
    } else argument += character;
  }
  return `clear; printf '%b' '${argument.replaceAll("'", "'\\''")}'`;
}
