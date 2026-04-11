/**
 * Skillset Aggregation - combines skillsets into Overall rating
 * Ported from MinaCalc.cpp
 */

if (typeof require !== 'undefined') {
    var { Skillset, NUM_Skillset, CALC_PARAMS } = require('../core/constants.js');
}

/**
 * Sigmoidal aggregation function
 * Combines skillsets with bias toward higher values
 */
function aggregate_skill(skill_values, rate, center, width) {
    // Filter out Overall (index 0) and Stamina (index 4) for base aggregation
    const base_skills = [];
    for (let i = 0; i < NUM_Skillset; i++) {
        if (i !== Skillset.Overall && i !== Skillset.Stamina) {
            base_skills.push(skill_values[i] || 0);
        }
    }

    // Remove zeros
    const non_zero = base_skills.filter(v => v > 0);
    if (non_zero.length === 0) return 0;

    // Sigmoidal weighted sum
    let weighted_sum = 0;
    let total_weight = 0;

    for (let v of non_zero) {
        // Weight increases with value (higher skills contribute more)
        const weight = Math.pow(v / (center + width), rate);
        weighted_sum += v * weight;
        total_weight += weight;
    }

    return total_weight > 0 ? weighted_sum / total_weight : 0;
}

/**
 * Calculate Overall from individual skillsets
 * Uses sigmoidal aggregation with boosting
 */
function calculate_overall(skill_values) {
    const params = CALC_PARAMS;
    const agg = aggregate_skill(
        skill_values,
        params.agg_rate,
        params.agg_center,
        params.agg_width
    );

    // Get highest skillset (excluding Overall and Stamina)
    let highest = 0;
    for (let i = 0; i < NUM_Skillset; i++) {
        if (i !== Skillset.Overall && i !== Skillset.Stamina) {
            highest = Math.max(highest, skill_values[i] || 0);
        }
    }

    // Overall should boost if aggregation is higher than max
    // Otherwise use max
    return agg > highest ? agg : highest;
}

/**
 * Calculate stamina rating based on other skillsets
 */
function calculate_stamina(skill_values, base_skillset, calc) {
    const highest_base = skill_values[base_skillset] || 0;

    // Find highest stamina-adjusted skill
    let highest_stam_adj = 0;
    for (let i = 0; i < NUM_Skillset; i++) {
        if (i !== Skillset.Overall && i !== Skillset.Stamina) {
            highest_stam_adj = Math.max(highest_stam_adj, skill_values[i] || 0);
        }
    }

    // Special case for JackSpeed
    if (base_skillset === Skillset.JackSpeed) {
        highest_stam_adj *= 0.8;
    }

    // Stam curve shift - stamina needs significant impact to count
    const stam_curve_shift = 0.015;
    let stam_adj_mult = Math.pow(
        (highest_stam_adj / highest_base) - stam_curve_shift,
        2.5
    );

    stam_adj_mult = clamp(stam_adj_mult, 0.8, 1.08);

    return highest_stam_adj * stam_adj_mult * BASE_SCALERS_4K[Skillset.Stamina];
}

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// Import base scalers
let BASE_SCALERS_4K;
if (typeof window !== 'undefined') {
    BASE_SCALERS_4K = window.BASE_SCALERS_4K;
} else {
    BASE_SCALERS_4K = require('../core/constants.js').BASE_SCALERS_4K;
}

if (typeof window !== 'undefined') {
    window.aggregate_skill = aggregate_skill;
    window.calculate_overall = calculate_overall;
    window.calculate_stamina = calculate_stamina;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        aggregate_skill,
        calculate_overall,
        calculate_stamina
    };
}
