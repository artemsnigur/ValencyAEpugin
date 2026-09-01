import { useEffect, useState } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";

/** Tail offsets in frames, matching the shipped panel's five buttons. */
const OFFSETS = [
  { label: "-10", index: 0 },
  { label: "-5", index: 1 },
  { label: "0", index: 2 },
  { label: "+5", index: 3 },
  { label: "+10", index: 4 },
];

/** Ease curve per graph button. Mode 0 is the plain Easy Ease. */
const GRAPHS = [
  { mode: 1, path: "M5,45 C5,45 15,5 95,5" },
  { mode: 2, path: "M5,45 C5,5 30,5 95,5" },
  { mode: 3, path: "M5,45 C70,45 95,45 95,5" },
  { mode: 4, path: "M5,45 C 5,5 95,45 95,5" },
  { mode: 5, path: "M5,45 C 15,5 50,5 95,5" },
  { mode: 6, path: "M5,45 C 50,45 85,45 95,5" },
];

/**
 * Auto Twixtor.
 *
 * Ported from the second panel of #tab-twixtor in AutoEditRestored/index.html.
 * The offset index and preset path live here rather than in ExtendScript
 * globals, and are passed to runTwixtor on every call.
 */
export const AutoTwixtor = () => {
  const [offsetIndex, setOffsetIndex] = useState(4);
  const [presetPath, setPresetPath] = useState("");
  const { busy, result, run } = useHostAction();

  // The path is persisted by After Effects, under the same settings key the
  // shipped panel uses, so read it back on mount rather than assuming.
  useEffect(() => {
    evalTS("getTwixtorPresetPath")
      .then(setPresetPath)
      .catch(() => setPresetPath(""));
  }, []);

  const pickPreset = () =>
    run("ffx", () =>
      evalTS("selectTwixtorPreset").then((res) => {
        if (res.ok) setPresetPath(res.path);
        return res;
      })
    );

  const twixtor = (mode: number) =>
    run(`mode${mode}`, () =>
      evalTS("runTwixtor", mode, offsetIndex, presetPath)
    );

  return (
    <div className="panel">
      <h3>Auto Twixtor</h3>

      <div className="flex-buttons" style={{ marginBottom: "10px" }}>
        <div className="offset-group">
          {OFFSETS.map((offset) => (
            <button
              key={offset.index}
              className={`offset-btn pop-anim${
                offsetIndex === offset.index ? " active-offset" : ""
              }`}
              onClick={() => setOffsetIndex(offset.index)}
            >
              {offset.label}
            </button>
          ))}
        </div>
        <button
          className="outline-btn pop-anim"
          style={{ minWidth: "40px", padding: 0 }}
          onClick={pickPreset}
          disabled={busy !== null}
          title={presetPath || "No preset chosen"}
        >
          .ffx
        </button>
      </div>

      <div className="grid-buttons">
        <button
          className="grad-btn pop-anim full-width"
          style={{ gridColumn: "span 2" }}
          onClick={() => twixtor(0)}
          disabled={busy !== null}
        >
          Easy Ease
        </button>
        {GRAPHS.map((graph, i) => (
          <button
            key={graph.mode}
            className="grad-btn pop-anim"
            onClick={() => twixtor(graph.mode)}
            disabled={busy !== null}
          >
            <svg viewBox="0 0 100 50" aria-hidden="true">
              <path
                d={graph.path}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            Graph {i + 1}
          </button>
        ))}
      </div>

      {result && result.message && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
};
