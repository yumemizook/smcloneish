/**
 * StreamMod - detects stream patterns (continuous single notes)
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Stream pattern detection
 * Identifies continuous streams of single notes
 */
class StreamMod {
    constructor() {
        this._pmod = PatternMod.Stream;
        this.reset();
    }

    reset() {
        this.running_max = 0;
        this.stream_size = 0;
        this.last_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Advance sequencing for stream detection
     */
    advance_sequencing(ms_now, notes) {
        // Stream is defined as continuous single-note rows
        // We track the "streaminess" based on note density and single-note continuity

        const count = popCount(notes);

        // If single note, continue stream
        if (count === 1) {
            this.stream_size++;
        } else {
            // Record max stream size before reset
            if (this.stream_size > this.running_max) {
                this.running_max = this.stream_size;
            }
            this.stream_size = 0;
        }

        this.last_notes = notes;
    }

    /**
     * Calculate stream modifier for interval
     */
    calc(mitvi) {
        // Base pmod value
        let pmod = 1.0;

        // If we have a decent stream built up, boost
        if (this.running_max >= 8) {
            pmod += Math.min(this.running_max / 100, 0.15);
        }

        // Reset for next interval
        this.running_max = 0;
        this.stream_size = 0;

        return pmod;
    }

    /**
     * Operator - called during iteration
     */
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
    window.StreamMod = StreamMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StreamMod };
}
