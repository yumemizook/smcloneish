/**
 * Density Mods - CJDensityMod and HSDensityMod
 * Ported from Agnostic/HA_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Chordjack density - tracks density of chord-heavy sections
 */
class CJDensityMod {
    constructor() {
        this._pmod = PatternMod.CJDensity;
        this.reset();
    }

    reset() {
        this.chord_notes = 0;
        this.total_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        this.total_notes += count;
        if (count >= 2) {
            this.chord_notes += count;
        }
    }

    calc(mitvi) {
        let pmod = 1.0;
        if (this.total_notes > 0) {
            const density = this.chord_notes / this.total_notes;
            pmod = 1.0 + (density * 0.3);
        }
        this.reset();
        return Math.min(pmod, 1.25);
    }

    __call__(mitvi) {
        return this.calc(mitvi);
    }
}

/**
 * Handstream density - tracks density of hand-heavy sections
 */
class HSDensityMod {
    constructor() {
        this._pmod = PatternMod.HSDensity;
        this.reset();
    }

    reset() {
        this.hand_notes = 0;
        this.total_notes = 0;
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        this.total_notes += count;
        if (count >= 3) {
            this.hand_notes += count;
        }
    }

    calc(mitvi) {
        let pmod = 1.0;
        if (this.total_notes > 0) {
            const density = this.hand_notes / this.total_notes;
            pmod = 1.0 + (density * 0.4);
        }
        this.reset();
        return Math.min(pmod, 1.3);
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
    window.CJDensityMod = CJDensityMod;
    window.HSDensityMod = HSDensityMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CJDensityMod, HSDensityMod };
}
