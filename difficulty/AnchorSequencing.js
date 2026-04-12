/**
 * AnchorSequencing — port of AnchorSequencer from Etterna's MinaCalc.
 * Tracks anchor difficulty per column over a sliding window.
 */

function AnchorSequencer() {
  this.col_anchor_difficulty = [0, 0];
  this.anchor_counts = [0, 0];
}

AnchorSequencer.prototype.full_reset = function() {
  this.col_anchor_difficulty = [0, 0];
  this.anchor_counts = [0, 0];
};

AnchorSequencer.prototype.advance_sequencing = function(hand_notes) {
  var hand_count = popcount(hand_notes);
  if (hand_count === 1) {
    if (hand_notes & 0b0001) {
      this.col_anchor_difficulty[0]++;
      this.anchor_counts[0]++;
    } else if (hand_notes & 0b0010) {
      this.col_anchor_difficulty[0]++;
      this.anchor_counts[0]++;
    } else if (hand_notes & 0b0100) {
      this.col_anchor_difficulty[1]++;
      this.anchor_counts[1]++;
    } else if (hand_notes & 0b1000) {
      this.col_anchor_difficulty[1]++;
      this.anchor_counts[1]++;
    }
  }
};

AnchorSequencer.prototype.get_max_for_window_and_col = function(col) {
  if (col < 0 || col >= 2) return 0;
  if (this.anchor_counts[col] === 0) return 0;
  return this.col_anchor_difficulty[col] / this.anchor_counts[col];
};

AnchorSequencer.prototype.get_highest_anchor_difficulty = function() {
  var left = this.anchor_counts[0] > 0 ? this.col_anchor_difficulty[0] / this.anchor_counts[0] : 0;
  var right = this.anchor_counts[1] > 0 ? this.col_anchor_difficulty[1] / this.anchor_counts[1] : 0;
  return Math.max(left, right);
};

AnchorSequencer.prototype.interval_end = function() {
  this.col_anchor_difficulty = [0, 0];
  this.anchor_counts = [0, 0];
};
