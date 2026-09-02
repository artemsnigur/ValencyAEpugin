import { useEffect, useRef, useState } from "react";
import { evalTS } from "../../lib/utils/bolt";

/** Injected from package.json at build time rather than hardcoded. */
const APP_VERSION = __APP_VERSION__;
import {
  DEFAULTS,
  K,
  LAYER_COLOURS,
  ThemeConfig,
  applyConfig,
  loadConfig,
  persistConfig,
  readSlot,
  readSlotName,
  resetAll,
  set,
  setToken,
  writeSlot,
  writeSlotName,
} from "./themeStore";

const SLOTS = [1, 2, 3, 4, 5, 6];
const BG_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "ogg"];
const VIDEO_EXTS = ["mp4", "webm", "ogg"];

/**
 * Theme panel.
 *
 * Ported from the first panel of #tab-theme in the shipped 1.4.0 markup. The
 * Support & License panel below it belongs to step 10.
 *
 * This tab also owns three settings the other tabs read: Layer Clr (presets),
 * Prefix (render) and Render device. All three use the shipped panel's keys.
 */
export const ThemePanel = () => {
  const [config, setConfig] = useState<ThemeConfig>(loadConfig);
  const [mode, setMode] = useState<"none" | "save" | "rename">("none");
  const [activeSlot, setActiveSlot] = useState(
    () => localStorage.getItem(K.lastSlot) || ""
  );
  const [slotNames, setSlotNames] = useState<string[]>(() =>
    SLOTS.map((n) => readSlotName(n))
  );
  const [savedFlash, setSavedFlash] = useState<number | null>(null);
  const [volume, setVolume] = useState(
    () => localStorage.getItem(K.audioVolume) || "0.5"
  );
  const [prefix, setPrefix] = useState(
    () => localStorage.getItem(K.renderPrefix) || "autorender"
  );
  const [layerColour, setLayerColour] = useState(
    () => localStorage.getItem(K.layerColour) || "1"
  );
  const [engine, setEngine] = useState("cpu");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    evalTS("getProjectRenderEngine").then(setEngine).catch(() => setEngine("cpu"));
  }, []);

  /** Change one field: apply the token, persist, and keep state in step. */
  const update = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    applyConfig(next);
    persistConfig(next);
  };

  const loadSlot = (n: number) => {
    const stored = readSlot(n);
    if (!stored) return;
    const merged = { ...DEFAULTS, ...stored };
    setConfig(merged);
    applyConfig(merged);
    persistConfig(merged);
    set(K.lastSlot, String(n));
    setActiveSlot(String(n));
  };

  const clickSlot = (n: number) => {
    if (mode === "save") {
      writeSlot(n, config);
      set(K.lastSlot, String(n));
      setActiveSlot(String(n));
      setSavedFlash(n);
      setTimeout(() => setSavedFlash(null), 800);
      setMode("none");
      return;
    }
    if (mode === "rename") {
      const name = prompt(`Name for Slot ${n}:`, slotNames[n - 1]);
      if (name && name.trim() !== "") {
        writeSlotName(n, name.trim());
        setSlotNames((all) => all.map((v, i) => (i === n - 1 ? name.trim() : v)));
      }
      setMode("none");
      return;
    }
    loadSlot(n);
  };

  const chooseBackground = () => {
    const dialog =
      window.cep?.fs?.showOpenDialogEx || window.cep?.fs?.showOpenDialog;
    if (!dialog) return;
    const res = dialog(false, false, "Select Background Media", "", BG_EXTS) as {
      data?: string[];
    };
    const picked = res?.data?.[0];
    if (!picked) return;
    const path = decodeURIComponent(picked.replace("file://", "")).replace(/\\/g, "/");
    const ext = path.split(".").pop()?.toLowerCase() || "";
    update2({
      bgImage: path,
      bgType: VIDEO_EXTS.indexOf(ext) > -1 ? "video" : "image",
    });
  };

  const update2 = (patch: Partial<ThemeConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    applyConfig(next);
    persistConfig(next);
  };

  const isVideo = config.bgType === "video" && config.bgImage !== "";

  // Keep the background video element in step with the config.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isVideo) {
      const wanted = `file:///${config.bgImage}`;
      if (el.src !== wanted) el.src = wanted;
      el.currentTime = Number(config.bgTime) || 0;
      el.play().catch(() => {
        // Autoplay can be refused; the still frame is still shown.
      });
    } else if (el.src) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  }, [isVideo, config.bgImage, config.bgTime]);

  const row = (label: string, control: React.ReactNode, wide = false) => (
    <div className="align-row">
      <span className="row-label" style={wide ? { width: "60px" } : undefined}>{label}</span>
      {control}
    </div>
  );

  return (
    <>
      {isVideo && (
        <video ref={videoRef} id="bg-video" autoPlay loop muted playsInline />
      )}

      <div className="panel compact-panel">
        <h3 style={{ textAlign: "center" }}>Saved Themes</h3>
        <p className="panel-hint" style={{ marginBottom: "6px" }}>
          Click slot to Load Theme
        </p>

        <div className="grid-buttons theme-slot-grid">
          {SLOTS.map((n) => (
            <button
              key={n}
              className="outline-btn pop-anim theme-slot"
              style={
                activeSlot === String(n)
                  ? { borderColor: config.gradStart }
                  : undefined
              }
              onClick={() => clickSlot(n)}
            >
              {savedFlash === n ? "Saved!" : slotNames[n - 1]}
            </button>
          ))}
        </div>

        <div className="flex-buttons" style={{ marginBottom: "15px" }}>
          <button
            className={`outline-btn pop-anim dashed${mode === "save" ? " action-active" : ""}`}
            onClick={() => setMode(mode === "save" ? "none" : "save")}
          >
            {mode === "save" ? "Click a slot to Save..." : "Save Theme"}
          </button>
          <button
            className={`outline-btn pop-anim dashed${mode === "rename" ? " action-active" : ""}`}
            onClick={() => setMode(mode === "rename" ? "none" : "rename")}
          >
            {mode === "rename" ? "Click a slot to Rename..." : "Rename Slot"}
          </button>
        </div>

        <h3 style={{ textAlign: "center" }}>UI Settings</h3>

        <div className="align-row">
          <span className="row-label">Bg Color:</span>
          <input
            type="color"
            value={config.bgColor}
            onChange={(e) => update("bgColor", e.target.value)}
          />
          <span className="row-label" style={{ marginLeft: "10px" }}>Radius:</span>
          <input
            type="range" min="0" max="20" style={{ flex: 1 }}
            value={config.radius}
            onChange={(e) => update("radius", e.target.value)}
          />
        </div>

        {row("Anim:", (
          <select
            className="styled-select" style={{ flex: 1 }}
            value={config.anim}
            onChange={(e) => update("anim", e.target.value)}
          >
            <option value="pop">Classic Pop</option>
            <option value="elastic">Elastic Bounce</option>
            <option value="glow">Liquid Glass</option>
          </select>
        ))}

        <div className="align-row">
          <span className="row-label">Colors:</span>
          <input
            type="color"
            value={config.gradStart}
            onChange={(e) => update("gradStart", e.target.value)}
          />
          <input
            type="color" style={{ marginRight: "auto" }}
            value={config.gradEnd}
            onChange={(e) => update("gradEnd", e.target.value)}
          />
        </div>

        <div className="flex-buttons" style={{ marginTop: "10px", marginBottom: "15px" }}>
          <button className="outline-btn pop-anim" style={{ fontSize: "11px", flex: 1 }}
            onClick={() => update("angle", "135deg")}>↘ Diagonal (L-R)</button>
          <button className="outline-btn pop-anim" style={{ fontSize: "11px", flex: 1 }}
            onClick={() => update("angle", "-135deg")}>↙ Diagonal (R-L)</button>
        </div>

        <h3 style={{ textAlign: "center", marginTop: "15px" }}>Custom Background</h3>

        <div className="flex-buttons" style={{ marginBottom: "8px" }}>
          <button className="outline-btn pop-anim" style={{ flex: 2 }} onClick={chooseBackground}>
            Choose Image/Video
          </button>
          <button
            className="outline-btn pop-anim" style={{ flex: 1 }}
            onClick={() => update2({ bgImage: "", bgType: "image" })}
          >
            Clear
          </button>
        </div>

        {isVideo &&
          row("Time:", (
            <input
              type="range" min="0" max="100" step="0.1" style={{ flex: 1 }}
              title="Video Start Time"
              value={config.bgTime}
              onChange={(e) => update("bgTime", e.target.value)}
            />
          ))}

        {row("Fit:", (
          <select className="styled-select" style={{ flex: 1 }}
            value={config.bgSize} onChange={(e) => update("bgSize", e.target.value)}>
            <option value="cover">Cover (Fill)</option>
            <option value="contain">Contain (Fit)</option>
          </select>
        ))}

        {row("Blur:", (
          <input type="range" min="0" max="30" style={{ flex: 1 }}
            value={config.bgBlur} onChange={(e) => update("bgBlur", e.target.value)} />
        ))}
        {row("Dim:", (
          <input type="range" min="0" max="1" step="0.05" style={{ flex: 1 }}
            value={config.bgOverlay} onChange={(e) => update("bgOverlay", e.target.value)} />
        ))}
        {row("Hue:", (
          <input type="range" min="0" max="360" style={{ flex: 1 }}
            value={config.bgHue} onChange={(e) => update("bgHue", e.target.value)} />
        ))}

        <h3 style={{ textAlign: "center", marginTop: "15px" }}>Preferences</h3>

        {row("Volume:", (
          <input
            type="range" min="0" max="1" step="0.05" style={{ flex: 1 }}
            value={volume}
            onChange={(e) => {
              setVolume(e.target.value);
              set(K.audioVolume, e.target.value);
            }}
          />
        ), true)}

        {row("Prefix:", (
          <input
            type="text" className="styled-input" style={{ flex: 1 }}
            value={prefix}
            onChange={(e) => {
              setPrefix(e.target.value);
              set(K.renderPrefix, e.target.value);
            }}
          />
        ), true)}

        {row("Layer Clr:", (
          <select
            className="styled-select" style={{ flex: 1 }}
            value={layerColour}
            onChange={(e) => {
              setLayerColour(e.target.value);
              set(K.layerColour, e.target.value);
            }}
          >
            {LAYER_COLOURS.map((name, i) => (
              <option key={name} value={String(i + 1)}>{name}</option>
            ))}
          </select>
        ), true)}

        <button
          className="outline-btn pop-anim full-width"
          style={{ marginTop: "15px" }}
          onClick={() => {
            resetAll();
            setConfig(DEFAULTS);
            applyConfig(DEFAULTS);
            setActiveSlot("");
          }}
        >
          Reset All Settings
        </button>

        <p className="panel-hint" style={{ marginTop: "10px", marginBottom: 0 }}>
          Project render engine: {engine.toUpperCase()} · Valency {APP_VERSION}
        </p>
      </div>
    </>
  );
};
