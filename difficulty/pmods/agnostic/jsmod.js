/**
 * JSMod - detects jumpstream patterns (alternating single notes and jumps)
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Jumpstream pattern detection
 * Identifies patterns with mixed singles and jumps
 */
class JSMod {
    constructor() {
        this._pmod = PatternMod.JS;
        this.reset();
    }

    reset() {
        this.js_count = 0;
        this.row_count = 0;
        this.jump_count = 0;
        this.single_count = 0;
        this.js_seq_len = 0;
        this.max_js_seq = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Advance sequencing for JS detection
     */
    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        this.row_count++;

        // Track jumpstream pattern: single -> jump -> single -> jump
        if (count === 2) {
            this.jump_count++;
            if (this.js_seq_len > 0 && (this.js_seq_len % 2) === 1) {
                // Good, continuing pattern
                this.js_seq_len++;
            } else {
                // Starting new pattern
                if (this.js_seq_len > this.max_js_seq) {
                    this.max_js_seq = this.js_seq_len;
                }
                this.js_seq_len = 1;
            }
        } else if (count === 1) {
            this.single_count++;
            if (this.js_seq_len > 0 && (this.js_seq_len % 2) === 0) {
                this.js_seq_len++;
            } else {
                if (this.js_seq_len > this.max_js_seq) {
                    this.max_js_seq = this.js_seq_len;
                }
                this.js_seq_len = 1;
            }
        } else {
            // Reset on hands or empties
            if (this.js_seq_len > this.max_js_seq) {
                this.max_js_seq = this.js_seq_len;
            }
            this.js_seq_len = 0;
        }
    }

    /**
     * Calculate JS modifier for interval
     */
    calc(mitvi) {
        let pmod = 1.0;

        // Calculate JS density
        if (this.row_count > 0) {
            const jump_density = this.jump_count / this.row_count;
            const single_density = this.single_count / this.row_count;

            // Good JS has roughly equal singles and jumps
            const ratio = Math.min(jump_density, single_density) / Math.max(jump_density, single_density);

            if (ratio > 0.3 && jump_density > 0.15) {
                // This looks like jumpstream
                pmod = 1.0 + (jump_density * 0.5);
            }
        }

        // Boost for long JS sequences
        if (this.max_js_seq >= 8) {
            pmod += Math.min(this.max_js_seq / 50, 0.1);
        }

        // Reset for next interval
        this.reset();

        return Math.min(pmod, 1.25);
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
    window.JSMod = JSMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JSMod };
}
