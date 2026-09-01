import { fs, path } from "../../lib/cep/node";

export type PresetEntry = { name: string; path: string; folder: string };
export type PresetFolder = { name: string; path: string };

/** Same localStorage keys the shipped panel uses, so both share their state. */
export const ROOT_KEY = "saved-preset-folder-path";
export const FAVOURITES_KEY = "fav-presets";
/** Written by the theme tab in step 09; read here with the shipped default. */
export const LAYER_COLOUR_KEY = "layer-color";

const posix = (p: string) => p.replace(/\\/g, "/");

/**
 * Scan a preset root: the root itself plus its immediate subfolders, and every
 * .ffx inside each.
 *
 * This runs panel-side on Node's fs rather than through the host layer. The
 * original had a scanPresetFolders ExtendScript function for the folder list
 * and then did the .ffx listing panel-side with cep.fs.readdir anyway - none of
 * it touches the After Effects DOM, so per CLAUDE.md none of it belongs in
 * src/jsx.
 */
export const scanPresetRoot = (
  root: string
): { folders: PresetFolder[]; presets: PresetEntry[] } => {
  const folders: PresetFolder[] = [];
  const presets: PresetEntry[] = [];
  if (!root) return { folders, presets };

  let rootEntries: string[];
  try {
    if (!fs.existsSync(root)) return { folders, presets };
    rootEntries = fs.readdirSync(root);
  } catch {
    return { folders, presets };
  }

  const dirs = [{ name: path.basename(root), path: posix(root) }];
  for (const entry of rootEntries) {
    const full = path.join(root, entry);
    try {
      if (fs.statSync(full).isDirectory()) {
        dirs.push({ name: entry, path: posix(full) });
      }
    } catch {
      // Unreadable entry - skip it rather than abandoning the whole scan.
    }
  }

  for (const dir of dirs) {
    folders.push(dir);
    try {
      for (const file of fs.readdirSync(dir.path)) {
        if (file.toLowerCase().endsWith(".ffx")) {
          presets.push({
            name: file.replace(/\.ffx$/i, ""),
            path: `${dir.path}/${file}`,
            folder: dir.path,
          });
        }
      }
    } catch {
      // Same: a folder we cannot read contributes nothing.
    }
  }

  return { folders, presets };
};

export const loadFavouritePresets = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FAVOURITES_KEY) || "[]") as string[];
  } catch {
    return [];
  }
};

export const saveFavouritePresets = (paths: string[]) => {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(paths));
  } catch {
    // Favourites are a convenience, not worth failing a click over.
  }
};

export const loadLayerColour = (): number => {
  try {
    const stored = localStorage.getItem(LAYER_COLOUR_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
};

/** Favourites first, then alphabetical - the shipped sort order. */
export const sortPresets = (entries: PresetEntry[], favourites: string[]) =>
  entries.slice().sort((a, b) => {
    const favA = favourites.indexOf(a.path) > -1;
    const favB = favourites.indexOf(b.path) > -1;
    if (favA && !favB) return -1;
    if (!favA && favB) return 1;
    return a.name.localeCompare(b.name);
  });
