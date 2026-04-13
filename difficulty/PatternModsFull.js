/**
 * PatternModsFull — full Etterna pattern mod implementations.
 * Stateful pattern mod classes from HA_PatternMods/ and HD_PatternMods/.
 */

// ─── SimpleMovingWindow for OHTrill ─────────────────────────────────────

function SimpleMovingWindow() {
  this._vals = new Array(MAX_MOVING_WINDOW_SIZE).fill(0);
}

SimpleMovingWindow.prototype.push = function(newVal) {
  for (var i = 1; i < MAX_MOVING_WINDOW_SIZE; i++) {
    this._vals[i - 1] = this._vals[i];
  }
  this._vals[MAX_MOVING_WINDOW_SIZE - 1] = newVal;
};

SimpleMovingWindow.prototype.getCvOfWindow = function(window) {
  var avg = this.getMeanOfWindow(window);
  if (avg <= 0) return 0;
  var sd = 0;
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    var d = this._vals[i] - avg;
    sd += d * d;
  }
  return Math.sqrt(sd / window) / avg;
};

SimpleMovingWindow.prototype.getMeanOfWindow = function(window) {
  var o = 0;
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    o += this._vals[i];
  }
  return o / window;
};

SimpleMovingWindow.prototype.zero = function() {
  this._vals.fill(0);
};

// ─── Hand-Agnostic: StreamMod ───────────────────────────────────────────

function StreamMod() {
  this._tap_size = tap_size.single;
  this.min_mod = 0.6; this.max_mod = 1.0;
  this.prop_buffer = 1.0; this.prop_scaler = 1.428;
  this.jack_pool = 4.0; this.jack_comp_min = 0.5; this.jack_comp_max = 1.0;
  this.prop_component = 0; this.jack_component = 0; this.pmod = 0.6;
}

StreamMod.prototype.operator = function(mitvi) {
  var itvi = mitvi._itvi;
  if (itvi.total_taps < 2) return neutral;
  if (itvi.taps_by_size[this._tap_size] === 0) return this.min_mod;
  this.prop_component = (itvi.taps_by_size[this._tap_size] + this.prop_buffer) /
    (itvi.total_taps - this.prop_buffer) * this.prop_scaler;
  this.jack_component = CalcClamp(this.jack_pool - mitvi.actual_jacks, this.jack_comp_min, this.jack_comp_max);
  this.pmod = fastsqrt(this.prop_component * this.jack_component);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Agnostic: JSMod ───────────────────────────────────────────────

function JSMod() {
  this._tap_size = tap_size.jump;
  this.min_mod = 0.6; this.max_mod = 1.1; this.mod_base = 0.0;
  this.prop_buffer = 1.0;
  this.total_prop_min = 0.6; this.total_prop_max = 1.1; this.total_prop_scaler = 2.714;
  this.split_hand_pool = 1.45; this.split_hand_min = 0.85; this.split_hand_max = 1.0;
  this.jack_pool = 1.35; this.jack_min = 0.5; this.jack_max = 1.0;
  this.decay_factor = 0.05;
  this.total_prop = 0; this.jumptrill_prop = 0; this.jack_prop = 0;
  this.last_mod = 0.6; this.pmod = 0.6; this.t_taps = 0;
}

JSMod.prototype.decay_mod = function() {
  this.pmod = CalcClamp(this.last_mod - this.decay_factor, this.min_mod, this.max_mod);
  this.last_mod = this.pmod;
};

JSMod.prototype.operator = function(mitvi) {
  var itvi = mitvi._itvi;
  if (itvi.total_taps === 0) return neutral;
  if (itvi.taps_by_size[this._tap_size] === 0) { this.decay_mod(); return this.pmod; }
  this.t_taps = itvi.total_taps;
  this.total_prop = (itvi.taps_by_size[this._tap_size] + this.prop_buffer) /
    (this.t_taps - this.prop_buffer) * this.total_prop_scaler;
  this.total_prop = CalcClamp(fastsqrt(this.total_prop), this.total_prop_min, this.total_prop_max);
  this.jumptrill_prop = CalcClamp(this.split_hand_pool - (mitvi.not_js / this.t_taps), this.split_hand_min, this.split_hand_max);
  this.jack_prop = CalcClamp(this.jack_pool - (mitvi.actual_jacks / this.t_taps), this.jack_min, this.jack_max);
  this.pmod = CalcClamp(this.total_prop * this.jumptrill_prop * this.jack_prop, this.min_mod, this.max_mod);
  if (mitvi.dunk_it) this.pmod *= 0.99;
  this.last_mod = this.pmod;
  return this.pmod;
};

// ─── Hand-Agnostic: HSMod ───────────────────────────────────────────────

function HSMod() {
  this._tap_size = tap_size.hand;
  this.min_mod = 0.6; this.max_mod = 1.1; this.mod_base = 0.4;
  this.prop_buffer = 1.0;
  this.total_prop_min = 0.6; this.total_prop_max = 1.1;
  this.total_prop_scaler = 5.571; this.total_prop_base = 0.4;
  this.split_hand_pool = 1.45; this.split_hand_min = 0.89; this.split_hand_max = 1.0;
  this.jack_pool = 1.35; this.jack_min = 0.5; this.jack_max = 1.0;
  this.decay_factor = 0.05;
  this.total_prop = 0; this.jumptrill_prop = 0; this.jack_prop = 0;
  this.last_mod = 0.6; this.pmod = 0.6; this.t_taps = 0;
}

HSMod.prototype.decay_mod = function() {
  this.pmod = CalcClamp(this.last_mod - this.decay_factor, this.min_mod, this.max_mod);
  this.last_mod = this.pmod;
};

HSMod.prototype.operator = function(mitvi) {
  var itvi = mitvi._itvi;
  if (itvi.total_taps === 0) return neutral;
  if (itvi.taps_by_size[this._tap_size] === 0) { this.decay_mod(); return this.pmod; }
  this.t_taps = itvi.total_taps;
  this.total_prop = this.total_prop_base +
    ((itvi.taps_by_size[this._tap_size] + itvi.mixed_hs_density_tap_bonus + this.prop_buffer) /
     (this.t_taps - this.prop_buffer)) * this.total_prop_scaler;
  this.total_prop = CalcClamp(fastsqrt(this.total_prop), this.total_prop_min, this.total_prop_max);
  this.jumptrill_prop = CalcClamp(this.split_hand_pool - (mitvi.not_hs / this.t_taps), this.split_hand_min, this.split_hand_max);
  this.jack_prop = CalcClamp(this.jack_pool - (mitvi.actual_jacks / this.t_taps), this.jack_min, this.jack_max);
  this.pmod = CalcClamp(this.total_prop * this.jumptrill_prop * this.jack_prop, this.min_mod, this.max_mod);
  if (mitvi.dunk_it) this.pmod *= 0.99;
  this.last_mod = this.pmod;
  return this.pmod;
};

// ─── Hand-Agnostic: CJMod ──────────────────────────────────────────────

function CJMod() {
  this.min_mod = 0.6; this.max_mod = 1.1; this.mod_base = 0.4;
  this.prop_buffer = 1.0;
  this.total_prop_min = 0.6; this.total_prop_max = 1.1; this.total_prop_scaler = 5.428;
  this.jack_base = 2.0; this.jack_min = 0.625; this.jack_max = 1.0;
  this.not_jack_pool = 1.2; this.not_jack_min = 0.4; this.not_jack_max = 1.0;
  this.vibro_flag = 1.0;
  this.total_prop = 0; this.jack_prop = 0; this.not_jack_prop = 0;
  this.pmod = 0.6; this.t_taps = 0;
}

CJMod.prototype.operator = function(mitvi) {
  var itvi = mitvi._itvi;
  if (itvi.total_taps === 0) return neutral;
  if (itvi.chord_taps === 0) return this.min_mod;
  this.t_taps = itvi.total_taps;
  this.total_prop = (itvi.chord_taps + this.prop_buffer) / (this.t_taps - this.prop_buffer) * this.total_prop_scaler;
  this.total_prop = CalcClamp(fastsqrt(this.total_prop), this.total_prop_min, this.total_prop_max);
  this.jack_prop = CalcClamp(mitvi.actual_jacks_cj - this.jack_base, this.jack_min, this.jack_max);
  this.not_jack_prop = CalcClamp(this.not_jack_pool - ((mitvi.definitely_not_jacks) / this.t_taps), this.not_jack_min, this.not_jack_max);
  this.pmod = CalcClamp(this.total_prop * this.jack_prop * this.not_jack_prop, this.min_mod, this.max_mod);
  if (mitvi.basically_vibro) {
    if (mitvi.num_var === 1) this.pmod *= 0.5 * this.vibro_flag;
    else if (mitvi.num_var === 2) this.pmod *= 0.9 * this.vibro_flag;
    else if (mitvi.num_var === 3) this.pmod *= 0.95 * this.vibro_flag;
  }
  return this.pmod;
};

// ─── Hand-Agnostic: CJDensityMod ───────────────────────────────────────

function CJDensityMod() {
  this._tap_size = tap_size.quad;
  this.min_mod = 0.9; this.max_mod = 1.3; this.base = 0.1;
  this.jump_scaler = 1.0; this.hand_scaler = 1.33; this.quad_scaler = 2.0;
  this.pmod = neutral;
}

CJDensityMod.prototype.operator = function(mitvi) {
  var itvi = mitvi._itvi;
  if (itvi.total_taps === 0) return neutral;
  var t_taps = itvi.total_taps;
  var a1 = (itvi.taps_by_size[tap_size.jump] * this.jump_scaler) / t_taps;
  var a2 = (itvi.taps_by_size[tap_size.hand] * this.hand_scaler) / t_taps;
  var a3 = (itvi.taps_by_size[tap_size.quad] * this.quad_scaler) / t_taps;
  this.pmod = CalcClamp(this.base + fastsqrt(a1 + a2 + a3), this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: BalanceMod ─────────────────────────────────────────

function BalanceMod() {
  this.min_mod = 0.95; this.max_mod = 1.05;
  this.mod_base = 0.325; this.buffer = 1.0; this.scaler = 1.0; this.other_scaler = 4.0;
  this.pmod = neutral;
}

BalanceMod.prototype.full_reset = function() { this.pmod = neutral; };

BalanceMod.prototype.operator = function(itvhi) {
  if (get_taps_nowi(itvhi) === 0) return neutral;
  if (cols_equal_now(itvhi)) return this.min_mod;
  if (get_col_taps_nowi(itvhi, col_left) === 0 || get_col_taps_nowi(itvhi, col_right) === 0) return this.max_mod;
  this.pmod = get_col_prop_low_by_high(itvhi);
  this.pmod = this.mod_base + (this.buffer + (this.scaler / this.pmod)) / this.other_scaler;
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: ChaosMod ───────────────────────────────────────────

function ChaosMod() {
  this.min_mod = 0.88; this.max_mod = 1.07;
  this.base = -0.088;
  this.window = 6;
  this.u = new CalcMovingWindow();
  this.wot = new CalcMovingWindow();
  this.pmod = neutral;
}

ChaosMod.prototype.full_reset = function() {
  this.u.zero();
  this.wot.zero();
  this.pmod = neutral;
};

ChaosMod.prototype.interval_end = function() {};

ChaosMod.prototype.advance_sequencing = function(ms_any) {
  var a = ms_any.getNow();
  var b = ms_any.getLast();
  if (any_ms_is_zero(a) || any_ms_is_zero(b) || any_ms_is_close(a, b)) {
    this.u.push(1.0);
    this.wot.push(this.u.getMeanOfWindow(this.window));
    return;
  }
  var prop = div_high_by_low(a, b);
  var mop = Math.floor(prop);
  var flop = prop - mop;
  if (flop === 0) {
    flop = 1.0;
  } else if (flop >= 0.5) {
    flop = Math.abs(flop - 1.0) + 1.0;
  } else {
    flop += 1.0;
  }
  this.u.push(flop);
  this.wot.push(this.u.getMeanOfWindow(this.window));
};

ChaosMod.prototype.operator = function(total_taps) {
  if (total_taps === 0) return neutral;
  this.pmod = this.base + this.wot.getMeanOfWindow(MAX_MOVING_WINDOW_SIZE);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: OHJumpMod ──────────────────────────────────────────

function OHJumpMod() {
  this.min_mod = 0.75; this.max_mod = 1.0;
  this.max_seq_weight = 0.65;
  this.max_seq_pool = 1.2; this.max_seq_scaler = 2.0;
  this.prop_pool = 1.5; this.prop_scaler = 1.0;
  this.cur_seq_taps = 0;
  this.max_seq_taps = 0;
  this.max_ohjump_seq_taps = 0;
  this.cc_taps = 0;
  this.pmod = neutral;
}

OHJumpMod.prototype.full_reset = function() {
  this.cur_seq_taps = 0;
  this.max_seq_taps = 0;
  this.max_ohjump_seq_taps = 0;
  this.cc_taps = 0;
  this.pmod = neutral;
};

OHJumpMod.prototype.complete_seq = function() {
  this.max_seq_taps = Math.max(this.max_seq_taps, this.cur_seq_taps);
  this.cur_seq_taps = 0;
};

OHJumpMod.prototype.advance_sequencing = function(colType, baseTypeNow) {
  if (this.cur_seq_taps === 0) {
    if (colType !== col_ohjump) {
      return;
    }
    this.cur_seq_taps += 2;
    return;
  }

  switch (baseTypeNow) {
    case base_type.base_jump_jump:
      this.cur_seq_taps += 2;
      break;
    case base_type.base_jump_single:
      break;
    case base_type.base_left_right:
    case base_type.base_right_left:
      if (this.cur_seq_taps === 2) {
        this.cur_seq_taps -= 1;
      } else {
        this.cur_seq_taps -= 3;
      }
      this.complete_seq();
      break;
    case base_type.base_single_single:
    case base_type.base_single_jump:
      this.complete_seq();
      break;
    case base_type.base_type_init:
      break;
    default:
      break;
  }
};

OHJumpMod.prototype.set_pmod = function(mitvi, itvhi) {
  this.cc_taps = (mitvi._base_types[base_type.base_left_right] || 0) + (mitvi._base_types[base_type.base_right_left] || 0);
  this.max_ohjump_seq_taps = Math.max(this.cur_seq_taps, this.max_seq_taps);

  if (get_taps_nowi(itvhi) === 0 || get_col_taps_nowi(itvhi, col_ohjump) === 0) {
    this.pmod = neutral;
    return this.pmod;
  }
  if (this.max_ohjump_seq_taps >= get_taps_nowi(itvhi)) {
    this.pmod = this.min_mod;
    return this.pmod;
  }
  if (this.max_ohjump_seq_taps < 3) {
    var baseJumpProp = get_col_taps_nowi(itvhi, col_ohjump) / Math.max(get_taps_nowf(itvhi), 1);
    var propComponent = this.prop_pool - (baseJumpProp * this.prop_scaler);
    propComponent = fastsqrt(Math.max(propComponent, 0.1));
    this.pmod = CalcClamp(propComponent, this.min_mod, this.max_mod);
    return this.pmod;
  }
  if (this.cc_taps === 0) {
    var baseSeqProp = this.max_ohjump_seq_taps / Math.max(get_taps_nowf(itvhi), 1);
    var maxSeqComponent = this.max_seq_pool - (baseSeqProp * this.max_seq_scaler);
    maxSeqComponent = fastsqrt(Math.max(maxSeqComponent, 0.1));
    this.pmod = CalcClamp(maxSeqComponent, this.min_mod, this.max_mod);
    return this.pmod;
  }

  var baseSeqProp2 = this.max_ohjump_seq_taps / Math.max(get_taps_nowf(itvhi), 1);
  var maxSeqComponent2 = this.max_seq_pool - (baseSeqProp2 * this.max_seq_scaler);
  maxSeqComponent2 = CalcClamp(fastsqrt(Math.max(maxSeqComponent2, 0.1)), 0.1, this.max_mod);
  var baseJumpProp2 = get_col_taps_nowi(itvhi, col_ohjump) / Math.max(get_taps_nowf(itvhi), 1);
  var propComponent2 = this.prop_pool - (baseJumpProp2 * this.prop_scaler);
  propComponent2 = CalcClamp(fastsqrt(Math.max(propComponent2, 0.1)), 0.1, this.max_mod);
  this.pmod = weightedAverage(maxSeqComponent2, propComponent2, this.max_seq_weight, 1.0);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

OHJumpMod.prototype.operator = function(mitvi, itvhi) {
  this.set_pmod(mitvi, itvhi);
  this.interval_end();
  return this.pmod;
};

OHJumpMod.prototype.interval_end = function() {
  this.cc_taps = 0;
  this.max_seq_taps = 0;
  this.max_ohjump_seq_taps = 0;
};

// ─── Hand-Dependent: MinijackMod ────────────────────────────────────────

function MinijackMod() {
  this.min_mod = 1.0; this.max_mod = 1.25;
  this.base = 0.4;
  this.mj_scaler = 2.6; this.mj_buffer = 0.3;
  this.minijack_speed_increase_factor = 1.9;
  this.minijack_confirmation_factor = 1.3;
  this.slow_minijack_cutoff_ms = 149.5;
  this.window = 3;
  this.left_ms = new CalcMovingWindow();
  this.right_ms = new CalcMovingWindow();
  this.left_notes = new CalcMovingWindow();
  this.right_notes = new CalcMovingWindow();
  this.off_hand_notes = new CalcMovingWindow();
  this.minijacks = 0;
  this.left_since_last_right = 0;
  this.right_since_last_left = 0;
  this.off_since_last_on = 0;
  this.pmod = this.min_mod;
}

MinijackMod.prototype.full_reset = function() {
  this.pmod = neutral;
  this.minijacks = 0;
  this.left_ms.fill(5000);
  this.right_ms.fill(5000);
  this.left_notes.fill(0);
  this.right_notes.fill(0);
  this.off_hand_notes.fill(0);
  this.left_since_last_right = 0;
  this.right_since_last_left = 0;
  this.off_since_last_on = 0;
};

MinijackMod.prototype.minijack_check = function(mv, mwOffTapCounts) {
  var max = mv.getMaxForWindow(this.window);
  if (max === 5000) return;
  var recentMs = mv.getNow();
  var lastMs = mv.getLast();
  var lastLastMs = mv.get(MAX_MOVING_WINDOW_SIZE - 3);
  if (lastMs > this.slow_minijack_cutoff_ms) return;
  if (lastMs === mv.getMinForWindow(this.window) &&
      recentMs > lastMs * this.minijack_confirmation_factor &&
      lastLastMs > lastMs * this.minijack_speed_increase_factor) {
    if (mwOffTapCounts.get(MAX_MOVING_WINDOW_SIZE - 2) === 0) {
      if (this.off_hand_notes.get(MAX_MOVING_WINDOW_SIZE - 2) === 0) {
        this.minijacks++;
      }
    }
  }
};

MinijackMod.prototype.commit_off_hand_taps = function() {
  this.off_hand_notes.push(this.off_since_last_on);
  this.off_since_last_on = 0;
};

MinijackMod.prototype.advance_off_hand_sequencing = function() {
  this.off_since_last_on++;
};

MinijackMod.prototype.advance_sequencing = function(colType, ms_now) {
  switch (colType) {
    case col_left:
      if (this.right_since_last_left > 0 || this.left_since_last_right > 0) {
        this.right_notes.push(this.right_since_last_left);
      }
      this.left_since_last_right++;
      this.right_since_last_left = 0;
      this.left_ms.push(ms_now);
      this.commit_off_hand_taps();
      this.minijack_check(this.left_ms, this.right_notes);
      break;
    case col_right:
      if (this.left_since_last_right > 0 || this.right_since_last_left > 0) {
        this.left_notes.push(this.left_since_last_right);
      }
      this.right_since_last_left++;
      this.left_since_last_right = 0;
      this.right_ms.push(ms_now);
      this.commit_off_hand_taps();
      this.minijack_check(this.right_ms, this.left_notes);
      break;
    case col_ohjump:
      this.left_notes.push(this.left_since_last_right);
      this.right_notes.push(this.right_since_last_left);
      this.left_since_last_right = 0;
      this.right_since_last_left = 0;
      this.left_ms.push(ms_now);
      this.right_ms.push(ms_now);
      this.commit_off_hand_taps();
      this.minijack_check(this.left_ms, this.right_notes);
      this.minijack_check(this.right_ms, this.left_notes);
      break;
    default:
      break;
  }
};

MinijackMod.prototype.set_pmod = function(itvhi) {
  if (this.minijacks === 0 || get_taps_nowi(itvhi) === 0) {
    this.pmod = neutral;
    return;
  }
  var mj = (this.minijacks + this.mj_buffer) * this.mj_scaler;
  var taps = get_taps_nowf(itvhi) - this.mj_buffer;
  this.pmod = this.base + mj / Math.max(taps, 0.00001);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
};

MinijackMod.prototype.operator = function(itvhi) {
  this.set_pmod(itvhi);
  this.interval_end();
  return this.pmod;
};

MinijackMod.prototype.interval_end = function() {
  this.minijacks = 0;
};

// ─── Hand-Dependent: WideRangeBalanceMod ────────────────────────────────

function WideRangeBalanceMod() {
  this.window_param = 2.0;
  this.min_mod = 0.94; this.max_mod = 1.05;
  this.base = 0.425; this.buffer = 1.0; this.scaler = 1.0; this.other_scaler = 4.0;
  this.window = 0; this.pmod = neutral;
}

WideRangeBalanceMod.prototype.full_reset = function() { this.pmod = neutral; };

WideRangeBalanceMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeBalanceMod.prototype.operator = function(itvhi) {
  if (get_taps_windowi(itvhi, this.window) === 0) return neutral;
  if (cols_equal_window(itvhi, this.window)) return this.min_mod;
  this.pmod = get_col_prop_low_by_high_window(itvhi, this.window);
  this.pmod = this.base + (this.buffer + (this.scaler / this.pmod)) / this.other_scaler;
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: WideRangeAnchorMod ─────────────────────────────────

function WideRangeAnchorMod() {
  this.window_param = 4.0;
  this.min_mod = 1.0; this.max_mod = 1.075;
  this.base = 1.0; this.diff_min = 4.0; this.diff_max = 12.0; this.scaler = 0.1;
  this.window = 0; this.divisor = 8.0; this.pmod = 1.0;
}

WideRangeAnchorMod.prototype.full_reset = function() { this.pmod = neutral; };

WideRangeAnchorMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
  this.divisor = this.diff_max - this.diff_min;
};

WideRangeAnchorMod.prototype.operator = function(itvhi, anchorSeq) {
  if (get_taps_nowi(itvhi) === 0) return neutral;
  if (get_col_taps_nowi(itvhi, col_left) === 0 || get_col_taps_nowi(itvhi, col_right) === 0) return this.max_mod;
  var a = anchorSeq.get_max_for_window_and_col(col_left, this.window);
  var b = anchorSeq.get_max_for_window_and_col(col_right, this.window);
  var diff = diff_high_by_low(a, b);
  if (diff <= this.diff_min) return neutral;
  if (diff > this.diff_max) return this.max_mod;
  this.pmod = this.base + (this.scaler * ((diff - this.diff_min) / this.divisor));
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: OHTrillMod ─────────────────────────────────────────

function OHTrillMod() {
  this.window_param = 3.0;
  this.min_mod = 0.9; this.max_mod = 1.0;
  this.base = 1.35; this.suppression = 0.4;
  this.cv_reset = 1.0;
  this.cv_threshold = 0.5;
  this.window = 0;
  this.cc_window = 0;
  this.badjuju = new SimpleMovingWindow();
  this.msWindow = new SimpleMovingWindow();
  this.mw_oht_taps = new CalcMovingWindow();
  this.foundyatrills = [0, 0, 0, 0];
  this.found_oht = 0;
  this.oht_len = 0;
  this.oht_taps = 0;
  this.moving_cv = 1.0;
  this.luca_turilli = false;
  this.pmod = neutral;
}

OHTrillMod.prototype.full_reset = function() {
  this.badjuju.zero();
  this.msWindow.zero();
  this.mw_oht_taps.zero();
  this.foundyatrills = [0, 0, 0, 0];
  this.found_oht = 0;
  this.oht_len = 0;
  this.oht_taps = 0;
  this.moving_cv = this.cv_reset;
  this.luca_turilli = false;
  this.pmod = neutral;
};

OHTrillMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
  this.cc_window = this.window;
};

OHTrillMod.prototype.make_thing = function(itv_taps) {
  var goat = 0.0;
  if (this.found_oht === 0) {
    return 0.0;
  }
  for (var i = 0; i < this.foundyatrills.length; i++) {
    var v = this.foundyatrills[i];
    if (v === 0) continue;
    goat = (v / Math.max(itv_taps, 1)) - this.suppression;
  }
  return Math.max(0.1, Math.min(goat, 1.0));
};

OHTrillMod.prototype.complete_seq = function() {
  if (!this.luca_turilli || this.oht_len === 0) {
    return;
  }
  if (this.found_oht < this.foundyatrills.length) {
    this.foundyatrills[this.found_oht] = this.oht_len;
  }
  this.luca_turilli = false;
  this.oht_len = 0;
  this.found_oht++;
  this.moving_cv = (this.moving_cv + this.cv_reset) / 2.0;
};

OHTrillMod.prototype.oht_timing_check = function() {
  this.moving_cv = (this.moving_cv + this.msWindow.getCvOfWindow(this.cc_window)) / 2.0;
  return this.moving_cv < this.cv_threshold;
};

OHTrillMod.prototype.wifflewaffle = function() {
  if (this.luca_turilli) {
    this.oht_len++;
    this.oht_taps++;
  } else {
    this.luca_turilli = true;
    this.oht_len += 3;
    this.oht_taps += 3;
  }
};

OHTrillMod.prototype.advance_sequencing = function(mt, ms_now) {
  this.msWindow.push(ms_now);
  switch (mt) {
    case meta_type.meta_cccccc:
      if (this.oht_timing_check()) {
        this.wifflewaffle();
      } else {
        this.complete_seq();
      }
      break;
    case meta_type.meta_ccacc:
      break;
    case meta_type.meta_enigma:
    case meta_type.meta_meta_enigma:
      break;
    default:
      this.complete_seq();
      break;
  }
};

OHTrillMod.prototype.set_pmod = function(itvhi) {
  if (get_taps_windowi(itvhi, this.window) === 0 || this.mw_oht_taps.getTotalForWindow(this.window) === 0) {
    this.pmod = neutral;
    return neutral;
  }
  if (get_taps_windowi(itvhi, this.window) === this.mw_oht_taps.getTotalForWindow(this.window)) {
    this.pmod = this.min_mod;
    return this.pmod;
  }
  this.badjuju.push(this.make_thing(get_taps_nowf(itvhi)));
  this.pmod = this.base - this.badjuju.getMeanOfWindow(this.window);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
};

OHTrillMod.prototype.finish_interval = function(itvhi) {
  if (this.oht_len > 0 && this.found_oht < this.foundyatrills.length) {
    this.foundyatrills[this.found_oht] = this.oht_len;
    this.found_oht++;
  }
  this.mw_oht_taps.push(this.oht_taps);
  this.set_pmod(itvhi);
  this.interval_end();
  return this.pmod;
};

OHTrillMod.prototype.interval_end = function() {
  this.foundyatrills = [0, 0, 0, 0];
  this.found_oht = 0;
  this.oht_len = 0;
  this.oht_taps = 0;
};

OHTrillMod.prototype.operator = function(itvhi, mt, ms_now) {
  if (mt !== undefined && ms_now !== undefined) {
    this.advance_sequencing(mt, ms_now);
    return this.pmod;
  }
  if (itvhi) {
    return this.finish_interval(itvhi);
  }
  return this.pmod;
};

// ─── Hand-Dependent: WideRangeRollMod ───────────────────────────────────

function WideRangeRollMod() {
  this.window_param = 5.0;
  this.min_mod = 0.25; this.max_mod = 1.0;
  this.base = 0.15;
  this.scaler = 0.9;
  this.cv_reset = 1.0;
  this.cv_threshold = 0.35;
  this.other_cv_threshold = 0.3;
  this.window = 0;
  this.mw_max = new CalcMovingWindow();
  this.mw_adj_ms = new CalcMovingWindow();
  this.last_passed_check = false;
  this.roll_counter = 0;
  this.max_thingy = 0;
  this.hi_im_a_float = 0.0;
  this.idk_ms = [0.0, 0.0, 0.0, 0.0];
  this.seq_ms = [0.0, 0.0, 0.0];
  this.moving_cv = 1.0;
  this.pmod = 0.25;
}

WideRangeRollMod.prototype.full_reset = function() {
  this.mw_max.zero(); this.mw_adj_ms.zero();
  this.last_passed_check = false;
  this.roll_counter = 0;
  this.max_thingy = 0;
  this.hi_im_a_float = 0.0;
  this.idk_ms = [0.0, 0.0, 0.0, 0.0];
  this.seq_ms = [0.0, 0.0, 0.0];
  this.moving_cv = this.cv_reset;
  this.pmod = neutral;
};

WideRangeRollMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeRollMod.prototype.do_timing_thing = function(scaler) {
  this.mw_adj_ms.push(this.seq_ms[1]);
  if (this.mw_adj_ms.getCvOfWindow(this.window) > this.other_cv_threshold) {
    return false;
  }
  this.hi_im_a_float = cv(this.seq_ms);
  if (this.hi_im_a_float < 0.12) {
    this.moving_cv = (this.hi_im_a_float + this.moving_cv + this.hi_im_a_float) / 3.0;
    return true;
  }
  this.moving_cv = (this.hi_im_a_float + this.moving_cv) / 2.0;
  return this.moving_cv < this.cv_threshold / scaler;
};

WideRangeRollMod.prototype.do_other_timing_thing = function(scaler) {
  this.mw_adj_ms.push(this.idk_ms[1]);
  this.mw_adj_ms.push(this.idk_ms[2]);
  if (this.mw_adj_ms.getCvOfWindow(this.window) > this.other_cv_threshold) {
    return false;
  }
  this.hi_im_a_float = cv(this.idk_ms);
  if (this.hi_im_a_float < 0.12) {
    this.moving_cv = (this.hi_im_a_float + this.moving_cv + this.hi_im_a_float) / 3.0;
    return true;
  }
  this.moving_cv = (this.hi_im_a_float + this.moving_cv) / 2.0;
  return this.moving_cv < this.cv_threshold / scaler;
};

WideRangeRollMod.prototype.complete_seq = function() {
  if (this.roll_counter > 0) {
    this.max_thingy = Math.max(this.max_thingy, this.roll_counter);
  }
  this.roll_counter = 0;
};

WideRangeRollMod.prototype.bibblybop = function(lastMt) {
  if (lastMt === meta_type.meta_enigma) {
    this.moving_cv = (this.moving_cv + this.hi_im_a_float) / 2.0;
  } else if (lastMt === meta_type.meta_meta_enigma) {
    this.moving_cv = (this.moving_cv + this.hi_im_a_float + this.hi_im_a_float) / 3.0;
  }
  if (!this.last_passed_check) {
    this.complete_seq();
    return;
  }
  this.roll_counter++;
  if (lastMt === meta_type.meta_enigma) this.roll_counter++;
  if (lastMt === meta_type.meta_meta_enigma) this.roll_counter += 2;
};

WideRangeRollMod.prototype.advance_sequencing = function(baseTypeNow, mt, lastMt, anyMs, tcMs) {
  this.seq_ms[0] = this.seq_ms[1];
  this.seq_ms[1] = this.seq_ms[2];
  this.seq_ms[2] = baseTypeNow === base_type.base_single_single ? tcMs : anyMs;

  if (baseTypeNow === base_type.base_single_jump || baseTypeNow === base_type.base_jump_single) {
    return;
  }
  if (baseTypeNow === base_type.base_jump_jump) {
    if (this.roll_counter > 0) this.bibblybop(lastMt);
    return;
  }

  switch (mt) {
    case meta_type.meta_acca:
      this.complete_seq();
      break;
    case meta_type.meta_cccccc:
      this.last_passed_check = this.mw_adj_ms.rollTimingCheck ? this.mw_adj_ms.rollTimingCheck(3.0, this.cv_threshold) : this.do_timing_thing(1.0);
      if (!this.last_passed_check) this.last_passed_check = this.do_timing_thing(1.0);
      this.bibblybop(lastMt);
      break;
    case meta_type.meta_ccacc:
      this.last_passed_check = this.do_timing_thing(1.25);
      this.bibblybop(lastMt);
      break;
    case meta_type.meta_ccsjjscc:
    case meta_type.meta_ccsjjscc_inverted:
      this.idk_ms[2] = this.seq_ms[0];
      this.idk_ms[1] = this.seq_ms[1];
      this.idk_ms[0] = this.seq_ms[2];
      this.idk_ms[3] = anyMs;
      this.idk_ms[1] /= 2.5;
      this.idk_ms[2] /= 2.5;
      this.last_passed_check = this.do_other_timing_thing(1.25);
      this.idk_ms[1] *= 2.5;
      this.idk_ms[2] *= 2.5;
      if (!this.last_passed_check) {
        this.idk_ms[1] /= 3.0;
        this.idk_ms[2] /= 3.0;
        this.last_passed_check = this.do_other_timing_thing(1.25);
        this.idk_ms[1] *= 3.0;
        this.idk_ms[2] *= 3.0;
      }
      this.bibblybop(lastMt);
      break;
    case meta_type.meta_type_init:
    case meta_type.meta_enigma:
      break;
    case meta_type.meta_meta_enigma:
    case meta_type.meta_unknowable_enigma:
      this.complete_seq();
      break;
    default:
      break;
  }
};

WideRangeRollMod.prototype.operator = function(itvhi) {
  this.max_thingy = Math.max(this.max_thingy, this.roll_counter);
  this.mw_max.push(this.max_thingy);
  if (get_taps_nowi(itvhi) === 0 || get_taps_windowi(itvhi, this.window) === 0 || this.mw_max.getTotalForWindow(this.window) === 0) {
    this.pmod = neutral;
    this.interval_end();
    return neutral;
  }
  var zomg = get_taps_windowf(itvhi, this.window) / this.mw_max.getTotalForWindow(this.window);
  this.pmod *= zomg;
  this.pmod = CalcClamp(this.base + fastsqrt(this.pmod), this.min_mod, this.max_mod);
  this.interval_end();
  return this.pmod;
};

WideRangeRollMod.prototype.interval_end = function() {
  this.max_thingy = 0;
  this.roll_counter = 0;
};

// ─── Hand-Dependent: WideRangeJumptrillMod ──────────────────────────────

function WideRangeJumptrillMod() {
  this.window_param = 3.0;
  this.min_mod = 0.25; this.max_mod = 1.0;
  this.cv_threshhold = 0.05;
  this.window = 0;
  this.mw_jt = new CalcMovingWindow();
  this.jt_counter = 0;
  this.bro_is_this_file_for_real = false;
  this.last_passed_check = false;
  this.pmod = neutral;
}

WideRangeJumptrillMod.prototype.full_reset = function() {
  this.mw_jt.zero(); this.jt_counter = 0; this.bro_is_this_file_for_real = false; this.last_passed_check = false; this.pmod = neutral;
};

WideRangeJumptrillMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeJumptrillMod.prototype.check_last_mt = function(mt) {
  return (mt === meta_type.meta_acca || mt === meta_type.meta_ccacc || mt === meta_type.meta_cccccc) && this.last_passed_check;
};

WideRangeJumptrillMod.prototype.bibblybop = function(mt) {
  this.jt_counter++;
  if (this.bro_is_this_file_for_real) this.jt_counter++;
  if (this.check_last_mt(mt)) {
    this.jt_counter++;
    this.bro_is_this_file_for_real = true;
  }
};

WideRangeJumptrillMod.prototype.advance_sequencing = function(baseTypeNow, mt, lastMt, msAny) {
  if (baseTypeNow === base_type.base_jump_jump || baseTypeNow === base_type.base_single_jump) {
    return;
  }
  switch (mt) {
    case meta_type.meta_cccccc:
      this.last_passed_check = msAny.rollTimingCheck(3.0, this.cv_threshhold);
      if (this.last_passed_check) {
        this.bibblybop(lastMt);
        return;
      }
      break;
    case meta_type.meta_ccacc:
      this.last_passed_check = msAny.ccaccTimingCheck(3.0, this.cv_threshhold);
      if (this.last_passed_check) {
        this.bibblybop(lastMt);
        return;
      }
      break;
    case meta_type.meta_acca:
      this.last_passed_check = msAny.accaTimingCheck(3.0, this.cv_threshhold);
      if (this.last_passed_check) {
        this.bibblybop(lastMt);
        return;
      }
      break;
    default:
      break;
  }
  this.bro_is_this_file_for_real = false;
};

WideRangeJumptrillMod.prototype.operator = function(itvhi) {
  this.mw_jt.push(this.jt_counter);
  if (get_taps_windowi(itvhi, this.window) === 0 || this.mw_jt.getTotalForWindow(this.window) === 0) {
    this.pmod = neutral; this.interval_end(); return neutral;
  }
  if (this.mw_jt.getTotalForWindow(this.window) < 20) {
    this.pmod = neutral; this.interval_end(); return neutral;
  }
  this.pmod = get_taps_windowf(itvhi, this.window) / this.mw_jt.getTotalForWindow(this.window) * 0.75;
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  this.interval_end();
  return this.pmod;
};

WideRangeJumptrillMod.prototype.interval_end = function() {
  this.jt_counter = 0;
};

// ─── Hand-Dependent: WideRangeJJMod ─────────────────────────────────────

function WideRangeJJMod() {
  this.window_param = 3.0;
  this.jj_required = 30.0;
  this.min_mod = 0.25; this.max_mod = 1.0;
  this.total_scaler = 2.5;
  this.cur_interval_tap_scaler = 1.2;
  this.ms_threshold = 0.065;
  this.calming_comp = 0.05;
  this.diff_falloff_power = 6.0;
  this.window = 0;
  this.mw_max_problems = new CalcMovingWindow();
  this.current_problems = 0.0;
  this.max_interval_problems = 0.0;
  this.pmod = neutral;
  this.left_times = [];
  this.right_times = [];
}

WideRangeJJMod.prototype.full_reset = function() {
  this.mw_max_problems.zero();
  this.left_times = [];
  this.right_times = [];
  this.current_problems = 0.0;
  this.max_interval_problems = 0.0;
  this.pmod = neutral;
};

WideRangeJJMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeJJMod.prototype.advance_sequencing = function(colType, rowTime) {
  if (colType === col_left) this.left_times.push(rowTime);
  else if (colType === col_right) this.right_times.push(rowTime);
  else if (colType === col_ohjump) {
    this.left_times.push(rowTime);
    this.right_times.push(rowTime);
  }
};

WideRangeJJMod.prototype.check = function() {
  var li = 0;
  var ri = 0;
  var jumpJacking = false;
  var failedLeft = false;
  var failedRight = false;
  while (li < this.left_times.length && ri < this.right_times.length) {
    var l = this.left_times[li];
    var r = this.right_times[ri];
    var diff = Math.abs(l - r);
    if (diff < this.ms_threshold) {
      li++;
      ri++;
      if (!jumpJacking) this.current_problems = 0.0;
      var x = Math.pow(diff / Math.max(this.ms_threshold, 0.00001), this.diff_falloff_power);
      var v = 1 + (x / (x - 2));
      this.current_problems += v;
      this.max_interval_problems = Math.max(this.max_interval_problems, this.current_problems);
      jumpJacking = true;
    } else if (l > r) {
      ri++;
      if (failedRight) jumpJacking = false;
      failedRight = true;
    } else if (r > l) {
      li++;
      if (failedLeft) jumpJacking = false;
      failedLeft = true;
    } else {
      li++;
      ri++;
      if (failedLeft || failedRight) jumpJacking = false;
      failedLeft = true;
      failedRight = true;
    }
  }
};

WideRangeJJMod.prototype.operator = function(itvhi) {
  this.check();
  this.mw_max_problems.push(this.max_interval_problems);
  var tapsInWindow = get_taps_windowf(itvhi, this.window) * this.cur_interval_tap_scaler;
  var problemsInWindow = this.mw_max_problems.getTotalForWindow(this.window) * this.total_scaler;
  if (tapsInWindow === 0.0 || problemsInWindow < this.jj_required) {
    this.pmod = fastsqrt(this.pmod + CalcClamp(this.calming_comp, 0.0, 1.0));
  } else {
    this.pmod = tapsInWindow / problemsInWindow * 0.75;
  }
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  this.interval_end();
  return this.pmod;
};

WideRangeJJMod.prototype.interval_end = function() {
  this.current_problems = 0.0;
  this.max_interval_problems = 0.0;
  this.left_times = [];
  this.right_times = [];
};
