/**
 * Hand-Dependent Pattern Mods Index
 * These pattern mods analyze left and right hands separately
 */

if (typeof require !== 'undefined') {
    var { OHJumpMod, CJOHJumpMod, CJOHAnchorMod } = require('./ohjumpmod.js');
    var { BalanceMod, WideRangeBalanceMod } = require('./balancemod.js');
    var { RollMod, RollJSMod, WideRangeRollMod } = require('./rollmod.js');
    var { OHTrillMod, VOHTrillMod } = require('./trillmod.js');
    var { ChaosMod } = require('./chaosmod.js');
    var { MinijackMod } = require('./minijackmod.js');
    var { WideRangeJumptrillMod, WideRangeJJMod, WideRangeAnchorMod } = require('./widerangemods.js');
    var { RunningManMod } = require('./runningmanmod.js');
}

// Hand-dependent sequencing helper
class HandDependentSequencer {
    constructor() {
        this.mods = [];
        this.mhi_left = null;
        this.mhi_right = null;
    }

    register(mod) {
        this.mods.push(mod);
    }

    advance(mhi_left, mhi_right) {
        this.mhi_left = mhi_left;
        this.mhi_right = mhi_right;

        for (let mod of this.mods) {
            mod.advance_sequencing(mhi_left, mhi_right);
        }
    }

    reset() {
        for (let mod of this.mods) {
            mod.full_reset();
        }
    }

    get_mod_values() {
        const values = {};
        for (let mod of this.mods) {
            values[mod._pmod] = mod.calc();
        }
        return values;
    }
}

if (typeof window !== 'undefined') {
    window.HandDependentSequencer = HandDependentSequencer;
    window.OHJumpMod = OHJumpMod;
    window.CJOHJumpMod = CJOHJumpMod;
    window.CJOHAnchorMod = CJOHAnchorMod;
    window.BalanceMod = BalanceMod;
    window.WideRangeBalanceMod = WideRangeBalanceMod;
    window.RollMod = RollMod;
    window.RollJSMod = RollJSMod;
    window.WideRangeRollMod = WideRangeRollMod;
    window.OHTrillMod = OHTrillMod;
    window.VOHTrillMod = VOHTrillMod;
    window.ChaosMod = ChaosMod;
    window.MinijackMod = MinijackMod;
    window.WideRangeJumptrillMod = WideRangeJumptrillMod;
    window.WideRangeJJMod = WideRangeJJMod;
    window.WideRangeAnchorMod = WideRangeAnchorMod;
    window.RunningManMod = RunningManMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HandDependentSequencer,
        OHJumpMod, CJOHJumpMod, CJOHAnchorMod,
        BalanceMod, WideRangeBalanceMod,
        RollMod, RollJSMod, WideRangeRollMod,
        OHTrillMod, VOHTrillMod,
        ChaosMod,
        MinijackMod,
        WideRangeJumptrillMod, WideRangeJJMod, WideRangeAnchorMod,
        RunningManMod
    };
}
