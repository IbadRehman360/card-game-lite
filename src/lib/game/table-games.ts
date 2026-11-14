import { GAMES, type GameKind } from "../wallet/economy";

/**
 * One place that says, for every game: how many can sit down, and what the host may change
 * before the deal. The home screen, the host's settings and the server all read this, so a
 * table can never be made with a seat count or an option its game doesn't support.
 */

export type TableGame = GameKind;

/** A setting the host picks before starting. `key` is the field it sets in GameOptions. */
export interface GameSetting {
  key: "players" | "series" | "boot";
  /** Shown above the row of choices. */
  label: string;
  choices: { value: number; label: string }[];
  fallback: number;
}

export interface TableGameSpec {
  id: TableGame;
  name: string;
  /** Seat counts the engine supports, smallest first. */
  players: number[];
  /** Seats when the host doesn't choose. */
  defaultPlayers: number;
  /** True when partners play 2v2 (the lobby draws two teams facing each other). */
  teams: boolean;
  /** What the host may change, in the order it's shown. */
  settings: GameSetting[];
}

const seatChoices = (counts: number[]) =>
  counts.map((n) => ({ value: n, label: `${n} players` }));

export const TABLE_GAMES: Record<TableGame, TableGameSpec> = {
  rung: {
    id: "rung",
    name: GAMES.rung.name,
    players: [4],
    defaultPlayers: 4,
    teams: true,
    settings: [
      {
        key: "series",
        label: "Series",
        choices: [
          { value: 3, label: "3 deals" },
          { value: 5, label: "5 deals" },
        ],
        fallback: 3,
      },
    ],
  },
  patti: {
    id: "patti",
    name: GAMES.patti.name,
    players: [4],
    defaultPlayers: 4,
    teams: false,
    settings: [
      {
        key: "boot",
        label: "Boot",
        choices: [
          { value: 10, label: "10" },
          { value: 50, label: "50" },
          { value: 100, label: "100" },
        ],
        fallback: 10,
      },
    ],
  },
  bluff: {
    id: "bluff",
    name: GAMES.bluff.name,
    players: [4],
    defaultPlayers: 4,
    teams: false,
    settings: [],
  },
  paanch: {
    id: "paanch",
    name: GAMES.paanch.name,
    players: [2, 4],
    defaultPlayers: 4,
    teams: false,
    settings: [{ key: "players", label: "Players", choices: seatChoices([2, 4]), fallback: 4 }],
  },
  bhabhi: {
    id: "bhabhi",
    name: GAMES.bhabhi.name,
    players: [3, 4, 5, 6],
    defaultPlayers: 4,
    teams: false,
    settings: [{ key: "players", label: "Players", choices: seatChoices([3, 4, 5, 6]), fallback: 4 }],
  },
  gpatta: {
    id: "gpatta",
    name: GAMES.gpatta.name,
    players: [2, 3, 4, 5, 6],
    defaultPlayers: 4,
    teams: false,
    settings: [{ key: "players", label: "Players", choices: seatChoices([2, 3, 4, 5, 6]), fallback: 4 }],
  },
};

export const specFor = (game: TableGame | undefined): TableGameSpec => TABLE_GAMES[game ?? "rung"] ?? TABLE_GAMES.rung;

/** The seat count to use for a table, forced to one the game supports. */
export function seatsFor(game: TableGame | undefined, players: unknown): number {
  const spec = specFor(game);
  const n = Math.floor(Number(players));
  return spec.players.includes(n) ? n : spec.defaultPlayers;
}

/** The most seats any game uses: how wide the seat arrays at a table are. */
export const MAX_SEATS = 6;
