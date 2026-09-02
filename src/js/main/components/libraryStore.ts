import { fs, path } from "../../lib/cep/node";

export type LibEntry = { name: string; path: string };
export type FolderListing = { folders: LibEntry[]; files: LibEntry[] };
export type LibTab = {
  id: number;
  path: string;
  name: string;
  breadcrumbs: LibEntry[];
};

/** Same key names as the shipped panel; separate origins, separate stores.
    The cache *files* on disk are genuinely shared - see cachePathFor. */
export const KEYS = {
  roots: "valency.library.roots",
  favourites: "valency.library.favourites",
  hidden: "valency.library.hidden",
  cacheFolder: "valency.library.cache-folder",
  tabs: "valency.library.tabs",
  activeTab: "valency.library.active-tab",
  audioVolume: "valency.theme.audio-volume",
  gridSize: "valency.library.grid-size",
};

/** Extensions the shipped scanLibraryFolder accepted, carried over verbatim. */
const ALLOWED = [
  "mp4", "mov", "avi", "webm", "m4v", "mkv", "mxf",
  "mp3", "wav", "m4a", "aac", "flac", "aif", "aiff",
  "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "tga", "bmp",
  "psd", "psb", "ai", "eps", "pdf",
  "aep", "aepx", "ffx", "prproj", "c4d", "json", "csv",
];

export const extOf = (name: string) => name.split(".").pop()?.toLowerCase() || "";

export const VIDEO_EXTS = ["mp4", "webm", "ogg", "m4v"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "tga", "bmp"];
export const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "flac", "aif", "aiff"];

const posix = (p: string) => p.replace(/\\/g, "/");

/**
 * The shipped panel's cache-filename hash, kept bit-identical. Unlike the
 * localStorage keys, this genuinely is shared: the cache is files on disk, so
 * both panels read one another's listings once pointed at the same folder.
 */
export const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

/**
 * List one folder.
 *
 * The shipped panel did this in two halves: cep.fs.readdir for a bare name
 * list, then an evalScript round trip so ExtendScript's Folder.getFiles() could
 * classify each entry. Only the classification needed the round trip, and
 * Dirent.isDirectory() supplies it directly - so this is one syscall with no
 * bridge crossing, and scanLibraryFolder is gone from the host layer.
 *
 * withFileTypes needs Node >= 10.10 and CEP's bundled Node version varies, so
 * the per-entry statSync fallback stays for older runtimes.
 */
export const listFolder = (dir: string): FolderListing => {
  const folders: LibEntry[] = [];
  const files: LibEntry[] = [];

  const push = (name: string, isDir: boolean) => {
    if (name.charAt(0) === ".") return;
    const full = posix(path.join(dir, name));
    if (isDir) folders.push({ name, path: full });
    else if (ALLOWED.indexOf(extOf(name)) > -1) files.push({ name, path: full });
  };

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) push(entry.name, entry.isDirectory());
  } catch {
    try {
      for (const name of fs.readdirSync(dir)) {
        try {
          push(name, fs.statSync(path.join(dir, name)).isDirectory());
        } catch {
          // Unreadable entry: skip it rather than abandoning the folder.
        }
      }
    } catch {
      return { folders, files };
    }
  }

  return { folders, files };
};

const cachePathFor = (cacheFolder: string, dir: string) =>
  `${cacheFolder}/cache_${hashString(dir)}.json`;

export const readCachedListing = (
  cacheFolder: string,
  dir: string
): FolderListing | null => {
  if (!cacheFolder) return null;
  try {
    const raw = fs.readFileSync(cachePathFor(cacheFolder, dir), "utf8");
    const parsed = JSON.parse(raw) as FolderListing;
    if (!parsed || !Array.isArray(parsed.folders) || !Array.isArray(parsed.files)) {
      return null;
    }
    return parsed;
  } catch {
    // Missing, unreadable, or half-written: treat as a miss and rescan.
    return null;
  }
};

export const writeCachedListing = (
  cacheFolder: string,
  dir: string,
  listing: FolderListing
) => {
  if (!cacheFolder) return;
  try {
    fs.writeFileSync(cachePathFor(cacheFolder, dir), JSON.stringify(listing));
  } catch {
    // The cache is an optimisation; failing to write it must not break browsing.
  }
};

export const clearCache = (cacheFolder: string): number => {
  if (!cacheFolder) return 0;
  let removed = 0;
  try {
    for (const name of fs.readdirSync(cacheFolder)) {
      if (name.indexOf("cache_") === 0 && name.endsWith(".json")) {
        try {
          fs.unlinkSync(`${cacheFolder}/${name}`);
          removed++;
        } catch {
          // Leave the ones we cannot remove.
        }
      }
    }
  } catch {
    return removed;
  }
  return removed;
};

/**
 * Is a cached listing still accurate?
 *
 * KNOWN LIMITATION, ported as-is: this compares names only, exactly as the
 * shipped panel did. A file overwritten in place keeps its name, so a
 * re-rendered clip goes on showing its old preview indefinitely. Comparing
 * mtime as well would close it - see POST-PARITY.md.
 */
export const listingMatches = (dir: string, cached: FolderListing): boolean => {
  const fresh = listFolder(dir);
  const join = (l: FolderListing) =>
    l.folders
      .map((f) => f.name)
      .concat(l.files.map((f) => f.name))
      .sort()
      .join("|");
  return join(fresh) === join(cached);
};

export const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJSON = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Panel preferences are a convenience.
  }
};

/** file:// URL for a media element, matching the shipped panel's form. */
export const fileUrl = (p: string) =>
  p.startsWith("/") ? `file://${p}` : `file:///${p}`;

/**
 * Thumbnail grid size.
 *
 * The first-generation library UI had 2x2 / 3x3 / 4x4 radios; the rewrite that
 * replaced it dropped them and deleted their CSS too, which is why this reads
 * as collateral rather than a decision. The live grid already auto-fits, so
 * restoring the control is a matter of driving its minimum column width.
 *
 * More columns means a smaller minimum, hence the inverse mapping.
 */
export const GRID_SIZES = [
  { columns: 2, label: "2x2", min: 170 },
  { columns: 3, label: "3x3", min: 110 },
  { columns: 4, label: "4x4", min: 80 },
];

export const DEFAULT_GRID_COLUMNS = 3;

export const readGridColumns = (): number => {
  try {
    const stored = Number(localStorage.getItem(KEYS.gridSize));
    return GRID_SIZES.some((g) => g.columns === stored) ? stored : DEFAULT_GRID_COLUMNS;
  } catch {
    return DEFAULT_GRID_COLUMNS;
  }
};

export const thumbMinFor = (columns: number) =>
  (GRID_SIZES.find((g) => g.columns === columns) ||
    GRID_SIZES.find((g) => g.columns === DEFAULT_GRID_COLUMNS)!).min;
