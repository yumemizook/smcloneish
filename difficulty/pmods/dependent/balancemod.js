/**
 * BalanceMod / WideRangeBalanceMod - hand balance detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Hand balance detection
 * Measures how evenly notes are distributed between hands
 */
class BalanceMod {
    constructor() {
        this._pmod = PatternMod.Balance;
        this.reset();
    }

    reset() {
        this.left_notes = 0;
        this.right_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.left_notes += mhi_left.num;
        this.right_notes += mhi_right.num;
    }

    calc() {
        let pmod = 1.0;
        const total = this.left_notes + this.right_notes;

        if (total > 0) {
            const left_ratio = this.left_notes / total;
            const right_ratio = this.right_notes / total;

            // Perfect balance = 0.5 each
            const imbalance = Math.abs(left_ratio - 0.5);

            // More imbalance = higher technicality
            pmod = 1.0 + (imbalance * 0.4);
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Wide-range balance detection
 * Looks at balance over longer intervals
 */
class WideRangeBalanceMod {
    constructor() {
        this._pmod = PatternMod.WideRangeBalance;
        this.reset();
    }

    reset() {
        this.left_notes = 0;
        this.right_notes = 0;
        this.imbalance_max = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.left_notes += mhi_left.num;
        this.right_notes += mhi_right.num;

        const total = this.left_notes + this.right_notes;
        if (total > 10) {
            const left_ratio = this.left_notes / total;
            const imbalance = Math.abs(left_ratio - 0.5);
            this.imbalance_max = Math.max(this.imbalance_max, imbalance);
        }
    }

    calc() {
        let pmod = 1.0;

        // Wide range imbalance adds technicality
        pmod = 1.0 + (this.imbalance_max * 0.5);

        this.reset();
        return Math.min(pmod, 1.35);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.BalanceMod = BalanceMod;
    window.WideRangeBalanceMod = WideRangeBalanceMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BalanceMod, WideRangeBalanceMod };
}
