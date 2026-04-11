/**
 * MinijackMod - minijack pattern detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Minijack detection - same column on consecutive rows
 */
class MinijackMod {
    constructor() {
        this._pmod = PatternMod.Minijack;
        this.reset();
    }

    reset() {
        this.mj_count = 0;
        this.total_notes = 0;
        this.last_cols = [];
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        // Get all active columns
        const current_cols = [];
        for (let i = 0; i < mhi_left.cols.length; i++) {
            if (mhi_left.cols[i]) current_cols.push(['L', i]);
        }
        for (let i = 0; i < mhi_right.cols.length; i++) {
            if (mhi_right.cols[i]) current_cols.push(['R', i]);
        }

        this.total_notes += current_cols.length;

        // Check for minijacks (same col on consecutive rows)
        for (let col of current_cols) {
            for (let last of this.last_cols) {
                if (col[0] === last[0] && col[1] === last[1]) {
                    this.mj_count++;
                    break;
                }
            }
        }

        this.last_cols = current_cols;
    }

    calc() {
        let pmod = 1.0;

        if (this.total_notes > 0) {
            const rate = this.mj_count / this.total_notes;
            // Minijacks add technical difficulty
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
    window.MinijackMod = MinijackMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinijackMod };
}
