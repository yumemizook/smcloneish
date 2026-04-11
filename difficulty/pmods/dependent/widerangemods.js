/**
 * WideRange mods - jumptrill, JJ, anchor detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Wide-range jumptrill detection
 */
class WideRangeJumptrillMod {
    constructor() {
        this._pmod = PatternMod.WideRangeJumptrill;
        this.reset();
    }

    reset() {
        this.jt_count = 0;
        this.total_rows = 0;
        this.pattern_len = 0;
        this.max_pattern_len = 0;
        this.last_was_jump = false;
        this.jt_sequence = [];
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.total_rows++;

        const left_count = mhi_left.num;
        const right_count = mhi_right.num;
        const total_count = left_count + right_count;

        // Jumptrill pattern: jump on one hand, then jump on the other
        const is_jump = total_count === 2;
        const is_left = left_count > 0 && right_count === 0;
        const is_right = right_count > 0 && left_count === 0;

        if (is_jump) {
            if (this.last_was_jump) {
                this.pattern_len++;
            } else {
                if (this.pattern_len > this.max_pattern_len) {
                    this.max_pattern_len = this.pattern_len;
                }
                this.pattern_len = 1;
            }
            this.last_was_jump = true;

            if (this.pattern_len >= 3) {
                this.jt_count++;
            }
        } else if (is_left || is_right) {
            // Singles break jumptrill but keep pattern going
            this.last_was_jump = false;
        } else {
            if (this.pattern_len > this.max_pattern_len) {
                this.max_pattern_len = this.pattern_len;
            }
            this.pattern_len = 0;
            this.last_was_jump = false;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const rate = this.jt_count / this.total_rows;
            pmod = 1.0 + (rate * 0.35);
        }

        if (this.max_pattern_len >= 8) {
            pmod += Math.min(this.max_pattern_len / 60, 0.1);
        }

        this.reset();
        return Math.min(pmod, 1.25);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Wide-range jump-jump (JJ) detection
 */
class WideRangeJJMod {
    constructor() {
        this._pmod = PatternMod.WideRangeJJ;
        this.reset();
    }

    reset() {
        this.jj_count = 0;
        this.total_jumps = 0;
        this.consecutive_jumps = 0;
        this.max_consecutive = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        const left_count = mhi_left.num;
        const right_count = mhi_right.num;
        const total_count = left_count + right_count;

        if (total_count === 2) {
            this.total_jumps++;
            this.consecutive_jumps++;
        } else {
            if (this.consecutive_jumps > this.max_consecutive) {
                this.max_consecutive = this.consecutive_jumps;
            }
            this.consecutive_jumps = 0;
        }

        if (this.consecutive_jumps >= 4) {
            this.jj_count++;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_jumps > 0) {
            const rate = this.jj_count / this.total_jumps;
            pmod = 1.0 + (rate * 0.25);
        }

        if (this.max_consecutive >= 8) {
            pmod += Math.min(this.max_consecutive / 80, 0.08);
        }

        this.reset();
        return Math.min(pmod, 1.2);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Wide-range anchor detection
 */
class WideRangeAnchorMod {
    constructor() {
        this._pmod = PatternMod.WideRangeAnchor;
        this.reset();
    }

    reset() {
        this.anchor_notes = 0;
        this.total_notes = 0;
        this.anchors = [];
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        const left_cols = mhi_left.cols.map((v, i) => v ? ['L', i] : null).filter(x => x);
        const right_cols = mhi_right.cols.map((v, i) => v ? ['R', i] : null).filter(x => x);
        const current_cols = [...left_cols, ...right_cols];

        this.total_notes += current_cols.length;

        // Check for anchors (same column repeating)
        for (let col of current_cols) {
            const key = `${col[0]}${col[1]}`;
            if (this.anchors.includes(key)) {
                this.anchor_notes++;
            }
        }

        // Update anchors for next iteration
        this.anchors = current_cols.map(c => `${c[0]}${c[1]}`);
    }

    calc() {
        let pmod = 1.0;

        if (this.total_notes > 0) {
            const rate = this.anchor_notes / this.total_notes;
            // Anchors add strain
            pmod = 1.0 + (rate * 0.3);
        }

        this.reset();
        return Math.min(pmod, 1.25);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.WideRangeJumptrillMod = WideRangeJumptrillMod;
    window.WideRangeJJMod = WideRangeJJMod;
    window.WideRangeAnchorMod = WideRangeAnchorMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WideRangeJumptrillMod, WideRangeJJMod, WideRangeAnchorMod };
}
