/**
 * The pictures of the tavern, rendered once from the 3D stage (see public/baked).
 *
 * Each aspect class was captured at w x h CSS pixels with the very camera shots of the 3D stage
 * (cam.ts shotFor). Plates are the room with no players (or, for select, all four seated); sprites are
 * single players on a transparent ground, with the table already cut out of them, at x/y/w/h in the
 * plate's CSS pixels.
 */
export type Aspect = "tall" | "land" | "desk";

export interface Sprite {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Baked {
  w: number;
  h: number;
  plates: Record<string, string>;
  sprites: Record<string, Sprite>;
}

/** Tall phones (portrait), sideways phones, and everything else. */
export const aspectOf = (w: number, h: number): Aspect => (w / h < 0.9 ? "tall" : h < 560 ? "land" : "desk");

export const BAKED: Record<Aspect, Baked> = {
  "desk": {
    "w": 1600,
    "h": 900,
    "plates": {
      "menu": "/baked/plate-menu-desk.webp",
      "play": "/baked/plate-play-desk.webp",
      "select0": "/baked/plate-select0-desk.webp",
      "select1": "/baked/plate-select1-desk.webp",
      "select2": "/baked/plate-select2-desk.webp",
      "select3": "/baked/plate-select3-desk.webp",
      "title": "/baked/plate-title-desk.webp"
    },
    "sprites": {
      "menu": {
        "src": "/baked/sprite-menu-desk.webp",
        "x": 1025,
        "y": 149.17,
        "w": 191.67,
        "h": 256.67
      },
      "play-c0-s1": {
        "src": "/baked/sprite-play-c0-s1-desk.webp",
        "x": 1340,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c0-s2": {
        "src": "/baked/sprite-play-c0-s2-desk.webp",
        "x": 697.5,
        "y": 0,
        "w": 214.17,
        "h": 81.67
      },
      "play-c0-s3": {
        "src": "/baked/sprite-play-c0-s3-desk.webp",
        "x": 0,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c1-s1": {
        "src": "/baked/sprite-play-c1-s1-desk.webp",
        "x": 1340,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c1-s2": {
        "src": "/baked/sprite-play-c1-s2-desk.webp",
        "x": 687.5,
        "y": 0,
        "w": 232.5,
        "h": 81.67
      },
      "play-c1-s3": {
        "src": "/baked/sprite-play-c1-s3-desk.webp",
        "x": 0,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c2-s1": {
        "src": "/baked/sprite-play-c2-s1-desk.webp",
        "x": 1340,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c2-s2": {
        "src": "/baked/sprite-play-c2-s2-desk.webp",
        "x": 693.33,
        "y": 0,
        "w": 220.83,
        "h": 81.67
      },
      "play-c2-s3": {
        "src": "/baked/sprite-play-c2-s3-desk.webp",
        "x": 0,
        "y": 0,
        "w": 260,
        "h": 534.17
      },
      "play-c3-s1": {
        "src": "/baked/sprite-play-c3-s1-desk.webp",
        "x": 1340,
        "y": 32.5,
        "w": 260,
        "h": 501.67
      },
      "play-c3-s2": {
        "src": "/baked/sprite-play-c3-s2-desk.webp",
        "x": 680,
        "y": 0,
        "w": 268.33,
        "h": 81.67
      },
      "play-c3-s3": {
        "src": "/baked/sprite-play-c3-s3-desk.webp",
        "x": 0,
        "y": 31.67,
        "w": 260,
        "h": 502.5
      },
      "title": {
        "src": "/baked/sprite-title-desk.webp",
        "x": 705,
        "y": 171.67,
        "w": 191.67,
        "h": 261.67
      }
    }
  },
  "land": {
    "w": 932,
    "h": 430,
    "plates": {
      "menu": "/baked/plate-menu-land.webp",
      "play": "/baked/plate-play-land.webp",
      "select0": "/baked/plate-select0-land.webp",
      "select1": "/baked/plate-select1-land.webp",
      "select2": "/baked/plate-select2-land.webp",
      "select3": "/baked/plate-select3-land.webp",
      "title": "/baked/plate-title-land.webp"
    },
    "sprites": {
      "menu": {
        "src": "/baked/sprite-menu-land.webp",
        "x": 600,
        "y": 49,
        "w": 105.5,
        "h": 141.5
      },
      "play-c0-s1": {
        "src": "/baked/sprite-play-c0-s1-land.webp",
        "x": 755,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c0-s2": {
        "src": "/baked/sprite-play-c0-s2-land.webp",
        "x": 413.5,
        "y": 0,
        "w": 110,
        "h": 9.5
      },
      "play-c0-s3": {
        "src": "/baked/sprite-play-c0-s3-land.webp",
        "x": 0,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c1-s1": {
        "src": "/baked/sprite-play-c1-s1-land.webp",
        "x": 755,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c1-s2": {
        "src": "/baked/sprite-play-c1-s2-land.webp",
        "x": 408.5,
        "y": 0,
        "w": 119,
        "h": 9.5
      },
      "play-c1-s3": {
        "src": "/baked/sprite-play-c1-s3-land.webp",
        "x": 0,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c2-s1": {
        "src": "/baked/sprite-play-c2-s1-land.webp",
        "x": 755,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c2-s2": {
        "src": "/baked/sprite-play-c2-s2-land.webp",
        "x": 411,
        "y": 0,
        "w": 114,
        "h": 9.5
      },
      "play-c2-s3": {
        "src": "/baked/sprite-play-c2-s3-land.webp",
        "x": 0,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c3-s1": {
        "src": "/baked/sprite-play-c3-s1-land.webp",
        "x": 755,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "play-c3-s2": {
        "src": "/baked/sprite-play-c3-s2-land.webp",
        "x": 422.5,
        "y": 0,
        "w": 87,
        "h": 9.5
      },
      "play-c3-s3": {
        "src": "/baked/sprite-play-c3-s3-land.webp",
        "x": 0,
        "y": 0,
        "w": 177,
        "h": 245.5
      },
      "title": {
        "src": "/baked/sprite-title-land.webp",
        "x": 414,
        "y": 53.5,
        "w": 105,
        "h": 144.5
      }
    }
  },
  "tall": {
    "w": 430,
    "h": 932,
    "plates": {
      "menu": "/baked/plate-menu-tall.webp",
      "play": "/baked/plate-play-tall.webp",
      "select0": "/baked/plate-select0-tall.webp",
      "select1": "/baked/plate-select1-tall.webp",
      "select2": "/baked/plate-select2-tall.webp",
      "select3": "/baked/plate-select3-tall.webp",
      "title": "/baked/plate-title-tall.webp"
    },
    "sprites": {
      "menu": {
        "src": "/baked/sprite-menu-tall.webp",
        "x": 158,
        "y": 233.5,
        "w": 115.5,
        "h": 160.5
      },
      "play-c0-s2": {
        "src": "/baked/sprite-play-c0-s2-tall.webp",
        "x": 147,
        "y": 0,
        "w": 134,
        "h": 173.5
      },
      "play-c1-s2": {
        "src": "/baked/sprite-play-c1-s2-tall.webp",
        "x": 143.5,
        "y": 0,
        "w": 143,
        "h": 173.5
      },
      "play-c2-s2": {
        "src": "/baked/sprite-play-c2-s2-tall.webp",
        "x": 145,
        "y": 0,
        "w": 142.5,
        "h": 173.5
      },
      "play-c3-s2": {
        "src": "/baked/sprite-play-c3-s2-tall.webp",
        "x": 114.5,
        "y": 0,
        "w": 198,
        "h": 173.5
      },
      "title": {
        "src": "/baked/sprite-title-tall.webp",
        "x": 159.5,
        "y": 425,
        "w": 112,
        "h": 154.5
      }
    }
  }
};
