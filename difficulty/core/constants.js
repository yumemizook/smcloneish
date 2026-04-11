/**
 * Etterna MinaCalc Constants
 * Ported from Etterna/src/Etterna/MinaCalc
 */

// Skillset enum - must match Etterna ordering
const Skillset = {
    Overall: 0,
    Stream: 1,
    Jumpstream: 2,
    Handstream: 3,
    Stamina: 4,
    JackSpeed: 5,
    Chordjack: 6,
    Technical: 7
};

const NUM_Skillset = 8;

// Pattern Mod enum - identifies each pattern modifier
const PatternMod = {
    // Hand agnostic
    Stream: 0,
    JS: 1,
    HS: 2,
    CJ: 3,
    CJDensity: 4,
    HSDensity: 5,
    FlamJam: 6,
    TheThing: 7,
    TheThing2: 8,

    // Hand dependent
    OHJumpMod: 9,
    CJOHJump: 10,
    Balance: 11,
    Roll: 12,
    RollJS: 13,
    OHTrill: 14,
    VOHTrill: 15,
    Chaos: 16,
    CJOHAnchor: 17,
    Minijack: 18,
    WideRangeBalance: 19,
    WideRangeRoll: 20,
    WideRangeJumptrill: 21,
    WideRangeJJ: 22,
    WideRangeAnchor: 23,
    RunningMan: 24,

    NUM_PatternMod: 25
};

// Base difficulty types
const BaseDifficulty = {
    NPSBase: 0,
    CJBase: 1,
    TechBase: 2,
    NUM_BaseDifficulty: 3
};

// Hand indices
const Hand = {
    left_hand: 0,
    right_hand: 1,
    both_hands: [0, 1]
};

// Debug value types
const DebugValue = {
    Pts: 0,
    Pmod: 1,
    StamMod: 2,
    NUM_DebugValue: 3
};

// Base scalers per skillset for 4k (from Ulbu.h)
// Overall, Stream, Jumpstream, Handstream, Stamina, JackSpeed, Chordjack, Technical
const BASE_SCALERS_4K = [0.0, 0.91, 0.75, 0.77, 0.93, 1.01, 1.06, 1.06];

// Pattern mods used per skillset (from Ulbu.h)
const PMODS_PER_SKILLSET = [
    // Overall - nothing, don't handle here
    [],

    // Stream
    [PatternMod.Stream, PatternMod.OHTrill, PatternMod.VOHTrill, PatternMod.Roll,
     PatternMod.WideRangeRoll, PatternMod.WideRangeJumptrill, PatternMod.WideRangeJJ,
     PatternMod.FlamJam],

    // Jumpstream
    [PatternMod.JS, PatternMod.WideRangeBalance, PatternMod.WideRangeJumptrill,
     PatternMod.WideRangeJJ, PatternMod.VOHTrill, PatternMod.RollJS, PatternMod.FlamJam],

    // Handstream
    [PatternMod.HS, PatternMod.OHJumpMod, PatternMod.TheThing, PatternMod.WideRangeRoll,
     PatternMod.WideRangeJumptrill, PatternMod.WideRangeJJ, PatternMod.OHTrill,
     PatternMod.VOHTrill, PatternMod.FlamJam, PatternMod.HSDensity],

    // Stamina - nothing, don't handle here
    [],

    // JackSpeed - doesn't use pmods (atm)
    [],

    // Chordjack
    [PatternMod.CJ, PatternMod.WideRangeJumptrill, PatternMod.VOHTrill, PatternMod.FlamJam],

    // Technical
    [PatternMod.OHTrill, PatternMod.VOHTrill, PatternMod.Balance, PatternMod.Roll,
     PatternMod.Chaos, PatternMod.WideRangeJumptrill, PatternMod.WideRangeJJ,
     PatternMod.WideRangeBalance, PatternMod.WideRangeRoll, PatternMod.FlamJam,
     PatternMod.Minijack, PatternMod.TheThing, PatternMod.TheThing2]
];

// Calculation parameters
const CALC_PARAMS = {
    // Chisel parameters
    chisel_initial_low: 0.1,
    chisel_initial_high: 10.24,
    chisel_precision: 0.32,
    chisel_refine_precision: 0.32,

    // Stam parameters
    stam_ceil: 1.075234,
    stam_mag: 243.0,
    stam_fscale: 500.0,
    stam_prop: 0.69424,
    jack_stam_ceil: 1.05234,
    jack_stam_mag: 23.0,
    jack_stam_fscale: 750.0,
    jack_stam_prop: 0.49424,

    // Point loss powers per skillset
    pointloss_pow: {
        [Skillset.Stream]: 1.7,
        [Skillset.Jumpstream]: 1.7,
        [Skillset.Handstream]: 1.7,
        [Skillset.JackSpeed]: 1.7,
        [Skillset.Chordjack]: 1.7,
        [Skillset.Technical]: 2.0,
        [Skillset.Stamina]: 1.7
    },

    // Jack loss
    magic_num: 12.0,

    // Overall aggregation
    agg_rate: 0.25,
    agg_center: 1.11,
    agg_width: 10.24
};

// Expose to module or window
if (typeof window !== 'undefined') {
    window.Skillset = Skillset;
    window.PatternMod = PatternMod;
    window.BaseDifficulty = BaseDifficulty;
    window.Hand = Hand;
    window.BASE_SCALERS_4K = BASE_SCALERS_4K;
    window.PMODS_PER_SKILLSET = PMODS_PER_SKILLSET;
    window.CALC_PARAMS = CALC_PARAMS;
    window.NUM_Skillset = NUM_Skillset;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Skillset,
        PatternMod,
        BaseDifficulty,
        Hand,
        BASE_SCALERS_4K,
        PMODS_PER_SKILLSET,
        CALC_PARAMS,
        NUM_Skillset
    };
}
