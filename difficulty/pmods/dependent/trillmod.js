/**
 * OHTrillMod, VOHTrillMod - trill pattern detection
 * OHTrill = one-hand trill (same hand alternating)
 * VOHTrill = very one-hand trill (wide range)
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * One-hand trill detection
 * Alternating notes on same hand
 */
class OHTrillMod {
    constructor() {
        this._pmod = PatternMod.OHTrill;
        this.reset();
    }

    reset() {
        this.trill_count = 0;
        this.total_rows = 0;
        this.last_col = -1;
        this.last_hand = -1;
        this.trill_len = 0;
        this.max_trill_len = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.total_rows++;

        // Determine which hand and column is active
        const left_count = mhi_left.num;
        const right_count = mhi_right.num;

        if (left_count === 1 && right_count === 0) {
            const col = mhi_left.cols.findIndex(c => c);
            if (col !== -1 && col !== this.last_col && this.last_hand === 0) {
                this.trill_len++;
            } else {
                if (this.trill_len > this.max_trill_len) {
                    this.max_trill_len = this.trill_len;
                }
                this.trill_len = 1;
            }
            this.last_col = col;
            this.last_hand = 0;
        } else if (right_count === 1 && left_count === 0) {
            const col = mhi_right.cols.findIndex(c => c);
            if (col !== -1 && col !== this.last_col && this.last_hand === 1) {
                this.trill_len++;
            } else {
                if (this.trill_len > this.max_trill_len) {
                    this.max_trill_len = this.trill_len;
                }
                this.trill_len = 1;
            }
            this.last_col = col;
            this.last_hand = 1;
        } else {
            if (this.trill_len > this.max_trill_len) {
                this.max_trill_len = this.trill_len;
            }
            this.trill_len = 0;
            this.last_hand = -1;
        }

        if (this.trill_len >= 4) {
            this.trill_count++;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const rate = this.trill_count / this.total_rows;
            pmod = 1.0 + (rate * 0.4);
        }

        if (this.max_trill_len >= 8) {
            pmod += Math.min(this.max_trill_len / 40, 0.15);
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Very one-hand trill (long-range trills)
 */
class VOHTrillMod {
    constructor() {
        this._pmod = PatternMod.VOHTrill;
        this.reset();
    }

    reset() {
        this.trill_notes = 0;
        this.total_notes = 0;
        this.trill_segments = [];
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
        this.total_notes += left_count + right_count;

        // Track trill segments (rapid alternation)
        if ((left_count === 1 && right_count === 0) ||
            (right_count === 1 && left_count === 0)) {
            this.trill_notes++;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_notes > 0) {
            const rate = this.trill_notes / this.total_notes;
            // VOHTrill has higher impact
            pmod = 1.0 + (rate * 0.5);
        }

        this.reset();
        return Math.min(pmod, 1.35);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.OHTrillMod = OHTrillMod;
    window.VOHTrillMod = VOHTrillMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OHTrillMod, VOHTrillMod };
}
