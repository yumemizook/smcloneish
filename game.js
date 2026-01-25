/* =========================================
   CONSTANTS & CONFIG
   ========================================= */
let userConfig = {
    keys: ['d', 'f', 'j', 'k'],
    downScroll: false,
    scrollTime: 650,
    failMode: 'on',
    judgeDifficulty: 4,
    lifeDifficulty: 4,
    // New Bindings
    keyPause: 'Escape',
    keyRetry: 'Backquote',
    keyRateUp: '=',
    keyPause: 'Escape',
    keyRetry: 'Backquote',
    keyRateUp: '=',
    keyRateDown: '-',
    globalOffset: 0 // Audio offset in ms
};
// Expose to window for modifiers.js access assurance
window.userConfig = userConfig;

let bindingIndex = -1; // -1 = none, 0-3 = column
let bindingType = null; // 'pause', 'retry', 'rateUp', 'rateDown' or null
let isSyncMode = false; // Global sync calibration flag
let syncBuffer = []; // Global buffer for sync offsets

function loadUserConfig() {
    const saved = localStorage.getItem('webSM_config');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            userConfig = { ...userConfig, ...parsed };
            if (!userConfig.failMode) userConfig.failMode = 'on';
            if (!userConfig.judgeDifficulty) userConfig.judgeDifficulty = 4;
            if (!userConfig.lifeDifficulty) userConfig.lifeDifficulty = 4;
            // Ensure defaults if missing from saved (migration)
            if (!userConfig.keyPause) userConfig.keyPause = 'Escape';
            if (!userConfig.keyRetry) userConfig.keyRetry = 'Backquote';
            if (!userConfig.keyRateUp) userConfig.keyRateUp = '=';
            if (!userConfig.keyRateUp) userConfig.keyRateUp = '=';
            if (!userConfig.keyRateDown) userConfig.keyRateDown = '-';
            if (userConfig.globalOffset === undefined) userConfig.globalOffset = 0;
        } catch (e) { }
    }
}
loadUserConfig();

function saveUserConfig() {
    try {
        localStorage.setItem('webSM_config', JSON.stringify(userConfig));
    } catch (e) {
        console.warn("Failed to save user config:", e);
    }
}

// Timing Constants (New Base per User Request)
// Anchors: Marv=5, Great=65, Bad=180
const BASE_J_MARVELOUS = 22.5;
const BASE_J_PERFECT = 45;
const BASE_J_GREAT = 90;
const BASE_J_GOOD = 135;
const BASE_J_BAD = 180;
const BASE_J_MISS_WINDOW = 180;
const J_MARVELOUS = BASE_J_MARVELOUS; // Alias for legacy/global access
const J_PERFECT = BASE_J_PERFECT; // Alias for legacy/global access
const J_GREAT = BASE_J_GREAT; // Alias for legacy/global access
const J_GOOD = BASE_J_GOOD; // Alias for legacy/global access
const J_BAD = BASE_J_BAD; // Alias for legacy/global access
const J_MISS_WINDOW = BASE_J_MISS_WINDOW; // Alias for legacy/global access
const J_MINE_WINDOW = 75; // Fixed

const FLARE_DMG = {
    'NEO': { marvelous: 0, perfect: 1.5, great: 3.0, good: 12.0, miss: 36.0, ng: 36.0, mine: 36.0 },
    'EX': { marvelous: 0, perfect: 1.0, great: 2.0, good: 10.0, miss: 30.0, ng: 30.0, mine: 30.0 },
    'IX': { marvelous: 0, perfect: 0.0, great: 2.0, good: 10.0, miss: 30.0, ng: 30.0, mine: 30.0 },
    'VIII': { marvelous: 0, perfect: 0.0, great: 1.64, good: 8.20, miss: 26.0, ng: 26.0, mine: 26.0 },
    'VII': { marvelous: 0, perfect: 0.0, great: 1.28, good: 6.40, miss: 22.0, ng: 22.0, mine: 22.0 },
    'VI': { marvelous: 0, perfect: 0.0, great: 0.92, good: 4.50, miss: 18.0, ng: 18.0, mine: 18.0 },
    'V': { marvelous: 0, perfect: 0.0, great: 0.74, good: 3.60, miss: 16.0, ng: 16.0, mine: 16.0 },
    'IV': { marvelous: 0, perfect: 0.0, great: 0.56, good: 2.80, miss: 14.0, ng: 14.0, mine: 14.0 },
    'III': { marvelous: 0, perfect: 0.0, great: 0.38, good: 1.90, miss: 12.0, ng: 12.0, mine: 12.0 },
    'II': { marvelous: 0, perfect: 0.0, great: 0.29, good: 1.45, miss: 11.0, ng: 11.0, mine: 11.0 },
    'I': { marvelous: 0, perfect: 0.0, great: 0.20, good: 1.00, miss: 10.0, ng: 10.0, mine: 10.0 }
};

function getCosmeticScore() {
    const j = gameState.judgments;
    const sys = modConfig.scoringSystem;

    // Default long-form calculation for ITG fallback or generic
    if (sys === 'itg') return Math.round(gameState.score);

    if (sys === 'wife3') return Math.round(gameState.score);

    // point-based DP Scores for HUD display
    if (sys === 'ddr') {
        const points = j.marvelous * 3 + j.perfect * 2 + j.great * 1;
        return points;
    }
    if (sys === 'sm') {
        const points = (j.marvelous + j.perfect) * 2 + j.great * 1 + j.good * 0 + j.bad * -4 + (j.miss + j.ng) * -8;
        return Math.max(0, points);
    }
    if (sys === 'osu') {
        return Math.round(gameState.osuScore);
    }
    return Math.round(gameState.score);
}



function getTimingWindow(windowName, judgeDiffOverride) {
    if (windowName === 'mine') return J_MINE_WINDOW;
    // Holds/Rolls fixed? Assuming yes based on previous task.
    // If specific logic needed for hold/roll, handle here.

    // Calculate Scale
    let d = judgeDiffOverride !== undefined ? judgeDiffOverride : (userConfig.judgeDifficulty || 4);
    // Clamp
    d = Math.max(4, Math.min(9, d));

    // J4 = 1.0 (6/6)
    // J9 = 0.166... (1/6)
    // Formula: (10 - d) / 6
    const finalScale = (10 - d) / 6;

    switch (windowName.toLowerCase()) {
        case 'marvelous': return BASE_J_MARVELOUS * finalScale;
        case 'perfect': return BASE_J_PERFECT * finalScale;
        case 'great': return BASE_J_GREAT * finalScale;
        case 'good': return BASE_J_GOOD * finalScale;
        case 'bad': return BASE_J_BAD; // 180ms Fixed
        case 'miss': return BASE_J_MISS_WINDOW; // 180ms Fixed
        default: return BASE_J_MISS_WINDOW;
    }
}
const GRADE_COLORS = {
    "AAAAA": "#ffffff", "AAAA": "#66ccff", "AAA": "#eebb00", "AA": "#66cc66",
    "A": "#da5757", "B": "#5b78bb", "C": "#c97bff", "D": "#8c6239", "F": "#888888",
    "E": "#e61e25", "SS": "#ffffff", "S": "#ffcc00",
    "****": "#ffffff", "***": "#66ccff", "**": "#eebb00", "*": "#66cc66",
    "S+": "#00e5ff", "S-": "#da5757",
    "AA+": "#eebb00", "AA-": "#66cc66",
    "A+": "#66cc66", "A-": "#da5757",
    "B+": "#5b78bb", "B-": "#8c6239",
    "C+": "#c97bff", "C-": "#8c6239",
    "D+": "#da5757"
};

const CLEAR_COLORS = {
    MFC: "#66ccff",
    WF: "#dddddd",
    SDP: "#cc8800",
    PFC: "#eeaa00",
    BF: "#999999",
    SDG: "#448844",
    FC: "#66cc66",
    MF: "#cc6666",
    SDCB: "#33bbff",
    Clear: "#33aaff",
    Failed: "#e61e25",
    Invalid: "#e61e25",
    NoPlay: "#666666",
    None: "#666666"
};

const QUANTIZATION_ROWS = { 4: 0, 8: 1, 12: 2, 16: 3, 24: 4, 32: 5, 48: 6, 64: 7 };

/* =========================================
   PARSERS
   ========================================= */
function parseSM(text) {
    const charts = [];
    const meta = {};
    text = text.replace(/\/\/.*$/mg, '');

    const getTag = (tag) => {
        // Changed to [\s\S]*? to match across newlines
        const match = text.match(new RegExp(`#${tag}:([\\s\\S]*?);`, 'i'));
        return match ? match[1].trim() : null;
    };

    meta.title = getTag('TITLE') || "Unknown";
    meta.artist = getTag('ARTIST') || "Unknown";
    meta.music = getTag('MUSIC');
    meta.banner = getTag('BANNER');
    meta.background = getTag('BACKGROUND');
    meta.cdtitle = getTag('CDTITLE');
    meta.subtitle = getTag('SUBTITLE') || "";
    meta.offset = parseFloat(getTag('OFFSET')) || 0;
    meta.sampleStart = parseFloat(getTag('SAMPLESTART')) || 0;
    meta.sampleLength = parseFloat(getTag('SAMPLELENGTH')) || 15; // Default 15s

    const bpmMatch = text.match(/#BPMS:([\s\S]*?);/i);
    meta.bpms = bpmMatch ? bpmMatch[1].trim().split(',').map(b => {
        const p = b.split('=');
        return { beat: parseFloat(p[0]), value: parseFloat(p[1]) };
    }) : [{ beat: 0, value: 120 }];

    const rawCharts = text.split(/#NOTES:/i);
    rawCharts.shift();

    rawCharts.forEach(raw => {
        const parts = raw.split(':');
        if (parts.length >= 6) {
            const type = parts[0].trim();
            if (type === 'dance-single') {
                charts.push({
                    difficulty: parts[2].trim(),
                    meter: parts[3].trim(),
                    notes: parseNoteData(parts[5].replace(';', '').trim(), meta.bpms, meta.offset),
                    bpms: meta.bpms
                });
            }
        }
    });

    return { meta, charts };
}

// Color Support
function getDifficultyColor(diff) {
    let h;
    if (diff <= 30) {
        // Standard range: Blue -> Green -> Red -> Rose (clamped at -30)
        h = Math.min(220, Math.max(280 - (diff * 11), -30));
    } else {
        // 30+ range: Rose (-30) -> Purple/Lavender (-90 at diff 40)
        // Interpolate 6 degrees per difficulty point
        h = Math.max(-90, -30 - (diff - 30) * 6);
    }
    return `hsl(${h}, 100%, 75%)`;
}

function parseSSC(text) {
    const charts = [];
    const meta = {};
    text = text.replace(/\/\/.*$/mg, '');

    const getTag = (block, tag) => {
        // Use [\s\S]*? to match any character including newlines, non-greedy until ;
        const match = block.match(new RegExp(`#${tag}:([\\s\\S]*?);`, 'i'));
        return match ? match[1].trim() : null;
    };

    meta.title = getTag(text, 'TITLE') || "Unknown";
    meta.artist = getTag(text, 'ARTIST') || "Unknown";
    meta.music = getTag(text, 'MUSIC');
    meta.banner = getTag(text, 'BANNER');
    meta.background = getTag(text, 'BACKGROUND');
    meta.cdtitle = getTag(text, 'CDTITLE');
    meta.subtitle = getTag(text, 'SUBTITLE') || "";
    meta.offset = parseFloat(getTag(text, 'OFFSET')) || 0;
    meta.sampleStart = parseFloat(getTag(text, 'SAMPLESTART')) || 0;
    meta.sampleLength = parseFloat(getTag(text, 'SAMPLELENGTH')) || 15;

    const bpmMatch = text.match(/#BPMS:([\s\S]*?);/i);
    meta.bpms = bpmMatch ? bpmMatch[1].trim().split(',').map(b => {
        const p = b.split('=');
        return { beat: parseFloat(p[0]), value: parseFloat(p[1]) };
    }) : [{ beat: 0, value: 120 }];

    // SSC separates charts with #NOTEDATA:;
    const chartBlocks = text.split(/#NOTEDATA:;/i);
    chartBlocks.shift(); // Remove global/header block

    console.log(`[SSC] Found ${chartBlocks.length} chart blocks.`);

    chartBlocks.forEach((block, i) => {
        const type = getTag(block, 'STEPSTYPE');
        const diff = getTag(block, 'DIFFICULTY');

        // console.log(`[SSC] Block ${i} Type: ${type}, Diff: ${diff}`);

        if (type && type.toLowerCase().includes('dance-single')) {
            const difficulty = diff || "Edit";
            const meter = getTag(block, 'METER') || "1";
            const notesRaw = getTag(block, 'NOTES');

            // Check for Local Timing (BPMS)
            let chartBpms = meta.bpms;
            const localBpmMatch = block.match(/#BPMS:([\s\S]*?);/i);
            if (localBpmMatch) {
                chartBpms = localBpmMatch[1].trim().split(',').map(b => {
                    const p = b.split('=');
                    return { beat: parseFloat(p[0]), value: parseFloat(p[1]) };
                });
            }

            if (notesRaw) {
                charts.push({
                    difficulty: difficulty,
                    meter: meter,
                    notes: parseNoteData(notesRaw.trim(), chartBpms, meta.offset),
                    bpms: chartBpms
                });
                console.log(`[SSC] Parsed chart: ${difficulty} (${meter})`);
            } else {
                console.warn(`[SSC] Block ${i} matched type but no NOTES tag found.`);
            }
        }
    });

    return { meta, charts };
}

function parseNoteData(data, bpms, songOffset) {
    const measures = data.split(',');
    const notes = [];
    let currentBeat = 0;
    let activeHolds = [null, null, null, null];

    // Pre-sort BPMs just in case
    const sortedBpms = bpms.sort((a, b) => a.beat - b.beat);

    // Helper: Calculate Time from Beats dynamically
    function getAccumulatedTime(targetBeat, bpms) {
        let time = 0;
        let pBeat = 0;

        for (let i = 0; i < bpms.length; i++) {
            const b = bpms[i];
            const nextB = bpms[i + 1];
            const segmentEndBeat = nextB ? nextB.beat : Infinity;

            // If target is in this segment
            if (targetBeat < segmentEndBeat) {
                const duration = targetBeat - Math.max(pBeat, b.beat);
                if (duration > 0) {
                    time += duration * (60 / b.value);
                }
                break;
            } else {
                // Add full segment
                const duration = segmentEndBeat - Math.max(pBeat, b.beat);
                if (duration > 0) {
                    time += duration * (60 / b.value);
                }
            }
        }
        return time;
    }

    measures.forEach((measure) => {
        const lines = measure.trim().split(/\s+/);
        const rows = lines.length;
        const beatPerLine = 4 / rows;

        lines.forEach((line, rowIndex) => {
            const exactBeat = currentBeat + (rowIndex * beatPerLine);
            const time = getAccumulatedTime(exactBeat, sortedBpms) - songOffset;

            for (let col = 0; col < 4; col++) {
                const char = line[col];

                if (char === '1' || char === '2' || char === '4' || char === 'M') {
                    const type = char === '1' ? 'tap' : (char === '2' ? 'hold' : (char === '4' ? 'roll' : 'mine'));
                    const note = {
                        beat: exactBeat, time: time, col: col, type: type,
                        hit: false, processed: false, holdState: 'inactive', endTime: null
                    };
                    notes.push(note);
                    if (type === 'hold' || type === 'roll') { activeHolds[col] = note; }
                }
                else if (char === '3') {
                    if (activeHolds[col]) {
                        activeHolds[col].endTime = time;
                        activeHolds[col] = null;
                    }
                }
            }
        });
        currentBeat += 4;
    });
    return notes.sort((a, b) => a.time - b.time);
}


/* =========================================
   MODIFIER LOGIC (TRANSFORMS)
   ========================================= */
function applyChartTransforms(originalNotes) {
    if (!modConfig) return originalNotes;

    // 1. Clone Notes (Shallow copy of objects is safest if we mutate, but we usually re-create if changing col)
    // We map to new objects to be safe.
    let notes = originalNotes.map(n => ({ ...n }));

    // 2. Inserts / Removes
    const tf = modConfig.transform;
    if (tf) {
        // --- REMOVES ---
        if (tf.noMines) notes = notes.filter(n => n.type !== 'mine');
        if (tf.noHolds) notes = notes.filter(n => n.type !== 'hold');
        if (tf.noRolls) notes = notes.filter(n => n.type !== 'roll');

        if (tf.noHands) {
            // Keep max 2 notes per row (time)
            const timeMap = new Map();
            notes.forEach(n => {
                if (!timeMap.has(n.time)) timeMap.set(n.time, []);
                timeMap.get(n.time).push(n);
            });
            let newNotes = [];
            timeMap.forEach(group => {
                if (group.length > 2) {
                    // Keep first 2 columns
                    group.sort((a, b) => a.col - b.col);
                    newNotes.push(group[0]);
                    newNotes.push(group[1]);
                } else {
                    newNotes.push(...group);
                }
            });
            notes = newNotes.sort((a, b) => a.time - b.time);
        }

        if (tf.noJumps) {
            // Keep max 1 note per row
            const timeMap = new Map();
            notes.forEach(n => {
                if (!timeMap.has(n.time)) timeMap.set(n.time, []);
                timeMap.get(n.time).push(n);
            });
            let newNotes = [];
            timeMap.forEach(group => {
                if (group.length > 1) {
                    // Keep only one (e.g. lowest val col)
                    newNotes.push(group[0]);
                } else {
                    newNotes.push(group[0]);
                }
            });
            notes = newNotes.sort((a, b) => a.time - b.time);
        }

        if (tf.little) {
            // Keep only 4th notes (Beat % 1 === 0)
            notes = notes.filter(n => {
                const b = n.beat;
                return Math.abs(b - Math.round(b)) < 0.01;
            });
        }

        // --- INSERTS ---
        const maxBeat = notes.length > 0 ? notes[notes.length - 1].beat : 0;

        // Helper to find if note exists at beat/col
        const exists = (beat, col) => notes.some(n => Math.abs(n.beat - beat) < 0.001 && (col === -1 || n.col === col));
        const getAtBeat = (beat) => notes.filter(n => Math.abs(n.beat - beat) < 0.001);

        if (tf.wide) {
            // Convert all taps to Jumps (if not already)
            let notesToAdd = [];
            let snapshot = [...notes];
            snapshot.forEach(n => {
                if (n.type === 'tap' || n.type === 'hold') {
                    const neighbors = getAtBeat(n.beat);
                    if (neighbors.length < 2) {
                        let newCol = 3 - n.col;
                        if (!neighbors.some(x => x.col === newCol)) {
                            notesToAdd.push({
                                time: n.time,
                                beat: n.beat,
                                col: newCol,
                                type: 'tap', // Always add tap for Wide
                                processed: false
                            });
                        }
                    }
                }
            });
            notes = notes.concat(notesToAdd);
        }

        if (tf.big) {
            // Add 8th notes between 4ths
            let notesToAdd = [];
            for (let b = 0; b < maxBeat; b += 1) {
                const targetBeat = b + 0.5;
                if (!exists(targetBeat, -1)) {
                    let col = (b % 2 === 0) ? 1 : 2;
                    // Interpolate time
                    const prev = notes.filter(n => n.beat <= targetBeat).pop();
                    const next = notes.find(n => n.beat > targetBeat);

                    if (prev && next) {
                        const ratio = (targetBeat - prev.beat) / (next.beat - prev.beat);
                        const interpolatedTime = prev.time + (next.time - prev.time) * ratio;
                        notesToAdd.push({ beat: targetBeat, time: interpolatedTime, col: col, type: 'tap', processed: false });
                    }
                }
            }
            notes = notes.concat(notesToAdd);
        }

        if (tf.quick) {
            // Add 16th notes
            let notesToAdd = [];
            for (let b = 0; b < maxBeat; b += 0.5) {
                const targetBeat = b + 0.25;
                if (!exists(targetBeat, -1)) {
                    let col = (Math.floor(b) % 2 === 0) ? 0 : 3;
                    const prev = notes.filter(n => n.beat <= targetBeat).sort((a, b) => a.beat - b.beat).pop();
                    const next = notes.find(n => n.beat > targetBeat);
                    if (prev && next) {
                        const ratio = (targetBeat - prev.beat) / (next.beat - prev.beat);
                        const interpolatedTime = prev.time + (next.time - prev.time) * ratio;
                        notesToAdd.push({ beat: targetBeat, time: interpolatedTime, col: col, type: 'tap', processed: false });
                    }
                }
            }
            notes = notes.concat(notesToAdd);
        }

        if (tf.skippy) {
            // Add 16ths after 4ths
            let notesToAdd = [];
            notes.forEach(n => {
                if (Math.abs(n.beat % 1) < 0.01) {
                    const targetBeat = n.beat + 0.75;
                    if (!exists(targetBeat, -1)) {
                        let newCol = (n.col + 1) % 4;
                        const next = notes.find(x => x.beat > n.beat);
                        if (next) {
                            const ratio = (targetBeat - n.beat) / (next.beat - n.beat);
                            const t = n.time + (next.time - n.time) * ratio;
                            notesToAdd.push({ beat: targetBeat, time: t, col: newCol, type: 'tap', processed: false });
                        }
                    }
                }
            });
            notes = notes.concat(notesToAdd);
        }

        if (tf.echo) {
            // Add a note 1/8th after every tap
            let notesToAdd = [];
            notes.forEach(n => {
                if (n.type === 'tap') {
                    const targetBeat = n.beat + 0.5;
                    if (!exists(targetBeat, -1)) {
                        let newCol = n.col; // Echo same col
                        const next = notes.find(x => x.beat > n.beat);
                        if (next) {
                            const ratio = (targetBeat - n.beat) / (next.beat - n.beat);
                            const t = n.time + (next.time - n.time) * ratio;
                            notesToAdd.push({ beat: targetBeat, time: t, col: newCol, type: 'tap', processed: false });
                        }
                    }
                }
            });
            notes = notes.concat(notesToAdd);
        }

        if (tf.stomp) {
            // Emphasize beats with Jumps
            let notesToAdd = [];
            notes.forEach(n => {
                if (Math.abs(n.beat % 1) < 0.01 && (n.type === 'tap' || n.type === 'hold')) {
                    const neighbors = getAtBeat(n.beat);
                    if (neighbors.length < 2) {
                        let newCol = 3 - n.col;
                        if (!neighbors.some(x => x.col === newCol)) {
                            notesToAdd.push({ beat: n.beat, time: n.time, col: newCol, type: 'tap', processed: false });
                        }
                    }
                }
            });
            notes = notes.concat(notesToAdd);
        }

        // Re-sort after inserts
        notes.sort((a, b) => a.time - b.time);
    }

    // 3. Turns
    const turn = modConfig.turn;
    if (turn && turn !== 'none') {
        let mapping = [0, 1, 2, 3];
        if (turn === 'mirror') mapping = [3, 2, 1, 0];
        else if (turn === 'left') mapping = [1, 2, 3, 0]; // Left: Right->Up, Up->Left... Rotation
        else if (turn === 'right') mapping = [3, 0, 1, 2];
        else if (turn === 'shuffle') {
            // Deterministic shuffle for this session? Or random?
            // Standard JS shuffle
            mapping = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        }

        notes.forEach(n => {
            n.col = mapping[n.col];
        });
    }

    return notes;
}

/* =========================================
   UI HELPERS
   ========================================= */
function setScreen(screenName) {
    if (screenName === 'loading-status') {
        const el = document.getElementById('loading-status');
        if (el) el.style.display = 'flex';
        return;
    }

    const screens = ['setup-panel', 'game-hud', 'pause-menu', 'results-screen', 'settings-modal', 'settings-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const helpBtn = document.getElementById('help-btn');

    if (screenName === 'setup-panel') {
        document.getElementById('setup-panel').style.display = 'block';
        if (helpBtn) helpBtn.style.display = 'flex';
        return;
    }

    // Hide help button on all other screens
    if (helpBtn) helpBtn.style.display = 'none';

    if (screenName) {
        const target = document.getElementById(screenName);
        if (target) target.style.display = 'flex';
    }
}

function openHelp() {
    document.getElementById('help-modal').style.display = 'flex';
}
window.openHelp = openHelp;

function closeHelp() {
    document.getElementById('help-modal').style.display = 'none';
}
window.closeHelp = closeHelp;

const uiCache = {};
function setText(id, text) {
    let el = uiCache[id];
    if (!el) {
        el = document.getElementById(id);
        if (el) uiCache[id] = el;
    }
    if (el) {
        // Only update if changed to avoid reflows
        if (el._lastText !== text) {
            el.innerText = text;
            el._lastText = text;
        }
    }
}

/* =========================================
   GAME STATE & LIBRARY
   ========================================= */
let canvas, ctx;
let audioCtx, audioBuffer, audioSource;

let songLibrary = [];
let selectedSongIndex = -1;
let selectedChartIndex = -1;
let deleteMode = false;

let gameState = {
    meta: null,
    chartInfo: null,
    notes: [],
    activeNotes: [],
    startTime: 0,
    isPaused: false,
    isPlaying: false,
    failed: false,
    combo: 0,
    maxCombo: 0,
    score: 0,
    accumulatedAccuracyPoints: 0,
    totalNotesHitOrMissed: 0,
    totalNotesInChart: 0,
    judgments: { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, ok: 0, ng: 0, mine: 0 },
    heldKeys: [false, false, false, false],
    hitOffsets: [],
    life: 50,
    lifeHistory: [],
    comboHistory: [],
    accuracyHistory: [],
    npsHistory: [],
    difficultyStats: null,
    globalFrame: 0,
    currentNPS: 0,
    peakNPS: 0,
    recentHits: [],
    detailedHits: [],
    osuScore: 0,
    osuBonus: 100,
    replayLog: []
};

let gameConfig = {
    receptorY: 100, // Fixed receptor Y position
    scrollSpeed: 400, // Default pixels per second
    columnWidth: 85,
    arrowSize: 85 // slightly smaller than col to prevent overlap
};

// function updateScrollSpeed removed - logic inlined in gameLoop


let assets = {
    arrowSprite: new Image(), holdHeadActive: new Image(), holdBody: new Image(),
    rollBody: new Image(), holdExplosion: new Image(), mineSprite: new Image(), receptorSprite: new Image(),
    loaded: { arrowSprite: false, holdHeadActive: false, holdBody: false, rollBody: false, holdExplosion: false, mineSprite: false, receptorSprite: false }
};

const loadAsset = (key, src) => {
    assets[key].src = src;
    assets[key].onload = () => { assets.loaded[key] = true; };
    assets[key].onerror = () => { console.warn(`Asset ${key} not found: ${src}`); };
};

loadAsset('arrowSprite', "_Down Tap Note 1x8.png");
loadAsset('holdHeadActive', "_Down Hold Active 1x8.png");
loadAsset('holdBody', "Down Hold Body Active.png");
loadAsset('rollBody', "Down Roll Body active.png");
loadAsset('holdExplosion', "Down Hold Explosion 2x1.png");
loadAsset('mineSprite', "_Down Tap Mine 8x1.png");
loadAsset('receptorSprite', "_Down Go Receptor Go 2x1.png");

// Placeholder Data
const placeholders = [{ meta: { title: "Loading Sync...", artist: "..." }, charts: [] }];
placeholders.forEach(p => songLibrary.push(p));

/* =========================================
   LIBRARY MANAGEMENT
   ========================================= */
function saveLibrary() {
    // Filter out placeholders (index 0)
    const libToSave = songLibrary
        .filter((s, i) => i > 0)
        .map(s => {
            const lightCharts = s.charts.map(c => ({
                difficulty: c.difficulty,
                meter: c.meter,
                // Only save calc stats, not note data to save space
                difficultyCalc: c.difficultyCalc || calculateDetailedDifficulty(c.notes)
            }));
            return { meta: s.meta, charts: lightCharts };
        });
    try { localStorage.setItem('webSM_library_meta', JSON.stringify(libToSave)); }
    catch (e) { console.warn("Library save failed:", e); }
}

function loadLibrary() {
    const s = localStorage.getItem('webSM_library_meta');
    if (s) {
        try {
            const loaded = JSON.parse(s);
            loaded.forEach(l => {
                songLibrary.push({
                    meta: l.meta,
                    charts: l.charts,
                    audioBlob: null, bannerBlob: null, bgBlob: null, cdTitleBlob: null
                });
            });
        } catch (e) { console.warn("Library load failed:", e); }
    }
}

function sortLibrary() {
    if (songLibrary.length <= 1) return;
    const first = songLibrary[0];
    const rest = songLibrary.slice(1);

    rest.sort((a, b) => {
        // 1. Prioritize songs without missing data (warning icon)
        const warnA = !a.audioBlob;
        const warnB = !b.audioBlob;
        if (warnA !== warnB) return warnA ? 1 : -1;

        // 2. Alphabetical A-Z
        const tA = (a.meta.title || "").toUpperCase();
        const tB = (b.meta.title || "").toUpperCase();
        if (tA < tB) return -1;
        if (tA > tB) return 1;
        return 0;
    });

    songLibrary = [first, ...rest];
}

/* =========================================
   LIBRARY LOGIC
   ========================================= */
/* =========================================
   LIBRARY LOGIC
   ========================================= */
window.onload = async () => {
    document.getElementById('gameCanvas').style.display = 'none';

    // Ensure intro screen is visible (it defaults to visible in CSS but good to be sure if we change it later)
    const introScreen = document.getElementById('intro-screen');
    const introLoading = document.getElementById('intro-loading-text');
    const introPrompt = document.getElementById('intro-prompt');

    if (introScreen) introScreen.style.display = 'flex';

    loadLibrary();
    sortLibrary();
    // renderSongList(); // Called after loadLocalSong? Or before? Existing code called it before.
    // Let's keep it consistent but we might want to wait. 
    // loadLocalSong calls renderSongList internally.

    await loadLocalSong();

    // Initialization done.
    if (introLoading) introLoading.style.display = 'none';
    if (introPrompt) {
        introPrompt.style.display = 'block';

        const onStart = () => {
            document.removeEventListener('keydown', onStart);
            document.removeEventListener('click', onStart);
            startApp();
        };

        document.addEventListener('keydown', onStart);
        document.addEventListener('click', onStart);
    } else {
        // Fallback if elements invalid
        startApp();
    }
};

function startApp() {
    const introScreen = document.getElementById('intro-screen');
    if (introScreen) {
        introScreen.classList.add('fade-out');
        setTimeout(() => {
            introScreen.style.display = 'none';
        }, 500);
    }

    // Resume Audio Context if it exists (usually created on demand, but good practice for future)
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Add logic to show the specific screen we want first (setup-panel)
    // setScreen('setup-panel') is handled by default mostly, but let's be explicit
    // renderSongList was already called, so setup-panel should be ready.
}

async function loadLocalSong() {
    try {
        const smRes = await fetch('./sync/sync.sm');
        if (!smRes.ok) throw new Error("sync.sm not found");
        const smText = await smRes.text();
        const parsedData = parseSM(smText);

        const audioRes = await fetch('./sync/_sync music.ogg');
        if (!audioRes.ok) throw new Error("music not found");
        const audioBlob = await audioRes.blob();

        songLibrary[0] = {
            meta: parsedData.meta,
            charts: parsedData.charts,
            audioBlob: audioBlob,
            bannerBlob: null,
            bgBlob: null,
            cdTitleBlob: null
        };

        if (selectedSongIndex === 0) { selectSong(0); }
        renderSongList();
        console.log("Locally linked './sync/sync.sm' successfully.");
    } catch (e) {
        console.warn("Could not link local files:", e);
        songLibrary[0] = { meta: { title: "Sync (Missing)", artist: "Check Console" }, charts: [] };
        renderSongList();
    }
}

function renderSongList() {
    const list = document.getElementById('song-list-container');
    list.innerHTML = '';
    setText('library-count', `${songLibrary.length} Songs`);

    songLibrary.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = `song-item ${index === selectedSongIndex ? 'selected' : ''}`;

        // Delete Mode Handling
        if (deleteMode && index > 0) {
            item.classList.add('delete-mode');
            item.onclick = () => {
                if (confirm(`Delete "${song.meta.title}"?`)) deleteSong(index);
            };
        } else {
            item.onclick = () => selectSong(index);
        }

        let squares = '';
        if (song.charts) {
            // ...
            song.charts.forEach(c => {
                let cls = 'bg-edit';
                const diff = c.difficulty.toLowerCase();
                if (diff.includes('beginner')) cls = 'bg-beginner';
                else if (diff.includes('easy')) cls = 'bg-easy';
                else if (diff.includes('medium')) cls = 'bg-medium';
                else if (diff.includes('hard')) cls = 'bg-hard';
                else if (diff.includes('challenge')) cls = 'bg-challenge';
                squares += `<div class="diff-square ${cls}" title="${c.difficulty} ${c.meter}"></div>`;
            });
        }

        // Reupload indicator checking
        let missingIndicator = '';
        if (index > 0 && !song.audioBlob) {
            missingIndicator = '<span title="Files missing. Re-import song." style="color: #ffcc00; margin-right: 6px;">\u26A0\uFE0F</span>';
        }

        const subtitle = song.meta.subtitle ? `<span class="song-item-subtitle">${song.meta.subtitle}</span>` : '';
        item.innerHTML = `<div class="song-item-info"><span class="song-item-title">${missingIndicator}${song.meta.title}</span><span class="song-item-artist">${song.meta.artist}</span></div>${subtitle}<div class="diff-squares">${squares}</div>`;
        list.appendChild(item);
    });
}

function toggleDeleteMode() {
    deleteMode = !deleteMode;
    const btn = document.getElementById('delete-toggle');
    if (btn) {
        if (deleteMode) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    renderSongList();
}
window.toggleDeleteMode = toggleDeleteMode;
window.startAutoplay = startAutoplay;

function deleteSong(index) {
    if (index <= 0) return; // Cannot delete sync/placeholder
    songLibrary.splice(index, 1);
    // Adjust selected index
    if (selectedSongIndex === index) selectedSongIndex = -1;
    else if (selectedSongIndex > index) selectedSongIndex--;

    saveLibrary();
    renderSongList();
    if (selectedSongIndex === -1) {
        document.getElementById('ss-empty-state').style.display = 'flex';
        document.getElementById('ss-details-content').style.display = 'none';
        document.getElementById('bg-layer').style.backgroundImage = 'none';
    } else {
        selectSong(selectedSongIndex);
    }
}

function selectSong(index) {
    selectedSongIndex = index;
    selectedChartIndex = -1;
    renderSongList();

    const song = songLibrary[index];
    document.getElementById('ss-empty-state').style.display = 'none';
    document.getElementById('ss-details-content').style.display = 'flex';

    setText('ss-title', song.meta.title);
    setText('ss-artist', song.meta.artist);

    const banner = document.getElementById('ss-banner');
    if (song.bannerBlob) { banner.src = URL.createObjectURL(song.bannerBlob); banner.style.display = 'block'; }
    else { banner.src = ''; banner.style.display = 'none'; }

    const cd = document.getElementById('ss-cdtitle');
    if (song.cdTitleBlob) { cd.src = URL.createObjectURL(song.cdTitleBlob); cd.style.display = 'block'; }
    else { cd.style.display = 'none'; }

    if (song.bgBlob) document.getElementById('bg-layer').style.backgroundImage = `url(${URL.createObjectURL(song.bgBlob)})`;

    const diffList = document.getElementById('ss-diff-list');
    diffList.innerHTML = '';

    const order = ['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge', 'Edit'];
    if (song.charts) {
        song.charts.sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));
        song.charts.forEach((chart, cIndex) => {
            const btn = document.createElement('div');
            let cls = 'bg-edit';
            const diff = chart.difficulty.toLowerCase();
            if (diff.includes('beginner')) cls = 'bg-beginner'; else if (diff.includes('easy')) cls = 'bg-easy';
            else if (diff.includes('medium')) cls = 'bg-medium'; else if (diff.includes('hard')) cls = 'bg-hard';
            else if (diff.includes('challenge')) cls = 'bg-challenge';

            // Get best grade
            const key = `webSM_lb_${song.meta.title}_${chart.difficulty}`;
            let bestGrade = '';
            try {
                const saved = localStorage.getItem(key);
                let lb = [];
                if (saved) {
                    const parsed = JSON.parse(saved);
                    lb = Array.isArray(parsed) ? parsed : [parsed];
                }
                if (lb.length > 0) {
                    // Find best grade based on sorting or custom priority? 
                    // Find best grade based on sorting
                    lb.sort(sortLeaderboard);
                    // If top score is invalid/fail, we might not want to show it?
                    // But sortLeaderboard pushes them to bottom.
                    // If all are invalid, lb[0] is best invalid.
                    // Let's check if valid:
                    const top = lb[0];
                    const fc = top.fcType || (top.judgments ? getFCType(top.judgments) : "");
                    if (fc !== "Fail" && fc !== "Invalid") {
                        bestGrade = top.grade;
                    }
                }
            } catch (e) { }

            btn.className = `ss-diff-item ${cls}`;
            // Add border color style inline so 'currentColor' shadow works? No, class handles border-color.
            // We need to set the color property to the border color so shading works if using currentColor?
            // Actually style.css sets border-color. To use currentColor in shadow, we might need to set color or explicit shadow.
            // Let's rely on class. 

            let gradeHtml = '';
            if (bestGrade) {
                const gradeColor = GRADE_COLORS[bestGrade] || '#fff';
                gradeHtml = `<span class="diff-best-grade" style="color:${gradeColor}">${bestGrade}</span>`;
            }

            btn.innerHTML = `<span>${chart.difficulty}</span> <div style="display:flex; align-items:center;">${gradeHtml} <span style="margin-left:10px">${chart.meter}</span></div>`;
            btn.onclick = () => selectDifficulty(cIndex);
            diffList.appendChild(btn);
        });
    }

    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = true;
    startBtn.innerText = "Select Difficulty";

    ['overall', 'stream', 'jumpstream', 'handstream', 'chordjack', 'technical', 'stamina', 'nps', 'peak'].forEach(k => {
        setText(`calc-${k}`, "0.0");
    });

    // --- Audio Preview ---
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    // Also stop chart preview loop if running
    if (previewLoopId) cancelAnimationFrame(previewLoopId);
    updatePlayBtn(false);

    if (song.audioBlob) {
        const url = URL.createObjectURL(song.audioBlob);
        previewAudio = new Audio(url);
        const baseVol = 0.6;
        previewAudio.volume = baseVol;

        const start = song.meta.sampleStart || 0;
        const length = song.meta.sampleLength || 15;

        previewState.isLoopingSample = true;
        previewState.sampleStart = start;
        previewState.sampleLength = length;

        previewState.isLoopingSample = true;
        previewState.sampleStart = start;
        previewState.sampleLength = length;

        // Defer seek until metadata is loaded to ensure it works
        const playPreview = () => {
            if (previewAudio) {
                previewAudio.pause();
                previewAudio.currentTime = start; // Set to 'start' not 0
                // Apply Settings
                updatePreviewAudioSettings();
                previewAudio.play().catch(e => console.warn("Preview autoplay blocked", e));
            }
        };

        previewAudio.loop = false; // We handle looping manually for fade

        updatePreviewAudioSettings();

        // Wait for metadata to load before playing
        previewAudio.addEventListener('loadedmetadata', () => {
            playPreview();
        }, { once: true });

        if (previewAudio.readyState >= 1) {
            playPreview();
        }

        // Loop & Fade Logic
        previewAudio.addEventListener('timeupdate', () => {
            if (!previewAudio) return;
            if (!previewState.isLoopingSample) return; // Allow manual seeking if flag is off

            const end = start + length;
            const now = previewAudio.currentTime;

            // Loop check
            if (now >= end) {
                previewAudio.currentTime = start;
                previewAudio.volume = baseVol;
                return;
            }

            // Fade out last 1.5 seconds
            const fadeDur = 1.5;
            const remaining = end - now;
            if (remaining <= fadeDur && remaining > 0) {
                previewAudio.volume = baseVol * (remaining / fadeDur);
            } else {
                // Ensure volume is restored if we jumped back or are in middle
                if (Math.abs(previewAudio.volume - baseVol) > 0.01) previewAudio.volume = baseVol;
            }
        });

    }

    // Auto-select first difficulty (After audio setup)
    if (song.charts && song.charts.length > 0) {
        selectDifficulty(0);
    }
}

function updateBannerStats(chart) {
    if (!chart) return;
    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;

    // --- BPM Logic ---
    let minBPM = 99999, maxBPM = 0;
    let mainBPM = 0;
    let displayBPM = "";

    const fmt = (n) => Math.round(n * rate);

    if (chart.bpms && chart.bpms.length > 0) {
        // Calculate Min/Max and Weighted Mode
        const durMap = {};

        // Use last note beat to cap the last BPM segment
        let endBeat = 0;
        if (chart.notes && chart.notes.length > 0) {
            endBeat = chart.notes[chart.notes.length - 1].beat;
        } else {
            endBeat = 1000; // Fallback
        }

        // Sort BPMs by beat (parser produces {beat, value})
        const sorted = [...chart.bpms].sort((a, b) => a.beat - b.beat);

        sorted.forEach((b, i) => {
            const val = b.value;
            if (val < minBPM) minBPM = val;
            if (val > maxBPM) maxBPM = val;


            // Expose BPM Stats for Modifiers
            window.currentBPMStats = { min: minBPM, max: maxBPM, main: mainBPM };

            // Duration in beats
            let startBeat = b.beat;
            let nextBeat = (i < sorted.length - 1) ? sorted[i + 1].beat : endBeat;

            // If the start beat of the last BPM is AFTER the last note, duration is 0 (or handled gracefully)
            // But usually last BPM is at beat 0 or before end.
            if (startBeat > endBeat) nextBeat = startBeat; // Minimal duration

            let beatDur = Math.max(0, nextBeat - startBeat);

            // Convert to Time Duration for weighting: beats * (60 / bpm)
            let timeDur = beatDur * (60 / (val || 120)); // avoid div 0

            durMap[val] = (durMap[val] || 0) + timeDur;
        });

        // Find Main (Mode)
        let maxDur = -1;
        for (const [bpmStr, dur] of Object.entries(durMap)) {
            if (dur > maxDur) {
                maxDur = dur;
                mainBPM = parseFloat(bpmStr);
            }
        }

        // Format
        if (minBPM > 90000) minBPM = 0; // Safety

        if (Math.abs(minBPM - maxBPM) < 1.0) {
            displayBPM = `${fmt(maxBPM)}`;
        } else {
            // Format: "Min-Max (Main)"
            displayBPM = `${fmt(minBPM)}-${fmt(maxBPM)} (${fmt(mainBPM)})`;
        }
    } else {
        // Fallback to meta
        const metaBPM = parseFloat(songLibrary[selectedSongIndex].meta.bpm) || 150;
        displayBPM = `${fmt(metaBPM)}`;
    }

    // --- Length Logic ---
    let length = 0;
    // Uses time directly from notes if available (which parseNoteData provides)
    if (chart.notes && chart.notes.length > 0) {
        length = chart.notes[chart.notes.length - 1].time;
    }

    // Apply Rate
    const realLength = length / rate;

    // Format mm:ss
    const m = Math.floor(realLength / 60);
    const s = Math.floor(realLength % 60);
    const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

    // Color Coding
    let lenColor = "#fff"; // Default
    if (realLength < 120) lenColor = "#88ccff"; // Short < 2m (Blueish)
    else if (realLength < 240) lenColor = "#88ff88"; // Standard < 4m (Green)
    else lenColor = "#ff88cc"; // Long >= 4m (Red/Purple)

    // --- Update DOM ---
    const bannerContainer = document.getElementById('ss-banner').parentNode;
    if (getComputedStyle(bannerContainer).position === 'static') {
        bannerContainer.style.position = 'relative';
    }

    let overlay = document.getElementById('ss-info-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ss-info-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '5px';
        overlay.style.left = '5px';
        overlay.style.background = 'rgba(0,0,0,0.6)';
        overlay.style.padding = '4px 8px';
        overlay.style.borderRadius = '4px';
        overlay.style.color = '#fff';
        overlay.style.fontSize = '0.9rem';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        bannerContainer.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div style="font-weight:bold; font-size:1.1em;">${displayBPM} <span style="font-size:0.7em; color:#ccc">BPM</span></div>
        <div style="color:${lenColor}; font-weight:bold;">${timeStr}</div>
    `;
}

function selectDifficulty(chartIndex) {
    selectedChartIndex = chartIndex;
    const items = document.querySelectorAll('.ss-diff-item');
    items.forEach((item, i) => {
        if (i === chartIndex) item.classList.add('active');
        else item.classList.remove('active');
    });

    const chart = songLibrary[selectedSongIndex].charts[chartIndex];
    if (chart) updateBannerStats(chart); // Update Banner Stats

    if (chart.notes) {
        const calc = calculateDetailedDifficulty(chart.notes);

        // Helper to set Text and Color
        const setC = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = val.toFixed(2);
                el.style.color = getDifficultyColor(val);
                el.style.textShadow = `0 0 10px ${getDifficultyColor(val)}`;
            }
        };

        setText('calc-nps', calc.nps.toFixed(2));
        setText('calc-peak', calc.peak.toFixed(2));
        setC('calc-overall', calc.overall);
        setC('calc-stream', calc.stream);
        setC('calc-jumpstream', calc.jumpstream);
        setC('calc-handstream', calc.handstream);
        setC('calc-chordjack', calc.chordjack);
        setC('calc-technical', calc.technical);
        setC('calc-stamina', calc.stamina);
    } else if (chart.difficultyCalc) {
        // Use cached stats if notes aren't loaded (from storage)
        const calc = chart.difficultyCalc;

        // Helper to set Text and Color
        const setC = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = val.toFixed(2);
                el.style.color = getDifficultyColor(val);
                el.style.textShadow = `0 0 10px ${getDifficultyColor(val)}`;
            }
        };

        setText('calc-nps', calc.nps.toFixed(2));
        setText('calc-peak', calc.peak.toFixed(2));
        setC('calc-overall', calc.overall);
        setC('calc-stream', calc.stream);
        setC('calc-jumpstream', calc.jumpstream);
        setC('calc-handstream', calc.handstream);
        setC('calc-chordjack', calc.chordjack);
        setC('calc-technical', calc.technical);
        setC('calc-stamina', calc.stamina);
    }

    // Best Score Display
    const key = `webSM_lb_${songLibrary[selectedSongIndex].meta.title}_${chart.difficulty}`;
    const bsContainer = document.getElementById('ss-best-score-display');
    const jGrid = document.getElementById('bs-judge-grid');

    try {
        bsContainer.style.display = 'block'; // Always show
        if (jGrid) jGrid.innerHTML = ''; // Clear judges

        const saved = localStorage.getItem(key);
        let lb = [];
        if (saved) {
            const parsed = JSON.parse(saved);
            lb = Array.isArray(parsed) ? parsed : [parsed];
        }

        // Filter out Invalid scores (Negative Acc, Fail, Invalid Fctype)
        lb = lb.filter(s => {
            const acc = parseFloat(s.acc);
            const fc = s.clearType || (s.judgments ? getClearType(s.judgments) : "");
            return acc >= 0 && fc !== "Failed" && fc !== "Invalid";
        });

        // Sort by robust logic (matches leaderboard)
        lb.sort(sortLeaderboard);

        if (lb.length > 0) {
            // Rate-aware Best Score Logic
            // 1. Exact Match Current Rate
            const currentRate = (modConfig && modConfig.rate) ? modConfig.rate : 1.0;
            let bestScore = lb.find(s => Math.abs((s.rate || 1.0) - currentRate) < 0.001);

            // 2. Fallback to Closest Rate
            if (!bestScore) {
                let closest = null;
                let minDiff = 999;
                lb.forEach(s => {
                    const r = s.rate || 1.0;
                    const diff = Math.abs(r - currentRate);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = s;
                    }
                });
                bestScore = closest;
            }

            // Fallback to top if still nothing (shouldn't happen if lb.length > 0)
            const top = bestScore || lb[0];

            // Grade & Score
            const gEl = document.getElementById('bs-grade');
            const jBadge = `<span style="font-size:0.4em; color:#aaa; margin-left:8px; border:1px solid #444; padding:2px 4px; border-radius:3px; vertical-align:middle; position: relative; top: -4px;">J${top.judgeDiff || 4}</span>`;
            gEl.innerHTML = top.grade + jBadge;
            gEl.style.color = GRADE_COLORS[top.grade] || '#fff';

            // Display DP Score
            let displayScore = top.dpScore ? parseFloat(top.dpScore).toFixed(2) : "0.00";
            if (Math.abs((top.rate || 1.0) - currentRate) > 0.001) {
                displayScore += ` (${(top.rate || 1.0).toFixed(2)}x)`;
            }
            // setText handled below with tooltip logic

            // Info Col
            // Acc Formatting: >= 99.7 used 4 decimals, else 2
            const accVal = parseFloat(top.acc);
            const accText = accVal >= 99.7 ? accVal.toFixed(4) : accVal.toFixed(2);

            // Set Text
            const bsScoreEl = document.getElementById('bs-score');
            const bsAccEl = document.getElementById('bs-acc');

            const origScoreTxt = displayScore;
            const origAccTxt = accText + "%";

            bsScoreEl.innerText = origScoreTxt;
            bsAccEl.innerText = origAccTxt;

            // Cleanup old listeners (Clone to wipe)
            const newScoreEl = bsScoreEl.cloneNode(true);
            const newAccEl = bsAccEl.cloneNode(true);
            bsScoreEl.parentNode.replaceChild(newScoreEl, bsScoreEl);
            bsAccEl.parentNode.replaceChild(newAccEl, bsAccEl);

            // J4 Hover Logic
            if (top.j4Dp && top.j4Acc) {
                const j4ScoreTxt = top.j4Dp; // Already fixed 2 decimals? Check definition. 
                const j4AccTxt = top.j4Acc + "%"; // j4Acc is string fixed(4)

                const setHover = (active) => {
                    newScoreEl.innerText = active ? j4ScoreTxt : origScoreTxt;
                    newAccEl.innerText = active ? j4AccTxt : origAccTxt;
                    newScoreEl.style.color = active ? '#88ccff' : '';
                    newAccEl.style.color = active ? '#88ccff' : '';
                };

                newScoreEl.onmouseenter = () => setHover(true);
                newScoreEl.onmouseleave = () => setHover(false);
                newAccEl.onmouseenter = () => setHover(true);
                newAccEl.onmouseleave = () => setHover(false);

                newScoreEl.style.cursor = "pointer";
                newAccEl.style.cursor = "pointer";
                newScoreEl.title = "Hover to view J4 converted stats";
                newAccEl.title = "Hover to view J4 converted stats";
            } else {
                newScoreEl.style.cursor = "default";
                newAccEl.style.cursor = "default";
                newScoreEl.title = "";
                newAccEl.title = "";
            }

            setText('bs-ssr', (top.ssr || 0).toFixed(2));
            // Use saved FC Type (Fail/Invalid support) or calculate legacy
            const calculatedFC = top.fcType || (top.judgments ? getClearType(top.judgments) : "");
            setText('bs-clear', getClearText(calculatedFC));

            // Apply Color
            if (document.getElementById('bs-clear')) {
                const c = CLEAR_COLORS[calculatedFC] || "#fff";
                document.getElementById('bs-clear').style.color = c;
                document.getElementById('bs-clear').style.textShadow = `0 0 10px ${c}`;
            }

            // Judge Grid
            if (jGrid) {
                const J = top.judgments || {};
                const addJ = (val, color) => {
                    jGrid.innerHTML += `<span style="color:${color}; margin-right:10px; font-weight:bold; font-size:1.1rem; text-shadow:0 0 5px currentColor;">${val || 0}</span>`;
                };
                addJ(J.marvelous, "#a3f7ff");
                addJ(J.perfect, "#ffe600");
                addJ(J.great, "#44ff4b");
                addJ(J.good, "#0099ff");
                addJ(J.bad, "#aa00ff");
                addJ(J.miss, "#ff3333");

            }

        } else {
            // No Scores State
            const gEl = document.getElementById('bs-grade');
            gEl.innerText = "-";
            gEl.style.color = "#fff";
            setText('bs-score', "0.00");
            setText('bs-acc', "0.00%");
            setText('bs-ssr', "0.00");
            setText('bs-clear', "-");
            if (jGrid) jGrid.innerHTML = '<span style="color:#666; font-style:italic;">No scores yet</span>';
        }
    } catch (e) {
        bsContainer.style.display = 'block';
        const gEl = document.getElementById('bs-grade');
        gEl.innerText = "-";
        setText('bs-score', "000,000");
        console.error(e);
    }

    const btn = document.getElementById('start-btn');
    if (btn) {
        btn.disabled = false;
        btn.innerText = "START GAME";
    }

    if (typeof currentSongTab !== 'undefined' && currentSongTab === 'preview') {
        startChartPreview();
    }
}

function calculateDetailedDifficulty(notes) {
    if (!notes || notes.length === 0) return { overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0, nps: 0, peak: 0 };

    // Rate Mod: Scale logic by rate
    let rate = 1.0;
    if (typeof modConfig !== 'undefined' && modConfig.rate) rate = modConfig.rate;

    const validNotes = notes.filter(n => n.type === 'tap' || n.type === 'hold' || n.type === 'roll');
    if (validNotes.length === 0) return { overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0, nps: 0, peak: 0 };

    const rows = [];
    let currentRow = { time: validNotes[0].time, beat: validNotes[0].beat, notes: [] };
    for (let note of validNotes) {
        if (Math.abs(note.time - currentRow.time) < 0.002) { currentRow.notes.push(note); }
        else { rows.push(currentRow); currentRow = { time: note.time, beat: note.beat, notes: [note] }; }
    }
    rows.push(currentRow);
    if (rows.length < 2) return { nps: 0, peak: 0, overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0 };

    let maxNPS = 0;
    const streamStrains = [], jsStrains = [], hsStrains = [], cjStrains = [], techStrains = [];
    // Max Strains for Stamina Calc
    const maxStrains = [];

    const windowSize = 1.0; let windowStart = rows[0].time; let windowIndex = 0;

    // SCALING HELPERS for Snap Complexity
    // 0 = Neutral (4th, 8th), 1 = Binary (16th, 32nd), 2 = Ternary (12th, 24th)
    const getSnapType = (beat) => {
        const b = beat % 1;
        const isSnap = (d) => Math.abs(b * d - Math.round(b * d)) < 0.01;
        if (isSnap(2)) return 0; // 4th (Red), 8th (Blue) -> Common/Neutral
        if (isSnap(4)) return 1; // 16th (Yellow) -> Binary
        if (isSnap(3)) return 2; // 12th (Purple) -> Ternary
        if (isSnap(8)) return 1; // 32nd (Orange) -> Binary
        if (isSnap(6)) return 2; // 24th (Pink) -> Ternary
        if (isSnap(12)) return 2; // 48th (Cyan) -> Ternary
        return 1; // Everything else (64th etc) treated as Binary variant for now
    };

    const getSnapWeight = (beat) => {
        const b = beat % 1;
        const isSnap = (d) => Math.abs(b * d - Math.round(b * d)) < 0.01;

        if (isSnap(4)) return 1.0; // 4th, 8th, 16th (Common)
        if (isSnap(3)) return 1.1; // 12th
        if (isSnap(6)) return 1.2; // 24th
        if (isSnap(8)) return 1.3; // 32nd
        if (isSnap(12)) return 1.4; // 48th
        if (isSnap(16)) return 1.5; // 64th
        return 1.2; // Uncommon
    };

    while (windowIndex < rows.length) {
        let noteCount = 0, chordCount = 0, handCount = 0, jackCount = 0;
        const colCounts = [0, 0, 0, 0];
        const buckets = new Set();

        let complexitySum = 0;
        let hasBinary = false;
        let hasTernary = false;

        let i = windowIndex;
        while (i < rows.length && rows[i].time < windowStart + windowSize) {
            const row = rows[i];
            const rowNotes = row.notes;
            noteCount += rowNotes.length;
            rowNotes.forEach(n => {
                if (n.col >= 0 && n.col < 4) colCounts[n.col]++;
                buckets.add(Math.floor(n.time * 100)); // 10ms buckets
            });

            // Complexity Acummulation
            complexitySum += getSnapWeight(row.beat || 0);

            // Mixed Snap Detection
            const type = getSnapType(row.beat || 0);
            if (type === 1) hasBinary = true;
            if (type === 2) hasTernary = true;

            if (rowNotes.length >= 2) chordCount++;
            if (rowNotes.length >= 3) handCount++;
            if (i > 0) {
                const prevCols = rows[i - 1].notes.map(n => n.col);
                const currCols = rowNotes.map(n => n.col);
                if (currCols.some(c => prevCols.includes(c))) jackCount++;
            }
            i++;
        }

        const nps = noteCount / windowSize;
        if (nps > maxNPS) maxNPS = nps;

        // Pattern Heuristics
        let vibroFactor = 1.0;
        let quadFactor = 1.0;
        let rollFactor = 1.0;
        let quantizedDensity = 0;
        let concentration = 0;

        const rowCount = i - windowIndex;
        const jackFrequency = rowCount > 0 ? jackCount / rowCount : 0;
        const chordFrequency = rowCount > 0 ? chordCount / rowCount : 0;

        if (nps > 15) {
            // Vibro
            const sortedCounts = [...colCounts].sort((a, b) => b - a);
            const top2 = sortedCounts[0] + sortedCounts[1];
            concentration = noteCount > 0 ? top2 / noteCount : 0;
            if (concentration > 0.8) {
                vibroFactor = Math.max(0.6, 1.0 - (concentration - 0.8) * 2.0);
            }

            // Quadspam detection: Dense notes in few buckets
            const effectiveRows = buckets.size || 1;
            quantizedDensity = noteCount / effectiveRows;
            if (quantizedDensity > 2.5) {
                // Refinement: If it's heavy jacks (chordjack), we don't want to penalize as hard
                // because it's actually difficult, not just vibro/quadspam.
                const jackGrace = Math.min(0.3, jackFrequency * 0.5);
                quadFactor = Math.max(0.4, 1.0 - (quantizedDensity - 2.5) * (1.0 - jackGrace));
            }

            // Roll/Speed Cap
            if (nps > 30 && quantizedDensity < 1.6) {
                rollFactor = 30.0 / nps;
            }
        }

        const penalty = Math.min(vibroFactor, quadFactor, rollFactor);
        const penalizedNPS = nps * penalty;


        // Snap Complexity Factor (Average of row weights)
        const avgComplexity = rowCount > 0 ? complexitySum / rowCount : 1.0;

        // Mixed Snap Bonus
        // If window contains both 16th-family and 12th-family notes, boost Tech
        const mixedBonus = (hasBinary && hasTernary) ? 1.15 : 1.0;

        let sStr = penalizedNPS * rate * avgComplexity; if (chordCount > 0) sStr *= 0.8; streamStrains.push(sStr);
        let sJs = penalizedNPS * rate; const jumpRatio = noteCount > 0 ? (chordCount / (noteCount / 2)) : 0;
        if (jumpRatio < 0.2) sJs *= 0.2; else sJs *= (0.8 + jumpRatio * 0.4); jsStrains.push(sJs);
        let sHs = 0; if (handCount > 0) { sHs = (penalizedNPS * rate) * 0.9 + (handCount * 1.5); } hsStrains.push(sHs);

        let sCj = penalizedNPS * rate * chordFrequency * jackFrequency;

        // Tech with Snap Complexity & Mixed Bonus
        let sTech = penalizedNPS * rate * (0.4 + jackFrequency) * avgComplexity * mixedBonus;

        // Chordjack Bonus: Reward high-NPS dense chordjacks (35+ NPS)
        if (nps > 30) {
            const cjDensityBonus = Math.max(1.0, 1.0 + (nps - 30) * 0.01 * chordFrequency * jackFrequency);
            sCj *= cjDensityBonus;
            sTech *= (1 + (cjDensityBonus - 1) * 0.5); // Tech also gets half bonus
        }

        cjStrains.push(sCj);
        techStrains.push(sTech);

        // Max Strain for Stamina
        maxStrains.push(Math.max(sStr, sJs, sHs, sCj, sTech));

        windowStart += 0.5;
        while (windowIndex < rows.length && rows[windowIndex].time < windowStart) windowIndex++;
    }

    const aggregate = (arr) => {
        if (arr.length === 0) return 0; arr.sort((a, b) => b - a);
        let weightedSum = 0, weightTotal = 0; const topCount = Math.min(arr.length, 16);
        for (let i = 0; i < topCount; i++) { const w = Math.pow(0.9, i); weightedSum += arr[i] * w; weightTotal += w; }
        if (weightTotal === 0) return 0; return weightedSum / weightTotal;
    };

    const sStream = aggregate(streamStrains); const sJS = aggregate(jsStrains); const sHS = aggregate(hsStrains);
    const sCJ = aggregate(cjStrains); const sTech = aggregate(techStrains);

    const duration = (rows[rows.length - 1].time - rows[0].time) / rate;

    // New Stamina Logic
    // 1. Find Peak Intensity
    let staminaPeak = 0;
    if (maxStrains.length > 0) {
        // Use 95th percentile or something robust? Or just max?
        // Let's use aggregate of top few to ignore spikes.
        // Actually, aggregate(maxStrains) is a decent "Peak" proxy.
        staminaPeak = aggregate([...maxStrains]);
    }

    // 2. Filter Active Windows (e.g. > 50% of peak)
    // Using a lower threshold helps capture the "body" of the song.
    const activeStrains = maxStrains.filter(s => s > staminaPeak * 0.5);

    // 3. Average Density of Active Section
    const avgDense = activeStrains.length > 0 ? activeStrains.reduce((a, b) => a + b, 0) / activeStrains.length : 0;

    // 4. Duration of Active Section (Each window step is 0.5s)
    const durationDense = activeStrains.length * 0.5;

    // 5. Stamina Calculation
    // Base tied to avgDense (so it's "tied to highest skillsets")
    // Logarithmic bonus for duration. Start bonus at ~30s?
    // If duration < 30s, multiplier ~1.0? 
    // Formula: avgDense * (1 + 0.4 * log10(max(1, duration / 30)))
    // If 30s: log(1) = 0 -> Multiplier 1.0. Stamina = avgDense.
    // If 300s: log(10) = 1 -> Multiplier 1.4.
    let sStamina = avgDense * (1 + 0.4 * Math.log10(Math.max(1, durationDense / 30)));

    const scale = (val) => {
        // 1. Calculate original value (Standard Saturation)
        const original = 45 * (1 - Math.exp(-Math.pow(val / 25.5, 2.5)));

        // 2. Define Cutoff for Tail Logic (Rating 30 approx val 26.5)
        const cutoff = 30;
        if (original <= cutoff) return original;

        // 3. Linear Projection for Tail (Differentiation)
        // Instead of using the saturated 'original', we project 'val' linearly from the cutoff point.
        // val 26.5 -> 30. Slope 0.8 ensures good separation.
        const tailInput = 30 + (val - 26.5) * 0.8;

        // 4. Soft Cap Convergence
        // We want to converge to (40 * Rate).
        const softCapVal = 40 * rate;

        // If Rate > 2.0, we basically remove the cap / make it very soft?
        // User asked "remove hard cap", but also "converge to 40 soft cap".
        // The Soft Cap formula naturally scales.
        // We'll use a saturated rise to the Soft Cap.

        const limit = Math.max(1, softCapVal - cutoff);
        const input = tailInput - cutoff;

        // Asymptotic decay to limit: Limit * (1 - exp(-x / stretch))
        // Stretch factor determines how slowly we converge (higher = more linear space).
        // limit * 1.5 gives a very smooth approach.
        const mapped = cutoff + limit * (1 - Math.exp(-input / (limit * 1.5)));

        // 5. Hard Cap Check
        const hardCap = 60 * rate;
        if (rate > 2.0) return mapped;
        return Math.min(mapped, hardCap);
    };
    let result = {
        nps: (validNotes.length / duration), peak: maxNPS * rate, stream: scale(sStream), jumpstream: scale(sJS),
        handstream: scale(sHS), chordjack: scale(sCJ), technical: scale(sTech), stamina: scale(sStamina)
    };
    const skills = [result.stream, result.jumpstream, result.handstream, result.chordjack, result.technical, result.stamina];
    skills.sort((a, b) => b - a);
    let topSkills = skills.slice(0, 3);
    // Conditional S3: If 3rd skill is too low (< 90% of 2nd), drop it.
    if (topSkills.length === 3 && topSkills[2] < topSkills[1] * 0.9) {
        topSkills.pop();
    }
    const sumSq = topSkills.reduce((a, b) => a + (b * b), 0);
    const sum = topSkills.reduce((a, b) => a + b, 0);
    let overall = sum > 0 ? sumSq / sum : 0;
    result.overall = overall;
    return result;
}


let currentPreviewAudio = null;

// ** START AUTOPLAY **
function startAutoplay() {
    window.isAutoplayLaunch = true;
    // Ensure we have a song selected
    if (selectedSongIndex === -1 || selectedChartIndex === -1) {
        alert("Please select a song and chart first.");
        return;
    }
    startGameFromMenu();
}

function startReplay(scoreData, song, chart) {
    if (!scoreData || !scoreData.replayLog) {
        alert("No replay data available for this score.");
        return;
    }

    // Restore Modifiers for Replay
    if (scoreData.rate) {
        if (typeof modConfig === 'undefined') window.modConfig = {};
        modConfig.rate = scoreData.rate;
        // User config might need temp override or we just rely on modConfig having priority
        // Modifiers.js usually reads modConfig.
    }

    // Set Global Flags
    window.isReplayLaunch = true;
    window.replayData = scoreData.replayLog;

    // Use specific chart
    selectedSongIndex = songLibrary.indexOf(song);
    selectedChartIndex = song.charts.indexOf(chart);
    startGameFromMenu();
} window.startReplay = startReplay;

function startSyncCalibration() {
    // 0. Check if songLibrary[0] is the sync song
    if (!songLibrary || songLibrary.length === 0 || (!songLibrary[0].meta.title.includes("Sync") && songLibrary[0].meta.title !== "Sync (Missing)")) {
        if (songLibrary[0] && songLibrary[0].meta.title === "Sync (Missing)") {
            alert("Sync song not loaded. Check ./sync/ folder.");
            return;
        }
        // If 0 isn't sync, maybe we search?
        // But loadLocalSong puts it at 0.
        // If it's not there, we can't calibrate.
        alert("Sync song not found at index 0.");
        return;
    }

    // 0. Save original modifiers for restoration
    window.originalSyncMods = {
        downScroll: userConfig.downScroll,
        scrollTime: userConfig.scrollTime,
        failMode: modConfig ? modConfig.failMode : 'on',
        scrollDir: modConfig ? modConfig.scrollDirection : 'down',
        speedType: userConfig.modifiers ? userConfig.modifiers.speedType : 'X',
        speedValue: userConfig.modifiers ? userConfig.modifiers.speedValue : 1.0
    };

    // 1. Set Mode
    window.isSyncMode = true;
    window.syncBuffer = [];
    window.lastHitOffset = null; // Reset for new session

    // 2. Enforce Modifiers (C400, Fail Off, Upscroll)
    if (typeof modConfig === 'undefined') window.modConfig = {};
    modConfig.scrollSpeed = 400; // C400
    modConfig.scrollDirection = 'up'; // Upscroll
    modConfig.failMode = 'off'; // Fail Off
    modConfig.rate = 1.0; // Enforce 1.0x rate
    modConfig.pitchShift = true; // Default

    // Update User Config to match for renderer
    userConfig.downScroll = false;
    userConfig.scrollTime = 400;

    // CRITICAL: Set modifiers for updateScrollSpeed
    if (!userConfig.modifiers) userConfig.modifiers = {};
    userConfig.modifiers.speedType = 'C';
    userConfig.modifiers.speedValue = 400;

    // 3. Hide UI Elements (Manual toggle or class)
    // We will restore them in quitGame()
    // Comprehensive list based on index.html structure:
    const hideIds = [
        'hud-top-left',       // Diff, BPM, Rate
        'judgment-tracker',   // Tally
        'live-grade',         // Grade
        'hud-right-panel',    // NPS, Life (Health display)
        'hud-acc-box',        // Accuracy Box (Accuracy%)
        'combo',              // Combo
        'npsGraph',           // NPS Graph
        'hud-tracker',        // Target Tracker
        'error-bar-container',// Error Bar
        'progress-container', // Progress Bar
        'hud-song-info',       // Title/Artist
        'hud-fps-counter'     // FPS (Optional, but user said "hide UI")
    ];
    hideIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.visibility = 'hidden';
    });

    // 4. Select Song
    selectedSongIndex = 0;
    selectedChartIndex = 0;

    // 5. Close Settings
    const modModal = document.getElementById('modifiers-modal');
    if (modModal) modModal.style.display = 'none';

    // 6. Start
    startGameFromMenu();

    // 7. Initialize Instruction Text
    let instr = document.getElementById('sync-instruction');
    if (!instr) {
        instr = document.createElement('div');
        instr.id = 'sync-instruction';
        instr.style.position = 'absolute';
        instr.style.top = '40%';
        instr.style.left = '50%';
        instr.style.transform = 'translate(-50%, -50%)';
        instr.style.color = '#fff';
        instr.style.fontSize = '2rem';
        instr.style.fontFamily = "'Mochiy Pop One', sans-serif";
        instr.style.textAlign = 'center';
        instr.style.opacity = '0';
        instr.style.pointerEvents = 'none';
        instr.style.zIndex = '9999';
        instr.style.textShadow = '0 0 10px rgba(0,229,255,0.8)';
        instr.innerText = 'Keep tapping to the beat';
        document.body.appendChild(instr);
    }
} window.startSyncCalibration = startSyncCalibration;

// ** START GAME **
async function startGameFromMenu() {
    if (selectedSongIndex === -1 || selectedChartIndex === -1) return;

    // Stop Audio Preview
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    if (previewLoopId) cancelAnimationFrame(previewLoopId);
    updatePlayBtn(false);

    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];

    // Check if song has note data (not a restored persistence stub)
    if (!chart.notes && !song.audioBlob) {
        alert("This song is a restored metadata entry. Please re-import the file to play.");
        return;
    }

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    if (song.audioBlob) {
        document.getElementById('loading-status').style.display = 'flex';
        setText('loading-text', "Loading Chart...");
        // Allow UI to paint
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 50));

        try {
            const ab = await song.audioBlob.arrayBuffer();
            const decoded = await audioCtx.decodeAudioData(ab);
            audioBuffer = decoded; // Set global buffer

            // Create URL for Audio Element (Pitch Preservation)
            const audioUrl = URL.createObjectURL(song.audioBlob);

            document.getElementById('loading-status').style.display = 'none';

            // Calc for stats
            let finalNotes = chart.notes;

            // --- APPLY LINEAR TRANSFORMS (Turn, Remove, Insert) ---
            if (typeof applyChartTransforms === 'function') {
                finalNotes = applyChartTransforms(chart.notes);
            }

            const difficultyCalc = calculateDetailedDifficulty(finalNotes);

            // Pass modified chart clone to initGame
            // We clone chart to avoid mutating the library version permanently? 
            // Actually chart.notes is referenced. applyChartTransforms should return a NEW array.
            const gameChart = { ...chart, notes: finalNotes };

            initGame(gameChart, decoded, song.meta, difficultyCalc, audioUrl);

            // Resets for Sync Mode Enhancements
            if (window.isSyncMode) {
                window.syncBatch = [];
                // We keep validBatches across retries to collect more data?
                // Actually, let's keep validBatches but clear current batch.
                // Or if the user retries, they might want a fresh start.
                // Let's keep validBatches until they quit.
                if (typeof window.validBatches === 'undefined') window.validBatches = [];
                const instr = document.getElementById('sync-instruction');
                if (instr) instr.style.opacity = '0';
            }
        } catch (e) {
            console.error("Error decoding audio: " + e.message);
            document.getElementById('bs-grade').className = 'ss-bs-grade';
        }

        // Refresh Active Tab Content
        if (currentSongTab === 'scores') {
            renderFullLeaderboard();
        } else if (currentSongTab === 'preview') {
            startChartPreview();
        }
    } else {
        console.error("This song has no audio loaded.");
    }
}

/* =========================================
   MATH & SCORING
   ========================================= */

function calculateAccuracy(offsetMs, judgeOverride) {
    const absOffset = Math.abs(offsetMs);
    if (typeof math === 'undefined' || !math.erf) return 0;

    let diff = judgeOverride !== undefined ? judgeOverride : (userConfig.judgeDifficulty || 4);
    diff = Math.max(4, Math.min(9, diff));

    // Linear Fraction (same as Hit Windows)
    const linearFrac = (10 - diff) / 6;

    // Power Curve for Scoring (User Request)
    const scaler = Math.pow(linearFrac, 0.75);

    const t5 = 5 * scaler;
    const t65 = 65 * scaler;
    const t180 = 180 * scaler;
    const dev = 22.7 * scaler; // Scale deviation
    const rangeBad = 115 * scaler; // Scale linear bad range (180-65=115)

    if (absOffset <= t5) return 100;
    else if (absOffset <= t65) return 100 * math.erf((t65 - absOffset) / dev);
    else if (absOffset <= t180) return -275 * (absOffset - t65) / rangeBad;
    else return -275;
}

function getGrade(percentage, scoreOverride, j) {
    const sys = modConfig.scoringSystem;
    if (gameState.failed) return (sys === 'ddr') ? "E" : "F";
    const score = (scoreOverride !== undefined) ? scoreOverride : getCosmeticScore();

    if (sys === 'wife3') {
        if (percentage >= 99.9935) return "AAAAA";
        if (percentage >= 99.955) return "AAAA";
        if (percentage >= 99.7) return "AAA";
        if (percentage >= 93) return "AA";
        if (percentage >= 80) return "A";
        if (percentage >= 70) return "B";
        if (percentage >= 60) return "C";
        return "D";
    }
    if (sys === 'itg') {
        if (percentage >= 100) return "****";
        if (percentage >= 99) return "***";
        if (percentage >= 98) return "**";
        if (percentage >= 96) return "*";
        if (percentage >= 94) return "S+";
        if (percentage >= 92) return "S";
        if (percentage >= 89) return "S-";
        if (percentage >= 86) return "A+";
        if (percentage >= 83) return "A";
        if (percentage >= 80) return "A-";
        if (percentage >= 76) return "B+";
        if (percentage >= 72) return "B";
        if (percentage >= 68) return "B-";
        if (percentage >= 64) return "C+";
        if (percentage >= 60) return "C";
        if (percentage >= 55) return "C-";
        return "D";
    }
    if (sys === 'ddr') {
        if (score >= 990000) return "AAA";
        if (score >= 950000) return "AA+";
        if (score >= 900000) return "AA";
        if (score >= 890000) return "AA-";
        if (score >= 850000) return "A+";
        if (score >= 800000) return "A";
        if (score >= 790000) return "A-";
        if (score >= 750000) return "B+";
        if (score >= 700000) return "B";
        if (score >= 690000) return "B-";
        if (score >= 650000) return "C+";
        if (score >= 600000) return "C";
        if (score >= 590000) return "C-";
        if (score >= 550000) return "D+";
        return "D";
    }
    if (sys === 'sm') {
        if (percentage >= 100) {
            const tapSum = j.marvelous + j.perfect + j.great + j.good + j.bad + j.miss;
            if (j.marvelous === tapSum) return "AAAA";
            return "AAA";
        }
        if (percentage >= 93) return "AA";
        if (percentage >= 80) return "A";
        if (percentage >= 70) return "B";
        if (percentage >= 60) return "C";
        return "D";
    }
    if (sys === 'osu') {
        if (percentage >= 100) return "SS";
        if (percentage >= 95) return "S";
        if (percentage >= 90) return "A";
        if (percentage >= 80) return "B";
        if (percentage >= 70) return "C";
        return "D";
    }
    return "D";
}
function getGradeColor(grade) { return GRADE_COLORS[grade] || "#888"; }

function calculateSSR(difficulty, accuracyDec) {
    if (accuracyDec < 0) return 0; // Clamp negative accuracy
    if (accuracyDec < 0.93) return difficulty * Math.pow(accuracyDec / 0.93, 6);
    else return difficulty * (1 + 15 * Math.pow(accuracyDec - 0.93, 2));
}

function getClearType(overrideJ, overrideFailed, overrideAcc, overridePaused) {
    const isFailed = overrideFailed !== undefined ? overrideFailed : gameState.failed;
    if (isFailed) return "Failed";

    const acc = overrideAcc !== undefined ? overrideAcc : (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed || 1));
    const paused = overridePaused !== undefined ? overridePaused : gameState.hasPausedDuringPlay;

    if (acc < 83 || paused) return "Invalid";

    const j = overrideJ || gameState.judgments;
    const breaks = j.good + j.bad + j.miss + j.ng;
    const tapSum = j.marvelous + j.perfect + j.great + j.good + j.bad + j.miss;
    if (j.marvelous === tapSum && breaks === 0 && j.perfect === 0) return "MFC";
    if (j.perfect === 1 && (j.marvelous + j.perfect === tapSum) && breaks === 0) return "WF";
    if (j.perfect < 10 && (j.marvelous + j.perfect === tapSum) && breaks === 0) return "SDP";
    if ((j.marvelous + j.perfect === tapSum) && breaks === 0) return "PFC";
    if (j.great === 1 && (j.marvelous + j.perfect + j.great === tapSum) && breaks === 0) return "BF";
    if (j.great < 10 && (j.marvelous + j.perfect + j.great === tapSum) && breaks === 0) return "SDG";
    if (breaks === 0) return "FC";
    if (breaks === 1) return "MF";
    if (breaks < 10) return "SDCB";
    return "Clear";
}

function updateScoreDisplay() {
    let acc = 0;
    const count = gameState.totalNotesHitOrMissed || 1;
    const sys = modConfig.scoringSystem;
    const j = gameState.judgments;

    if (gameState.totalNotesHitOrMissed > 0) {
        if (sys === 'wife3') {
            acc = (gameState.accumulatedAccuracyPoints / count) / 100;
        } else if (sys === 'itg') {
            const points = j.marvelous * 5 + j.perfect * 4 + j.great * 2 + j.good * 0 + j.bad * -6 + j.miss * -12;
            acc = points / (count * 5);
        } else if (sys === 'ddr') {
            const points = j.marvelous * 3 + j.perfect * 2 + j.great * 1;
            acc = points / (count * 3);
        } else if (sys === 'sm') {
            const points = (j.marvelous + j.perfect) * 2 + j.great * 1 + j.good * 0 + j.bad * -4 + (j.miss + j.ng) * -8;
            acc = points / (count * 2);
        } else if (sys === 'osu') {
            const points = 3 * (j.marvelous + j.perfect) + 2 * j.great + 1 * j.good + 0.5 * j.bad;
            acc = points / (count * 3);
        }
    }
    const displayScore = getCosmeticScore();
    const displayAccPercent = (acc * 100).toFixed(4);
    const dpPoints = (acc * (gameState.totalNotesInChart * 2)).toFixed(2);

    setText('accuracy', displayAccPercent + "%");
    // Technical DP removed from gameplay HUD per user request
    setText('hud-dp', displayScore.toLocaleString());

    if (modConfig.accuracyAttack !== 'off' && gameState.totalNotesHitOrMissed > 0) {
        const target = modConfig.targetTrackerVal / 100;
        if (modConfig.accuracyAttack === 'standard') {
            if (acc < target) triggerFail();
        } else if (modConfig.accuracyAttack === 'max') {
            const remainingNotes = gameState.totalNotesInChart - gameState.totalNotesHitOrMissed;
            const maxPossiblePoints = gameState.accumulatedAccuracyPoints + (remainingNotes * 100);
            const maxPossibleAcc = (maxPossiblePoints / (gameState.totalNotesInChart * 100));

            if (maxPossibleAcc < target - 0.00001) { // Floating point safety
                triggerFail();
            }
        }
    }

    let comboEl = uiCache['combo'];
    if (!comboEl) { comboEl = document.getElementById('combo'); uiCache['combo'] = comboEl; }

    if (comboEl) {
        if (gameState.combo > 0) {
            comboEl.style.visibility = 'visible';
            comboEl.innerText = gameState.combo;

            // Glow Colors
            const total = gameState.totalNotesInChart || 1;
            const pct = gameState.combo / total;
            const J = gameState.judgments;

            let color = "#fff"; // Normal: White
            let shadow = "0 0 10px rgba(255,255,255,0.5)"; // White Glow

            if (pct > 0.25) {
                // MFC: No Perf, Great, Good, Bad, Miss
                // PFC: No Great, Good, Bad, Miss
                // FC: No Good, Bad, Miss (and NG?) - Usually FC implies no combo breaks.
                // Assuming combo > 0 implies currently in combo, but implicit "Full Combo" usually means *since start*.
                // "currently holding a Full Combo" implies no breaks *so far*.

                // Check "Missed So Far"
                const hasMiss = (J.miss + J.bad + J.good + J.ng) > 0; // Good breaks combo in some modes? Usually Good is "FC" but depends. 
                // User said "FC (no Good+Bad+Miss)". So Good breaks FC.

                const hasGreat = J.great > 0;
                const hasPerf = J.perfect > 0;

                if (!hasMiss) {
                    if (!hasGreat && !hasPerf) {
                        // MFC
                        color = CLEAR_COLORS.MFC;
                        shadow = `0 0 10px ${CLEAR_COLORS.MFC}cc, 0 0 20px ${CLEAR_COLORS.MFC}80`;
                    } else if (!hasGreat) {
                        // PFC
                        color = CLEAR_COLORS.PFC;
                        shadow = `0 0 10px ${CLEAR_COLORS.PFC}cc, 0 0 20px ${CLEAR_COLORS.PFC}80`;
                    } else {
                        // FC
                        color = CLEAR_COLORS.FC;
                        shadow = `0 0 10px ${CLEAR_COLORS.FC}cc, 0 0 20px ${CLEAR_COLORS.FC}80`;
                    }
                }
            }

            if (comboEl._lastColor !== color) { comboEl.style.color = color; comboEl._lastColor = color; }
            if (comboEl._lastShadow !== shadow) { comboEl.style.textShadow = shadow; comboEl._lastShadow = shadow; }

        } else {
            comboEl.style.visibility = 'hidden';
        }
    }

    setText('life-percent', gameState.life.toFixed(1) + "%");

    const lifeContainer = document.getElementById('life-container');
    const flareInd = document.getElementById('flare-indicator');
    if (lifeContainer) {
        // Clear previous mode classes
        lifeContainer.classList.remove('life-bar-life4', 'life-bar-risky', 'life-bar-flare-ex', 'life-bar-flare-neo');

        if (modConfig.lifeSystem === 'life4') {
            lifeContainer.classList.add('life-bar-life4');
            const bars = Math.ceil(gameState.life / 25);
            setText('life-percent', bars + " BARS");
        } else if (modConfig.lifeSystem === 'risky') {
            lifeContainer.classList.add('life-bar-risky');
            if (flareInd) {
                flareInd.innerText = "HAZARD";
                flareInd.style.display = 'block';
            }
            setText('life-percent', ""); // Clear percentage for Hazard
        } else if (modConfig.lifeSystem === 'flare') {
            const level = modConfig.flareLevel || 'IX';
            if (level === 'EX') lifeContainer.classList.add('life-bar-flare-ex');
            else if (level === 'NEO') lifeContainer.classList.add('life-bar-flare-neo');

            if (flareInd) {
                flareInd.innerText = "FLARE " + level;
                flareInd.style.display = 'block';
            }
        } else {
            if (flareInd) flareInd.style.display = 'none';
        }
    }

    let lifeEl = uiCache['life-bar-fill'];
    if (!lifeEl) { lifeEl = document.getElementById('life-bar-fill'); uiCache['life-bar-fill'] = lifeEl; }
    if (lifeEl) {
        lifeEl.style.height = gameState.life + "%";

        // Flare Gradations
        if (modConfig.lifeSystem === 'flare') {
            const level = modConfig.flareLevel || 'IX';
            const flareMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9 };
            if (level === 'EX' || level === 'NEO') {
                lifeEl.style.background = '#ff0000';
            } else {
                const step = flareMap[level] || 9;
                const saturation = (step / 9) * 100;
                const lightness = 100 - (step / 9) * 50;
                lifeEl.style.background = `hsl(0, ${saturation}%, ${lightness}%)`;
            }
        } else {
            // Restore default gradient if not flare
            lifeEl.style.background = 'linear-gradient(to top, #ff3333, #ffff00, #00ff00)';
        }
    }

    const grade = getGrade(acc * 100, displayScore, j);
    let gEl = uiCache['live-grade'];
    if (!gEl) { gEl = document.getElementById('live-grade'); uiCache['live-grade'] = gEl; }
    if (gEl) { gEl.innerText = grade; gEl.style.color = getGradeColor(grade); }
}

function updateJudgmentTracker() {
    setText('count-marvelous', gameState.judgments.marvelous);
    setText('count-perfect', gameState.judgments.perfect);
    setText('count-great', gameState.judgments.great);
    setText('count-good', gameState.judgments.good);
    setText('count-bad', gameState.judgments.bad);
    setText('count-miss', gameState.judgments.miss);
    setText('count-ok', gameState.judgments.ok);
    setText('count-ng', gameState.judgments.ng);
}

function triggerFail() {
    if (userConfig.failMode === 'off') return;
    gameState.failed = true;
    gameState.isPlaying = false;

    // Stop Audio (Vinyl)
    if (audioCtx.state === 'running') audioCtx.suspend();
    // Stop Audio (Stretch)
    if (gameState.audioEl) gameState.audioEl.pause();

    document.getElementById('failed-overlay').style.display = 'flex';
    // Trigger reflow or use RAF to ensure transition happens
    requestAnimationFrame(() => {
        document.getElementById('failed-overlay').classList.add('visible');
    });

    setTimeout(() => {
        document.getElementById('failed-overlay').classList.remove('visible');
        document.getElementById('failed-overlay').style.display = 'none';
        saveScore();
        showResults();
    }, 2500); // 2s fade + 0.5s hold
}

function triggerJudgement(note, offsetMs, isMiss = false, currentTime) {
    if (gameState.failed) return;
    const absOffset = Math.abs(offsetMs);
    let judgeText = ""; let judgeClass = ""; let breaksCombo = false; let scoreAdd = 0; let lifeChange = 0;

    // Life Scaling Logic
    const lifeDiff = userConfig.lifeDifficulty || 4;
    // Higher diff = More Log, Less Gain
    // Loss Mult: 1 (diff 4), +0.2 per level. 7 -> 1.6x, 1 -> 0.4x
    // Gain Mult: 1 (diff 4), -0.1 per level. 7 -> 0.7x, 1 -> 1.3x
    const lossMult = Math.max(0.1, 1.0 + (lifeDiff - 4) * 0.2);
    const gainMult = Math.max(0.1, 1.0 - (lifeDiff - 4) * 0.1);

    if (!isMiss && note.type !== 'mine') {
        gameState.hitSum += offsetMs;
        gameState.hitCount++;
        gameState.hitOffsets.push(offsetMs);
        gameState.recentHits.push({ offset: offsetMs, time: currentTime * 1000 });

        // Sync Mode: Real-time accumulation
        if (window.isSyncMode) {
            // New Batching Logic
            if (typeof window.syncBatch === 'undefined') window.syncBatch = [];
            window.syncBatch.push(offsetMs);

            if (window.syncBatch.length >= 24) {
                const sd = calculateSD(window.syncBatch);
                const mean = window.syncBatch.reduce((a, b) => a + b, 0) / window.syncBatch.length;

                if (typeof window.validBatches === 'undefined') window.validBatches = [];
                if (typeof window.syncHistory === 'undefined') window.syncHistory = [];

                const isValid = sd <= 30;
                if (isValid) {
                    window.validBatches.push(mean);
                }

                window.syncHistory.push({
                    mean: mean,
                    sd: sd,
                    valid: isValid,
                    time: currentTime * 1000
                });

                window.syncBatch = []; // Clear for next batch
            }

            // Still push to buffer for overall stats if needed, or rely on batches
            window.syncBuffer.push(offsetMs);
            window.lastHitOffset = offsetMs; // Track for overlay
            updateSyncStats();
        }
    }

    if (note.type === 'mine') {
        if (absOffset <= getTimingWindow('mine')) {
            judgeText = "MINE"; judgeClass = "judge-mine"; breaksCombo = true;
            gameState.judgments.mine++;
            gameState.accumulatedAccuracyPoints += -7.0; // Penalty for Mine? Or custom?
            gameState.totalNotesHitOrMissed++;
            lifeChange = -8.0 * lossMult;
            note.processed = true;
            scoreAdd = -500;
        } else { return; } // Not hit
    } else {
        // Taps (and Hold Heads)
        // Auto-Play Hack: If Auto, always Marvelous (offset 0 passed usually)
        if (isMiss) {
            judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++;
            lifeChange = -8.0 * lossMult;
            if (note.type === 'hold' || note.type === 'roll') {
                note.holdState = 'missed'; note.processed = false;
            }
        } else {
            // Hit Logic
            if (absOffset <= getTimingWindow('marvelous')) {
                judgeText = "MARVELOUS"; judgeClass = "judge-marvelous"; breaksCombo = false;
                scoreAdd = 1000;
                gameState.judgments.marvelous++; lifeChange = 1.0 * gainMult;
            }
            else if (absOffset <= getTimingWindow('perfect')) {
                judgeText = "PERFECT"; judgeClass = "judge-perfect"; breaksCombo = false;
                scoreAdd = 900;
                gameState.judgments.perfect++; lifeChange = 0.8 * gainMult;
            }
            else if (absOffset <= getTimingWindow('great')) {
                judgeText = "GREAT"; judgeClass = "judge-great"; breaksCombo = false;
                scoreAdd = 500;
                gameState.judgments.great++; lifeChange = 0.4 * gainMult;
            }
            else if (absOffset <= getTimingWindow('good')) {
                judgeText = "GOOD"; judgeClass = "judge-good"; breaksCombo = true;
                scoreAdd = 200;
                gameState.judgments.good++; lifeChange = 0.0;
            }
            else if (absOffset <= getTimingWindow('bad')) {
                judgeText = "BAD"; judgeClass = "judge-bad"; breaksCombo = true;
                gameState.judgments.bad++; lifeChange = -4.0 * lossMult;
            }
            else {
                // Late Miss (if handled here?) usually handled by isMiss=true call
                judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++; lifeChange = -8.0 * lossMult;
                if (note.type === 'hold' || note.type === 'roll') {
                    note.holdState = 'missed'; note.processed = false;
                }
            }
        }

        // DP / Acc Points Calculation
        // New Logic: Use calculateAccuracy(offset) for curve-based scoring (0-100 per note)
        // Miss/Bad are negative in calculateAccuracy, but we accumulate them directly.
        // NOTE: calculateAccuracy handles offset logic.

        let accScore = 0;
        if (gameState.isAutoplay) {
            accScore = -75000;
        } else if (isMiss && note.type !== 'mine') {
            accScore = calculateAccuracy(1000);
        } else if (note.type === 'mine') {
            accScore = -350; // Corrected mine penalty
        } else {
            accScore = calculateAccuracy(offsetMs);
        }

        gameState.accumulatedAccuracyPoints += accScore;
        gameState.totalNotesHitOrMissed++;
        scoreAdd = Math.max(0, scoreAdd); gameState.score += scoreAdd;

        // OSU!MANIA SCORING IMPLEMENTATION
        if (modConfig.scoringSystem === 'osu') {
            const osuValues = {
                "MARVELOUS": { val: 320, bVal: 32, bonus: 2, punish: 0 },
                "PERFECT": { val: 300, bVal: 32, bonus: 1, punish: 0 },
                "GREAT": { val: 200, bVal: 16, bonus: 0, punish: 8 },
                "GOOD": { val: 100, bVal: 8, bonus: 0, punish: 24 },
                "BAD": { val: 50, bVal: 4, bonus: 0, punish: 44 },
                "MISS": { val: 0, bVal: 0, bonus: 0, punish: 100 } // Miss resets bonus
            };
            const v = osuValues[judgeText] || osuValues["MISS"];

            // Update Bonus
            if (judgeText === "MISS") {
                gameState.osuBonus = 0;
            } else {
                gameState.osuBonus = Math.max(0, Math.min(100, gameState.osuBonus + v.bonus - v.punish));
            }

            const totalNotes = gameState.totalNotesInChart || 1;
            const maxScore = 1000000;
            const multiplier = (maxScore * 0.5) / totalNotes;

            const baseNoteScore = multiplier * (v.val / 320);
            const bonusNoteScore = multiplier * (v.bVal * Math.sqrt(gameState.osuBonus) / 320);

            gameState.osuScore += (baseNoteScore + bonusNoteScore);
        }

        if (!isMiss && (note.type === 'hold' || note.type === 'roll')) {
            note.holdState = 'active'; note.processed = false;

            // Fix: Use correct Song Time for initialization
            const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
            if (gameState.mode === 'stretch' && gameState.audioEl) {
                note.lastPressTime = gameState.audioEl.currentTime;
            } else {
                note.lastPressTime = (audioCtx.currentTime - gameState.startTime) * rate;
            }
        } else if (!isMiss) { note.processed = true; }

        gameState.detailedHits.push({
            time: currentTime,
            offset: isMiss ? null : offsetMs,
            judge: judgeText
        });
    }

    const currentAcc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / gameState.totalNotesHitOrMissed) : 100;
    gameState.accuracyHistory.push({ time: currentTime, acc: currentAcc, grade: getGrade(currentAcc) });

    if (breaksCombo) gameState.combo = 0; else if (note.type !== 'mine') gameState.combo++;
    if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;

    if (modConfig.lifeSystem === 'normal') {
        gameState.life = Math.max(0, Math.min(100, gameState.life + lifeChange));
    } else if (modConfig.lifeSystem === 'life4') {
        if (breaksCombo) {
            gameState.lifeBreaks++;
            gameState.life = Math.max(0, 100 - (gameState.lifeBreaks * 25));
            if (gameState.lifeBreaks >= 4) triggerFail();
        }
    } else if (modConfig.lifeSystem === 'risky') {
        if (breaksCombo) {
            gameState.life = 0;
            gameState.lifeBreaks++;
            triggerFail();
        }
    } else if (modConfig.lifeSystem === 'flare') {
        const level = modConfig.flareLevel || 'IX';
        const table = FLARE_DMG[level];
        let dmg = 0;
        if (isMiss) dmg = table.miss;
        else if (note.type === 'mine') dmg = table.mine;
        else {
            const jText = judgeText.toLowerCase();
            dmg = table[jText] || 0;
        }
        gameState.life = Math.max(0, gameState.life - dmg);
        if (gameState.life <= 0) triggerFail();
    }

    gameState.lifeHistory.push({ time: currentTime, val: gameState.life });
    gameState.comboHistory.push({ time: currentTime, val: gameState.combo });

    const jEl = document.getElementById('judgment');
    if (jEl) {
        // New Sprite Logic: Neo Sekai 2x6
        // Columns: 0 (Normal/Early?), 1 (Late?)
        // Rows: Marvelous, Perfect, Great, Good, Bad, Miss
        // We'll use classes to set background-position.
        // Assuming user wants Early/Late distinction.
        // isMiss doesn't have offsets usually, or we treat as Late? Miss is row 6.

        let timingClass = "early";
        if (offsetMs > 0) timingClass = "early"; // Logic check: Note(10) - Input(9) = +1. Early.
        if (offsetMs < 0) timingClass = "late";

        // Correction: if Miss, force it to use the "Late" frame (col 1) as requested.
        if (isMiss) timingClass = "late";

        jEl.className = `${judgeClass} ${timingClass}`;
        jEl.innerText = ""; // Hide text, use sprite

        jEl.style.animation = 'none'; jEl.offsetHeight; jEl.style.animation = 'pulse 0.1s';
    }
    updateJudgmentTracker();
    updateScoreDisplay();

    // TARGET TRACKER UPDATE
    if (gameState.totalNotesHitOrMissed > 0 && modConfig.targetTracker) {
        // DP Differential Logic (Scale 0 -> Total*2)
        // Target DP = (Max Potential DP) * (Target Percent / 100)
        // Max Potential DP = TotalNotes * 2 (as requested)

        const maxPotDP = gameState.totalNotesInChart * 2; // Fixed Total for chart
        // Actually tracker is usually "Notes So Far"?
        // If we want "Current Pace" vs "Target Pace", we use Notes Hit So Far.
        const currentRefMax = gameState.totalNotesHitOrMissed * 2;

        // Current DP (Cumulative)
        // Derived from Acc%: (Acc% / 100) * currentRefMax
        // Acc% is (accumulatedAccuracyPoints / gameState.totalNotesHitOrMissed)
        // So: ((Accum / Count) / 100) * (Count * 2) = (Accum / 100) * 2
        // Wait. accumulatedAccuracyPoints is on 0-100 scale.
        // So Accum/100 is "Raw Score Sum" (0-1 scale).
        // Multiplied by 2 -> "Raw Score Sum" * 2.

        // Simplified: (accumulatedAccuracyPoints / 100) * 2.
        // This gives exactly the Cumulative DP on a 0-2 scale per note.

        const currentDP = (gameState.accumulatedAccuracyPoints / 100) * 2;

        // Target DP (Cumulative)
        // Target is Percentage (e.g. 95%).
        // Target DP = (Target% / 100) * currentRefMax.
        const targetDP = (gameState.targetTrackerTarget / 100) * currentRefMax;

        const diff = currentDP - targetDP;
        const diffEl = document.getElementById('tracker-diff');

        if (diffEl) {
            const sign = diff >= 0 ? "+" : "";
            // Display raw point difference (e.g. +0.05)
            diffEl.innerText = `${sign}${diff.toFixed(2)}`;

            // Color Logic
            if (diff > 0) diffEl.style.color = "#44ff4b"; // Green
            else if (diff < 0) diffEl.style.color = "#ff3333"; // Red
            else diffEl.style.color = "#fff";
        }
    }

    // Check for Fail
    if (userConfig.failMode === 'on' && gameState.life <= 0) { triggerFail(); return; }
    // Completion Check
    if (gameState.totalNotesHitOrMissed >= gameState.totalNotesInChart) {
        // SYNC MODE: Don't show results, rely on loop logic
        if (window.isSyncMode) {
            return; // Skip results screen, let loop handle restart
        }

        saveScore();
        if (gameState.failed) showResults();
        else setTimeout(() => {
            // Need to pass currentTime if showResults needed it?
            // Usually results screen is static.
            showResults();
        }, 2000);
    }
}

function triggerHoldJudgement(note, isOK, currentTime) {
    if (gameState.failed) return;
    if (isOK) {
        // Hold OK: Successful hold end.
        gameState.judgments.ok++;
        // Per request: Do not increment combo or judgment count for tails.
        // We still award life for holding successfully.
        gameState.life = Math.min(100, gameState.life + 0.4);
    } else {
        gameState.judgments.ng++;
        // Per user request: "holds only count judgement at the hold head"
        // We will punish life/score for dropping, but NOT break combo or show "N.G." judgment.
        // Assuming "count judgement" implies the combo/visual feedback aspect.
        // Standard behavior usually breaks combo, but user asked to be strict about "head only".
        // We'll keep the life penalty but remove combo break and text.
        gameState.accumulatedAccuracyPoints += -4.5;
        gameState.totalNotesHitOrMissed++;
        gameState.life = Math.max(0, gameState.life - 8.0);
    }
    note.processed = true; updateScoreDisplay(); updateJudgmentTracker();
    if (gameState.life <= 0) { triggerFail(); return; }
}

function calculateDetailedStats() {
    const offsets = gameState.hitOffsets;
    if (offsets.length === 0) return { mean: 0, sd: 0, max: 0, ma: 0, pa: 0 };
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const variance = offsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / offsets.length;
    const sd = Math.sqrt(variance);
    const maxOffset = Math.max(...offsets.map(o => Math.abs(o)));
    const marv = gameState.judgments.marvelous; const perf = gameState.judgments.perfect; const great = gameState.judgments.great;
    const ma = perf === 0 ? (marv > 0 ? "Inf" : "0.00") : (marv / perf).toFixed(2);
    const pa = great === 0 ? (perf > 0 ? "Inf" : "0.00") : (perf / great).toFixed(2);
    return { mean: mean.toFixed(2), sd: sd.toFixed(2), max: maxOffset.toFixed(2), ma, pa };
}

function findClosest(arr, key, target) {
    if (!arr || arr.length === 0) return null;
    let closest = arr[0];
    let minDiff = Math.abs((key ? arr[0][key] : arr[0]) - target);
    for (let i = 1; i < arr.length; i++) {
        const val = key ? arr[i][key] : arr[i];
        const diff = Math.abs(val - target);
        if (diff < minDiff) { minDiff = diff; closest = arr[i]; }
    }
    return closest;
}

function showTooltip(e, html) {
    let el = document.getElementById('graph-tooltip'); // Updated ID to match HTML/CSS
    if (!el) {
        // Fallback creation if missing from HTML for some reason
        el = document.createElement('div');
        el.id = 'graph-tooltip';
        document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.style.display = 'block';

    // Prevent tooltip from going off screen
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
}

function hideTooltip() {
    const el = document.getElementById('graph-tooltip');
    if (el) el.style.display = 'none';
}

function drawOffsetGraph() {
    const gCanvas = document.getElementById('offsetChart'); if (!gCanvas) return;
    const gCtx = gCanvas.getContext('2d'); const w = gCanvas.width; const h = gCanvas.height;
    gCtx.clearRect(0, 0, w, h); const centerY = h / 2;
    const drawWinLine = (ms, color) => { const scaleY = (h / 2) / 180; const yOffset = ms * scaleY; gCtx.fillStyle = color; gCtx.globalAlpha = 0.1; gCtx.fillRect(0, centerY - yOffset, w, yOffset * 2); gCtx.globalAlpha = 1.0; };
    drawWinLine(J_BAD, '#aa00ff'); drawWinLine(J_GOOD, '#0099ff'); drawWinLine(J_GREAT, '#44ff4b'); drawWinLine(J_PERFECT, '#ffe600'); drawWinLine(J_MARVELOUS, '#a3f7ff');
    gCtx.strokeStyle = '#fff'; gCtx.lineWidth = 1; gCtx.beginPath(); gCtx.moveTo(0, centerY); gCtx.lineTo(w, centerY); gCtx.stroke();
    const hits = gameState.detailedHits.filter(x => x.offset !== null);
    if (hits.length === 0) return;
    const endTime = hits[hits.length - 1].time;
    const scaleY = (h / 2) / 180;

    hits.forEach(p => {
        const x = (p.time / endTime) * w;
        const y = centerY + (p.offset * scaleY);
        let color = '#ff3333'; const abs = Math.abs(p.offset);
        if (abs <= J_MARVELOUS) color = '#a3f7ff'; else if (abs <= J_PERFECT) color = '#ffe600'; else if (abs <= J_GREAT) color = '#44ff4b'; else if (abs <= J_GOOD) color = '#0099ff'; else if (abs <= J_BAD) color = '#aa00ff';
        gCtx.fillStyle = color; gCtx.fillRect(x, y - 1, 3, 3);
    });

    gCanvas.onmousemove = (e) => {
        const rect = gCanvas.getBoundingClientRect(); const x = e.clientX - rect.left; const time = (x / rect.width) * endTime;
        const p = findClosest(hits, 'time', time);
        if (p) {
            // Count cumulative judgments up to this time
            const counts = { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
            hits.forEach(h => {
                if (h.time <= p.time) {
                    if (h.judge) {
                        const key = h.judge.toLowerCase();
                        if (counts[key] !== undefined) counts[key]++;
                    }
                }
            });
            const fmt = (k) => `<span class="judge-${k}" style="margin-right:5px">${counts[k]}</span>`;
            const statsHtml = `<div style="display:flex; gap:5px; font-size: 0.8em; margin-top:5px">
                ${fmt('marvelous')} ${fmt('perfect')} ${fmt('great')} ${fmt('good')} ${fmt('bad')} ${fmt('miss')}
            </div>`;

            showTooltip(e, `Time: ${p.time.toFixed(1)}s<br>Judge: <span class="judge-${p.judge.toLowerCase()}">${p.judge}</span><br>Offset: ${p.offset.toFixed(1)}ms${statsHtml}`);
        }
    };
    gCanvas.onmouseout = hideTooltip;
}

function drawLifeComboChart() {
    const cCanvas = document.getElementById('lifeComboChart'); if (!cCanvas) return;
    const ctx = cCanvas.getContext('2d'); const w = cCanvas.width; const h = cCanvas.height;
    ctx.clearRect(0, 0, w, h); const lifeData = gameState.lifeHistory; const comboData = gameState.comboHistory;
    if (lifeData.length === 0) return;
    const endTime = lifeData[lifeData.length - 1].time;

    ctx.fillStyle = 'rgba(0,255,0,0.2)'; ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, h - (lifeData[0].val / 100 * h));
    lifeData.forEach(p => { ctx.lineTo((p.time / endTime) * w, h - (p.val / 100 * h)); });
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, h - (lifeData[0].val / 100 * h));
    lifeData.forEach(p => { ctx.lineTo((p.time / endTime) * w, h - (p.val / 100 * h)); });
    ctx.stroke();

    const maxC = Math.max(1, gameState.maxCombo); ctx.strokeStyle = '#00e5ff'; ctx.beginPath(); ctx.moveTo(0, h);
    comboData.forEach(p => { ctx.lineTo((p.time / endTime) * w, h - (p.val / maxC * h)); });
    ctx.stroke();

    cCanvas.onmousemove = (e) => {
        const rect = cCanvas.getBoundingClientRect(); const x = e.clientX - rect.left; const time = (x / rect.width) * endTime;
        const pLife = findClosest(lifeData, 'time', time); const pCombo = findClosest(comboData, 'time', time);
        if (pLife && pCombo) {
            const cp = ((pCombo.val / maxC) * 100).toFixed(1);
            showTooltip(e, `Time: ${pLife.time.toFixed(1)}s<br>Life: <span style="color:#0f0">${pLife.val.toFixed(1)}%</span><br>Combo: <span style="color:#00e5ff">${pCombo.val} (${cp}%)</span>`);
        }
    };
    cCanvas.onmouseout = hideTooltip;
}

function drawAccuracyGraph() {
    const canvas = document.getElementById('accuracyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const hist = gameState.accuracyHistory;

    ctx.clearRect(0, 0, w, h);
    if (hist.length < 2) return;

    // 1. Determine Range
    let minAcc = 100;
    let maxAcc = 0;
    hist.forEach(h => {
        if (h.acc < minAcc) minAcc = h.acc;
        if (h.acc > maxAcc) maxAcc = h.acc;
    });

    // Scale Range: [Lowest Obtained (or 0), 100]
    // User requested: "ranges from the highest accuracy obtained and the lowest accuracy obtained (or 0, whichever is higher)"
    // If lowest is 95, range 95-100? Or 0-100?
    // "lowest accuracy obtained (or 0, whichever is higher)" -> Math.max(minAcc, 0). Which is always minAcc.
    // Likely means: Dynamic min is simply the lowest value in history.
    // Let's add a small buffer?
    // If Acc is always 100, min=100, max=100. Range?

    // Let's interpret strict dynamic range:
    const rangeMin = Math.max(0, Math.floor(minAcc - 1)); // -1 buffer
    const rangeMax = 100; // Acc usually capped at 100
    const rangeSpan = rangeMax - rangeMin;

    // Helper to map acc to Y
    const getY = (val) => h - ((val - rangeMin) / rangeSpan * h);

    // 2. Draw Dividers (Background Grid)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#666';

    // Draw lines every 20%, 10%, 5% or 1% depending on span?
    // If span < 10, step 1. If span < 50, step 5. Else 10.
    let step = 10;
    if (rangeSpan <= 10) step = 1;
    else if (rangeSpan <= 25) step = 5;

    for (let v = Math.ceil(rangeMin / step) * step; v <= rangeMax; v += step) {
        const y = getY(v);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillText(v + '%', 2, y - 2);
    }

    // 3. Draw Graph
    const getGradeColor = (grade) => { return GRADE_COLORS[grade] || "#888"; };
    const endTime = hist[hist.length - 1].time;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // "Starts from the first note's accuracy instead of jumping from 0"
    // Already iterating p1 to p2. p1 is index 0.
    // Ensure index 0 isn't {time:0, acc:0} if the first note is at time 2.
    // History usually starts with push.

    for (let i = 1; i < hist.length; i++) {
        const p1 = hist[i - 1];
        const p2 = hist[i];

        // Skip jump from 0 if present? 
        // Logic: Layout X by time.
        const x1 = (p1.time / endTime) * w;
        const y1 = getY(p1.acc);
        const x2 = (p2.time / endTime) * w;
        const y2 = getY(p2.acc);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = getGradeColor(p2.grade);
        ctx.stroke();
    }

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * endTime;
        const p = findClosest(hist, 'time', time);
        if (p) showTooltip(e, `Time: ${p.time.toFixed(1)}s<br>Acc: <span>${p.acc.toFixed(2)}%</span><br>Grade: <span style="color:${GRADE_COLORS[p.grade]}">${p.grade}</span>`);
    };
    canvas.onmouseout = hideTooltip;
}

function getFCType(j) {
    const cb = j.miss + j.bad + j.good + j.ng;

    // FULL COMBO
    if (cb === 0) {
        if (j.great === 0 && j.perfect === 0) return "MFC";

        // Perfect Full Combo Tier
        if (j.great === 0) {
            if (j.perfect === 1) return "WF"; // White Flag (1 Perfect)
            if (j.perfect < 10) return "SDP"; // Single Digit Perfects
            return "PFC";
        }

        // Great Full Combo Tier
        if (j.great === 1) return "BF";  // Black Flag (1 Great)
        if (j.great < 10) return "SDG";  // Single Digit Greats
        return "FC";
    }

    // BROKEN COMBO
    if (cb === 1) return "MF";   // Miss Flag (1 Combo Break)
    if (cb < 10) return "SDCB";  // Single Digit Combo Breaks
    return "Clear";
    // BROKEN COMBO
    if (cb === 1) return "MF";   // Miss Flag (1 Combo Break)
    if (cb < 10) return "SDCB";  // Single Digit Combo Breaks
    return "Clear";
}

function calculateSD(offsets) {
    if (!offsets || offsets.length === 0) return 0;
    const n = offsets.length;
    const mean = offsets.reduce((a, b) => a + b, 0) / n;
    const variance = offsets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(variance);
}

function sortLeaderboard(a, b) {
    // 1. Validity Check (Invalid/Fail pushed to bottom)
    // Valid: Acc >= 83 (approx check, strictly use fcType !== "Fail" && fcType !== "Invalid")
    // Let's use fcType check if available, or infer.

    // Check A validity
    const aInvalid = (a.fcType === "Fail" || a.fcType === "Invalid");
    const bInvalid = (b.fcType === "Fail" || b.fcType === "Invalid");

    if (aInvalid && !bInvalid) return 1; // A is worse (bottom)
    if (!aInvalid && bInvalid) return -1; // A is better (top)

    // 2. SSR Check (Higher SSR wins - requested as primary sort)
    const ssrA = parseFloat(a.ssr || 0);
    const ssrB = parseFloat(b.ssr || 0);
    if (Math.abs(ssrA - ssrB) > 0.01) return ssrB - ssrA;

    // 3. Score Check (Higher DP Score wins)
    const dpA = parseFloat(a.dpScore || 0);
    const dpB = parseFloat(b.dpScore || 0);
    if (Math.abs(dpA - dpB) > 0.001) return dpB - dpA;

    // 4. Acc Check (Higher Acc wins)
    const accA = parseFloat(a.acc || 0);
    const accB = parseFloat(b.acc || 0);
    if (Math.abs(accA - accB) > 0.0001) return accB - accA;

    // 5. SD Check (Lower SD wins - tighter timing)
    const sdA = parseFloat(a.sd || 9999);
    const sdB = parseFloat(b.sd || 9999);
    if (Math.abs(sdA - sdB) > 0.01) return sdA - sdB;

    // 6. Time Check (Earlier Timestamp wins)
    const timeA = a.date || 0;
    const timeB = b.date || 0;
    return timeA < timeB ? -1 : 1;
}

function handleLeaderboard() {
    const key = `webSM_lb_${gameState.meta.title}_${gameState.chart.difficulty}`;
    const saved = localStorage.getItem(key);
    let lb = [];
    if (saved) {
        const parsed = JSON.parse(saved);
        lb = Array.isArray(parsed) ? parsed : [parsed];
    }

    const list = document.getElementById('leaderboard-list');
    if (list) {
        list.innerHTML = '';
        lb.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'lb-entry';

            // Display DP Score instead of Standard Score
            const displayScore = entry.dpScore ? parseFloat(entry.dpScore).toFixed(2) : "0.00";
            const origAcc = entry.acc + "%";

            // Judge Badge if saved
            const jBadge = entry.judgeDiff ? `<span style="font-size:0.7em; color:#666; margin-left:5px">J${entry.judgeDiff}</span>` : "";

            const hasReplay = entry.replayLog && entry.replayLog.length > 0;
            const btnStyle = "background:none; border:none; color:#ddd; cursor:pointer; font-size:0.8rem; margin-left:5px; padding:0;";
            const resBtn = `<button onclick='viewScoreResults(${JSON.stringify(entry)})' style='${btnStyle}' title='View Results'>📄</button>`;
            const repBtn = hasReplay ? `<button onclick='startReplay(${JSON.stringify(entry)}, songLibrary[selectedSongIndex], songLibrary[selectedSongIndex].charts[selectedChartIndex])' style='${btnStyle} color:#00e5ff;' title='Watch Replay'>▶</button>` : "";

            div.innerHTML = `
                <span class="lb-rank">#${i + 1}</span>
                <span class="lb-clear" style="color:${CLEAR_COLORS[entry.clearType] || '#fff'}; font-weight:bold; font-size:0.7em; text-transform:uppercase;">${entry.clearType || ""}</span>
                <span class="lb-score">${displayScore}</span>
                <span class="lb-grade">${entry.grade}${jBadge}</span>
                <span class="lb-acc">${origAcc}</span>
                <span class="lb-actions" style="margin-left:auto;">${resBtn}${repBtn}</span>
            `;

            // Hover Logic
            if (entry.j4Dp && entry.j4Acc) {
                const sEl = div.querySelector('.lb-score');
                const aEl = div.querySelector('.lb-acc');

                const j4Score = entry.j4Dp;
                const j4Acc = entry.j4Acc + "%";

                const setHover = (active) => {
                    sEl.innerText = active ? j4Score : displayScore;
                    aEl.innerText = active ? j4Acc : origAcc;
                    sEl.style.color = active ? '#88ccff' : '';
                    aEl.style.color = active ? '#88ccff' : '';
                };

                sEl.onmouseenter = () => setHover(true);
                sEl.onmouseleave = () => setHover(false);
                aEl.onmouseenter = () => setHover(true);
                aEl.onmouseleave = () => setHover(false);

                sEl.style.cursor = "pointer";
                aEl.style.cursor = "pointer";
                sEl.title = "J4 Converted";
                aEl.title = "J4 Converted";
            }

            list.appendChild(div);
        });
    }
}

function showResults() {
    if (gameState.isAutoplay) {
        quitGame();
        return;
    }
    gameState.isPlaying = false;

    // Accuracy Calculation
    // Logic: accumulatedAccuracyPoints is now Sum(0-100 scale).
    // result = Sum / (Count * 100).
    const count = gameState.totalNotesHitOrMissed || 1;
    let baseAcc = gameState.accumulatedAccuracyPoints / count; // Avg Score (0-100 technically, can be negative)
    // Actually, calculateAccuracy returns up to 100.
    // So 'baseAcc' is the average score per note (e.g. 99.5).
    // The "Accuracy Percentage" IS this average score.
    // Wait, if calculateAccuracy(0) = 100. Then Avg = 100.
    // So Acc% = baseAcc.
    // However, failing can drag it down.

    // Safety clamp (though negatives are allowed technically in Wife?)
    // User interface usually expects 0-100%.
    // Let's not clamp strictly 0, but usually display logic handles it?
    // Let's use it directly.

    // DP Score Calculation:
    // User Request: (Acc% / 100) * 2 * TotalNotes.
    // Acc% = baseAcc.
    // DP = (baseAcc / 100) * (gameState.totalNotesInChart * 2).

    // Handle specific fail logic if requested (usually Fails are just Fails).

    // Fail Logic Update
    if (gameState.failed) {
        // Correct Fail Accuracy: (EarnedPts + MissingNotesPenalty) / (TotalNotes * 100)
        const totalPossiblePoints = gameState.totalNotesInChart * 100;
        const missingNotes = Math.max(0, gameState.totalNotesInChart - gameState.totalNotesHitOrMissed);
        const penalty = missingNotes * -275;
        baseAcc = ((gameState.accumulatedAccuracyPoints + penalty) / totalPossiblePoints) * 100;
    }

    const accPct = baseAcc;
    const total = gameState.totalNotesInChart;

    // DP Points (per user request: Max is 2 * TotalNotes)
    // Correct Formula for Earned DP: (AccumulatedPoints / 100) * 2
    // AccumulatedPoints is roughly Sum(0-100).
    const dpPoints = (gameState.accumulatedAccuracyPoints / 100) * 2;

    setScreen('results-screen');
    document.getElementById('gameCanvas').style.display = 'none';
    const bannerUrl = document.getElementById('ss-banner').src;
    if (bannerUrl && bannerUrl !== window.location.href) {
        document.getElementById('res-banner').src = bannerUrl;
        document.getElementById('res-banner').style.display = 'block';
    } else {
        document.getElementById('res-banner').style.display = 'none';
    }

    setText('res-song-title', gameState.meta.title);
    setText('res-song-artist', gameState.meta.artist);

    const stats = calculateDetailedStats();
    // total and accPct are already calculated above (Renamed/Consolidated)
    // Legacy Removal: const total = ... const accPct = ...

    // DP Points derived earlier as 'dpPoints'.
    // Need to ensure 'acc' variable is compatible if used elsewhere? 
    // 'acc' was used for SSR calc? 
    // SSR uses fraction (0.0-1.0)? Or Percent?
    // calculateSSR(diff, acc): Line 2060.
    // Original 'acc' was 0.0-1.0 fraction.
    // My 'baseAcc' is 0.0-100.0.
    // So pass 'baseAcc / 100' or just 'accPct / 100'.
    const accFraction = accPct / 100;

    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;

    // Determine Clear Type and SSR
    let clearType = getClearType(gameState.judgments, gameState.failed, accPct, gameState.hasPausedDuringPlay);
    let ssr = calculateSSR(diff, accFraction);

    if (gameState.failed) ssr = 0;

    setText('res-clear-type', getClearText(clearType));
    if (document.getElementById('res-clear-type')) {
        const c = CLEAR_COLORS[clearType] || "#fff";
        document.getElementById('res-clear-type').style.color = c;
        document.getElementById('res-clear-type').style.textShadow = `0 0 10px ${c} `;
    }

    // Set Initial Judge Label (Live played diff)
    const judgeDiff = userConfig.judgeDifficulty || 4;
    setText('res-judge-label', `J${judgeDiff} `);
    document.getElementById('res-judge-label').style.display = 'inline';

    // Store hits for Re-Judge Toggle
    lastDetailedHits = [...gameState.detailedHits];
    resultViewJudge = judgeDiff; // Init view to played diff

    // Rate Display in Results
    const resRateEl = document.getElementById('res-rate-display');
    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    if (resRateEl) {
        if (Math.abs(rate - 1.0) > 0.001) {
            resRateEl.style.display = 'inline';
            resRateEl.innerText = `(${rate.toFixed(2)}x)`;
        } else {
            resRateEl.style.display = 'none';
        }
    }

    const cosmeticScore = getCosmeticScore();
    const grade = getGrade(accPct, cosmeticScore, gameState.judgments);
    const gradeEl = document.getElementById('res-grade');
    if (gradeEl) {
        gradeEl.innerText = grade;
        gradeEl.style.color = getGradeColor(grade);
        gradeEl.style.textShadow = `0 0 30px ${getGradeColor(grade)} `;
    }
    setText('res-acc', accPct >= 99.70 ? accPct.toFixed(4) + "%" : accPct.toFixed(2) + "%");
    setText('res-score', dpPoints.toFixed(2));

    // Max DP is 2 * Total (Cumulative)
    const maxDP = total * 2;
    const resDpEl = document.getElementById('res-dp');
    if (resDpEl) {
        // Now displaying Cosmetic Score here per user request
        resDpEl.innerText = cosmeticScore.toLocaleString();
    }

    const ssrEl = document.getElementById('res-ssr');
    if (ssrEl) {
        ssrEl.innerText = "SSR: " + ssr.toFixed(2);
        const c = getDifficultyColor(ssr);
        ssrEl.style.color = c;
        ssrEl.style.textShadow = `0 0 10px ${c} `;
    }
    setText('res-pauses', gameState.pauseCount);

    const comboPct = (gameState.maxCombo / total * 100).toFixed(2);
    setText('res-combo', gameState.maxCombo);
    setText('res-combo-pct', `(${comboPct} %)`);
    setText('res-mean', stats.mean + "ms");
    setText('res-sd', stats.sd + "ms");
    setText('res-max', stats.max + "ms");
    setText('res-ma', stats.ma);
    setText('res-pa', stats.pa);

    const updateJudgeRes = (type) => {
        const count = gameState.judgments[type];
        const pct = (count / total * 100).toFixed(2);
        setText(`res-count-${type}`, count);
        setText(`res-pct-${type}`, `${pct}%`);
    };
    ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss', 'ok', 'ng'].forEach(updateJudgeRes);

    handleLeaderboard();
    drawOffsetGraph();
    drawLifeComboChart();
    drawAccuracyGraph();
    saveLibrary(); // Autosave library state if needed
}

// Start Replay Playback
function startReplay(scoreEntry, songOverride, chartOverride) {
    let replayData = null;

    if (scoreEntry && scoreEntry.replayLog) {
        replayData = scoreEntry.replayLog;
    } else if (gameState && gameState.replayLog) {
        replayData = gameState.replayLog;
    }

    if (!replayData || replayData.length === 0) {
        alert('No replay data available!');
        return;
    }

    // Store replay data in window for initGame to use
    window.replayData = [...replayData];
    window.isReplayLaunch = true;

    // Hide replay button
    const replayBtn = document.getElementById('replay-btn');
    if (replayBtn) replayBtn.style.display = 'none';

    // If song and chart are provided (from leaderboard/best score click), ensure they are selected
    if (songOverride && chartOverride) {
        const sIdx = songLibrary.indexOf(songOverride);
        if (sIdx !== -1) {
            selectedSongIndex = sIdx;
            const cIdx = songOverride.charts.indexOf(chartOverride);
            if (cIdx !== -1) {
                selectedChartIndex = cIdx;
            }
        }
    }

    // Restart the same chart in replay mode
    if (selectedSongIndex !== -1 && selectedChartIndex !== -1) {
        startGameFromMenu(); // This will restart with replay mode enabled
    } else {
        alert('Cannot start replay: Chart information not available');
    }
}

function quitGame() {
    if (gameState.startTimeout) { clearTimeout(gameState.startTimeout); gameState.startTimeout = null; }
    if (audioSource) {
        try { audioSource.stop(); } catch (e) { console.warn(e); }
    }
    if (gameState.audioEl) {
        gameState.audioEl.pause();
        gameState.audioEl = null;
    }
    gameState.isPlaying = false;
    gameState.isPaused = false;
    gameState.failed = false;

    setScreen('setup-panel');

    // Refresh selection
    if (selectedSongIndex !== -1) {
        const preserved = selectedChartIndex;
        selectSong(selectedSongIndex);
        if (preserved !== -1 && songLibrary[selectedSongIndex].charts && preserved < songLibrary[selectedSongIndex].charts.length) {
            selectDifficulty(preserved);
        }
    }

    document.getElementById('pause-menu').style.display = 'none';

    const cvs = document.getElementById('gameCanvas');
    if (cvs) {
        cvs.style.display = 'none';
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const apInd = document.getElementById('autoplay-indicator');
    if (apInd) apInd.style.display = 'none';

    // Replay Cleanup
    const repUI = document.getElementById('replay-ui-container');
    if (repUI) repUI.remove();

    // RESTORE SYNC MODS & UI
    if (window.isSyncMode && window.originalSyncMods) {
        userConfig.downScroll = window.originalSyncMods.downScroll;
        userConfig.scrollTime = window.originalSyncMods.scrollTime;
        if (typeof modConfig !== 'undefined') {
            modConfig.failMode = window.originalSyncMods.failMode;
            modConfig.scrollDirection = window.originalSyncMods.scrollDir;
        }
        if (userConfig.modifiers) {
            userConfig.modifiers.speedType = window.originalSyncMods.speedType;
            userConfig.modifiers.speedValue = window.originalSyncMods.speedValue;
        }
        window.originalSyncMods = null;

        // Restore UI Elements (Sync Mode)
        const restoreIds = [
            'hud-top-left', 'judgment-tracker', 'live-grade', 'hud-right-panel',
            'hud-acc-box', 'combo', 'npsGraph', 'hud-tracker', 'error-bar-container',
            'progress-container', 'hud-song-info', 'hud-fps-counter'
        ];
        restoreIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.visibility = 'visible';
        });
    }
    window.isSyncMode = false;
    // Do NOT force hud display block here, let setScreen handle it.
}
window.quitGame = quitGame;

// ... [Remainder: setupCanvas, getNoteRowIndex, drawReceptor, drawNote, gameLoop, openSettings, toggleScrollDir, saveSettings, togglePause, resumeGame, handleInput, initGame, startEngine, parseSM, parseNoteData, fileInput] ...

function setupCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.height = window.innerHeight;
    canvas.width = canvas.height * 0.625;
    gameConfig.columnWidth = canvas.width / 4;
    gameConfig.arrowSize = gameConfig.columnWidth * 0.9;
    if (userConfig.downScroll) {
        // Downscroll: Base is 0.9. Move 65 (margin) + 20 (offset).
        // Request: "move the downscroll receptors' absolute positions up by 20px"
        // Previous (Baseline): `height * 0.9 - 65`.
        // Up by 20px: `- 65 - 20`.
        gameConfig.receptorY = (canvas.height * 0.9) - 65 - 20;
    } else {
        // Upscroll: Base is 0.1.
        // Request: "move the upscroll receptors' absolute positions up by 40px"
        // Previous (Baseline): `height * 0.1 + 65`.
        // Up by 40px: `+ 65 - 40`.
        gameConfig.receptorY = (canvas.height * 0.1) + 65 - 40;
    }
    let visibleDistance = userConfig.downScroll ? gameConfig.receptorY : canvas.height - gameConfig.receptorY;
    // gameConfig.scrollSpeed = visibleDistance / (userConfig.scrollTime / 1000);
    // Use new Logic
    // Use new Logic
    updateScrollSpeed((typeof modConfig !== 'undefined' ? modConfig.rate : 1.0));
}
function getNoteRowIndex(beat) { const b = Math.abs(beat); const epsilon = 0.01; const isSnap = (div) => Math.abs((b * div) - Math.round(b * div)) < epsilon; if (isSnap(1)) return 0; if (isSnap(2)) return 1; if (isSnap(3)) return 2; if (isSnap(4)) return 3; if (isSnap(6)) return 4; if (isSnap(8)) return 5; if (isSnap(12)) return 6; return 7; }
function stepReplay(dir) {
    if (!gameState.isPaused || !gameState.isReplay) return;

    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    const dt = dir * 0.0166; // 1 frame (60fps) approx

    if (gameState.mode === 'stretch' && gameState.audioEl) {
        gameState.audioEl.currentTime = Math.max(0, gameState.audioEl.currentTime + dt);
    } else {
        // Vinyl Mode
        // Time = (AudioCtx - Start) * Rate
        // Start = AudioCtx - (Time/Rate)
        // We want TimeNew = TimeOld + dt
        // StartNew = AudioCtx - (TimeOld + dt)/Rate
        // StartNew = AudioCtx - (TimeOld/Rate) - (dt/Rate)
        // StartNew = StartOld - (dt/Rate)
        gameState.startTime -= (dt / rate);
    }

    gameState.singleFrameStep = true;
    requestAnimationFrame(gameLoop);
} window.stepReplay = stepReplay;

function viewScoreResults(entry) {
    if (!entry.detailedHits) {
        alert("Detailed data missing for this score.");
        return;
    }

    // Hydrate
    gameState.score = entry.score;
    gameState.osuScore = entry.osuScore || 0;
    gameState.judgments = entry.judgments || { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, ok: 0, ng: 0, mine: 0 };
    gameState.maxCombo = entry.maxCombo || 0;

    gameState.detailedHits = entry.detailedHits;
    gameState.hitOffsets = entry.detailedHits.filter(h => h.offset !== null).map(h => h.offset);
    gameState.accumulatedAccuracyPoints = parseFloat(entry.acc) * entry.detailedHits.length;
    gameState.totalNotesHitOrMissed = entry.detailedHits.length;
    // Clear graphs
    gameState.accuracyHistory = [];
    gameState.lifeHistory = [];
    gameState.comboHistory = [];
    gameState.npsHistory = [];
    gameState.pauseCount = 0; // Don't show pause count from stored? Or entry doesn't have it.

    gameState.failed = (entry.grade === 'F' || entry.fcType === 'Fail');
    gameState.meta = songLibrary[selectedSongIndex].meta; // Ensure meta matches current selection

    showResults();
} window.viewScoreResults = viewScoreResults;

function drawReceptor(x, y, rotation, colIndex) {
    ctx.save();
    const halfSize = gameConfig.columnWidth / 2;
    ctx.translate(x + halfSize, y + halfSize);
    ctx.rotate(rotation * Math.PI / 180);
    const drawSize = gameConfig.arrowSize;
    const offset = -drawSize / 2;
    if (assets.loaded.receptorSprite) {
        const img = assets.receptorSprite;
        const sx = gameState.heldKeys[colIndex] ? img.width / 2 : 0;
        ctx.drawImage(img, sx, 0, img.width / 2, img.height, offset, offset, drawSize, drawSize);
    } else {
        ctx.beginPath();
        const s = drawSize / 2.5;
        ctx.strokeStyle = gameState.heldKeys[colIndex] ? '#fff' : '#aaa';
        ctx.lineWidth = 4;
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(s / 2, 0);
        ctx.lineTo(s / 2, s);
        ctx.lineTo(-s / 2, s);
        ctx.lineTo(-s / 2, 0);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.stroke();
    }
    ctx.restore();
}
function drawHoldExplosion(x, y, rotation, colIndex, currentTime) {
    const isHoldingActive = gameState.colsActive && gameState.colsActive[colIndex];
    if (isHoldingActive && assets.loaded.holdExplosion) {
        ctx.save();
        const halfSize = gameConfig.columnWidth / 2;
        ctx.translate(x + halfSize, y + halfSize);
        ctx.rotate(rotation * Math.PI / 180);
        const drawSize = gameConfig.arrowSize;
        const offset = -drawSize / 2;

        const expImg = assets.holdExplosion;
        const frame = Math.floor((currentTime * 1000) / 50) % 2;
        const fw = expImg.width / 2;
        ctx.drawImage(expImg, frame * fw, 0, fw, expImg.height, offset, offset, drawSize, drawSize);
        ctx.restore();
    }
}

// Refactored drawNote with Alpha Fade & Alignment & Modifiers
function drawNote(note, y, rotation, currentTime) {
    // --- MODIFIERS: EFFECT & APPEARANCE ---
    let drawX = note.col * gameConfig.columnWidth;
    let drawY = y;
    let alpha = 1.0;

    // 1. Appearance (Hidden/Sudden/Stealth)
    // OR Sync Mode enforced fade (TIME-BASED, not note-based)
    let enforceSyncFade = false;
    if (window.isSyncMode && typeof gameState !== 'undefined' && gameState.startTime) {
        let songTime = currentTime;

        // Fade starts after 4 seconds of song time
        // At 4s: alpha = 1, at 8s: alpha = 0
        if (songTime > 4.0) {
            enforceSyncFade = true;
            const fadeDuration = 4.0; // Fade over 4 seconds
            const fadeProgress = Math.min((songTime - 4.0) / fadeDuration, 1.0);
            alpha = 1.0 - fadeProgress; // Gradually fade to 0
        }
    }


    if (modConfig.appearance && !enforceSyncFade) {
        const type = modConfig.appearance.type;
        const offsetPct = modConfig.appearance.offset || 50;
        const offsetVal = offsetPct / 100;

        // Calculate relative position 0..1 (0 = Receptor, 1 = Bottom/Top of screen)
        const dist = Math.abs(y - gameConfig.receptorY);
        const screenH = canvas.height;

        if (type === 'stealth') {
            alpha = 0;
        } else if (type === 'hidden') {
            const fadePoint = offsetVal * (screenH * 0.5) + 50;
            if (dist < fadePoint) {
                alpha = dist / fadePoint;
            }
        } else if (type === 'sudden') {
            const fadePoint = offsetVal * (screenH * 0.5) + 50;
            if (dist > fadePoint) alpha = 0;
            else {
                alpha = 1 - (dist / fadePoint);
            }
        }
    }

    // 2. Effects (Drunk, etc)
    if (modConfig.effect && modConfig.effect.name !== 'none') {
        const eff = modConfig.effect.name;
        const time = currentTime;

        if (eff === 'drunk') {
            // Sine wave on X
            // Phase based on time + y position (to create wave)
            drawX += Math.cos(time * 3 + y * 0.01) * (gameConfig.columnWidth * 0.5);
        } else if (eff === 'dizzy') {
            // Rotation?
            // "Dizzy" usually spins the arrows.
            // Note: `rotation` arg is already 0, 90, 180, 270.
            // We'll add to it.
            // rotation += time * 100; // Spin
            // But we can't easily modify rotation var without affecting logic below (ctx.rotate).
            // We'll add a `extraRotation` var.
            rotation += (time * 100) % 360;
        } else if (eff === 'mini') {
            // Handled via scale in draw?
            // We'll scale context later.
        } else if (eff === 'flip') {
            // Invert columns visually? 
            // Logic: 0->3, 1->2...
            // But drawX is already calc'd.
            // X = (3 - col) * width
            drawX = (3 - note.col) * gameConfig.columnWidth;
        } else if (eff === 'invert') {
            // 0->1, 1->0, 2->3, 3->2
            // Col mapping logic
            const map = [1, 0, 3, 2];
            drawX = map[note.col] * gameConfig.columnWidth;
        }
    }

    ctx.save();
    ctx.globalAlpha *= alpha; // Combine with existing alpha if any

    const halfSize = gameConfig.columnWidth / 2;
    const x = drawX; // Use modified X

    // Mini Effect Scale
    if (modConfig.effect && modConfig.effect.name === 'mini') {
        // Center scale around the arrow center?
        // Translate to arrow center, scale, translate back?
        // We already translate to center later.
        // Easier: adjust drawSize.
    }

    // --- COORDINATE CALCULATIONS ---
    const drawSize = gameConfig.arrowSize;
    const offset = -drawSize / 2;

    // Visual head position
    let headVisualY = y;
    if (note.holdState === 'active') {
        headVisualY = gameConfig.receptorY;
    }

    // Visual body start/end
    let bodyStartVisualY = y;
    let bodyEndVisualY = y;
    if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
        const duration = note.endTime - note.time;
        const dist = duration * gameConfig.scrollSpeed;
        if (userConfig.downScroll) bodyEndVisualY = y - dist; else bodyEndVisualY = y + dist;

        // If active, the visual "start" of the body is locked at the receptor's middle
        if (note.holdState === 'active') {
            bodyStartVisualY = gameConfig.receptorY + halfSize;
        }
    }

    // --- HEAD DRAWING ---
    ctx.save();
    ctx.translate(x + halfSize, headVisualY + halfSize);
    ctx.rotate(rotation * Math.PI / 180);

    // Scale for Mini
    if (modConfig.effect && modConfig.effect.name === 'mini') {
        ctx.scale(0.5, 0.5);
    }

    if (note.type === 'mine' && assets.loaded.mineSprite) {
        const frames = 8;
        const frame = Math.floor(gameState.globalFrame / 10) % frames;
        const fw = assets.mineSprite.width / 8;
        const fh = assets.mineSprite.height;
        ctx.drawImage(assets.mineSprite, frame * fw, 0, fw, fh, offset, offset, drawSize, drawSize);
    } else {
        let img = assets.arrowSprite;
        if (note.holdState === 'active' && assets.loaded.holdHeadActive) {
            img = assets.holdHeadActive;
        }

        let rowIndex = getNoteRowIndex(note.beat);

        if (assets.loaded.arrowSprite || assets.loaded.holdHeadActive) {
            const sy = rowIndex * (img.height / 8);
            ctx.drawImage(img, 0, sy, img.width, img.height / 8, offset, offset, drawSize, drawSize);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(offset, offset, drawSize, drawSize);
        }
    }
    ctx.restore();

    // --- HOLD/ROLL BODY DRAWING --- (Rendered on top of head per request)
    if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
        const bodyImg = note.type === 'hold' ? assets.holdBody : assets.rollBody;
        const bodyLoaded = note.type === 'hold' ? assets.loaded.holdBody : assets.loaded.rollBody;

        if (bodyLoaded) {
            ctx.save();
            ctx.globalAlpha *= 0.8; // Ensure head visibility

            if (note.letGoTime) {
                ctx.globalAlpha *= Math.max(0, 1 - ((currentTime - note.letGoTime) * 1000 / 250));
            }
            if (note.rollAlpha !== undefined) ctx.globalAlpha *= note.rollAlpha;
            if (note.holdState === 'missed') ctx.globalAlpha *= 0.5;

            const w = gameConfig.arrowSize;
            const bx = x + (gameConfig.columnWidth - w) / 2;

            // Anchor at the scrolling 'y' for pattern consistency
            // But fill only the visual range [bodyStartVisualY, bodyEndVisualY]
            ctx.save();
            ctx.translate(bx, y);

            if (!note.bodyPattern) {
                note.bodyPattern = ctx.createPattern(bodyImg, 'repeat');
            }
            ctx.fillStyle = note.bodyPattern;

            const imgScale = w / bodyImg.width;
            ctx.scale(imgScale, imgScale);

            // Coordinates in image space
            const fillStart = (bodyStartVisualY - y) / imgScale;
            const fillEnd = (bodyEndVisualY - y) / imgScale;
            const fillHeight = fillEnd - fillStart;

            ctx.fillRect(0, fillStart, bodyImg.width, fillHeight);
            ctx.restore();
            ctx.restore();
        }
    }

    ctx.restore();
}
function drawErrorBar(currentTime) {
    const eb = document.getElementById('errorBarCanvas'); if (!eb) return;
    const eCtx = eb.getContext('2d'); eCtx.clearRect(0, 0, eb.width, eb.height);
    const scale = 150 / 180;
    const nowMs = currentTime * 1000;

    // Drawing logic without filtering the entire array
    const hits = gameState.recentHits;
    for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        const age = nowMs - h.time;
        if (age > 2000) {
            // Optimization: Cleanup old hits periodically or just ignore
            // If we iterate backwards and find one too old, subsequent ones (older) will also be too old.
            // But they might not be sorted if triggerJudgement isn't always sequential? 
            // In game they are always sequential.
            break;
        }
        const x = 150 - (h.offset * scale);
        const alpha = 1 - (age / 2000);
        let color = "255, 255, 255";
        const abs = Math.abs(h.offset);
        if (abs <= J_MARVELOUS) color = "163, 247, 255";
        else if (abs <= J_PERFECT) color = "255, 230, 0";
        else if (abs <= J_GREAT) color = "68, 255, 75";
        else if (abs <= J_GOOD) color = "0, 153, 255";
        else if (abs <= J_BAD) color = "170, 0, 255";
        else color = "255, 51, 51";

        eCtx.fillStyle = `rgba(${color}, ${alpha})`;
        eCtx.fillRect(x - 1, 0, 3, 20);
    }

    // Incremental mean calculation
    if (gameState.hitCount > 0) {
        const mean = gameState.hitSum / gameState.hitCount;
        setText('hit-mean', `${mean.toFixed(2)} ms`);
    }

    // Periodic Cleanup of recentHits (every ~2 seconds of game time)
    if (!gameState.lastCleanupTime || currentTime - gameState.lastCleanupTime > 2.0) {
        gameState.recentHits = hits.filter(h => nowMs - h.time < 2000);
        gameState.lastCleanupTime = currentTime;
    }
}
function drawNPSGraph(currentTime) {
    const c = document.getElementById('npsGraph');
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);

    // FIX: Use the currentTime calculated in gameLoop to ensure sync across modes (Vinyl/Stretch)
    const currentSongTime = currentTime;
    const now = performance.now() / 1000; // Use performance.now for internal throttling time

    // Throttle NPS display and calculation: Every 250ms
    if (!gameState.lastNPSUpdate || now - gameState.lastNPSUpdate >= 0.25) {
        gameState.lastNPSUpdate = now;

        const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;

        // Calculate NPS from 3s real-time window
        let count = 0;

        // Use a cursor to accelerate NPS calculation
        if (typeof gameState.npsCursor === 'undefined') gameState.npsCursor = 0;

        // Re-start cursor if it drifted too far or song skipped
        if (gameState.npsCursor >= gameState.notes.length || gameState.notes[gameState.npsCursor].time > currentSongTime) {
            gameState.npsCursor = 0;
        }

        for (let i = gameState.npsCursor; i < gameState.notes.length; i++) {
            const n = gameState.notes[i];
            if (n.time < currentSongTime - (3 * rate)) {
                gameState.npsCursor = i;
                continue;
            }
            if (n.time > currentSongTime) break;
            count++;
        }

        const elapsedReal = Math.min(3.0, (currentSongTime - gameState.firstNoteTime) / rate);
        gameState.currentNPS = (elapsedReal > 0.5) ? (count / elapsedReal).toFixed(1) : "0.0";

        if (parseFloat(gameState.currentNPS) > parseFloat(gameState.peakNPS)) {
            gameState.peakNPS = gameState.currentNPS;
        }

        gameState.npsHistory.push({ time: now, val: parseFloat(gameState.currentNPS) });
        if (gameState.npsHistory.length > 80) gameState.npsHistory.shift();

        // Update DOM inside throttle
        setText('hud-nps', gameState.currentNPS);
        setText('hud-peak-nps', gameState.peakNPS);
    }

    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const maxVal = Math.max(10, parseFloat(gameState.peakNPS));

    gameState.npsHistory.forEach((p, i) => {
        const x = (i / 80) * w;
        const y = h - (p.val / maxVal * h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function gameLoop() {
    if (!gameState.isPlaying || (gameState.isPaused && !gameState.singleFrameStep)) return;
    if (gameState.singleFrameStep) {
        gameState.singleFrameStep = false;
        // Logic will run once then next frame will start. 
        // We don't change isPaused here, so next frame recursion (requestAnimationFrame) will be blocked again.
        // However, we invoke requestAnimationFrame at the end.
    }

    // FPS / Latency Calculation
    const now = performance.now();
    const frameTime = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    // Throttle UI Update (every 200ms)
    if (typeof gameState.fpsTimer === 'undefined') gameState.fpsTimer = 0;
    gameState.fpsTimer += frameTime;

    if (gameState.fpsTimer >= 200) {
        const fps = frameTime > 0 ? 1000 / frameTime : 0;
        const fpsEl = document.getElementById('hud-fps-counter');
        if (fpsEl) {
            fpsEl.innerHTML = `<span style="color:#fff">${Math.round(fps)}</span> FPS <span style="font-size:0.8em; color:#aaa">(${frameTime.toFixed(1)}ms)</span>`;
            // Color Coding
            if (fps < 30) fpsEl.style.color = '#ff3333';
            else if (fps < 55) fpsEl.style.color = '#ffcc00';
            else fpsEl.style.color = 'rgba(255, 255, 255, 0.5)';
        }
        gameState.fpsTimer = 0;
    }

    // Main game logic block
    {
        let currentTime = 0;
        const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;

        if (gameState.mode === 'stretch' && gameState.audioEl) {
            if (!gameState.audioEl.paused) {
                currentTime = gameState.audioEl.currentTime;
            } else if (Date.now() < gameState.startTime) {
                // Countdown phase
                currentTime = (Date.now() - gameState.startTime) / 1000 * rate;
            }
            // Check end
            if (gameState.audioEl.ended) {
                // Handle finish similar to audioSource.onended or simple timeout check
            }
        } else {
            // Vinyl Mode
            currentTime = (audioCtx.currentTime - gameState.startTime) * rate;
        }

        // --- AUDIO OFFSET APPLICATION ---
        if (userConfig.globalOffset) {
            currentTime += (userConfig.globalOffset / 1000);
        }

        // Cache this for HUD elements and rendering
        gameState.lastCalculatedTime = currentTime;

        // --- SYNC INSTRUCTION FADE-IN ---
        if (window.isSyncMode) {
            const instr = document.getElementById('sync-instruction');
            if (instr) {
                // Fade in between 4s and 5s
                if (currentTime > 4.0) {
                    const opacity = Math.min(1, currentTime - 4.0);
                    instr.style.opacity = opacity.toString();
                } else {
                    instr.style.opacity = '0';
                }
            }
        }


        // --- SYNC CALIBRATION LOOP (Retry-based approach) ---
        if (window.isSyncMode) {
            // Update Sync Stats UI
            if (typeof lastSyncCount === 'undefined' || lastSyncCount !== window.syncBuffer.length) {
                updateSyncStats();
                lastSyncCount = window.syncBuffer.length;
            }

            // Check if chart ended - if so, restart via retry
            const lastNote = gameState.notes[gameState.notes.length - 1];
            if (lastNote && currentTime > lastNote.time + 1.0) {


                // Stop current game
                if (window.audioSource) try { window.audioSource.stop(); } catch (e) { }
                if (gameState.audioEl) { gameState.audioEl.pause(); gameState.audioEl = null; }
                gameState.isPlaying = false;

                // Restart the chart using the normal game start function
                startGameFromMenu().catch(e => console.error('[SYNC] Restart failed:', e));

                // Exit game loop - it will restart with fresh state
                return;
            }
        }

        // Speed is handled by updateScrollSpeed() called on init and rate change.
        // Removed inline override that was causing rate scaling issues.

        gameState.globalFrame++;

        // Update BPM Display
        if (gameState.chart && gameState.chart.bpms) {
            // Find BPM at current time.
            // Since converting Time -> Beat is complex with stops/warps, 
            // and we prioritize performance, let's approximate or use pre-calculated events if available.
            // Ideally, we'd have a 'cursor' for BPMs.
            // Let's use a cached index `gameState.bpmIndex`.
            if (typeof gameState.bpmIndex === 'undefined') gameState.bpmIndex = 0;

            const bpms = gameState.chart.bpms;
            // Advance cursor
            // Note: bpms are usually in BEATS. We have TIME.
            // We need the `time` for each BPM change.
            // If the parser didn't calculate absolute times for BPM changes, we are stuck.
            // The provided parser usually does `calculateTimingData`?
            // If `gameState.chart.bpms` has `.time` prop, we are good.
            // Let's Assume they might NOT. 
            // If they don't, we can't easily display LIVE BPM without sync logic.
            // *Fallback*: Display the initial BPM or a fixed value if generic.
            // *Check*: parsedSM usually has beat/value.
            // *Recovery*: If we can't do live, verify if user accepts static.
            // *Better*: Let's peek at `gameState.activeNotes`. They have `beat` and `time`.
            // We can interpolate currentBeat from nearby notes?

            // Let's fallback to `gameState.startingBPM` inside `initGame` logic if we can't find it.
            // But wait, user requested "current difficulty... as well as the BPM".
            // It likely implies live BPM.

            // Let's assume for this task that we can just display the initial for now if complexity is high,
            // OR check if we have `timingData` with times.
            // If I look at `initGame`, `calculateDetailedDifficulty` uses notes.

            // Let's try to update it if `gameState.currentBPM` is set by other logic (e.g. scroll update).
            if (gameState.currentBPM) {
                setText('hud-val-bpm', Math.round(gameState.currentBPM));
            }
        }

        // Update BPM Display
        if (gameState.chart && gameState.chart.bpms) {
            let currentBPM = 120;
            if (typeof getCurrentBPM === 'function') {
                currentBPM = getCurrentBPM();
            } else if (gameState.chart.bpms.length > 0) {
                currentBPM = gameState.chart.bpms[0].bpm || gameState.chart.bpms[0].value || 120;
            }

            const displayBPM = currentBPM * rate;

            // Throttle BPM Text Update (every 200ms)
            if (gameState.fpsTimer === 0) {
                if (!gameState.lastBPMUpdateVal || Math.abs(gameState.lastBPMUpdateVal - displayBPM) > 0.01) {
                    setText('hud-val-bpm', displayBPM.toFixed(2));
                    gameState.lastBPMUpdateVal = displayBPM;
                }
            }
        }

        // --- AUTOPLAY LOGIC ---
        if (gameState.isAutoplay) {
            gameState.heldKeys = [false, false, false, false];
            // Scan for new hits and maintain holds
            for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
                const n = gameState.activeNotes[i];

                // Optimization: Don't scan too far into future
                if (n.time > currentTime + 0.1) break;

                // 1. Hit new notes at perfect timing (0.00ms offset)
                if (!n.processed && n.holdState !== 'active' && n.type !== 'mine') {
                    // Hit the note when currentTime is very close to note time (within 1ms)
                    const timeDiff = (n.time - currentTime) * 1000; // Convert to ms
                    if (Math.abs(timeDiff) <= 1) {
                        // Hit at exactly the note time for 0.00ms offset
                        processInput(n.col, 'down', n.time, rate);
                        setTimeout(() => processInput(n.col, 'up', n.time, rate), 50);
                    }
                }
                // 2. Maintain active Holds/Rolls
                if ((n.type === 'hold' || n.type === 'roll') && n.holdState === 'active') {
                    // processInput handles hold maintenance if 'down' is sent? 
                    // processInput logic sets holds[col]=true but doesn't re-trigger hit.
                    // But it updates roll lastPressTime? 
                    // Actually the roll logic in processInput is: IF keydown, update lastPressTime.
                    // Autoplay simulates KEY HOLD.
                    gameState.heldKeys[n.col] = true;
                    if (n.type === 'roll') n.lastPressTime = currentTime;
                }
            }
        }

        // --- REPLAY LOGIC ---
        if (gameState.isReplay && gameState.replayLog) {
            const log = gameState.replayLog;
            // Process events up to current time
            while (gameState.replayIndex < log.length) {
                const evt = log[gameState.replayIndex];
                // Check time. evt.t is Song Time.
                if (evt.t <= currentTime) {
                    // Apply Event
                    const type = evt.e === 1 ? 'down' : 'up';
                    processInput(evt.c, type, currentTime, rate);
                    gameState.replayIndex++;
                } else {
                    break;
                }
            }
        }


        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update First Active Note (Skip old processed notes)
        // Note: hit/missed notes set .processed=true.
        while (gameState.firstActiveNoteIndex < gameState.activeNotes.length) {
            if (!gameState.activeNotes[gameState.firstActiveNoteIndex].processed) break;
            gameState.firstActiveNoteIndex++;
        }

        // Pre-calculate active holds for this frame to optimize drawReceptor
        gameState.colsActive = [false, false, false, false];

        // Determine visible Window
        // Reuse static array to reduce GC
        if (!gameState.visibleNotesCache) gameState.visibleNotesCache = [];
        const visibleNotes = gameState.visibleNotesCache;
        visibleNotes.length = 0;

        const maxVisibleTime = currentTime + (canvas.height / gameConfig.scrollSpeed) + 2.0; // Buffer

        for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
            const note = gameState.activeNotes[i];

            // Check for Active Hold
            if ((note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
                gameState.colsActive[note.col] = true;
            }

            // Keep active holds even if time < currentTime
            if (note.time > maxVisibleTime) {
                // Optimization: Stop iterating if future notes are off screen
                break;
            }

            visibleNotes.push(note);
        }



        // Cache rotation arrays to avoid recreation every frame
        if (!gameState.spriteRotations) gameState.spriteRotations = [90, 0, 180, 270];
        if (!gameState.vectorRotations) gameState.vectorRotations = [270, 180, 0, 90];
        const rotations = assets.loaded.arrowSprite ? gameState.spriteRotations : gameState.vectorRotations;

        ctx.save();
        for (let i = 0; i < 4; i++) {
            drawReceptor(i * gameConfig.columnWidth, gameConfig.receptorY, rotations[i], i);
        }
        ctx.restore();

        // Process & Draw Visible Notes
        for (let j = 0; j < visibleNotes.length; j++) {
            const note = visibleNotes[j];
            // --- HOLD LOGIC ---
            if ((note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {

                // 1. Check if finalized (reached end)
                if (currentTime >= note.endTime) {
                    note.holdState = 'ok';
                    triggerHoldJudgement(note, true, currentTime);

                    if (gameState.heldKeys[note.col]) {
                        if (!gameState.needsRelease) gameState.needsRelease = [false, false, false, false];
                        gameState.needsRelease[note.col] = true;
                    }
                    continue;
                }

                // 2. Check input status
                const keyHeld = gameState.heldKeys[note.col];

                if (note.type === 'hold') {
                    if (!keyHeld) {
                        if (!note.letGoTime) note.letGoTime = currentTime;
                        if ((currentTime - note.letGoTime) * 1000 > 250) {
                            note.holdState = 'ng';
                            triggerHoldJudgement(note, false, currentTime);
                            if (gameState.heldKeys[note.col]) {
                                if (!gameState.needsRelease) gameState.needsRelease = [false, false, false, false];
                                gameState.needsRelease[note.col] = true;
                            }
                        }
                    } else {
                        note.letGoTime = null;
                    }
                } else if (note.type === 'roll') {
                    const limit = 0.5;
                    const timeDiff = currentTime - note.lastPressTime;
                    if (timeDiff > limit) {
                        note.holdState = 'ng';
                        triggerHoldJudgement(note, false, currentTime);
                        if (gameState.heldKeys[note.col]) {
                            if (!gameState.needsRelease) gameState.needsRelease = [false, false, false, false];
                            gameState.needsRelease[note.col] = true;
                        }
                    } else {
                        note.rollAlpha = Math.max(0.2, 1 - (timeDiff / limit));
                    }
                }
            }

            if (note.processed && note.holdState !== 'active' && note.holdState !== 'missed') continue;

            if (note.holdState === 'missed' && currentTime > note.endTime + 0.5) {
                note.processed = true;
                continue;
            }

            const timeDiff = note.time - currentTime;

            // Mine Logic
            if (note.type === 'mine' && !note.processed) {
                const realMsDiff = (timeDiff * 1000) / rate;
                if (Math.abs(realMsDiff) <= J_MINE_WINDOW) {
                    if (gameState.heldKeys[note.col] && !gameState.isAutoplay) {
                        triggerJudgement(note, realMsDiff, false, currentTime);
                    }
                }
                if (realMsDiff < -J_MINE_WINDOW) { note.processed = true; continue; }
            }

            // AUTO PLAY LOGIC
            if (gameState.isAutoplay && !note.processed && !note.hit && note.type !== 'mine') {
                if (timeDiff <= 0) {
                    note.hit = true;
                    gameState.heldKeys[note.col] = true;
                    triggerJudgement(note, 0, false, currentTime);
                    if (note.type === 'hold' || note.type === 'roll') {
                        note.holdState = 'active';
                    } else {
                        setTimeout(() => gameState.heldKeys[note.col] = false, 50);
                    }
                    continue;
                }
            }

            if (gameState.isAutoplay && (note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
                gameState.heldKeys[note.col] = true;
                if (currentTime >= note.endTime) {
                    gameState.heldKeys[note.col] = false;
                }
            }

            // MISS CHECK
            if (timeDiff < -((J_MISS_WINDOW / 1000) * rate) && !note.hit && note.type !== 'mine' && note.holdState === 'inactive') {
                note.processed = true;
                triggerJudgement(note, J_MISS_WINDOW + 1, true, currentTime);
                continue;
            }

            let y;
            const scrollDist = timeDiff * gameConfig.scrollSpeed;
            if (userConfig.downScroll) y = gameConfig.receptorY - scrollDist;
            else y = gameConfig.receptorY + scrollDist;

            // Visibility Check
            let noteTop = y;
            let noteBottom = y;

            if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
                const duration = note.endTime - note.time;
                const distTotal = duration * gameConfig.scrollSpeed;
                if (userConfig.downScroll) noteTop = y - distTotal; else noteBottom = y + distTotal;
            }

            if (noteBottom > -100 && noteTop < canvas.height + 100) {
                drawNote(note, y, rotations[note.col], currentTime);
            }
        }

        // --- RENDER HOLD EXPLOSIONS ON TOP ---
        for (let i = 0; i < 4; i++) {
            drawHoldExplosion(i * gameConfig.columnWidth, gameConfig.receptorY, rotations[i], i, currentTime);
        }

        drawErrorBar(currentTime);
        drawNPSGraph(currentTime);

        // Cache totalTime to avoid repeated array access
        if (!gameState.cachedTotalTime) {
            gameState.cachedTotalTime = gameState.notes[gameState.notes.length - 1].time;
        }
        const totalTime = gameState.cachedTotalTime;

        // Throttle Progress Bar & Time Updates (every 500ms to reduce DOM manipulation)
        if (!gameState.lastTimeUpdate || now - gameState.lastTimeUpdate > 500) {
            // Progress bar uses Song Time %
            const prog = Math.min(100, Math.max(0, (currentTime / totalTime) * 100));
            const progEl = document.getElementById('progress-bar');
            if (progEl) progEl.style.width = prog + "%";

            // Update time display
            const formatTime = (t) => {
                t = Math.max(0, t);
                const m = Math.floor(t / 60);
                const s = Math.floor(t % 60).toString().padStart(2, '0');
                return `${m}:${s} `;
            };

            setText('time-elapsed', formatTime(currentTime / rate));
            setText('time-total', formatTime(totalTime / rate));
            gameState.lastTimeUpdate = now;
        }

    } // End main game logic block

    // Use requestAnimationFrame for smooth, consistent frame timing
    // RAF syncs to your display's refresh rate (60Hz, 144Hz, 240Hz, etc.)
    requestAnimationFrame(gameLoop);
}



function openSettings() {
    setScreen('settings-modal');

    // Mute Audio in Settings
    if (typeof previewAudio !== 'undefined' && previewAudio) {
        previewAudio.pause();
    }
    // Also stop chart preview loop
    if (typeof previewLoopId !== 'undefined' && previewLoopId) {
        cancelAnimationFrame(previewLoopId);
    }

    // Update Buttons
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`key-btn-${i}`);
        if (btn) btn.innerText = userConfig.keys[i].toUpperCase();
    }

    // Update System Key Buttons
    const map = { 'pause': 'keyPause', 'retry': 'keyRetry', 'rateUp': 'keyRateUp', 'rateDown': 'keyRateDown' };
    for (let k in map) {
        const btn = document.getElementById(`key-btn-${k}`);
        if (btn) {
            const confKey = userConfig[map[k]];
            let label = k.replace('rate', 'Rate ').replace('key', '');
            label = label.charAt(0).toUpperCase() + label.slice(1);
            if (k === 'rateUp') label = 'Rate +';
            if (k === 'rateDown') label = 'Rate -';
            btn.innerText = `${label}: ${confKey}`;
        }
    }

    // Init Diff States
    if (!userConfig.judgeDifficulty) userConfig.judgeDifficulty = 4;
    if (!userConfig.lifeDifficulty) userConfig.lifeDifficulty = 4;

    updateSettingsPreview();

    // Start Key Test Listener
    if (!window.keyTestListener) {
        window.keyTestListener = (e) => {
            if (document.getElementById('settings-modal').style.display === 'none') return;
            // Visual Feedback for Columns
            const colIndex = userConfig.keys.indexOf(e.key.toLowerCase());
            if (colIndex !== -1) {
                const el = document.getElementById(`test - col - ${colIndex} `);
                if (el) {
                    if (e.type === 'keydown') el.classList.add('active');
                    else el.classList.remove('active');
                }
            }
        };
        window.addEventListener('keydown', window.keyTestListener);
        window.addEventListener('keyup', window.keyTestListener);
    }

    // Initialize offset display
    const offsetDisplay = document.getElementById('val-global-offset');
    if (offsetDisplay) {
        const currentOffset = userConfig.globalOffset || 0;
        offsetDisplay.innerText = currentOffset.toFixed(0) + "ms";
    }
}
window.openSettings = openSettings;

function setJudgeDiff(val) { userConfig.judgeDifficulty = val; updateSettingsPreview(); }
window.setJudgeDiff = setJudgeDiff;

function setLifeDiff(val) { userConfig.lifeDifficulty = val; updateSettingsPreview(); }
window.setLifeDiff = setLifeDiff;

function saveSettings() {
    localStorage.setItem('webSM_config', JSON.stringify(userConfig));
    setScreen('setup-panel');
}
window.saveSettings = saveSettings;

function updateSettingsPreview() {
    const jDiff = userConfig.judgeDifficulty || 4;
    const lDiff = userConfig.lifeDifficulty || 4;

    // Update Buttons
    const updateBtns = (id, val) => {
        const group = document.getElementById(id);
        if (group) {
            group.querySelectorAll('.mod-toggle-btn').forEach(b => {
                if (parseInt(b.dataset.val) === val) b.classList.add('active');
                else b.classList.remove('active');
            });
        }
    };
    updateBtns('set-judge-group', jDiff);
    updateBtns('set-life-group', lDiff);

    // Detailed Stats
    const container = document.getElementById('settings-detailed-stats');
    if (container) {
        // Calc Windows
        const windows = ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'];

        // Calc Life Multipliers
        const lossMult = Math.max(0.1, 1.0 + (lDiff - 4) * 0.2);
        const gainMult = Math.max(0.1, 1.0 - (lDiff - 4) * 0.1);

        const lifeVals = {
            marvelous: (1.0 * gainMult).toFixed(2),
            perfect: (0.8 * gainMult).toFixed(2),
            great: (0.4 * gainMult).toFixed(2),
            good: "0.00",
            bad: (-4.0 * lossMult).toFixed(2),
            miss: (-8.0 * lossMult).toFixed(2)
        };

        const colors = {
            marvelous: "#a3f7ff", perfect: "#ffe600", great: "#44ff4b",
            good: "#0099ff", bad: "#aa00ff", miss: "#ff3333"
        };

        let html = `
            <table class="det-stats-table">
                <thead><tr style="color:#888; border-bottom:1px solid #444; font-size:0.8rem;">
                    <th style="padding:5px; text-align:left;">Judge</th>
                    <th style="padding:5px; text-align:right;">Window</th>
                    <th style="padding:5px; text-align:right;">Life</th>
                </tr></thead>
                <tbody>
        `;

        windows.forEach(w => {
            const ms = getTimingWindow(w, jDiff).toFixed(1);
            let lVal = lifeVals[w];
            let lColor = parseFloat(lVal) >= 0 ? "#44ff4b" : "#ff3333";
            if (parseFloat(lVal) > 0) lVal = "+" + lVal;
            const jColor = colors[w];

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:6px 5px; color:${jColor}; font-weight:bold; letter-spacing:1px; font-size:0.9rem;">${w.toUpperCase()}</td>
                    <td style="padding:6px 5px; text-align:right; color:#ccc;">${ms}ms</td>
                    <td style="padding:6px 5px; text-align:right; color:${lColor}; font-weight:bold;">${lVal}%</td>
                </tr>
            `;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }
}
window.updateSettingsPreview = updateSettingsPreview;


function togglePause() {
    if (!gameState.isPlaying || gameState.failed) return;

    // Prevent pause during countdown (negative time)
    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    let cTime = 0;
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        cTime = !gameState.audioEl.paused ? gameState.audioEl.currentTime : ((Date.now() - gameState.startTime) / 1000 * rate);
    } else if (audioCtx) {
        cTime = (audioCtx.currentTime - gameState.startTime) * rate;
    }
    if (cTime < 0) return;

    if (gameState.isPaused) {
        // Resume handled by resumeGame
        resumeGame();
    } else {
        // Pause
        gameState.isPaused = true;
        gameState.pauseStartTime = Date.now();

        if (gameState.mode === 'stretch' && gameState.audioEl) {
            gameState.audioEl.pause();
            // Check for Invalid Condition (Pause after first note)
            if (gameState.audioEl.currentTime >= gameState.firstNoteTime) {
                gameState.hasPausedDuringPlay = true;
            }
        } else if (audioCtx && audioCtx.state === 'running') {
            // Clear Type Logic
            let fcType = "Clear";
            if (gameState.failed) fcType = "Failed";
            else if (gameState.judgments.miss === 0 && gameState.judgments.bad === 0 && gameState.judgments.good === 0 && gameState.judgments.great === 0 && gameState.judgments.perfect === 0) fcType = "MFC";
            else if (gameState.judgments.miss === 0 && gameState.judgments.bad === 0 && gameState.judgments.good === 0 && gameState.judgments.great === 0) fcType = "PFC"; // All Marvelous/Perfect
            else if (gameState.judgments.miss === 0 && gameState.judgments.bad === 0 && gameState.judgments.good === 0) fcType = "SDP"; // Single Digit Perfect (Wait, standard is Greats allowed? usually SDP means score based? Let's assume FC variants)
            // Simplified FC logic
            else if (gameState.judgments.miss === 0 && gameState.judgments.bad === 0 && gameState.judgments.good === 0) fcType = "FC";
            else if (gameState.judgments.miss === 0 && gameState.judgments.bad === 0) fcType = "SDG"; // Single Digit Good? No, usually SDG is Single Digit Great.
            // Let's stick to simple: Failed vs Clear vs FC types

            // Check Invalid
            // Note: accPct is not defined in this scope. Assuming it's defined elsewhere or needs to be calculated.
            // For now, commenting out the accPct check to avoid errors.
            // if (!gameState.failed && (accPct < 83 || gameState.pauseCount > 0)) {
            //     fcType = "Invalid";
            // }

            const clearEl = document.getElementById('res-clear-type');
            if (clearEl) {
                clearEl.innerText = getClearText(fcType); // Cosmetic Mapping
                clearEl.style.color = CLEAR_COLORS[fcType] || "#fff";
                // Cosmetic Mapping might mismatch CLEAR_COLORS key?
                // If getClearText returns "Assist Easy", we don't have a color for that?
                // We should add colors or fallback. 
                // For now, it uses 'undefined' -> white. Acceptable custom colors.
            }

            // Set Initial Judge Label (Live played diff)
            const judgeDiff = userConfig.judgeDifficulty || 4;
            setText('res-judge-label', `J${judgeDiff} `);
            document.getElementById('res-judge-label').style.display = 'inline';

            // Store hits for Re-Judge Toggle
            lastDetailedHits = [...gameState.detailedHits];
            resultViewJudge = judgeDiff; // Init view to played diff
            audioCtx.suspend();
            // Check for Invalid Condition (Pause after first note)
            const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
            const cTime = (audioCtx.currentTime - gameState.startTime) * rate;
            if (cTime >= gameState.firstNoteTime) {
                gameState.hasPausedDuringPlay = true;
            }
        }

        document.getElementById('pause-menu').style.display = 'flex';

        // Populated Pause Stats
        setText('pause-song-title', gameState.meta.title);
        setText('pause-song-artist', gameState.meta.artist);

        const currentAcc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed)) : 0;
        setText('pause-score', Math.round(gameState.score));
        setText('pause-acc', currentAcc.toFixed(2) + "%");
        setText('pause-combo', gameState.combo);
        setText('pause-count-val', gameState.pauseCount + 1);

        // Mini Judges
        const judges = ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'];
        const judgesContainer = document.getElementById('pause-judges');
        if (judgesContainer) {
            judgesContainer.innerHTML = judges.map(j => `
                <div class="p-mini-judge-item">
                    <span class="p-mini-judge-val judge-${j}">${gameState.judgments[j]}</span>
                    <span style="font-size:0.6rem; color:#666; text-transform:uppercase;">${j.substr(0, 3)}</span>
                </div>
                `).join('');
        }

        // Show Overlay (Already done above, removing duplicate)

        // Note: gameState.pauseStartTime already updated above with Date.now() for generic use, 
        // but audioCtx.currentTime logic was specific to Vinyl. 
        // We can ignore the legacy line since we branch on Resume.
    }
}
window.togglePause = togglePause;

function resumeGame() {
    if (!gameState.isPaused) return;
    gameState.isPaused = false;
    gameState.pauseCount++;

    // Resume Audio
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        gameState.audioEl.play();
    } else if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    document.getElementById('pause-menu').style.display = 'none';
    requestAnimationFrame(gameLoop);
}
window.resumeGame = resumeGame;

function retryCurrentChart() {
    if (!gameState || !gameState.isPlaying) return;

    // Stop current audio
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        gameState.audioEl.pause();
        gameState.audioEl.currentTime = 0;
    } else if (audioSource) {
        audioSource.stop();
        audioSource = null;
    }

    // Hide pause menu if open
    document.getElementById('pause-menu').style.display = 'none';

    // Store current settings
    const isAutoplay = gameState.isAutoplay;

    // Get the current song and chart from the library
    const song = songLibrary[selectedSongIndex];
    if (!song || !song.audioBlob) {
        alert("Audio not available for retry.");
        quitGame();
        return;
    }

    // Find the original chart from the library
    const chartDifficulty = gameState.chart.difficulty;
    const chart = song.charts.find(c => c.difficulty === chartDifficulty);

    if (!chart) {
        alert("Chart not found for retry.");
        quitGame();
        return;
    }

    // Calculate difficulty if not already done
    if (!chart.difficultyCalc) {
        chart.difficultyCalc = calculateDetailedDifficulty(chart.notes);
    }

    const audioUrl = URL.createObjectURL(song.audioBlob);

    // Reinitialize the game with the same settings
    audioCtx = new AudioContext();
    fetch(audioUrl)
        .then(res => res.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(decoded => {
            // Apply chart transformations (same as startGameFromMenu)
            const finalNotes = applyChartTransforms(chart.notes);
            const gameChart = { ...chart, notes: finalNotes };

            initGame(gameChart, decoded, song.meta, chart.difficultyCalc, audioUrl);
            if (isAutoplay) {
                gameState.isAutoplay = true;
                document.getElementById('autoplay-indicator').style.display = 'block';
            }
            startEngine();
        })
        .catch(e => {
            console.error("Retry failed:", e);
            alert("Failed to retry: " + e.message);
            quitGame();
        });
}
window.retryCurrentChart = retryCurrentChart;

// RATE CONTROL LOGIC
// RATE CONTROL LOGIC
window.addEventListener('keydown', (e) => {
    // Only allow global rate control if not binding keys
    if (bindingIndex !== -1) return;

    // Use User Config
    // keyRateUp/Down are stored as keys (characters)
    const kUp = userConfig.keyRateUp || '=';
    const kDown = userConfig.keyRateDown || '-';

    if (e.key === kDown || e.key === '_') { // Keep _ as fallback? or strict? Strict better for rebinds.
        changeRateVal(-1);
    } else if (e.key === kUp || e.key === '+') {
        changeRateVal(1);
    }
});

// Callback from modifiers.js changeRateVal
window.onRateChange = (newRate) => {
    updatePreviewAudioSettings();

    // Update Banner Display
    const bannerBadge = document.getElementById('ss-rate-badge');
    if (bannerBadge) {
        if (Math.abs(newRate - 1.0) > 0.001) {
            bannerBadge.style.display = 'block';
            bannerBadge.innerText = newRate.toFixed(2) + "x";
        } else {
            bannerBadge.style.display = 'none';
        }
    }

    // Update Difficulty Stats if on Song Select and chart selected
    if (typeof selectedSongIndex !== 'undefined' && selectedSongIndex !== -1 &&
        typeof selectedChartIndex !== 'undefined' && selectedChartIndex !== -1) {

        const song = songLibrary[selectedSongIndex];
        if (song && song.charts && song.charts[selectedChartIndex]) {
            const chart = song.charts[selectedChartIndex];
            if (chart.notes) {
                const calc = calculateDetailedDifficulty(chart.notes);
                // Helper to set Text and Color
                const setC = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.innerText = val.toFixed(2);
                        el.style.color = getDifficultyColor(val);
                        el.style.textShadow = `0 0 10px ${getDifficultyColor(val)} `;
                    }
                };

                setText('calc-nps', calc.nps.toFixed(2)); // NPS isn't diff, usually white or styled differently? Keeping default or applying color? NPS != Diff. Let's keep NPS standard or yellow.
                // calc-peak is NPS peak.
                setText('calc-peak', calc.peak.toFixed(2));

                setC('calc-overall', calc.overall);
                setC('calc-stream', calc.stream);
                setC('calc-jumpstream', calc.jumpstream);
                setC('calc-handstream', calc.handstream);
                setC('calc-chordjack', calc.chordjack);
                setC('calc-technical', calc.technical);
                setC('calc-stamina', calc.stamina);
            }

            // Refresh Best Score Display (Rate-Dependent)
            selectDifficulty(selectedChartIndex);
        }
    }
    updateScrollSpeed(newRate);
};

function handleInput(e) {
    // --- KEY BINDING CAPTURE ---
    if (bindingIndex !== -1) {
        if (e.type === 'keydown') {
            e.preventDefault();
            const code = e.code;

            // Cancel on Escape (unless binding pause)
            if (code === 'Escape' && bindingType !== 'pause') {
                bindingIndex = -1;
                bindingType = null;
                alert("Binding Cancelled");
                // Refresh UI text (hacky restore)
                openSettings(); // Reloads settings UI text
                return;
            }

            if (bindingIndex >= 0) {
                // Column Bind
                userConfig.keys[bindingIndex] = e.key.toLowerCase(); // Use key for input check? Logic uses e.key.toLowerCase() at 4140. 
                // Wait, logic at 4140 uses: const key = e.key.toLowerCase(); const colIndex = userConfig.keys.indexOf(key);
                // So we store e.key.toLowerCase().
                userConfig.keys[bindingIndex] = e.key.toLowerCase();
                document.getElementById('key-btn-' + bindingIndex).innerText = e.code.replace('Key', '');
            } else if (bindingType) {
                // System Bind
                if (bindingType === 'pause') userConfig.keyPause = code;
                if (bindingType === 'retry') userConfig.keyRetry = code;
                if (bindingType === 'rateUp') userConfig.keyRateUp = code;
                if (bindingType === 'rateDown') userConfig.keyRateDown = code;

                // Update Button Text
                const label = (bindingType === 'pause') ? "Pause" :
                    (bindingType === 'retry') ? "Retry" :
                        (bindingType === 'rateUp') ? "Rate +" : "Rate -";
                // Mapping useful names
                let keyName = code.replace('Key', '').replace('Digit', '');
                document.getElementById('key-btn-' + bindingType).innerText = `${label}: ${keyName}`;
            }

            saveUserConfig();
            bindingIndex = -1;
            bindingType = null;
        }
        return;
    }

    // --- SETTINGS KEY PREVIEW ---
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && settingsModal.style.display !== 'none') {
        if (e.type === 'keydown' || e.type === 'keyup') {
            const key = e.key.toLowerCase();
            const col = userConfig.keys.indexOf(key);
            if (col !== -1) {
                const testEl = document.getElementById('test-col-' + col);
                if (testEl) {
                    if (e.type === 'keydown') {
                        testEl.style.background = '#00e5ff';
                        testEl.style.boxShadow = '0 0 15px #00e5ff';
                    } else {
                        testEl.style.background = 'rgba(255,255,255,0.1)';
                        testEl.style.boxShadow = 'none';
                    }
                }
            }
        }
        // Don't return, allow other system keys? Usually settings blocks game input.
        // But we want to prevent game input behind settings.
        return;
    }

    // Custom Bindings
    const pauseKey = userConfig.keyPause || 'Escape';
    const retryKey = userConfig.keyRetry || 'Backquote';

    if (e.code === pauseKey) {
        if (gameState.isAutoplay) {
            quitGame();
            return;
        }

        // --- SYNC MODE EXIT LOGIC ---
        // SYNC MODE: Don't show results, rely on loop logic
        if (window.isSyncMode) {
            if (e.type !== 'keydown') return;

            // Calculate Suggested Offset based on VALID Batches
            let suggestedCorrection = 0;
            const validCount = (window.validBatches || []).length;
            const totalCount = (window.syncHistory || []).length;

            if (validCount > 0) {
                suggestedCorrection = window.validBatches.reduce((a, b) => a + b, 0) / validCount;
            }

            let msg = "Exit Sync Calibration?\n(No changes will be applied)";

            if (validCount > 0) {
                const finalOffset = userConfig.globalOffset + suggestedCorrection;
                msg = `Exit and Apply Recommended Offset?\n\n` +
                    `Valid Batches: ${validCount} / ${totalCount}\n` +
                    `Suggested Correction: ${suggestedCorrection.toFixed(2)}ms\n\n` +
                    `Current Global Offset: ${userConfig.globalOffset.toFixed(0)}ms\n` +
                    `New Global Offset: ${finalOffset.toFixed(0)}ms`;
            } else if (totalCount > 0) {
                msg = `Exit Sync Calibration?\n\nWarning: No valid batches were collected (SD was too high).\nNo changes will be applied.`;
            }

            if (validCount > 0 && confirm(msg)) {
                // Apply
                adjustGlobalOffset(suggestedCorrection); // adjustGlobalOffset handles delta
                saveUserConfig();

                // Exit Sync Mode
                window.isSyncMode = false;
                window.syncBuffer = [];
                window.syncBatch = [];
                window.validBatches = [];
                window.syncHistory = [];

                // Restore UI
                const overlay = document.getElementById('sync-overlay');
                if (overlay) overlay.style.display = 'none';
                const instr = document.getElementById('sync-instruction');
                if (instr) instr.remove();

                quitGame();
                // Redirect back to settings
                setTimeout(() => { openSettings(); switchSettingsTab('audio'); }, 100);
            } else if (validCount === 0 && confirm(msg)) {
                // Just exit
                window.isSyncMode = false;
                window.syncBuffer = [];
                window.syncBatch = [];
                window.validBatches = [];
                window.syncHistory = [];

                const overlay = document.getElementById('sync-overlay');
                if (overlay) overlay.style.display = 'none';
                const instr = document.getElementById('sync-instruction');
                if (instr) instr.remove();

                quitGame();
                // Redirect back to settings
                setTimeout(() => { openSettings(); switchSettingsTab('audio'); }, 100);
            } else if (validCount > 0) {
                // Cancelled application - Discard changes and exit
                window.isSyncMode = false;
                window.syncBuffer = [];
                window.syncBatch = [];
                window.validBatches = [];
                window.syncHistory = [];

                const overlay = document.getElementById('sync-overlay');
                if (overlay) overlay.style.display = 'none';
                const instr = document.getElementById('sync-instruction');
                if (instr) instr.remove();

                quitGame();
                setTimeout(() => { openSettings(); switchSettingsTab('audio'); }, 100);
            }
            return;
        }

        if (e.type === 'keydown') togglePause();
        return;
    }
    // Quick Retry
    if (e.code === retryKey && e.type === 'keydown') {
        retryCurrentChart();
        return;
    }
    if (!gameState.isPlaying || gameState.isPaused) return;

    // Determine Rate and Current Time (Song Time)
    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    let currentTime = 0;
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        if (!gameState.audioEl.paused) {
            currentTime = gameState.audioEl.currentTime;
        } else if (Date.now() < gameState.startTime) {
            // Countdown phase
            currentTime = (Date.now() - gameState.startTime) / 1000 * rate;
        }
    } else {
        currentTime = (audioCtx.currentTime - gameState.startTime) * rate;
    }

    const key = e.key.toLowerCase();
    const colIndex = userConfig.keys.indexOf(key);
    if (colIndex === -1) return;

    // BLOCK INPUT IF AUTOPLAY or REPLAY
    if (gameState.isAutoplay || gameState.isReplay) return;

    const type = e.type === 'keydown' ? 'down' : 'up';

    // RECORDING
    if (!gameState.failed && !gameState.isPaused) {
        // Simple compression: t=time, c=col, e=event(0:down, 1:up)
        // Store string fixed to save space? or number? Number is fine JSON handles it.
        // using '1' and '0' for type might be slightly smaller in JSON than 'down'/'up'
        gameState.replayLog.push({
            t: parseFloat(currentTime.toFixed(3)),
            c: colIndex,
            e: type === 'down' ? 1 : 0
        });
    }

    processInput(colIndex, type, currentTime, rate);

} window.addEventListener('keydown', handleInput); window.addEventListener('keyup', handleInput); window.addEventListener('resize', () => { if (gameState.isPlaying) setupCanvas(); });

function processInput(colIndex, type, currentTime, rate) {
    if (type === 'down') {
        // Check if this column needs a fresh press (e.g., after a hold ended with key still held)
        if (gameState.needsRelease && gameState.needsRelease[colIndex]) {
            // Ignore this input - we need a key release first
            return;
        }

        gameState.heldKeys[colIndex] = true;

        // Optimization: Find active roll to start holding
        for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
            const n = gameState.activeNotes[i];
            // Fix: Use Song Time for optimization check
            if (n.time > currentTime + (2.0 * rate)) break;

            if (n.col === colIndex && n.type === 'roll' && n.holdState === 'active') {
                n.lastPressTime = currentTime;
                break;
            }
        }

        // Hit Detection
        // Find Hittable Note
        let hittableNote = null;
        const windowSeconds = (J_BAD / 1000) * rate; // Scale window to Song Time

        for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
            const n = gameState.activeNotes[i];
            if (n.processed) continue;
            if (n.holdState === 'active') continue;

            // Song Time Diff
            const diff = n.time - currentTime;

            if (diff > 2.0) break;
            if (diff < -2.0) continue;

            if (diff < -windowSeconds) continue; // Too old (Late)
            if (diff > windowSeconds) break; // Too far (Early)

            if (n.col === colIndex && n.type !== 'mine') {
                hittableNote = n;
                break;
            }
        }

        if (hittableNote) {
            hittableNote.hit = true;
            // Convert Song Time Diff to Real Time MS for Judgment
            const diffMs = (hittableNote.time - currentTime) * 1000 / rate;
            triggerJudgement(hittableNote, diffMs, false, currentTime);
        }

    } else {
        // type === 'up'
        gameState.heldKeys[colIndex] = false;

        // Clear the needsRelease flag when key is released
        if (gameState.needsRelease && gameState.needsRelease[colIndex]) {
            gameState.needsRelease[colIndex] = false;
        }
    }
}

// ** INITIALIZE GAME STATE **
function initGame(chartInfo, audioBuf, meta, diffStats, audioUrl) {
    gameState = {
        audioUrl: audioUrl, // Store URL
        score: 0,
        combo: 0,
        maxCombo: 0,
        life: (modConfig.lifeSystem === 'normal') ? 50 : 100,
        lifeBreaks: 0,
        judgments: { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, ok: 0, ng: 0, mine: 0 },
        accuracyHistory: [],
        lifeHistory: [],
        comboHistory: [],
        hitOffsets: [],
        hitSum: 0,
        hitCount: 0,
        recentHits: [],
        detailedHits: [],
        accumulatedAccuracyPoints: 0,
        totalNotesHitOrMissed: 0,
        isPlaying: true,
        startTime: 0,
        failed: false,
        paused: false,
        pauseTime: 0,
        totalPauseDuration: 0,
        pauseStartTime: 0,
        meta: meta,
        chart: chartInfo,
        totalNotesInChart: 0,
        difficultyStats: diffStats,
        firstActiveNoteIndex: 0,
        activeNotes: [],
        pauseCount: 0,
        isPaused: false,
        heldKeys: [false, false, false, false],
        npsHistory: [],
        currentNPS: 0,
        currentNPS: 0,
        peakNPS: 0,
        osuScore: 0,
        osuBonus: 100,
        replayLog: [],
        bpmTimes: [], // Pre-calculated time-based BPM segments
        isAutoplay: !!window.isAutoplayLaunch, // Set Autoplay State
        isReplay: !!window.isReplayLaunch,
        replayLog: window.replayData || [],
        replayIndex: 0,
        lastFrameTime: performance.now(),
        fpsTimer: 0
    };
    window.isAutoplayLaunch = false; // Reset flag
    window.isReplayLaunch = false;
    window.replayData = null;

    // TARGET TRACKER INIT
    gameState.targetTrackerPB = 0;
    if (modConfig.targetTracker && modConfig.targetTrackerMode === 'pb') {
        const key = `webSM_lb_${meta.title}_${chartInfo.difficulty}`;
        try {
            const saved = localStorage.getItem(key);
            let lb = [];
            if (saved) {
                const parsed = JSON.parse(saved);
                lb = Array.isArray(parsed) ? parsed : [parsed];
            }
            if (lb.length > 0 && lb[0].acc) {
                gameState.targetTrackerPB = parseFloat(lb[0].acc);
            } else {
                // Fallback to percent mode logic if no PB
                // We'll just use the PB value of 0, but set target to default val?
                // User requirement: "fallback to set percentage if there is no score set"
                gameState.targetTrackerPB = modConfig.targetTrackerVal; // Fallback
            }
        } catch (e) {
            gameState.targetTrackerPB = modConfig.targetTrackerVal;
        }
        gameState.targetTrackerTarget = gameState.targetTrackerPB;
    } else {
        gameState.targetTrackerTarget = modConfig.targetTrackerVal;
    }
    // Update Target Display in HUD
    const targetEl = document.getElementById('tracker-target');
    const trackerEl = document.getElementById('hud-tracker');
    if (modConfig.targetTracker) {
        if (trackerEl) trackerEl.style.display = 'flex';
        if (targetEl) targetEl.innerText = `Target: ${gameState.targetTrackerTarget.toFixed(2)}% `;
        // Init Diff to 0
        const diffEl = document.getElementById('tracker-diff');
        if (diffEl) {
            diffEl.innerText = "+0.00";
            diffEl.style.color = "#fff";
        }
    } else {
        if (trackerEl) trackerEl.style.display = 'none';
    }

    // Pre-calculate BPM logic for X/M mods
    if (meta.bpms) {
        let curTime = -meta.offset;
        let curBeat = 0;
        meta.bpms.sort((a, b) => a.beat - b.beat);

        let maxBPM = 0;

        for (let i = 0; i < meta.bpms.length; i++) {
            const bpm = meta.bpms[i];
            const nextBpm = meta.bpms[i + 1];

            // Time since last BPM
            if (i > 0) {
                const prev = meta.bpms[i - 1];
                const beats = bpm.beat - prev.beat;
                const seconds = beats * (60 / prev.value);
                curTime += seconds;
            }

            gameState.bpmTimes.push({ time: curTime, bpm: bpm.value });
            if (bpm.value > maxBPM) maxBPM = bpm.value;
        }
        gameState.maxBPM = maxBPM > 0 ? maxBPM : 150;
    } else {
        gameState.bpmTimes = [{ time: -meta.offset, bpm: 120 }];
        gameState.maxBPM = 120;
    }

    // Set Initial Speed
    updateScrollSpeed((typeof modConfig !== 'undefined' ? modConfig.rate : 1.0));

    setScreen('game-hud');
    document.getElementById('gameCanvas').style.display = 'block';
    setText('judgment', "");
    const comboEl = document.getElementById('combo');
    if (comboEl) {
        comboEl.style.visibility = 'hidden';
        comboEl.style.display = 'block'; // Ensure it takes up space
    }
    const accLabel = document.querySelector('.acc-box .label');
    if (accLabel) accLabel.style.display = 'none';
    setText('hit-mean', '0.00ms');
    setText('hud-title', meta.title);
    setText('hud-artist', meta.artist);

    // Apply Difficulty Coloring to HUD
    if (diffStats) {
        const el = document.getElementById('hud-val-diff');
        if (el) {
            el.innerText = diffStats.overall.toFixed(2);
            const c = getDifficultyColor(diffStats.overall);
            el.style.color = c;
            // Find parent container to apply shadow if desired, or just text
            const container = document.getElementById('hud-difficulty-display');
            if (container) {
                container.style.color = c;
                container.style.textShadow = `0 0 10px ${c} `;
            }
        }
    }

    document.getElementById('failed-overlay').style.display = 'none';
    updateJudgmentTracker();
    updateScoreDisplay();

    // FPS Counter UI Setup
    const hud = document.getElementById('game-hud');
    if (hud) {
        let fpsEl = document.getElementById('hud-fps-counter');
        if (!fpsEl) {
            fpsEl = document.createElement('div');
            fpsEl.id = 'hud-fps-counter';
            fpsEl.style.position = 'absolute';
            fpsEl.style.bottom = '10px';
            fpsEl.style.right = '10px';
            fpsEl.style.textAlign = 'right';
            fpsEl.style.fontFamily = "'Mochiy Pop One', 'Inter', sans-serif";
            fpsEl.style.fontSize = '1.0rem';
            fpsEl.style.fontWeight = 'bold';
            fpsEl.style.color = 'rgba(255, 255, 255, 0.5)';
            fpsEl.style.pointerEvents = 'none';
            fpsEl.style.zIndex = '100'; // Ensure it's above other HUD elements
            fpsEl.innerText = "";
            hud.appendChild(fpsEl);
        }
        fpsEl.style.display = 'block';
    }

    // REPLAY INIT
    if (gameState.isReplay) {
        // Inject Replay UI
        let rUI = document.getElementById('replay-ui-container');
        if (!rUI) {
            rUI = document.createElement('div');
            rUI.id = 'replay-ui-container';
            rUI.style.position = 'absolute';
            rUI.style.top = '60px';
            rUI.style.width = '100%';
            rUI.style.display = 'flex';
            rUI.style.flexDirection = 'column';
            rUI.style.alignItems = 'center';
            rUI.style.pointerEvents = 'none'; // Don't block clicks generally
            rUI.innerHTML = `
                <div style="background:rgba(255,0,0,0.8); color:white; padding:5px 15px; border-radius:4px; font-weight:bold; letter-spacing:2px; margin-bottom:10px; box-shadow:0 0 10px rgba(255,0,0,0.5);">REPLAY</div>
                <div style="pointer-events:auto; display:flex; gap:10px; background:rgba(0,0,0,0.7); padding:10px; border-radius:8px;">
                    <button onclick="stepReplay(-1)" style="background:#444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Hold to Seek (Paused)">⏪</button>
                    <button id="replay-play-btn" onclick="togglePause()" style="background:#00e5ff; color:black; border:none; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer; min-width:30px;">⏸</button>
                    <button onclick="stepReplay(1)" style="background:#444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Hold to Seek (Paused)">⏩</button>
                </div>
            `;
            document.body.appendChild(rUI);
        }

        // Update Play Button State
        const pBtn = document.getElementById('replay-play-btn');
        if (pBtn) pBtn.innerText = gameState.isPaused ? "▶" : "⏸";
    }

    // Autoplay UI
    const apInd = document.getElementById('autoplay-indicator');
    if (apInd) {
        apInd.style.display = gameState.isAutoplay ? 'block' : 'none';
        if (gameState.isAutoplay) {
            // Also hide combo initially or move it? 
            // Default position is fine.
        }
    }

    // Deep copy and apply Modifiers
    let notes = JSON.parse(JSON.stringify(chartInfo.notes));

    // Random / Turn
    if (typeof modConfig !== 'undefined' && modConfig.turn && modConfig.turn !== 'none') {
        const colMap = [0, 1, 2, 3];
        if (modConfig.turn === 'mirror') {
            // 0<->3, 1<->2
            colMap[0] = 3; colMap[1] = 2; colMap[2] = 1; colMap[3] = 0;
        } else if (modConfig.turn === 'shuffle') {
            // Random permutation
            for (let i = colMap.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [colMap[i], colMap[j]] = [colMap[j], colMap[i]];
            }
        }
        notes.forEach(n => { n.col = colMap[n.col]; });
    }

    gameState.notes = notes;
    gameState.activeNotes = gameState.notes; // For now all notes are "active" candidates
    gameState.totalNotesInChart = notes.filter(n => n.type !== 'mine').length;

    const firstNote = notes.find(n => n.type !== 'mine');
    gameState.firstNoteTime = firstNote ? firstNote.time : 0;
    gameState.hasPausedDuringPlay = false;

    // Fix: Add Event Listeners for Pause Menu Buttons
    const resumeBtn = document.getElementById('pause-resume-btn');
    const quitBtn = document.getElementById('pause-quit-btn');
    if (resumeBtn) resumeBtn.onclick = resumeGame;
    if (quitBtn) quitBtn.onclick = quitGame;

    // Start Audio
    audioBuffer = audioBuf; // Global ref update?
    startEngine();
}

function startEngine() {
    setupCanvas();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    const useVinyl = (typeof modConfig !== 'undefined' && modConfig.pitchShift !== undefined) ? modConfig.pitchShift : true;

    // cleanup previous
    // cleanup previous
    if (audioSource) { try { audioSource.stop(); } catch (e) { } audioSource = null; }
    if (gameState.audioEl) { gameState.audioEl.pause(); gameState.audioEl = null; }
    if (gameState.startTimeout) { clearTimeout(gameState.startTimeout); gameState.startTimeout = null; }

    if (useVinyl) {
        // --- VINYL MODE (Buffer Source) ---
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.playbackRate.value = rate;
        audioSource.onended = () => {
            if (gameState.isPlaying && !gameState.isPaused && !gameState.failed) {
                // Determine finish
            }
        };
        audioSource.connect(audioCtx.destination);
        audioSource.connect(audioCtx.destination);
        const startTime = audioCtx.currentTime + 3.0; // 3.0s delay
        audioSource.start(startTime);
        gameState.startTime = startTime;
        gameState.mode = 'vinyl';
    } else {
        // --- TIME STRETCH MODE (Audio Element) ---
        // Note: Chrome/Firefox use high-quality time stretching by default when preservesPitch is true (default).
        if (!gameState.audioUrl) {
            console.error("Audio URL missing for Time Stretch mode. Fallback to Vinyl.");
            modConfig.pitchShift = true; // force vinyl
            return startEngine();
        }
        gameState.audioEl = new Audio(gameState.audioUrl);
        gameState.audioEl.playbackRate = rate;
        gameState.audioEl.preservesPitch = true; // Specific property, usually default true

        const START_DELAY_MS = 3000;
        gameState.startTime = Date.now() + START_DELAY_MS;

        // Schedule play
        gameState.startTimeout = setTimeout(() => {
            gameState.audioEl.play().catch(e => console.error("Audio Play Error:", e));
            gameState.startTimeout = null;
        }, START_DELAY_MS);

        gameState.mode = 'stretch';
    }

    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.failed = false;
    gameState.life = 50;
    gameState.combo = 0;

    // Reset HUD Elements
    const jEl = document.getElementById('judgment');
    if (jEl) {
        jEl.className = '';
        jEl.innerText = '';
        jEl.style.removeProperty('opacity'); // Remove inline style so CSS class can control it
    }
    const cEl = document.getElementById('combo');
    if (cEl) {
        cEl.innerText = '';
        cEl.style.visibility = 'hidden'; // Hide combo until first hit
    }
    const failEl = document.getElementById('failed-overlay');
    if (failEl) {
        failEl.style.display = 'none';
        failEl.classList.remove('visible');
    }

    // Sync Config
    if (typeof modConfig !== 'undefined') {
        userConfig.scrollTime = modConfig.scrollSpeed;
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
    }

    requestAnimationFrame(gameLoop);
}



const fileInput = document.getElementById('file-input');
const zipInput = document.getElementById('zip-input');
const statusDiv = document.getElementById('loading-status');

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    // Find all definition files
    const defFiles = files.filter(f => f.name.toLowerCase().endsWith('.sm') || f.name.toLowerCase().endsWith('.ssc'));

    if (defFiles.length === 0) { alert("No .sm or .ssc files found."); return; }

    setScreen('loading-status');
    statusDiv.style.display = 'flex';

    let loadedCount = 0;
    let selectedSongIndex = -1;

    // Group by folder
    const songGroups = {};
    for (const f of defFiles) {
        const fullPath = f.webkitRelativePath || f.name;
        const pathParts = fullPath.split('/');
        pathParts.pop();
        const rootPath = pathParts.join('/');

        if (!songGroups[rootPath]) songGroups[rootPath] = [];
        songGroups[rootPath].push(f);
    }

    try {
        const groupKeys = Object.keys(songGroups);
        for (let i = 0; i < groupKeys.length; i++) {
            const rootPath = groupKeys[i];
            const groupDefs = songGroups[rootPath];
            const folderName = rootPath.split('/').pop() || "Root";
            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length}): ${folderName}`);

            let combinedMeta = null;
            let combinedCharts = [];

            // Allow UI update between groups
            await new Promise(r => requestAnimationFrame(r));

            // Should usually be 1 SM and 1 SSC, or just 1 of either.
            // Parse all and merge.
            for (const defFile of groupDefs) {
                const text = await defFile.text();
                let parsed = null;
                const isSSC = defFile.name.toLowerCase().endsWith('.ssc');

                if (isSSC) {
                    console.log(`[Upload] Parsing SSC: ${defFile.name} `);
                    parsed = parseSSC(text);
                } else {
                    parsed = parseSM(text);
                }

                if (parsed) {
                    // If we don't have meta yet, take it. 
                    // If we do, and this is SSC, overwrite (SSC usually preferred).
                    if (!combinedMeta || isSSC) {
                        combinedMeta = parsed.meta;
                        if (combinedMeta.title) {
                            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length}): ${combinedMeta.title}`);
                            await new Promise(r => setTimeout(r, 0)); // Unblock UI
                        }
                    }
                    if (parsed.charts) {
                        combinedCharts = combinedCharts.concat(parsed.charts);
                    }
                }
            }

            if (!combinedMeta) continue;

            const findFileInFolder = (name, type) => {
                const normalize = (p) => p.replace(/\\/g, '/').toLowerCase();
                const cleanName = (n) => n.split('/').pop().toLowerCase();
                const baseName = (n) => { const c = cleanName(n); return c.substring(0, c.lastIndexOf('.')) || c; };

                if (name) {
                    const targetPath = normalize(rootPath ? `${rootPath}/${name}` : name);
                    const targetBase = baseName(name);

                    // A. Exact Path
                    let found = files.find(f => normalize(f.webkitRelativePath || f.name) === targetPath);
                    if (found) return found;

                    // B. Filename/Basename Match in same folder
                    found = files.find(f => {
                        const fPath = normalize(f.webkitRelativePath || f.name);
                        const fDir = fPath.substring(0, fPath.lastIndexOf('/'));
                        if (fDir !== normalize(rootPath)) return false;
                        return baseName(fPath) === targetBase;
                    });
                    if (found) return found;
                }

                if (type) {
                    const candidates = [];
                    if (type === 'banner') candidates.push('banner', 'bn', 'in');
                    if (type === 'background') candidates.push('bg', 'background', 'back');
                    if (type === 'cdtitle') candidates.push('cdtitle', 'cd');

                    for (let cand of candidates) {
                        const found = files.find(f => {
                            const fPath = normalize(f.webkitRelativePath || f.name);
                            const fDir = fPath.substring(0, fPath.lastIndexOf('/'));
                            if (fDir !== normalize(rootPath)) return false;
                            return baseName(fPath) === cand;
                        });
                        if (found) return found;
                    }
                }
                return null;
            };

            const bannerFile = findFileInFolder(combinedMeta.banner, 'banner');
            const bgFile = findFileInFolder(combinedMeta.background, 'background');
            const cdFile = findFileInFolder(combinedMeta.cdtitle, 'cdtitle');
            let audioFile = findFileInFolder(combinedMeta.music);

            if (!audioFile) {
                const extensions = ['.ogg', '.mp3', '.wav'];
                audioFile = files.find(f => {
                    const fPath = f.webkitRelativePath || f.name;
                    const fDir = fPath.substring(0, fPath.lastIndexOf('/'));
                    const fName = fPath.split('/').pop().toLowerCase();
                    const normalize = (p) => p.replace(/\\/g, '/').toLowerCase();
                    return normalize(fDir) === normalize(rootPath) && extensions.some(ext => fName.endsWith(ext));
                });
            }

            if (!audioFile) {
                console.warn(`Audio not found for ${combinedMeta.title}, skipping.`);
                continue;
            }

            // Deduplicate charts if needed? 
            // SSC might contain same charts as SM. 
            // Simple approach: filter exact duplicates based on Difficulty + Meter + StepsType (if we had it).
            // Current `charts` object doesn't have StepsType explicitly stored in `parseSM`. `parseSSC` does check `dance-single`.
            // Let's rely on exact difficulty/meter match?
            // Or just leave them. The user can pick. (Prefer leaving them or simple dedupe).

            const uniqueCharts = [];
            const seenCharts = new Set();
            combinedCharts.forEach(c => {
                const key = `${c.difficulty}-${c.meter}-${c.notes.length}`;
                if (!seenCharts.has(key)) {
                    seenCharts.add(key);
                    uniqueCharts.push(c);
                }
            });

            const songObj = {
                meta: combinedMeta,
                charts: uniqueCharts,
                audioBlob: audioFile,
                bannerBlob: bannerFile,
                bgBlob: bgFile,
                cdTitleBlob: cdFile
            };

            // === Duplicate Check ===
            const duplicateIndex = songLibrary.findIndex(s =>
                s.meta.title.toLowerCase() === combinedMeta.title.toLowerCase() &&
                s.meta.artist.toLowerCase() === combinedMeta.artist.toLowerCase() &&
                (s.meta.subtitle || "").toLowerCase() === (combinedMeta.subtitle || "").toLowerCase()
            );

            if (duplicateIndex !== -1) {
                console.log(`Replacing/Merging song: ${combinedMeta.title}`);
                songLibrary[duplicateIndex] = songObj;
                selectedSongIndex = duplicateIndex;
            } else {
                songLibrary.push(songObj);
                if (selectedSongIndex === -1) selectedSongIndex = songLibrary.length - 1;
            }
            loadedCount++;
        }

        if (loadedCount > 0) {
            sortLibrary();
            saveLibrary();
            if (selectedSongIndex !== -1) selectSong(selectedSongIndex);
            else renderSongList();
        } else {
            alert("No valid songs imported (check audio files).");
        }

        setScreen('setup-panel');
        document.getElementById('loading-status').style.display = 'none';

    } catch (err) {
        console.error(err);
        alert("Error loading songs: " + err.message);
        setScreen('setup-panel');
    }
});

zipInput.addEventListener('change', handleZipImport);

async function handleZipImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScreen('loading-status');
    setText('loading-text', "Opening Zip...");

    try {
        const zip = await JSZip.loadAsync(file);
        const defFiles = [];

        // 1. Find all SM/SSC files
        zip.forEach((relativePath, zipEntry) => {
            const low = relativePath.toLowerCase();
            if ((low.endsWith('.sm') || low.endsWith('.ssc')) && !relativePath.startsWith('__MACOSX')) {
                defFiles.push(zipEntry);
            }
        });

        if (defFiles.length === 0) throw new Error("No .sm files found in zip");

        // Group by folder
        const songGroups = {};
        for (const entry of defFiles) {
            const fullPath = entry.name;
            const pathParts = fullPath.split('/');
            pathParts.pop();
            const rootPath = pathParts.join('/');

            if (!songGroups[rootPath]) songGroups[rootPath] = [];
            songGroups[rootPath].push(entry);
        }

        let loadedCount = 0;
        let selectedSongIndex = -1;
        const groupKeys = Object.keys(songGroups);

        for (let i = 0; i < groupKeys.length; i++) {
            const rootPath = groupKeys[i];
            const groupDefs = songGroups[rootPath];
            const folderName = rootPath.split('/').pop() || "Root";
            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length}): ${folderName}`);

            let combinedMeta = null;
            let combinedCharts = [];

            // Allow UI update between groups
            await new Promise(r => requestAnimationFrame(r));

            for (const defFile of groupDefs) {
                const text = await defFile.async("string");
                let parsed = null;
                const isSSC = defFile.name.toLowerCase().endsWith('.ssc');

                if (isSSC) {
                    console.log(`[Upload] Parsing SSC: ${defFile.name}`);
                    parsed = parseSSC(text);
                } else {
                    parsed = parseSM(text);
                }

                if (parsed) {
                    if (!combinedMeta || isSSC) {
                        combinedMeta = parsed.meta;
                        if (combinedMeta.title) {
                            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length}): ${combinedMeta.title}`);
                            await new Promise(r => setTimeout(r, 0)); // Unblock UI
                        }
                    }
                    if (parsed.charts) {
                        combinedCharts = combinedCharts.concat(parsed.charts);
                    }
                }
            }

            if (!combinedMeta) continue;

            const noteObj = {
                meta: combinedMeta,
                charts: [],
                files: {},
            };

            // Deduplicate charts
            const seenCharts = new Set();
            combinedCharts.forEach(c => {
                const key = `${c.difficulty}-${c.meter}-${c.notes.length}`;
                if (!seenCharts.has(key)) {
                    seenCharts.add(key);
                    noteObj.charts.push(c);
                }
            });

            // Grab all files in this folder from zip
            const songFilePromises = [];
            zip.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir || relativePath.startsWith('__MACOSX')) return;

                let belongs = false;
                // Check if relativePath is inside rootPath
                // rootPath might be ""
                if (rootPath === "") {
                    // If root is empty, then any file without a / is valid? 
                    // Or any file at all if the definition was at root.
                    // But if there are folders, we shouldn't grab their contents unless recursive? 
                    // SM usually implies flat if root.
                    belongs = true;
                } else if (relativePath.startsWith(rootPath + "/")) {
                    belongs = true;
                }

                if (belongs) {
                    songFilePromises.push((async () => {
                        const blob = await zipEntry.async("blob");
                        let localName = relativePath;
                        if (rootPath !== "") {
                            localName = relativePath.substring(rootPath.length + 1);
                        }
                        noteObj.files[localName] = blob;
                    })());
                }
            });

            await Promise.all(songFilePromises);

            const getFileBlob = (targetName, type) => {
                const normalize = (s) => s ? s.toLowerCase() : "";

                if (targetName) {
                    const lowerTarget = normalize(targetName);
                    const targetBase = lowerTarget.substring(0, lowerTarget.lastIndexOf('.')) || lowerTarget;

                    if (noteObj.files[lowerTarget]) return noteObj.files[lowerTarget];

                    for (let fName in noteObj.files) {
                        const fLower = normalize(fName);
                        if (fLower.startsWith(targetBase + ".")) return noteObj.files[fName];
                    }
                }

                if (type) {
                    const candidates = [];
                    if (type === 'banner') candidates.push('banner', 'bn', 'in');
                    if (type === 'background') candidates.push('bg', 'background', 'back');
                    if (type === 'cdtitle') candidates.push('cdtitle', 'cd');

                    for (let fName in noteObj.files) {
                        const fLower = normalize(fName);
                        const fBase = fLower.substring(0, fLower.lastIndexOf('.')) || fLower;
                        if (candidates.includes(fBase)) return noteObj.files[fName];
                    }
                }
                return null;
            };

            noteObj.bannerBlob = getFileBlob(combinedMeta.banner, 'banner');
            noteObj.bgBlob = getFileBlob(combinedMeta.background, 'background');
            noteObj.cdTitleBlob = getFileBlob(combinedMeta.cdtitle, 'cdtitle');

            let audioBlob = getFileBlob(combinedMeta.music);
            if (!audioBlob) {
                for (let fName in noteObj.files) {
                    if (fName.toLowerCase().endsWith('.ogg') || fName.toLowerCase().endsWith('.mp3') || fName.toLowerCase().endsWith('.wav')) {
                        audioBlob = noteObj.files[fName];
                        break;
                    }
                }
            }
            noteObj.audioBlob = audioBlob;

            const duplicateIndex = songLibrary.findIndex(s =>
                s.meta.title.toLowerCase() === combinedMeta.title.toLowerCase() &&
                s.meta.artist.toLowerCase() === combinedMeta.artist.toLowerCase() &&
                (s.meta.subtitle || "").toLowerCase() === (combinedMeta.subtitle || "").toLowerCase()
            );

            if (duplicateIndex !== -1) {
                console.log(`Replacing/Merging song via Zip: ${combinedMeta.title}`);
                if (selectedSongIndex === -1 && songLibrary[selectedSongIndex] && songLibrary[selectedSongIndex].meta.title === combinedMeta.title) {
                    // Keep selection logic simple
                }
                songLibrary[duplicateIndex] = noteObj;
                selectedSongIndex = duplicateIndex;
            } else {
                songLibrary.push(noteObj);
                if (selectedSongIndex === -1) selectedSongIndex = songLibrary.length - 1;
            }
            loadedCount++;
        }

        if (loadedCount > 0) {
            sortLibrary();
            saveLibrary();
            if (selectedSongIndex !== -1) selectSong(selectedSongIndex);
            else renderSongList();
        } else {
            alert("No valid songs imported (check audio files).");
        }

        setScreen('setup-panel');
        document.getElementById('loading-status').style.display = 'none';

    } catch (err) {
        console.error(err);
        alert("Zip Import Failed: " + err.message);
        setScreen('setup-panel');
    }
}

/* =========================================
   SPEED MOD LOGIC
   ========================================= */
function getCurrentBPM() {
    if (!gameState || !gameState.bpmTimes) return 120;
    const now = audioCtx ? (audioCtx.currentTime - gameState.startTime) : 0;

    // Find last BPM change before now
    for (let i = gameState.bpmTimes.length - 1; i >= 0; i--) {
        if (now >= gameState.bpmTimes[i].time) {
            return gameState.bpmTimes[i].bpm;
        }
    }
    return gameState.bpmTimes[0].bpm;
}

function updateScrollSpeed(rateOverride) {
    // Default config if missing
    if (!userConfig.modifiers) {
        userConfig.modifiers = { speedType: 'C', speedValue: 400, failMode: 'on' };
    }

    const mods = userConfig.modifiers;
    const type = mods.speedType || 'C';
    let val = mods.speedValue || 400; // Default C400

    // Safety
    if (type === 'X' && val < 0.1) val = 1.0;
    if ((type === 'C' || type === 'M') && val < 50) val = 50;

    // Scaling Factor (Reference Height: 480px)
    // If canvas isn't ready, default to window height or 480
    const height = (canvas && canvas.height) ? canvas.height : window.innerHeight;
    const scaleFactor = height / 480;

    let targetSpeed = 400; // Base pixels per second (at 480px height)

    let rate = 1.0;
    if (typeof rateOverride !== 'undefined') rate = rateOverride;
    else if (typeof modConfig !== 'undefined' && modConfig.rate) rate = modConfig.rate;

    if (type === 'C') {
        // C-Mod: Constant Speed (Pixels / Second)
        // Since rate mod speeds up time (beats/sec), we must slow down scroll (pixels/beat)
        // to maintain constant pixels/sec (per user request).
        targetSpeed = (val * scaleFactor) / rate;
    } else if (type === 'X') {
        // X-Mod: Multiplier of Current BPM
        // Should scale WITH rate (faster song = faster scroll), so NO division.
        const currentBPM = getCurrentBPM();
        targetSpeed = currentBPM * val * scaleFactor;
    } else if (type === 'M') {
        // M-Mod: Max Speed cap
        const mVal = val;
        const currentBPM = getCurrentBPM();
        // M-mod caps the peak speed. Similar to C-mod, we want the PEAK visible speed to be M.
        // So we also divide by rate.
        targetSpeed = ((currentBPM / (gameState.maxBPM || 150)) * mVal * scaleFactor) / rate;
    }

    gameState.scrollSpeed = targetSpeed;
    if (typeof gameConfig !== 'undefined') gameConfig.scrollSpeed = targetSpeed;
}

/* =========================================
   SONG SELECT TABS & PREVIEW
   ========================================= */
let currentSongTab = 'info';
let previewCtx = null;
let previewLoopId = null;
let previewAudio = null;
let previewState = { isLoopingSample: false, sampleStart: 0, sampleLength: 0 };
let previewStartTime = 0;
let previewChartData = null;
let previewPaused = false;
let previewAssets = {};
let previewMouseMoveListener = null;
let previewMouseLeaveListener = null;

function switchSongTab(tab) {
    currentSongTab = tab;

    // UI Updates
    document.querySelectorAll('.ss-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.ss-tab-btn').forEach(el => el.classList.remove('active'));

    const activeContent = document.getElementById(`tab-${tab}`);
    if (activeContent) {
        activeContent.style.display = 'flex';
    }

    // Find button index 0,1,2 hardcoded or by title? 
    // Simplified: Just match order or use data-tab attribute if we had it. 
    // We used onclick params. Let's select by index based on known order.
    const tabs = ['info', 'scores', 'preview'];
    const btnIdx = tabs.indexOf(tab);
    if (btnIdx !== -1) {
        const sidebar = document.querySelector('.ss-sidebar');
        if (sidebar && sidebar.children[btnIdx]) sidebar.children[btnIdx].classList.add('active');
    }

    // Logic
    if (tab === 'preview') {
        startChartPreview();
    } else {
        stopChartPreview();
    }

    if (tab === 'scores') {
        renderFullLeaderboard();
    }
}

// Helper for Cosmetic Clear Text
function getClearText(internalClearType) {
    if (internalClearType === 'Failed') return "Failed"; // Failed is Failed.
    if (internalClearType === 'Invalid') return "Invalid";

    // For 'Clear' and 'FC' variants, use Life Difficulty Mapping
    const lifeDiff = userConfig.lifeDifficulty || 4;

    // Mapping: 1=Assist Easy, 2-3=Easy, 4=Clear, 5=Hard, 6=EX-Hard, 7=Catastrophy
    // Note: If they got a specific FC type (MFC, PFC, etc.), we usually show THAT instead of just "Clear".
    // User request: "map the new clear types based on the life difficulty... only cosmetic"
    // Does this override FC text? "MFC" is better than "Clear". 
    // Usually difficulty prefix is for the CLEAR lamp, FC is separate status.
    // Let's assume this replaces the generic "Clear" text.
    // If internal is "Clear" (No FC), we map.
    // If internal is "SDP", "MFC", etc., we probably keep it or append?
    // Request says: "map the new clear types... 1: Assist Easy..."
    // Let's apply this mapping primarily when the clear type is 'Clear' OR acts as a modifier to the clear.
    // Simplest interpretation: Replace "Clear" with mapped string.

    if (internalClearType === 'Clear') {
        if (lifeDiff === 1) return "Assist Easy";
        if (lifeDiff <= 3) return "Easy";
        if (lifeDiff === 4) return "Clear";
        if (lifeDiff === 5) return "Hard";
        if (lifeDiff === 6) return "EX-Hard";
        if (lifeDiff >= 7) return "Catastrophy";
    }

    return internalClearType; // Return MFC, PFC, good flags as is
}

function calculateStatsFromOffsets(offsets, judgeDiff) {
    // Re-judge entire array of offsets based on supplied judgeDiff
    let judgments = { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, mine: 0, ok: 0, ng: 0 };
    // Note: 'mine', 'ok', 'ng' are not in offsets usually? 
    // detailedHits contains {judge: '...'} so we might need full detailedHits if we want to preserve holds/mines
    // BUT, saveScore usually uses `gameState.judgments`.
    // Recalculating from strictly offsets loses Mine/Hold info if we only have array of numbers.
    // We need `detailedHits` to do this properly for Re-Re-Judge.
    // For `saveScore` normalization (Judge 4), we essentially want to simulate playing on Judge 4.
    // Taps -> Re-judge. Holds/Mines -> Keep original result? 
    // "holds, rolls and mines ... remain constant"
    // So we just copy Mine/Hold counts from gameState?

    // We can't easily re-judge holds if we don't have their timing data here, but we have counts.
    // Let's assume Mine/Hold counts are invariant of Judge Difficulty.
    judgments.mine = gameState.judgments.mine;
    judgments.ok = gameState.judgments.ok;
    judgments.ng = gameState.judgments.ng;

    let score = 0;
    // Base max score calculation is complex without note total. 
    // Assuming this is called contextually where we know totalNotes?
    // Or we estimate score. 
    // We need `gameState.totalNotesInChart` for score calculation.
    const totalNotes = gameState.totalNotesInChart || 1;
    const baseNoteScore = 1000000 / Math.max(1, totalNotes);

    // Filter only Taps (non-null offsets) for re-judging
    // NOTE: Misses in detailedHits might have null offset.
    // If we re-judge, we check if offset exists.
    // If offset is null (miss), it stays miss.

    // We need to iterate detailedHits to distinguish Taps from random offsets?
    // Or if we pass `detailedHits` array instead of just numbers.

    // Let's use `gameState.detailedHits` which has {offset, judge, time...}
    // Note: logic below assumes `offsets` is `gameState.detailedHits`
}

function recalculateStatsDetailed(detailedHits, judgeDiff) {
    let internalJudgments = { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, mine: 0, ok: 0, ng: 0 };
    let totalScore = 0;
    let totalHitOrMiss = 0;
    let accPoints = 0;

    const wMarv = getTimingWindow('marvelous', judgeDiff);
    const wPerf = getTimingWindow('perfect', judgeDiff);
    const wGreat = getTimingWindow('great', judgeDiff);
    const wGood = getTimingWindow('good', judgeDiff);
    const wBad = getTimingWindow('bad', judgeDiff);
    // Miss window - if it was hit, it's not a miss (unless outside bad? but we track hits).
    // If original was Miss, we keep it Miss? (Assumed yes, if you missed J4 you missed J9).
    // Actually, if you hit a "Bad" on J4, it might be "Miss" on J9?
    // "Miss" logic in gameplay is checking if you hit within Bad.
    // If we recorded an offset, it means it was a Hit (Bad or better).
    // If we missed, offset is usually null or we didn't hit it.

    const totalNotes = gameState.totalNotesInChart || 1;
    // Score constants per note
    const sMarv = baseNoteScore + 10;
    const sPerf = baseNoteScore;
    const sGreat = (baseNoteScore - 10) * 0.6;
    const sGood = (baseNoteScore - 10) * 0.2;

    detailedHits.forEach(h => {
        // Mine/Hold checks - simpler to assume we can trust the 'judge' string for type
        // if judge is MINE, OK, NG, or MISS (with no offset), count it.
        const j = h.judge.toUpperCase();
        if (j === 'MINE') { internalJudgments.mine++; totalScore -= 500; accPoints += -7; totalHitOrMiss++; return; }
        if (j === 'OK') { internalJudgments.ok++; return; } // Holds don't add score? (Checked triggerHold: OK adds life, no score consts?)
        if (j === 'NG') { internalJudgments.ng++; accPoints += -4.5; totalHitOrMiss++; return; } // NG penalty

        if (h.offset === null || j === 'MISS') {
            internalJudgments.miss++;
            // Use calculateAccuracy fallback for miss? Or hardcode -275?
            accPoints += -275; // or calculateAccuracy(1000)
            totalHitOrMiss++;
            return;
        }

        // Tap Re-Judge
        // Use calculateAccuracy(offset) BUT we need to respect 'judgeDiff'.
        // calculateAccuracy uses userConfig.judgeDifficulty.
        // We must swap it temporarily.
        const originalDiff = userConfig.judgeDifficulty;
        userConfig.judgeDifficulty = judgeDiff;

        try {
            const pt = calculateAccuracy(h.offset);
            accPoints += pt;

            // Still need to bucket judgement counts for UI
            // We can't use pt alone for buckets? 
            // We can use the windows calculated above (wMarv etc) for counting.
            const abs = Math.abs(h.offset);
            if (abs <= wMarv) { internalJudgments.marvelous++; totalScore += sMarv; }
            else if (abs <= wPerf) { internalJudgments.perfect++; totalScore += sPerf; }
            else if (abs <= wGreat) { internalJudgments.great++; totalScore += sGreat; }
            else if (abs <= wGood) { internalJudgments.good++; totalScore += sGood; }
            else if (abs <= wBad) { internalJudgments.bad++; totalScore += 0; }
            // Note: calculateAccuracy returns negative for BAD?
            // Actually calculateAccuracy returns negative for > 180ms.
            // Bad window is 180.
            // If Bad, we add negative points?
            // calculateAccuracy gives negative for Bad range?
            // Let's check calculateAccuracy logic:
            // "if abs <= 180 return -275 * ..." -> Negative slope.
            // So yes, Bad is negative.

        } finally {
            userConfig.judgeDifficulty = originalDiff;
        }
        totalHitOrMiss++;
    });

    totalScore = Math.max(0, totalScore);
    // Acc is Average of Points (0-100)
    // accPoints is Sum.
    const acc = totalHitOrMiss > 0 ? (accPoints / totalHitOrMiss) : 0;

    // Recalc Grade
    // Need grade thresholds? Assuming standard getGrade(acc)
    const grade = getGrade(acc);

    return { judgments: internalJudgments, score: totalScore, acc: acc, grade: grade };
}

// Global variable to store hits for re-judging on results screen
let lastDetailedHits = [];

function saveScore(forceFail = false) {
    if (gameState.isAutoplay) return;

    const song = songLibrary[selectedSongIndex];
    if (!song) return;
    const chart = song.charts[selectedChartIndex];
    if (!chart) return;

    // 1. Calculate J4 Stats (Normalized for Leaderboard)
    // baseNoteScore for J4 scoring logic
    const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart || 1);
    const j4Stats = recalculateStatsInternal(gameState.detailedHits, 4, baseNoteScore);

    // 2. Adjust Accuracy if Failed
    let accuracyForLB = j4Stats.acc;
    if (gameState.failed || forceFail) {
        // If failed, accuracy is calculated over the ENTIRE chart.
        // The notes already processed are in j4Stats.accPts (or derived).
        // Let's manually sum penalties for remaining notes.
        const remainingNotes = Math.max(0, gameState.totalNotesInChart - (j4Stats.count || 0));
        const totalPossiblePoints = gameState.totalNotesInChart * 100;

        // We need the accumulated points from j4 recalculation
        // recalculateStatsInternal returns 'acc' which is (totalPts / count)
        const earnedPts = j4Stats.acc * (j4Stats.count || 0);
        const penaltyPts = remainingNotes * -275; // Wife3 Miss Penalty

        accuracyForLB = ((earnedPts + penaltyPts) / totalPossiblePoints) * 100;
    }

    // 3. SSR Calculation
    const diff = (chart.difficultyCalc && chart.difficultyCalc.overall) ? chart.difficultyCalc.overall : (parseFloat(chart.meter) || 0);
    const ssr = calculateSSR(diff, accuracyForLB / 100);

    // 4. Score Object
    const scoreObj = {
        score: Math.round(j4Stats.score),
        acc: accuracyForLB.toFixed(4),
        ssr: parseFloat(ssr.toFixed(2)),
        judgments: j4Stats.judgments,
        grade: (gameState.failed || forceFail) ? (modConfig.scoringSystem === 'ddr' ? 'E' : 'F') : getGrade(accuracyForLB, j4Stats.score, j4Stats.judgments),
        clearType: getClearType(j4Stats.judgments, gameState.failed || forceFail),
        maxCombo: gameState.maxCombo,
        date: Date.now(),
        timestamp: Date.now(), // Legacy support
        dpScore: ((accuracyForLB / 100) * (gameState.totalNotesInChart * 2)).toFixed(2),
        osuScore: Math.round(gameState.osuScore),
        judgeDiff: 4, // Leaderboard is normalized to J4
        rate: (modConfig && modConfig.rate) ? modConfig.rate : 1.0,
        detailedHits: gameState.detailedHits,
        replayLog: gameState.replayLog
    };

    // 5. Save Score to Leaderboard (Array of top 10)
    const key = `webSM_lb_${song.meta.title}_${chart.difficulty}`;

    let lb = [];
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            lb = Array.isArray(parsed) ? parsed : [parsed];
        }
    } catch (e) { }

    lb.push(scoreObj);

    // Sort by accuracy descending (Personal Best at top)
    lb.sort((a, b) => parseFloat(b.acc) - parseFloat(a.acc));

    // Keep only top 10
    lb = lb.slice(0, 10);

    try {
        localStorage.setItem(key, JSON.stringify(lb));
        console.log("Score Saved to Leaderboard. Placement:", lb.indexOf(scoreObj) + 1);
    } catch (e) {
        console.warn("Score save failed: storage full or restricted", e);
    }

    // Store hits for Results Screen re-judging
    lastDetailedHits = [...gameState.detailedHits];
}

function recalculateStatsInternal(hits, judgeDiff, baseNoteScore) {
    let j = { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, mine: 0, ok: 0, ng: 0 };
    let score = 0;
    let accPts = 0;
    let count = 0;

    const wMarv = getTimingWindow('marvelous', judgeDiff);
    const wPerf = getTimingWindow('perfect', judgeDiff);
    const wGreat = getTimingWindow('great', judgeDiff);
    const wGood = getTimingWindow('good', judgeDiff);
    const wBad = getTimingWindow('bad', judgeDiff);

    const sMarv = baseNoteScore + 10;
    const sPerf = baseNoteScore;
    const sGreat = (baseNoteScore - 10) * 0.6;
    const sGood = (baseNoteScore - 10) * 0.2;

    hits.forEach(h => {
        const type = (h.judge || "").toUpperCase();
        if (type === 'MINE') { j.mine++; score -= 500; accPts += -230; count++; return; }
        if (type === 'OK') { j.ok++; return; }
        if (type === 'NG') { j.ng++; accPts += -150; count++; return; }
        if (h.offset === null || type === 'MISS') { j.miss++; accPts += -275; count++; return; }

        const abs = Math.abs(h.offset);
        accPts += calculateAccuracy(h.offset, judgeDiff);

        if (abs <= wMarv) { j.marvelous++; score += sMarv; }
        else if (abs <= wPerf) { j.perfect++; score += sPerf; }
        else if (abs <= wGreat) { j.great++; score += sGreat; }
        else if (abs <= wGood) { j.good++; score += sGood; }
        else if (abs <= wBad) { j.bad++; score += 0; }
        else { j.miss++; accPts -= 275; } // Safety if somehow offset > window in hits array

        count++;
    });

    const acc = count > 0 ? (accPts / count) : 0;
    return { judgments: j, score: Math.max(0, score), acc: acc, count: count };
}

// Current Viewing Judge on Results SCreen
let resultViewJudge = 4;

function recalculateResults(judgeDiff) {
    if (!lastDetailedHits || lastDetailedHits.length === 0) return;

    const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart || 1);
    const stats = recalculateStatsInternal(lastDetailedHits, judgeDiff, baseNoteScore);

    // Update DOM
    setText('res-score', Math.round(stats.score).toLocaleString());
    setText('res-acc', stats.acc.toFixed(2) + '%');
    setText('res-grade', stats.grade);
    // Grade Color
    const gEl = document.getElementById('res-grade');
    if (gEl) gEl.style.color = getGradeColor(stats.grade);

    // Update DP Score
    const total = gameState.totalNotesInChart || 1;
    // Formula: (Acc% / 100) * (Total * 2)
    const dpPoints = (stats.acc / 100) * (total * 2);
    const maxDP = total * 2;
    const resDpEl = document.getElementById('res-dp');
    if (resDpEl) {
        resDpEl.innerHTML = `${dpPoints.toFixed(2)} <span style="font-size:0.75em; color:#888;">/ ${maxDP.toFixed(2)}</span>`;
    }

    // Clear Type - Keep original Fail status?
    // If we originally failed, we stay failed.
    // If we cleared, cosmetic mapping applies? 
    // Wait, recalculation might change 'Invalid' etc?
    // User request: "recalculated and judgement tally... requantitized"
    // Usually clear status (Fail) relies on LIFE which we can't easily resimulate frame by frame here.
    // So we assume Pass/Fail status is constant, but Grade/Acc/Score updates.

    // Update Counts
    setText('res-count-marvelous', stats.judgments.marvelous);
    setText('res-count-perfect', stats.judgments.perfect);
    setText('res-count-great', stats.judgments.great);
    setText('res-count-good', stats.judgments.good);
    setText('res-count-bad', stats.judgments.bad);
    setText('res-count-miss', stats.judgments.miss);

    // Judge Label
    setText('res-judge-label', `J${judgeDiff}`);
    document.getElementById('res-judge-label').style.display = 'inline';
}

function handleResultsKey(e) {
    if (document.getElementById('results-screen').style.display === 'none') return;

    if (e.key === '-' || e.key === '_') {
        resultViewJudge = Math.max(4, resultViewJudge - 1);
        recalculateResults(resultViewJudge);
    }
    else if (e.key === '=' || e.key === '+') {
        resultViewJudge = Math.min(9, resultViewJudge + 1);
        recalculateResults(resultViewJudge);
    }
}
// Hook keydown
document.addEventListener('keydown', handleResultsKey);

let lbFilterMode = 'all'; // 'all' or 'rate'

function renderFullLeaderboard() {
    const list = document.getElementById('ss-full-lb-list');
    if (!list) return;
    list.innerHTML = '';

    if (selectedSongIndex === -1 || selectedChartIndex === -1) return;
    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];
    if (!song || !chart) return;

    const key = `webSM_lb_${song.meta.title}_${chart.difficulty}`;
    const saved = localStorage.getItem(key);
    let lb = [];
    if (saved) {
        const parsed = JSON.parse(saved);
        lb = Array.isArray(parsed) ? parsed : [parsed];
    }

    // Toggle Header
    const currentRate = (modConfig && modConfig.rate) ? modConfig.rate : 1.0;
    const toggleDiv = document.createElement('div');
    toggleDiv.style.display = 'flex';
    toggleDiv.style.justifyContent = 'flex-end';
    toggleDiv.style.marginBottom = '10px';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ss-action-btn'; // Use existing style logic if available or inline
    toggleBtn.style.padding = '5px 10px';
    toggleBtn.style.fontSize = '0.8rem';
    toggleBtn.style.background = lbFilterMode === 'rate' ? '#00e5ff' : '#333';
    toggleBtn.style.color = lbFilterMode === 'rate' ? '#000' : '#fff';
    toggleBtn.style.border = '1px solid #555';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.innerText = lbFilterMode === 'rate' ? `Showing: ${currentRate.toFixed(2)}x` : `Showing: All Rates`;

    toggleBtn.onclick = () => {
        lbFilterMode = lbFilterMode === 'all' ? 'rate' : 'all';
        renderFullLeaderboard();
    };

    toggleDiv.appendChild(toggleBtn);
    list.appendChild(toggleDiv);

    if (lb.length === 0) {
        const msg = document.createElement('div');
        msg.style.color = '#666';
        msg.style.textAlign = 'center';
        msg.style.padding = '20px';
        msg.innerText = 'No scores yet';
        list.appendChild(msg);
        return;
    }

    // Filter Logic
    let displayLb = [...lb];
    if (lbFilterMode === 'rate') {
        displayLb = displayLb.filter(s => Math.abs((s.rate || 1.0) - currentRate) < 0.001);
        if (displayLb.length === 0) {
            const msg = document.createElement('div');
            msg.style.color = '#888';
            msg.style.textAlign = 'center';
            msg.style.padding = '10px';
            msg.style.fontSize = '0.9rem';
            msg.innerText = `No scores at ${currentRate.toFixed(2)}x rate`;
            list.appendChild(msg);
            return;
        }
    }

    displayLb.sort(sortLeaderboard);

    displayLb.forEach((entry, i) => {
        const div = document.createElement('div');
        div.className = 'ss-lb-item';

        // Color Code & Tint using GRADE Color
        const gradeColor = GRADE_COLORS[entry.grade] || '#fff';

        // Border gets Clear Type Color
        let clearColor = "#fff";
        if (entry.fcType && CLEAR_COLORS[entry.fcType]) {
            clearColor = CLEAR_COLORS[entry.fcType];
        }

        // Convert Hex to RGBA for tint (Grade Color)
        const hex = gradeColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        div.style.background = `linear-gradient(to right, rgba(${r},${g},${b},0.15), rgba(255,255,255,0.02))`;

        // Left Border: Clear Type Color
        div.style.borderLeft = `4px solid ${clearColor}`;

        // Prepare Judgments Grid (ALL judgments, including 0s)
        const J = entry.judgments || { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
        const jKeys = ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'];
        const jLabels = ['MARV', 'PERF', 'GRT', 'GOOD', 'BAD', 'MISS'];
        const jColors = ["#a3f7ff", "#ffe600", "#44ff4b", "#0099ff", "#aa00ff", "#ff3333"];

        let jHtml = "";
        jKeys.forEach((k, idx) => {
            const val = J[k] || 0;
            const color = val > 0 ? jColors[idx] : '#555';
            jHtml += `
                <div class="ss-lb-judge-col">
                    <span class="ss-judge-label">${jLabels[idx]}</span>
                    <span class="ss-judge-val" style="color:${color}">${val}</span>
                </div>
            `;
        });

        const displayScore = entry.dpScore ? parseFloat(entry.dpScore).toFixed(2) : "0.00";
        const ssrVal = entry.ssr ? parseFloat(entry.ssr).toFixed(2) : "0.00";

        // Date Formatting
        let dateStr = "";
        if (entry.date) {
            const d = new Date(entry.date);
            if (!isNaN(d.getTime())) {
                // YYYY/MM/DD HH:mm:ss
                const pad = (n) => n.toString().padStart(2, '0');
                dateStr = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} <span style="font-size:0.8em; color:#888;">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span>`;
            }
        }

        // Rate Label
        const rateVal = (entry.rate || 1.0).toFixed(2);
        const rateHtml = `<span style="font-size:0.8rem; color:#aaa; margin-left:8px; border:1px solid #444; padding:1px 4px; border-radius:3px;">${rateVal}x</span>`;

        // Buttons (Consistent Styling)
        const hasReplay = entry.replayLog && entry.replayLog.length > 0;
        const baseBtnStyle = "padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.2s ease; border:none; margin-left:8px; display:inline-flex; align-items:center; gap:5px;";

        const resBtnStyle = `${baseBtnStyle} background:rgba(255,255,255,0.1); color:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.2);`;
        const repBtnStyle = `${baseBtnStyle} background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; box-shadow:0 2px 8px rgba(102, 126, 234, 0.4);`;

        const resBtn = `<button onclick='viewScoreResults(${JSON.stringify(entry)})' style='${resBtnStyle}' onmouseenter="this.style.background='rgba(255,255,255,0.2)'" onmouseleave="this.style.background='rgba(255,255,255,0.1)'">📄 Results</button>`;
        const repBtn = hasReplay ? `<button onclick='startReplay(${JSON.stringify(entry)}, songLibrary[${selectedSongIndex}], songLibrary[${selectedSongIndex}].charts[${selectedChartIndex}])' style='${repBtnStyle}' onmouseenter="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.6)';" onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.4)';">▶ Replay</button>` : "";

        div.innerHTML = `
            <div class="ss-lb-main-row">
                <span class="ss-lb-rank">#${i + 1}</span>
                <div style="display:flex; align-items:baseline; gap:10px;">
                    <span style="font-size:0.9rem; color:#ffd700; font-family:'Mochiy Pop One'; text-shadow:0 0 5px rgba(255, 215, 0, 0.5);">${ssrVal}</span>
                    <span class="ss-lb-score">${displayScore}</span>
                    <span style="font-size:0.7em; color:${CLEAR_COLORS[entry.clearType] || '#00e5ff'}; margin-left:5px; text-transform:uppercase; font-weight:bold;">${entry.clearType || ""}</span>
                </div>
                <div style="display:flex; align-items:center; margin-left:auto;">
                    ${resBtn}
                    ${repBtn}
                </div>
            </div>
            <div class="ss-lb-details-row">
                <div class="ss-lb-meta">
                    <div style="display:flex; align-items:center;">
                        <span class="ss-lb-grade" style="color:${gradeColor}">${entry.grade}</span>
                        ${rateHtml}
                        <span style="font-size:0.8rem; color:#aaa; margin-left:8px; border:1px solid #444; padding:1px 4px; border-radius:3px;">J${entry.judgeDiff || 4}</span>
                    </div>
                    <span class="ss-lb-acc">${parseFloat(entry.acc).toFixed(2)}%</span>
                    <div style="font-size:0.75rem; color:#666; margin-top:4px; font-family:monospace;">${dateStr}</div>
                </div>
                <div class="ss-lb-judgments">
                    ${jHtml}
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

async function startChartPreview() {
    // Determine target chart
    if (selectedSongIndex === -1 || selectedChartIndex === -1) return;
    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];
    if (!song || !chart) return;

    // Load Assets Lazy
    if (!previewAssets.arrow) {
        previewAssets.arrow = new Image();
        previewAssets.arrow.src = "_Down Tap Note 1x8.png";
        previewAssets.holdHead = previewAssets.arrow;
        previewAssets.holdBody = new Image();
        previewAssets.holdBody.src = "Down Hold Body Active.png";
    }

    // Setup Stats
    setText('prev-notes', chart.notes.length);
    const lastNote = chart.notes[chart.notes.length - 1];
    let len = 0;
    if (lastNote) len = lastNote.time;
    const mins = Math.floor(len / 60);
    const secs = Math.floor(len % 60).toString().padStart(2, '0');
    setText('prev-len', `${mins}:${secs}`);

    // Update Slider
    const slider = document.getElementById('prev-seek');
    if (slider) {
        slider.max = len + 2;
        slider.value = 0;

        // Tooltip Listeners & Density Graph
        const tooltip = document.getElementById('prev-seek-tooltip');
        const densityCanvas = document.getElementById('density-canvas');

        // Render Density Graph
        if (densityCanvas) {
            // Force safe size if offsetWidth is 0 (fallback)
            if (densityCanvas.offsetWidth === 0) {
                densityCanvas.style.width = '100%';
                densityCanvas.style.height = '60px'; // Force height from CSS
            }
            try {
                // Short timeout to ensure layout is computed if tab just switched
                // AND use requestAnimationFrame for better timing
                requestAnimationFrame(() => {
                    renderDensityGraph(chart, densityCanvas, len);
                });
            } catch (e) {
                console.error("Density Graph Render Error:", e);
            }
        }

        // Cleanup old listeners if they exist
        if (previewMouseMoveListener) {
            slider.removeEventListener('mousemove', previewMouseMoveListener);
        }
        if (previewMouseLeaveListener) {
            slider.removeEventListener('mouseleave', previewMouseLeaveListener);
        }

        // Define new listeners
        previewMouseMoveListener = (e) => {
            // Ensure elements exist
            if (!tooltip && !densityCanvas) return;

            const rect = slider.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            if (w <= 0) return; // Paranoia

            const pct = Math.max(0, Math.min(1, x / w));

            // Show Tooltip
            if (tooltip) {
                const max = parseFloat(slider.max) || 1;
                const time = pct * max;
                const mins = Math.floor(time / 60);
                const secs = (time % 60).toFixed(2).padStart(5, '0');
                tooltip.innerText = `${mins}:${secs}`;

                // Clamp Position
                const pos = x;
                tooltip.style.left = `${pos + slider.offsetLeft}px`;
                tooltip.style.display = 'block';
            }

            // Show Density Graph
            if (densityCanvas) {
                densityCanvas.style.opacity = '1';
            }
        };

        previewMouseLeaveListener = () => {
            if (tooltip) tooltip.style.display = 'none';
            if (densityCanvas) densityCanvas.style.opacity = '0';
        };

        slider.addEventListener('mousemove', previewMouseMoveListener);
        slider.addEventListener('mouseleave', previewMouseLeaveListener);
    }

    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    previewCtx = canvas.getContext('2d');

    // Audio Logic - Sync with existing if possible
    if (song.audioBlob) {
        if (!previewAudio) {
            // Create if missing (e.g. valid song but selectSong audio failed?)
            const url = URL.createObjectURL(song.audioBlob);
            previewAudio = new Audio(url);
            previewAudio.volume = 0.6;

            // Add loop listener (shared logic)
            const start = song.meta.sampleStart || 0;
            const length = song.meta.sampleLength || 15;
            previewState.sampleStart = start;
            previewState.sampleLength = length;

            previewAudio.addEventListener('timeupdate', () => {
                if (!previewState.isLoopingSample) return;
                const end = previewState.sampleStart + previewState.sampleLength;
                const now = previewAudio.currentTime;

                if (now >= end) {
                    previewAudio.currentTime = previewState.sampleStart;
                    previewAudio.volume = 0.6;
                    return;
                }
                const fadeDur = 1.5;
                const remaining = end - now;
                if (remaining <= fadeDur && remaining > 0) {
                    previewAudio.volume = 0.6 * (remaining / fadeDur);
                } else if (Math.abs(previewAudio.volume - 0.6) > 0.01) {
                    previewAudio.volume = 0.6;
                }
            });
        }

        // Enter "Full Preview" Mode
        previewState.isLoopingSample = false;
        previewAudio.volume = 0.6; // Restore volume if fading

        // Ensure settings are applied (Rate/Pitch)
        updatePreviewAudioSettings();

        // Ensure playing
        if (previewAudio.paused) {
            previewAudio.play().catch(e => { });
            previewPaused = false;
        } else {
            previewPaused = false;
        }
    } else {
        // Mock
        previewAudio = { currentTime: 0, pause: () => { }, play: () => { }, volume: 1 };
        previewPaused = false;
    }

    updatePlayBtn(!previewPaused);

    // Chart Data
    previewChartData = chart.notes;
    // Don't call previewLoop if already running?
    if (previewLoopId) cancelAnimationFrame(previewLoopId);
    previewLoop();
}

function stopChartPreview() {
    if (previewLoopId) cancelAnimationFrame(previewLoopId);
    previewLoopId = null;

    // Resume "Sample Loop" Mode instead of stopping
    if (previewAudio && previewState && previewState.sampleLength > 0) {
        previewState.isLoopingSample = true;
        // Check bounds
        const s = previewState.sampleStart;
        const e = s + previewState.sampleLength;
        const now = previewAudio.currentTime;
        if (now < s || now > e) {
            previewAudio.currentTime = s;
        }
        previewAudio.volume = 0.6;
        if (previewAudio.paused && !previewPaused) previewAudio.play().catch(e => { });
    }
}

function togglePreviewPlayback() {
    if (!previewAudio) return;
    if (previewAudio.paused) {
        previewAudio.play();
        previewPaused = false;
        updatePlayBtn(true);
        previewLoop(); // Restart loop
    } else {
        previewAudio.pause();
        previewPaused = true;
        updatePlayBtn(false);
    }
}

function updatePreviewAudioSettings() {
    if (!previewAudio) return;
    // Use window.modConfig to ensure we access the global state shared with modifiers.js
    const config = window.modConfig || (typeof modConfig !== 'undefined' ? modConfig : null);
    const rate = (config && config.rate) ? config.rate : 1.0;
    const useVinyl = (config && config.pitchShift !== undefined) ? config.pitchShift : true;

    previewAudio.playbackRate = rate;
    previewAudio.preservesPitch = !useVinyl;
    previewAudio.mozPreservesPitch = !useVinyl;
    previewAudio.webkitPreservesPitch = !useVinyl;
}

function updatePlayBtn(playing) {
    const btn = document.getElementById('prev-play-toggle');
    if (btn) btn.innerText = playing ? "⏸" : "▶";
}

function seekPreview(val) {
    if (previewAudio) {
        previewAudio.currentTime = parseFloat(val);
        // Force update if paused
        if (previewPaused) previewLoop();
    }
}

function previewLoop() {
    if (!previewCtx || !previewAudio) return;
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;

    // Manage Slider Sync
    const slider = document.getElementById('prev-seek');
    if (slider && !slider.matches(':active')) { // Don't fight drag
        slider.value = previewAudio.currentTime;
    }

    // Clear
    previewCtx.fillStyle = '#000';
    previewCtx.fillRect(0, 0, width, height);

    // Time
    const time = previewAudio.currentTime;

    // Simple Render: 4 lanes centered
    const speed = 400; // px/sec

    // Dynamic Receptor Placement
    // userConfig should be available globally
    const isDownScroll = userConfig.downScroll;
    const receptorY = isDownScroll ? height - 35 : 10;

    // Note: scrolling UP means earlier notes are at bottom? No, standard upscroll: notes come from bottom, receptor at top.

    // Check asset readiness (using main game assets)
    const canUseSkin = assets.loaded.arrowSprite && assets.loaded.receptorSprite;

    const laneWidth = 25;
    const totalWidth = laneWidth * 4;
    const startX = (width - totalWidth) / 2;

    // Render Receptors
    if (canUseSkin) {
        // Draw Receptors from Sprite (2x1: 2 Columns, 1 Row usually for Flash/Idle)
        // We only want the first frame (Idle)
        const rSw = assets.receptorSprite.width / 2; // Split width by 2
        const rSh = assets.receptorSprite.height;    // Full height

        for (let i = 0; i < 4; i++) {
            const rx = startX + i * laneWidth;
            previewCtx.save();
            previewCtx.translate(rx + laneWidth / 2, receptorY + laneWidth / 2);
            // Rotations: Left, Down, Up, Right
            const rot = [90, 0, 180, 270][i] * Math.PI / 180;
            previewCtx.rotate(rot);
            // Verify destination size to avoid squash/stretch. 
            // Note: laneWidth is 40. Receptor sprite frame should be square? 
            // If it's not, we should preserve aspect or center it.
            // Standard SM assets are square. If not, we force square.

            previewCtx.drawImage(assets.receptorSprite, 0, 0, rSw, rSh, -laneWidth / 2, -laneWidth / 2, laneWidth, laneWidth);
            previewCtx.restore();
        }
    } else {
        previewCtx.fillStyle = '#333';
        for (let i = 0; i < 4; i++) {
            previewCtx.fillRect(startX + i * laneWidth, receptorY, laneWidth - 2, laneWidth - 2);
        }
    }

    // Rotations for standard arrows (Down source)
    // 0: Left (90), 1: Down (0), 2: Up (180), 3: Right (270)
    const rotations = [90 * Math.PI / 180, 0, 180 * Math.PI / 180, 270 * Math.PI / 180];

    const colors = ['#f55', '#55f', '#5f5', '#ff5']; // L D U R

    // Helper for Quantization (Local to preview or global?)
    // Uses constant QUANTIZATION_ROWS defined at top of file
    const getQuantizationRow = (beat) => {
        // Standard SM quantization: 4, 8, 12, 16, 24, 32, 48, 64
        // We check simpler common ones first
        const b = Math.abs(beat);
        const epsilon = 0.001; // Tolerance

        // 4th (Red)
        if (Math.abs(b % 1) < epsilon) return QUANTIZATION_ROWS[4];
        // 8th (Blue)
        if (Math.abs((b * 2) % 1) < epsilon) return QUANTIZATION_ROWS[8];
        // 12th (Purple) - Triplet 8th
        if (Math.abs((b * 3) % 1) < epsilon) return QUANTIZATION_ROWS[12];
        // 16th (Yellow)
        if (Math.abs((b * 4) % 1) < epsilon) return QUANTIZATION_ROWS[16];
        // 24th (Pink) - Triplet 16th
        if (Math.abs((b * 6) % 1) < epsilon) return QUANTIZATION_ROWS[24];
        // 32nd (Orange/Cyan)
        if (Math.abs((b * 8) % 1) < epsilon) return QUANTIZATION_ROWS[32];
        // 48th
        if (Math.abs((b * 12) % 1) < epsilon) return QUANTIZATION_ROWS[48];
        // 64th (Green)
        if (Math.abs((b * 16) % 1) < epsilon) return QUANTIZATION_ROWS[64];

        // Fallback to 64th or 4th? 64th usually for "unsnapped"
        return QUANTIZATION_ROWS[64];
    };

    for (const note of previewChartData) {
        const diff = note.time - time;
        // Optimization: Don't render if too far away
        if (diff > 2.0) continue;

        // HIDING LOGIC: Don't render if it has passed the receptor (diff <= 0)
        // For Holds/Rolls, we might need to render the tail/body even if head is passed.
        // Taps/Mines:
        if ((note.type === 'tap' || note.type === 'mine') && diff <= 0) continue;

        // Calc Y based on scroll direction
        const y = isDownScroll ? receptorY - (diff * speed) : receptorY + (diff * speed);

        // Clip/Buffer off-screen
        // If y is way off screen, skip. 
        // Note: For holds, y is the HEAD position. The body might extend onto screen.
        // So we need separate checks for holds.
        if (note.type !== 'hold' && note.type !== 'roll') {
            if (y > height + 60 || y < -60) continue;
        }

        const x = startX + note.col * laneWidth;

        // Draw Logic
        if (note.type === 'tap') {
            if (canUseSkin) {
                const size = laneWidth;
                previewCtx.save();
                previewCtx.translate(x + size / 2, y + size / 2);
                previewCtx.rotate(rotations[note.col]);

                // Quantization
                const row = getQuantizationRow(note.beat);
                const frameRows = 8; // Assuming 1x8 sprite
                const sw = assets.arrowSprite.width;
                const sh = assets.arrowSprite.height / frameRows;
                const sy = row * sh;

                previewCtx.drawImage(assets.arrowSprite, 0, sy, sw, sh, -size / 2, -size / 2, size, size);
                previewCtx.restore();
            } else {
                previewCtx.fillStyle = colors[note.col];
                previewCtx.fillRect(x, y, laneWidth - 2, laneWidth - 2);
            }
        }
        else if (note.type === 'mine') {
            if (assets.loaded.mineSprite) {
                const size = laneWidth;
                previewCtx.save();
                previewCtx.translate(x + size / 2, y + size / 2);
                previewCtx.rotate(gameState.globalFrame * 0.1); // Spin?
                previewCtx.drawImage(assets.mineSprite, 0, 0, assets.mineSprite.width, assets.mineSprite.height, -size / 2, -size / 2, size, size);
                previewCtx.restore();
            } else {
                previewCtx.fillStyle = '#f00';
                previewCtx.beginPath();
                previewCtx.arc(x + laneWidth / 2, y + laneWidth / 2, laneWidth / 3, 0, Math.PI * 2);
                previewCtx.fill();
            }
        }
        else if (note.type === 'hold' || note.type === 'roll') {
            if (note.endTime) {
                const tailDiff = note.endTime - time;
                const headDiff = diff; // note.time - time

                // If tail is passed (tailDiff <= 0), don't draw anything
                if (tailDiff <= 0) continue;

                // Visual Start Time (clipped to "now" if started)
                const visualHeadDiff = Math.max(0, headDiff);

                // Calc Ys
                // Start Y (Head or Receptor if held)
                const headY = isDownScroll ? receptorY - (visualHeadDiff * speed) : receptorY + (visualHeadDiff * speed);
                // End Y (Tail)
                const tailY = isDownScroll ? receptorY - (tailDiff * speed) : receptorY + (tailDiff * speed);

                let topY, bottomY;
                if (isDownScroll) {
                    topY = tailY;
                    bottomY = headY;
                } else {
                    topY = headY;
                    bottomY = tailY;
                }

                // Off-screen check for body
                if (bottomY < -60 || topY > height + 60) continue;

                // Draw Body (Tiled)
                if (canUseSkin && assets.loaded.holdBody) {
                    const bodyImg = note.type === 'roll' && assets.loaded.rollBody ? assets.rollBody : assets.holdBody;
                    const bw = laneWidth;

                    // We need to tile the texture from the HEAD (visual start) to the TAIL
                    // But effectively we fill the rect (x, topY, bw, bottomY - topY)
                    // With a texture that repeats. 
                    // To avoid "sliding" texture when the note moves, we should align the pattern to the NOTE's start, not the screen.
                    // However, standard SM holds often just tile within the quad.
                    // If we tile relative to screen, it looks like a window. 
                    // We want the texture to move with the note.
                    // So we must offset the pattern or draw manually.

                    // Let's loop manually.
                    const bodyLen = bottomY - topY;
                    const imgH = bodyImg.height;
                    const imgW = bodyImg.width;

                    if (bodyLen > 0) {
                        previewCtx.save();
                        // Clip to body area
                        previewCtx.beginPath();
                        previewCtx.rect(x, topY, bw, bodyLen);
                        previewCtx.clip();

                        // Upscroll: Texture starts at bottomY (Tail)? No, usually Top (Head) for Upscroll?
                        // Actually, SM textures: "Down Hold Body" implies it's designed for Downscroll or generic?
                        // Usually 64x64 or similar.
                        // We want the texture anchored to the NOTE HEAD (which is at headY or receptorY if held).
                        // Note Head Position (Real):
                        const realHeadY = isDownScroll ? receptorY - (headDiff * speed) : receptorY + (headDiff * speed);

                        // We want to tile starting from `realHeadY` downwards (or upwards).
                        // Let's just tile from topY to bottomY, but shift the phase by `topY`?
                        // No, if we want it to stick to the note, phase should be based on `realHeadY`.



                        // Tiling Logic: Anchor to realHeadY to prevent sliding
                        const startK = Math.floor((topY - realHeadY) / imgH);
                        // Limit loop to avoid infinite freeze
                        const maxTiles = Math.ceil((bottomY - topY) / imgH) + 2;

                        for (let k = startK; k < startK + maxTiles; k++) {
                            const tileY = realHeadY + k * imgH;
                            if (tileY >= bottomY) break;
                            if (tileY + imgH <= topY) continue; // Fully above topY

                            // Clip top/bottom
                            // Standard drawImage allows source/dest mismatch (scaling), but we want Clipping.
                            // If we draw full size at tileY, and tileY < topY, the top part is drawn outside expected area.
                            // BUT we have `previewCtx.clip()` active! 
                            // So we can simply draw the FULL tile at `tileY` and let the clip rect (topY..bottomY) handle it.
                            previewCtx.drawImage(bodyImg, 0, 0, imgW, imgH, x, tileY, bw, imgH);
                        }

                        previewCtx.restore();
                    }

                    // Cap (Head) - Draw ON TOP of body
                    // HIDING LOGIC: Only draw head if visualHeadDiff > 0 (not passed)
                    if (headDiff > 0) {
                        const size = laneWidth;
                        previewCtx.save();
                        // Head is always at headY (which is topY or bottomY depending on scroll)
                        // Upscroll: headY is topY. Downscroll: headY is bottomY?
                        // My variable: headY calculated from visualHeadDiff.

                        previewCtx.translate(x + size / 2, headY + size / 2);
                        previewCtx.rotate(rotations[note.col]);

                        const headImg = assets.loaded.holdHeadActive ? assets.holdHeadActive : assets.arrowSprite;

                        // Quantization for Hold Head?
                        // Usually Holds use a specific "Hold Head" sprite which might be quantized or might be single frame.
                        // Standard "Down Hold Active 1x8.png" suggests quantization support!
                        // Let's apply quantization to hold head too.

                        const row = getQuantizationRow(note.beat);
                        // Check if headImg has frames. 
                        // If it's "1x8" in name or we assume it is the arrow sprite.
                        // Safest: Check aspect ratio?
                        // If height >> width, assume frames.
                        let sy = 0;
                        let sh = headImg.height;
                        if (headImg.height >= headImg.width * 4) { // Heuristic: at least 4 frames
                            sh = headImg.height / 8;
                            sy = row * sh;
                        }

                        const hsw = headImg.width;
                        previewCtx.drawImage(headImg, 0, sy, hsw, sh, -size / 2, -size / 2, size, size);
                        previewCtx.restore();
                    }

                } else {
                    // Fallback
                    previewCtx.fillStyle = 'rgba(200, 200, 200, 0.5)';
                    previewCtx.fillRect(x + 5, topY, laneWidth - 10, bottomY - topY);
                }
            }
        }

    }

    if (!previewPaused) {
        previewLoopId = requestAnimationFrame(previewLoop);
    }
}

// --- Global Input Handler for Preview ---
window.addEventListener('keydown', (e) => {
    // Check if we are in Setup Panel (Song Select)
    const setupPanel = document.getElementById('setup-panel');
    if (!setupPanel || setupPanel.style.display === 'none') return;

    // Spacebar: Toggle Pause (Global in Song Select)
    if (e.code === 'Space') {
        e.preventDefault();
        togglePreviewPlayback();
    }

    // Arrows: Seek (Only in Preview Tab)
    if (typeof currentSongTab !== 'undefined' && currentSongTab === 'preview') {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
            // Seek with arrows
            if (previewAudio) {
                e.preventDefault();
                const step = 5; // 5 seconds
                const dir = e.code === 'ArrowRight' ? 1 : -1;
                let newTime = previewAudio.currentTime + (step * dir);
                if (previewAudio.duration) {
                    newTime = Math.max(0, Math.min(newTime, previewAudio.duration));
                }
                previewAudio.currentTime = newTime;
            }
        }
    }
});

// Note Density Graph
function renderDensityGraph(chart, canvas, totalTime) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth;
    const h = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, h);

    // Binning
    const binSize = 0.5; // 0.5 second bins for resolution
    const bins = Math.ceil(totalTime / binSize);
    const data = new Array(bins).fill(0);

    chart.notes.forEach(n => {
        if (n.type !== 'tap' && n.type !== 'hold' && n.type !== 'roll' && n.type !== 'mine') return; // Include mines? Maybe just taps/holds
        const b = Math.floor(n.time / binSize);
        if (b >= 0 && b < bins) data[b]++;
    });

    const maxDensity = Math.max(...data, 1);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < bins; i++) {
        const x = (i / bins) * w;
        const nextX = ((i + 1) / bins) * w;
        const val = data[i];
        const barH = (val / maxDensity) * h;
        const y = h - barH;

        ctx.lineTo(x, y);
        ctx.lineTo(nextX, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

// --- Settings Tab Switcher ---
function switchSettingsTab(tabName) {
    // Hide all tabs
    const tabs = ['gameplay', 'controls', 'audio', 'data'];
    tabs.forEach(t => {
        const el = document.getElementById('set-tab-' + t);
        if (el) el.style.display = 'none';
        const btn = document.getElementById('set-tab-btn-' + t);
        if (btn) btn.classList.remove('active');
    });

    // Show target
    const targetEl = document.getElementById('set-tab-' + tabName);
    if (targetEl) {
        targetEl.style.display = 'block';
    }
    const targetBtn = document.getElementById('set-tab-btn-' + tabName);
    if (targetBtn) targetBtn.classList.add('active');
}

// --- Key Binding Logic ---
function startKeyBind(target) {
    if (typeof target === 'number') {
        bindingIndex = target;
        bindingType = null;
        document.getElementById('key-btn-' + target).innerText = '...';
    } else {
        bindingIndex = -2; // Special flag for system keys
        bindingType = target;
        document.getElementById('key-btn-' + target).innerText = 'Waiting...';
    }
}

// --- Data Management ---
function wipeSongDatabase() {
    if (confirm("Are you sure you want to clear the Song Cache?\n\nThis will remove loaded songs from memory/storage.\nYour SCORES will be preserved.\n\nYou will need to re-import your songs.")) {
        // Clear Memory
        if (typeof songLibrary !== 'undefined') songLibrary = [];

        // Clear Storage
        try {
            // Only remove the library cache
            localStorage.removeItem('sm_songLibrary');
            localStorage.removeItem('webSM_library_meta');

            // Legacy cleanup? (Optional, but user asked to NOT delete scores)
            // We explicitly do NOT touch 'webSM_lb_' or 'sm_scores_' keys.

            alert("Song Cache Cleared.\nScores were preserved.\nReloading...");
            location.reload();
        } catch (e) {
            alert("Error wiping data: " + e);
        }
    }
}

// --- Sync Utilities ---
function calculateSD(data) {
    if (!data || data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const sqDiffs = data.map(v => Math.pow(v - mean, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / sqDiffs.length;
    return Math.sqrt(avgSqDiff);
}

function adjustGlobalOffset(delta) {
    if (typeof userConfig.globalOffset === 'undefined') userConfig.globalOffset = 0;
    userConfig.globalOffset += delta;
    console.log(`Global Offset Adjusted: ${delta.toFixed(2)}ms -> New Total: ${userConfig.globalOffset.toFixed(2)}ms`);

    // Update Settings UI if present
    const display = document.getElementById('val-global-offset');
    if (display) display.innerText = userConfig.globalOffset.toFixed(0) + "ms";

    saveUserConfig();
}

function updateSyncStats() {
    let overlay = document.getElementById('sync-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sync-overlay';
        overlay.style.position = 'absolute';
        // Move to Right Side
        overlay.style.top = '50%';
        overlay.style.right = '50px';
        overlay.style.left = 'auto';
        overlay.style.transform = 'translateY(-50%)';
        overlay.style.background = 'rgba(0, 0, 0, 0.8)';
        overlay.style.padding = '20px';
        overlay.style.borderRadius = '10px';
        overlay.style.border = '2px solid #00e5ff';
        overlay.style.textAlign = 'center';
        overlay.style.fontFamily = "'Mochiy Pop One', sans-serif";
        overlay.style.zIndex = '10000'; // Above canvas
        overlay.style.minWidth = '200px';
        overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
        overlay.innerHTML = `
            <h2 style="color:#00e5ff; margin:0 0 10px 0;">Sync Calibration</h2>
            <div id="sync-stats-content" style="color:#fff;">Collecting samples...</div>
            <div style="margin-top:10px; font-size:0.8rem; color:#aaa;">Press ESC to Finish & Apply</div>
        `;
        // Append to game-hud instead of body for proper layering
        const gameHud = document.getElementById('game-hud');
        if (gameHud) {
            gameHud.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }
    }
    overlay.style.display = 'block';

    const content = document.getElementById('sync-stats-content');
    if (content) {
        const batchSize = 24;
        const currentBatchCount = (window.syncBatch || []).length;
        const validBatchCount = (window.validBatches || []).length;
        const totalBatches = (window.syncHistory || []).length;

        let recommendedOffset = 0;
        if (validBatchCount > 0) {
            recommendedOffset = window.validBatches.reduce((a, b) => a + b, 0) / validBatchCount;
        }

        let historyHtml = "";
        if (totalBatches > 0) {
            const last = window.syncHistory[window.syncHistory.length - 1];
            historyHtml = `
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid #444;">
                    <div style="font-size:0.85rem; color:#aaa;">Last Batch:</div>
                    <div style="color:${last.valid ? '#4f4' : '#f44'}; font-size:1rem;">
                        ${last.valid ? 'VALID' : 'INVALID (High SD)'}
                    </div>
                    <div style="font-size:0.8rem; color:#888;">SD: ${last.sd.toFixed(2)}ms</div>
                </div>
            `;
        }

        content.innerHTML = `
            <div style="font-size:3.5rem; font-weight:bold; color:#fff; margin-bottom:10px;">
                ${window.lastHitOffset !== null ? (window.lastHitOffset > 0 ? '+' : '') + window.lastHitOffset.toFixed(2) : '--'}
            </div>
            <div style="font-size:1.1rem; margin-bottom:10px;">
                Batch Progress: <span style="color:#00e5ff;">${currentBatchCount}/${batchSize}</span>
            </div>
            <div style="font-size:1.1rem; margin-bottom:15px;">
                Valid Batches: <span style="color:#4f4;">${validBatchCount}</span> / ${totalBatches}
            </div>
            
            <div style="margin:10px 0; padding:15px; background:rgba(0,229,255,0.1); border-radius:5px; border:1px solid #00e5ff;">
                <div style="font-size:0.9rem; color:#00e5ff; text-transform:uppercase; letter-spacing:1px;">Recommended Offset</div>
                <div style="font-size:1.8rem; font-weight:bold; color:#fff;">${recommendedOffset.toFixed(1)}ms</div>
            </div>

            ${historyHtml}
        `;
    }
}
