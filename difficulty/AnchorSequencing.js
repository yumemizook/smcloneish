/**
 * AnchorSequencing — port of AnchorSequencer from Etterna's MinaCalc.
 * Tracks anchor difficulty per column over a sliding window.
 */

var ANCHOR_SPACING_BUFFER_MS = 10.0;
var ANCHOR_SPEED_INCREASE_CUTOFF_FACTOR = 2.34;
var GUARANTEED_RESET_BUFFER_MS = 1000.0;
var MS_INIT = 5000.0;
var S_INIT = -5.0;

function FingerSequencing(col) {
  this._ct = col;
  this.full_reset();
}

FingerSequencing.prototype.full_reset = function() {
  this._len = 1;
  this._sc_ms = MS_INIT;
  this._max_ms = MS_INIT;
  this._last = S_INIT;
  this._start = S_INIT;
};

FingerSequencing.prototype.advance = function(now) {
  if (this._last <= S_INIT + 1) {
    this._last = now;
    return;
  }
  this._sc_ms = msFrom(now, this._last);
  if (this._sc_ms > this._max_ms + ANCHOR_SPACING_BUFFER_MS) {
    this._start = this._last;
    this._len = 2;
  } else if (this._sc_ms * ANCHOR_SPEED_INCREASE_CUTOFF_FACTOR < this._max_ms) {
    this._start = this._last;
    this._len = 2;
  } else {
    this._len++;
  }
  this._max_ms = this._sc_ms;
  this._last = now;
};

function AnchorSequencer() {
  this.anch = [new FingerSequencing(col_left), new FingerSequencing(col_right)];
  this.max_seen = [0, 0];
  this.mw_max = [new CalcMovingWindow(), new CalcMovingWindow()];
  this.mw_any_ms = new CalcMovingWindow();
  this.mw_cc_ms = new CalcMovingWindow();
  this.mw_sc_ms = [new CalcMovingWindow(), new CalcMovingWindow()];
}

AnchorSequencer.prototype.full_reset = function() {
  this.max_seen = [0, 0];
  this.anch[col_left].full_reset();
  this.anch[col_right].full_reset();
  this.mw_max[col_left].fill(0);
  this.mw_max[col_right].fill(0);
  this.mw_any_ms.fill(MS_INIT);
  this.mw_cc_ms.fill(MS_INIT);
  this.mw_sc_ms[col_left].fill(MS_INIT);
  this.mw_sc_ms[col_right].fill(MS_INIT);
};

AnchorSequencer.prototype.get_sc_ms_now = function(colType, lower) {
  if (lower === undefined) lower = true;
  if (colType === col_ohjump) {
    var left = this.mw_sc_ms[col_left].getNow();
    var right = this.mw_sc_ms[col_right].getNow();
    return lower ? Math.min(left, right) : Math.max(left, right);
  }
  return this.mw_sc_ms[colType].getNow();
};

AnchorSequencer.prototype.get_cc_ms_now = function() {
  return this.mw_cc_ms.getNow();
};

AnchorSequencer.prototype.get_any_ms_window = function() {
  return this.mw_any_ms;
};

AnchorSequencer.prototype.advance_sequencing = function(colType, rowTime, msNow) {
  if (colType !== col_ohjump) {
    var cur = this.anch[colType];
    if (cur._last > S_INIT + 1 && msFrom(rowTime, cur._last) > GUARANTEED_RESET_BUFFER_MS) {
      cur.full_reset();
      this.mw_sc_ms[colType].fill(MS_INIT);
      this.mw_cc_ms.fill(MS_INIT);
      this.mw_any_ms.fill(MS_INIT);
    }
  }

  if (colType === col_left || colType === col_right) {
    var opposite = colType === col_left ? col_right : col_left;
    this.anch[colType].advance(rowTime);
    this.max_seen[colType] = Math.max(this.max_seen[colType], this.anch[colType]._len);
    if (this.anch[opposite]._last > S_INIT + 1 && msFrom(rowTime, this.anch[opposite]._last) > GUARANTEED_RESET_BUFFER_MS) {
      this.anch[opposite].full_reset();
    }
    this.mw_sc_ms[colType].push(this.anch[colType]._sc_ms);
    this.mw_cc_ms.push(this.anch[opposite]._last > S_INIT + 1 ? msFrom(rowTime, this.anch[opposite]._last) : MS_INIT);
  } else if (colType === col_ohjump) {
    this.anch[col_left].advance(rowTime);
    this.anch[col_right].advance(rowTime);
    this.max_seen[col_left] = Math.max(this.max_seen[col_left], this.anch[col_left]._len);
    this.max_seen[col_right] = Math.max(this.max_seen[col_right], this.anch[col_right]._len);
    this.mw_sc_ms[col_left].push(this.anch[col_left]._sc_ms);
    this.mw_sc_ms[col_right].push(this.anch[col_right]._sc_ms);
    this.mw_cc_ms.push(this.get_sc_ms_now(col_ohjump, true));
  }

  this.mw_any_ms.push(msNow);
};

AnchorSequencer.prototype.get_max_for_window_and_col = function(col, window) {
  if (col < 0 || col >= 2) return 0;
  return this.mw_max[col].getMaxForWindow(window || 1);
};

AnchorSequencer.prototype.get_highest_anchor_difficulty = function() {
  var left = this.max_seen[col_left];
  var right = this.max_seen[col_right];
  return Math.max(left, right);
};

AnchorSequencer.prototype.interval_end = function() {
  this.mw_max[col_left].push(this.max_seen[col_left]);
  this.mw_max[col_right].push(this.max_seen[col_right]);
  this.max_seen = [0, 0];
};
