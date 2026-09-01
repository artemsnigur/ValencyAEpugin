import { useEffect, useMemo, useState } from "react";
import { evalTS, selectFolder } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";
import {
  PresetEntry,
  PresetFolder,
  ROOT_KEY,
  loadFavouritePresets,
  loadLayerColour,
  saveFavouritePresets,
  scanPresetRoot,
  sortPresets,
} from "./presetLibrary";

type Target = 0 | 1 | 2;
type Duration = 0 | 1 | 2;

const FRAME_STEP = 5;

/**
 * Preset browser.
 *
 * Ported from #tab-presets in AutoEditRestored/index.html. The folder scan runs
 * panel-side on Node's fs; only applying a preset and opening AE's own save
 * dialog cross into the host layer.
 */
export const PresetBrowser = () => {
  const [root, setRoot] = useState(() => localStorage.getItem(ROOT_KEY) || "");
  const [folders, setFolders] = useState<PresetFolder[]>([]);
  const [presets, setPresets] = useState<PresetEntry[]>([]);
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState<string[]>(loadFavouritePresets);
  const [target, setTarget] = useState<Target>(0);
  const [duration, setDuration] = useState<Duration>(0);
  const [customFrames, setCustomFrames] = useState(10);
  const { busy, result, run } = useHostAction();

  const rescan = (next: string) => {
    const scanned = scanPresetRoot(next);
    setFolders(scanned.folders);
    setPresets(scanned.presets);
    setFolder(scanned.folders.length > 0 ? scanned.folders[0].path : "");
    setQuery("");
  };

  // The root is remembered under the shipped panel's key, so a folder chosen in
  // either panel is picked up by the other.
  useEffect(() => {
    if (root) rescan(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickRoot = () => {
    selectFolder(root || "~", "Select Root Presets Folder", (chosen) => {
      if (!chosen) return;
      setRoot(chosen);
      try {
        localStorage.setItem(ROOT_KEY, chosen);
      } catch {
        // Not fatal - the scan below still runs for this session.
      }
      rescan(chosen);
    });
  };

  const visible = useMemo(() => {
    const needle = query.toLowerCase().trim();
    const matched = needle
      ? presets.filter((p) => p.name.toLowerCase().includes(needle))
      : presets.filter((p) => p.folder === folder);
    return sortPresets(matched, favourites);
  }, [presets, folder, query, favourites]);

  const toggleFavourite = (presetPath: string) => {
    const next =
      favourites.indexOf(presetPath) > -1
        ? favourites.filter((p) => p !== presetPath)
        : favourites.concat(presetPath);
    setFavourites(next);
    saveFavouritePresets(next);
  };

  const apply = (presetPath: string) =>
    run("apply", () =>
      evalTS(
        "applyPreset",
        presetPath,
        target,
        duration,
        customFrames,
        loadLayerColour()
      )
    );

  const stepFrames = (delta: number) => {
    setCustomFrames((n) => Math.max(FRAME_STEP, n + delta));
    setDuration(2);
  };

  return (
    <div className="panel preset-panel">
      <div className="align-row" style={{ marginBottom: "12px", gap: "6px" }}>
        <button
          className="outline-btn pop-anim"
          style={{ flex: "0 0 32px", padding: 0 }}
          title="Select Root Folder"
          onClick={pickRoot}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <input
          type="text"
          className="styled-input pop-anim"
          placeholder="Search presets..."
          style={{ flex: 1, fontSize: "11px" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="grad-btn pop-anim"
          style={{ flex: "0 0 45px", padding: 0, fontSize: "10px" }}
          title="Save Selected Properties"
          onClick={() =>
            run("save", () =>
              evalTS("savePresetDialog").then((res) => {
                // The dialog writes a new .ffx; pick it up without a reload.
                if (res.ok && root) rescan(root);
                return res;
              })
            )
          }
          disabled={busy !== null}
        >
          Save
        </button>
      </div>

      <div className="align-row">
        <span className="row-label">Folder:</span>
        <select
          className="styled-select"
          style={{ flex: 1 }}
          value={folder}
          onChange={(e) => {
            setFolder(e.target.value);
            setQuery("");
          }}
        >
          {folders.map((f) => (
            <option key={f.path} value={f.path}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <span className="row-label" style={{ marginTop: "6px" }}>Apply:</span>
        <div className="custom-toggles">
          {(["Adj", "Solid", "Selected"] as const).map((label, i) => (
            <label key={label}>
              <input
                type="radio"
                name="p-type"
                checked={target === i}
                onChange={() => setTarget(i as Target)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <span className="row-label" style={{ marginTop: "6px" }}>Time:</span>
        <div className="custom-toggles" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label>
            <input
              type="radio"
              name="p-dur"
              checked={duration === 0}
              onChange={() => setDuration(0)}
            />
            <span>Match</span>
          </label>
          <label>
            <input
              type="radio"
              name="p-dur"
              checked={duration === 1}
              onChange={() => setDuration(1)}
            />
            <span>1 Frame</span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <label style={{ margin: 0 }}>
              <input
                type="radio"
                name="p-dur"
                checked={duration === 2}
                onChange={() => setDuration(2)}
              />
              <span style={{ width: "35px", textAlign: "center" }}>{customFrames}</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <button
                type="button"
                className="outline-btn pop-anim frame-step"
                onClick={() => stepFrames(FRAME_STEP)}
                aria-label="More frames"
              >
                ▲
              </button>
              <button
                type="button"
                className="outline-btn pop-anim frame-step"
                onClick={() => stepFrames(-FRAME_STEP)}
                aria-label="Fewer frames"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="preset-list">
        {visible.length === 0 ? (
          <i className="preset-list-empty">
            {root ? "No presets found" : "Pick a root presets folder to begin"}
          </i>
        ) : (
          visible.map((preset) => (
            <div
              key={preset.path}
              className="preset-item pop-anim"
              onClick={() => apply(preset.path)}
            >
              <span className="preset-name">{preset.name}</span>
              <span
                className={`preset-star${
                  favourites.indexOf(preset.path) > -1 ? " active-star" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavourite(preset.path);
                }}
              >
                ★
              </span>
            </div>
          ))
        )}
      </div>

      {result && result.message && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
};
