/**
 * Etterna MinaCalc Core Data Structures
 * Ported from Agnostic/ and Dependent/ headers
 */

if (typeof require !== 'undefined') {
    var { Skillset, PatternMod, BaseDifficulty, Hand, NUM_Skillset } = require('./constants.js');
}

/**
 * NoteInfo - represents a single note row
 * Maps to: NoteInfo.h
 */
class NoteInfo {
    constructor() {
        this.notes = 0;           // Bitmask of columns pressed
        this.rowTime = 0;         // Time in seconds
        this.rowTimeMs = 0;       // Time in milliseconds
        this.musicRate = 1.0;     // Rate multiplier
    }

    static fromNotes(notes, rowTime) {
        const ni = new NoteInfo();
        ni.notes = notes;
        ni.rowTime = rowTime;
        ni.rowTimeMs = rowTime * 1000;
        return ni;
    }
}

/**
 * MetaRowInfo - hand agnostic row metadata
 * Maps to: Agnostic/MetaRowInfo.h
 */
class MetaRowInfo {
    constructor() {
        this.reset();
    }

    reset() {
        this.ms_now = 0;          // Current row time in ms
        this.last_ms = 0;         // Last row time in ms
        this.ms = 0;              // Interval from last row
        this.notes = 0;           // Note count in this row
        this.rows = 0;            // Total rows counter
        this.count = 0;           // Notes in current row
        this.last_notes = 0;      // Previous row note count
        this.last_count = 0;      // Previous count
        this.total_count = 0;     // Total notes
    }

    // Process a new row
    advance(notes, rowTimeMs) {
        this.last_notes = this.notes;
        this.last_count = this.count;
        this.last_ms = this.ms_now;
        this.ms_now = rowTimeMs;
        this.ms = this.ms_now - this.last_ms;
        this.notes = notes;
        this.count = popCount(notes);
        this.total_count += this.count;
        this.rows++;
    }
}

/**
 * IntervalInfo - interval-level data (hand agnostic)
 * Maps to: Agnostic/IntervalInfo.h
 */
class IntervalInfo {
    constructor() {
        this.reset();
    }

    reset() {
        this.nps = 0;             // Notes per second
        this.ms = 0;              // Total ms in interval
        this.num_notes = 0;       // Total notes in interval
        this.num_jumps = 0;       // Jump count (2 notes)
        this.num_hands = 0;       // Hand count (3+ notes)
        this.num_jacks = 0;       // Jack count
        this.num_jack_intervals = 0;
    }

    update(mri) {
        this.ms = mri.ms_now;
        this.num_notes += mri.count;
        if (mri.count === 2) this.num_jumps++;
        if (mri.count >= 3) this.num_hands++;
    }
}

/**
 * MetaIntervalInfo - interval metadata (hand agnostic)
 * Maps to: Agnostic/MetaIntervalInfo.h
 */
class MetaIntervalInfo {
    constructor() {
        this.reset();
    }

    reset() {
        this.itv_points = 0;      // Points (notes) in interval
        this.nps = 0;             // Notes per second
        this.len = 0;             // Interval length
    }
}

/**
 * MetaHandInfo - per-hand row metadata
 * Maps to: Dependent/MetaHandInfo.h
 */
class MetaHandInfo {
    constructor(numCols = 4) {
        this.numCols = numCols;
        this.reset();
    }

    reset() {
        this.cols = new Array(this.numCols).fill(false);  // Which columns active
        this.num = 0;             // Number of columns
        this.ms = 0;              // Time since last
        this.ms_now = 0;          // Current time
        this.last_ms = 0;         // Last time
        this.total_notes = 0;     // Cumulative
    }

    // Extract hand columns from full row
    fromRow(notes, rowTimeMs, hand, keyCount = 4) {
        this.reset();
        this.ms_now = rowTimeMs;
        this.last_ms = this.ms_now;  // Will be updated externally

        // Determine which columns belong to which hand
        const colsPerHand = keyCount / 2;
        const handOffset = hand === Hand.left_hand ? 0 : colsPerHand;

        for (let i = 0; i < colsPerHand; i++) {
            const col = handOffset + i;
            if (notes & (1 << col)) {
                this.cols[i] = true;
                this.num++;
            }
        }

        this.total_notes += this.num;
    }
}

/**
 * IntervalHandInfo - per-hand interval data
 * Maps to: Dependent/IntervalHandInfo.h
 */
class IntervalHandInfo {
    constructor() {
        this.reset();
    }

    reset() {
        this.num_notes = 0;
        this.num_jumps = 0;
        this.num_ohjumps = 0;
        this.num_chords = 0;
        this.num_jacks = 0;
        this.num_minijacks = 0;
        this.num_trills = 0;
        this.num_rolls = 0;
    }
}

/**
 * MetaIntervalHandInfo - per-hand interval metadata
 * Maps to: Dependent/MetaIntervalHandInfo.h
 */
class MetaIntervalHandInfo {
    constructor() {
        this.reset();
    }

    reset() {
        this.itv_points = 0;
        this.nps = 0;
        this.len = 0;
        this.hand_cols = new Array(2).fill(0);  // Notes per hand
    }
}

/**
 * Calc - main calculation state container
 * Holds all intermediate calculation data
 */
class Calc {
    constructor() {
        this.reset();
    }

    reset() {
        // Configuration
        this.keycount = 4;
        this.ssr = false;         // Score-specific rating mode
        this.debugmode = false;

        // Interval data
        this.numitv = 0;
        this.itv_points = [[], []];     // Points per hand per interval
        this.itv_size = 0;

        // Difficulty values per hand per skillset per interval
        this.init_base_diff_vals = [[], []];  // [hand][base_type][itv]
        this.pmod_vals = [[], []];            // [hand][pmod][itv]
        this.base_adj_diff = [[], []];        // [hand][skillset][itv]
        this.stam_adj_diff = [];              // [itv] - temporary during calc
        this.base_diff_for_stam_mod = [[], []]; // [hand][skillset][itv]

        // Jack-specific data
        this.jack_diff = [[], []];            // [hand][row] = {first, second}
        this.jack_loss = [[], []];            // [hand][row]
        this.jack_stam_stuff = [[], []];      // [hand][row]

        // Debug output
        this.debugMSD = [[], []];             // [hand][skillset][itv]
        this.debugPtLoss = [[], []];          // [hand][skillset][itv]
        this.debugValues = [[], []];          // [hand][debug_type][pmod/itv]

        // Totals
        this.MaxPoints = 0;
        this.grindscaler = 1.0;

        // Initialize arrays
        for (let h = 0; h < 2; h++) {
            for (let b = 0; b < BaseDifficulty.NUM_BaseDifficulty; b++) {
                this.init_base_diff_vals[h][b] = [];
            }
            for (let p = 0; p < 25; p++) {  // NUM_PatternMod
                this.pmod_vals[h][p] = [];
            }
            for (let s = 0; s < NUM_Skillset; s++) {
                this.base_adj_diff[h][s] = [];
                this.base_diff_for_stam_mod[h][s] = [];
            }
            for (let d = 0; d < 3; d++) {  // NUM_DebugValue
                this.debugValues[h][d] = [];
            }
        }
    }
}

// Utility functions
function popCount(n) {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function fastsqrt(x) {
    return Math.sqrt(x);
}

function fastpow(x, y) {
    return Math.pow(x, y);
}

function max_index(arr) {
    let maxIdx = 0;
    let maxVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > maxVal) {
            maxVal = arr[i];
            maxIdx = i;
        }
    }
    return maxIdx;
}

function max_val(arr) {
    return Math.max(...arr);
}

function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Clamp utility
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// Erf approximation for jack point loss
function erf(x) {
    // Abramowitz and Stegun approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

// Expose
if (typeof window !== 'undefined') {
    window.NoteInfo = NoteInfo;
    window.MetaRowInfo = MetaRowInfo;
    window.IntervalInfo = IntervalInfo;
    window.MetaIntervalInfo = MetaIntervalInfo;
    window.MetaHandInfo = MetaHandInfo;
    window.IntervalHandInfo = IntervalHandInfo;
    window.MetaIntervalHandInfo = MetaIntervalHandInfo;
    window.Calc = Calc;
    window.popCount = popCount;
    window.fastsqrt = fastsqrt;
    window.fastpow = fastpow;
    window.max_index = max_index;
    window.max_val = max_val;
    window.mean = mean;
    window.clamp = clamp;
    window.erf = erf;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NoteInfo,
        MetaRowInfo,
        IntervalInfo,
        MetaIntervalInfo,
        MetaHandInfo,
        IntervalHandInfo,
        MetaIntervalHandInfo,
        Calc,
        popCount,
        fastsqrt,
        fastpow,
        max_index,
        max_val,
        mean,
        clamp,
        erf
    };
}
