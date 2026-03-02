/**
 * MinaCalc-JS: A port of the Etterna MSD difficulty calculator principles to JavaScript.
 * Supports skillsets: Overall, Stream, Jumpstream, Handstream, Stamina, Jackspeed, Chordjack, Technical.
 * Somewhat inaccurate compared to Etterna.
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
        this.nps = 0;
        this.peak = 0;
    }
}

class MinaNote {
    constructor(notes, rowTime) {
        this.notes = notes; // Bitmask of columns (e.g., 1=col0, 2=col1, 4=col2, 8=col3)
        this.rowTime = rowTime;
    }
}

class MinaCalc {
    constructor() {
        this.version = "1.0.0-js";
    }

    /**
     * Calculates MSD scores for a specific music rate and score goal.
     * @param {Array<MinaNote>} notes 
     * @param {number} rate Music rate (e.g., 1.0)
     * @param {number} goal Score goal (e.g., 0.93)
     * @returns {SkillsetScores}
     */
    calcAtRate(notes, rate = 1.0, goal = 0.93) {
        if (!notes || notes.length === 0) return new SkillsetScores();

        // 1. Group notes into rows (simultaneous notes)
        const rows = this._processRows(notes);
        if (rows.length < 2) return new SkillsetScores();

        // 2. Interval-based calculation
        const windowSize = 0.5; // 0.5s windows for more granularity
        const stepSize = 0.25;
        let windowStart = rows[0].time;
        const strains = {
            stream: [], jumpstream: [], handstream: [],
            stamina: [], jackspeed: [], chordjack: [], technical: []
        };

        let currentRowIndex = 0;
        while (currentRowIndex < rows.length) {
            const windowEnd = windowStart + windowSize;
            const windowRows = [];

            // Collect rows in this window
            let i = currentRowIndex;
            while (i < rows.length && rows[i].time < windowEnd) {
                windowRows.push(rows[i]);
                i++;
            }

            if (windowRows.length > 0) {
                const stats = this._analyzeWindow(windowRows, rate);
                strains.stream.push(stats.stream);
                strains.jumpstream.push(stats.jumpstream);
                strains.handstream.push(stats.handstream);
                strains.jackspeed.push(stats.jackspeed);
                strains.chordjack.push(stats.chordjack);
                strains.technical.push(stats.technical);
                // Stamina uses the max of all skillsets in the window
                strains.stamina.push(Math.max(stats.stream, stats.jumpstream, stats.handstream, stats.jackspeed, stats.chordjack, stats.technical));
            }

            windowStart += stepSize;
            // Advance currentRowIndex to the next window start
            while (currentRowIndex < rows.length && rows[currentRowIndex].time < windowStart) {
                currentRowIndex++;
            }
        }

        // 3. Aggregate strains
        const scores = new SkillsetScores();

        // Calculate raw NPS and Peak
        const totalDuration = (rows[rows.length - 1].time - rows[0].time);
        const totalNotes = rows.reduce((sum, r) => sum + r.count, 0);
        scores.nps = (totalDuration > 0) ? (totalNotes / totalDuration) : 0;

        let peakNPS = 0;
        for (let i = 0; i < strains.stream.length; i++) {
            // stream strain in _analyzeWindow is nps * rate
            const windowNPS = strains.stream[i] / rate;
            if (windowNPS > peakNPS) peakNPS = windowNPS;
        }
        scores.peak = peakNPS;

        scores.stream = this._scale(this._aggregate(strains.stream), rate);
        scores.jumpstream = this._scale(this._aggregate(strains.jumpstream), rate);
        scores.handstream = this._scale(this._aggregate(strains.handstream), rate);
        scores.jackspeed = this._scale(this._aggregate(strains.jackspeed), rate);
        scores.chordjack = this._scale(this._aggregate(strains.chordjack), rate);
        scores.technical = this._scale(this._aggregate(strains.technical), rate);

        // Stamina logic: Duration-based scaling
        const duration = (rows[rows.length - 1].time - rows[0].time) / rate;
        const staminaBase = this._aggregate(strains.stamina);
        scores.stamina = this._scale(staminaBase * (1 + 0.1 * Math.log10(Math.max(1, duration / 30))), rate);

        // 4. Calculate Overall
        scores.overall = this._calculateOverall(scores);

        return scores;
    }

    /**
     * Calculates scores for all music rates from 0.05x to 3.0x.
     * @param {Array<MinaNote>} notes 
     * @returns {Array<{rate: number, scores: SkillsetScores}>}
     */
    calcMSD(notes) {
        const results = [];
        // Support rates from 0.05x to 3.0x in 0.05x increments or as needed by UI
        // Common Etterna rates are 0.7 to 2.0. We extend as requested.
        for (let rate = 0.05; rate <= 3.01; rate += 0.05) {
            results.push({
                rate: parseFloat(rate.toFixed(2)),
                scores: this.calcAtRate(notes, rate)
            });
        }
        return results;
    }

    _processRows(notes) {
        const rows = [];
        if (notes.length === 0) return rows;

        let currentRow = { time: notes[0].rowTime, columns: notes[0].notes, count: this._popCount(notes[0].notes) };
        for (let i = 1; i < notes.length; i++) {
            if (Math.abs(notes[i].rowTime - currentRow.time) < 0.001) {
                currentRow.columns |= notes[i].notes;
                currentRow.count = this._popCount(currentRow.columns);
            } else {
                rows.push(currentRow);
                currentRow = { time: notes[i].rowTime, columns: notes[i].notes, count: this._popCount(notes[i].notes) };
            }
        }
        rows.push(currentRow);
        return rows;
    }

    _popCount(n) {
        n = n - ((n >> 1) & 0x55555555);
        n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
        return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
    }

    _analyzeWindow(rows, rate) {
        const nps = rows.length / 0.5; // Window is 0.5s
        const totalNotes = rows.reduce((sum, r) => sum + r.count, 0);
        const avgNotesPerRow = totalNotes / rows.length;

        // Count chords and jacks
        let jacks = 0;
        let jumpCount = 0;
        let handCount = 0;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].count === 2) jumpCount++;
            if (rows[i].count >= 3) handCount++;
            if (i > 0) {
                if ((rows[i].columns & rows[i - 1].columns) !== 0) {
                    jacks++;
                }
            }
        }

        const jackFreq = jackCount => jackCount / rows.length;
        const jFreq = jackFreq(jacks);

        // Pattern weights (Normalized to a baseline)
        let stream = nps * 1.0;
        let jumpstream = nps * (0.5 + (jumpCount / rows.length));
        let handstream = nps * (0.3 + (handCount / rows.length) * 1.5);
        let jackspeed = nps * (jFreq * 2.0);
        let chordjack = nps * (avgNotesPerRow * 0.5) * (jFreq + 0.5);
        let technical = nps * (0.5 + jFreq * 0.5); // Simplistic tech

        // Penalties/Adjustments
        if (avgNotesPerRow > 2.5) stream *= 0.5; // Dense chords aren't streams
        if (jFreq < 0.1) jackspeed *= 0.2; // Not really jacks

        return {
            stream: stream * rate,
            jumpstream: jumpstream * rate,
            handstream: handstream * rate,
            jackspeed: jackspeed * rate,
            chordjack: chordjack * rate,
            technical: technical * rate
        };
    }

    _aggregate(arr) {
        if (arr.length === 0) return 0;
        arr.sort((a, b) => b - a);
        let weightedSum = 0;
        let weightTotal = 0;
        const topCount = Math.min(arr.length, 20); // Top 10 seconds of intensity
        for (let i = 0; i < topCount; i++) {
            const w = Math.pow(0.9, i);
            weightedSum += arr[i] * w;
            weightTotal += w;
        }
        return weightedSum / weightTotal;
    }

    _scale(val, rate) {
        // Logarithmic saturation to match 0-40 rating scale
        // formula: Baseline * (1 - exp(-(val/K)^P))
        const res = 45 * (1 - Math.exp(-Math.pow(val / 22, 1.5)));
        return parseFloat(res.toFixed(2));
    }

    _calculateOverall(scores) {
        const skills = [
            scores.stream, scores.jumpstream, scores.handstream,
            scores.jackspeed, scores.chordjack, scores.technical, scores.stamina
        ];
        skills.sort((a, b) => b - a);

        // Take top 3 skillsets and weight them
        // Overall = S1 * 0.5 + S2 * 0.3 + S3 * 0.2 approx, or MSD style root-mean-square
        const top3 = skills.slice(0, 3);
        if (top3[0] === 0) return 0;

        const sumSq = top3.reduce((a, b) => a + (b * b), 0);
        const sum = top3.reduce((a, b) => a + b, 0);
        return parseFloat((sumSq / sum).toFixed(2));
    }
}

/**
 * Utility: Gets top pattern names from skillset scores
 */
function calculateHighestPatterns(skillset, count = 3) {
    const patterns = [
        { name: "Stream", score: skillset.stream },
        { name: "Jumpstream", score: skillset.jumpstream },
        { name: "Handstream", score: skillset.handstream },
        { name: "Stamina", score: skillset.stamina },
        { name: "Jackspeed", score: skillset.jackspeed },
        { name: "Chordjack", score: skillset.chordjack },
        { name: "Technical", score: skillset.technical }
    ];
    patterns.sort((a, b) => b.score - a.score);
    return patterns.slice(0, count).map(p => p.name);
}

// Expose to window
window.MinaCalc = MinaCalc;
window.MinaNote = MinaNote;
window.calculateHighestPatterns = calculateHighestPatterns;
