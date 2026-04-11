/**
 * Etterna MinaCalc JavaScript Port
 * Main entry point and API
 *
 * Ported from: https://github.com/etternagame/etterna/tree/master/src/Etterna/MinaCalc
 */

// Core imports
if (typeof require !== 'undefined') {
    var {
        Skillset, PatternMod, BaseDifficulty, Hand,
        BASE_SCALERS_4K, PMODS_PER_SKILLSET, CALC_PARAMS, NUM_Skillset
    } = require('./core/constants.js');

    var {
        NoteInfo, MetaRowInfo, MetaHandInfo, Calc,
        popCount, fastpow, fastsqrt, max_index, max_val, mean, clamp, erf
    } = require('./core/structures.js');

    var {
        PatternMods, SequencerGeneral,
        StreamMod, JSMod, HSMod, CJMod, CJDensityMod, HSDensityMod,
        FlamJamMod, TheThingLookerFinderThing, TheThingLookerFinderThing2
    } = require('./pmods/agnostic/index.js');

    var {
        HandDependentSequencer,
        OHJumpMod, BalanceMod, RollMod, OHTrillMod, ChaosMod,
        MinijackMod, WideRangeJumptrillMod, RunningManMod
    } = require('./pmods/dependent/index.js');

    var { Chisel, jackloss } = require('./calc/chisel.js');
    var { calculate_overall, calculate_stamina } = require('./calc/aggregate.js');
}

/**
 * SkillsetScores - container for all skillset values
 */
class SkillsetScores {
    constructor() {
        this.overall = 0;
        this.stream = 0;
        this.jumpstream = 0;
        this.handstream = 0;
        this.stamina = 0;
        this.jackspeed = 0;
        this.chordjack = 0;
        this.technical = 0;
    }

    toArray() {
        return [
            this.overall,
            this.stream,
            this.jumpstream,
            this.handstream,
            this.stamina,
            this.jackspeed,
            this.chordjack,
            this.technical
        ];
    }

    fromArray(arr) {
        this.overall = arr[0] || 0;
        this.stream = arr[1] || 0;
        this.jumpstream = arr[2] || 0;
        this.handstream = arr[3] || 0;
        this.stamina = arr[4] || 0;
        this.jackspeed = arr[5] || 0;
        this.chordjack = arr[6] || 0;
        this.technical = arr[7] || 0;
        return this;
    }
}

/**
 * TheGreatBazoinkazoinkInTheSky - main 4k calculation controller
 * Ported from Ulbu.h
 */
class TheGreatBazoinkazoinkInTheSky {
    constructor(calc) {
        this._calc = calc;

        // Hand agnostic data structures
        this._mri = new MetaRowInfo();
        this._last_mri = new MetaRowInfo();
        this._mitvi = new MetaIntervalInfo();

        // Hand dependent
        this._mitvhi = null;  // Simplified version
        this._last_mhi = [null, null];
        this._mhi = [null, null];

        // Sequencers
        this._seq = new SequencerGeneral();

        // Pattern mods - agnostic
        this._s = new StreamMod();
        this._js = new JSMod();
        this._hs = new HSMod();
        this._cj = new CJMod();
        this._cjd = new CJDensityMod();
        this._hsd = new HSDensityMod();
        this._fj = new FlamJamMod();
        this._tt = new TheThingLookerFinderThing();
        this._tt2 = new TheThingLookerFinderThing2();

        // Pattern mods - dependent (simplified setup)
        this._ohj = new OHJumpMod();
        this._bal = new BalanceMod();
        this._roll = new RollMod();
        this._oht = new OHTrillMod();
        this._ch = new ChaosMod();
        this._mj = new MinijackMod();
        this._wrjt = new WideRangeJumptrillMod();

        // Register with sequencers
        this._seq.register(this._s);
        this._seq.register(this._js);
        this._seq.register(this._hs);
        this._seq.register(this._cj);
        this._seq.register(this._cjd);
        this._seq.register(this._hsd);
        this._seq.register(this._fj);
        this._seq.register(this._tt);
        this._seq.register(this._tt2);

        // Setup hand-dependent mods
        this._ohj.setup(0);
        this._bal.setup();
        this._roll.setup();
        this._oht.setup();
        this._ch.setup();
        this._mj.setup();
        this._wrjt.setup();

        this._diffz = new diffz();
    }

    get_pmods() {
        return PMODS_PER_SKILLSET;
    }

    get_basescalers() {
        return BASE_SCALERS_4K;
    }

    /**
     * Main execution - processes all notes and calculates difficulties
     */
    execute(noteData, musicRate) {
        this.full_agnostic_reset();

        // Convert note data to rows
        const rows = this.processRows(noteData);
        if (rows.length < 2) return;

        // Setup interval tracking
        const itv_duration = 0.5;  // 0.5s intervals
        this._calc.numitv = Math.ceil((rows[rows.length - 1].time - rows[0].time) / itv_duration);

        // Initialize arrays
        for (let h of Hand.both_hands) {
            this._calc.itv_points[h] = new Array(this._calc.numitv).fill(0);
            for (let b = 0; b < BaseDifficulty.NUM_BaseDifficulty; b++) {
                this._calc.init_base_diff_vals[h][b] = new Array(this._calc.numitv).fill(0);
            }
            for (let p = 0; p < 25; p++) {
                this._calc.pmod_vals[h][p] = new Array(this._calc.numitv).fill(1.0);
            }
            for (let s = 0; s < NUM_Skillset; s++) {
                this._calc.base_adj_diff[h][s] = new Array(this._calc.numitv).fill(0);
                this._calc.base_diff_for_stam_mod[h][s] = new Array(this._calc.numitv).fill(0);
            }
        }

        // Process all rows
        let currentItv = 0;
        let itvStartTime = rows[0].time;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowTime = row.time / musicRate;  // Adjust for rate

            // Update interval
            if (rowTime > itvStartTime + itv_duration) {
                // Finish current interval
                this.set_agnostic_pmods(currentItv);
                this.set_dependent_pmods(currentItv, rows, i);

                currentItv++;
                itvStartTime += itv_duration;

                // Reset agnostic mods for new interval
                this.full_agnostic_reset();
            }

            // Process row with agnostic sequencer
            this._mri.advance(row.notes, rowTime * 1000);
            this._seq.advance(this._mri.ms_now, row.notes);

            // Count points in interval
            if (currentItv < this._calc.numitv) {
                for (let h of Hand.both_hands) {
                    this._calc.itv_points[h][currentItv] += popCount(row.notes) / 2;
                }
            }
        }

        // Final interval
        if (currentItv < this._calc.numitv) {
            this.set_agnostic_pmods(currentItv);
            this.set_dependent_pmods(currentItv, rows, rows.length);
        }

        // Calculate base NPS difficulties per interval
        for (let itv = 0; itv < this._calc.numitv; itv++) {
            for (let h of Hand.both_hands) {
                const points = this._calc.itv_points[h][itv] || 0;
                const nps = points / itv_duration;

                this._calc.init_base_diff_vals[h][BaseDifficulty.NPSBase][itv] = nps;
                this._calc.init_base_diff_vals[h][BaseDifficulty.CJBase][itv] = nps * 0.85;
                this._calc.init_base_diff_vals[h][BaseDifficulty.TechBase][itv] = nps * 0.9;
            }
        }

        // Apply pattern mods to calculate adjusted difficulties
        this.calculate_adjusted_diffs();
    }

    processRows(notes) {
        const rows = [];
        if (notes.length === 0) return rows;

        let currentRow = { time: notes[0].rowTime, notes: notes[0].notes };
        for (let i = 1; i < notes.length; i++) {
            if (Math.abs(notes[i].rowTime - currentRow.time) < 0.001) {
                currentRow.notes |= notes[i].notes;
            } else {
                rows.push(currentRow);
                currentRow = { time: notes[i].rowTime, notes: notes[i].notes };
            }
        }
        rows.push(currentRow);
        return rows;
    }

    full_agnostic_reset() {
        this._s.full_reset();
        this._js.full_reset();
        this._hs.full_reset();
        this._cj.full_reset();
        this._cjd.full_reset();
        this._hsd.full_reset();
        this._fj.full_reset();
        this._tt.full_reset();
        this._tt2.full_reset();
        this._mri.reset();
        this._last_mri.reset();
    }

    set_agnostic_pmods(itv) {
        PatternMods.set_agnostic(PatternMod.Stream, this._s(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.JS, this._js(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.HS, this._hs(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.CJ, this._cj(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.CJDensity, this._cjd(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.HSDensity, this._hsd(this._mitvi), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.FlamJam, this._fj(), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.TheThing, this._tt(), itv, this._calc);
        PatternMods.set_agnostic(PatternMod.TheThing2, this._tt2(), itv, this._calc);
    }

    set_dependent_pmods(itv, rows, rowIdx) {
        // Simplified: calculate based on recent rows
        // Full implementation would track per-hand state
        for (let h of Hand.both_hands) {
            this._calc.pmod_vals[h][PatternMod.OHJumpMod][itv] = 1.0;
            this._calc.pmod_vals[h][PatternMod.Balance][itv] = 1.0;
            this._calc.pmod_vals[h][PatternMod.Roll][itv] = 1.0;
            this._calc.pmod_vals[h][PatternMod.OHTrill][itv] = 1.0;
            this._calc.pmod_vals[h][PatternMod.Chaos][itv] = 1.0;
            this._calc.pmod_vals[h][PatternMod.Minijack][itv] = 1.0;
        }
    }

    calculate_adjusted_diffs() {
        const pmods = this.get_pmods();
        const basescalers = this.get_basescalers();

        for (let itv = 0; itv < this._calc.numitv; itv++) {
            for (let ss = 0; ss < NUM_Skillset; ss++) {
                if (ss === Skillset.Overall || ss === Skillset.Stamina) continue;

                for (let h of Hand.both_hands) {
                    const nps_base = this._calc.init_base_diff_vals[h][BaseDifficulty.NPSBase][itv];
                    let adj_diff = nps_base * basescalers[ss];

                    // Apply pattern mods for this skillset
                    const active_pmods = pmods[ss] || [];
                    let pmod_product = 1.0;
                    for (let pmod_id of active_pmods) {
                        const pmod_val = this._calc.pmod_vals[h][pmod_id][itv] || 1.0;
                        pmod_product *= pmod_val;
                    }

                    adj_diff *= pmod_product;

                    // Skillset-specific adjustments
                    switch (ss) {
                        case Skillset.Jumpstream:
                            adj_diff /= Math.max(this._calc.pmod_vals[h][PatternMod.HS][itv] || 1.0, 1.0);
                            break;
                        case Skillset.Chordjack:
                            adj_diff = this._calc.init_base_diff_vals[h][BaseDifficulty.CJBase][itv] *
                                       basescalers[ss] * pmod_product;
                            break;
                        case Skillset.Technical:
                            adj_diff = this._calc.init_base_diff_vals[h][BaseDifficulty.TechBase][itv] *
                                       pmod_product * basescalers[ss];
                            break;
                    }

                    this._calc.base_adj_diff[h][ss][itv] = adj_diff;
                    this._calc.base_diff_for_stam_mod[h][ss][itv] = adj_diff;
                }
            }
        }

        // Calculate total points
        this._calc.MaxPoints = 0;
        for (let h of Hand.both_hands) {
            for (let itv = 0; itv < this._calc.numitv; itv++) {
                this._calc.MaxPoints += this._calc.itv_points[h][itv] || 0;
            }
        }
    }
}

/**
 * Main MinaCalc class - public API
 */
class MinaCalc {
    constructor() {
        this.version = "2.0-js-port";
    }

    /**
     * Calculate MSD scores for a specific music rate and score goal
     * @param {Array<NoteInfo>} notes - Array of note data
     * @param {number} rate - Music rate (e.g., 1.0)
     * @param {number} goal - Score goal (e.g., 0.93 for 93%)
     * @param {number} keycount - Key mode (default 4)
     * @returns {SkillsetScores}
     */
    calcAtRate(notes, rate = 1.0, goal = 0.93, keycount = 4) {
        if (!notes || notes.length === 0) {
            return new SkillsetScores();
        }

        const calc = new Calc();
        calc.keycount = keycount;

        const ulbu = new TheGreatBazoinkazoinkInTheSky(calc);
        ulbu.execute(notes, rate);

        if (calc.numitv === 0 || calc.MaxPoints === 0) {
            return new SkillsetScores();
        }

        const scores = new SkillsetScores();
        const iteration_values = new Array(NUM_Skillset).fill(0);

        // Calculate non-stam skillsets
        for (let ss = 0; ss < NUM_Skillset; ss++) {
            if (ss === Skillset.Overall || ss === Skillset.Stamina) continue;

            iteration_values[ss] = Chisel(
                CALC_PARAMS.chisel_initial_low,
                CALC_PARAMS.chisel_initial_high,
                goal,
                ss,
                false,  // no stam
                calc,
                false
            );
        }

        // Find highest base skillset
        let highest_base_idx = 0;
        let highest_base_val = 0;
        for (let i = 0; i < NUM_Skillset; i++) {
            if (i !== Skillset.Overall && i !== Skillset.Stamina && iteration_values[i] > highest_base_val) {
                highest_base_val = iteration_values[i];
                highest_base_idx = i;
            }
        }

        // Re-run with stamina for skillsets near the top
        for (let ss = 0; ss < NUM_Skillset; ss++) {
            if (ss === Skillset.Overall || ss === Skillset.Stamina) continue;

            if (iteration_values[ss] > highest_base_val * 0.9) {
                iteration_values[ss] = Chisel(
                    iteration_values[ss] * 0.9,
                    CALC_PARAMS.chisel_refine_precision,
                    goal,
                    ss,
                    true,  // with stam
                    calc,
                    false
                );
            }
        }

        // Find highest stam-adjusted skillset
        let highest_stam_idx = highest_base_idx;
        let highest_stam_val = highest_base_val;
        for (let i = 0; i < NUM_Skillset; i++) {
            if (i !== Skillset.Overall && i !== Skillset.Stamina && iteration_values[i] > highest_stam_val) {
                highest_stam_val = iteration_values[i];
                highest_stam_idx = i;
            }
        }

        // Calculate stamina
        let highest_stam_adj_ss_value = iteration_values[highest_base_idx];
        if (highest_stam_idx === Skillset.JackSpeed) {
            highest_stam_adj_ss_value *= 0.8;
        }

        const stam_curve_shift = 0.015;
        let stam_adj_mult = Math.pow(
            (highest_stam_adj_ss_value / highest_base_val) - stam_curve_shift,
            2.5
        );
        stam_adj_mult = clamp(stam_adj_mult, 0.8, 1.08);
        iteration_values[Skillset.Stamina] = highest_stam_adj_ss_value * stam_adj_mult * BASE_SCALERS_4K[Skillset.Stamina];

        // Calculate Overall
        iteration_values[Skillset.Overall] = calculate_overall(iteration_values);

        // Assign to scores object
        scores.overall = parseFloat(iteration_values[Skillset.Overall].toFixed(2));
        scores.stream = parseFloat(iteration_values[Skillset.Stream].toFixed(2));
        scores.jumpstream = parseFloat(iteration_values[Skillset.Jumpstream].toFixed(2));
        scores.handstream = parseFloat(iteration_values[Skillset.Handstream].toFixed(2));
        scores.stamina = parseFloat(iteration_values[Skillset.Stamina].toFixed(2));
        scores.jackspeed = parseFloat(iteration_values[Skillset.JackSpeed].toFixed(2));
        scores.chordjack = parseFloat(iteration_values[Skillset.Chordjack].toFixed(2));
        scores.technical = parseFloat(iteration_values[Skillset.Technical].toFixed(2));

        return scores;
    }

    /**
     * Calculate MSD for all rates (0.7x to 2.0x typical)
     * @param {Array<NoteInfo>} notes
     * @param {number} keycount
     * @returns {Array<{rate: number, scores: SkillsetScores}>}
     */
    calcMSD(notes, keycount = 4) {
        const results = [];

        // Standard Etterna rates: 0.7 to 2.0 in 0.1 increments
        for (let rate = 0.7; rate <= 2.01; rate += 0.1) {
            const r = parseFloat(rate.toFixed(2));
            results.push({
                rate: r,
                scores: this.calcAtRate(notes, r, 0.93, keycount)
            });
        }

        return results;
    }
}

// Helper class for difficulty calculation
class diffz {
    constructor() {
        this.adj_diff = 0;
        this.stam_base = 0;
    }
}

// Expose
if (typeof window !== 'undefined') {
    window.MinaCalc = MinaCalc;
    window.SkillsetScores = SkillsetScores;
    window.NoteInfo = NoteInfo;
    window.TheGreatBazoinkazoinkInTheSky = TheGreatBazoinkazoinkInTheSky;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MinaCalc,
        SkillsetScores,
        NoteInfo,
        TheGreatBazoinkazoinkInTheSky
    };
}
