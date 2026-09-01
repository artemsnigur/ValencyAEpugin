import { useCallback, useEffect, useState } from "react";
import { evalTS, selectFolder } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";
import {
  KEYS,
  readBool,
  readCachedTemplates,
  readFavouriteTemplates,
  readPaths,
  readPrefix,
  shortPath,
  splitTemplates,
  write,
  writeCachedTemplates,
} from "./renderStore";

/**
 * Render queue.
 *
 * Ported from the first panel of #tab-render in the shipped 1.4.0 markup.
 * The Remove Unused Footage / Organize panel below it landed in step 03.
 */
export const RenderQueue = () => {
  const [templates, setTemplates] = useState<string[]>(
    () => readCachedTemplates() || []
  );
  const [favourites, setFavourites] = useState<string[]>(readFavouriteTemplates);
  const [selected, setSelected] = useState(
    () => localStorage.getItem(KEYS.lastTemplate) || ""
  );
  const [autoImport, setAutoImport] = useState(() => readBool(KEYS.autoImport));
  const [autoWorkArea, setAutoWorkArea] = useState(() => readBool(KEYS.autoWorkArea));
  const [specificFolder, setSpecificFolder] = useState(() =>
    readBool(KEYS.specificFolder)
  );
  const [paths, setPaths] = useState<string[]>(readPaths);
  const [pathIndex, setPathIndex] = useState(0);
  const [spin, setSpin] = useState(0);
  const { busy, result, run } = useHostAction();

  /**
   * Refresh the template list.
   *
   * Reading is free whenever the render queue already has an item, so that path
   * runs on every visit and keeps the cache current. When the queue is empty the
   * read would modify the project irreversibly, so it falls back to the cache
   * and only pays that cost when there is nothing cached, or when the user asks
   * for it explicitly with the refresh button.
   */
  const loadTemplates = useCallback((allowDirty: boolean) => {
    evalTS("getRenderTemplates", allowDirty)
      .then((res) => {
        if (res.needsDirty) return; // Queue empty and not allowed to dirty.
        if (res.templates.length === 0) return;
        setTemplates(res.templates);
        writeCachedTemplates(res.templates);
      })
      .catch(() => {
        // Leave whatever the cache gave us.
      });
  }, []);

  useEffect(() => {
    if (readCachedTemplates()) loadTemplates(false);
    else loadTemplates(true); // First ever use: nothing cached to fall back on.
  }, [loadTemplates]);

  const groups = splitTemplates(templates, favourites);
  const isFavourite = favourites.indexOf(selected) > -1;

  const chooseTemplate = (name: string) => {
    setSelected(name);
    write(KEYS.lastTemplate, name);
  };

  const toggleFavourite = () => {
    if (!selected) return;
    const next = isFavourite
      ? favourites.filter((t) => t !== selected)
      : favourites.concat(selected);
    setFavourites(next);
    write(KEYS.favouriteTemplates, JSON.stringify(next));
  };

  const setDestFolder = (index: number) => {
    selectFolder(paths[index] || "~", "Select Render Destination", (chosen) => {
      if (!chosen) return;
      const next = paths.slice();
      next[index] = chosen;
      setPaths(next);
      setPathIndex(index);
      write(KEYS.paths, JSON.stringify(next));
    });
  };

  const render = () =>
    run("render", () =>
      evalTS("startRender", {
        templateName: selected,
        useSpecificFolder: specificFolder,
        // Normalised to forward slashes. The original did the same replace, but
        // as escaping - the path was being pasted into a JS string literal
        // where a Windows backslash became an escape sequence. evalTS encodes
        // arguments properly, so this is now purely path normalisation for the
        // host's `destPath + "/" + name` concatenation.
        destPath: (paths[pathIndex] || "").replace(/\\/g, "/"),
        autoImport,
        autoWorkArea,
        renderPrefix: readPrefix(),
      })
    );

  return (
    <div className="panel">
      <h3 style={{ textAlign: "center", marginBottom: "5px" }}>Render Templates</h3>
      <p className="panel-hint">Select a template and click ★ to favorite it</p>

      <div className="align-row" style={{ marginBottom: "15px" }}>
        <select
          className="styled-select"
          style={{ flex: 1, minWidth: 0 }}
          value={selected}
          onChange={(e) => chooseTemplate(e.target.value)}
        >
          {groups.favourites.map((t) => (
            <option key={`fav-${t}`} value={t}>{`★ ${t}`}</option>
          ))}
          {groups.favourites.length > 0 && groups.rest.length > 0 && (
            <option disabled className="select-separator" value="" />
          )}
          {groups.rest.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          className="fav-star pop-anim render-icon-btn"
          title="Refresh Templates"
          onClick={() => {
            setSpin((s) => s + 360);
            loadTemplates(true);
          }}
          style={{ transform: `rotate(${spin}deg)` }}
        >
          ⟳
        </button>
        <button
          className={`fav-star pop-anim render-icon-btn${isFavourite ? " active" : ""}`}
          title="Add to Favorites"
          onClick={toggleFavourite}
        >
          ★
        </button>
      </div>

      <div className="custom-toggles flex-col">
        {[
          { label: "Auto-Import after render", value: autoImport, set: setAutoImport, key: KEYS.autoImport },
          { label: "Auto-set Work Area", value: autoWorkArea, set: setAutoWorkArea, key: KEYS.autoWorkArea },
          { label: "Render to specific folder", value: specificFolder, set: setSpecificFolder, key: KEYS.specificFolder },
        ].map((box) => (
          <label className="check-full" key={box.key}>
            <input
              type="checkbox"
              checked={box.value}
              onChange={(e) => {
                box.set(e.target.checked);
                write(box.key, String(e.target.checked));
              }}
            />
            <span>{box.label}</span>
          </label>
        ))}
      </div>

      <div className={`dest-folders${specificFolder ? "" : " disabled"}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`folder-row${pathIndex === i ? " active-row" : ""}`}>
            <label className="custom-toggles" style={{ flex: 1 }}>
              <input
                type="radio"
                name="r-folder"
                checked={pathIndex === i}
                onChange={() => setPathIndex(i)}
              />
              <span className="path-text">{paths[i] ? shortPath(paths[i]) : "Not set..."}</span>
            </label>
            <button
              type="button"
              className="outline-btn pop-anim folder-btn"
              onClick={() => setDestFolder(i)}
            >
              ...
            </button>
          </div>
        ))}
      </div>

      <button
        className="grad-btn pop-anim full-width render-btn"
        onClick={render}
        disabled={busy !== null}
      >
        {busy ? "RENDERING…" : "RENDER"}
      </button>

      <p className={`panel-note${busy ? " is-active" : ""}`}>
        {busy
          ? "Rendering — After Effects is frozen. Don't quit."
          : "After Effects freezes while rendering."}
      </p>

      {result && result.message && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
};
