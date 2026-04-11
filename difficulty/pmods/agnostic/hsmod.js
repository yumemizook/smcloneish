/**
 * HSMod - detects handstream patterns (3+ note chords mixed with singles)
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Handstream pattern detection
 * Identifies patterns with hands (3+ notes) and singles
 */
class HSMod {
    constructor() {
        this._pmod = PatternMod.HS;
        this.reset();
    }

    reset() {
        this.hand_count = 0;
        this.single_count = 0;
        this.row_count = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Advance sequencing for HS detection
     */
    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        this.row_count++;

        if (count >= 3) {
            this.hand_count++;
        } else if (count === 1) {
            this.single_count++;
        }
    }

    /**
     * Calculate HS modifier for interval
     */
    calc(mitvi) {
        let pmod = 1.0;

        if (this.row_count > 0) {
            const hand_density = this.hand_count / this.row_count;
            const single_density = this.single_count / this.row_count;

            // Handstream needs hands
            if (hand_density > 0.05) {
                // More hands = higher modifier
                pmod = 1.0 + (hand_density * 0.8);

                // Bonus for hand/single mix
                if (single_density > 0.2) {
                    pmod += 0.1;
                }
            }
        }

        this.reset();
        return Math.min(pmod, 1.4);
    }

    __call__(mitvi) {
        return this.calc(mitvi);
    }
}

function popCount(n) {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

if (typeof window !== 'undefined') {
    window.HSMod = HSMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HSMod };
}
