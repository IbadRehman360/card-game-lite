/**
 * The game's name in one place. The final name isn't decided yet: change it here and the logo,
 * the page title and the home-screen name all follow.
 */
export const BRAND = {
  /** Small word on the tag above the wordmark (leave empty for none). */
  tag: "Last",
  /** The big painted word. */
  word: "Haath",
} as const;

export const APP_NAME = [BRAND.tag, BRAND.word].filter(Boolean).join(" ");
