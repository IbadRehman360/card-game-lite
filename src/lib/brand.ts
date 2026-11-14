/**
 * The game's name in one place. Change the name here and the logo,
 * the page title and the home-screen name all follow.
 */
export const BRAND = {
  /** Small word on the tag above the wordmark (leave empty for none). */
  tag: "",
  /** The big painted word. */
  word: "Baazi",
} as const;

export const APP_NAME = [BRAND.tag, BRAND.word].filter(Boolean).join(" ");
