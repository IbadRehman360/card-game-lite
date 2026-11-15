/**
 * Who sits at the table: the desi cast players and bots *are* (Badshah, Nani, Cricketer…). Their ids go
 * in prefs, to the server as a player's `avatar`, and seat lists hold indexes into this list. The 2D UI
 * draws them as a round bust (<Avatar id>) and seated at the table (<SeatedFigure id>), both in
 * src/components/avatars. Pick bots, profiles and opponents from here.
 *
 * Ids saved before the desi cast (mungo, corvina, sal, wart: the old 3D regulars) still resolve, through
 * `resolveCharacterId`, to the first four characters.
 */

export const CHARACTER_IDS = [
  "chaudhry",
  "nani",
  "badshah",
  "ustad",
  "cricketer",
  "malika",
  "rockstar",
  "baba",
  "gamer",
  "ghulam",
  "joker",
  "student",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  /** One- or two-word role tag shown under the name. */
  role: string;
  /** Signature colour: the role tag, the ring round their avatar and the confirm button. */
  accent: string;
}

export const CHARACTERS: CharacterInfo[] = [
  { id: "chaudhry", name: "Chaudhry", role: "The Landlord", accent: "#e8873a" },
  { id: "nani", name: "Nani", role: "The Sharp One", accent: "#e0475a" },
  { id: "badshah", name: "Badshah", role: "The King", accent: "#4f9bd8" },
  { id: "ustad", name: "Ustad Ji", role: "The Teacher", accent: "#a6c93f" },
  { id: "cricketer", name: "Cricketer", role: "The All-rounder", accent: "#2fa866" },
  { id: "malika", name: "Malika", role: "The Queen", accent: "#c94f9b" },
  { id: "rockstar", name: "Rockstar", role: "The Showman", accent: "#8a63d2" },
  { id: "baba", name: "Baba", role: "The Elder", accent: "#d9b25b" },
  { id: "gamer", name: "Gamer", role: "The Grinder", accent: "#33b5c9" },
  { id: "ghulam", name: "Ghulam", role: "The Loyal One", accent: "#b8762a" },
  { id: "joker", name: "Joker", role: "The Wild Card", accent: "#e8b04a" },
  { id: "student", name: "Student", role: "The Rookie", accent: "#5a8fe0" },
];

/** Ids saved before the desi cast (the old 3D regulars): each becomes the character who took their seat. */
const LEGACY: Record<string, CharacterId> = {
  mungo: "chaudhry",
  corvina: "nani",
  sal: "badshah",
  wart: "ustad",
};

export const isCharacterId = (v: unknown): v is CharacterId =>
  typeof v === "string" && (CHARACTER_IDS as readonly string[]).includes(v);

/** A character id, also from an old (figure) id; null for anything else. */
export function resolveCharacterId(v: unknown): CharacterId | null {
  if (isCharacterId(v)) return v;
  if (typeof v === "string" && Object.hasOwn(LEGACY, v)) return LEGACY[v];
  return null;
}

export const characterById = (id: CharacterId) => CHARACTERS.find((c) => c.id === id)!;

/** Index into CHARACTERS for an id (old ids too); 0 when unknown. */
export const characterIndex = (id: unknown) => {
  const r = resolveCharacterId(id);
  return r ? Math.max(0, CHARACTERS.findIndex((c) => c.id === r)) : 0;
};
