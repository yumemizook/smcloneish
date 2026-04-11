/**
 * CJMod - detects chordjack patterns (repeated chords)
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Chordjack pattern detection
 * Identifies repeated chord patterns (jacks with 2+ notes)
 */
class CJMod {
    constructor() {
        this._pmod = PatternMod.CJ;
        this.reset();
    }

    reset() {
        this.cj_rows = 0;
        this.total_rows = 0;
        this.last_notes = 0;
        this.chordjack_len = 0;
        this.max_cj_len = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Advance sequencing for CJ detection
     */
    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        this.total_rows++;

        // Chordjack: 2+ notes that overlap with previous chord
        if (count >= 2) {
            const overlap = notes & this.last_notes;
            if (popCount(overlap) >= 1) {
                // Continuing chordjack
                this.cj_rows++;
                this.chordjack_len++;
            } else {
                if (this.chordjack_len > this.max_cj_len) {
                    this.max_cj_len = this.chordjack_len;
                }
                this.chordjack_len = 1;
            }
        } else {
            if (this.chordjack_len > this.max_cj_len) {
                this.max_cj_len = this.chordjack_len;
            }
            this.chordjack_len = 0;
        }

        this.last_notes = notes;
    }

    /**
     * Calculate CJ modifier for interval
     */
    calc(mitvi) {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const cj_density = this.cj_rows / this.total_rows;

            if (cj_density > 0.1) {
                pmod = 1.0 + (cj_density * 0.6);
            }
        }

        if (this.max_cj_len >= 6) {
            pmod += Math.min(this.max_cj_len / 40, 0.15);
        }

        this.reset();
        return Math.min(pmod, 1.35);
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
    window.CJMod = CJMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CJMod };
}
