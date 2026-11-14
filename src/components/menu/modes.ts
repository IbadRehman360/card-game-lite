/** How the player is heading to the table. */
export type Mode =
  | { kind: "practice" }
  | { kind: "host"; game?: "rung" | "patti"; boot?: number }
  | { kind: "join"; code: string }
  | { kind: "patti"; table: "low" | "mid" | "high" }
  | { kind: "solo"; game: ExtraId };

/** The games beyond Rung and 3 Patti, played against the computer. */
export type ExtraId = "bluff" | "paanch" | "bhabhi" | "gpatta";

/** Which card game the home screen is set to. */
export type GameKind = "rung" | "patti";

/** Table codes are 3 digits, easy to read out and type on a number pad. */
export const CODE_ALPHABET = "0123456789";
export const CODE_LENGTH = 3;

export function cleanCode(v: string) {
  return v
    .split("")
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, CODE_LENGTH);
}

/** Short HUD label for the mode, shown on the select and seated screens. */
export function modeLabel(mode: Mode) {
  if (mode.kind === "practice") return "Solo vs House";
  if (mode.kind === "host") return "Hosting a table";
  if (mode.kind === "patti") return "3 Patti vs House";
  if (mode.kind === "solo") return "Solo vs House";
  return `Joining ${mode.code}`;
}
