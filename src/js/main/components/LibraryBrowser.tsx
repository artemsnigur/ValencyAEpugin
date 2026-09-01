import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evalTS, selectFolder } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";
import { LibraryCard } from "./LibraryCard";
import {
  FolderListing,
  KEYS,
  LibEntry,
  LibTab,
  clearCache,
  listFolder,
  listingMatches,
  readCachedListing,
  readJSON,
  writeCachedListing,
  writeJSON,
} from "./libraryStore";

const HOME: LibTab = {
  id: 1,
  path: "",
  name: "Home",
  breadcrumbs: [{ name: "Home", path: "" }],
};

/**
 * Library browser.
 *
 * Ported from #tab-library in the shipped 1.4.0 markup. Folder listing runs
 * panel-side on Node's fs; only importing crosses into the host layer.
 */
export const LibraryBrowser = () => {
  const [roots, setRoots] = useState<LibEntry[]>(() => readJSON(KEYS.roots, []));
  const [favourites, setFavourites] = useState<string[]>(() => readJSON(KEYS.favourites, []));
  const [hidden, setHidden] = useState<string[]>(() => readJSON(KEYS.hidden, []));
  const [cacheFolder, setCacheFolder] = useState(
    () => localStorage.getItem(KEYS.cacheFolder) || ""
  );
  const [tabs, setTabs] = useState<LibTab[]>(() => readJSON(KEYS.tabs, [HOME]));
  const [activeId, setActiveId] = useState(() =>
    Number(localStorage.getItem(KEYS.activeTab) || 1)
  );
  const [listing, setListing] = useState<FolderListing>({ folders: [], files: [] });
  const [query, setQuery] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [playing, setPlaying] = useState("");
  // Re-keyed on every path change so the grid replays its fade, which is what
  // triggerGridAnimation() did by removing and re-adding the class.
  const [navKey, setNavKey] = useState(0);
  const { busy, result, run } = useHostAction();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== "undefined") audioRef.current = new Audio();

  const active = tabs.find((t) => t.id === activeId) || tabs[0] || HOME;

  useEffect(() => writeJSON(KEYS.tabs, tabs), [tabs]);
  useEffect(() => {
    try {
      localStorage.setItem(KEYS.activeTab, String(activeId));
    } catch {
      // Preference only.
    }
  }, [activeId]);

  // Read the cached listing first and show it, then verify against disk and
  // replace if it disagrees - the shipped panel's behaviour, including the
  // brief window where stale data is on screen.
  const loadPath = useCallback(
    (dir: string) => {
      if (!dir) {
        setListing({ folders: [], files: [] });
        return;
      }
      const cached = readCachedListing(cacheFolder, dir);
      if (cached) {
        setListing(cached);
        if (listingMatches(dir, cached)) return;
      }
      const fresh = listFolder(dir);
      setListing(fresh);
      writeCachedListing(cacheFolder, dir, fresh);
    },
    [cacheFolder]
  );

  useEffect(() => {
    loadPath(active.path);
    setQuery("");
    setNavKey((n) => n + 1);
  }, [active.path, loadPath]);

  const updateActiveTab = (patch: Partial<LibTab>) =>
    setTabs((all) => all.map((t) => (t.id === activeId ? { ...t, ...patch } : t)));

  const openFolder = (entry: LibEntry) =>
    updateActiveTab({
      path: entry.path,
      name: entry.name,
      breadcrumbs: active.breadcrumbs.concat(entry),
    });

  const jumpToCrumb = (index: number) => {
    const crumbs = active.breadcrumbs.slice(0, index + 1);
    const target = crumbs[crumbs.length - 1];
    updateActiveTab({ path: target.path, name: target.name, breadcrumbs: crumbs });
  };

  const addTab = () => {
    const id = Math.max(0, ...tabs.map((t) => t.id)) + 1;
    setTabs(tabs.concat({ ...HOME, id }));
    setActiveId(id);
  };

  const closeTab = (id: number) => {
    if (tabs.length === 1) return;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[next.length - 1].id);
  };

  const addRoot = () =>
    selectFolder("~", "Select Library Root Folder", (chosen) => {
      if (!chosen) return;
      const name = chosen.split(/[\\/]/).pop() || chosen;
      const next = roots.concat({ name, path: chosen.replace(/\\/g, "/") });
      setRoots(next);
      writeJSON(KEYS.roots, next);
    });

  const pickCacheFolder = () =>
    selectFolder(cacheFolder || "~", "Select Folder for Library Cache", (chosen) => {
      if (!chosen) return;
      setCacheFolder(chosen);
      try {
        localStorage.setItem(KEYS.cacheFolder, chosen);
      } catch {
        // Preference only.
      }
    });

  const toggleStar = (path: string) => {
    const next =
      favourites.indexOf(path) > -1
        ? favourites.filter((p) => p !== path)
        : favourites.concat(path);
    setFavourites(next);
    writeJSON(KEYS.favourites, next);
  };

  /**
   * Hide an item from the panel.
   *
   * Confirms first, as the original did - this destroys state with no visible
   * undo. Hiding a root also removes it from the roots list, again matching
   * the original.
   */
  const hide = (path: string, isRoot = false) => {
    if (!confirm("Hide this item from the script?")) return;
    const next = hidden.concat(path);
    setHidden(next);
    writeJSON(KEYS.hidden, next);
    if (isRoot) {
      const remaining = roots.filter((r) => r.path !== path);
      setRoots(remaining);
      writeJSON(KEYS.roots, remaining);
    }
  };

  const playAudio = (path: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === path) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying("");
      return;
    }
    audio.src = `file:///${path}`;
    const stored = localStorage.getItem(KEYS.audioVolume);
    audio.volume = stored !== null ? parseFloat(stored) : 0.5;
    audio.play().catch(() => setPlaying(""));
    setPlaying(path);
  };

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const atHome = active.path === "";
  const visible = useMemo(() => {
    const needle = query.toLowerCase().trim();
    const keep = (e: LibEntry) =>
      hidden.indexOf(e.path) === -1 &&
      (needle === "" || e.name.toLowerCase().includes(needle));
    const byFav = (a: LibEntry, b: LibEntry) => {
      const fa = favourites.indexOf(a.path) > -1;
      const fb = favourites.indexOf(b.path) > -1;
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return 0;
    };
    return {
      folders: (atHome ? roots : listing.folders).filter(keep).sort(byFav),
      files: (atHome ? [] : listing.files).filter(keep).sort(byFav),
    };
  }, [atHome, roots, listing, hidden, favourites, query]);

  return (
    <div className="panel preset-panel">
      <div className="lib-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`lib-tab${tab.id === activeId ? " active" : ""}`}
            onClick={() => setActiveId(tab.id)}
          >
            <span>{tab.name}</span>
            {tabs.length > 1 && (
              <span
                className="lib-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button className="lib-tab-add" onClick={addTab} title="New tab">+</button>
      </div>

      <div className="align-row" style={{ gap: "6px" }}>
        <button
          className="outline-btn pop-anim"
          style={{ flex: "0 0 32px", padding: 0 }}
          title="Add Root Folder"
          onClick={addRoot}
        >
          +
        </button>
        <input
          type="text"
          className="styled-input pop-anim"
          placeholder="Search files..."
          style={{ flex: 1, fontSize: "11px" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="outline-btn pop-anim lib-tool-text"
          onClick={pickCacheFolder}
        >
          Cache Folder
        </button>
        <button
          className="outline-btn pop-anim lib-tool-text"
          onClick={() => {
            // Confirm before, not report after - the original asked first, and
            // this deletes files with no undo.
            if (cacheFolder === "") return alert("Cache folder is not set.");
            if (!confirm("Are you sure you want to clear the library cache?")) return;
            clearCache(cacheFolder);
            alert("Cache cleared successfully!");
            loadPath(active.path);
          }}
        >
          Clear Cache
        </button>
        <button
          className={`outline-btn pop-anim lib-tool${deleteMode ? " active-tab" : ""}`}
          title="Hide items from script"
          onClick={() => setDeleteMode((d) => !d)}
        >
          ✕
        </button>
      </div>

      <div className="lib-breadcrumbs">
        {active.breadcrumbs.map((crumb, i) => (
          <span key={`${crumb.path}-${i}`}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <span className="crumb" onClick={() => jumpToCrumb(i)}>
              {crumb.name}
            </span>
          </span>
        ))}
      </div>

      <div className="presets-scroll-area">
        <div
          key={navKey}
          className={`library-grid folder-transition-in${
            deleteMode ? " delete-mode-active" : ""
          }`}
        >
          {visible.folders.map((folder) => (
            <div
              key={folder.path}
              className={`lib-item-container pop-anim${deleteMode ? " delete-target" : ""}`}
              title={folder.name}
              onClick={() =>
                deleteMode ? hide(folder.path, atHome) : openFolder(folder)
              }
            >
              <div
                className={`lib-folder${
                  favourites.some((f) => f.indexOf(`${folder.path}/`) === 0)
                    ? " folder-has-favs"
                    : ""
                }`}
              >
                <div
                  className={`lib-star${favourites.indexOf(folder.path) > -1 ? " active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(folder.path);
                  }}
                >
                  ★
                </div>
                <div
                  className="lib-import-seq pop-anim"
                  title="Import Image Sequences"
                  onClick={(e) => {
                    e.stopPropagation();
                    run("seq", () => evalTS("importSequences", folder.path));
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                </div>
                <svg className="folder-icon" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
              </div>
              <span className="lib-name">{folder.name}</span>
            </div>
          ))}

          {visible.files.map((file) => (
            <LibraryCard
              key={file.path}
              entry={file}
              favourite={favourites.indexOf(file.path) > -1}
              deleteMode={deleteMode}
              playing={playing === file.path}
              onToggleStar={toggleStar}
              onHide={hide}
              onImport={(p) => run("import", () => evalTS("importMedia", p))}
              onPlayAudio={playAudio}
            />
          ))}

          {visible.folders.length === 0 && visible.files.length === 0 && (
            <div className="lib-empty">
              {atHome && roots.length === 0
                ? "Add a root folder to begin."
                : cacheFolder === "" && !atHome
                ? "Folder is empty."
                : "Folder is empty."}
            </div>
          )}
        </div>
      </div>

      {result && result.message && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>{result.message}</p>
      )}
      {busy && <p className="panel-note is-active">Importing — After Effects is frozen.</p>}
    </div>
  );
};
