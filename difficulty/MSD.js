/**
 * MSD (MinaCalc) difficulty calculator — faithful port of Etterna's MinaCalc.
 * Mirrors MinaCalc.cpp + SequencedBaseDiffCalc.h.
 *
 * Architecture:
 *   1. Walk NoteInfo into 0.5s intervals, split into left/right hand
 *   2. Compute per-hand NPSBase + MSBase per interval
 *   3. Run sequencers (FlamJam, TheThing, VOHT)
 *   4. Detect pattern modifiers per interval
 *   5. InitAdjDiff: base × pattern_mods × basescalers
 *   6. Chisel: binary-search the skill level where gotpoints ≥ reqpoints
 *   7. StamAdjust: stamina multiplier post-pass
 *   8. CalcMain: orchestrates above, computes stamina + overall
 */

// ─── Helper functions ───────────────────────────────────────────────────

function cvTruncFill(vals, count, dummy) {
  var arr = [];
  for (var i = 0; i < count; i++) {
    arr.push(i < vals.length ? vals[i] : dummy);
  }
  var mean = arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
  if (mean <= 0) return 0;
  var variance = arr.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / arr.length;
  return Math.sqrt(variance) / mean;
}

function sumTruncFill(vals, count, dummy) {
  var s = 0;
  for (var i = 0; i < count; i++) {
    s += i < vals.length ? vals[i] : dummy;
  }
  return s;
}

function calcMSEstimate(input, burp) {
  if (input.length === 0) return 0;
  var sorted = input.slice().sort(function(a, b) { return a - b; });
  var msDummy = 360.0;
  var cvVal = cvTruncFill(sorted, burp, msDummy) + 0.5;
  cvVal = Math.max(0.5, Math.min(cvVal, 1.25));
  var m = sumTruncFill(sorted, burp, msDummy);
  var bpmEst = msToBpm(m / (burp + 1));
  var npsEst = bpmEst / 15.0;
  return npsEst * cvVal;
}

function scalyMsEstimate(input, scaler) {
  var o = calcMSEstimate(input, 3);
  if (input.length > 3) o = Math.max(o, calcMSEstimate(input, 4) * scaler);
  if (input.length > 4) o = Math.max(o, calcMSEstimate(input, 5) * scaler * scaler);
  return o;
}

// ─── Interval walk ──────────────────────────────────────────────────────

function buildIntervals(notes, rate) {
  var scaled = notes.map(function(n) {
    return {
      rowNotes: n.notes_row,
      rowTime: n.row_time / rate,
      handCounts: [
        popcount(n.notes_row & HAND_COL_MASKS[0]),
        popcount(n.notes_row & HAND_COL_MASKS[1]),
      ],
    };
  });

  var lastTime = scaled.length > 0 ? scaled[scaled.length - 1].rowTime : 0;
  var numitv = Math.max(1, Math.ceil((lastTime + 0.001) / ITV_DURATION));

  var itvSize = new Array(numitv).fill(0);
  var adjNi = [];
  for (var i = 0; i < numitv; i++) adjNi.push([]);

  for (var si = 0; si < scaled.length; si++) {
    var row = scaled[si];
    var idx = Math.min(Math.floor(row.rowTime / ITV_DURATION), numitv - 1);
    adjNi[idx].push(row);
    itvSize[idx]++;
  }

  var mk2 = function() { return [new Array(numitv).fill(0), new Array(numitv).fill(0)]; };
  var mkSS = function() {
    return BOTH_HANDS.map(function() {
      return Array.from({ length: NUM_SKILLSET }, function() { return new Array(numitv).fill(0); });
    });
  };
  var mkPm = function() { return [new Array(numitv).fill(1), new Array(numitv).fill(1)]; };

  var metaItvInfoArr = BOTH_HANDS.map(function() {
    return Array.from({ length: numitv }, function() { return initializeMetaItvInfo(); });
  });
  var itvHandInfoArr = BOTH_HANDS.map(function() {
    return Array.from({ length: numitv }, function() { return createItvHandInfo(); });
  });

  return {
    numitv: numitv,
    itvSize: itvSize,
    adjNi: adjNi,
    initBaseDiffNPS: mk2(),
    initBaseDiffMS: mk2(),
    initBaseDiffCJ: mk2(),
    initBaseDiffTech: mk2(),
    itvPoints: mk2(),
    baseAdjDiff: mkSS(),
    baseDiffForStam: mkSS(),
    stamAdjDiff: new Array(numitv).fill(0),
    jackDiff: [[], []],
    maxPoints: 0,
    grindscaler: 1.0,
    musicRate: rate,
    seqFlamJam: new Array(numitv).fill(1),
    seqTheThing: new Array(numitv).fill(1),
    seqTheThing2: new Array(numitv).fill(1),
    seqVOHT: new Array(numitv).fill(1),
    itvTotalTaps: new Array(numitv).fill(0),
    itvJumpTaps: new Array(numitv).fill(0),
    depOHT: mkPm(),
    depOHJ: mkPm(),
    depMinijack: mkPm(),
    depBalance: mkPm(),
    depChaos: mkPm(),
    depWRBalance: mkPm(),
    depWRAnchor: mkPm(),
    depWRRoll: mkPm(),
    depWRJT: mkPm(),
    depWRJJ: mkPm(),
    depStream: mkPm(),
    depJS: mkPm(),
    depHS: mkPm(),
    depCJ: mkPm(),
    depCJDensity: mkPm(),
    metaItvInfo: metaItvInfoArr,
    itvHandInfo: itvHandInfoArr,
  };
}

// ─── NPS / MS base ──────────────────────────────────────────────────────

var MS_BASE_FINGER_W  = 5.5;
var MS_BASE_FINGER_W2 = 9.0;
var SCALER_FOR_MS_BASE = 1.175;

function computeBaseDiffs(calc) {
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    var handMask = HAND_COL_MASKS[hand];
    var handCols = [];
    for (var c = 0; c < 4; c++) {
      if (handMask & (1 << c)) handCols.push(c);
    }
    var fingerLastTime = handCols.map(function() { return -5.0; });

    for (var itv = 0; itv < calc.numitv; itv++) {
      var notes = 0;
      var fingerMs = handCols.map(function() { return []; });

      for (var ri = 0; ri < calc.adjNi[itv].length; ri++) {
        var row = calc.adjNi[itv][ri];
        var handNotes = row.rowNotes & handMask;
        notes += row.handCounts[hand];

        for (var fi = 0; fi < handCols.length; fi++) {
          var colBit = 1 << handCols[fi];
          if (handNotes & colBit) {
            if (fingerLastTime[fi] > -4.0) {
              fingerMs[fi].push(msFrom(row.rowTime, fingerLastTime[fi]));
            }
            fingerLastTime[fi] = row.rowTime;
          }
        }
      }

      var estimates = [];
      for (var fi = 0; fi < handCols.length; fi++) {
        if (fingerLastTime[fi] > -4.0) {
          estimates.push(scalyMsEstimate(fingerMs[fi], SCALER_FOR_MS_BASE));
        }
      }
      estimates.sort(function(a, b) { return b - a; });
      while (estimates.length < handCols.length) estimates.push(0);

      var msdiff = estimates[0];
      for (var ei = 1; ei < estimates.length; ei++) {
        msdiff = weightedAverage(msdiff, estimates[ei], MS_BASE_FINGER_W, MS_BASE_FINGER_W2);
      }

      var nps = notes * FINALSCALER * 1.83;
      var msbase = FINALSCALER * msdiff;

      calc.initBaseDiffNPS[hand][itv] = nps;
      calc.initBaseDiffMS[hand][itv] = msbase;
      calc.itvPoints[hand][itv] = notes * 2;
    }
  }
}

// ─── Jack diff ──────────────────────────────────────────────────────────

var JACK_MIN_MS = 95.0;
var JACK_LEN_CAP = 6;
var JACK_SPACING_BUFFER_MS = 250.0;
var JACK_SPEED_INCREASE_CUTOFF = 2.0;
var GUARANTEED_RESET_BUFFER_MS = 1000.0;

function jackColGetMs(j) {
  if (j.len > JACK_LEN_CAP) return j.lenCappedMs;
  if (j.len <= 1) return 5000;
  var totalMs = msFrom(j.lastNoteSec, j.startNoteSec);
  var _len = j.len - 1;
  var avgMs = totalMs / _len;
  var adjTotalMs = totalMs + 30.0 + avgMs * 1.5;
  var ms = adjTotalMs / _len;
  if (j.len === 2) {
    ms *= 1.1;
    ms = Math.max(ms, 180.0);
  }
  ms = Math.max(ms, JACK_MIN_MS);
  if (isNaN(ms)) ms = j.maxMs;
  if (j.len === JACK_LEN_CAP) j.lenCappedMs = ms;
  return ms;
}

function computeJackDiff(calc) {
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    var handMask = HAND_COL_MASKS[hand];
    var cols = [];
    for (var i = 0; i < 4; i++) {
      cols.push({ len: 1, maxMs: 5000, lastNoteSec: -5, startNoteSec: -5, lenCappedMs: 5000 });
    }
    var jacks = [];

    for (var itv = 0; itv < calc.numitv; itv++) {
      for (var ri = 0; ri < calc.adjNi[itv].length; ri++) {
        var row = calc.adjNi[itv][ri];
        for (var c = 0; c < 4; c++) {
          if (!(handMask & (1 << c))) continue;
          if (cols[c].lastNoteSec > -4) {
            if (msFrom(row.rowTime, cols[c].lastNoteSec) > GUARANTEED_RESET_BUFFER_MS) {
              cols[c] = { len: 1, maxMs: 5000, lastNoteSec: -5, startNoteSec: -5, lenCappedMs: 5000 };
            }
          }
        }
        for (var c = 0; c < 4; c++) {
          if (!(handMask & (1 << c))) continue;
          if (!(row.rowNotes & (1 << c))) continue;
          var j = cols[c];
          if (j.lastNoteSec < -4) {
            j.lastNoteSec = row.rowTime;
            j.startNoteSec = row.rowTime;
            continue;
          }
          var lastMs = msFrom(row.rowTime, j.lastNoteSec);
          if (lastMs > j.maxMs + JACK_SPACING_BUFFER_MS ||
              lastMs * JACK_SPEED_INCREASE_CUTOFF < j.maxMs) {
            j.startNoteSec = j.lastNoteSec;
            j.len = 2;
          } else {
            j.len++;
          }
          j.maxMs = lastMs;
          j.lastNoteSec = row.rowTime;
          var ms = jackColGetMs(j);
          if (ms < 5000) {
            jacks.push([row.rowTime, msToScaledNps(ms)]);
          }
        }
      }
    }
    calc.jackDiff[hand] = jacks;
  }
}

// ─── Grindscaler ────────────────────────────────────────────────────────

var GS_MIN_THRESHOLD = 0.65;
var GS_DOWNSCALE_LOGBASE = Math.log(6.2);

function computeGrindscaler(calc) {
  var populatedItvs = 0;
  var avgNotes = 0;
  for (var itv = 0; itv < calc.numitv; itv++) {
    var n = 0;
    for (var hi = 0; hi < BOTH_HANDS.length; hi++) n += calc.initBaseDiffNPS[BOTH_HANDS[hi]][itv];
    if (n > 0) { avgNotes += n; populatedItvs++; }
  }
  if (populatedItvs === 0) { calc.grindscaler = 0.1; return; }
  avgNotes /= populatedItvs;
  var failedItvs = 0;
  for (var itv = 0; itv < calc.numitv; itv++) {
    var n = 0;
    for (var hi = 0; hi < BOTH_HANDS.length; hi++) n += calc.initBaseDiffNPS[BOTH_HANDS[hi]][itv];
    if (n > 0 && n < avgNotes * GS_MIN_THRESHOLD) failedItvs++;
  }
  var fileLength = itvIdxToTime(populatedItvs - failedItvs);
  var ping = 0.3;
  var timescaler = (ping * (Math.log(fileLength + 1) / GS_DOWNSCALE_LOGBASE)) + ping;
  calc.grindscaler = Math.max(0.1, Math.min(timescaler, 1.0));
}

// ─── CJ and Tech base ──────────────────────────────────────────────────

function computeCJAndTechBase(calc) {
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    var handMask = HAND_COL_MASKS[hand];
    var CJ_MIN_MS = 75.0;
    var STATIC_MS_WEIGHT = 0.65;

    for (var itv = 0; itv < calc.numitv; itv++) {
      var lastChordTime = -5.0;
      var lastRowNotes = 0, lastLastRowNotes = 0;
      var lastRowCount = 0, lastLastRowCount = 0;
      var chain = 1;
      var msVals = [];
      var chordBonk = [];
      var MEDITERRANEAN = 10;

      for (var ri = 0; ri < calc.adjNi[itv].length; ri++) {
        var row = calc.adjNi[itv][ri];
        var handNotes = row.rowNotes & handMask;
        var pc = popcount(handNotes);
        if (pc === 0) continue;

        var isContinuingJack = (handNotes & lastRowNotes) !== 0;

        if (isContinuingJack) chain++;
        else chain = 1;

        chordBonk.push(handNotes === lastRowNotes ? 1 : 0);
        if (chordBonk.length > MEDITERRANEAN) chordBonk.shift();

        if (lastChordTime > -4.0) {
          var ms = msFrom(row.rowTime, lastChordTime);
          var pewpew = 1.2;
          if (chain < 3) pewpew *= 1.1;
          if (chain === 3) pewpew /= 1.1;
          var laguardiaairport = 0;
          for (var bi = 0; bi < chordBonk.length; bi++) laguardiaairport += chordBonk[bi];
          pewpew *= Math.pow(1.025, laguardiaairport);
          ms = Math.max(CJ_MIN_MS, ms * pewpew);
          msVals.push(ms);
        }

        lastLastRowNotes = lastRowNotes;
        lastRowNotes = handNotes;
        lastLastRowCount = lastRowCount;
        lastRowCount = pc;
        lastChordTime = row.rowTime;
      }

      if (msVals.length === 0) {
        calc.initBaseDiffCJ[hand][itv] = 0;
      } else {
        var mode = {};
        for (var mi = 0; mi < msVals.length; mi++) {
          var k = Math.round(msVals[mi]);
          mode[k] = (mode[k] || 0) + 1;
        }
        var modeVal = msVals[0], modeFreq = 0;
        for (var mk in mode) {
          if (mode[mk] > modeFreq) { modeVal = parseInt(mk); modeFreq = mode[mk]; }
        }
        var weighted = msVals.map(function(v) { return weightedAverage(v, modeVal, STATIC_MS_WEIGHT, 1.0); });
        var msMean = weighted.reduce(function(a, b) { return a + b; }, 0) / weighted.length;
        calc.initBaseDiffCJ[hand][itv] = msToScaledNps(msMean);
      }

      // Tech base
      var anyMsWindow = new CalcMovingWindow();
      anyMsWindow.fill(5000);
      var scMsWindows = [new CalcMovingWindow(), new CalcMovingWindow()];
      scMsWindows[0].fill(5000);
      scMsWindows[1].fill(5000);
      var colLastTimes = [-5.0, -5.0];
      var tcStatic = [];
      for (var ri = 0; ri < calc.adjNi[itv].length; ri++) {
        var row = calc.adjNi[itv][ri];
        var handNotes = row.rowNotes & handMask;
        var pc = popcount(handNotes);
        if (pc === 0) continue;

        var activeCols = [];
        for (var c = 0; c < 4; c++) {
          if (handNotes & (1 << c)) activeCols.push(c);
        }

        var anyMs = 5000;
        if (ri > 0) {
          anyMs = msFrom(row.rowTime, calc.adjNi[itv][ri - 1].rowTime);
        }
        anyMsWindow.push(anyMs);

        for (var aci = 0; aci < activeCols.length; aci++) {
          var col = activeCols[aci];
          var localCol = hand === LEFT_HAND ? col : col - 2;
          if (localCol < 0 || localCol > 1) continue;
          var sameMs = colLastTimes[localCol] > -4.0 ? msFrom(row.rowTime, colLastTimes[localCol]) : 5000;
          colLastTimes[localCol] = row.rowTime;
          scMsWindows[localCol].push(sameMs);

          var otherLocalCol = localCol === 0 ? 1 : 0;
          var otherMs;
          if (activeCols.length > 1) {
            otherMs = scMsWindows[otherLocalCol].getNow();
          } else {
            otherMs = scMsWindows[otherLocalCol].getNow();
          }

          var c = (sameMs + otherMs) / 2;
          var pineapple = anyMsWindow.getCvOfWindow(4);
          var porcupine = scMsWindows[0].getCvOfWindow(4);
          var sequins = scMsWindows[1].getCvOfWindow(4);
          var oioi = 0.5;
          var ioio = 0.5;
          pineapple = Math.min(Math.max(pineapple + oioi, oioi), ioio + oioi);
          porcupine = Math.min(Math.max(porcupine + oioi, oioi), ioio + oioi);
          sequins = Math.min(Math.max(sequins + oioi, oioi), ioio + oioi);
          var vertebrae = Math.min(Math.max((pineapple + porcupine + sequins) / 3.0, oioi), ioio + oioi);
          tcStatic.push(c / vertebrae);
        }
      }

      if (tcStatic.length === 0) {
        calc.initBaseDiffTech[hand][itv] = calc.initBaseDiffNPS[hand][itv];
      } else {
        var mean = tcStatic.reduce(function(a, b) { return a + b; }, 0) / tcStatic.length;
        var npsBase = calc.initBaseDiffNPS[hand][itv];
        var tcBase = msToScaledNps(mean);
        calc.initBaseDiffTech[hand][itv] = weightedAverage(tcBase, npsBase, 4.0, 9.0);
      }
    }
  }
}

// ─── StamAdjust ─────────────────────────────────────────────────────────

function stamAdjust(x, ss, calc, hand) {
  var baseDiff = calc.baseDiffForStam[hand][ss];
  var diff = calc.baseAdjDiff[hand][ss];
  var stamFloor = 0.95;
  var mod = 0.95;
  var avs2 = 0;
  for (var i = 0; i < calc.numitv; i++) {
    var avs1 = avs2;
    avs2 = baseDiff[i];
    mod += ((((avs1 + avs2) / 2.0) / (STAM_PROP * x)) - 1.0) / STAM_MAG;
    if (mod > 0.95) stamFloor += (mod - 0.95) / STAM_FSCALE;
    var localCeil = STAM_CEIL * stamFloor;
    mod = Math.min(Math.max(mod, stamFloor), Math.min(localCeil, SUPER_STAM_CEIL));
    calc.stamAdjDiff[i] = diff[i] * mod;
  }
}

// ─── CalcInternal ───────────────────────────────────────────────────────

function calcInternal(x, ss, stam, calc, hand) {
  if (stam) stamAdjust(x, ss, calc, hand);
  var v = stam ? calc.stamAdjDiff : calc.baseAdjDiff[hand][ss];
  var plPow = ss === Skill.Technical ? PTLOSS_POW_TECH : PTLOSS_POW_DEFAULT;
  var lostPoints = 0;
  for (var i = 0; i < calc.numitv; i++) {
    if (x < v[i]) {
      var pts = calc.itvPoints[hand][i];
      lostPoints += pts - pts * fastpow(x / v[i], plPow);
    }
  }
  return lostPoints;
}

// ─── Jackloss ───────────────────────────────────────────────────────────

function jackloss(x, calc, hand, stam) {
  var v = stam ? jackStamAdjust(x, calc, hand) : calc.jackDiff[hand];
  var total = 0;
  for (var i = 0; i < v.length; i++) {
    var diff = v[i][1];
    if (x < diff && diff > 0) {
      total += Math.max(12.0 * erf(0.04 * (diff - x)), 0);
    }
  }
  return total;
}

function jackStamAdjust(x, calc, hand) {
  var jStamCeil = 1.05234;
  var jStamMag = 23.0;
  var jStamFscale = 750.0;
  var jStamProp = 0.49424;
  var superCeil = 1.01;
  var stamFloor = 0.95;
  var mod = 1.0;
  var avs2 = 0;
  var diff = calc.jackDiff[hand];
  var output = [];
  for (var i = 0; i < diff.length; i++) {
    var avs1 = avs2;
    avs2 = diff[i][1];
    mod += ((((avs1 + avs2) / 2.0) / (jStamProp * x)) - 1.0) / jStamMag;
    if (mod > 0.95) stamFloor += (mod - 0.95) / jStamFscale;
    var localCeil = jStamCeil * stamFloor;
    mod = Math.min(Math.max(mod, stamFloor), Math.min(localCeil, superCeil));
    output.push([diff[i][0], diff[i][1] * mod]);
  }
  return output;
}

// ─── Chisel ─────────────────────────────────────────────────────────────

function chisel(playerSkill, resolution, scoreGoal, ss, stamina, calc) {
  if (ss === Skill.Overall || ss === Skill.Stamina) return MIN_RATING;
  var reqPoints = calc.maxPoints * scoreGoal;

  var pbm = ss === Skill.Technical ? TECH_PBM
    : ss === Skill.JackSpeed ? JACK_PBM
    : ss === Skill.Stream ? STREAM_PBM
    : OTHER_PBM;

  var calcGotpoints = function(skill) {
    var gotpoints = calc.maxPoints * pbm;
    for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
      var hand = BOTH_HANDS[hi];
      if (ss === Skill.JackSpeed) {
        gotpoints -= jackloss(skill, calc, hand, stamina);
      } else {
        gotpoints -= calcInternal(skill, ss, stamina, calc, hand);
      }
      if (ss === Skill.Technical) {
        var maxJackCap = calc.maxPoints * 0.1;
        gotpoints -= Math.sqrt(Math.min(
          maxJackCap,
          jackloss(skill * 0.75, calc, hand, stamina) * 0.85
        ));
      }
    }
    return gotpoints;
  };

  var currSkill = playerSkill;
  var currRes = resolution;

  do {
    if (currSkill > MAX_RATING) return MIN_RATING;
    currSkill += currRes;
  } while (calcGotpoints(currSkill) < reqPoints);

  currSkill -= currRes;
  currRes /= 2;

  for (var iter = 0; iter < 7; iter++) {
    if (currSkill > MAX_RATING) return MIN_RATING;
    currSkill += currRes;
    if (calcGotpoints(currSkill) > reqPoints) {
      currSkill -= currRes;
    }
    currRes /= 2;
  }

  return currSkill + 2.0 * currRes;
}

// ─── aggregate_skill ────────────────────────────────────────────────────

function aggregateSkill(values, deltaMul, resultMul, startRating, resolution) {
  if (deltaMul === undefined) deltaMul = 0.25;
  if (resultMul === undefined) resultMul = 1.11;
  if (startRating === undefined) startRating = 0.0;
  if (resolution === undefined) resolution = 10.24;

  var rating = startRating;
  for (var i = 0; i < 11; i++) {
    var sum;
    do {
      rating += resolution;
      sum = 0;
      for (var vi = 0; vi < values.length; vi++) {
        sum += Math.max(0, 2.0 / erfc(deltaMul * (values[vi] - rating)) - 2.0);
      }
    } while (Math.pow(2, rating * 0.1) < sum);
    rating -= resolution;
    resolution /= 2;
  }
  rating += resolution * 2;
  return rating * resultMul;
}

// ─── calculateMSD ───────────────────────────────────────────────────────

function calculateMSD(notes, musicRate) {
  if (musicRate === undefined) musicRate = 1.0;
  var zero = { stream: 0, jumpstream: 0, handstream: 0, chordjack: 0,
    technical: 0, jackSpeed: 0, stamina: 0, overall: 0 };
  if (notes.length <= 1) return zero;

  var calc = buildIntervals(notes, musicRate);
  computeBaseDiffs(calc);
  computeCJAndTechBase(calc);
  computeJackDiff(calc);
  runSequencers(calc);

  calc.maxPoints = 0;
  for (var itv = 0; itv < calc.numitv; itv++) {
    calc.maxPoints += calc.itvPoints[LEFT_HAND][itv] + calc.itvPoints[RIGHT_HAND][itv];
  }
  if (calc.maxPoints <= 0) return zero;

  initAdjDiff(calc);

  var ssValues = new Array(NUM_SKILLSET).fill(0);
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall || ss === Skill.Stamina) continue;
    ssValues[ss] = chisel(0.1, 10.24, DEFAULT_SCORE_GOAL, ss, false, calc);
  }

  var highestBaseSS = 0;
  var highestBaseVal = -1;
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall || ss === Skill.Stamina) continue;
    if (ssValues[ss] > highestBaseVal) { highestBaseVal = ssValues[ss]; highestBaseSS = ss; }
  }
  var base = ssValues[highestBaseSS];

  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall || ss === Skill.Stamina) continue;
    if (ssValues[ss] > base * 0.9) {
      ssValues[ss] = chisel(ssValues[ss] * 0.9, 0.32, DEFAULT_SCORE_GOAL, ss, true, calc);
    }
  }

  var highestStamAdjSS = highestBaseSS;
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall || ss === Skill.Stamina) continue;
    if (ssValues[ss] > ssValues[highestStamAdjSS]) highestStamAdjSS = ss;
  }

  var highestStamAdjVal = ssValues[highestBaseSS];
  if (highestStamAdjSS === Skill.JackSpeed) highestStamAdjVal *= 0.8;
  var stamAdjMult = Math.pow((highestStamAdjVal / Math.max(base, 0.01)) - STAM_CURVE_SHIFT, 2.5);
  stamAdjMult = Math.max(0.8, Math.min(stamAdjMult, 1.08));
  ssValues[Skill.Stamina] = highestStamAdjVal * stamAdjMult * BASE_SCALERS[Skill.Stamina];

  var agg = aggregateSkill(ssValues, 0.25, 1.11, 0.0, 10.24);
  var highest = Math.max.apply(null, ssValues);
  ssValues[Skill.Overall] = Math.max(agg, highest);

  var r2 = function(v) { return Math.round(v * 100) / 100; };
  return {
    stream:     r2(ssValues[Skill.Stream]),
    jumpstream: r2(ssValues[Skill.Jumpstream]),
    handstream: r2(ssValues[Skill.Handstream]),
    chordjack:  r2(ssValues[Skill.Chordjack]),
    technical:  r2(ssValues[Skill.Technical]),
    jackSpeed:  r2(ssValues[Skill.JackSpeed]),
    stamina:    r2(ssValues[Skill.Stamina]),
    overall:    r2(ssValues[Skill.Overall]),
  };
}
