/**
 * RunningManMod - "running man" pattern detection
 * A specific pattern where you alternate between a single note and a chord
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Running man detection
 * Pattern: single -> chord -> single -> chord (alternating)
 */
class RunningManMod {
    constructor() {
        this._pmod = PatternMod.RunningMan;
        this.reset();
    }

    reset() {
        this.rm_count = 0;
        this.total_rows = 0;
        this.state = 0;  // 0: start, 1: single, 2: chord
        this.rm_len = 0;
        this.max_rm_len = 0;
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

        // State machine for running man
        // Looking for: single -> chord (2+) -> single -> chord
        if (total_count === 1) {
            if (this.state === 0 || this.state === 2) {
                // Got single, expected single
                this.state = 1;
                this.rm_len++;
            } else if (this.state === 1) {
                // Got single but expected chord - reset
                if (this.rm_len > this.max_rm_len) {
                    this.max_rm_len = this.rm_len;
                }
                this.rm_len = 1;  // This single starts new potential RM
            }
        } else if (total_count >= 2) {
            if (this.state === 1) {
                // Got chord after single - good
                this.state = 2;
                this.rm_len++;

                if (this.rm_len >= 4) {
                    this.rm_count++;
                }
            } else if (this.state === 2) {
                // Got chord but expected single - continue if same chord size
                // For simplicity, just increment
                this.rm_len++;
            } else {
                this.state = 0;
            }
        } else {
            // Empty row
            this.state = 0;
            if (this.rm_len > this.max_rm_len) {
                this.max_rm_len = this.rm_len;
            }
            this.rm_len = 0;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const rate = this.rm_count / this.total_rows;
            pmod = 1.0 + (rate * 0.4);
        }

        if (this.max_rm_len >= 8) {
            pmod += Math.min(this.max_rm_len / 50, 0.12);
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.RunningManMod = RunningManMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RunningManMod };
}
