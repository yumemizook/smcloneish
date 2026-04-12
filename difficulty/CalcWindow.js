/**
 * CalcMovingWindow — port of CalcWindow.h from Etterna's MinaCalc.
 * Fixed-size (6-slot) moving window with statistical operations.
 */

var CCACC_TIMING_CHECK_SIZE = 3;

function CalcMovingWindow() {
  this._vals = new Float32Array(MAX_MOVING_WINDOW_SIZE);
}

CalcMovingWindow.prototype.push = function(newVal) {
  for (var i = 1; i < MAX_MOVING_WINDOW_SIZE; i++) {
    this._vals[i - 1] = this._vals[i];
  }
  this._vals[MAX_MOVING_WINDOW_SIZE - 1] = newVal;
};

CalcMovingWindow.prototype.get = function(pos) {
  return this._vals[pos];
};

CalcMovingWindow.prototype.set = function(pos, val) {
  this._vals[pos] = val;
};

CalcMovingWindow.prototype.getNow = function() {
  return this._vals[MAX_MOVING_WINDOW_SIZE - 1];
};

CalcMovingWindow.prototype.getLast = function() {
  return this._vals[MAX_MOVING_WINDOW_SIZE - 2];
};

CalcMovingWindow.prototype.getTotalForWindow = function(window) {
  var o = 0;
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    o += this._vals[i];
  }
  return o;
};

CalcMovingWindow.prototype.getMaxForWindow = function(window) {
  var o = 0;
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    if (this._vals[i] > o) o = this._vals[i];
  }
  return o;
};

CalcMovingWindow.prototype.getMinForWindow = function(window) {
  var o = this.getNow();
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    if (this._vals[i] < o) o = this._vals[i];
  }
  return o;
};

CalcMovingWindow.prototype.getMeanOfWindow = function(window) {
  var o = 0;
  var i = MAX_MOVING_WINDOW_SIZE;
  while (i > MAX_MOVING_WINDOW_SIZE - window) {
    --i;
    o += this._vals[i];
  }
  return o / window;
};

CalcMovingWindow.prototype.getCvOfWindow = function(window) {
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

CalcMovingWindow.prototype.ccaccTimingCheck = function(factor, threshold) {
  this._vals[4] /= factor;
  var o = this.getCvOfWindow(CCACC_TIMING_CHECK_SIZE);
  this._vals[4] *= factor;
  return o < threshold;
};

CalcMovingWindow.prototype.accaTimingCheck = function(factor, threshold) {
  this._vals[4] *= factor;
  var o = this.getCvOfWindow(CCACC_TIMING_CHECK_SIZE);
  this._vals[4] /= factor;
  return o < threshold;
};

CalcMovingWindow.prototype.rollTimingCheck = function(factor, threshold) {
  if (this._vals[4] > this._vals[5]) {
    return this.ccaccTimingCheck(factor, threshold);
  } else {
    return this.accaTimingCheck(factor, threshold);
  }
};

CalcMovingWindow.prototype.zero = function() {
  this._vals.fill(0);
};

CalcMovingWindow.prototype.fill = function(val) {
  this._vals.fill(val);
};
