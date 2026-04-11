/**
 * FlamJamMod - detects flam patterns (very close notes)
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Flam pattern detection
 * Identifies very close notes that might be flams (accidental or intentional)
 */
class FlamJamMod {
    constructor() {
        this._pmod = PatternMod.FlamJam;
        this.reset();
    }

    reset() {
        this.ms_history = [];
        this.flam_count = 0;
        this.row_count = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Flams are very close timing differences within the same "row"
     * In SM patterns, this might appear as multiple notes at nearly the same time
     */
    advance_sequencing(ms_now, notes) {
        this.row_count++;

        // Check if this is very close to previous
        if (this.ms_history.length > 0) {
            const last_ms = this.ms_history[this.ms_history.length - 1];
            const diff = ms_now - last_ms;

            // Flam threshold: within 15ms
            if (diff > 0 && diff < 15) {
                this.flam_count++;
            }
        }

        this.ms_history.push(ms_now);
        if (this.ms_history.length > 10) {
            this.ms_history.shift();
        }
    }

    calc(mitvi) {
        let pmod = 1.0;

        if (this.row_count > 0) {
            const flam_rate = this.flam_count / this.row_count;
            // Flams add difficulty due to timing ambiguity
            pmod = 1.0 + (flam_rate * 0.2);
        }

        this.reset();
        return Math.min(pmod, 1.15);
    }

    __call__(mitvi) {
        return this.calc(mitvi);
    }
}

if (typeof window !== 'undefined') {
    window.FlamJamMod = FlamJamMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FlamJamMod };
}
