// After Effects host layer.
//
// Thin wrappers around the AE DOM only - no calculations, no state, no
// business logic. Anything exported here is reachable from the panel as
// evalTS("name", args), because src/jsx/index.ts pulls this module in whole.
//
// ES3 only: var and function, no let/const/arrow/template literals. Array and
// Object helpers come from ../utils/utils - Babel does not polyfill them.

import { forEach } from "../utils/utils";

export type AnalyzeDuplicatesResult = {
  ok: boolean;
  message: string;
};

/**
 * Duplicate Frame Remover.
 *
 * Samples an 8x8 grid per frame through a temporary Slider expression, keeps
 * the frames that differ from their predecessor, and rewrites the layer's time
 * remap to play only those.
 *
 * Ported from $.global.analyzeDuplicates in AutoEditRestored/host.jsx. Two
 * changes from the original: isLowMovement arrives as a real boolean rather
 * than the string "true", and failures return a message instead of alert()ing
 * from inside the host.
 */
export var analyzeDuplicates = function (
  isLowMovement: boolean
): AnalyzeDuplicatesResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var selLayers = comp.selectedLayers;
  if (selLayers.length === 0) {
    return { ok: false, message: "Select one or more layers first." };
  }

  var frameDuration = comp.frameDuration;
  var noiseGate = isLowMovement ? 0.015 : 0.1;
  var gridCols = 8;
  var gridRows = 8;

  var processed = 0;
  var skipped = 0;
  var framesRemoved = 0;
  var failure = "";

  app.beginUndoGroup("Run Duplicate Frame Remover");
  try {
    forEach(selLayers, function (layer) {
      if (
        !(layer instanceof AVLayer) ||
        !layer.canSetTimeRemapEnabled ||
        layer.locked ||
        layer.nullLayer
      ) {
        skipped++;
        return;
      }

      // A Slider Control carries the per-frame difference expression; it is
      // sampled with valueAtTime and removed again before the remap is built.
      //
      // The original reaches the group as layer.Effects, an untyped name
      // accessor. The match name is equivalent, typed, and locale-independent.
      var effects = layer.property("ADBE Effect Parade") as PropertyGroup;
      if (!effects) {
        skipped++;
        return;
      }
      var slider = effects.addProperty("ADBE Slider Control");
      if (!slider) {
        skipped++;
        return;
      }
      var sliderProp = slider.property(1) as Property;

      sliderProp.expression =
        "var l = thisLayer;\n" +
        "var t1 = time;\n" +
        "var t2 = time - " +
        frameDuration +
        ";\n" +
        "var totalSignificantDiff = 0;\n" +
        "var cols = " +
        gridCols +
        "; var rows = " +
        gridRows +
        ";\n" +
        "var w_step = l.width / cols;\n" +
        "var h_step = l.height / rows;\n" +
        "var r = [w_step/2, h_step/2];\n" +
        "for(var i=1; i<=cols; i++) {\n" +
        " for(var j=1; j<=rows; j++) {\n" +
        "  var p = [(i * w_step) - r[0], (j * h_step) - r[1]];\n" +
        "  var s1 = l.sampleImage(p, r, true, t1);\n" +
        "  var s2 = l.sampleImage(p, r, true, t2);\n" +
        "  var diff = Math.abs(s1[0]-s2[0]) + Math.abs(s1[1]-s2[1]) + Math.abs(s1[2]-s2[2]);\n" +
        "  if (diff > " +
        noiseGate +
        ") { totalSignificantDiff += diff; }\n" +
        " }\n" +
        "}\n" +
        "totalSignificantDiff;";

      // Walk the layer and collect the source times of frames that differ.
      var uniqueFrames = [];
      var t = layer.inPoint;
      var end = layer.outPoint;
      var stretchFactor = 100 / layer.stretch;
      var totalFrames = 1;

      uniqueFrames.push((t - layer.startTime) * stretchFactor);
      t += frameDuration;
      while (t <= end - frameDuration * 0.1) {
        totalFrames++;
        if (sliderProp.valueAtTime(t, false) > 0) {
          uniqueFrames.push((t - layer.startTime) * stretchFactor);
        }
        t += frameDuration;
      }

      slider.remove();

      layer.timeRemapEnabled = true;
      var timeRemap = layer.property("ADBE Time Remapping") as Property;
      if (!timeRemap) {
        skipped++;
        return;
      }

      while (timeRemap.numKeys > 1) {
        timeRemap.removeKey(2);
      }
      var keptTime = timeRemap.numKeys === 1 ? timeRemap.keyTime(1) : -1;

      var insertTime = layer.inPoint;
      for (var m = 0; m < uniqueFrames.length; m++) {
        timeRemap.setValueAtTime(insertTime, uniqueFrames[m]);
        insertTime += frameDuration;
      }

      // Drop the key that enabling time remap left behind, if it survived.
      if (keptTime !== -1 && timeRemap.numKeys > uniqueFrames.length) {
        for (var n = timeRemap.numKeys; n >= 1; n--) {
          if (Math.abs(timeRemap.keyTime(n) - keptTime) < 0.0001) {
            timeRemap.removeKey(n);
            break;
          }
        }
      }

      layer.outPoint = insertTime;

      processed++;
      framesRemoved += totalFrames - uniqueFrames.length;
    });
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Duplicate frame removal failed: " + failure };
  }
  if (processed === 0) {
    return {
      ok: false,
      message: "No eligible layers. Locked, null and non-footage layers are skipped.",
    };
  }

  var message =
    "Removed " +
    framesRemoved +
    (framesRemoved === 1 ? " duplicate frame across " : " duplicate frames across ") +
    processed +
    (processed === 1 ? " layer." : " layers.");
  if (skipped > 0) {
    message += " Skipped " + skipped + (skipped === 1 ? " layer." : " layers.");
  }
  return { ok: true, message: message };
};
