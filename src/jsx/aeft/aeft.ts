// After Effects host layer.
//
// Thin wrappers around the AE DOM only - no calculations, no state, no
// business logic. Anything exported here is reachable from the panel as
// evalTS("name", args), because src/jsx/index.ts pulls this module in whole.
//
// ES3 only: var and function, no let/const/arrow/template literals. Array and
// Object helpers come from ../utils/utils - Babel does not polyfill them.

import { forEach, includes } from "../utils/utils";

/** Every host entry point reports back in this shape. */
export type HostResult = {
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
): HostResult {
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

/**
 * Smart Align Keyframes.
 *
 * Halves the layer's speed, holds its in point, then snaps every time-remap
 * key to the nearest whole frame, collapsing keys that land on the same frame.
 *
 * Ported from $.global.stretchAndSnap. Validation moved above beginUndoGroup:
 * the original returned from inside the try on both guard paths, skipping
 * endUndoGroup and leaving an undo group open.
 */
export var stretchAndSnap = function (): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var selLayers = comp.selectedLayers;
  if (selLayers.length === 0) {
    return { ok: false, message: "Select one or more layers first." };
  }

  var frameDuration = comp.frameDuration;
  var processed = 0;
  var skipped = 0;
  var collapsed = 0;
  var failure = "";

  app.beginUndoGroup("Smart Align Keyframes");
  try {
    forEach(selLayers, function (layer) {
      if (
        !(layer instanceof AVLayer) ||
        layer.locked ||
        !layer.canSetTimeRemapEnabled
      ) {
        skipped++;
        return;
      }
      if (!layer.timeRemapEnabled) {
        layer.timeRemapEnabled = true;
      }

      var timeRemap = layer.property("ADBE Time Remapping") as Property;
      if (!timeRemap || timeRemap.numKeys === 0) {
        skipped++;
        return;
      }

      // Halve the speed, then shift startTime so the in point does not move.
      var oldIn = layer.inPoint;
      layer.stretch = 50;
      layer.startTime += oldIn - layer.inPoint;

      var rawKeys = [];
      for (var k = 1; k <= timeRemap.numKeys; k++) {
        rawKeys.push({ t: timeRemap.keyTime(k), v: timeRemap.keyValue(k) });
      }

      // Keys that snap onto the same frame collapse to the last one seen.
      var neededKeys = [];
      for (var m = 0; m < rawKeys.length; m++) {
        var targetFrameTime = Math.round(rawKeys[m].t / frameDuration) * frameDuration;
        var isDuplicate = false;
        for (var n = 0; n < neededKeys.length; n++) {
          var existingTarget =
            Math.round(neededKeys[n].t / frameDuration) * frameDuration;
          if (Math.abs(existingTarget - targetFrameTime) < frameDuration * 0.1) {
            isDuplicate = true;
            neededKeys[n] = rawKeys[m];
            break;
          }
        }
        if (!isDuplicate) {
          neededKeys.push(rawKeys[m]);
        }
      }

      // A throwaway key far past the end keeps the property from emptying while
      // the originals are cleared; it is removed once the snapped keys are in.
      var dummyTime = rawKeys[rawKeys.length - 1].t + 1000;
      timeRemap.setValueAtTime(dummyTime, 0);
      while (timeRemap.numKeys > 1) {
        timeRemap.removeKey(1);
      }
      for (var p = 0; p < neededKeys.length; p++) {
        timeRemap.setValueAtTime(
          Math.round(neededKeys[p].t / frameDuration) * frameDuration,
          neededKeys[p].v
        );
      }
      timeRemap.removeKey(timeRemap.numKeys);

      if (timeRemap.numKeys > 0) {
        layer.outPoint = timeRemap.keyTime(timeRemap.numKeys) + frameDuration;
      }

      processed++;
      collapsed += rawKeys.length - neededKeys.length;
    });
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Align failed: " + failure };
  }
  if (processed === 0) {
    return {
      ok: false,
      message: "No eligible layers. Locked layers and layers without keyframes are skipped.",
    };
  }

  var message =
    "Aligned " + processed + (processed === 1 ? " layer." : " layers.");
  if (collapsed > 0) {
    message +=
      " Collapsed " + collapsed + (collapsed === 1 ? " key." : " keys.");
  }
  if (skipped > 0) {
    message += " Skipped " + skipped + (skipped === 1 ? " layer." : " layers.");
  }
  return { ok: true, message: message };
};

/**
 * Remove selected time-remap keyframes and close the gap they leave.
 *
 * Ported from $.global.removeKF. Validation moved above beginUndoGroup for the
 * same leak as stretchAndSnap, and the silent no-comp return now reports.
 */
export var removeKeyframes = function (): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var selLayers = comp.selectedLayers;
  if (selLayers.length === 0) {
    return { ok: false, message: "Select one or more layers first." };
  }

  var frameDuration = comp.frameDuration;
  var processed = 0;
  var removedTotal = 0;
  var failure = "";

  app.beginUndoGroup("Remove Keyframes");
  try {
    forEach(selLayers, function (layer) {
      if (!(layer instanceof AVLayer) || !layer.timeRemapEnabled) {
        return;
      }
      var timeRemap = layer.property("ADBE Time Remapping") as Property;
      if (!timeRemap) {
        return;
      }

      var selectedKeys = timeRemap.selectedKeys;
      if (selectedKeys.length === 0) {
        return;
      }

      var keysToKeep = [];
      var firstKeyTime = timeRemap.keyTime(1);
      for (var k = 1; k <= timeRemap.numKeys; k++) {
        var isSelected = false;
        for (var j = 0; j < selectedKeys.length; j++) {
          if (selectedKeys[j] === k) {
            isSelected = true;
            break;
          }
        }
        if (!isSelected) {
          keysToKeep.push(timeRemap.keyValue(k));
        }
      }

      removedTotal += timeRemap.numKeys - keysToKeep.length;
      processed++;

      if (keysToKeep.length === 0) {
        while (timeRemap.numKeys > 0) {
          timeRemap.removeKey(1);
        }
        return;
      }

      while (timeRemap.numKeys > 1) {
        timeRemap.removeKey(2);
      }
      var keptTime = timeRemap.numKeys === 1 ? timeRemap.keyTime(1) : -1;

      var insertTime = firstKeyTime;
      for (var m = 0; m < keysToKeep.length; m++) {
        timeRemap.setValueAtTime(insertTime, keysToKeep[m]);
        insertTime += frameDuration;
      }

      if (keptTime !== -1 && timeRemap.numKeys > keysToKeep.length) {
        for (var p = timeRemap.numKeys; p >= 1; p--) {
          if (Math.abs(timeRemap.keyTime(p) - keptTime) < 0.0001) {
            timeRemap.removeKey(p);
            break;
          }
        }
      }

      layer.outPoint = insertTime;
    });
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Remove keyframes failed: " + failure };
  }
  if (processed === 0) {
    return {
      ok: false,
      message: "No time-remap keyframes selected. Select keys in the timeline first.",
    };
  }
  return {
    ok: true,
    message:
      "Removed " +
      removedTotal +
      (removedTotal === 1 ? " keyframe across " : " keyframes across ") +
      processed +
      (processed === 1 ? " layer." : " layers."),
  };
};

/**
 * Remove Unused Footage.
 *
 * The original ran app.executeCommand(app.findMenuCommandId("Remove Unused
 * Footage")) with no undo group. The menu lookup is by English label and fails
 * on a localised install; Project.removeUnusedFootage() is the scripting API
 * for the same command, is locale-independent, and returns a count.
 */
export var removeUnusedFootage = function (): HostResult {
  var removed = 0;
  var failure = "";

  app.beginUndoGroup("Remove Unused Footage");
  try {
    removed = app.project.removeUnusedFootage();
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Remove unused footage failed: " + failure };
  }
  if (removed === 0) {
    return { ok: true, message: "Nothing to remove - no unused footage." };
  }
  return {
    ok: true,
    message:
      "Removed " + removed + (removed === 1 ? " unused item." : " unused items."),
  };
};

/**
 * Sort root-level project items into folders by type.
 *
 * Ported from $.global.organizeProject. The original called endUndoGroup as the
 * last statement inside its try, so any mid-loop failure hit the catch and left
 * the undo group open; it now closes on both paths.
 */
export var organizeProject = function (): HostResult {
  var VIDEO = ["mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v"];
  var AUDIO = ["mp3", "wav", "aac", "m4a", "aif", "aiff"];
  var IMAGE = ["png", "jpg", "jpeg", "tif", "tiff", "psd", "exr", "gif", "ai", "webp"];

  var getOrCreateFolder = function (folderName: string): FolderItem {
    for (var i = 1; i <= app.project.numItems; i++) {
      var candidate = app.project.item(i);
      if (
        candidate instanceof FolderItem &&
        candidate.name === folderName &&
        candidate.parentFolder === app.project.rootFolder
      ) {
        return candidate;
      }
    }
    return app.project.items.addFolder(folderName);
  };

  var moved = 0;
  var failure = "";

  app.beginUndoGroup("Organize Files");
  try {
    // Collect first, move second - reassigning parentFolder mid-scan would
    // shift the indices being iterated.
    var itemsToMove: { item: Item; target: string }[] = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item.parentFolder !== app.project.rootFolder) continue;
      if (item instanceof FolderItem) continue;

      var targetName = "Other Files";
      if (item instanceof CompItem) {
        targetName = "Pre-comps";
      } else if (item instanceof FootageItem) {
        if (item.mainSource instanceof SolidSource) {
          targetName = "Solids";
        } else if (item.file) {
          var parts = item.file.name.split(".");
          var ext = parts[parts.length - 1].toLowerCase();
          if (includes(VIDEO, ext)) targetName = "Video Files";
          else if (includes(AUDIO, ext)) targetName = "Audio Files";
          else if (includes(IMAGE, ext)) targetName = "Image Files";
        }
      }
      itemsToMove.push({ item: item, target: targetName });
    }

    forEach(itemsToMove, function (entry) {
      entry.item.parentFolder = getOrCreateFolder(entry.target);
      moved++;
    });
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Organize failed: " + failure };
  }
  if (moved === 0) {
    return { ok: true, message: "Nothing to organize - no loose root items." };
  }
  return {
    ok: true,
    message: "Organized " + moved + (moved === 1 ? " item." : " items.") ,
  };
};

// --- Twixtor -----------------------------------------------------------------

var TWIXTOR_OFFSETS = [-10, -5, 0, 5, 10];
var TWIXTOR_SECTION = "AutoTwix";
var TWIXTOR_KEY = "presetPath";

var defaultPresetPath = function (): string {
  return new Folder("~/Desktop").fsName + "/TwixtorPresets/twixtor.ffx";
};

/** First layer in comp whose source is the given item. */
var findLayerBySource = function (comp: CompItem, source: AVItem): Layer | null {
  for (var i = 1; i <= comp.numLayers; i++) {
    if ((comp.layer(i) as AVLayer).source === source) {
      return comp.layer(i);
    }
  }
  return null;
};

/** Ease curves per graph button, carried over verbatim from the original. */
var applyEase = function (timeRemap: Property, mode: number): void {
  if (timeRemap.numKeys < 2) return;
  var first = 1;
  var last = timeRemap.numKeys;
  var dummy = new KeyframeEase(0.01, 33);

  if (mode === 0) {
    var flat = new KeyframeEase(0, 33);
    timeRemap.setTemporalEaseAtKey(first, [flat], [flat]);
    timeRemap.setTemporalEaseAtKey(last, [flat], [flat]);
  } else if (mode === 1) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(1.26898, 14.59537)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(0.04976, 98.87928)], [dummy]);
  } else if (mode === 2) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(10.20061, 5.16134)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(0.0659, 100)], [dummy]);
  } else if (mode === 3) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(0.00797, 100)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(1.48144, 11.99612)], [dummy]);
  } else if (mode === 4) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(3.21961, 8.12278)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(3.21344, 8.83633)], [dummy]);
  } else if (mode === 5) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(152.3067, 0.47059)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(0.36494, 59.80845)], [dummy]);
  } else if (mode === 6) {
    timeRemap.setTemporalEaseAtKey(first, [dummy], [new KeyframeEase(0.51008, 58.05458)]);
    timeRemap.setTemporalEaseAtKey(last, [new KeyframeEase(23.76619, 2.93754)], [dummy]);
  }
};

/** The stored .ffx path, or the Desktop default the original fell back to. */
export var getTwixtorPresetPath = function (): string {
  if (app.settings.haveSetting(TWIXTOR_SECTION, TWIXTOR_KEY)) {
    return app.settings.getSetting(TWIXTOR_SECTION, TWIXTOR_KEY);
  }
  return defaultPresetPath();
};

/**
 * Pick a .ffx and remember it.
 *
 * The original also parked the path in a $.global between calls; the panel now
 * holds it and passes it to runTwixtor. app.settings stays the persistence
 * layer, under the same section and key the shipped panel uses, so a path set
 * in either panel is visible to the other.
 */
export var selectTwixtorPreset = function (): HostResult & { path: string } {
  var chosen = File.openDialog("Select .ffx", "*.ffx") as File | null;
  if (!chosen) {
    return { ok: false, message: "", path: getTwixtorPresetPath() };
  }
  app.settings.saveSetting(TWIXTOR_SECTION, TWIXTOR_KEY, chosen.fsName);
  return {
    ok: true,
    message: "Preset set to " + chosen.name,
    path: chosen.fsName,
  };
};

/**
 * Auto Twixtor.
 *
 * Splits a lone selected layer at its midpoint, precomposes the selection,
 * applies the .ffx, precomposes again to bake, then builds a time remap with
 * the chosen tail offset and ease curve.
 *
 * Ported from $.global.runTwixtor. Changes:
 *  - offsetIndex and presetPath are arguments; the original read them from
 *    $.global state written by a separate setTwixtorOffset call, which is gone.
 *  - Split Layer is done with duplicate + trim instead of
 *    executeCommand(findMenuCommandId("Split Layer") || 2159). The lookup is by
 *    English label and finds nothing on a localised install, and the 2159
 *    fallback is version-fragile. This also avoids moving the playhead.
 *  - beginSuppressDialogs runs after validation and unwinds in a finally, so it
 *    cannot be left on. A suppression that never unwinds makes After Effects
 *    swallow dialogs until restart.
 *  - Guard messages are returned rather than alert()ed. The original alerted
 *    while dialogs were suppressed, so those warnings never reached anyone.
 */
export var runTwixtor = function (
  mode: number,
  offsetIndex: number,
  presetPath: string
): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var selected = comp.selectedLayers;
  if (selected.length === 0) {
    return { ok: false, message: "Select one or more layers first." };
  }

  var presetFile = new File(presetPath);
  if (!presetFile.exists) {
    return {
      ok: false,
      message: "Preset not found: " + presetPath + " - pick one with .ffx.",
    };
  }

  if (offsetIndex < 0 || offsetIndex >= TWIXTOR_OFFSETS.length) {
    return { ok: false, message: "Unknown offset." };
  }
  var selectedOffset = TWIXTOR_OFFSETS[offsetIndex];

  var failure = "";

  app.beginSuppressDialogs();
  try {
    app.beginUndoGroup("Auto Twixtor");
    try {
      var layers = selected;

      // One layer splits at its midpoint first. The original moved the playhead
      // and invoked the Split Layer menu command; duplicate + trim is the same
      // operation without the locale dependency or the playhead jump.
      if (layers.length === 1) {
        var original = layers[0];
        var midTime =
          original.inPoint + (original.outPoint - original.inPoint) / 2;
        var secondHalf = original.duplicate();
        original.outPoint = midTime;
        secondHalf.inPoint = midTime;
        layers = [original, secondHalf];
      }

      var baseIn = Infinity;
      var baseOut = -Infinity;
      forEach(layers, function (layer) {
        baseIn = Math.min(baseIn, layer.inPoint);
        baseOut = Math.max(baseOut, layer.outPoint);
      });
      var duration = baseOut - baseIn;

      forEach(layers, function (layer) {
        layer.startTime -= baseIn;
      });

      var indices: number[] = [];
      forEach(layers, function (layer) {
        indices.push(layer.index);
      });

      var sourceComp = comp.layers.precompose(indices, "Twixtor_Source", true);
      sourceComp.duration = duration;

      var sourceLayer = findLayerBySource(comp, sourceComp);
      if (!sourceLayer) {
        throw new Error("Could not find the Twixtor_Source layer after precompose.");
      }
      sourceLayer.startTime = 0;
      sourceLayer.applyPreset(presetFile);

      var bakedComp = comp.layers.precompose(
        [sourceLayer.index],
        "Twixtor_Baked",
        true
      );
      if (bakedComp.numLayers > 0) {
        bakedComp.duration = bakedComp.layer(1).outPoint;
      }

      var baked = findLayerBySource(comp, bakedComp) as AVLayer;
      if (!baked) {
        throw new Error("Could not find the Twixtor_Baked layer after precompose.");
      }
      baked.startTime = 0;
      baked.timeRemapEnabled = true;

      var timeRemap = baked.property("ADBE Time Remapping") as Property;
      var frame = comp.frameDuration;

      // Re-seat the final key one frame earlier so the tail can be retimed.
      var lastKey = timeRemap.keyTime(timeRemap.numKeys);
      var safeTime = lastKey - frame;
      timeRemap.setValueAtTime(safeTime, timeRemap.valueAtTime(safeTime, true));
      timeRemap.removeKey(timeRemap.nearestKeyIndex(lastKey));

      var tailIndex = timeRemap.numKeys;
      var tailTime = timeRemap.keyTime(tailIndex);
      var tailValue = timeRemap.keyValue(tailIndex);
      if (selectedOffset === 0) {
        timeRemap.setValueAtTime(duration, tailValue);
      } else {
        timeRemap.setValueAtTime(tailTime + frame * selectedOffset, tailValue);
      }
      timeRemap.removeKey(timeRemap.nearestKeyIndex(tailTime));

      baked.outPoint = timeRemap.keyTime(timeRemap.numKeys);
      applyEase(timeRemap, mode);
      baked.startTime += baseIn;
    } finally {
      app.endUndoGroup();
    }
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    // Unmissable by construction: if this is skipped, After Effects keeps
    // swallowing every dialog until it is restarted.
    app.endSuppressDialogs(false);
  }

  if (failure !== "") {
    return { ok: false, message: "Auto Twixtor failed: " + failure };
  }
  return {
    ok: true,
    message:
      "Twixtor applied at " +
      (selectedOffset > 0 ? "+" : "") +
      selectedOffset +
      " frames.",
  };
};
