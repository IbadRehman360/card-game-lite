/** Chat stickers. The drawings are in components/sticker.tsx; the server only needs the ids. */
export const STICKERS = [
  { id: "king-lol", label: "Haha" },
  { id: "queen-cry", label: "Crying" },
  { id: "king-cool", label: "Deal with it" },
  { id: "king-rage", label: "Furious" },
  { id: "queen-kiss", label: "Mwah" },
  { id: "jack-shabash", label: "Shabash" },
  { id: "jack-sweat", label: "Uh oh" },
  { id: "jack-jaldi", label: "Jaldi karo" },
  { id: "queen-think", label: "Hmm" },
  { id: "king-wah", label: "Wah" },
  { id: "jack-sleep", label: "Zzz" },
  { id: "gg", label: "GG" },
  { id: "rung", label: "Rung!" },
  { id: "ace-boom", label: "Ace boom" },
  { id: "sab-mera", label: "Sab mera" },
  { id: "court", label: "Court!" },
  { id: "on-fire", label: "On fire" },
  { id: "oops", label: "Oops" },
] as const;

export type StickerId = (typeof STICKERS)[number]["id"];

const IDS = new Set<string>(STICKERS.map((s) => s.id));
export const isSticker = (id: string): id is StickerId => IDS.has(id);
export const stickerLabel = (id: string) => STICKERS.find((s) => s.id === id)?.label ?? id;
