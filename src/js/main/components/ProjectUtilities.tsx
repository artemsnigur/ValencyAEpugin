import { evalTS } from "../../lib/utils/bolt";
import { useHostAction } from "./useHostAction";

/**
 * Remove Unused Footage / Organize.
 *
 * Ported from the bottom panel of #tab-render in AutoEditRestored/index.html
 * (#render-bottom-btns). The rest of the Render tab lands in step 07.
 */
export const ProjectUtilities = () => {
  const { busy, result, run } = useHostAction();

  return (
    <div className="panel">
      <div className="flex-buttons">
        <button
          className="outline-btn pop-anim"
          style={{ fontSize: "10px" }}
          onClick={() => run("clean", () => evalTS("removeUnusedFootage"))}
          disabled={busy !== null}
        >
          {busy === "clean" ? "Removing…" : "Remove Unused Footage"}
        </button>
        <button
          className="outline-btn pop-anim"
          onClick={() => run("organize", () => evalTS("organizeProject"))}
          disabled={busy !== null}
        >
          {busy === "organize" ? "Organizing…" : "Organize"}
        </button>
      </div>

      {result && (
        <p className={`action-result${result.ok ? "" : " is-error"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
};
