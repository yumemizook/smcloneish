/**
 * Difficulty Module - Etterna MinaCalc JavaScript Port
 * Main entry point
 */

// Load all components in correct order
if (typeof require !== 'undefined') {
    // Node.js environment
    require('./core/constants.js');
    require('./core/structures.js');
    require('./pmods/agnostic/index.js');
    require('./pmods/dependent/index.js');
    require('./calc/chisel.js');
    require('./calc/aggregate.js');
    require('./minacalc.js');
} else {
    // Browser environment - scripts should be loaded via HTML
}

// Utility function to get top patterns from skillset scores
function calculateHighestPatterns(skillset, count = 3) {
    const patterns = [
        { name: "Stream", score: skillset.stream || 0 },
        { name: "Jumpstream", score: skillset.jumpstream || 0 },
        { name: "Handstream", score: skillset.handstream || 0 },
        { name: "Stamina", score: skillset.stamina || 0 },
        { name: "Jackspeed", score: skillset.jackspeed || 0 },
        { name: "Chordjack", score: skillset.chordjack || 0 },
        { name: "Technical", score: skillset.technical || 0 }
    ];
    patterns.sort((a, b) => b.score - a.score);
    return patterns.slice(0, count).map(p => p.name);
}

// Backward compatibility: create MinaNote alias for NoteInfo
if (typeof NoteInfo !== 'undefined') {
    var MinaNote = NoteInfo;
}

// Expose
if (typeof window !== 'undefined') {
    window.calculateHighestPatterns = calculateHighestPatterns;
    if (typeof NoteInfo !== 'undefined') {
        window.MinaNote = NoteInfo;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateHighestPatterns
    };
}
