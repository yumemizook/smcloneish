/**
 * Etterna MinaCalc — Public API shim.
 * Actual implementation loaded from difficulty/*.js via <script> tags.
 * This file provides the public interface consumed by game.js.
 *
 * Globals expected from difficulty/*.js:
 *   calculateMSD, calculateSSRFromNotes, calculateSSRApprox,
 *   aggregateSkill, popcount, Skill, NUM_SKILLSET
 */

// ─── SkillsetScores (backward-compatible result container) ──────────────

function SkillsetScores() {
    this.overall = 0; this.stream = 0; this.jumpstream = 0;
    this.handstream = 0; this.stamina = 0; this.jackspeed = 0;
    this.chordjack = 0; this.technical = 0; this.nps = 0; this.peak = 0;
}

// ─── MinaNote (backward-compatible input format) ────────────────────────
// game.js creates MinaNote(bitmask, timeSec) — maps to NoteInfo { notes_row, row_time }

function MinaNote(notes, rowTime) {
    this.notes = notes;
    this.notes_row = notes;
    this.rowTime = rowTime;
    this.row_time = rowTime;
}

// ─── MinaCalc public class ──────────────────────────────────────────────

function MinaCalcAPI() {
    this.version = "4.0-donguri-port";
}

MinaCalcAPI.prototype.calcAtRate = function(notes, rate, goal, keycount) {
    if (rate === undefined) rate = 1.0;
    if (goal === undefined) goal = 0.93;
    if (keycount === undefined) keycount = 4;
    if (!notes || notes.length === 0) return new SkillsetScores();

    // Normalize note format: accept both MinaNote and NoteInfo
    var niNotes = notes.map(function(n) {
        return {
            notes_row: n.notes_row !== undefined ? n.notes_row : n.notes,
            row_time:  n.row_time  !== undefined ? n.row_time  : n.rowTime,
        };
    });

    var msd = calculateMSD(niNotes, rate);
    var scores = new SkillsetScores();
    scores.overall    = msd.overall;
    scores.stream     = msd.stream;
    scores.jumpstream = msd.jumpstream;
    scores.handstream = msd.handstream;
    scores.stamina    = msd.stamina;
    scores.jackspeed  = msd.jackSpeed;
    scores.chordjack  = msd.chordjack;
    scores.technical  = msd.technical;

    // NPS/Peak stats
    var totalDuration = niNotes[niNotes.length - 1].row_time - niNotes[0].row_time;
    var totalNoteCount = 0;
    for (var i = 0; i < niNotes.length; i++) totalNoteCount += popcount(niNotes[i].notes_row);
    scores.nps = totalDuration > 0 ? (totalNoteCount / totalDuration) : 0;
    scores.peak = scores.nps * 1.5; // Approximate peak

    return scores;
};

MinaCalcAPI.prototype.calcMSD = function(notes, keycount) {
    if (keycount === undefined) keycount = 4;
    var results = [];
    for (var rate = 0.7; rate <= 2.01; rate += 0.1) {
        var r = parseFloat(rate.toFixed(2));
        results.push({ rate: r, scores: this.calcAtRate(notes, r, 0.93, keycount) });
    }
    return results;
};

MinaCalcAPI.prototype.calcSSR = function(notes, rate, wifePercent, keycount) {
    if (rate === undefined) rate = 1.0;
    if (wifePercent === undefined) wifePercent = 0.93;
    if (keycount === undefined) keycount = 4;
    if (!notes || notes.length === 0) return new SkillsetScores();

    var niNotes = notes.map(function(n) {
        return {
            notes_row: n.notes_row !== undefined ? n.notes_row : n.notes,
            row_time:  n.row_time  !== undefined ? n.row_time  : n.rowTime,
        };
    });

    var ssr = calculateSSRFromNotes(niNotes, wifePercent * 100, rate);
    var scores = new SkillsetScores();
    scores.overall    = ssr.overall;
    scores.stream     = ssr.stream;
    scores.jumpstream = ssr.jumpstream;
    scores.handstream = ssr.handstream;
    scores.stamina    = ssr.stamina;
    scores.jackspeed  = ssr.jackSpeed;
    scores.chordjack  = ssr.chordjack;
    scores.technical  = ssr.technical;

    var totalDuration = niNotes[niNotes.length - 1].row_time - niNotes[0].row_time;
    var totalNoteCount = 0;
    for (var i = 0; i < niNotes.length; i++) totalNoteCount += popcount(niNotes[i].notes_row);
    scores.nps = totalDuration > 0 ? (totalNoteCount / totalDuration) : 0;
    scores.peak = scores.nps * 1.5;
    return scores;
};

MinaCalcAPI.prototype.calcRaw = function(notes, rate, keycount) {
    if (rate === undefined) rate = 1.0;
    if (keycount === undefined) keycount = 4;
    return this.calcAtRate(notes, rate, 0.93, keycount);
};

// Alias for backward compatibility
var MinaCalc = MinaCalcAPI;

// ─── calculateHighestPatterns ───────────────────────────────────────────

function calculateHighestPatterns(skillset, count) {
    if (count === undefined) count = 3;
    var patterns = [
        { name: "Stream",     score: skillset.stream },
        { name: "Jumpstream", score: skillset.jumpstream },
        { name: "Handstream", score: skillset.handstream },
        { name: "Stamina",    score: skillset.stamina },
        { name: "Jackspeed",  score: skillset.jackspeed },
        { name: "Chordjack",  score: skillset.chordjack },
        { name: "Technical",  score: skillset.technical },
    ];
    patterns.sort(function(a, b) { return b.score - a.score; });
    return patterns.slice(0, count).map(function(p) { return p.name; });
}

// ─── Window exports ─────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.MinaCalc = MinaCalc;
    window.MinaNote = MinaNote;
    window.SkillsetScores = SkillsetScores;
    window.calculateHighestPatterns = calculateHighestPatterns;
}
