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
var SETTINGS_SECTION = "ValencyMotion";
var TWIXTOR_KEY = "twixtorPresetPath";

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
  if (app.settings.haveSetting(SETTINGS_SECTION, TWIXTOR_KEY)) {
    return app.settings.getSetting(SETTINGS_SECTION, TWIXTOR_KEY);
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
  app.settings.saveSetting(SETTINGS_SECTION, TWIXTOR_KEY, chosen.fsName);
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

// --- Bezier graph ------------------------------------------------------------

/**
 * Apply a bezier ease to every selected keyframe pair.
 *
 * Takes the two control points normalised to 0..1, converts them into a
 * KeyframeEase speed/influence pair per dimension, and writes them across each
 * consecutive pair of selected keys.
 *
 * Ported from $.global.applyGraphToKeys. This one closed its undo group on both
 * guard paths already, so there is no leak to fix; the change is that guard
 * messages are returned instead of alert()ed, and the four control values
 * arrive as numbers rather than strings needing parseFloat.
 */
export var applyGraphToKeys = function (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var selProps = comp.selectedProperties;
  if (selProps.length === 0) {
    return { ok: false, message: "Select keyframes in the timeline first." };
  }

  // Clamped exactly as the original did - a zero x1 would divide by zero below.
  if (x1 < 0.001) x1 = 0.001;
  if (x1 > 1) x1 = 1;
  if (x2 < 0) x2 = 0;
  if (x2 > 0.999) x2 = 0.999;

  var influenceOut = x1 * 100;
  var influenceIn = (1 - x2) * 100;

  var eased = 0;
  var failure = "";

  app.beginUndoGroup("Apply Bezier Graph");
  try {
    forEach(selProps, function (selected) {
      var prop = selected as Property;
      if (!prop.canVaryOverTime || prop.selectedKeys.length < 2) return;

      var selKeys = prop.selectedKeys;
      var propType = prop.propertyValueType;
      if (propType === PropertyValueType.COLOR) return;

      var isSpatial =
        propType === PropertyValueType.TwoD_SPATIAL ||
        propType === PropertyValueType.ThreeD_SPATIAL;

      for (var k = 0; k < selKeys.length - 1; k++) {
        var k1 = selKeys[k];
        var k2 = selKeys[k + 1];
        var duration = prop.keyTime(k2) - prop.keyTime(k1);

        // Shape, text and custom properties have no numeric value to derive a
        // speed from, so their eases are written with speed 0.
        var isShapeOrCustom =
          propType === PropertyValueType.SHAPE ||
          propType === PropertyValueType.CUSTOM_VALUE ||
          propType === PropertyValueType.TEXT_DOCUMENT ||
          propType === PropertyValueType.NO_VALUE;

        var v1 = null;
        var v2 = null;
        if (!isShapeOrCustom) {
          try {
            v1 = prop.keyValue(k1);
            v2 = prop.keyValue(k2);
          } catch (e) {
            isShapeOrCustom = true;
          }
        }

        var dimensions = 1;
        if (v1 !== null && v1 instanceof Array) {
          dimensions = v1.length;
        }
        // Spatial properties carry a single speed for the whole vector.
        var easeDimensions = isSpatial ? 1 : dimensions;

        var easeOutArr = [];
        var easeInArr = [];
        for (var d = 0; d < easeDimensions; d++) {
          var speedOut = 0;
          var speedIn = 0;
          if (!isShapeOrCustom) {
            var valDiff = 0;
            if (isSpatial) {
              var dx = dimensions >= 2 ? v2[0] - v1[0] : 0;
              var dy = dimensions >= 2 ? v2[1] - v1[1] : 0;
              var dz = dimensions === 3 ? v2[2] - v1[2] : 0;
              valDiff = Math.sqrt(dx * dx + dy * dy + dz * dz);
            } else {
              valDiff = dimensions === 1 ? v2 - v1 : v2[d] - v1[d];
            }
            var averageSpeed = valDiff / duration;
            speedOut = averageSpeed * (y1 / x1);
            speedIn = averageSpeed * ((1 - y2) / (1 - x2));
            if (isNaN(speedOut) || !isFinite(speedOut)) speedOut = 0;
            if (isNaN(speedIn) || !isFinite(speedIn)) speedIn = 0;
          }
          easeOutArr.push(new KeyframeEase(speedOut, influenceOut));
          easeInArr.push(new KeyframeEase(speedIn, influenceIn));
        }

        // The typings model temporal ease as a fixed-length tuple of 1, 2 or 3
        // KeyframeEase, but the dimension count is only known at runtime. Both
        // arrays are built with exactly easeDimensions entries, which is what
        // After Effects expects; the cast narrows for the compiler only.
        prop.setTemporalEaseAtKey(
          k1,
          prop.keyInTemporalEase(k1) as [KeyframeEase],
          easeOutArr as [KeyframeEase]
        );
        prop.setTemporalEaseAtKey(
          k2,
          easeInArr as [KeyframeEase],
          prop.keyOutTemporalEase(k2) as [KeyframeEase]
        );
        eased++;
      }
    });
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  }
  app.endUndoGroup();

  if (failure !== "") {
    return { ok: false, message: "Apply graph failed: " + failure };
  }
  if (eased === 0) {
    return {
      ok: false,
      message: "Nothing to ease. Select at least two keyframes on one property.",
    };
  }
  return {
    ok: true,
    message:
      "Eased " + eased + (eased === 1 ? " keyframe pair." : " keyframe pairs."),
  };
};

// --- Presets -----------------------------------------------------------------

/** Where a preset is applied. */
export type PresetTarget = 0 | 1 | 2; // 0 adjustment, 1 solid, 2 selected layer
/** How long the created layer runs. */
export type PresetDuration = 0 | 1 | 2; // 0 match layer, 1 one frame, 2 custom

/**
 * Apply an animation preset.
 *
 * Targets 0 and 1 create a full-frame layer (adjustment or solid) above the
 * selected one and apply the preset to it; target 2 applies to the selected
 * layer directly.
 *
 * Ported from $.global.applyZxpPreset. Changes:
 *  - the five arguments arrive typed instead of being parseInt'd from strings.
 *  - the original opened its undo group after the "select a layer" guard but
 *    returned from the no-comp guard before opening it, and never closed the
 *    group on the throwing path because there was no try at all. Validation now
 *    runs first and the group closes in a finally.
 *  - guard messages are returned rather than alert()ed.
 */
export var applyPreset = function (
  presetPath: string,
  target: PresetTarget,
  duration: PresetDuration,
  customFrames: number,
  layerColor: number
): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var presetFile = new File(presetPath);
  if (!presetFile.exists) {
    return { ok: false, message: "Preset file not found: " + presetPath };
  }

  var selected = comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : null;
  if ((duration === 0 || target === 2) && !selected) {
    return {
      ok: false,
      message:
        target === 2
          ? "Select a layer to apply the preset to."
          : "Select a layer to match the duration against.",
    };
  }

  var presetName = decodeURI(presetFile.name).replace(".ffx", "");
  var failure = "";

  app.beginUndoGroup("Apply Preset");
  try {
    var originalTime = comp.time;
    var frameDur = comp.frameDuration;
    var inT = comp.time;
    var outT = comp.time + frameDur;

    if (duration === 0 && selected) {
      inT = selected.inPoint;
      outT = selected.outPoint;
    } else if (duration === 1) {
      outT = inT + frameDur;
    } else if (duration === 2) {
      var frames = customFrames;
      if (isNaN(frames) || frames <= 0) frames = 1;
      outT = inT + frames * frameDur;
    }

    if (target === 0 || target === 1) {
      var newLayer = comp.layers.addSolid(
        [1, 1, 1],
        (target === 0 ? "Adj: " : "Solid: ") + presetName,
        comp.width,
        comp.height,
        comp.pixelAspect,
        comp.duration
      );
      if (target === 0) {
        newLayer.adjustmentLayer = true;
      }
      newLayer.label = layerColor;
      newLayer.startTime = inT - newLayer.inPoint + newLayer.startTime;
      newLayer.inPoint = inT;
      newLayer.outPoint = outT;
      if (selected) {
        newLayer.moveBefore(selected);
      }
      // applyPreset lands on the layer at the current time, so the playhead is
      // parked on the new layer's in point and restored afterwards.
      comp.time = newLayer.inPoint;
      newLayer.applyPreset(presetFile);
      comp.time = originalTime;
    } else {
      comp.time = (selected as Layer).inPoint;
      (selected as Layer).applyPreset(presetFile);
      comp.time = originalTime;
    }
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    app.endUndoGroup();
  }

  if (failure !== "") {
    return { ok: false, message: "Apply preset failed: " + failure };
  }
  return {
    ok: true,
    message:
      "Applied " +
      presetName +
      (target === 2 ? " to the selected layer." : target === 0 ? " on a new adjustment layer." : " on a new solid."),
  };
};

/**
 * Open After Effects' own Save Animation Preset dialog.
 *
 * Kept as a menu command deliberately: the docs expose no scripting API for
 * saving a preset, so this is the only route. The lookup is by English label
 * and finds nothing on a localised install, which is what the hardcoded 3075
 * fallback is for - version-fragile, but the best available.
 */
export var savePresetDialog = function (): HostResult {
  try {
    app.executeCommand(app.findMenuCommandId("Save Animation Preset...") || 3075);
  } catch (e: any) {
    return {
      ok: false,
      message:
        "Save preset failed: " + (e && e.message ? e.message : "unknown error"),
    };
  }
  return { ok: true, message: "" };
};

// --- Render ------------------------------------------------------------------

export type RenderTemplatesResult = HostResult & {
  templates: string[];
  /** True when the project had to be modified to read the list. */
  dirtied: boolean;
  /** True when only the fabricate path was available and it was not allowed. */
  needsDirty: boolean;
};

/**
 * Read the Output Module template list.
 *
 * OutputModule.templates is the only documented route to this list, and an
 * OutputModule only exists on a render queue item - which is why the original
 * fabricated a temp comp and queue item to read a property off it.
 *
 * Two problems with that. Project.dirty is read-only with no way to reset it,
 * so merely opening the Render tab marked the project modified and the user got
 * an unexplained "save changes?" on quit. And both removals sat inside a try
 * with an empty catch, so a throw left a comp literally named "Temp" plus an
 * orphaned render queue item in the project, silently.
 *
 * Here: reuse an existing queue item when there is one, which costs nothing and
 * mutates nothing; only fabricate when the queue is empty, and clean up in a
 * finally so the temp items cannot leak.
 */
export var getRenderTemplates = function (
  allowDirty: boolean
): RenderTemplatesResult {
  var rq = app.project.renderQueue;

  // Free path: something is already queued, so an output module already exists.
  if (rq.numItems > 0) {
    try {
      return {
        ok: true,
        message: "",
        templates: rq.item(1).outputModule(1).templates,
        dirtied: false,
        needsDirty: false,
      };
    } catch (e) {
      // Fall through to the fabricate path.
    }
  }

  // Nothing queued: the list can only be read by modifying the project, and
  // Project.dirty cannot be cleared afterwards. Let the caller decide.
  if (!allowDirty) {
    return {
      ok: false,
      message: "",
      templates: [],
      dirtied: false,
      needsDirty: true,
    };
  }

  var tempComp: CompItem | null = null;
  var tempItem: RenderQueueItem | null = null;
  var templates = ["Lossless"];
  var failure = "";

  try {
    tempComp = app.project.items.addComp("Temp", 100, 100, 1, 1, 1);
    tempItem = rq.items.add(tempComp);
    templates = tempItem.outputModule(1).templates;
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    // Unmissable: without this a throw above leaves a stray "Temp" comp and an
    // orphaned queue item in the user's project.
    try {
      if (tempItem) tempItem.remove();
    } catch (e) {}
    try {
      if (tempComp) tempComp.remove();
    } catch (e) {}
    try {
      rq.showWindow(false);
    } catch (e) {}
  }

  if (failure !== "") {
    return {
      ok: false,
      message: "Could not read render templates: " + failure,
      templates: templates,
      dirtied: true,
      needsDirty: false,
    };
  }
  return {
    ok: true,
    message: "",
    templates: templates,
    dirtied: true,
    needsDirty: false,
  };
};

export type RenderOptions = {
  templateName: string;
  useSpecificFolder: boolean;
  destPath: string;
  autoImport: boolean;
  autoWorkArea: boolean;
  renderPrefix: string;
};

/** The prefix is a filename fragment the user typed, not a pattern. */
var escapeRegExp = function (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Queue the active comp and render it.
 *
 * Ported from $.global.startZxpRender. Notable changes:
 *  - the six arguments arrive typed; the three booleans were being compared as
 *    the strings "true"/"false".
 *  - renderPrefix is escaped before it reaches a RegExp. The original pasted it
 *    in raw, so a prefix containing a bracket threw an invalid-regex error the
 *    surrounding code did not catch.
 *  - the solo and work-area restore runs in a finally; previously a throw
 *    anywhere after they were set left layers soloed and the work area wrong.
 *  - only the auto-import is wrapped in an undo group. The rest of the function
 *    saves the project, purges caches and renders, none of which is undoable,
 *    and an undo group spanning a save would offer to walk the user back past
 *    the state just written to disk.
 *  - the duplicated work-area block in the original is collapsed to one.
 */
export var startRender = function (options: RenderOptions): HostResult {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }
  if (!options.templateName || options.templateName === "") {
    return { ok: false, message: "Select a render template first." };
  }
  if (options.useSpecificFolder && (!options.destPath || options.destPath === "")) {
    return { ok: false, message: "Destination folder is not set." };
  }

  var renderPrefix = options.renderPrefix;
  if (!renderPrefix || renderPrefix === "") renderPrefix = "autorender";

  var rq = app.project.renderQueue;
  for (var i = rq.items.length; i > 0; i--) {
    if (rq.items[i].status === RQItemStatus.QUEUED) {
      rq.items[i].remove();
    }
  }

  var item = rq.items.add(comp);
  var om = item.outputModules[1];
  try {
    om.applyTemplate(options.templateName);
  } catch (e) {
    item.remove();
    return {
      ok: false,
      message:
        'Template "' +
        options.templateName +
        '" not found. Check it still exists in your Output Module settings.',
    };
  }

  var originalName = decodeURI(om.file.name);
  var isSequence = originalName.indexOf("[#") !== -1;
  var extMatch = originalName.match(/(\.[a-zA-Z0-9]+)$/);
  var ext = extMatch ? extMatch[0] : "";

  // Filesystem read, but it depends on the extension the template just chose,
  // so it cannot be resolved panel-side without a second round trip.
  var getNextAutoNumber = function (dirPath: string): number {
    var folder = new Folder(dirPath);
    if (!folder.exists) return 1;
    var files = folder.getFiles();
    var maxNum = 0;
    var pattern = new RegExp("^" + escapeRegExp(renderPrefix) + "\\s*(\\d+)", "i");
    for (var f = 0; f < files.length; f++) {
      if (files[f] instanceof File) {
        var match = decodeURI(files[f].name).match(pattern);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    return maxNum + 1;
  };

  var buildDefaultName = function (dirPath: string): string {
    var name = renderPrefix + " " + getNextAutoNumber(dirPath);
    return name + (isSequence ? "_[#####]" + ext : ext);
  };

  var chosenFilePath = "";
  var defaultName = "";
  if (options.useSpecificFolder) {
    defaultName = buildDefaultName(options.destPath);
    chosenFilePath = options.destPath + "/" + defaultName;
  } else {
    var lastPath = app.settings.haveSetting(SETTINGS_SECTION, "lastRenderPath")
      ? app.settings.getSetting(SETTINGS_SECTION, "lastRenderPath")
      : "~/";
    if (!new Folder(lastPath).exists) lastPath = "~/";
    defaultName = buildDefaultName(lastPath);
    var outputFile = new File(lastPath + "/" + defaultName).saveDlg(
      "Save output as..."
    ) as File | null;
    if (!outputFile) {
      item.remove();
      return { ok: false, message: "" };
    }
    chosenFilePath = outputFile.fsName;
    app.settings.saveSetting(SETTINGS_SECTION, "lastRenderPath", outputFile.parent.fsName);
  }

  var fileObj = new File(chosenFilePath);
  var finalName = decodeURI(fileObj.name);
  if (isSequence) {
    if (finalName.indexOf("[#") === -1) {
      if (ext && finalName.toLowerCase().slice(-ext.length) === ext.toLowerCase()) {
        finalName = finalName.slice(0, -ext.length);
      }
      var suffixMatch = defaultName.match(/([^a-zA-Z0-9])?\[#+\].*$/);
      finalName += suffixMatch ? suffixMatch[0] : "_[#####]" + ext;
    }
  } else if (ext && finalName.toLowerCase().slice(-ext.length) !== ext.toLowerCase()) {
    finalName += ext;
  }
  om.file = new File(fileObj.parent.fsName + "/" + encodeURI(finalName));

  var selectedLayers = comp.selectedLayers;
  var hasSelection = selectedLayers.length > 0;
  var activeLayers: Layer[] = [];
  forEach(selectedLayers, function (layer) {
    if (layer.enabled && !layer.locked) activeLayers.push(layer);
  });

  var originalWorkAreaStart = comp.workAreaStart;
  var originalWorkAreaDuration = comp.workAreaDuration;
  var targetInPoint = comp.time;
  var topLayer: Layer | null = null;
  var failure = "";

  if (hasSelection) {
    var minIn = comp.duration;
    var maxOut = 0;
    var topIndex = 999999;
    forEach(selectedLayers, function (layer) {
      if (layer.inPoint < minIn) minIn = layer.inPoint;
      if (layer.outPoint > maxOut) maxOut = layer.outPoint;
      if (layer.index < topIndex) {
        topIndex = layer.index;
        topLayer = layer;
      }
    });

    forEach(activeLayers, function (layer) {
      (layer as AVLayer).solo = true;
    });
    targetInPoint = minIn;

    if (options.autoWorkArea && minIn < maxOut) {
      try {
        comp.workAreaStart = 0;
        comp.workAreaDuration = comp.duration;
        comp.workAreaStart = minIn;
        comp.workAreaDuration = maxOut - minIn;
      } catch (e) {}
    }
  }

  try {
    try {
      if (app.project.file !== null) app.project.save();
    } catch (e) {}
    try {
      app.purge(PurgeTarget.ALL_CACHES);
    } catch (e) {}

    rq.render();
    rq.showWindow(false);
    comp.openInViewer();
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    // Unmissable: a throw during the render must not leave layers soloed and
    // the work area moved, with nothing on screen explaining why.
    if (hasSelection) {
      try {
        forEach(activeLayers, function (layer) {
          (layer as AVLayer).solo = false;
        });
        if (options.autoWorkArea) {
          comp.workAreaStart = 0;
          comp.workAreaDuration = comp.duration;
          comp.workAreaStart = originalWorkAreaStart;
          comp.workAreaDuration = originalWorkAreaDuration;
        }
      } catch (e) {}
    }
  }

  if (failure !== "") {
    return { ok: false, message: "Render failed: " + failure };
  }

  var imported = false;
  if (options.autoImport) {
    // The only lasting, undoable change this function makes.
    app.beginUndoGroup("Import Render Result");
    try {
      var fileToImport: File | null = om.file;
      var seqFound = false;
      if (isSequence) {
        var targetFolder = new Folder(om.file.parent.fsName);
        var rawPrefix = decodeURI(finalName);
        var prefixName = rawPrefix.substring(0, rawPrefix.indexOf("[#"));
        var allFiles = targetFolder.getFiles();
        for (var g = 0; g < allFiles.length; g++) {
          var candidate = decodeURI(allFiles[g].name);
          if (
            candidate.indexOf(prefixName) === 0 &&
            candidate.toLowerCase().indexOf(ext.toLowerCase()) !== -1
          ) {
            fileToImport = allFiles[g] as File;
            seqFound = true;
            break;
          }
        }
      }

      if (fileToImport && fileToImport.exists) {
        var io = new ImportOptions(fileToImport);
        if (isSequence && seqFound) {
          io.sequence = true;
          io.forceAlphabetical = true;
        }
        var importedItem = app.project.importFile(io);
        if (isSequence && seqFound) {
          (importedItem as FootageItem).mainSource.conformFrameRate = comp.frameRate;
        }
        var newLayer = comp.layers.add(importedItem as AVItem);
        newLayer.startTime = targetInPoint;
        if (hasSelection && topLayer) {
          newLayer.moveBefore(topLayer);
        }
        imported = true;
      }
    } catch (e: any) {
      failure = e && e.message ? e.message : "unknown error";
    } finally {
      app.endUndoGroup();
    }
    comp.openInViewer();
  }

  if (failure !== "") {
    return { ok: false, message: "Rendered, but the auto-import failed: " + failure };
  }
  return {
    ok: true,
    message:
      "Rendered to " + decodeURI(finalName) + (imported ? " and imported." : "."),
  };
};

// --- Library imports ---------------------------------------------------------

var SEQUENCE_EXTS = ["png", "jpg", "jpeg", "tif", "tiff", "exr", "tga", "webp"];

/** Scale a layer to cover the comp, as the original did on every import. */
var scaleToCover = function (comp: CompItem, layer: AVLayer): void {
  if (!layer.width || !layer.height) return;
  var ratio =
    Math.max(comp.width / layer.width, comp.height / layer.height) * 100;
  (layer.property("Scale") as Property).setValue([ratio, ratio]);
};

/**
 * Import one file from the library and add it to the active comp.
 *
 * Ported from $.global.importMediaToAE. The undo group was already balanced on
 * every path; the changes are that guard messages are returned instead of
 * alert()ed and the group closes in a finally.
 */
export var importMedia = function (filePath: string): HostResult {
  var file = new File(filePath);
  if (!file.exists) {
    return { ok: false, message: "File not found on disk." };
  }

  var comp = app.project.activeItem;
  var hasComp = !!comp && comp instanceof CompItem;
  var targetLayer =
    hasComp && (comp as CompItem).selectedLayers.length > 0
      ? (comp as CompItem).selectedLayers[0]
      : null;

  var failure = "";
  var added = false;

  app.beginUndoGroup("Import Asset from Library");
  try {
    var io = new ImportOptions(file);
    try {
      io.sequence = false;
      io.forceAlphabetical = false;
    } catch (e) {
      // Some formats reject these options; the import itself still works.
    }

    var importedItem;
    try {
      importedItem = app.project.importFile(io);
    } catch (e) {
      failure = "After Effects cannot import this file format.";
      importedItem = null;
    }

    if (importedItem && hasComp) {
      var target = comp as CompItem;
      if (
        importedItem instanceof FootageItem ||
        importedItem instanceof CompItem
      ) {
        var newLayer = target.layers.add(importedItem) as AVLayer;
        newLayer.startTime = target.time;
        scaleToCover(target, newLayer);
        if (targetLayer && newLayer.index !== targetLayer.index) {
          newLayer.moveBefore(targetLayer);
        }
        added = true;
      }
    }
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    app.endUndoGroup();
  }

  if (failure !== "") {
    return { ok: false, message: failure };
  }
  return {
    ok: true,
    message: added
      ? "Added " + decodeURI(file.name) + " to the comp."
      : "Imported " + decodeURI(file.name) + " into the project.",
  };
};

/**
 * Import every image sequence in a folder, laid end to end from the playhead.
 *
 * Ported from $.global.importSequencesFromFolder. Same changes as importMedia,
 * plus: the original swallowed per-sequence failures in an empty catch, so a
 * folder where every sequence failed reported success. Failures are counted and
 * reported now.
 */
export var importSequences = function (folderPath: string): HostResult {
  var folder = new Folder(folderPath);
  if (!folder.exists) {
    return { ok: false, message: "Folder not found." };
  }

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    return { ok: false, message: "Select a composition first." };
  }

  var files = folder.getFiles();
  var imgFiles: File[] = [];
  for (var i = 0; i < files.length; i++) {
    if (files[i] instanceof File) {
      var parts = files[i].name.split(".");
      if (includes(SEQUENCE_EXTS, parts[parts.length - 1].toLowerCase())) {
        imgFiles.push(files[i] as File);
      }
    }
  }
  if (imgFiles.length === 0) {
    return { ok: false, message: "No image sequences found in that folder." };
  }

  imgFiles.sort(function (a, b) {
    var nameA = decodeURI(a.name).toLowerCase();
    var nameB = decodeURI(b.name).toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  // Group by everything except the trailing frame number.
  var pattern = /^(.*?)(\d+)(\.[a-zA-Z0-9]+)$/;
  var groups: { [key: string]: File[] } = {};
  for (var k = 0; k < imgFiles.length; k++) {
    var name = decodeURI(imgFiles[k].name);
    var match = name.match(pattern);
    var key = match ? match[1] + "___EXT___" + match[3] : name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(imgFiles[k]);
  }

  var imported = 0;
  var failed = 0;
  var failure = "";

  app.beginUndoGroup("Import Image Sequences");
  try {
    var insertTime = comp.time;
    for (var key2 in groups) {
      if (!groups.hasOwnProperty(key2)) continue;
      var seqFiles = groups[key2];
      if (seqFiles.length <= 1) continue;

      try {
        var io = new ImportOptions(seqFiles[0]);
        io.sequence = true;
        io.forceAlphabetical = false;
        var importedItem = app.project.importFile(io) as FootageItem;
        if (importedItem.mainSource && importedItem.mainSource.conformFrameRate) {
          importedItem.mainSource.conformFrameRate = comp.frameRate;
        }
        var newLayer = comp.layers.add(importedItem) as AVLayer;
        newLayer.startTime = insertTime;
        scaleToCover(comp, newLayer);
        insertTime += newLayer.outPoint - newLayer.inPoint;
        imported++;
      } catch (e) {
        // The original swallowed this silently, so a folder where every
        // sequence failed still looked like a success.
        failed++;
      }
    }
  } catch (e: any) {
    failure = e && e.message ? e.message : "unknown error";
  } finally {
    app.endUndoGroup();
  }

  if (failure !== "") {
    return { ok: false, message: "Import sequences failed: " + failure };
  }
  if (imported === 0) {
    return {
      ok: false,
      message:
        failed > 0
          ? "Found " + failed + " sequence(s) but none could be imported."
          : "No multi-frame sequences found in that folder.",
    };
  }
  return {
    ok: true,
    message:
      "Imported " +
      imported +
      (imported === 1 ? " sequence." : " sequences.") +
      (failed > 0 ? " " + failed + " failed." : ""),
  };
};

/**
 * Which engine the project is set to render with.
 *
 * Read-only, no mutation. Ported from $.global.getProjectRenderEngine.
 */
export var getProjectRenderEngine = function (): string {
  try {
    if (app.project && app.project.expressionEngine) {
      var isGPU = false;
      if (app.project.gpuAccelType !== undefined) {
        isGPU = app.project.gpuAccelType !== 0;
      }
      return isGPU ? "gpu" : "cpu";
    }
    return "cpu";
  } catch (e) {
    return "cpu";
  }
};
