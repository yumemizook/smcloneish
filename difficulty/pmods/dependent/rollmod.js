/**
 * RollMod, RollJSMod, WideRangeRollMod - roll pattern detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Roll detection (alternating between hands)
 */
class RollMod {
    constructor() {
        this._pmod = PatternMod.Roll;
        this.reset();
    }

    reset() {
        this.roll_count = 0;
        this.total_rows = 0;
        this.last_hand = -1;
        this.roll_len = 0;
        this.max_roll_len = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.total_rows++;

        const left_active = mhi_left.num > 0;
        const right_active = mhi_right.num > 0;

        // Roll: alternating hands with notes
        if (left_active && !right_active) {
            if (this.last_hand === 1) {
                this.roll_len++;
            } else {
                if (this.roll_len > this.max_roll_len) {
                    this.max_roll_len = this.roll_len;
                }
                this.roll_len = 1;
            }
            this.last_hand = 0;
        } else if (right_active && !left_active) {
            if (this.last_hand === 0) {
                this.roll_len++;
            } else {
                if (this.roll_len > this.max_roll_len) {
                    this.max_roll_len = this.roll_len;
                }
                this.roll_len = 1;
            }
            this.last_hand = 1;
        } else if (left_active && right_active) {
            // Jumps/hands break rolls
            if (this.roll_len > this.max_roll_len) {
                this.max_roll_len = this.roll_len;
            }
            this.roll_len = 0;
            this.last_hand = -1;
        }

        if (this.roll_len >= 4) {
            this.roll_count++;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const roll_rate = this.roll_count / this.total_rows;
            pmod = 1.0 + (roll_rate * 0.5);
        }

        if (this.max_roll_len >= 8) {
            pmod += Math.min(this.max_roll_len / 50, 0.1);
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Jumpstream roll variant
 */
class RollJSMod {
    constructor() {
        this._pmod = PatternMod.RollJS;
        this.reset();
    }

    reset() {
        this.js_roll_count = 0;
        this.total_rows = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.total_rows++;

        // JS rolls incorporate jumps
        const left_count = mhi_left.num;
        const right_count = mhi_right.num;

        if ((left_count === 1 && right_count === 2) ||
            (left_count === 2 && right_count === 1)) {
            this.js_roll_count++;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const rate = this.js_roll_count / this.total_rows;
            pmod = 1.0 + (rate * 0.4);
        }

        this.reset();
        return Math.min(pmod, 1.25);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Wide-range roll detection
 */
class WideRangeRollMod {
    constructor() {
        this._pmod = PatternMod.WideRangeRoll;
        this.reset();
    }

    reset() {
        this.last_hand = -1;
        this.roll_len = 0;
        this.max_roll_len = 0;
        this.total_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        const left_active = mhi_left.num > 0;
        const right_active = mhi_right.num > 0;
        this.total_notes += mhi_left.num + mhi_right.num;

        if (left_active && !right_active && this.last_hand !== 0) {
            if (this.roll_len > this.max_roll_len) {
                this.max_roll_len = this.roll_len;
            }
            this.roll_len = 1;
            this.last_hand = 0;
        } else if (right_active && !left_active && this.last_hand !== 1) {
            if (this.roll_len > this.max_roll_len) {
                this.max_roll_len = this.roll_len;
            }
            this.roll_len = 1;
            this.last_hand = 1;
        } else if ((left_active || right_active) && !(left_active && right_active)) {
            this.roll_len++;
        } else {
            if (this.roll_len > this.max_roll_len) {
                this.max_roll_len = this.roll_len;
            }
            this.roll_len = 0;
            this.last_hand = -1;
        }
    }

    calc() {
        let pmod = 1.0;

        if (this.max_roll_len >= 16) {
            pmod = 1.0 + Math.min(this.max_roll_len / 100, 0.15);
        }

        this.reset();
        return Math.min(pmod, 1.2);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.RollMod = RollMod;
    window.RollJSMod = RollJSMod;
    window.WideRangeRollMod = WideRangeRollMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RollMod, RollJSMod, WideRangeRollMod };
}
