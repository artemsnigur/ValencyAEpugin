import { useState } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";

/**
 * Duplicate Frames Remover: Analyze / Del KF / Align.
 *
 * Ported from the first panel of #tab-twixtor in the shipped 1.4.0 markup.
 */
export const DuplicateFrames = () => {
  const [lowMovement, setLowMovement] = useState(false);
  const { busy, result, run } = useHostAction();

  return (
    <div className="panel">
      <h3>Duplicate Frames Remover</h3>

      <div className="flex-buttons">
        <button
          className="outline-btn pop-anim"
          onClick={() =>
            run("analyze", () => evalTS("analyzeDuplicates", lowMovement))
          }
          disabled={busy !== null}
        >
          {busy === "analyze" ? "Analyzing…" : "Analyze"}
        </button>
        <button
          className="outline-btn pop-anim"
          onClick={() => run("delkf", () => evalTS("removeKeyframes"))}
          disabled={busy !== null}
        >
          {busy === "delkf" ? "Removing…" : "Del KF"}
        </button>
        <button
          className="outline-btn pop-anim"
          onClick={() => run("align", () => evalTS("stretchAndSnap"))}
          disabled={busy !== null}
        >
          {busy === "align" ? "Aligning…" : "Align"}
        </button>
      </div>

      {/*
        The original carried this warning inside a staged fake progress bar.
        The progress was invented; the warning was not, and it is the only part
        that told the user the panel had not died. Kept, stated up front.
      */}
      <p className={`panel-note${busy ? " is-active" : ""}`}>
        {busy
          ? "Working — After Effects is frozen. Don't quit, it will come back."
          : "After Effects freezes while these run. Long layers take a while."}
      </p>

      <div className="custom-toggles flex-col">
        <label className="check-full">
          <input
            type="checkbox"
            checked={lowMovement}
            onChange={(e) => setLowMovement(e.target.checked)}
          />
          <span>Detect Small Movement</span>
        </label>
      </div>

      {result && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
};
