import { useState } from "react";
import { evalTS } from "../../lib/utils/bolt";

/**
 * Duplicate Frames Remover.
 *
 * Ported from the first panel of #tab-twixtor in AutoEditRestored/index.html.
 * The "Del KF" and "Align" buttons that share this panel land in step 03.
 */
export const DuplicateFrames = () => {
  const [lowMovement, setLowMovement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  const analyze = () => {
    if (busy) return;
    setBusy(true);
    setResult(null);

    // evalScript is callback-based and crosses to another process, so the
    // panel keeps painting while After Effects itself is blocked executing the
    // script. That is why the busy state below renders at all.
    evalTS("analyzeDuplicates", lowMovement)
      .then((res) => setResult(res))
      .catch((e) => {
        setResult({
          ok: false,
          message:
            typeof e === "string" ? e : e?.message || "Unknown host error.",
        });
      })
      .then(() => setBusy(false));
  };

  return (
    <div className="panel">
      <h3>Duplicate Frames Remover</h3>

      <div className="flex-buttons">
        <button className="outline-btn pop-anim" onClick={analyze} disabled={busy}>
          {busy ? "Analyzing…" : "Analyze"}
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
          : "After Effects freezes while this runs. Long layers take a while."}
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
