/**
 * Hand-Agnostic Pattern Mods Index
 * These pattern mods operate on all columns without hand-specific analysis
 */

if (typeof require !== 'undefined') {
    var { StreamMod } = require('./streammod.js');
    var { JSMod } = require('./jsmod.js');
    var { HSMod } = require('./hsmod.js');
    var { CJMod } = require('./cjmod.js');
    var { CJDensityMod, HSDensityMod } = require('./densitymods.js');
    var { FlamJamMod } = require('./flamjammod.js');
    var { TheThingLookerFinderThing, TheThingLookerFinderThing2 } = require('./thethingmod.js');
}

// PatternMods utility for setting agnostic mods
const PatternMods = {
    /**
     * Set agnostic pattern mod value for both hands
     */
    set_agnostic(pmod_id, value, itv, calc) {
        // Agnostic mods apply to both hands equally
        for (let hand of [0, 1]) {
            if (!calc.pmod_vals[hand][pmod_id]) {
                calc.pmod_vals[hand][pmod_id] = [];
            }
            calc.pmod_vals[hand][pmod_id][itv] = value;
        }
    }
};

// SequencerGeneral for hand-agnostic sequencing
class SequencerGeneral {
    constructor() {
        this.mods = [];
    }

    register(mod) {
        this.mods.push(mod);
    }

    advance(ms_now, notes) {
        for (let mod of this.mods) {
            mod.advance_sequencing(ms_now, notes);
        }
    }

    reset() {
        for (let mod of this.mods) {
            mod.full_reset();
        }
    }
}

if (typeof window !== 'undefined') {
    window.PatternMods = PatternMods;
    window.SequencerGeneral = SequencerGeneral;
    window.StreamMod = StreamMod;
    window.JSMod = JSMod;
    window.HSMod = HSMod;
    window.CJMod = CJMod;
    window.CJDensityMod = CJDensityMod;
    window.HSDensityMod = HSDensityMod;
    window.FlamJamMod = FlamJamMod;
    window.TheThingLookerFinderThing = TheThingLookerFinderThing;
    window.TheThingLookerFinderThing2 = TheThingLookerFinderThing2;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PatternMods,
        SequencerGeneral,
        StreamMod,
        JSMod,
        HSMod,
        CJMod,
        CJDensityMod,
        HSDensityMod,
        FlamJamMod,
        TheThingLookerFinderThing,
        TheThingLookerFinderThing2
    };
}
