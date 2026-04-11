/**
 * OHJumpMod / CJOHJumpMod - One-hand jump detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * One-hand jump detection
 * Identifies jumps that occur on one hand (columns on same side)
 */
class OHJumpMod {
    constructor() {
        this._pmod = PatternMod.OHJumpMod;
        this.reset();
    }

    reset() {
        this.ohj_count = 0;
        this.total_jumps = 0;
    }

    setup(hand) {
        this.reset();
        this.hand = hand;
    }

    full_reset() {
        this.reset();
    }

    /**
     * Process hand-specific data
     * @param {MetaHandInfo} mhi - current hand info
     * @param {MetaHandInfo} last_mhi - previous hand info
     */
    advance_sequencing(mhi, last_mhi) {
        // One-hand jump: 2 notes on same hand
        if (mhi.num === 2) {
            this.total_jumps++;
            // Check if the other hand is empty (true OHJ)
            // This is determined by the caller based on both hands
            this.ohj_count++;
        }
    }

    calc() {
        let pmod = 1.0;
        if (this.total_jumps > 0) {
            const ohj_rate = this.ohj_count / this.total_jumps;
            // OHJ makes streams harder
            pmod = 1.0 + (ohj_rate * 0.3);
        }
        return Math.min(pmod, 1.25);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * Chordjack OH jump variant
 */
class CJOHJumpMod {
    constructor() {
        this._pmod = PatternMod.CJOHJump;
        this.reset();
    }

    reset() {
        this.ohj_count = 0;
        this.total_chords = 0;
    }

    setup(hand) {
        this.reset();
        this.hand = hand;
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi, last_mhi) {
        if (mhi.num >= 2) {
            this.total_chords++;
            // For CJ, we care about chord-based OH patterns
            if (mhi.num >= 2) {
                this.ohj_count++;
            }
        }
    }

    calc() {
        let pmod = 1.0;
        if (this.total_chords > 0) {
            const rate = this.ohj_count / this.total_chords;
            pmod = 1.0 + (rate * 0.25);
        }
        return Math.min(pmod, 1.2);
    }

    __call__() {
        return this.calc();
    }
}

/**
 * CJ OH Anchor variant
 */
class CJOHAnchorMod {
    constructor() {
        this._pmod = PatternMod.CJOHAnchor;
        this.reset();
    }

    reset() {
        this.anchor_count = 0;
        this.total_rows = 0;
        this.last_anchor_col = -1;
    }

    setup(hand) {
        this.reset();
        this.hand = hand;
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi, last_mhi) {
        this.total_rows++;

        // Find anchor column (column that's repeated)
        for (let i = 0; i < mhi.cols.length; i++) {
            if (mhi.cols[i] && last_mhi.cols[i]) {
                this.anchor_count++;
                break;
            }
        }
    }

    calc() {
        let pmod = 1.0;
        if (this.total_rows > 0) {
            const rate = this.anchor_count / this.total_rows;
            pmod = 1.0 + (rate * 0.2);
        }
        return Math.min(pmod, 1.15);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.OHJumpMod = OHJumpMod;
    window.CJOHJumpMod = CJOHJumpMod;
    window.CJOHAnchorMod = CJOHAnchorMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OHJumpMod, CJOHJumpMod, CJOHAnchorMod };
}
