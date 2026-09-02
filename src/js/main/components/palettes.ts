/**
 * Brand palettes.
 *
 * Sampled from the Valency brand artwork: three colourways, each light
 * letterforms on a near-black ground. Near-black coverage measured 15% / 10% /
 * 20% across the three bands, so all three are dark colourways - the third is
 * the most dark of the set, not a light theme.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE, and why every value is spelled out
 *
 * The artwork reached us as a screenshot with the background thrown out of
 * focus. Blur averages neighbouring pixels and pulls saturation toward the
 * mean, so the real render is very likely more saturated than these numbers.
 * Re-deriving from the original is expected.
 *
 * That is why the ramp steps are literals rather than computed from the
 * ground: re-sampling is then a change to the numbers in this file and the
 * matching defaults in variables.scss, and nothing else moves. No caller
 * derives one token from another.
 * ---------------------------------------------------------------------------
 *
 * These are presets, not slots. They sit in a fixed row above the six user
 * slots so that saving over a slot can never cost you a brand palette.
 */
export type Palette = {
  id: string;
  name: string;
  /** Page ground. The panel's outermost surface. */
  ground: string;
  /** Panel surface, one step up from the ground. */
  surface: string;
  /** Controls and rows that sit on a panel. */
  raised: string;
  /** Hairlines and control borders. */
  rule: string;
  /** Primary text. */
  ink: string;
  /** Secondary text: values, supporting copy. */
  ink2: string;
  /** Muted text: labels, units, disabled. The floor before contrast fails. */
  ink3: string;
  /** State only - active, selected, focused. Never decoration. */
  accent: string;
  /** Accent at panel weight, for fills behind accent-coloured text. */
  accentDim: string;
};

export const PALETTES: Palette[] = [
  {
    id: "olive",
    name: "Olive",
    ground: "#131311",
    surface: "#1e1e1a",
    raised: "#282824",
    rule: "#3b3b35",
    ink: "#e9e9e7",
    ink2: "#afb0ab",
    ink3: "#7a7b75",
    accent: "#b9b9a0",
    accentDim: "#373830",
  },
  {
    id: "lilac",
    name: "Lilac",
    ground: "#111013",
    surface: "#1b1a1e",
    raised: "#252428",
    rule: "#36353b",
    ink: "#e8e7e9",
    ink2: "#adacb2",
    ink3: "#76757b",
    accent: "#c6c0d6",
    accentDim: "#35323d",
  },
  {
    id: "mauve",
    name: "Mauve",
    ground: "#131112",
    surface: "#1e1a1c",
    raised: "#282426",
    rule: "#3b3538",
    ink: "#e9e7e8",
    ink2: "#b0acae",
    ink3: "#7a7577",
    accent: "#c9a9b4",
    accentDim: "#3a3033",
  },
];

/** Olive is the default: it is the colourway the product leads with. */
export const DEFAULT_PALETTE_ID = "olive";

export const paletteById = (id: string): Palette => {
  for (let i = 0; i < PALETTES.length; i++) {
    if (PALETTES[i].id === id) return PALETTES[i];
  }
  return PALETTES[0];
};
