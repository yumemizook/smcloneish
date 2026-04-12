/**
 * SSR (Score-Specific Rating) — rates a specific score on a chart.
 *
 * In Etterna, SSR is computed by re-running the full Chisel + stamina
 * pipeline at the player's score goal. This file provides both:
 *   - calculateSSRFromNotes: full re-run (accurate, needs NoteInfo[])
 *   - calculateSSR: approximation from pre-computed MSD (fallback)
 *
 * References:
 *   - ScoreManager.cpp  → RecalculateSSRs / CalcPlayerRating
 *   - MinaCalcHelpers.h → aggregate_skill, downscale_low_accuracy_scores
 *   - MinaCalc.cpp      → CalcMain (ssrcap, grindscaler, stam handling)
 */

var LOW_ACC_CUTOFF = 0.9;
var SSR_GOAL_CAP = 0.965;
var SSR_CAP = 40.0;

function downscaleLowAccuracy(f, scoreGoal) {
  if (scoreGoal >= LOW_ACC_CUTOFF) return f;
  return Math.min(
    Math.max(f / Math.pow(1.0 + (LOW_ACC_CUTOFF - scoreGoal), 3.25), MIN_RATING),
    MAX_RATING
  );
}

/**
 * Full SSR calculation by re-running the Chisel pipeline at the player's
 * score goal (matching Etterna's CalcMain ssr path).
 */
function calculateSSRFromNotes(notes, wifePercent, musicRate) {
  if (musicRate === undefined) musicRate = 1.0;
  var zero = { stream: 0, jumpstream: 0, handstream: 0, chordjack: 0,
    technical: 0, jackSpeed: 0, stamina: 0, overall: 0 };
  if (notes.length <= 1) return zero;

  var scoreGoal = Math.min(wifePercent / 100.0, SSR_GOAL_CAP);

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
  computeGrindscaler(calc);

  var ssValues = new Array(NUM_SKILLSET).fill(0);
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall || ss === Skill.Stamina) continue;
    ssValues[ss] = chisel(0.1, 10.24, scoreGoal, ss, false, calc);
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
      ssValues[ss] = chisel(ssValues[ss] * 0.9, 0.32, scoreGoal, ss, true, calc);
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

  // Downscale low accuracy and cap
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall) continue;
    ssValues[ss] = downscaleLowAccuracy(ssValues[ss], scoreGoal);
    ssValues[ss] = Math.min(ssValues[ss], SSR_CAP);
    if (highestStamAdjSS === Skill.JackSpeed) {
      ssValues[ss] = downscaleLowAccuracy(ssValues[ss], scoreGoal);
    }
  }

  // Overall
  var agg = aggregateSkill(ssValues, 0.25, 1.11, 0.0, 10.24);
  var highest = Math.max.apply(null, ssValues);
  ssValues[Skill.Overall] = Math.max(agg, highest);

  // Grindscaler
  var highestFinalSS = Skill.Overall;
  var highestFinalSSV = -1;
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    if (ss === Skill.Overall) continue;
    if (ssValues[ss] > highestFinalSSV) { highestFinalSS = ss; highestFinalSSV = ssValues[ss]; }
  }
  var gs = calc.grindscaler;
  if (highestFinalSS === Skill.JackSpeed || highestFinalSS === Skill.Chordjack) {
    gs = Math.sqrt(gs);
  }
  for (var ss = 0; ss < NUM_SKILLSET; ss++) {
    ssValues[ss] *= gs;
  }

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

/**
 * Approximate SSR from pre-computed MSD values.
 * Simpler but less accurate than calculateSSRFromNotes.
 */
function calculateSSRApprox(msd, wifePercent, playbackRate) {
  if (playbackRate === undefined) playbackRate = 1.0;
  var scoreGoal = Math.min(wifePercent / 100.0, SSR_GOAL_CAP);
  var DEFAULT_GOAL = 0.93;
  var goalRatio = scoreGoal / DEFAULT_GOAL;
  var goalScalar = Math.pow(goalRatio, 2.0);

  var skillsets = ['stream', 'jumpstream', 'handstream', 'chordjack', 'technical', 'jackSpeed', 'stamina'];
  var ssrValues = [];
  var result = {};

  for (var i = 0; i < skillsets.length; i++) {
    var ss = skillsets[i];
    var val = msd[ss] * goalScalar * playbackRate;
    val = downscaleLowAccuracy(val, scoreGoal);
    val = Math.min(val, SSR_CAP);
    val = Math.max(val, MIN_RATING);
    result[ss] = Math.round(val * 100) / 100;
    ssrValues.push(val);
  }

  var agg = aggregateSkill(ssrValues, 0.25, 1.11, 0.0, 10.24);
  var highest = Math.max.apply(null, ssrValues);
  result.overall = Math.round(Math.max(agg, highest) * 100) / 100;

  return result;
}
