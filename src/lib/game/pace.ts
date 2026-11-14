/** How long the table lingers after showing an event before revealing the next one (ms). */
export const PACE = {
  /** The cards being dealt round the table at the start of each deal. */
  deal: 1750,
  /** After a card lands, before the next player's card. */
  afterPlay: 720,
  /** After a haath is decided: it is held, then swept away, before the next lead. */
  afterTrick: 1500,
  /** Before the first card of a deal, once the deal has finished. */
  first: 380,
};

/** A finished haath sits still for this long (s) so you can see who won it... */
export const TRICK_HOLD = 0.6;
/** ...then takes this long (s) to slide to the middle stack or to the winners. */
export const TRICK_MOVE = 0.55;

/** Seconds a player has to play a card before one is played for them. */
export const TURN_SECONDS = 15;

/** Seconds an online seat is held for a player who dropped out, before a computer takes it over. */
export const AWAY_SECONDS = 10;
