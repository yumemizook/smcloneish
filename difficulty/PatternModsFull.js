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
  this.min_mod = 0.95; this.max_mod = 1.05;
  this.base = -0.1; this.window = 6;
  this.pmod = neutral; this.msWindow = [];
}

ChaosMod.prototype.full_reset = function() { this.msWindow = []; this.pmod = neutral; };

ChaosMod.prototype.interval_end = function() { this.msWindow = []; };

ChaosMod.prototype.advance_sequencing = function(ms_any) {
  if (ms_any.length < 2) return;
  var a = ms_any[ms_any.length - 1];
  var b = ms_any[ms_any.length - 2];
  if (a === 0 || b === 0 || a === b) {
    this.msWindow.push(1.0);
    if (this.msWindow.length > this.window) this.msWindow.shift();
    return;
  }
  var prop = div_high_by_low(a, b);
  var mop = Math.floor(prop);
  var flop = prop - mop;
  if (flop === 0) flop = 1.0;
  else if (flop >= 0.5) flop = Math.abs(flop - 1.0) + 1.0;
  else flop += 1.0;
  this.msWindow.push(flop);
  if (this.msWindow.length > this.window) this.msWindow.shift();
};

ChaosMod.prototype.operator = function(total_taps) {
  if (total_taps === 0) return neutral;
  if (this.msWindow.length === 0) return neutral;
  var mean = this.msWindow.reduce(function(a, b) { return a + b; }, 0) / this.msWindow.length;
  this.pmod = this.base + mean;
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  return this.pmod;
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
  this.min_mod = 0.5; this.max_mod = 1.0;
  this.base = 0.5; this.suppression = 1.5;
  this.cv_threshold = 0.25;
  this.window = 0;
  this.mw_bad_juju = new SimpleMovingWindow();
  this.foundyatrills = new Array(20).fill(0);
  this.trill_counter = 0;
  this.last_mt = meta_type.meta_type_init;
  this.pmod = neutral;
}

OHTrillMod.prototype.full_reset = function() {
  this.mw_bad_juju.zero();
  this.foundyatrills.fill(0);
  this.trill_counter = 0;
  this.last_mt = meta_type.meta_type_init;
  this.pmod = neutral;
};

OHTrillMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

OHTrillMod.prototype.advance_sequencing = function(mt, ms_now) {
  if (mt === meta_type.meta_cccccc || mt === meta_type.meta_ccacc || mt === meta_type.meta_acca) {
    this.mw_bad_juju.push(ms_now);
  }
  if (mt === meta_type.meta_cccccc) {
    if (this.mw_bad_juju.getCvOfWindow(this.window) < this.cv_threshold) {
      this.trill_counter++;
      this.foundyatrills[this.trill_counter % this.foundyatrills.length] = 1;
    }
  }
};

OHTrillMod.prototype.set_pmod = function(itvhi) {
  if (get_taps_windowi(itvhi, this.window) === 0) {
    this.pmod = neutral; return neutral;
  }
  var trills = this.foundyatrills.reduce(function(a, b) { return a + b; }, 0);
  if (trills === 0) { this.pmod = neutral; return neutral; }
  var prop = trills / get_taps_windowf(itvhi, this.window);
  this.pmod = CalcClamp(this.base + prop * this.suppression, this.min_mod, this.max_mod);
  return this.pmod;
};

OHTrillMod.prototype.operator = function(itvhi, mt, ms_now) {
  this.advance_sequencing(mt, ms_now);
  this.set_pmod(itvhi);
  this.last_mt = mt;
  return this.pmod;
};

// ─── Hand-Dependent: WideRangeRollMod ───────────────────────────────────

function WideRangeRollMod() {
  this.window_param = 5.0;
  this.min_mod = 0.25; this.max_mod = 1.0;
  this.base = 0.15;
  this.window = 0;
  this.mw_max = new SimpleMovingWindow();
  this.mw_adj_ms = new SimpleMovingWindow();
  this.max_thingy = 0;
  this.pmod = 0.25;
}

WideRangeRollMod.prototype.full_reset = function() {
  this.mw_max.zero(); this.mw_adj_ms.zero();
  this.max_thingy = 0; this.pmod = this.min_mod;
};

WideRangeRollMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeRollMod.prototype.operator = function(itvhi) {
  if (get_taps_windowi(itvhi, this.window) === 0 || this.mw_max.getCvOfWindow(this.window) === 0) {
    this.pmod = neutral; return neutral;
  }
  var zomg = this.max_thingy > 0 ? get_taps_windowf(itvhi, this.window) / this.max_thingy : 1;
  this.pmod *= zomg;
  this.pmod = CalcClamp(this.base + fastsqrt(this.pmod), this.min_mod, this.max_mod);
  return this.pmod;
};

// ─── Hand-Dependent: WideRangeJumptrillMod ──────────────────────────────

function WideRangeJumptrillMod() {
  this.window_param = 3.0;
  this.min_mod = 0.25; this.max_mod = 1.0;
  this.base = 0.4;
  this.window = 0;
  this.mw_jt = new SimpleMovingWindow();
  this.jt_counter = 0;
  this.pmod = neutral;
}

WideRangeJumptrillMod.prototype.full_reset = function() {
  this.mw_jt.zero(); this.jt_counter = 0; this.pmod = neutral;
};

WideRangeJumptrillMod.prototype.setup = function(max_window) {
  this.window = Math.min(Math.max(Math.floor(this.window_param), 1), max_window);
};

WideRangeJumptrillMod.prototype.operator = function(itvhi) {
  this.mw_jt.push(this.jt_counter);
  if (get_taps_windowi(itvhi, this.window) === 0 || this.mw_jt.getCvOfWindow(this.window) === 0) {
    this.pmod = neutral; this.jt_counter = 0; return neutral;
  }
  this.pmod = get_taps_windowf(itvhi, this.window) / this.mw_jt.getCvOfWindow(this.window);
  this.pmod = CalcClamp(this.pmod, this.min_mod, this.max_mod);
  this.jt_counter = 0;
  return this.pmod;
};
