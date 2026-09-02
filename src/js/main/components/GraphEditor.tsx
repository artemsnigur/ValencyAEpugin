import { useCallback, useEffect, useRef, useState } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";
import {
  BUILTIN_PRESETS,
  GraphPreset,
  Point,
  loadFavourites,
  samePreset,
  saveFavourites,
} from "./graphPresets";

/** Handles travel outside the 0..100 box on both axes, as in the original. */
const clampPoint = (x: number, y: number): Point => ({
  x: Math.max(0, Math.min(100, x)),
  y: Math.max(-50, Math.min(150, y)),
});

const PRESET_TWEEN_MS = 350;

/** Smallest either panel may be squeezed to while dragging the splitter. */
const SPLITTER_MIN_PANEL = 130;

/**
 * The split is stored as a fraction of the container, not a pixel height.
 *
 * Pixels were clamped only inside the drag handler, so nothing re-clamped them
 * when the panel itself changed size: shrink the panel and a stored 400px top
 * pane ends up taller than its container, squeezing the preset grid to nothing.
 * A fraction survives any resize by construction and needs no observer.
 *
 * New key deliberately - a stored pixel value read as a fraction would be
 * nonsense, and nobody outside this machine has one.
 */
const TOP_FRACTION_KEY = "valency.graph.top-fraction";

const curvePath = (p1: Point, p2: Point) =>
  `M 0 100 C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, 100 0`;

/**
 * Bezier graph editor.
 *
 * Ported from #tab-graph in the shipped 1.4.0 markup and the drag, preset
 * and favourite handling in main.js. Every DOM lookup the original made at
 * module load (svgGraph, dot1/2, hitbox1/2, line1/2, curve, starBtn,
 * presetsContainer) is a ref or state here.
 */
export const GraphEditor = () => {
  const [p1, setP1] = useState<Point>({ x: 33, y: 100 });
  const [p2, setP2] = useState<Point>({ x: 66, y: 0 });
  const [dragging, setDragging] = useState<1 | 2 | null>(null);
  const [tab, setTab] = useState<"builtin" | "favs">("builtin");
  const [favourites, setFavourites] = useState<GraphPreset[]>(loadFavourites);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const tweenRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [topFraction, setTopFraction] = useState<number | null>(() => {
    try {
      const stored = Number(localStorage.getItem(TOP_FRACTION_KEY));
      return stored > 0 && stored < 1 ? stored : null;
    } catch {
      return null;
    }
  });
  const [splitting, setSplitting] = useState(false);
  const { busy, result, run } = useHostAction();

  const isFavourite = favourites.some((f) => samePreset(f, p1, p2));

  const pointFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return clampPoint(
      ((e.clientX - box.left) / box.width) * 100,
      ((e.clientY - box.top) / box.height) * 100
    );
  }, []);

  const cancelTween = () => {
    if (tweenRef.current !== null) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
  };

  // Grab whichever handle is nearer the click, and move it there immediately.
  const onSvgMouseDown = (e: React.MouseEvent) => {
    cancelTween();
    const pos = pointFromEvent(e);
    if (!pos) return;
    const d1 = Math.hypot(pos.x - p1.x, pos.y - p1.y);
    const d2 = Math.hypot(pos.x - p2.x, pos.y - p2.y);
    if (d1 <= d2) {
      setDragging(1);
      setP1(pos);
    } else {
      setDragging(2);
      setP2(pos);
    }
    setSelectedSlot(null);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const pos = pointFromEvent(e);
      if (!pos) return;
      if (dragging === 1) setP1(pos);
      else setP2(pos);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, pointFromEvent]);

  useEffect(() => cancelTween, []);

  // Splitter. The original measured against the tab element and persisted the
  // top panel's height; the measurement is against this component's root here,
  // which is the same box.
  useEffect(() => {
    if (!splitting) return;
    const onMove = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const box = root.getBoundingClientRect();
      if (box.height <= SPLITTER_MIN_PANEL * 2) return;
      // Clamp in pixels, store as a fraction: the minimum is a real physical
      // size, but what is persisted has to survive the container changing.
      const px = Math.min(
        Math.max(e.clientY - box.top, SPLITTER_MIN_PANEL),
        box.height - SPLITTER_MIN_PANEL
      );
      setTopFraction(px / box.height);
    };
    const onUp = () => {
      setSplitting(false);
      setTopFraction((current) => {
        try {
          if (current !== null) {
            localStorage.setItem(TOP_FRACTION_KEY, String(current));
          }
        } catch {
          // Persisting the split is a convenience, not worth failing over.
        }
        return current;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [splitting]);

  // Ease the handles to a preset over 350ms with the original's cubic curve.
  const loadPreset = (preset: GraphPreset, slot: number) => {
    cancelTween();
    setSelectedSlot(slot);
    const from1 = p1;
    const from2 = p2;
    const start = performance.now();

    const tick = () => {
      const t = Math.min((performance.now() - start) / PRESET_TWEEN_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setP1({
        x: from1.x + (preset.p1.x - from1.x) * eased,
        y: from1.y + (preset.p1.y - from1.y) * eased,
      });
      setP2({
        x: from2.x + (preset.p2.x - from2.x) * eased,
        y: from2.y + (preset.p2.y - from2.y) * eased,
      });
      tweenRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    tweenRef.current = requestAnimationFrame(tick);
  };

  const toggleFavourite = () => {
    const next = isFavourite
      ? favourites.filter((f) => !samePreset(f, p1, p2))
      : favourites.concat({
          name: `Saved Preset ${favourites.length + 1}`,
          p1: { x: p1.x, y: p1.y },
          p2: { x: p2.x, y: p2.y },
        });
    setFavourites(next);
    saveFavourites(next);
  };

  const deleteFavourite = (index: number) => {
    if (!confirm("Delete this preset?")) return;
    const next = favourites.filter((_, i) => i !== index);
    setFavourites(next);
    saveFavourites(next);
  };

  // Normalised to 0..1 with the origin at the bottom-left, rounded to 4
  // decimals exactly as the original did before stringifying the call.
  const apply = () => {
    const round4 = (n: number) => Number(n.toFixed(4));
    run("apply", () =>
      evalTS(
        "applyGraphToKeys",
        round4(p1.x / 100),
        round4((100 - p1.y) / 100),
        round4(p2.x / 100),
        round4((100 - p2.y) / 100)
      )
    );
  };

  const shown = tab === "builtin" ? BUILTIN_PRESETS : favourites;

  // flex-basis as a percentage rather than a pixel height: the pane keeps its
  // proportion at any container size, and the minimums stop either pane
  // collapsing when the panel gets very short.
  const topPanelStyle =
    topFraction !== null
      ? {
          flex: `0 0 ${(topFraction * 100).toFixed(3)}%`,
          marginBottom: 0,
          minHeight: `${SPLITTER_MIN_PANEL}px`,
        }
      : { flex: 1, marginBottom: 0, minHeight: "120px" };

  return (
    <div className="graph-tab" ref={rootRef}>
      <div className="panel" style={topPanelStyle}>
        <div className="graph-wrapper">
          <svg
            ref={svgRef}
            id="graph-svg"
            viewBox="0 0 100 100"
            onMouseDown={onSvgMouseDown}
          >
            <defs>
              <linearGradient id="line-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#777777" />
              </linearGradient>
              <linearGradient id="theme-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--grad-start)" />
                <stop offset="100%" stopColor="var(--grad-end)" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="100" height="100" className="graph-frame" />
            {[25, 50, 75].map((v) => (
              <line key={`v${v}`} x1={v} y1="0" x2={v} y2="100" className="grid-line" />
            ))}
            {[25, 50, 75].map((h) => (
              <line key={`h${h}`} x1="0" y1={h} x2="100" y2={h} className="grid-line" />
            ))}

            <line className="handle-line" x1="0" y1="100" x2={p1.x} y2={p1.y} />
            <line className="handle-line" x1="100" y1="0" x2={p2.x} y2={p2.y} />
            <path
              className="main-curve"
              stroke="url(#line-grad)"
              d={curvePath(p1, p2)}
            />
            <circle
              className={`handle-hitbox${dragging === 1 ? " active" : ""}`}
              cx={p1.x}
              cy={p1.y}
              r="15"
            />
            <circle className="handle-dot" cx={p1.x} cy={p1.y} r="1.5" />
            <circle
              className={`handle-hitbox${dragging === 2 ? " active" : ""}`}
              cx={p2.x}
              cy={p2.y}
              r="15"
            />
            <circle className="handle-dot" cx={p2.x} cy={p2.y} r="1.5" />
          </svg>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexShrink: 0 }}>
          <button
            className="grad-btn pop-anim"
            style={{ flex: 1, height: "36px", fontSize: "13px", letterSpacing: "1px" }}
            onClick={apply}
            disabled={busy !== null}
          >
            {busy ? "APPLYING…" : "APPLY"}
          </button>
          <button
            className={`fav-star pop-anim${isFavourite ? " active" : ""}`}
            onClick={toggleFavourite}
            aria-label={isFavourite ? "Remove from favourites" : "Save as favourite"}
          >
            ★
          </button>
        </div>

        {result && (
          <p className={`action-result${result.ok ? "" : " is-error"}`}>
            {result.message}
          </p>
        )}
      </div>

      <div
        className={`graph-splitter${splitting ? " is-dragging" : ""}`}
        onMouseDown={() => {
          cancelTween();
          setSplitting(true);
        }}
        role="separator"
        aria-label="Resize graph panel"
      />

      <div className="presets-wrapper panel" style={{ flex: 1, marginBottom: 0, minHeight: "100px" }}>
        <div className="flex-buttons">
          <button
            className={`outline-btn pop-anim${tab === "builtin" ? " active-tab" : ""}`}
            onClick={() => setTab("builtin")}
          >
            System
          </button>
          <button
            className={`outline-btn pop-anim${tab === "favs" ? " active-tab" : ""}`}
            onClick={() => setTab("favs")}
          >
            Favorites
          </button>
        </div>

        <div className="presets-scroll-area">
          {shown.length === 0 ? (
            <span className="preset-empty">No Favorites</span>
          ) : (
            <div className="preset-grid">
              {shown.map((preset, i) => (
                <div
                  key={`${preset.name}-${i}`}
                  className={`preset-slot${selectedSlot === i ? " selected" : ""}`}
                  title={preset.name}
                  onClick={() => loadPreset(preset, i)}
                  onContextMenu={(e) => {
                    if (tab !== "favs") return;
                    e.preventDefault();
                    deleteFavourite(i);
                  }}
                >
                  <svg className="preset-icon" viewBox="-15 -15 130 130">
                    <line
                      x1="0" y1="100" x2={preset.p1.x} y2={preset.p1.y}
                      stroke="var(--grad-start)" strokeWidth="2.5" strokeLinecap="round"
                    />
                    <line
                      x1="100" y1="0" x2={preset.p2.x} y2={preset.p2.y}
                      stroke="var(--grad-start)" strokeWidth="2.5" strokeLinecap="round"
                    />
                    <path
                      d={curvePath(preset.p1, preset.p2)}
                      fill="none" stroke="url(#line-grad)" strokeWidth="6" strokeLinecap="round"
                    />
                    <circle cx={preset.p1.x} cy={preset.p1.y} r="4.5" fill="url(#theme-grad)" />
                    <circle cx={preset.p2.x} cy={preset.p2.y} r="4.5" fill="url(#theme-grad)" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
