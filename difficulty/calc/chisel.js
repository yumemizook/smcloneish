/**
 * Chisel Algorithm - Binary search to find difficulty matching score goal
 * Ported from MinaCalc.cpp
 */

if (typeof require !== 'undefined') {
    var { Skillset, CALC_PARAMS, Hand } = require('../core/constants.js');
    var { fastpow, clamp } = require('../core/structures.js');
}

/**
 * StamAdjust - stamina model adjustment
 * Applies stamina modifier to difficulty curve
 */
function StamAdjust(x, ss, calc, hand, debug = false) {
    const params = CALC_PARAMS;
    const stam_ceil = params.stam_ceil;
    const stam_mag = params.stam_mag;
    const stam_fscale = params.stam_fscale;
    const stam_prop = params.stam_prop;

    let stam_floor = 0.95;
    let mod = 0.95;
    let avs2 = 0;
    const super_stam_ceil = 1.09;

    const base_diff = calc.base_diff_for_stam_mod[hand][ss];
    const diff = calc.base_adj_diff[hand][ss];

    calc.stam_adj_diff = new Array(calc.numitv).fill(0);

    for (let i = 0; i < calc.numitv; i++) {
        const avs1 = avs2;
        avs2 = base_diff[i] || 0;

        mod += ((((avs1 + avs2) / 2) / (stam_prop * x)) - 1) / stam_mag;

        if (mod > 0.95) {
            stam_floor += (mod - 0.95) / stam_fscale;
        }

        const local_ceil = stam_ceil * stam_floor;
        mod = Math.min(clamp(mod, stam_floor, local_ceil), super_stam_ceil);
        calc.stam_adj_diff[i] = (diff[i] || 0) * mod;
    }
}

/**
 * JackStamAdjust - jack-specific stamina adjustment
 */
function JackStamAdjust(x, calc, hand) {
    const params = CALC_PARAMS;
    const stam_ceil = params.jack_stam_ceil;
    const stam_mag = params.jack_stam_mag;
    const stam_fscale = params.jack_stam_fscale;
    const stam_prop = params.jack_stam_prop;

    let stam_floor = 0.95;
    let mod = 1.0;
    let avs2 = 0;
    const super_stam_ceil = 1.01;

    const diff = calc.jack_diff[hand];
    const output = [];

    if (!calc.jack_stam_stuff[hand]) {
        calc.jack_stam_stuff[hand] = [];
    }

    for (let i = 0; i < diff.length; i++) {
        const avs1 = avs2;
        avs2 = diff[i] ? diff[i].second || 0 : 0;

        mod += ((((avs1 + avs2) / 2) / (stam_prop * x)) - 1) / stam_mag;

        if (mod > 0.95) {
            stam_floor += (mod - 0.95) / stam_fscale;
        }

        const local_ceil = stam_ceil * stam_floor;
        mod = Math.min(clamp(mod, stam_floor, local_ceil), super_stam_ceil);

        output.push({
            first: diff[i] ? diff[i].first : 0,
            second: avs2 * mod
        });

        calc.jack_stam_stuff[hand][i] = mod;
    }

    return output;
}

/**
 * jack_pointloser_func - point loss for jack patterns
 */
function jack_pointloser_func(x, y) {
    const magic_num = 12.0;
    return Math.max(magic_num * erf(0.04 * (y - x)), 0);
}

/**
 * jackloss - calculate point loss from jacks
 */
function jackloss(x, calc, hand, stam, debug = false) {
    const v = stam ? JackStamAdjust(x, calc, hand) : calc.jack_diff[hand];
    let total = 0;

    if (!calc.jack_loss[hand]) {
        calc.jack_loss[hand] = [];
    }

    if (debug) {
        calc.jack_loss[hand] = new Array(v.length).fill(0);
        for (let i = 0; i < v.length; i++) {
            const y = v[i];
            if (x < y.second && y.second > 0) {
                const pointslost = jack_pointloser_func(x, y.second);
                calc.jack_loss[hand][i] = pointslost;
                total += pointslost;
            }
        }
    } else {
        for (let y of v) {
            if (x < y.second && y.second > 0) {
                total += jack_pointloser_func(x, y.second);
            }
        }
    }

    return total;
}

/**
 * CalcInternal - internal difficulty calculation
 */
function CalcInternal(gotpoints, x, ss, stam, calc, hand, debug = false) {
    if (stam) {
        StamAdjust(x, ss, calc, hand);
    }

    const v = stam ? calc.stam_adj_diff : calc.base_adj_diff[hand][ss];
    const pointloss_pow_val = CALC_PARAMS.pointloss_pow[ss] || 1.7;

    if (debug) {
        StamAdjust(x, ss, calc, hand, true);

        // Set debug MSD
        if (!calc.debugMSD[hand]) calc.debugMSD[hand] = [];
        if (!calc.debugMSD[hand][ss]) calc.debugMSD[hand][ss] = [];
        calc.debugMSD[hand][ss] = [...v];

        // Points per interval
        if (!calc.debugValues[hand][2]) calc.debugValues[hand][2] = [];
        if (!calc.debugValues[hand][2][0]) calc.debugValues[hand][2][0] = [];

        for (let i = 0; i < calc.numitv; i++) {
            const pts = calc.itv_points[hand][i] || 0;
            calc.debugValues[hand][2][0][i] = pts;

            if (x < v[i]) {
                const lostpoints = pts - (pts * fastpow(x / v[i], pointloss_pow_val));
                gotpoints -= lostpoints;

                if (!calc.debugPtLoss[hand]) calc.debugPtLoss[hand] = [];
                if (!calc.debugPtLoss[hand][ss]) calc.debugPtLoss[hand][ss] = [];
                calc.debugPtLoss[hand][ss][i] = Math.abs(lostpoints);
            }
        }
    } else {
        for (let i = 0; i < calc.numitv; i++) {
            if (x < v[i]) {
                const pts = calc.itv_points[hand][i] || 0;
                gotpoints -= pts - (pts * fastpow(x / v[i], pointloss_pow_val));
            }
        }
    }

    return gotpoints;
}

/**
 * Chisel - binary search to find difficulty for target score
 */
function Chisel(low, high, score_goal, ss, stam, calc, debug = false, debug_output = false) {
    const iterations = 10;  // Enough for precision
    let cur = low;
    let gotpoints = 0;

    for (let iter = 0; iter < iterations; iter++) {
        cur = (low + high) / 2;
        gotpoints = calc.MaxPoints;

        for (let hand of Hand.both_hands) {
            // JackSpeed uses jack loss
            if (ss === Skillset.JackSpeed) {
                gotpoints -= jackloss(cur, calc, hand, stam, debug && debug_output);
            } else {
                gotpoints = CalcInternal(gotpoints, cur, ss, stam, calc, hand, debug && debug_output);
            }
        }

        const percent = gotpoints / calc.MaxPoints;

        if (percent < score_goal) {
            low = cur;
        } else {
            high = cur;
        }
    }

    return cur;
}

function erf(x) {
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

if (typeof window !== 'undefined') {
    window.StamAdjust = StamAdjust;
    window.JackStamAdjust = JackStamAdjust;
    window.jackloss = jackloss;
    window.jack_pointloser_func = jack_pointloser_func;
    window.CalcInternal = CalcInternal;
    window.Chisel = Chisel;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        StamAdjust,
        JackStamAdjust,
        jackloss,
        jack_pointloser_func,
        CalcInternal,
        Chisel
    };
}
