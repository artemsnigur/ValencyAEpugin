/**
 * Theme tokens and persistence.
 *
 * Every value is stored as a **string**: the panel reads them straight off
 * input `.value` and writes them back unconverted, and keeping one type across
 * the boundary removes a class of bug where a slot round-trips to a number.
 */
import { DEFAULT_PALETTE_ID, Palette, paletteById } from "./palettes";

/**
 * Slot payload version.
 *
 * 1 - the ported 1.4.0 shape: bgColor, gradStart, gradEnd, radius, angle, anim.
 * 2 - direction B: a palette id plus an optional accent override. The gradient
 *     is gone, so gradEnd and angle no longer describe anything, and the ground
 *     comes from the palette rather than being picked freely.
 *
 * A slot with no version field predates the field, which means version 1.
 * migrateSlot() below carries it forward rather than discarding it.
 */
export const SLOT_VERSION = 2;

export type ThemeConfig = {
  /** Palette id from PALETTES. */
  palette: string;
  /** Accent override. Empty string means "use the palette's own accent". */
  accent: string;
  /** Corner radius in px, without the unit. */
  radius: string;
  /** Press-animation id, read by body[data-anim]. */
  anim: string;
};

export const K = {
  palette: "valency.theme.palette",
  accent: "valency.theme.accent",
  radius: "valency.theme.radius",
  anim: "valency.theme.anim",
  audioVolume: "valency.theme.audio-volume",
  renderPrefix: "valency.render.prefix",
  layerColour: "valency.theme.layer-color",
  lastSlot: "valency.theme.last-slot",
  slot: (n: number) => `valency.theme.slot-${n}`,
  slotName: (n: number) => `valency.theme.slot-name-${n}`,
};

/**
 * Keys written by the version 1 theme model.
 *
 * Read once during migration, then cleared. They are listed here rather than
 * inline so that nothing has to guess later which keys were ours.
 */
const LEGACY_K = {
  bgColor: "valency.theme.bg-color",
  gradStart: "valency.theme.grad-start",
  gradEnd: "valency.theme.grad-end",
  angle: "valency.theme.grad-angle",
};

export const DEFAULTS: ThemeConfig = {
  palette: DEFAULT_PALETTE_ID,
  accent: "",
  radius: "3",
  anim: "pop",
};

const get = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const set = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Theme settings are a convenience.
  }
};

const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

export const loadConfig = (): ThemeConfig => ({
  palette: get(K.palette, DEFAULTS.palette),
  accent: get(K.accent, DEFAULTS.accent),
  radius: get(K.radius, DEFAULTS.radius),
  anim: get(K.anim, DEFAULTS.anim),
});

/** Resolve a config to the palette it paints with, accent override applied. */
export const resolvePalette = (config: ThemeConfig): Palette => {
  const base = paletteById(config.palette);
  return config.accent ? { ...base, accent: config.accent } : base;
};

export const setToken = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

/** Apply a config to the document. Pure token writes, no React involved. */
export const applyConfig = (config: ThemeConfig) => {
  const p = resolvePalette(config);
  setToken("--ground", p.ground);
  setToken("--surface", p.surface);
  setToken("--raised", p.raised);
  setToken("--rule", p.rule);
  setToken("--ink", p.ink);
  setToken("--ink-2", p.ink2);
  setToken("--ink-3", p.ink3);
  setToken("--accent", p.accent);
  // Left at the palette's own value when the accent is overridden: it is a
  // panel-weight fill behind accent text, and deriving it from an arbitrary
  // user colour is the kind of automatic ramp this design replaced.
  setToken("--accent-dim", p.accentDim);
  setToken("--radius", `${config.radius}px`);
  document.body.setAttribute("data-anim", config.anim);
};

export const persistConfig = (config: ThemeConfig) => {
  set(K.palette, config.palette);
  set(K.accent, config.accent);
  set(K.radius, config.radius);
  set(K.anim, config.anim);
};

/**
 * Apply the stored theme before React mounts.
 *
 * The shipped panel called loadTheme() from window.onload, which fires long
 * after first paint - so it visibly flashed the stylesheet defaults before the
 * user's theme landed. Running this at module scope in the entry file applies
 * the tokens before anything renders.
 */
export const applyStoredTheme = () => {
  clearLegacyConfig();
  applyConfig(loadConfig());
};

/**
 * Drop the version 1 top-level config.
 *
 * Nothing is carried forward, deliberately. The obvious migration - keep the
 * old gradient start colour as the new accent - is wrong here: #ff007f was the
 * *shipped default*, not a colour anyone picked, so migrating it would open
 * the redesign in the exact neon the redesign exists to remove, for every user
 * who had ever touched a theme control.
 *
 * Saved slots are the opposite case and do keep their accent - see
 * migrateSlot(). A slot was named and stored on purpose; a top-level config is
 * only wherever the sliders were last left.
 *
 * Self-terminating: once the keys are gone the early return fires, so this
 * costs one failed lookup per launch thereafter.
 */
const clearLegacyConfig = () => {
  try {
    if (localStorage.getItem(LEGACY_K.gradStart) === null) return;
    [LEGACY_K.bgColor, LEGACY_K.gradStart, LEGACY_K.gradEnd, LEGACY_K.angle]
      .forEach(remove);
  } catch {
    // Storage unavailable: defaults apply, which is the correct outcome.
  }
};

type StoredSlotV1 = {
  version?: number;
  bgColor?: string;
  gradStart?: string;
  gradEnd?: string;
  angle?: string;
  radius?: string;
  anim?: string;
};

type StoredSlotV2 = ThemeConfig & { version: number };

/**
 * Bring a stored slot up to the current shape.
 *
 * A named slot is an explicit user choice, so its accent is preserved even
 * though the rest of the version 1 payload describes a design that no longer
 * exists. The palette falls back to the default; there is no honest way to
 * infer which of the three a pre-redesign slot would have wanted.
 */
const migrateSlot = (parsed: StoredSlotV1 & Partial<StoredSlotV2>): ThemeConfig => {
  if (parsed.version === SLOT_VERSION) {
    return {
      palette: parsed.palette ?? DEFAULTS.palette,
      accent: parsed.accent ?? DEFAULTS.accent,
      radius: parsed.radius ?? DEFAULTS.radius,
      anim: parsed.anim ?? DEFAULTS.anim,
    };
  }
  return {
    palette: DEFAULTS.palette,
    accent: parsed.gradStart ?? DEFAULTS.accent,
    radius: parsed.radius ?? DEFAULTS.radius,
    anim: parsed.anim ?? DEFAULTS.anim,
  };
};

export const readSlot = (n: number): ThemeConfig | null => {
  try {
    const raw = localStorage.getItem(K.slot(n));
    if (!raw) return null;
    return migrateSlot(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeSlot = (n: number, config: ThemeConfig) =>
  set(K.slot(n), JSON.stringify({ version: SLOT_VERSION, ...config }));

export const readSlotName = (n: number) => get(K.slotName(n), `Slot ${n}`);
export const writeSlotName = (n: number, name: string) => set(K.slotName(n), name);

/** Clear theme keys. Slots and slot names are the user's and are left alone. */
export const resetAll = () => {
  [
    K.palette, K.accent, K.radius, K.anim, K.lastSlot,
    LEGACY_K.bgColor, LEGACY_K.gradStart, LEGACY_K.gradEnd, LEGACY_K.angle,
  ].forEach(remove);
};

export const LAYER_COLOURS = [
  "Red", "Yellow", "Aqua", "Pink", "Lavender", "Peach", "Sea Foam", "Blue",
  "Green", "Purple", "Orange", "Brown", "Fuchsia", "Cyan", "Sandstone",
  "Dark Green",
];
