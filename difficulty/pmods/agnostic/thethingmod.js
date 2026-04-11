/**
 * TheThingLookerFinderThing - complex pattern detection for technical patterns
 * TheThingLookerFinderThing2 - variant detector
 * Ported from Agnostic/HA_PatternMods/TheThingFinder.h
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Complex technical pattern detection
 * Identifies unusual/messy patterns that contribute to technical difficulty
 */
class TheThingLookerFinderThing {
    constructor() {
        this._pmod = PatternMod.TheThing;
        this.reset();
    }

    reset() {
        this.pattern_variance = 0;
        this.row_count = 0;
        this.note_history = [];
        this.last_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    /**
     * Look for complex/irregular patterns
     */
    advance_sequencing(ms_now, notes) {
        this.row_count++;

        // Track note count changes (variance in density)
        const count = popCount(notes);
        const last_count = popCount(this.last_notes);

        if (count !== last_count) {
            this.pattern_variance++;
        }

        // Check for unusual patterns (overlapping but different)
        if ((notes & this.last_notes) !== 0 && notes !== this.last_notes) {
            this.pattern_variance += 2;
        }

        this.last_notes = notes;
        this.note_history.push(count);
        if (this.note_history.length > 16) {
            this.note_history.shift();
        }
    }

    calc(mitvi) {
        let pmod = 1.0;

        if (this.row_count > 0) {
            const variance_rate = this.pattern_variance / this.row_count;
            // Higher variance = more technical
            pmod = 1.0 + (variance_rate * 0.4);
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__(mitvi) {
        return this.calc(mitvi);
    }
}

/**
 * Second variant - looks for different aspects of technicality
 */
class TheThingLookerFinderThing2 {
    constructor() {
        this._pmod = PatternMod.TheThing2;
        this.reset();
    }

    reset() {
        this.density_changes = 0;
        this.row_count = 0;
        this.last_count = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(ms_now, notes) {
        this.row_count++;
        const count = popCount(notes);

        // Track rapid density changes
        if (Math.abs(count - this.last_count) >= 2) {
            this.density_changes++;
        }

        this.last_count = count;
    }

    calc(mitvi) {
        let pmod = 1.0;

        if (this.row_count > 0) {
            const change_rate = this.density_changes / this.row_count;
            pmod = 1.0 + (change_rate * 0.5);
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
    window.TheThingLookerFinderThing = TheThingLookerFinderThing;
    window.TheThingLookerFinderThing2 = TheThingLookerFinderThing2;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TheThingLookerFinderThing, TheThingLookerFinderThing2 };
}
