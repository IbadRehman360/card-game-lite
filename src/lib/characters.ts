/** The four regulars of the back room. Original characters, modelled for this game. */

export type CharacterId = "mungo" | "corvina" | "sal" | "wart";

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  /** One- or two-word role tag shown under the name. */
  role: string;
  /** Signature colour: the role tag, the key light on their seat and the confirm button. */
  accent: string;
}

export const CHARACTERS: CharacterInfo[] = [
  { id: "mungo", name: "Mungo", role: "The Veteran", accent: "#e8873a" },
  { id: "corvina", name: "Corvina", role: "The Hustler", accent: "#e0475a" },
  { id: "sal", name: "Big Sal", role: "The Heavy", accent: "#4f9bd8" },
  { id: "wart", name: "Wart", role: "The Bookkeeper", accent: "#a6c93f" },
];

export const characterById = (id: CharacterId) => CHARACTERS.find((c) => c.id === id)!;

export const isCharacterId = (v: unknown): v is CharacterId =>
  v === "mungo" || v === "corvina" || v === "sal" || v === "wart";
