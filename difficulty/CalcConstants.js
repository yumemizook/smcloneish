/**
 * CalcConstants — shared constants, enums, and utilities for the MinaCalc port.
 * Mirrors Etterna's SequencingHelpers.h + PatternModHelpers.h.
 */

// ─── Result type ────────────────────────────────────────────────────────
// MSDResult: { stream, jumpstream, handstream, chordjack, technical, jackSpeed, stamina, overall }

// ─── Etterna constants ─────────────────────────────────────────────────
var FINALSCALER  = 3.632 * 1.06;
var ITV_DURATION = 0.5;
var MAX_RATING   = 100.0;
var MIN_RATING   = 0.0;
var DEFAULT_SCORE_GOAL = 0.93;

// Stamina model params (MinaCalc.cpp — StamAdjust)
var STAM_CEIL     = 1.075234;
var STAM_MAG      = 243.0;
var STAM_FSCALE   = 500.0;
var STAM_PROP     = 0.69424;
var SUPER_STAM_CEIL = 1.09;

// CalcInternal point-loss power
var PTLOSS_POW_DEFAULT = 1.7;
var PTLOSS_POW_TECH    = 2.0;

// Point buffer multipliers
var TECH_PBM   = 1.0;
var JACK_PBM   = 1.0175;
var STREAM_PBM = 1.01;
var OTHER_PBM  = 1.0;

// Basescalers — exact values from Ulbu.h
// Order: Overall, Stream, JS, HS, Stamina, JackSpeed, CJ, Technical
var BASE_SCALERS = [0.0, 0.91, 0.75, 0.77, 0.93, 1.01, 1.06, 1.06];

var STAM_CURVE_SHIFT = 0.015;

// Skillset indices
var Skill = {
  Overall:    0,
  Stream:     1,
  Jumpstream: 2,
  Handstream: 3,
  Stamina:    4,
  JackSpeed:  5,
  Chordjack:  6,
  Technical:  7,
};
var NUM_SKILLSET = 8;

// Hand enum
var LEFT_HAND  = 0;
var RIGHT_HAND = 1;
var BOTH_HANDS = [LEFT_HAND, RIGHT_HAND];
var HAND_COL_MASKS = [0b0011, 0b1100];

var MAX_MOVING_WINDOW_SIZE = 6;

// ─── Tap size enum ─────────────────────────────────────────────────────
var tap_size = {
  single: 0,
  jump: 1,
  hand: 2,
  quad: 3,
  num_tap_size: 4,
};

// ─── Meta type / base type enums ────────────────────────────────────────
var meta_type = {
  meta_type_init: 0,
  meta_cccccc: 1,
  meta_ccacc: 2,
  meta_acca: 3,
  meta_enigma: 4,
  meta_meta_enigma: 5,
  meta_unknowable_enigma: 6,
  meta_ccsjjscc: 7,
  meta_ccsjjscc_inverted: 8,
};

var base_type = {
  base_single_single: 0,
  base_single_jump: 1,
  base_jump_single: 2,
  base_jump_jump: 3,
};

// ─── Utility functions ──────────────────────────────────────────────────

function popcount(n) {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function msFrom(now, last) {
  return (now - last) * 1000.0;
}

function msToBpm(ms) {
  return 15000.0 / ms;
}

function fastpow(base, exp) {
  return Math.pow(base, exp);
}

function fastsqrt(x) {
  return Math.sqrt(x);
}

function CalcClamp(val, min, max) {
  return Math.max(min, Math.min(val, max));
}

function erf(x) {
  var a1 =  0.254829592;
  var a2 = -0.284496736;
  var a3 =  1.421413741;
  var a4 = -1.453152027;
  var a5 =  1.061405429;
  var p  =  0.3275911;
  var sign = x < 0 ? -1 : 1;
  var ax = Math.abs(x);
  var t = 1.0 / (1.0 + p * ax);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function erfc(x) {
  return 1.0 - erf(x);
}

function msToScaledNps(ms) {
  return ms > 0 ? (1000.0 / ms) * FINALSCALER : 0;
}

function itvIdxToTime(idx) {
  return idx * ITV_DURATION;
}

function weightedAverage(a, b, w1, w2) {
  return (a * w1 + b * w2) / (w1 + w2);
}

function div_high_by_low(a, b) {
  return b > 0 ? a / b : 1.0;
}

function div_low_by_high(a, b) {
  return b > 0 ? a / b : 0.0;
}

function diff_high_by_low(a, b) {
  var high = Math.max(a, b);
  var low = Math.min(a, b);
  return low > 0 ? high / low : 0;
}

function cv(arr) {
  if (arr.length === 0) return 0;
  var mean = arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
  if (mean <= 0) return 0;
  var variance = arr.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / arr.length;
  return Math.sqrt(variance) / mean;
}

var neutral = 1.0;

// ─── Column helpers ─────────────────────────────────────────────────────
var col_left = 0;
var col_right = 1;
var col_ids = [0, 1, 2, 3];

function is_jack_at_col(col, notes, last_notes) {
  var mask = 1 << col;
  return (notes & mask) !== 0 && (last_notes & mask) !== 0;
}

function column_count(notes) {
  return popcount(notes);
}

function is_alternating_chord_stream(notes, last_notes, last_last_notes) {
  var cc = popcount(notes) >= 2 && popcount(last_notes) >= 2 && popcount(last_last_notes) >= 2;
  if (!cc) return false;
  return (notes & last_notes) === 0 && (last_notes & last_last_notes) === 0 && (notes & last_last_notes) !== 0;
}

function is_alternating_chord_single(count, last_count) {
  return (count >= 2 && last_count === 1) || (count === 1 && last_count >= 2);
}

// ─── ItvHandInfo helpers ────────────────────────────────────────────────

function createItvHandInfo(window_size) {
  if (window_size === undefined) window_size = 5;
  return {
    col_taps: [0, 0],
    col_taps_window: [[], []],
    window_idx: 0,
    window_size: window_size,
  };
}

function get_taps_nowi(itvhi) {
  return itvhi.col_taps[col_left] + itvhi.col_taps[col_right];
}

function get_taps_nowf(itvhi) {
  return itvhi.col_taps[col_left] + itvhi.col_taps[col_right];
}

function get_col_taps_nowi(itvhi, col) {
  return itvhi.col_taps[col];
}

function cols_equal_now(itvhi) {
  return itvhi.col_taps[col_left] === itvhi.col_taps[col_right];
}

function get_col_prop_low_by_high(itvhi) {
  var low = Math.min(itvhi.col_taps[col_left], itvhi.col_taps[col_right]);
  var high = Math.max(itvhi.col_taps[col_left], itvhi.col_taps[col_right]);
  return high > 0 ? low / high : 1.0;
}

function get_taps_windowi(itvhi, window) {
  var ws = Math.min(window, itvhi.window_size);
  var sum = 0;
  for (var i = 0; i < ws; i++) {
    var idx = (itvhi.window_idx - i + itvhi.window_size) % itvhi.window_size;
    sum += (itvhi.col_taps_window[col_left][idx] || 0) + (itvhi.col_taps_window[col_right][idx] || 0);
  }
  return sum;
}

function get_taps_windowf(itvhi, window) {
  return get_taps_windowi(itvhi, window);
}

function get_col_taps_windowi(itvhi, col, window) {
  var ws = Math.min(window, itvhi.window_size);
  var sum = 0;
  for (var i = 0; i < ws; i++) {
    var idx = (itvhi.window_idx - i + itvhi.window_size) % itvhi.window_size;
    sum += itvhi.col_taps_window[col][idx] || 0;
  }
  return sum;
}

function cols_equal_window(itvhi, window) {
  return get_col_taps_windowi(itvhi, col_left, window) === get_col_taps_windowi(itvhi, col_right, window);
}

function get_col_prop_low_by_high_window(itvhi, window) {
  var left = get_col_taps_windowi(itvhi, col_left, window);
  var right = get_col_taps_windowi(itvhi, col_right, window);
  var low = Math.min(left, right);
  var high = Math.max(left, right);
  return high > 0 ? low / high : 1.0;
}

function interval_end_itvhi(itvhi) {
  itvhi.col_taps_window[col_left][itvhi.window_idx] = itvhi.col_taps[col_left];
  itvhi.col_taps_window[col_right][itvhi.window_idx] = itvhi.col_taps[col_right];
  itvhi.window_idx = (itvhi.window_idx + 1) % itvhi.window_size;
  itvhi.col_taps = [0, 0];
}

// ─── MetaRowInfo ────────────────────────────────────────────────────────

function createMetaRowInfo() {
  return {
    time: 0,
    ms_now: 0,
    count: 0,
    last_count: 0,
    last_last_count: 0,
    notes: 0,
    last_notes: 0,
    last_last_notes: 0,
    alternating_chordstream: false,
    alternating_chord_single: false,
    gluts_maybe: false,
    twas_jack: false,
  };
}

// ─── MetaItvInfo ────────────────────────────────────────────────────────

function initializeMetaItvInfo() {
  return {
    _itvi: {
      total_taps: 0,
      chord_taps: 0,
      taps_by_size: [0, 0, 0, 0],
      mixed_hs_density_tap_bonus: 0,
    },
    seriously_not_js: 0,
    definitely_not_jacks: 0,
    actual_jacks: 0,
    actual_jacks_cj: 0,
    not_js: 0,
    not_hs: 0,
    zwop: 0,
    shared_chord_jacks: 0,
    dunk_it: false,
    row_variations: [0, 0, 0],
    num_var: 0,
    basically_vibro: true,
  };
}

function handleItvIntervalEnd(mitvi) {
  mitvi.definitely_not_jacks = 0;
  mitvi.actual_jacks = 0;
  mitvi.actual_jacks_cj = 0;
  mitvi.not_js = 0;
  mitvi.not_hs = 0;
  mitvi.zwop = 0;
  mitvi.shared_chord_jacks = 0;
  mitvi.row_variations = [0, 0, 0];
  mitvi.num_var = 0;
  mitvi.basically_vibro = true;
  mitvi.dunk_it = false;
  mitvi._itvi.total_taps = 0;
  mitvi._itvi.chord_taps = 0;
  mitvi._itvi.mixed_hs_density_tap_bonus = 0;
  mitvi._itvi.taps_by_size = [0, 0, 0, 0];
}

function updateItvTapCounts(itvi, row_count) {
  itvi.total_taps += row_count;
  if (row_count > 1) {
    itvi.chord_taps += row_count;
  }
  var size_idx = Math.min(row_count - 1, 3);
  itvi.taps_by_size[size_idx] += row_count;
  if (itvi.taps_by_size[tap_size.hand] > 0) {
    itvi.mixed_hs_density_tap_bonus += itvi.taps_by_size[tap_size.jump];
  }
}

function basicRowSequencing(mri, last_mri, mitvi) {
  mri.twas_jack = false;

  for (var ci = 0; ci < col_ids.length; ci++) {
    var col = col_ids[ci];
    if (is_jack_at_col(col, mri.notes, last_mri.notes)) {
      mitvi.actual_jacks++;
      mri.twas_jack = true;
      if (mri.count > 1 && column_count(last_mri.notes) > 1) {
        mitvi.shared_chord_jacks++;
      }
    }
  }

  if (mri.twas_jack) {
    mitvi.actual_jacks_cj++;
  }

  if (mitvi.basically_vibro) {
    for (var i = 0; i < 3; i++) {
      if (mitvi.row_variations[i] !== 0) {
        if (mitvi.row_variations[i] === mri.notes) {
          // Already seen this variation
          break;
        }
      } else {
        mitvi.row_variations[i] = mri.notes;
        mitvi.num_var++;
        if (mitvi.row_variations[2] !== 0) {
          mitvi.basically_vibro = false;
        }
        break;
      }
    }
  }

  mri.alternating_chordstream = is_alternating_chord_stream(
    mri.notes, last_mri.notes, last_mri.last_notes
  );

  if (mri.alternating_chordstream) {
    mitvi.definitely_not_jacks++;
  }

  mri.alternating_chord_single = is_alternating_chord_single(mri.count, last_mri.count);

  if (mri.alternating_chord_single) {
    if (!mri.twas_jack) {
      mitvi.seriously_not_js -= 3;
    }
  }

  if (last_mri.count === 1 && mri.count === 1) {
    mitvi.seriously_not_js = Math.max(0, mitvi.seriously_not_js);
    mitvi.seriously_not_js++;
    if (mitvi.seriously_not_js > 3) {
      mitvi.not_js += mitvi.seriously_not_js;
      mitvi.not_hs += mitvi.seriously_not_js;
    }
  } else if (last_mri.count > 1 && mri.count > 1) {
    mitvi.not_hs += mri.count;
    mitvi.not_js += mri.count;
    if ((mri.notes & last_mri.notes) === 0) {
      mitvi.not_hs++;
      mitvi.not_js++;
    } else {
      mri.gluts_maybe = true;
    }
  }

  if ((mri.notes & last_mri.notes) === 0 &&
      mri.count > 1 && last_mri.count > 1 &&
      (last_mri.notes & last_mri.last_notes) === 0 &&
      last_mri.count > 1) {
    mitvi.dunk_it = true;
  }
}

// ─── Meta type detection ────────────────────────────────────────────────

function determine_meta_type(notes, last_notes, last_last_notes, count, last_count, last_last_count) {
  if (count === 1 && last_count === 1 && last_last_count === 1) {
    if (notes !== last_notes && last_notes !== last_last_notes && notes !== last_last_notes) {
      return meta_type.meta_cccccc;
    }
  }
  if (count >= 2 && last_count === 1 && last_last_count >= 2) {
    if ((notes & last_notes) === 0 && (last_notes & last_last_notes) !== 0) {
      return meta_type.meta_ccacc;
    }
  }
  if (count === 1 && last_count >= 2 && last_last_count === 1) {
    if ((notes & last_notes) !== 0 && (last_notes & last_last_notes) === 0) {
      return meta_type.meta_acca;
    }
  }
  if (count >= 2 && last_count === 1 && last_last_count >= 2) {
    if ((notes & last_notes) === 0 && (last_notes & last_last_notes) !== 0) {
      if (popcount(notes) === 2 && popcount(last_last_notes) === 2) {
        return meta_type.meta_ccsjjscc;
      }
    }
  }
  return meta_type.meta_type_init;
}
