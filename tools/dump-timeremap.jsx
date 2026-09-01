// Read-only. Dumps the Time Remap keyframes of the selected layer so two runs
// can be diffed exactly instead of eyeballed in the timeline.
//
// Run from After Effects: File > Scripts > Run Script File...
// Select exactly one layer first. Modifies nothing.

(function () {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("Open a composition first.");
    return;
  }

  var sel = comp.selectedLayers;
  if (sel.length !== 1) {
    alert("Select exactly one layer (currently " + sel.length + ").");
    return;
  }

  var layer = sel[0];
  var lines = [];
  lines.push("layer:       " + layer.name);
  lines.push("comp fps:    " + (1 / comp.frameDuration));
  lines.push("inPoint:     " + layer.inPoint.toFixed(6));
  lines.push("outPoint:    " + layer.outPoint.toFixed(6));
  lines.push("startTime:   " + layer.startTime.toFixed(6));
  lines.push("stretch:     " + layer.stretch);

  var tr = null;
  try {
    tr = layer.property("ADBE Time Remapping");
  } catch (e) {
    tr = null;
  }

  if (!tr) {
    lines.push("timeRemap:   ABSENT");
  } else {
    lines.push("timeRemap:   enabled, " + tr.numKeys + " keys");
    lines.push("");
    lines.push("idx  keyTime      keyValue");
    for (var i = 1; i <= tr.numKeys; i++) {
      lines.push(
        pad(i, 4) + pad(tr.keyTime(i).toFixed(6), 13) + tr.keyValue(i).toFixed(6)
      );
    }
  }

  function pad(s, n) {
    s = "" + s;
    while (s.length < n) {
      s += " ";
    }
    return s;
  }

  var text = lines.join("\n");

  // Offer to save so two runs can be diffed with a real diff tool.
  var f = File.saveDialog("Save time remap dump", "*.txt");
  if (f) {
    f.open("w");
    f.write(text);
    f.close();
    alert("Saved " + (tr ? tr.numKeys : 0) + " keys to:\n" + f.fsName);
  } else {
    alert(text.length > 1800 ? text.substring(0, 1800) + "\n…(truncated)" : text);
  }
})();
