/**
 * Theme tokens and persistence.
 *
 * Every value is stored as a **string**, because the shipped panel read them
 * straight off input `.value` and wrote them to localStorage unconverted. Both
 * panels share these keys, so the shapes have to match exactly for a theme
 * saved in one to load in the other.
 */
export type ThemeConfig = {
  bgColor: string;
  gradStart: string;
  gradEnd: string;
  radius: string;
  angle: string;
  anim: string;
  bgImage: string;
  bgType: string;
  bgBlur: string;
  bgOverlay: string;
  bgSize: string;
  bgHue: string;
  bgTime: string;
};

/** Same key names the shipped panel uses - format compatibility, not shared
    state; the two extensions have different origins. */
export const K = {
  bgColor: "bg-color",
  gradStart: "grad-start",
  gradEnd: "grad-end",
  radius: "radius",
  angle: "grad-angle",
  anim: "btn-anim",
  bgImage: "bg-image",
  bgType: "bg-type",
  bgBlur: "bg-blur",
  bgOverlay: "bg-overlay",
  bgSize: "bg-size",
  bgHue: "bg-hue",
  bgTime: "bg-time",
  audioVolume: "audio-volume",
  renderDevice: "render-device",
  renderPrefix: "render-prefix",
  layerColour: "layer-color",
  lastSlot: "last-active-slot",
  slot: (n: number) => `theme-slot-${n}`,
  slotName: (n: number) => `theme-name-${n}`,
};

/** loadTheme()'s own fallbacks, main.js:1161. */
export const DEFAULTS: ThemeConfig = {
  bgColor: "#121212",
  gradStart: "#ff007f",
  gradEnd: "#7f00ff",
  radius: "12",
  angle: "135deg",
  anim: "pop",
  bgImage: "",
  bgType: "image",
  bgBlur: "0",
  bgOverlay: "0.7",
  bgSize: "cover",
  bgHue: "0",
  bgTime: "0",
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
  bgColor: get(K.bgColor, DEFAULTS.bgColor),
  gradStart: get(K.gradStart, DEFAULTS.gradStart),
  gradEnd: get(K.gradEnd, DEFAULTS.gradEnd),
  radius: get(K.radius, DEFAULTS.radius),
  angle: get(K.angle, DEFAULTS.angle),
  anim: get(K.anim, DEFAULTS.anim),
  bgImage: get(K.bgImage, DEFAULTS.bgImage),
  bgType: get(K.bgType, DEFAULTS.bgType),
  bgBlur: get(K.bgBlur, DEFAULTS.bgBlur),
  bgOverlay: get(K.bgOverlay, DEFAULTS.bgOverlay),
  bgSize: get(K.bgSize, DEFAULTS.bgSize),
  bgHue: get(K.bgHue, DEFAULTS.bgHue),
  bgTime: get(K.bgTime, DEFAULTS.bgTime),
});

/**
 * Write one token.
 *
 * --glow is derived from --grad-start with a `66` alpha suffix, exactly as
 * updateTheme() did. It is NOT a stale value: the shipped panel keeps the glow
 * in step with the gradient through this same derivation on every apply.
 */
export const setToken = (name: string, value: string) => {
  const root = document.documentElement;
  root.style.setProperty(name, value);
  if (name === "--grad-start") {
    root.style.setProperty("--glow", `${value}66`);
  }
};

/** Apply a config to the document. Pure token writes, no React involved. */
export const applyConfig = (config: ThemeConfig) => {
  setToken("--bg-color", config.bgColor);
  setToken("--grad-start", config.gradStart);
  setToken("--grad-end", config.gradEnd);
  setToken("--radius", `${config.radius}px`);
  setToken("--grad-angle", config.angle);
  setToken("--bg-blur", `${config.bgBlur}px`);
  setToken("--bg-overlay", config.bgOverlay);
  setToken("--bg-size", config.bgSize);
  setToken("--bg-hue", `${config.bgHue}deg`);
  setToken(
    "--bg-image",
    config.bgImage && config.bgType !== "video"
      ? `url('file:///${config.bgImage}')`
      : "none"
  );
  document.body.setAttribute("data-anim", config.anim);
};

export const persistConfig = (config: ThemeConfig) => {
  set(K.bgColor, config.bgColor);
  set(K.gradStart, config.gradStart);
  set(K.gradEnd, config.gradEnd);
  set(K.radius, config.radius);
  set(K.angle, config.angle);
  set(K.anim, config.anim);
  set(K.bgBlur, config.bgBlur);
  set(K.bgOverlay, config.bgOverlay);
  set(K.bgSize, config.bgSize);
  set(K.bgHue, config.bgHue);
  set(K.bgTime, config.bgTime);
  if (config.bgImage) {
    set(K.bgImage, config.bgImage);
    set(K.bgType, config.bgType);
  } else {
    remove(K.bgImage);
    remove(K.bgType);
  }
};

/**
 * Apply the stored theme before React mounts.
 *
 * The shipped panel called loadTheme() from window.onload, which fires long
 * after first paint - so it visibly flashed the stylesheet defaults before the
 * user's theme landed. Running this at module scope in the entry file applies
 * the tokens before anything renders.
 */
export const applyStoredTheme = () => applyConfig(loadConfig());

export const readSlot = (n: number): ThemeConfig | null => {
  try {
    const raw = localStorage.getItem(K.slot(n));
    return raw ? (JSON.parse(raw) as ThemeConfig) : null;
  } catch {
    return null;
  }
};

export const writeSlot = (n: number, config: ThemeConfig) =>
  set(K.slot(n), JSON.stringify(config));

export const readSlotName = (n: number) => get(K.slotName(n), `Slot ${n}`);
export const writeSlotName = (n: number, name: string) => set(K.slotName(n), name);

/** Clear theme keys. Render device is preserved, as the shipped reset did. */
export const resetAll = () => {
  const device = get(K.renderDevice, "");
  [
    K.bgColor, K.gradStart, K.gradEnd, K.radius, K.angle, K.anim,
    K.bgImage, K.bgType, K.bgBlur, K.bgOverlay, K.bgSize, K.bgHue, K.bgTime,
    K.lastSlot,
  ].forEach(remove);
  if (device) set(K.renderDevice, device);
};

export const LAYER_COLOURS = [
  "Red", "Yellow", "Aqua", "Pink", "Lavender", "Peach", "Sea Foam", "Blue",
  "Green", "Purple", "Orange", "Brown", "Fuchsia", "Cyan", "Sandstone",
  "Dark Green",
];
