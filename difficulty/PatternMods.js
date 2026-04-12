/**
 * PatternMods — per-interval proportion-based pattern modifier functions.
 * Mirrors Etterna's HA_PatternMods/ + HD_PatternMods/ (simplified).
 * Each pm*() returns a modifier in roughly [0.3 .. 1.3].
 * ssPatternProduct() combines them per skillset, matching Ulbu.h assignments.
 */

// ─── Per-interval pattern data (computed from rows) ─────────────────────

function getItvPatternData(calc, hand, itv) {
  var rows = calc.adjNi[itv];
  var handMask = HAND_COL_MASKS[hand];

  var totalRows = 0, singleRows = 0, chordRows = 0, jumpRows = 0;
  var handRows = 0, handChordRows = 0;
  var rollPatterns = 0, trillPatterns = 0, mjCount = 0;
  var prevCol = -1, prevPrevCol = -1;
  var leftCol = 0, rightCol = 0;

  for (var ri = 0; ri < rows.length; ri++) {
    var r = rows[ri];
    var handNotes = r.rowNotes & handMask;
    var hpc = popcount(handNotes);
    var pc = popcount(r.rowNotes);

    if (hpc === 0) continue;
    totalRows++;
    if (hpc === 1) singleRows++;
    if (hpc >= 2) { chordRows++; handChordRows++; }
    if (pc === 2) jumpRows++;
    if (pc >= 3) handRows++;

    if (hpc === 1) {
      if (prevCol > 0 && prevPrevCol > 0) {
        if (handNotes === prevPrevCol && handNotes !== prevCol) trillPatterns++;
        if (handNotes === prevCol) rollPatterns++;
      }
      prevPrevCol = prevCol;
      prevCol = handNotes;
    } else {
      prevPrevCol = -1;
      prevCol = -1;
    }

    for (var c = 0; c < 4; c++) {
      if (!(handMask & (1 << c))) continue;
      if (handNotes & (1 << c)) {
        if (c < 2) leftCol++; else rightCol++;
      }
    }

    if (ri > 0) {
      var prev = rows[ri - 1];
      if ((r.rowNotes & prev.rowNotes & handMask) !== 0) {
        var ms = msFrom(r.rowTime, prev.rowTime);
        if (ms > 0 && ms < 120) mjCount++;
      }
    }
  }

  if (totalRows === 0) {
    return { singleProp: 1, chordProp: 0, jumpProp: 0, handProp: 0,
      handChordProp: 0, rollProp: 0, trillProp: 0, balanceRatio: 0.5,
      timingCv: 0, mjProp: 0 };
  }

  var timingCv = 0;
  if (rows.length > 2) {
    var deltas = [];
    for (var i = 1; i < rows.length; i++) {
      var d = rows[i].rowTime - rows[i - 1].rowTime;
      if (d > 0) deltas.push(d);
    }
    if (deltas.length > 1) {
      var m = deltas.reduce(function(a, b) { return a + b; }, 0) / deltas.length;
      var v = deltas.reduce(function(s, d) { return s + (d - m) * (d - m); }, 0) / deltas.length;
      timingCv = m > 0 ? Math.sqrt(v) / m : 0;
    }
  }

  var balanceRatio = (leftCol > 0 && rightCol > 0)
    ? Math.min(leftCol, rightCol) / Math.max(leftCol, rightCol) : 0.5;

  return {
    singleProp: singleRows / totalRows,
    chordProp:  chordRows / totalRows,
    jumpProp:   jumpRows / rows.length,
    handProp:   handRows / rows.length,
    handChordProp: handChordRows / totalRows,
    rollProp:   totalRows > 2 ? rollPatterns / totalRows : 0,
    trillProp:  totalRows > 2 ? trillPatterns / totalRows : 0,
    balanceRatio: balanceRatio,
    timingCv: timingCv,
    mjProp:     totalRows > 1 ? mjCount / totalRows : 0,
  };
}

// ─── Individual pattern mod functions ───────────────────────────────────

function pmStream(d) {
  return Math.max(0.5, Math.min(0.6 + d.singleProp * 0.5, 1.1));
}
function pmJS(d) {
  var raw = d.jumpProp > 0.05 ? 0.5 + Math.min(d.jumpProp * d.singleProp * 4.0, 0.6) : 0.5;
  return Math.max(0.4, Math.min(raw, 1.1));
}
function pmHS(d) {
  return Math.max(0.3, Math.min(0.5 + d.handProp * 3.0, 1.1));
}
function pmCJ(d) {
  var raw = d.chordProp > 0.3 ? 0.6 + Math.min((d.chordProp - 0.3) * 2.0, 0.5) : 0.5 * d.chordProp / 0.3;
  return Math.max(0.2, Math.min(raw, 1.15));
}
function pmOHJ(d) {
  return Math.max(0.5, 1.0 - d.handChordProp * 0.6);
}
function pmRoll(d) {
  return Math.max(0.5, 1.0 - d.rollProp * 1.5);
}
function pmWRR(d) {
  return Math.max(0.6, 1.0 - d.rollProp * 0.8);
}
function pmWRJT(d) {
  return Math.max(0.5, 1.0 - d.trillProp * 1.2);
}
function pmWRJJ(d) {
  return Math.max(0.6, 1.0 - d.trillProp * 0.6);
}
function pmFlamJam(calc, itv) {
  return calc.seqFlamJam[itv];
}
function pmBalance(d) {
  return Math.max(0.7, 0.6 + d.balanceRatio * 0.4);
}
function pmVOHTrill(calc, itv) {
  return calc.seqVOHT[itv];
}
function pmChaos(d) {
  return Math.max(0.7, Math.min(0.7 + d.timingCv * 0.8, 1.3));
}
function pmMinijack(d) {
  return Math.max(0.6, 1.0 - d.mjProp * 1.5);
}
function pmTheThing(calc, itv) {
  return calc.seqTheThing[itv];
}
function pmRollJS(d) {
  return Math.max(0.6, 1.0 - d.rollProp * 1.0);
}
function pmHSDensity(d) {
  return Math.max(0.5, Math.min(0.5 + d.handProp * 2.5, 1.2));
}

// ─── Product of pattern mods per skillset ───────────────────────────────

function ssPatternProduct(ss, d, calc, itv) {
  var p = 1.0;
  switch (ss) {
    case Skill.Stream:
      p *= pmStream(d) * pmVOHTrill(calc, itv) * pmRoll(d) * pmWRR(d) * pmWRJT(d)
         * pmWRJJ(d) * pmFlamJam(calc, itv);
      break;
    case Skill.Jumpstream:
      p *= pmJS(d) * pmVOHTrill(calc, itv) * pmWRJT(d) * pmWRJJ(d) * pmRollJS(d)
         * pmFlamJam(calc, itv) * pmBalance(d);
      break;
    case Skill.Handstream:
      p *= pmHS(d) * pmOHJ(d) * pmTheThing(calc, itv) * pmWRR(d) * pmWRJT(d)
         * pmWRJJ(d) * pmVOHTrill(calc, itv) * pmFlamJam(calc, itv) * pmHSDensity(d);
      break;
    case Skill.Chordjack:
      p *= pmCJ(d) * pmWRJT(d) * pmVOHTrill(calc, itv) * pmFlamJam(calc, itv);
      break;
    case Skill.Technical:
      p *= pmVOHTrill(calc, itv) * pmBalance(d) * pmRoll(d) * pmChaos(d) * pmWRJT(d)
         * pmWRJJ(d) * pmWRR(d) * pmFlamJam(calc, itv) * pmMinijack(d) * pmTheThing(calc, itv);
      break;
  }
  return p;
}
