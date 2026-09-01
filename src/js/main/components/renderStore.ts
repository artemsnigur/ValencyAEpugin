import { csi } from "../../lib/utils/bolt";

/** Same key names as the shipped panel; separate origins, separate stores. */
export const KEYS = {
  favouriteTemplates: "valency.render.fav-templates",
  lastTemplate: "valency.render.last-template",
  autoImport: "valency.render.auto-import",
  autoWorkArea: "valency.render.auto-workarea",
  specificFolder: "valency.render.specific-folder",
  paths: "valency.render.paths",
  /** Written by the theme tab in step 09; read here with the shipped default. */
  prefix: "valency.render.prefix",
};

const read = (key: string, fallback = "") => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Panel preferences are a convenience, not worth failing an action over.
  }
};

export const readBool = (key: string) => read(key) === "true";
export const readPrefix = () => read(KEYS.prefix) || "autorender";

export const readPaths = (): string[] => {
  try {
    const parsed = JSON.parse(read(KEYS.paths) || '["","",""]');
    return Array.isArray(parsed) ? parsed : ["", "", ""];
  } catch {
    return ["", "", ""];
  }
};

export const readFavouriteTemplates = (): string[] => {
  try {
    return JSON.parse(read(KEYS.favouriteTemplates) || "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * Template cache, keyed to the After Effects version.
 *
 * Output module templates live in AE's preferences, not the project, so a
 * template added outside the panel is invisible to a cache. The cache is
 * therefore only a fallback for the one case where reading the real list would
 * modify the project; whenever the render queue is non-empty the read is free
 * and the cache is refreshed silently. Keying on the version stops a stale list
 * carrying across an upgrade.
 */
const cacheKey = () => {
  let version = "unknown";
  try {
    version = JSON.parse(csi.getHostEnvironment() as string).appVersion || "unknown";
  } catch {
    // Outside CEP (browser preview) there is no host environment.
  }
  return `valency.render.templates-cache-${version}`;
};

export const readCachedTemplates = (): string[] | null => {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

export const writeCachedTemplates = (templates: string[]) => {
  if (templates.length === 0) return;
  write(cacheKey(), JSON.stringify(templates));
};

/** Favourites first, each group alphabetical; _HIDDEN templates are dropped. */
export const splitTemplates = (all: string[], favourites: string[]) => {
  const visible = all.filter((t) => t.indexOf("_HIDDEN") === -1);
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    favourites: visible.filter((t) => favourites.indexOf(t) > -1).sort(byName),
    rest: visible.filter((t) => favourites.indexOf(t) === -1).sort(byName),
  };
};

/** The shipped panel shows only the trailing folder name, truncated at 15. */
export const shortPath = (full: string) => {
  const leaf = full.split(/[\\/]/).pop() || "";
  return leaf.length > 15 ? `${leaf.substring(0, 15)}...` : leaf;
};
