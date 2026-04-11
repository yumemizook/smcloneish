/**
 * ChaosMod - messy/complex pattern detection
 * Ported from Dependent/HD_PatternMods
 */

if (typeof require !== 'undefined') {
    var { PatternMod } = require('../../core/constants.js');
}

/**
 * Chaos detection - identifies messy, unstructured patterns
 */
class ChaosMod {
    constructor() {
        this._pmod = PatternMod.Chaos;
        this.reset();
    }

    reset() {
        this.variance_sum = 0;
        this.total_rows = 0;
        this.last_state = -1;
        this.state_counts = [0, 0, 0, 0];  // 0: empty, 1: left, 2: right, 3: both
        this.last_hand_counts = [0, 0];  // [left, right]
    }

    setup() {
        this.reset();
    }

    full_reset() {
        this.reset();
    }

    advance_sequencing(mhi_left, mhi_right) {
        this.total_rows++;

        const left_count = mhi_left.num;
        const right_count = mhi_right.num;

        // Determine state
        let state;
        if (left_count === 0 && right_count === 0) {
            state = 0;
        } else if (left_count > 0 && right_count === 0) {
            state = 1;
        } else if (right_count > 0 && left_count === 0) {
            state = 2;
        } else {
            state = 3;
        }

        // Count state transitions
        if (state !== this.last_state) {
            this.variance_sum++;
            this.state_counts[state]++;
        }

        // Track hand count changes
        const hand_changes = Math.abs(left_count - this.last_hand_counts[0]) +
                             Math.abs(right_count - this.last_hand_counts[1]);
        if (hand_changes > 1) {
            this.variance_sum += hand_changes;
        }

        this.last_state = state;
        this.last_hand_counts = [left_count, right_count];
    }

    calc() {
        let pmod = 1.0;

        if (this.total_rows > 0) {
            const variance_rate = this.variance_sum / this.total_rows;
            // High variance = more chaotic
            pmod = 1.0 + (variance_rate * 0.3);
        }

        // Check state distribution - uniform distribution = chaos
        const total_states = this.state_counts.reduce((a, b) => a + b, 0);
        if (total_states > 0) {
            const expected = total_states / 4;
            let chi_sq = 0;
            for (let count of this.state_counts) {
                chi_sq += Math.pow(count - expected, 2) / expected;
            }
            // High chi_sq = uneven (not chaotic), low = even (chaotic)
            if (chi_sq < 2) {
                pmod += 0.1;
            }
        }

        this.reset();
        return Math.min(pmod, 1.3);
    }

    __call__() {
        return this.calc();
    }
}

if (typeof window !== 'undefined') {
    window.ChaosMod = ChaosMod;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChaosMod };
}
