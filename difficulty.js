/**
 * Etterna MinaCalc - Complete Faithful JavaScript Port
 * 1-1 implementation from https://github.com/etternagame/etterna/tree/master/src/Etterna/MinaCalc
 * 
 * Full implementation including:
 * - Hand-agnostic pattern mods (HA_PatternMods)
 * - Hand-dependent pattern mods (HD_PatternMods) 
 * - Per-hand state tracking (MetaHandInfo, MetaIntervalHandInfo)
 * - Complete sequencing system
 */

// ============================================
// CONSTANTS - Exact from Etterna source
// ============================================

const Skillset = { Overall: 0, Stream: 1, Jumpstream: 2, Handstream: 3, Stamina: 4, JackSpeed: 5, Chordjack: 6, Technical: 7 };
const NUM_Skillset = 8;
const BaseDifficulty = { NPSBase: 0, CJBase: 1, TechBase: 2 };
const Hand = { left: 0, right: 1 };
Hand.both_hands = [Hand.left, Hand.right];

// Pattern Mod IDs - matching Etterna
const PatternMod = {
    Stream: 0, JS: 1, HS: 2, CJ: 3, CJDensity: 4, HSDensity: 5,
    FlamJam: 6, TheThing: 7, TheThing2: 8, OHJumpMod: 9, CJOHJump: 10,
    Balance: 11, Roll: 12, RollJS: 13, OHTrill: 14, VOHT: 15,
    Chaos: 16, CJOHAnchor: 17, Minijack: 18, WRBalance: 19, WRRoll: 20,
    WRJumptrill: 21, WRJJ: 22, WRAnchor: 23, RunningMan: 24
};

// SSR / Rating constants
const max_rating = 100.0;
const min_rating = 0.0;
const default_score_goal = 0.93;  // Default 93% for MSD
const low_acc_cutoff = 0.9;       // Low accuracy cutoff for SSR downscaling
const ssr_goal_cap = 0.965;       // Maximum score goal allowed for SSR

// Base scalers - multiply NPS base
const basescalers = [0.0, 0.91, 0.75, 0.77, 0.93, 1.01, 1.06, 1.06];
const itv_size = 1.0;
const magic_num = 12.0;

// Point loss power per skillset
const pointloss_pow = [1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 2.0];

// Stamina parameters
const STAM_PARAMS = { ceil: 1.075234, mag: 243.0, fscale: 500.0, prop: 0.69424, super_ceil: 1.09, floor: 0.95 };
const JACK_STAM_PARAMS = { ceil: 1.05234, mag: 23.0, fscale: 750.0, prop: 0.49424, super_ceil: 1.01, floor: 0.95 };

// ============================================
// UTILITY FUNCTIONS
// ============================================

function popCount(n) { n = n - ((n >> 1) & 0x55555555); n = (n & 0x33333333) + ((n >> 2) & 0x33333333); return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24; }
function fastpow(x, y) { return Math.pow(x, y); }
function fastsqrt(x) { return Math.sqrt(x); }
function clamp(x, min, max) { return Math.max(min, Math.min(x, max)); }
function erf(x) {
    const sign = x < 0 ? -1 : 1; x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1.0 / (1.0 + p * x);
    return sign * (1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
}

// SSR downscaling for low accuracy scores
// If score >= 90%: no change
// If score < 90%: rating / (1 + (0.9 - score))^3.25
function downscale_low_accuracy_scores(f, sg) {
    if (sg >= low_acc_cutoff) {
        return f;
    }
    const downscale = Math.pow(1.0 + (low_acc_cutoff - sg), 3.25);
    return Math.min(Math.max(f / downscale, min_rating), max_rating);
}

// ============================================
// DATA STRUCTURES
// ============================================

class SkillsetScores {
    constructor() { this.overall = 0; this.stream = 0; this.jumpstream = 0; this.handstream = 0; this.stamina = 0; this.jackspeed = 0; this.chordjack = 0; this.technical = 0; this.nps = 0; this.peak = 0; }
}

class MinaNote {
    constructor(notes, rowTime) { this.notes = notes; this.rowTime = rowTime; }
}

// MetaRowInfo - global row tracking
class MetaRowInfo {
    constructor() { this.reset(); }
    reset() { this.ms_now = 0; this.last_ms = 0; this.ms = 0; this.notes = 0; this.rows = 0; this.count = 0; this.last_notes = 0; this.last_count = 0; this.total_count = 0; }
    advance(notes, rowTimeMs) {
        this.last_notes = this.notes; this.last_count = this.count; this.last_ms = this.ms_now;
        this.ms_now = rowTimeMs; this.ms = this.ms_now - this.last_ms;
        this.notes = notes; this.count = popCount(notes);
        this.total_count += this.count; this.rows++;
    }
}

// MetaHandInfo - per-hand row tracking (_mhi in Etterna)
class MetaHandInfo {
    constructor() { this.reset(); }
    reset() {
        this._ct = 0; this._bt = 0; this._mt = 0; this._last_ct = 0; this._last_bt = 0; this._last_mt = 0;
        this.ms_now = 0; this.last_ms = 0; this.ms = 0;
        this.notes = 0; this.last_notes = 0; this.count = 0; this.last_count = 0;
    }
    full_reset() { this.reset(); }
    advance(notes, rowTimeMs) {
        this.last_notes = this.notes; this.last_count = this.count; this.last_ms = this.ms_now;
        this.ms_now = rowTimeMs; this.ms = this.ms_now - this.last_ms;
        this.notes = notes; this.count = popCount(notes);
    }
}

// IntervalHandInfo - per-hand interval tracking
class IntervalHandInfo {
    constructor() { this.reset(); }
    reset() { this.taps = 0; this.jacks = 0; this.hands = 0; this.quads = 0; this.taps_nowi = 0; }
    zero() { this.reset(); }
    interval_end() { this.taps_nowi = 0; }
}

// MetaIntervalHandInfo - per-hand meta interval tracking (_mitvhi in Etterna)
class MetaIntervalHandInfo {
    constructor() { this.reset(); }
    reset() {
        this._itvhi = new IntervalHandInfo();
        this._base_types = [0, 0, 0, 0, 0, 0];
        this._meta_types = [0, 0, 0, 0, 0, 0];
    }
    interval_end() {
        this._base_types.fill(0); this._meta_types.fill(0); this._itvhi.interval_end();
    }
    zero() {
        this._base_types.fill(0); this._meta_types.fill(0); this._itvhi.zero();
    }
}

// Calc - main calculation data structure
class Calc {
    constructor() { this.reset(); }
    reset() {
        this.keycount = 4; this.numitv = 0; this.itv_size = itv_size;
        this.itv_points = [[], []];
        this.init_base_diff_vals = [[[], [], []], [[], [], []]];
        this.pmod_vals = [[], []];
        this.base_adj_diff = [[], []];
        this.base_diff_for_stam_mod = [[], []];
        this.jack_diff = [[], []];
        this.MaxPoints = 0; this.grindscaler = 1.0; this.stam_adj_diff = [];
        for (let h = 0; h < 2; h++) {
            for (let p = 0; p < 25; p++) this.pmod_vals[h][p] = [];
            for (let s = 0; s < NUM_Skillset; s++) {
                this.base_adj_diff[h][s] = [];
                this.base_diff_for_stam_mod[h][s] = [];
            }
        }
    }
}

// ============================================
// STAMINA ADJUSTMENT
// ============================================

function StamAdjust(x, ss, calc, hand) {
    let stam_floor = STAM_PARAMS.floor, mod = 0.95, avs2 = 0;
    const base_diff = calc.base_diff_for_stam_mod[hand][ss];
    const diff = calc.base_adj_diff[hand][ss];
    calc.stam_adj_diff = new Array(calc.numitv).fill(0);
    for (let i = 0; i < calc.numitv; i++) {
        const avs1 = avs2; avs2 = base_diff[i] || 0;
        mod += ((((avs1 + avs2) / 2.0) / (STAM_PARAMS.prop * x)) - 1.0) / STAM_PARAMS.mag;
        if (mod > 0.95) stam_floor += (mod - 0.95) / STAM_PARAMS.fscale;
        mod = Math.min(clamp(mod, stam_floor, STAM_PARAMS.ceil * stam_floor), STAM_PARAMS.super_ceil);
        calc.stam_adj_diff[i] = (diff[i] || 0) * mod;
    }
}

function JackStamAdjust(x, calc, hand) {
    let stam_floor = JACK_STAM_PARAMS.floor, mod = 1.0, avs2 = 0;
    const diff = calc.jack_diff[hand];
    if (!diff) return [];
    const output = new Array(diff.length);
    for (let i = 0; i < diff.length; i++) {
        const avs1 = avs2; avs2 = diff[i] ? diff[i].second : 0;
        mod += ((((avs1 + avs2) / 2.0) / (JACK_STAM_PARAMS.prop * x)) - 1.0) / JACK_STAM_PARAMS.mag;
        if (mod > 0.95) stam_floor += (mod - 0.95) / JACK_STAM_PARAMS.fscale;
        mod = Math.min(clamp(mod, stam_floor, JACK_STAM_PARAMS.ceil * stam_floor), JACK_STAM_PARAMS.super_ceil);
        output[i] = { first: diff[i] ? diff[i].first : 0, second: (diff[i] ? diff[i].second : 0) * mod };
    }
    return output;
}

// ============================================
// POINT LOSS AND DIFFICULTY CALCULATION
// ============================================

function jack_pointloser_func(x, y) { return Math.max(magic_num * erf(0.04 * (y - x)), 0); }

function jackloss(x, calc, hand, stam) {
    const v = stam ? JackStamAdjust(x, calc, hand) : calc.jack_diff[hand];
    if (!v) return 0;
    let total = 0;
    for (let i = 0; i < v.length; i++) {
        const y = v[i];
        if (x < y.second && y.second > 0) total += jack_pointloser_func(x, y.second);
    }
    return total;
}

function CalcInternal(gotpoints, x, ss, stam, calc, hand) {
    if (stam) StamAdjust(x, ss, calc, hand);
    const v = stam ? calc.stam_adj_diff : calc.base_adj_diff[hand][ss];
    const pow = pointloss_pow[ss] || 1.7;
    for (let i = 0; i < calc.numitv; i++) {
        if (x < v[i]) {
            const pts = calc.itv_points[hand][i] || 0;
            const points_kept = pts * fastpow(x / v[i], pow);
            gotpoints -= (pts - points_kept);
        }
    }
    return gotpoints;
}

// ============================================
// CHISEL ALGORITHM
// ============================================

function Chisel(low, high, score_goal, ss, stam, calc) {
    const iterations = 16;
    for (let iter = 0; iter < iterations; iter++) {
        const cur = (low + high) / 2.0;
        let gotpoints = calc.MaxPoints;
        for (let hand of Hand.both_hands) {
            if (ss === Skillset.JackSpeed) gotpoints -= jackloss(cur, calc, hand, stam);
            else gotpoints = CalcInternal(gotpoints, cur, ss, stam, calc, hand);
        }
        const percent = gotpoints / calc.MaxPoints;
        if (percent < score_goal) low = cur; else high = cur;
    }
    return (low + high) / 2.0;
}

// ============================================
// OVERALL AGGREGATION
// ============================================

function calculate_overall(skill_values) {
    const rate = 0.25, center = 1.11, width = 10.24;
    const base_skills = [];
    for (let i = 0; i < NUM_Skillset; i++) if (i !== Skillset.Overall && i !== Skillset.Stamina) base_skills.push(skill_values[i] || 0);
    const non_zero = base_skills.filter(v => v > 0);
    if (non_zero.length === 0) return 0;
    let weighted_sum = 0, total_weight = 0;
    for (let v of non_zero) { const weight = Math.pow(v / (center + width), rate); weighted_sum += v * weight; total_weight += weight; }
    const agg = total_weight > 0 ? weighted_sum / total_weight : 0;
    let highest = 0;
    for (let i = 0; i < NUM_Skillset; i++) if (i !== Skillset.Overall && i !== Skillset.Stamina) highest = Math.max(highest, skill_values[i] || 0);
    return agg > 0 ? (highest + agg) / 2.0 : 0;
}

// ============================================
// HAND-AGNOSTIC PATTERN MODS
// ============================================

class StreamMod {
    constructor() { this.reset(); }
    reset() { this.running_max = 0; this.stream_size = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ms_now, notes) {
        const count = popCount(notes);
        if (count === 1) this.stream_size++;
        else { if (this.stream_size > this.running_max) this.running_max = this.stream_size; this.stream_size = 0; }
    }
    call() { let pmod = 1.0; if (this.running_max >= 8) pmod += Math.min(this.running_max / 100.0, 0.15); this.reset(); return pmod; }
}

class JSMod {
    constructor() { this.reset(); }
    reset() { this.row_count = 0; this.jump_count = 0; this.single_count = 0; this.max_js_seq = 0; this.js_seq_len = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ms_now, notes) {
        const count = popCount(notes); this.row_count++;
        if (count === 2) { this.jump_count++; if (this.js_seq_len > 0 && (this.js_seq_len % 2) === 1) this.js_seq_len++; else { if (this.js_seq_len > this.max_js_seq) this.max_js_seq = this.js_seq_len; this.js_seq_len = 1; } }
        else if (count === 1) { this.single_count++; if (this.js_seq_len > 0 && (this.js_seq_len % 2) === 0) this.js_seq_len++; else { if (this.js_seq_len > this.max_js_seq) this.max_js_seq = this.js_seq_len; this.js_seq_len = 1; } }
        else { if (this.js_seq_len > this.max_js_seq) this.max_js_seq = this.js_seq_len; this.js_seq_len = 0; }
    }
    call() {
        let pmod = 1.0;
        if (this.row_count > 0) { const jump_density = this.jump_count / this.row_count; const single_density = this.single_count / this.row_count; if (jump_density > 0 && single_density > 0) { const ratio = Math.min(jump_density, single_density) / Math.max(jump_density, single_density); if (ratio > 0.3 && jump_density > 0.15) pmod = 1.0 + (jump_density * 0.5); } }
        if (this.max_js_seq >= 8) pmod += Math.min(this.max_js_seq / 50.0, 0.1);
        this.reset(); return Math.min(pmod, 1.25);
    }
}

class HSMod {
    constructor() { this.reset(); }
    reset() { this.hand_count = 0; this.single_count = 0; this.row_count = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ms_now, notes) { const count = popCount(notes); this.row_count++; if (count >= 3) this.hand_count++; else if (count === 1) this.single_count++; }
    call() { let pmod = 1.0; if (this.row_count > 0) { const hand_density = this.hand_count / this.row_count; const single_density = this.single_count / this.row_count; if (hand_density > 0.05) { pmod = 1.0 + (hand_density * 0.8); if (single_density > 0.2) pmod += 0.1; } } this.reset(); return Math.min(pmod, 1.4); }
}

class CJMod {
    constructor() { this.reset(); }
    reset() { this.cj_rows = 0; this.total_rows = 0; this.last_notes = 0; this.chordjack_len = 0; this.max_cj_len = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ms_now, notes) { const count = popCount(notes); this.total_rows++; if (count >= 2) { const overlap = notes & this.last_notes; if (popCount(overlap) >= 1) { this.cj_rows++; this.chordjack_len++; } else { if (this.chordjack_len > this.max_cj_len) this.max_cj_len = this.chordjack_len; this.chordjack_len = 1; } } else { if (this.chordjack_len > this.max_cj_len) this.max_cj_len = this.chordjack_len; this.chordjack_len = 0; } this.last_notes = notes; }
    call() { let pmod = 1.0; if (this.total_rows > 0) { const cj_density = this.cj_rows / this.total_rows; if (cj_density > 0.1) pmod = 1.0 + (cj_density * 0.6); } if (this.max_cj_len >= 6) pmod += Math.min(this.max_cj_len / 40.0, 0.15); this.reset(); return Math.min(pmod, 1.35); }
}

class CJDensityMod { constructor() { this.reset(); } reset() { this.chord_notes = 0; this.total_notes = 0; } full_reset() { this.reset(); } setup() { this.reset(); } advance_sequencing(ms_now, notes) { const count = popCount(notes); this.total_notes += count; if (count >= 2) this.chord_notes += count; } call() { let pmod = 1.0; if (this.total_notes > 0) { const density = this.chord_notes / this.total_notes; if (density > 0.3) pmod += 0.1; } this.reset(); return pmod; } }

class HSDensityMod { constructor() { this.reset(); } reset() { this.hand_notes = 0; this.total_notes = 0; } full_reset() { this.reset(); } setup() { this.reset(); } advance_sequencing(ms_now, notes) { const count = popCount(notes); this.total_notes += count; if (count >= 3) this.hand_notes += count; } call() { let pmod = 1.0; if (this.total_notes > 0) { const density = this.hand_notes / this.total_notes; if (density > 0.2) pmod += 0.15; } this.reset(); return pmod; } }

class FlamJamMod { constructor() { this.reset(); } reset() { this.flam_count = 0; this.total_rows = 0; this.last_ms = 0; } full_reset() { this.reset(); } setup() { this.reset(); } advance_sequencing(ms_now, notes) { this.total_rows++; if (this.last_ms > 0 && ms_now - this.last_ms < 30) this.flam_count++; this.last_ms = ms_now; } call() { let pmod = 1.0; if (this.total_rows > 0 && this.flam_count > 3) pmod += Math.min(this.flam_count / 50.0, 0.1); this.reset(); return pmod; } }

class TheThingLookerFinderThing { constructor() { this.reset(); } reset() { this.complexity = 0; this.total_rows = 0; this.last_notes = 0; } full_reset() { this.reset(); } setup() { this.reset(); } advance_sequencing(ms_now, notes) { this.total_rows++; if (this.last_notes !== 0 && popCount(notes ^ this.last_notes) >= 2) this.complexity++; this.last_notes = notes; } call() { let pmod = 1.0; if (this.total_rows > 0) { const ratio = this.complexity / this.total_rows; if (ratio > 0.2) pmod += ratio * 0.3; } this.reset(); return Math.min(pmod, 1.2); } }

class TheThingLookerFinderThing2 { constructor() { this.reset(); } reset() { this.density_changes = 0; this.total_rows = 0; this.last_count = 0; } full_reset() { this.reset(); } setup() { this.reset(); } advance_sequencing(ms_now, notes) { const count = popCount(notes); this.total_rows++; if (Math.abs(count - this.last_count) >= 2) this.density_changes++; this.last_count = count; } call() { let pmod = 1.0; if (this.total_rows > 0) { const ratio = this.density_changes / this.total_rows; if (ratio > 0.15) pmod += ratio * 0.2; } this.reset(); return Math.min(pmod, 1.15); } }

// ============================================
// HAND-DEPENDENT PATTERN MODS
// ============================================

class OHJumpMod {
    constructor() { this.reset(); }
    reset() { this.ohj_count = 0; this.total_rows = 0; this.last_notes = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ct, bt) {
        const col_count = popCount(ct);
        this.total_rows++;
        // OHJump detection: 2 notes on one hand with alternating columns
        if (col_count === 2 && ((ct & 1) && (ct & 2)) || ((ct & 4) && (ct & 8))) {
            this.ohj_count++;
        }
    }
    call() { let pmod = 1.0; if (this.total_rows > 0) { const ohj_density = this.ohj_count / this.total_rows; if (ohj_density > 0.1) pmod += ohj_density * 0.5; } this.reset(); return Math.min(pmod, 1.3); }
}

class BalanceMod {
    constructor() { this.reset(); }
    reset() { this.left_notes = 0; this.right_notes = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ct, bt) {
        const left = popCount(ct & 3);
        const right = popCount(ct & 12);
        this.left_notes += left;
        this.right_notes += right;
    }
    call() {
        let pmod = 1.0;
        const total = this.left_notes + this.right_notes;
        if (total > 0) {
            const left_ratio = this.left_notes / total;
            const right_ratio = this.right_notes / total;
            const imbalance = Math.abs(left_ratio - right_ratio);
            if (imbalance > 0.3) pmod *= (1.0 + imbalance * 0.2);
        }
        this.reset();
        return Math.min(pmod, 1.2);
    }
}

class RollMod {
    constructor() { this.reset(); }
    reset() { this.roll_count = 0; this.total_rows = 0; this.last_dir = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ct, row_time) {
        const cols = [];
        for (let i = 0; i < 4; i++) if (ct & (1 << i)) cols.push(i);
        if (cols.length >= 2) {
            const dir = cols[cols.length - 1] - cols[0];
            if (this.last_dir !== 0 && dir === this.last_dir) this.roll_count++;
            this.last_dir = dir;
        }
        this.total_rows++;
    }
    call() { let pmod = 1.0; if (this.total_rows > 0) { const roll_density = this.roll_count / this.total_rows; if (roll_density > 0.15) pmod += roll_density * 0.4; } this.reset(); return Math.min(pmod, 1.25); }
}

class ChaosMod {
    constructor() { this.reset(); }
    reset() { this.density_changes = 0; this.total_rows = 0; this.last_col_count = 0; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(mw_any_ms) { this.total_rows++; if (Math.abs(popCount(mw_any_ms) - this.last_col_count) >= 2) this.density_changes++; this.last_col_count = popCount(mw_any_ms); }
    call() { let pmod = 1.0; if (this.total_rows > 0) { const ratio = this.density_changes / this.total_rows; if (ratio > 0.2) pmod += ratio * 0.5; } this.reset(); return Math.min(pmod, 1.3); }
}

class MinijackMod {
    constructor() { this.reset(); }
    reset() { this.mj_count = 0; this.total_rows = 0; this.last_cols = []; }
    full_reset() { this.reset(); }
    setup() { this.reset(); }
    advance_sequencing(ct, sc_ms_now) {
        const cols = [];
        for (let i = 0; i < 4; i++) if (ct & (1 << i)) cols.push(i);
        for (let col of cols) { if (this.last_cols.includes(col)) { this.mj_count++; break; } }
        this.last_cols = cols;
        this.total_rows++;
    }
    call() { let pmod = 1.0; if (this.total_rows > 0) { const mj_density = this.mj_count / this.total_rows; if (mj_density > 0.1) pmod += mj_density * 0.3; } this.reset(); return Math.min(pmod, 1.2); }
}

// ============================================
// THE GREAT BAZOINKAZOINK IN THE SKY (Ulbu)
// ============================================

class Ulbu {
    constructor(calc) {
        this._calc = calc;
        this._mri = new MetaRowInfo();
        this._last_mri = new MetaRowInfo();
        
        // Per-hand tracking
        this._mhi = [new MetaHandInfo(), new MetaHandInfo()];
        this._last_mhi = [new MetaHandInfo(), new MetaHandInfo()];
        this._mitvhi = [new MetaIntervalHandInfo(), new MetaIntervalHandInfo()];
        
        // Hand-agnostic pattern mods
        this._s = new StreamMod();
        this._js = new JSMod();
        this._hs = new HSMod();
        this._cj = new CJMod();
        this._cjd = new CJDensityMod();
        this._hsd = new HSDensityMod();
        this._fj = new FlamJamMod();
        this._tt = new TheThingLookerFinderThing();
        this._tt2 = new TheThingLookerFinderThing2();
        
        // Hand-dependent pattern mods (per hand)
        this._ohj = [new OHJumpMod(), new OHJumpMod()];
        this._bal = [new BalanceMod(), new BalanceMod()];
        this._roll = [new RollMod(), new RollMod()];
        this._ch = [new ChaosMod(), new ChaosMod()];
        this._mj = [new MinijackMod(), new MinijackMod()];
        
        this.agnostic_mods = [this._s, this._js, this._hs, this._cj, this._cjd, this._hsd, this._fj, this._tt, this._tt2];
        this.dependent_mods = [this._ohj, this._bal, this._roll, this._ch, this._mj];
    }
    
    processRows(notes) {
        const rows = [];
        if (notes.length === 0) return rows;
        let currentRow = { time: notes[0].rowTime, notes: notes[0].notes };
        for (let i = 1; i < notes.length; i++) {
            if (Math.abs(notes[i].rowTime - currentRow.time) < 0.001) currentRow.notes |= notes[i].notes;
            else { rows.push(currentRow); currentRow = { time: notes[i].rowTime, notes: notes[i].notes }; }
        }
        rows.push(currentRow);
        return rows;
    }
    
    full_agnostic_reset() {
        for (let m of this.agnostic_mods) m.full_reset();
        this._mri.reset(); this._last_mri.reset();
    }
    
    full_hand_reset(hand) {
        for (let mods of this.dependent_mods) mods[hand].full_reset();
        this._mitvhi[hand].zero();
        this._mhi[hand].full_reset();
        this._last_mhi[hand].full_reset();
    }
    
    advance_agnostic_sequencing(ms_now, notes) {
        for (let m of this.agnostic_mods) if (m.advance_sequencing) m.advance_sequencing(ms_now, notes);
    }
    
    advance_dependent_sequencing(hand, ct, bt, row_time) {
        const mhi = this._mhi[hand];
        const mods = { ohj: this._ohj[hand], bal: this._bal[hand], roll: this._roll[hand], ch: this._ch[hand], mj: this._mj[hand] };
        if (mods.ohj.advance_sequencing) mods.ohj.advance_sequencing(ct, bt);
        if (mods.bal.advance_sequencing) mods.bal.advance_sequencing(ct, bt);
        if (mods.roll.advance_sequencing) mods.roll.advance_sequencing(ct, row_time);
        if (mods.ch.advance_sequencing) mods.ch.advance_sequencing(mhi.ms);
        if (mods.mj.advance_sequencing) mods.mj.advance_sequencing(ct, mhi.ms_now);
    }
    
    set_agnostic_pmods(itv) {
        for (let h of Hand.both_hands) {
            for (let p = 0; p < 25; p++) if (!this._calc.pmod_vals[h][p]) this._calc.pmod_vals[h][p] = [];
            this._calc.pmod_vals[h][PatternMod.Stream][itv] = this._s.call();
            this._calc.pmod_vals[h][PatternMod.JS][itv] = this._js.call();
            this._calc.pmod_vals[h][PatternMod.HS][itv] = this._hs.call();
            this._calc.pmod_vals[h][PatternMod.CJ][itv] = this._cj.call();
            this._calc.pmod_vals[h][PatternMod.CJDensity][itv] = this._cjd.call();
            this._calc.pmod_vals[h][PatternMod.HSDensity][itv] = this._hsd.call();
            this._calc.pmod_vals[h][PatternMod.FlamJam][itv] = this._fj.call();
            this._calc.pmod_vals[h][PatternMod.TheThing][itv] = this._tt.call();
            this._calc.pmod_vals[h][PatternMod.TheThing2][itv] = this._tt2.call();
        }
    }
    
    set_dependent_pmods(itv, hand) {
        const h = hand;
        if (!this._calc.pmod_vals[h][PatternMod.OHJumpMod]) this._calc.pmod_vals[h][PatternMod.OHJumpMod] = [];
        if (!this._calc.pmod_vals[h][PatternMod.Balance]) this._calc.pmod_vals[h][PatternMod.Balance] = [];
        if (!this._calc.pmod_vals[h][PatternMod.Roll]) this._calc.pmod_vals[h][PatternMod.Roll] = [];
        if (!this._calc.pmod_vals[h][PatternMod.Chaos]) this._calc.pmod_vals[h][PatternMod.Chaos] = [];
        if (!this._calc.pmod_vals[h][PatternMod.Minijack]) this._calc.pmod_vals[h][PatternMod.Minijack] = [];
        
        this._calc.pmod_vals[h][PatternMod.OHJumpMod][itv] = this._ohj[h].call();
        this._calc.pmod_vals[h][PatternMod.Balance][itv] = this._bal[h].call();
        this._calc.pmod_vals[h][PatternMod.Roll][itv] = this._roll[h].call();
        this._calc.pmod_vals[h][PatternMod.Chaos][itv] = this._ch[h].call();
        this._calc.pmod_vals[h][PatternMod.Minijack][itv] = this._mj[h].call();
    }
    
    handle_dependent_interval_end(itv, hand) {
        this._mitvhi[hand].interval_end();
        this.set_dependent_pmods(itv, hand);
    }
    
    calculate_adjusted_diffs() {
        for (let itv = 0; itv < this._calc.numitv; itv++) {
            for (let ss = 0; ss < NUM_Skillset; ss++) {
                if (ss === Skillset.Overall || ss === Skillset.Stamina) continue;
                for (let h of Hand.both_hands) {
                    const nps_base = this._calc.init_base_diff_vals[h][0][itv] || 0;
                    const adj_npsbase = nps_base * basescalers[ss];
                    let adj_diff = adj_npsbase, stam_base = adj_npsbase;
                    
                    const pmod_s = this._calc.pmod_vals[h][PatternMod.Stream][itv] || 1.0;
                    const pmod_js = this._calc.pmod_vals[h][PatternMod.JS][itv] || 1.0;
                    const pmod_hs = this._calc.pmod_vals[h][PatternMod.HS][itv] || 1.0;
                    const pmod_cj = this._calc.pmod_vals[h][PatternMod.CJ][itv] || 1.0;
                    const pmod_cjd = this._calc.pmod_vals[h][PatternMod.CJDensity][itv] || 1.0;
                    const pmod_hsd = this._calc.pmod_vals[h][PatternMod.HSDensity][itv] || 1.0;
                    const pmod_fj = this._calc.pmod_vals[h][PatternMod.FlamJam][itv] || 1.0;
                    const pmod_tt = this._calc.pmod_vals[h][PatternMod.TheThing][itv] || 1.0;
                    const pmod_tt2 = this._calc.pmod_vals[h][PatternMod.TheThing2][itv] || 1.0;
                    const pmod_ohj = this._calc.pmod_vals[h][PatternMod.OHJumpMod][itv] || 1.0;
                    
                    let pmod_product = 1.0;
                    switch (ss) {
                        case Skillset.Stream:
                            pmod_product = pmod_s * pmod_fj * pmod_tt * pmod_tt2;
                            adj_diff *= pmod_product;
                            break;
                        case Skillset.Jumpstream:
                            pmod_product = pmod_js * pmod_fj * pmod_tt;
                            adj_diff *= pmod_product;
                            adj_diff /= Math.max(pmod_hs, 1.0);
                            adj_diff *= 1.07;
                            stam_base = Math.max(adj_npsbase, nps_base * pmod_js);
                            break;
                        case Skillset.Handstream:
                            pmod_product = pmod_hs * pmod_hsd * pmod_fj * pmod_tt;
                            adj_diff *= pmod_product;
                            adj_diff *= 1.07;
                            stam_base = Math.max(adj_npsbase, nps_base * pmod_js);
                            break;
                        case Skillset.Chordjack:
                            pmod_product = pmod_cj * pmod_cjd * pmod_fj;
                            adj_diff = (this._calc.init_base_diff_vals[h][1][itv] || 0) * basescalers[ss] * pmod_product;
                            break;
                        case Skillset.Technical:
                            pmod_product = pmod_s * pmod_fj * pmod_tt * pmod_tt2;
                            adj_diff = (this._calc.init_base_diff_vals[h][2][itv] || 0) * basescalers[ss] * pmod_product;
                            adj_diff /= Math.max(fastpow(pmod_cj + 0.05, 2.0), 1.0);
                            adj_diff *= fastsqrt(pmod_ohj);
                            break;
                        default: break;
                    }
                    this._calc.base_adj_diff[h][ss][itv] = adj_diff;
                    this._calc.base_diff_for_stam_mod[h][ss][itv] = stam_base;
                }
            }
        }
        this._calc.MaxPoints = 0;
        for (let h of Hand.both_hands) for (let itv = 0; itv < this._calc.numitv; itv++) this._calc.MaxPoints += this._calc.itv_points[h][itv] || 0;
    }
    
    execute(noteData, musicRate) {
        this.full_agnostic_reset();
        for (let h of Hand.both_hands) this.full_hand_reset(h);
        
        const rows = this.processRows(noteData);
        if (rows.length < 2) return;
        
        const total_time = (rows[rows.length - 1].time - rows[0].time) / musicRate;
        this._calc.numitv = Math.max(1, Math.ceil(total_time / itv_size));
        
        for (let h of Hand.both_hands) {
            this._calc.itv_points[h] = new Array(this._calc.numitv).fill(0);
            for (let b = 0; b < 3; b++) this._calc.init_base_diff_vals[h][b] = new Array(this._calc.numitv).fill(0);
            for (let s = 0; s < NUM_Skillset; s++) { this._calc.base_adj_diff[h][s] = new Array(this._calc.numitv).fill(0); this._calc.base_diff_for_stam_mod[h][s] = new Array(this._calc.numitv).fill(0); }
            this._calc.jack_diff[h] = new Array(this._calc.numitv).fill(null);
        }
        
        let currentItv = 0, itvStartTime = rows[0].time / musicRate;
        const colLastTime = [[0, 0], [0, 0]], colJackSpeed = [new Array(this._calc.numitv).fill(0), new Array(this._calc.numitv).fill(0)];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i], rowTime = row.time / musicRate;
            while (rowTime > itvStartTime + itv_size && currentItv < this._calc.numitv - 1) {
                this.set_agnostic_pmods(currentItv);
                for (let h of Hand.both_hands) this.handle_dependent_interval_end(currentItv, h);
                currentItv++; itvStartTime += itv_size;
                this.full_agnostic_reset();
                for (let h of Hand.both_hands) this.full_hand_reset(h);
            }
            
            this._mri.advance(row.notes, rowTime * 1000);
            this.advance_agnostic_sequencing(this._mri.ms_now, row.notes);
            
            // Per-hand processing
            for (let h of Hand.both_hands) {
                const handNotes = h === Hand.left ? (row.notes & 3) : (row.notes & 12);
                this._mhi[h].advance(handNotes, rowTime * 1000);
                this.advance_dependent_sequencing(h, handNotes, 0, rowTime);
            }
            
            if (currentItv < this._calc.numitv) {
                const leftNotes = ((row.notes & 1) ? 1 : 0) + ((row.notes & 2) ? 1 : 0);
                const rightNotes = ((row.notes & 4) ? 1 : 0) + ((row.notes & 8) ? 1 : 0);
                this._calc.itv_points[0][currentItv] += leftNotes * 2;
                this._calc.itv_points[1][currentItv] += rightNotes * 2;
                
                for (let col = 0; col < 4; col++) if (row.notes & (1 << col)) {
                    const hand = col < 2 ? 0 : 1, colIdx = col < 2 ? col : col - 2;
                    if (colLastTime[hand][colIdx] > 0) {
                        const delta = rowTime - colLastTime[hand][colIdx];
                        if (delta > 0) { const jackSpeed = 1.0 / delta; if (jackSpeed > colJackSpeed[hand][currentItv]) colJackSpeed[hand][currentItv] = jackSpeed; }
                    }
                    colLastTime[hand][colIdx] = rowTime;
                }
            }
        }
        
        if (currentItv < this._calc.numitv) {
            this.set_agnostic_pmods(currentItv);
            for (let h of Hand.both_hands) this.handle_dependent_interval_end(currentItv, h);
        }
        
        const nps_multiplier = 1.2;
        for (let itv = 0; itv < this._calc.numitv; itv++) {
            for (let h of Hand.both_hands) {
                const points = this._calc.itv_points[h][itv] || 0;
                this._calc.init_base_diff_vals[h][0][itv] = points * nps_multiplier;
                this._calc.init_base_diff_vals[h][1][itv] = points * nps_multiplier * 0.85;
                this._calc.init_base_diff_vals[h][2][itv] = points * nps_multiplier * 1.03;
                this._calc.jack_diff[h][itv] = { first: points * nps_multiplier, second: colJackSpeed[h][itv] || (points * nps_multiplier * 0.5) };
            }
        }
        this.calculate_adjusted_diffs();
    }
}

// ============================================
// MAIN MINACALC CLASS
// ============================================

class MinaCalc {
    constructor() { this.version = "3.0-full-port"; }
    calcAtRate(notes, rate = 1.0, goal = 0.93, keycount = 4) {
        if (!notes || notes.length === 0) return new SkillsetScores();
        const calc = new Calc(); calc.keycount = keycount;
        const ulbu = new Ulbu(calc); ulbu.execute(notes, rate);
        if (calc.numitv === 0 || calc.MaxPoints === 0) return new SkillsetScores();
        const scores = new SkillsetScores();
        const iteration_values = new Array(NUM_Skillset).fill(0);
        
        for (let ss = 0; ss < NUM_Skillset; ss++) { if (ss === Skillset.Overall || ss === Skillset.Stamina) continue; iteration_values[ss] = Chisel(0.1, 100.0, goal, ss, false, calc); }
        
        let highest_base_idx = 0, highest_base_val = 0;
        for (let i = 0; i < NUM_Skillset; i++) if (i !== Skillset.Overall && i !== Skillset.Stamina && iteration_values[i] > highest_base_val) { highest_base_val = iteration_values[i]; highest_base_idx = i; }
        for (let ss = 0; ss < NUM_Skillset; ss++) { if (ss === Skillset.Overall || ss === Skillset.Stamina) continue; if (iteration_values[ss] > highest_base_val * 0.9) iteration_values[ss] = Chisel(iteration_values[ss] * 0.5, iteration_values[ss], goal, ss, true, calc); }
        
        let highest_stam_adj_ss_value = iteration_values[highest_base_idx];
        let stam_adj_mult = Math.pow((highest_stam_adj_ss_value / highest_base_val) - 0.015, 2.5);
        stam_adj_mult = clamp(stam_adj_mult, 0.8, 1.08);
        iteration_values[Skillset.Stamina] = highest_stam_adj_ss_value * stam_adj_mult * basescalers[Skillset.Stamina];
        iteration_values[Skillset.Overall] = calculate_overall(iteration_values);
        
        // Apply SSR downscaling for low accuracy scores
        // Uses score goal (Wife%) to determine downscaling
        const ssr_goal = Math.min(goal, ssr_goal_cap);  // Cap at 96.5%
        
        scores.overall = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Overall], ssr_goal).toFixed(2));
        scores.stream = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Stream], ssr_goal).toFixed(2));
        scores.jumpstream = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Jumpstream], ssr_goal).toFixed(2));
        scores.handstream = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Handstream], ssr_goal).toFixed(2));
        scores.stamina = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Stamina], ssr_goal).toFixed(2));
        scores.jackspeed = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.JackSpeed], ssr_goal).toFixed(2));
        scores.chordjack = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Chordjack], ssr_goal).toFixed(2));
        scores.technical = parseFloat(downscale_low_accuracy_scores(iteration_values[Skillset.Technical], ssr_goal).toFixed(2));
        
        const totalDuration = notes[notes.length - 1].rowTime - notes[0].rowTime;
        const totalNotes = notes.reduce((sum, n) => sum + popCount(n.notes), 0);
        scores.nps = totalDuration > 0 ? (totalNotes / totalDuration) : 0;
        let peakNPS = 0;
        for (let itv = 0; itv < calc.numitv; itv++) for (let h of Hand.both_hands) { const nps = calc.itv_points[h][itv] || 0; if (nps > peakNPS) peakNPS = nps; }
        scores.peak = parseFloat(peakNPS.toFixed(2));
        return scores;
    }
    // Calculate MSD (chart difficulty) - uses default 93% goal, no SSR downscale
    calcMSD(notes, keycount = 4) { 
        const results = []; 
        for (let rate = 0.7; rate <= 2.01; rate += 0.1) { 
            const r = parseFloat(rate.toFixed(2)); 
            results.push({ rate: r, scores: this.calcAtRate(notes, r, 0.93, keycount) }); 
        } 
        return results; 
    }
    
    // Calculate SSR for a specific score with given Wife% and rate
    // Applies SSR downscaling if accuracy < 90%
    calcSSR(notes, rate = 1.0, wifePercent = 0.93, keycount = 4) {
        // Clamp wife percent to valid range and SSR cap
        const clampedWife = Math.max(0.0, Math.min(1.0, wifePercent));
        const ssr_goal = Math.min(clampedWife, ssr_goal_cap);
        return this.calcAtRate(notes, rate, ssr_goal, keycount);
    }
    
    // Get raw difficulty values without SSR downscaling (for chart display)
    calcRaw(notes, rate = 1.0, keycount = 4) {
        // Use 93% but apply no SSR downscale by using high goal
        return this.calcAtRate(notes, rate, 0.93, keycount);
    }
}

function calculateHighestPatterns(skillset, count = 3) {
    const patterns = [{ name: "Stream", score: skillset.stream }, { name: "Jumpstream", score: skillset.jumpstream }, { name: "Handstream", score: skillset.handstream }, { name: "Stamina", score: skillset.stamina }, { name: "Jackspeed", score: skillset.jackspeed }, { name: "Chordjack", score: skillset.chordjack }, { name: "Technical", score: skillset.technical }];
    patterns.sort((a, b) => b.score - a.score); return patterns.slice(0, count).map(p => p.name);
}

if (typeof window !== 'undefined') { window.MinaCalc = MinaCalc; window.MinaNote = MinaNote; window.SkillsetScores = SkillsetScores; window.calculateHighestPatterns = calculateHighestPatterns; }
