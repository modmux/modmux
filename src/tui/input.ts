/**
 * Terminal key-input handling for the Coco TUI.
 *
 * Wraps @cliffy/keypress which manages raw mode automatically.
 */

export { keypress } from "@cliffy/keypress";
export type { KeyPressEvent } from "@cliffy/keypress";

/** Simplified key enum used by the TUI event loop. */
export type Key =
  | "Space"
  | "Enter"
  | "Quit"
  | "Escape"
  | "Up"
  | "Down"
  | "CtrlC"
  | "Other";

/** Map a KeyPressEvent to the TUI's Key enum. */
export function mapKey(
  event: { key?: string; ctrlKey?: boolean },
): Key {
  if (event.ctrlKey && event.key === "c") return "CtrlC";
  switch (event.key) {
    case "space":
      return "Space";
    case "return":
      return "Enter";
    case "q":
    case "Q":
      return "Quit";
    case "escape":
      return "Escape";
    case "up":
      return "Up";
    case "down":
      return "Down";
    default:
      return "Other";
  }
}
