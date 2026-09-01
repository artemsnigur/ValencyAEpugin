export type Point = { x: number; y: number };
export type GraphPreset = { name: string; p1: Point; p2: Point };

/** The 24 built-in curves, carried over verbatim from main.js. */
export const BUILTIN_PRESETS: GraphPreset[] = [
  { name: "Linear", p1: { x: 0, y: 100 }, p2: { x: 100, y: 0 } },
  { name: "Ease Standard", p1: { x: 33, y: 100 }, p2: { x: 66, y: 0 } },
  { name: "Ease In", p1: { x: 33, y: 100 }, p2: { x: 100, y: 0 } },
  { name: "Ease Out", p1: { x: 0, y: 100 }, p2: { x: 66, y: 0 } },
  { name: "Fast Out Slow In", p1: { x: 0, y: 100 }, p2: { x: 20, y: 0 } },
  { name: "Slow Out Fast In", p1: { x: 80, y: 100 }, p2: { x: 100, y: 0 } },
  { name: "Soft S-Curve", p1: { x: 33, y: 100 }, p2: { x: 33, y: 0 } },
  { name: "Medium S-Curve", p1: { x: 50, y: 100 }, p2: { x: 50, y: 0 } },
  { name: "Hard S-Curve", p1: { x: 80, y: 100 }, p2: { x: 20, y: 0 } },
  { name: "Extreme S-Curve", p1: { x: 100, y: 100 }, p2: { x: 0, y: 0 } },
  { name: "Expo In", p1: { x: 85, y: 100 }, p2: { x: 100, y: 0 } },
  { name: "Expo Out", p1: { x: 0, y: 100 }, p2: { x: 15, y: 0 } },
  { name: "Expo InOut", p1: { x: 90, y: 100 }, p2: { x: 10, y: 0 } },
  { name: "Circ In", p1: { x: 55, y: 100 }, p2: { x: 100, y: 55 } },
  { name: "Circ Out", p1: { x: 0, y: 45 }, p2: { x: 45, y: 0 } },
  { name: "Circ InOut", p1: { x: 85, y: 100 }, p2: { x: 15, y: 0 } },
  { name: "Back In", p1: { x: 36, y: 100 }, p2: { x: 66, y: 150 } },
  { name: "Back Out", p1: { x: 34, y: -50 }, p2: { x: 64, y: 0 } },
  { name: "Back InOut", p1: { x: 68, y: 150 }, p2: { x: 32, y: -50 } },
  { name: "Anticipate", p1: { x: 30, y: 120 }, p2: { x: 100, y: 0 } },
  { name: "Overshoot", p1: { x: 0, y: 100 }, p2: { x: 70, y: -20 } },
  { name: "Elastic Feel", p1: { x: 20, y: 150 }, p2: { x: 80, y: -50 } },
  { name: "Step-like", p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 } },
  { name: "Sudden Drop", p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
];

/** Same key name the shipped panel uses. Separate origins most likely mean
    separate stores, so this is format compatibility, not shared state. */
export const FAVOURITES_KEY = "graph-favorites-sandbox";

export const loadFavourites = (): GraphPreset[] => {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    return raw ? (JSON.parse(raw) as GraphPreset[]) : [];
  } catch {
    return [];
  }
};

export const saveFavourites = (presets: GraphPreset[]) => {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(presets));
  } catch {
    // Storage can be unavailable; favourites are a convenience, not state we
    // are willing to fail a click over.
  }
};

/** The shipped panel's match tolerance for "is the current curve a favourite". */
export const samePreset = (a: GraphPreset, p1: Point, p2: Point) =>
  Math.abs(a.p1.x - p1.x) < 0.1 &&
  Math.abs(a.p1.y - p1.y) < 0.1 &&
  Math.abs(a.p2.x - p2.x) < 0.1 &&
  Math.abs(a.p2.y - p2.y) < 0.1;
