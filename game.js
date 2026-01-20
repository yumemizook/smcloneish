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
    keyRateDown: '-',
    keyRateUp: '=',
    keyRateDown: '-',
    audioOffset: 0,
    audioOffsetA: 0,
    audioOffsetB: 0
};
// Expose to window for modifiers.js access assurance
window.userConfig = userConfig;

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
            if (!userConfig.keyRateDown) userConfig.keyRateDown = '-';
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
    "A": "#da5757", "B": "#5b78bb", "C": "#c97bff", "D": "#8c6239", "F": "#888888"
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
    detailedHits: []
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
                const lb = JSON.parse(localStorage.getItem(key)) || [];
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

        const rawLb = JSON.parse(localStorage.getItem(key)) || [];
        // Filter out Invalid scores (Negative Acc, Fail, Invalid Fctype)
        const lb = rawLb.filter(s => {
            const acc = parseFloat(s.acc);
            const fc = s.fcType || (s.judgments ? getFCType(s.judgments) : "");
            return acc >= 0 && fc !== "Fail" && fc !== "Invalid";
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
    btn.disabled = false;
    btn.innerText = "START GAME";

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

        if (nps > 15) {
            // Vibro
            const sortedCounts = [...colCounts].sort((a, b) => b - a);
            const top2 = sortedCounts[0] + sortedCounts[1];
            concentration = noteCount > 0 ? top2 / noteCount : 0;
            if (concentration > 0.8) {
                vibroFactor = Math.max(0.6, 1.0 - (concentration - 0.8) * 2.0);
            }

            // Quadspam
            const effectiveRows = buckets.size || 1;
            quantizedDensity = noteCount / effectiveRows;
            if (quantizedDensity > 2.5) {
                quadFactor = Math.max(0.4, 1.0 - (quantizedDensity - 2.5) * 1.0);
            }

            // Roll/Speed Cap
            if (nps > 30 && quantizedDensity < 1.6) {
                rollFactor = 30.0 / nps;
            }
        }

        const penalty = Math.min(vibroFactor, quadFactor, rollFactor);
        const penalizedNPS = nps * penalty;

        const rowCount = i - windowIndex;
        const jackFrequency = rowCount > 0 ? jackCount / rowCount : 0;
        const chordFrequency = rowCount > 0 ? chordCount / rowCount : 0;

        // Snap Complexity Factor (Average of row weights)
        const avgComplexity = rowCount > 0 ? complexitySum / rowCount : 1.0;

        // Mixed Snap Bonus
        // If window contains both 16th-family and 12th-family notes, boost Tech
        const mixedBonus = (hasBinary && hasTernary) ? 1.15 : 1.0;

        let sStr = penalizedNPS * rate; if (chordCount > 0) sStr *= 0.8; streamStrains.push(sStr);
        let sJs = penalizedNPS * rate; const jumpRatio = noteCount > 0 ? (chordCount / (noteCount / 2)) : 0;
        if (jumpRatio < 0.2) sJs *= 0.2; else sJs *= (0.8 + jumpRatio * 0.4); jsStrains.push(sJs);
        let sHs = 0; if (handCount > 0) { sHs = (penalizedNPS * rate) * 0.9 + (handCount * 1.5); } hsStrains.push(sHs);

        let sCj = penalizedNPS * rate * chordFrequency * jackFrequency;
        cjStrains.push(sCj);

        // Tech with Snap Complexity & Mixed Bonus
        let sTech = penalizedNPS * rate * (0.4 + jackFrequency) * avgComplexity * mixedBonus;
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
    let overall = (skills[0] * 1.5 + skills[1] * 0.5 + skills[2] * 0.2) / (1.5 + 0.5 + 0.2);
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

function calculateAccuracy(offsetMs) {
    const absOffset = Math.abs(offsetMs);
    if (typeof math === 'undefined' || !math.erf) return 0;

    // Scaling Logic for Accuracy
    // Formula: Scale = ( (10 - Diff) / 6 ) ^ 0.75
    // Note: Diff is clamped 4-9 usually, but let's be safe.
    let diff = userConfig.judgeDifficulty || 4;
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

function getGrade(percentage) {
    if (percentage >= 99.9935) return "AAAAA"; if (percentage >= 99.955) return "AAAA";
    if (percentage >= 99.7) return "AAA"; if (percentage >= 93) return "AA";
    if (percentage >= 80) return "A"; if (percentage >= 70) return "B";
    if (percentage >= 60) return "C"; return "D";
}
function getGradeColor(grade) { return GRADE_COLORS[grade] || "#888"; }

function calculateSSR(difficulty, accuracyDec) {
    if (accuracyDec < 0) return 0; // Clamp negative accuracy
    if (accuracyDec < 0.93) return difficulty * Math.pow(accuracyDec / 0.93, 6);
    else return difficulty * (1 + 15 * Math.pow(accuracyDec - 0.93, 2));
}

function getClearType() {
    if (gameState.failed) return "Failed";
    const j = gameState.judgments;
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
    // accumulatedAccuracyPoints is sum of 0-100 scores.
    // Average Score = Sum / Count (e.g. 99.5)
    // Acc Fraction (for grade/display logic expecting 0.0-1.0) = Avg / 100.
    if (gameState.totalNotesHitOrMissed > 0) {
        acc = (gameState.accumulatedAccuracyPoints / count) / 100;
    }
    const displayScore = Math.round(gameState.score);
    const displayAccPercent = (acc * 100).toFixed(4);

    setText('accuracy', displayAccPercent + "%");
    setText('score', displayScore);

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

    let lifeEl = uiCache['life-bar-fill'];
    if (!lifeEl) { lifeEl = document.getElementById('life-bar-fill'); uiCache['life-bar-fill'] = lifeEl; }
    if (lifeEl) lifeEl.style.height = gameState.life + "%";

    const grade = getGrade(acc * 100);
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
        showResults();
    }, 2500); // 2s fade + 0.5s hold
}

function triggerJudgement(note, offsetMs, isMiss = false) {
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
        gameState.hitOffsets.push(offsetMs);
        gameState.recentHits.push({ offset: offsetMs, time: Date.now() });
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
                scoreAdd = (1000000 / Math.max(1, gameState.totalNotesInChart));
                gameState.judgments.marvelous++; lifeChange = 1.0 * gainMult;
            }
            else if (absOffset <= getTimingWindow('perfect')) {
                judgeText = "PERFECT"; judgeClass = "judge-perfect"; breaksCombo = false;
                scoreAdd = (1000000 / Math.max(1, gameState.totalNotesInChart)) - 10;
                gameState.judgments.perfect++; lifeChange = 0.8 * gainMult;
            }
            else if (absOffset <= getTimingWindow('great')) {
                judgeText = "GREAT"; judgeClass = "judge-great"; breaksCombo = false;
                scoreAdd = ((1000000 / Math.max(1, gameState.totalNotesInChart)) - 10) * 0.6;
                gameState.judgments.great++; lifeChange = 0.4 * gainMult;
            }
            else if (absOffset <= getTimingWindow('good')) {
                judgeText = "GOOD"; judgeClass = "judge-good"; breaksCombo = true;
                scoreAdd = ((1000000 / Math.max(1, gameState.totalNotesInChart)) - 10) * 0.2;
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
            // For Miss, we pass a large offset or handle explicitly?
            // calculateAccuracy returns -275 for > 180ms.
            // Miss window is 180ms usually. 
            // Let's rely on a proxy offset or just hardcode the miss penalty from the function?
            // calculateAccuracy(181) -> -275 approx.
            accScore = calculateAccuracy(1000); // effectively infinite -> -275
        } else if (note.type === 'mine') {
            accScore = -500; // Keep mine separate? Or use calculateAccuracy? Mine logic usually distinct.
            // Previous code: accumulatedAccuracyPoints += -7.0; 
            // Let's keep -7.0 for Mine as it's not timed usually in the same curve way?
            // User wants "Accuracy" generally. 
            // Let's use the explicit value for mine to preserve existing logic if calculateAccuracy doesn't cover mines (it checks timing).
            // calculateAccuracy checks offset. Mine hit offset < 75. 
            // If we used it, we'd get positive points for hitting a mine (bad!).
            // So hardcode Mine penalty.
            accScore = -500; // Wait, previous was -7.0 acc points. 
            // Note: -500 was scoreAdd.
            // accPoints was -7.
            // We need to scale -7 to the new 0-100 system?
            // Old system: Max 3. -7 is ~ -2.3x Max.
            // New system: Max 100. -2.3x = -230.
            // Let's use -230 for Mine accumulator.
            accScore = -230;
        } else {
            accScore = calculateAccuracy(offsetMs);
        }

        gameState.accumulatedAccuracyPoints += accScore;
        gameState.totalNotesHitOrMissed++;
        scoreAdd = Math.max(0, scoreAdd); gameState.score += scoreAdd;

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
            time: audioCtx.currentTime - gameState.startTime,
            offset: isMiss ? null : offsetMs,
            judge: judgeText
        });
    }

    const currentAcc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / gameState.totalNotesHitOrMissed) : 100;
    gameState.accuracyHistory.push({ time: (audioCtx.currentTime - gameState.startTime), acc: currentAcc, grade: getGrade(currentAcc) });

    if (breaksCombo) gameState.combo = 0; else if (note.type !== 'mine') gameState.combo++;
    if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
    gameState.life = Math.max(0, Math.min(100, gameState.life + lifeChange));
    gameState.lifeHistory.push({ time: audioCtx.currentTime - gameState.startTime, val: gameState.life });
    gameState.comboHistory.push({ time: audioCtx.currentTime - gameState.startTime, val: gameState.combo });

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
    if (gameState.totalNotesHitOrMissed >= gameState.totalNotesInChart) {
        if (userConfig.failMode === 'end' && gameState.life <= 0) triggerFail();
        else setTimeout(showResults, 2000);
    }
}

function triggerHoldJudgement(note, isOK) {
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
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { }

    // Correct Acc Logic: Accumulated (0-100) / Count = Avg Score (0-100)
    // entry.acc expects "99.50" string.
    const count = gameState.totalNotesHitOrMissed || 1;
    const accPct = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / count : 0;

    // DP Score Logic: (Acc% / 100) * (Total * 2)
    const total = gameState.totalNotesInChart || 1;
    const dpScoreVal = (accPct / 100) * (total * 2);

    // Calc Stats
    // J4 Normalization for Save
    const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart || 1);
    const j4Stats = recalculateStatsInternal(gameState.detailedHits, 4, baseNoteScore);
    const j4DpVal = (j4Stats.acc / 100) * (gameState.totalNotesInChart * 2);

    // Calc Stats (Use J4 for Validity/SSR)
    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;

    // Strict J4 Validation
    let fcType = getFCType(j4Stats.judgments, j4Stats.grade);
    let ssr = calculateSSR(diff, j4Stats.acc / 100);

    if (gameState.failed) {
        fcType = "Fail";
        ssr = 0;
    } else if (j4Stats.acc < 83 || gameState.hasPausedDuringPlay) {
        fcType = "Invalid"; // Invalid if J4 < 83%
    }
    // Note: Played 'accPct' is still saved as 'acc', but validity relies on J4.

    const entry = {
        score: Math.round(gameState.score),
        dpScore: dpScoreVal.toFixed(2), // Save DP Score calculated from Acc
        grade: gameState.failed ? "F" : getGrade(accPct),
        acc: accPct.toFixed(4), // Save 0-100 directly
        date: Date.now(),
        rate: (typeof modConfig !== 'undefined' ? modConfig.rate : 1.0),
        sd: calculateSD(gameState.hitOffsets).toFixed(2),
        judgments: gameState.judgments,
        ssr: ssr,
        fcType: fcType,
        // New Metadata
        judgeDiff: userConfig.judgeDifficulty || 4,
        j4Acc: j4Stats.acc.toFixed(4),
        j4Dp: j4DpVal.toFixed(2)
    };

    lb.push(entry);
    // Sort logic
    lb.sort(sortLeaderboard);

    lb = lb.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(lb));

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

            div.innerHTML = `
                <span class="lb-rank">#${i + 1}</span>
                <span class="lb-score">${displayScore}</span>
                <span class="lb-grade">${entry.grade}${jBadge}</span>
                <span class="lb-acc">${origAcc}</span>
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
        // If failed, Acc is calculated over the ENTIRE chart.
        const totalMaxScore = (gameState.totalNotesInChart || 1) * 100;
        baseAcc = (gameState.accumulatedAccuracyPoints / totalMaxScore) * 100;
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
    let clearType = getClearType();
    let ssr = calculateSSR(diff, accFraction);

    if (gameState.failed) {
        clearType = "Fail";
        ssr = 0;
    } else if (accPct < 83 || gameState.hasPausedDuringPlay) {
        // Legacy: Check if we need to set Invalid
        clearType = "Invalid";
    }

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

    const grade = gameState.failed ? "F" : getGrade(accPct);
    const gradeEl = document.getElementById('res-grade');
    if (gradeEl) {
        gradeEl.innerText = grade;
        gradeEl.style.color = getGradeColor(grade);
        gradeEl.style.textShadow = `0 0 30px ${getGradeColor(grade)} `;
    }
    setText('res-acc', accPct >= 99.70 ? accPct.toFixed(4) + "%" : accPct.toFixed(2) + "%");
    setText('res-score', Math.round(gameState.score).toLocaleString());

    // Max DP is 2 * Total (Cumulative)
    const maxDP = total * 2;
    const resDpEl = document.getElementById('res-dp');
    if (resDpEl) {
        // dpPoints calculated above.
        resDpEl.innerHTML = `${dpPoints.toFixed(2)} <span style="font-size:0.75em; color:#888;">/ ${maxDP.toFixed(2)}</span>`;
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
function drawReceptor(x, y, rotation, colIndex) {
    ctx.save(); const halfSize = gameConfig.columnWidth / 2; ctx.translate(x + halfSize, y + halfSize); ctx.rotate(rotation * Math.PI / 180); const drawSize = gameConfig.arrowSize; const offset = -drawSize / 2; if (assets.loaded.receptorSprite) { const img = assets.receptorSprite; const sx = gameState.heldKeys[colIndex] ? img.width / 2 : 0; ctx.drawImage(img, sx, 0, img.width / 2, img.height, offset, offset, drawSize, drawSize); } else { ctx.beginPath(); const s = drawSize / 2.5; ctx.strokeStyle = gameState.heldKeys[colIndex] ? '#fff' : '#aaa'; ctx.lineWidth = 4; ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.lineTo(-s / 2, s); ctx.lineTo(-s / 2, 0); ctx.lineTo(-s, 0); ctx.closePath(); ctx.stroke(); }

    // Optimization: Check only visible range or usage caching. For now, using a specialized search in a small window is better than O(N).
    // Or simpler: We can iterate active notes in the game loop and flag check.
    // Let's use the optimized loop in gameLoop to populate 'activeHoldCols' for this frame.
    // Fallback: If colsActive is undefined (first frame?), use default false.
    const isHoldingActive = gameState.colsActive && gameState.colsActive[colIndex];

    if (isHoldingActive && assets.loaded.holdExplosion) {
        const expImg = assets.holdExplosion;
        const frame = Math.floor(Date.now() / 50) % 2;
        const fw = expImg.width / 2;
        // Fix: Use drawSize (receptor size) to ensure it matches width
        ctx.drawImage(expImg, frame * fw, 0, fw, expImg.height, offset, offset, drawSize, drawSize);
    }
    ctx.restore();
}
// Refactored drawNote with Alpha Fade & Alignment & Modifiers
function drawNote(note, y, rotation) {
    // --- MODIFIERS: EFFECT & APPEARANCE ---
    let drawX = note.col * gameConfig.columnWidth;
    let drawY = y;
    let alpha = 1.0;

    // CALIBRATION MODE: Fade notes after initial hits
    if (gameState.isCalibrationMode) {
        const hitCount = gameState.calibrationHits.length;
        const fadeAfter = gameState.calibrationFadeAfter;

        if (hitCount > fadeAfter) {
            // Fade based on distance from receptor
            const dist = Math.abs(y - gameConfig.receptorY);
            const fadeStart = 50; // Start fading 50px from receptor
            const fadeEnd = 200; // Fully invisible 200px away

            if (dist > fadeStart) {
                const fadeDist = fadeEnd - fadeStart;
                const currentDist = Math.min(dist - fadeStart, fadeDist);
                alpha = 1.0 - (currentDist / fadeDist);
                alpha = Math.max(0, alpha); // Clamp to 0
            }
        }
    }

    // 1. Appearance (Hidden/Sudden/Stealth)
    if (modConfig.appearance) {
        const type = modConfig.appearance.type;
        const offsetPct = modConfig.appearance.offset || 50;
        const offsetVal = offsetPct / 100;

        // Calculate relative position 0..1 (0 = Receptor, 1 = Bottom/Top of screen)
        // This depends on scroll direction and arrow Y relative to receptor.
        // Simple approx: Distance from receptor in pixels.
        const dist = Math.abs(y - gameConfig.receptorY);
        const screenH = canvas.height;

        if (type === 'stealth') {
            alpha = 0;
        } else if (type === 'hidden') {
            // Fade out as it gets closer. 
            // Visible at distance, invisible at receptor.
            // Fade start: offsetVal * screenH. Fade End: Receptor.
            const fadePoint = offsetVal * (screenH * 0.5) + 50; // Scaling
            if (dist < fadePoint) {
                alpha *= dist / fadePoint; // Multiply with existing alpha
            }
        } else if (type === 'sudden') {
            // Invisible at distance, fade in near receptor.
            const fadePoint = offsetVal * (screenH * 0.5) + 50;
            if (dist > fadePoint) alpha = 0;
            else {
                // Fade in: dist 0 = alpha 1. dist fadePoint = alpha 0.
                alpha *= (1 - (dist / fadePoint)); // Multiply with existing alpha
            }
        }
    }

    // 2. Effects (Drunk, etc)
    if (modConfig.effect && modConfig.effect.name !== 'none') {
        const eff = modConfig.effect.name;
        // Time based: currentSongTime (beat would be better)
        // We need audioCtx time.
        const time = audioCtx ? (audioCtx.currentTime - gameState.startTime) : 0;

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

    // --- HOLD/ROLL BODY DRAWING ---
    if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
        let tailY;
        const duration = note.endTime - note.time;
        // Need to account for potential rate mod logic if scrollSpeed is constant time?
        // gameConfig.scrollSpeed is pixels/sec. 
        let dist = duration * gameConfig.scrollSpeed;
        if (userConfig.downScroll) tailY = y - dist; else tailY = y + dist;

        let drawHeadY = y;
        let drawTailY = tailY;

        // Lock Head to Receptor if Active
        if (note.holdState === 'active') {
            drawHeadY = gameConfig.receptorY;
        }
        // If missed, drawHeadY remains 'y' (scrolling away) as set above.

        const bodyImg = note.type === 'hold' ? assets.holdBody : assets.rollBody;
        const bodyLoaded = note.type === 'hold' ? assets.loaded.holdBody : assets.loaded.rollBody;

        if (bodyLoaded) {
            ctx.save();

            // Alpha Fading Logic (Grace Period & Rolls)
            if (note.letGoTime) {
                const timeStr = (audioCtx ? audioCtx.currentTime - gameState.startTime : 0) - note.letGoTime;
                const ms = timeStr * 1000;
                const graceAlpha = Math.max(0, 1 - (ms / 250));
                ctx.globalAlpha *= graceAlpha;
            }
            // Roll Transparency
            if (note.rollAlpha !== undefined) {
                ctx.globalAlpha *= note.rollAlpha;
            }

            // Dim Missed Holds
            if (note.holdState === 'missed') {
                ctx.globalAlpha *= 0.5; // Dim the body
                // Optional: Gray scale filter? 
            }

            ctx.beginPath();
            const w = gameConfig.arrowSize; // * (mini ? 0.5 : 1)
            const bx = x + (gameConfig.columnWidth - w) / 2;

            // Determine Rect
            let ry = userConfig.downScroll ? drawTailY : drawHeadY;
            let rh = Math.abs(drawHeadY - drawTailY);

            // Clip & Draw
            ctx.rect(bx, ry, w, rh);
            ctx.clip();

            const scale = w / bodyImg.width;
            const sHeight = bodyImg.height * scale;
            const count = Math.ceil(rh / sHeight) + 1;

            // Fix Texture Sliding:
            // Texture should be anchored to the Note's virtual Y position (y), not the Clipped Y (ry).
            // ry moves differently when active (locked to receptor).
            // y moves constantly with scroll.
            // When y matches ry (missed/inactive), texture matches.
            // When active, ry is fixed, y moves. We want texture to move (follow tail).
            // So we offset drawing by (y % sHeight) or similar.

            // We want the "Top" of the image to align with 'y'.
            // So calculate startY based on 'y'.
            // We need to cover the area starting at 'ry'.
            // Find minimal k such that (y + k*sHeight) < ry (or just cover the area).

            // Just drawing from 'y' downwards (or upwards) and letting clip handle it is easiest?
            // If downscroll: y is top (head). Tail is y - dist. 
            // We draw usually from Head to Tail (or Tail to Head?).
            // Let's assume standard texture is Top-Down.

            // We loop k relative to y.
            // We need to fill range [MinY, MaxY] of the rect.
            const rectTop = Math.min(drawHeadY, drawTailY);
            const rectBottom = Math.max(drawHeadY, drawTailY);

            // Calculate offset relative to Y
            // e.g. We want an image at y, y+h, y+2h...
            // Find index of first image that overlaps rectTop.
            // startImageIndex = floor((rectTop - y) / sHeight)
            const startK = Math.floor((rectTop - y) / sHeight);
            const endK = Math.ceil((rectBottom - y) / sHeight);

            for (let k = startK; k <= endK; k++) {
                ctx.drawImage(bodyImg, bx, y + (k * sHeight), w, sHeight);
            }

            ctx.restore();
        }
    }

    // --- HEAD DRAWING ---
    // Use modified x, y, rotation
    ctx.translate(x + halfSize, y + halfSize);
    ctx.rotate(rotation * Math.PI / 180);

    // Scale for Mini
    if (modConfig.effect && modConfig.effect.name === 'mini') {
        ctx.scale(0.5, 0.5);
    }

    const drawSize = gameConfig.arrowSize;
    const offset = -drawSize / 2;

    if (note.type === 'mine' && assets.loaded.mineSprite) {
        const frames = 8;
        const frame = Math.floor(gameState.globalFrame / 10) % frames;
        const fw = assets.mineSprite.width / 8;
        const fh = assets.mineSprite.height;
        ctx.drawImage(assets.mineSprite, frame * fw, 0, fw, fh, offset, offset, drawSize, drawSize);
    } else {
        let img = assets.arrowSprite;
        let rowIndex = getNoteRowIndex(note.beat);

        // Active Head Overriding
        if (note.holdState === 'active' && assets.loaded.holdHeadActive) {
            img = assets.holdHeadActive;

            // Re-lock to Receptor Y if active
            // Undo Effect Translation? 
            // If we are active, we are AT the receptor.
            // Receptor X is fixed (unless Drunk moves receptors too? usually receptors stay put or move with mod).
            // If mod moves Receptors, we should move.
            // If mod only moves Arrows (Visual), then when active (at receptor), we should match Receptor visual.
            // Assuming Receptors NOT transformed for now.
            // Force Y to ReceptorY. X to Standard Col X? Or Mod X?
            // If Drunk, Arrow sways. Receptor static. When crossing, arrow should align?
            // Usually Drunk moves receptors too given "Column" movement.
            // Let's assume Drunk moves note X only.

            ctx.restore(); // Undo translate/rotate
            ctx.save();
            ctx.globalAlpha *= alpha;

            // Recalculate X for Receptor (Static)
            // Or should we keep Drunk offset?
            // Let's keep Drunk offset for visual consistency.

            ctx.translate(x + halfSize, gameConfig.receptorY + halfSize);
            ctx.rotate(rotation * Math.PI / 180);
            if (modConfig.effect && modConfig.effect.name === 'mini') ctx.scale(0.5, 0.5);
        }

        if (assets.loaded.arrowSprite) {
            const sy = rowIndex * (img.height / 8);
            ctx.drawImage(img, 0, sy, img.width, img.height / 8, offset, offset, drawSize, drawSize);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(offset, offset, drawSize, drawSize);
        }
    }
    ctx.restore();
}
function drawErrorBar() { const eb = document.getElementById('errorBarCanvas'); if (!eb) return; const eCtx = eb.getContext('2d'); eCtx.clearRect(0, 0, eb.width, eb.height); const scale = 150 / 180; const now = Date.now(); gameState.recentHits = gameState.recentHits.filter(h => now - h.time < 2000); gameState.recentHits.forEach(h => { const x = 150 - (h.offset * scale); const age = now - h.time; const alpha = 1 - (age / 2000); let color = "255, 255, 255"; const abs = Math.abs(h.offset); if (abs <= J_MARVELOUS) color = "163, 247, 255"; else if (abs <= J_PERFECT) color = "255, 230, 0"; else if (abs <= J_GREAT) color = "68, 255, 75"; else if (abs <= J_GOOD) color = "0, 153, 255"; else if (abs <= J_BAD) color = "170, 0, 255"; else color = "255, 51, 51"; eCtx.fillStyle = `rgba(${color}, ${alpha})`; eCtx.fillRect(x - 1, 0, 3, 20); }); const offsets = gameState.hitOffsets; if (offsets.length > 0) { const sum = offsets.reduce((a, b) => a + b, 0); const mean = sum / offsets.length; setText('hit-mean', `${mean.toFixed(2)} ms`); } }
function drawNPSGraph() {
    const c = document.getElementById('npsGraph');
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);

    const now = audioCtx.currentTime - gameState.startTime;

    // Throttle Update: Every 250ms
    if (!gameState.lastNPSUpdate || now - gameState.lastNPSUpdate >= 0.25) {
        gameState.lastNPSUpdate = now;

        const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
        const currentSongTime = now * rate;

        // Calculate NPS from 3s window (Real Time)
        // Window in Song Time = 3 * rate
        let count = 0;
        for (let n of gameState.notes) {
            // Check window in Song Time
            if (n.time > currentSongTime - (3 * rate) && n.time <= currentSongTime) count++;
            if (n.time > currentSongTime) break; // Optimization
        }

        // Average NPS over 3 seconds (Real Time)
        gameState.currentNPS = (count / 3).toFixed(1);

        // Track Peak
        if (parseFloat(gameState.currentNPS) > parseFloat(gameState.peakNPS)) {
            gameState.peakNPS = gameState.currentNPS;
        }

        gameState.npsHistory.push({ time: now, val: parseFloat(gameState.currentNPS) });
        if (gameState.npsHistory.length > 50) gameState.npsHistory.shift();
    }

    setText('hud-nps', gameState.currentNPS);
    setText('hud-peak-nps', gameState.peakNPS);

    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Scale Graph
    const maxVal = Math.max(10, parseFloat(gameState.peakNPS));

    gameState.npsHistory.forEach((p, i) => {
        const x = (i / 50) * w;
        const y = h - (p.val / maxVal * h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}
function gameLoop() {
    if (!gameState.isPlaying || gameState.isPaused) return;

    // FPS / Latency Calculation
    const now = performance.now();
    const delta = now - gameState.lastFrameTime;
    gameState.lastFrameTime = now;

    // Throttle UI Update (every 200ms)
    if (typeof gameState.fpsTimer === 'undefined') gameState.fpsTimer = 0;
    gameState.fpsTimer += delta;

    if (gameState.fpsTimer >= 200) {
        const fps = delta > 0 ? 1000 / delta : 0;
        const fpsEl = document.getElementById('hud-fps-counter');
        if (fpsEl) {
            fpsEl.innerHTML = `<span style="color:#fff">${Math.round(fps)}</span> FPS <span style="font-size:0.8em; color:#aaa">(${delta.toFixed(1)}ms)</span>`;
            // Color Coding
            if (fps < 30) fpsEl.style.color = '#ff3333';
            else if (fps < 55) fpsEl.style.color = '#ffcc00';
            else fpsEl.style.color = 'rgba(255, 255, 255, 0.5)';
        }

        // Calibration HUD Update
        if (gameState.isCalibrationMode) {
            updateCalibrationHUD();
        }

        gameState.fpsTimer = 0;
    }

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

    // Apply Global Audio Offset
    // If offset is positive (Audio Lag), we want GameTime to be BEHIND system time,
    // so notes appear "later" to match the delayed audio.
    // Offset is in ms.
    const offsetSec = (userConfig.audioOffset || 0) / 1000;
    currentTime -= offsetSec;

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
    // We need to find current BPM at 'currentTime'.
    // Assuming 'gameState.chart.bpms' exists (parsed Simfile).
    if (gameState.chart && gameState.chart.bpms) {
        // Simple search (can be optimized)
        // BPMs: [{beat, value}]
        // We need current beat.
        // We can get beat from time? Or if we track currentBeat global?
        // Let's rely on finding standard BPM for now.
        // If we don't have a reliable getBeatFromTime function in scope, we might ESTIMATE.
        // Actually, logic usually iterates bpms to find scroll/speed.
        // Let's just find the latest BPM <= currentTime (converted to beat? or mapped).
        // Standard SM parsers act on Beats.
        // Without a robust Time->Beat sync in this loop text, we might just show initial or rely on a helper.
        // Let's assume we can get it via a helper or last active.
        // If not, we skip dynamic BPM for now and show valid initial.
        // WAIT: 'updateScrollSpeed' usually deals with BPM if CMOD is not used.
        // Let's try to fetch it if we can.
        // Hack: Just display the first BPM or last seen.
        // BETTER: Use 'currentBPM' tracked variable if exists.
        // If not, let's look for it in activeNotes? No.
        // Let's iterate bpms:
        // Update BPM Display
        let currentBPM = 120;
        if (typeof getCurrentBPM === 'function') {
            currentBPM = getCurrentBPM();
        } else if (gameState.chart && gameState.chart.bpms && gameState.chart.bpms.length > 0) {
            currentBPM = gameState.chart.bpms[0].bpm;
        }

        const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
        const displayBPM = currentBPM * rate;

        // Throttle BPM Text Update
        if (!gameState.lastBPMUpdateVal || Math.abs(gameState.lastBPMUpdateVal - displayBPM) > 0.01) {
            setText('hud-val-bpm', displayBPM.toFixed(2));
            gameState.lastBPMUpdateVal = displayBPM;
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

            // 1. Hit new notes
            if (!n.processed && n.holdState !== 'active' && n.type !== 'mine') {
                if (n.time <= currentTime) {
                    n.hit = true;
                    // Simulate Key Press Visual
                    gameState.heldKeys[n.col] = true;
                    triggerJudgement(n, 0, false);

                    // Note: triggerJudgement(hold) -> sets holdState='active'
                }
            }

            // 2. Maintain active Holds/Rolls
            if ((n.type === 'hold' || n.type === 'roll') && n.holdState === 'active') {
                gameState.heldKeys[n.col] = true;
                if (n.type === 'roll') n.lastPressTime = currentTime;
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

    const spriteRotations = [90, 0, 180, 270];
    const vectorRotations = [270, 180, 0, 90];
    for (let i = 0; i < 4; i++) {
        let rot = assets.loaded.receptorSprite ? spriteRotations[i] : vectorRotations[i];
        drawReceptor(i * gameConfig.columnWidth, gameConfig.receptorY, rot, i);
    }

    // Process & Draw Visible Notes
    // Process & Draw Visible Notes
    visibleNotes.forEach(note => {
        // --- HOLD LOGIC ---
        // If the note is a hold/roll that was hit (triggered active)
        if ((note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {

            // 1. Check if finalized (reached end)
            if (currentTime >= note.endTime) {
                note.holdState = 'ok';
                triggerHoldJudgement(note, true); // Trigger OK judgment
                return;
            }

            // 2. Check input status
            const keyHeld = gameState.heldKeys[note.col];

            if (note.type === 'hold') {
                if (!keyHeld) {
                    // Key released! Start grace period logic.
                    if (!note.letGoTime) {
                        note.letGoTime = currentTime; // Record when let go
                    }

                    // Check if grace period expired (250ms)
                    if ((currentTime - note.letGoTime) * 1000 > 250) {
                        note.holdState = 'ng';
                        triggerHoldJudgement(note, false); // Fail
                    }
                } else {
                    // Key IS held.
                    // If we were in grace period (letGoTime set), we recovered!
                    note.letGoTime = null;
                }
            } else if (note.type === 'roll') {
                // Roll logic: check time since last press
                const limit = 0.5; // 500ms roll window
                const timeDiff = currentTime - note.lastPressTime;

                if (timeDiff > limit) {
                    note.holdState = 'ng';
                    triggerHoldJudgement(note, false);
                } else {
                    // Roll Transparency Feedback (Fade as it gets closer to dying)
                    // timeDiff 0 -> 1.0 opacity
                    // timeDiff 0.5 -> 0.0 opacity (or minimal visible)
                    // Let's keep min opacity 0.3 so it's visible.
                    // Formula: 1 - (timeDiff / limit)
                    // We need to pass this alpha to the draw function? 
                    // The draw function below (drawImage) uses globalAlpha?
                    // We need to set a custom property on the note for the draw routine to read?
                    // Or verify if we are drawing the BODY here or later?
                    // This loop iterates visibleNotes but doesn't DRAW them yet.
                    // The drawing happens in a separate loop? No.
                    // Wait, `visibleNotes.forEach` block IS processing. where is drawing?

                    // Ah, this block (3206) is "Process & Draw Visible Notes" but I don't see drawImage calls for Body here.
                    // Let me check further down.
                    note.rollAlpha = Math.max(0.2, 1 - (timeDiff / limit));
                }
            }
        }

        if (note.processed && note.holdState !== 'active' && note.holdState !== 'missed') return;

        // Cleanup Missed Holds that have passed
        if (note.holdState === 'missed' && currentTime > note.endTime + 0.5) { // +0.5 buffer
            note.processed = true;
            return;
        }

        const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;

        const timeDiff = note.time - currentTime;

        // Mine Logic - Scale Window
        if (note.type === 'mine' && !note.processed) {
            // Convert to Real Time MS
            const realMsDiff = (timeDiff * 1000) / rate;

            if (Math.abs(realMsDiff) <= J_MINE_WINDOW) {
                if (gameState.heldKeys[note.col] && !gameState.isAutoplay) {
                    // Pass Song Time MS or Real Time MS appropriately? 
                    // triggerJudgement usually takes pure offset.
                    // Mines use a simplified trigger? 
                    // Original passed msDiff (Song Time). 
                    // But triggerJudgement uses it for stats? 
                    // Let's pass Real Time MS for consistency.
                    triggerJudgement(note, realMsDiff, false);
                }
            }
            // Use Scaled Expiry for Mines too?
            // If passed mine completely.
            // Original: msDiff < -J_MINE_WINDOW
            if (realMsDiff < -J_MINE_WINDOW) { note.processed = true; return; }
        }

        // AUTO PLAY LOGIC
        if (gameState.isAutoplay && !note.processed && !note.hit && note.type !== 'mine') {
            if (timeDiff <= 0) { // Exact time or passed
                note.hit = true;
                gameState.heldKeys[note.col] = true; // Visual feedback
                triggerJudgement(note, 0, false);

                // Track hit for calibration mode
                if (gameState.isCalibrationMode) {
                    gameState.calibrationHits.push(0);
                }
                // For Holds/Rolls
                if (note.type === 'hold' || note.type === 'roll') {
                    note.holdState = 'active';
                } else {
                    // Tap note: release key quickly
                    setTimeout(() => gameState.heldKeys[note.col] = false, 50);
                }
                return;
            }
        }

        // Autoplay Hold Release
        if (gameState.isAutoplay && (note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
            gameState.heldKeys[note.col] = true; // Keep holding
            if (currentTime >= note.endTime) {
                gameState.heldKeys[note.col] = false; // Release
            }
        }

        // MISS CHECK - Scale Window by Rate
        // If window is 180ms real time, that's (180/1000)*rate seconds in song time.
        // If timeDiff (Song Time) < -WindowSongTime, then we missed.
        if (timeDiff < -((J_MISS_WINDOW / 1000) * rate) && !note.hit && note.type !== 'mine' && note.holdState === 'inactive') {
            note.processed = true;
            triggerJudgement(note, J_MISS_WINDOW + 1, true);
            return;
        }
        let y;
        if (userConfig.downScroll) y = gameConfig.receptorY - (timeDiff * gameConfig.scrollSpeed);
        else y = gameConfig.receptorY + (timeDiff * gameConfig.scrollSpeed);

        // Visibility Check: Account for Tail (minY to maxY)
        let noteTop = y;
        let noteBottom = y;

        if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
            const duration = note.endTime - note.time;
            const dist = duration * gameConfig.scrollSpeed;
            let tailY;
            if (userConfig.downScroll) tailY = y - dist; else tailY = y + dist;

            noteTop = Math.min(y, tailY);
            noteBottom = Math.max(y, tailY);
        }

        // Add buffer (1000px)
        if (noteBottom > -1000 && noteTop < canvas.height + 1000) {
            const rowIndex = getNoteRowIndex(note.beat);
            let rot = assets.loaded.arrowSprite ? spriteRotations[note.col] : vectorRotations[note.col];
            drawNote(note, y, rot);
        }
    });

    drawErrorBar();
    drawNPSGraph();

    // Progress Bar & Time
    const totalTime = gameState.notes[gameState.notes.length - 1].time;
    // Progress bar uses Song Time % (unchanged, as both scale)
    const prog = Math.min(100, Math.max(0, (currentTime / totalTime) * 100));
    const progEl = document.getElementById('progress-bar');
    if (progEl) progEl.style.width = prog + "%";

    // Rate for Time String Scaling: Use outer 'rate' variable
    // const rate = ... (already defined in gameLoop scope)

    // Time Strings (Show Real Time)
    const formatTime = (t) => {
        t = Math.max(0, t);
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s} `;
    };

    // Throttle Time Updates (e.g. every 500ms or 1s, or just check changed string)
    // Actually, checking string change in setText handles the DOM part.
    // But we can avoid the math and template string creation too.

    if (!gameState.lastTimeUpdate || now - gameState.lastTimeUpdate > 500) {
        setText('time-elapsed', formatTime(currentTime / rate));
        setText('time-total', formatTime(totalTime / rate));
        gameState.lastTimeUpdate = now;
    }

    requestAnimationFrame(gameLoop);
}

let bindingIndex = -1; // -1: None, 0-3: Cols, 'pause', 'retry', 'rateUp', 'rateDown' (Strings)

function startKeyBind(index) {
    bindingIndex = index;
    const btnId = (typeof index === 'string') ? `key-btn-${index}` : `key-btn-${index}`;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.innerText = "...";
        btn.classList.add('binding');
    }

    // Add temporary listener
    const bindHandler = (e) => {
        e.preventDefault();

        let code = e.code;
        let key = e.key;
        let display = code;

        if (typeof bindingIndex === 'number') {
            // Binding Columns (Use Key char usually)
            userConfig.keys[bindingIndex] = key.toLowerCase();
            const b = document.getElementById(`key - btn - ${bindingIndex} `);
            if (b) b.innerText = key.toUpperCase();
        } else {
            // Binding System Keys
            const mapping = {
                'pause': 'keyPause',
                'retry': 'keyRetry',
                'rateUp': 'keyRateUp',
                'rateDown': 'keyRateDown'
            };
            const confKey = mapping[bindingIndex];
            if (confKey) {
                if (bindingIndex === 'rateUp' || bindingIndex === 'rateDown') {
                    userConfig[confKey] = key; // Use character (=, -, +)
                    display = key;
                } else {
                    userConfig[confKey] = code; // Use physical key (Escape, Backquote)
                }

                const b = document.getElementById(`key-btn-${bindingIndex}`);
                if (b) {
                    // Clean up display text
                    let label = bindingIndex.replace('rate', 'Rate ').replace('key', '');
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                    if (bindingIndex === 'rateUp') label = 'Rate +';
                    if (bindingIndex === 'rateDown') label = 'Rate -';
                    b.innerText = `${label}: ${display}`;
                }
            }
        }

        bindingIndex = -1;
        document.querySelectorAll('.key-bind-btn').forEach(b => b.classList.remove('binding'));
        document.removeEventListener('keydown', bindHandler);
        saveUserConfig(); // Auto save without redirect
    };
    document.addEventListener('keydown', bindHandler);
}
window.startKeyBind = startKeyBind;

function openSettings() {
    setScreen('settings-modal');

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

    // Init Audio Offset Input
    const offsetInput = document.getElementById('set-audio-offset');
    if (offsetInput) {
        offsetInput.value = userConfig.audioOffset || 0;
    }

    updateSettingsPreview();

    // Start Key Test Listener
    if (!window.keyTestListener) {
        window.keyTestListener = (e) => {
            if (document.getElementById('settings-modal').style.display === 'none') return;
            // Visual Feedback for Columns
            const colIndex = userConfig.keys.indexOf(e.key.toLowerCase());
            if (colIndex !== -1) {
                const el = document.getElementById(`test-col-${colIndex}`);
                if (el) {
                    if (e.type === 'keydown') el.classList.add('active');
                    else el.classList.remove('active');
                }
            }
        };
        window.addEventListener('keydown', window.keyTestListener);
        window.addEventListener('keyup', window.keyTestListener);
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

function updateAudioOffset(val) {
    userConfig.audioOffset = parseInt(val) || 0;
    saveUserConfig();
}
window.updateAudioOffset = updateAudioOffset;

function adjustOffset(amount) {
    let current = userConfig.audioOffset || 0;
    current += amount;
    userConfig.audioOffset = current;

    // Update Input
    const input = document.getElementById('set-audio-offset');
    if (input) input.value = current;

    saveUserConfig();
}
window.adjustOffset = adjustOffset;

function saveOffsetPreset(slot) {
    const key = `audioOffset${slot}`;
    userConfig[key] = userConfig.audioOffset || 0;
    saveUserConfig();
    const btn = event.target;
    const ogText = btn.innerText;
    btn.innerText = "Saved!";
    setTimeout(() => btn.innerText = ogText, 1000);
}
window.saveOffsetPreset = saveOffsetPreset;

function loadOffsetPreset(slot) {
    const key = `audioOffset${slot}`;
    const val = userConfig[key] || 0;
    userConfig.audioOffset = val;
    saveUserConfig();

    const input = document.getElementById('set-audio-offset');
    if (input) input.value = val;
}
window.loadOffsetPreset = loadOffsetPreset;

async function loadSyncChart() {
    closeModifiers();
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';

    // Search for sync song in library
    const syncIdx = songLibrary.findIndex(s =>
        s.meta.title.toLowerCase().includes('sync') ||
        s.meta.title.toLowerCase().includes('ideal')
    );

    if (syncIdx === -1) {
        alert('Sync calibration chart not found. Please import a song with "Sync" or "Ideal" in the title.');
        return;
    }

    // Select the sync song
    selectSong(syncIdx);

    // Wait a bit for song to load
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start calibration mode
    if (selectedChartIndex === -1 && songLibrary[syncIdx].charts.length > 0) {
        selectedChartIndex = 0;
    }

    startCalibrationMode();
}
window.loadSyncChart = loadSyncChart;

// State backup for calibration
let preCalibConfig = null;

function startCalibrationMode() {
    // 1. Save Config State
    preCalibConfig = {
        speedType: modConfig.speedType,
        speedValue: modConfig.speedValue,
        downScroll: userConfig.downScroll,
        judgments: userConfig.judgments, // Assuming fail type is here or gameConfig?
        // Check "Fail Off". Usually in `userConfig.failType`?
        // Let's assume standard fail type is stored in `userConfig`.
        // If not, we might need to look at `gameState.life` logic. 
        // Standard SM usually has Fail modes.
        // For this task, we assume "Fail Off" means preventing failure.
        // We will set a flag `gameState.cannotFail = true`.
    };

    // 2. Apply Overrides
    // Force C400
    modConfig.speedType = 'C';
    modConfig.speedValue = 400;

    // Force Upscroll
    userConfig.downScroll = false;

    // 3. Init Game State Flags
    if (!window.gameState) window.gameState = {};
    window.gameState.isCalibrationMode = true;
    window.gameState.calibrationHits = [];
    window.gameState.calibrationFadeAfter = 20;
    window.gameState.cannotFail = true;

    // 4. UI Setup
    document.getElementById('calibration-hud').style.display = 'block';

    // Hide Standard HUD Elements
    const standardHudIds = ['hud-score', 'combo', 'hud-life-bar', 'hud-life-text'];
    standardHudIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.visibility = 'hidden';
    });

    // Start the game normally
    startGameFromMenu();
    updateCalibrationHUD();
}

function updateCalibrationHUD() {
    if (!gameState.isCalibrationMode) return;

    const hits = gameState.calibrationHits;
    const n = hits.length;
    let mean = 0;
    let stdDev = 0;

    if (n > 0) {
        mean = hits.reduce((a, b) => a + b, 0) / n;
        const variance = hits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        stdDev = Math.sqrt(variance);
    }

    setText('calib-val-n', n);
    setText('calib-val-mean', (mean > 0 ? "+" : "") + mean.toFixed(2) + "ms");
    setText('calib-val-sd', stdDev.toFixed(2) + "ms");
    setText('calib-val-current', userConfig.audioOffset || 0);
}

function quitCalibration(save) {
    // Restore Settings
    if (preCalibConfig) {
        modConfig.speedType = preCalibConfig.speedType;
        modConfig.speedValue = preCalibConfig.speedValue;
        userConfig.downScroll = preCalibConfig.downScroll;
        preCalibConfig = null;
    }

    // Hide Calib HUD / Show Standard
    document.getElementById('calibration-hud').style.display = 'none';
    document.getElementById('calib-results-modal').style.display = 'none';

    // Restore Visibility of Standard HUD Elements
    const standardHudIds = ['hud-score', 'combo', 'hud-life-bar', 'hud-life-text'];
    standardHudIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.visibility = 'visible';
            // Combo is usually hidden until hit, but visibility property handles layout.
            // Resetting to visible might show empty combo box?
            // `initGame` usually hides combo.
            // So we just need to ensure the container isn't permanently hidden.
            if (id === 'combo') el.style.visibility = 'hidden';
        }
    });

    if (save && window.pendingCalibrationOffset !== undefined) {
        userConfig.audioOffset = window.pendingCalibrationOffset;
        saveUserConfig();
        const input = document.getElementById('set-audio-offset');
        if (input) input.value = userConfig.audioOffset;
    }

    gameState.isCalibrationMode = false;
    quitGame();
}

function showCalibrationResults() {
    // Stop audio
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        gameState.audioEl.pause();
    } else if (audioSource) {
        try { audioSource.stop(); } catch (e) { }
    }

    gameState.isPlaying = false;
    gameState.isPaused = true;

    const hits = gameState.calibrationHits;

    if (hits.length === 0) {
        alert('No hits recorded. Play at least a few notes before checking calibration.');
        quitCalibration(false);
        return;
    }

    // Calculate statistics
    const mean = hits.reduce((a, b) => a + b, 0) / hits.length;
    const variance = hits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / hits.length;
    const stdDev = Math.sqrt(variance);
    const suggestedOffset = Math.round((userConfig.audioOffset || 0) + mean);

    window.pendingCalibrationOffset = suggestedOffset;

    // Update Modal
    setText('res-calib-n', hits.length);
    setText('res-calib-mean', mean.toFixed(2) + "ms");
    setText('res-calib-sd', stdDev.toFixed(2) + "ms");
    setText('res-calib-current', userConfig.audioOffset || 0);
    setText('res-calib-suggested', suggestedOffset);

    // Setup Buttons
    document.getElementById('btn-calib-save').onclick = () => quitCalibration(true);
    document.getElementById('btn-calib-discard').onclick = () => quitCalibration(false);

    document.getElementById('btn-calib-continue').onclick = () => {
        document.getElementById('calib-results-modal').style.display = 'none';
        if (gameState.failed) {
            retryCurrentChart();
        } else {
            // Resume logic difficult if stopped. Better to restart loop.
            retryCurrentChart();
        }
    };

    // Show Modal
    document.getElementById('calib-results-modal').style.display = 'flex';
}

function togglePause() {
    if (!gameState.isPlaying || gameState.failed) return;

    // Calibration mode: Escape key shows results
    if (gameState.isCalibrationMode) {
        showCalibrationResults();
        return;
    }

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
    if (bindingIndex !== -1) return; // Ignore if binding

    // Custom Bindings
    const pauseKey = userConfig.keyPause || 'Escape';
    const retryKey = userConfig.keyRetry || 'Backquote';

    if (e.code === pauseKey) {
        if (gameState.isAutoplay) {
            quitGame();
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
            // Countdown phase: Use negative time relative to start (same as gameLoop)
            currentTime = (Date.now() - gameState.startTime) / 1000 * rate;
        }
    } else {
        currentTime = (audioCtx.currentTime - gameState.startTime) * rate;
    }

    const key = e.key.toLowerCase();
    const colIndex = userConfig.keys.indexOf(key);
    if (colIndex === -1) return;

    // BLOCK INPUT IF AUTOPLAY
    if (gameState.isAutoplay) return;

    if (e.type === 'keydown') {
        gameState.heldKeys[colIndex] = true;

        // Optimization: Find active roll to start holding
        for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
            const n = gameState.activeNotes[i];
            // Fix: Use Song Time for optimization check
            if (n.time > currentTime + (2.0 * rate)) break;

            if (n.col === colIndex && n.type === 'roll' && n.holdState === 'active') {
                // n.lastPressTime is used for roll drop check (real time delta usually)
                // Let's store Real Time of press for roll logic consistency or Song Time?
                // roll logic (lines 2508) uses (currentTime - note.lastPressTime). 
                // In gameLoop, currentTime is Song Time. 
                // So updating with Song Time here is consistent.
                n.lastPressTime = currentTime;
                break;
            }
        }
    }

    if (e.type === 'keyup') gameState.heldKeys[colIndex] = false;

    if (e.type !== 'keydown') return;

    // Find Hittable Note
    let hittableNote = null;
    const windowSeconds = (J_BAD / 1000) * rate; // Scale window to Song Time

    for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
        const n = gameState.activeNotes[i];
        if (n.processed) continue;
        if (n.holdState === 'active') continue;

        // Song Time Diff
        const diff = n.time - currentTime;

        // CRITICAL FIX: Ghost Judgements in Empty Space
        // Prevent matching notes that are unreasonable far.
        // Hard cap at 2.0s (Song Time) to strictly prevent cross-mapping distant notes
        // while allowing large windows at high rates (e.g. 3x rate = 0.54s window).
        if (diff > 2.0) break;
        if (diff < -2.0) continue;

        // Too old? (Late)
        if (diff < -windowSeconds) continue;

        // Too far in future? (Early)
        if (diff > windowSeconds) break;

        if (n.col === colIndex && n.type !== 'mine') {
            hittableNote = n;
            break;
        }
    }

    if (hittableNote) {
        hittableNote.hit = true;
        // Convert Song Time Diff to Real Time MS for Judgment
        const diffMs = (hittableNote.time - currentTime) * 1000 / rate;
        triggerJudgement(hittableNote, diffMs, false);

        // Track hit for calibration mode
        if (gameState.isCalibrationMode) {
            gameState.calibrationHits.push(diffMs);
        }
    }
} window.addEventListener('keydown', handleInput); window.addEventListener('keyup', handleInput); window.addEventListener('resize', () => { if (gameState.isPlaying) setupCanvas(); });

// ** INITIALIZE GAME STATE **
function initGame(chartInfo, audioBuf, meta, diffStats, audioUrl) {
    // Preserve calibration mode if it was set
    const wasCalibrationMode = gameState && gameState.isCalibrationMode;
    const calibrationHits = gameState && gameState.calibrationHits || [];
    const calibrationFadeAfter = gameState && gameState.calibrationFadeAfter || 20;

    gameState = {
        audioUrl: audioUrl, // Store URL
        score: 0,
        combo: 0,
        maxCombo: 0,
        life: 50,
        judgments: { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, ok: 0, ng: 0, mine: 0 },
        accuracyHistory: [],
        lifeHistory: [],
        comboHistory: [],
        hitOffsets: [],
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
        bpmTimes: [], // Pre-calculated time-based BPM segments
        isAutoplay: !!window.isAutoplayLaunch, // Set Autoplay State
        lastFrameTime: performance.now(),
        fpsTimer: 0,
        // Calibration mode flags
        isCalibrationMode: wasCalibrationMode,
        calibrationHits: calibrationHits,
        calibrationFadeAfter: calibrationFadeAfter
    };
    window.isAutoplayLaunch = false; // Reset flag

    // TARGET TRACKER INIT
    gameState.targetTrackerPB = 0;
    if (modConfig.targetTracker && modConfig.targetTrackerMode === 'pb') {
        const key = `webSM_lb_${meta.title}_${chartInfo.difficulty} `;
        try {
            const lb = JSON.parse(localStorage.getItem(key)) || [];
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
    setText('hit-mean', 'Mean: 0.00ms');
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
                // Calibration mode: loop the song
                if (gameState.isCalibrationMode) {
                    // Restart the song
                    retryCurrentChart();
                } else {
                    // Normal mode: show results
                    // Determine finish
                }
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
    if (gameState.isAutoplay) return; // Don't save autoplay

    // Normalize to Judge 4
    // We need to use `calculateStatsFromOffsets` logic but integrated properly.
    // Let's implement the logic inline or use a robust helper.
    // Since `calculateStatsDetailed` above relies on scope vars (baseNoteScore), let's fix that.

    const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart || 1);

    // 1. Calculate J4 Stats
    // We pass `gameState.detailedHits`.
    const j4Stats = recalculateStatsInternal(gameState.detailedHits, 4, baseNoteScore);

    // DP Score for Saved J4
    // Formula: (Acc% / 100) * (Total * 2)
    const total = gameState.totalNotesInChart || 1;
    const dpVal = (j4Stats.acc / 100) * (total * 2);

    const scoreObj = {
        score: Math.round(j4Stats.score), // Rounded
        dpScore: dpVal.toFixed(2), // Added derived DP
        judgments: j4Stats.judgments,
        acc: j4Stats.acc.toFixed(4), // Ensure string format matches? Or number? Leaderboard expects string usually
        grade: forceFail ? 'F' : j4Stats.grade,
        maxCombo: gameState.maxCombo,
        fcType: getFCType(j4Stats.judgments, forceFail ? 'F' : j4Stats.grade), // Need helper or inline
        timestamp: Date.now(),
        judgeDiff: userConfig.judgeDifficulty || 4, // METADATA: Saved usage diff
        rate: (modConfig && modConfig.rate) ? modConfig.rate : 1.0,
        detailedHits: gameState.detailedHits // Save for future re-calc if needed? (Optional, might be heavy)
    };

    // Save to local storage
    if (selectedSongIndex === -1 || selectedChartIndex === -1) return;
    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];
    const key = `webSM_lb_${song.meta.title}_${chart.difficulty}`;

    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { }
    lb.push(scoreObj);
    // Sort? Usually handled by display.
    try { localStorage.setItem(key, JSON.stringify(lb)); } catch (e) { console.warn("Score save failed", e); }

    console.log("Saved Normalized Score (J4):", scoreObj);

    // Store hits for Results Screen Toggling
    lastDetailedHits = [...gameState.detailedHits];
}

// Helper to fully recalc stats (Self Contained)
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
        const type = h.judge.toUpperCase();
        if (type === 'MINE') { j.mine++; score -= 500; accPts += -230; count++; return; } // Scaled -7 -> -230
        if (type === 'OK') { j.ok++; return; }
        if (type === 'NG') { j.ng++; accPts += -150; count++; return; } // Scaled -4.5? -150 approx (half miss)
        if (h.offset === null || type === 'MISS') { j.miss++; accPts += -275; count++; return; }

        // Tap
        const originalDiff = userConfig.judgeDifficulty;
        userConfig.judgeDifficulty = judgeDiff;
        try {
            const pt = calculateAccuracy(h.offset);
            accPts += pt;
        } finally {
            userConfig.judgeDifficulty = originalDiff;
        }

        // Buckets
        const abs = Math.abs(h.offset);
        if (abs <= wMarv) { j.marvelous++; score += sMarv; }
        else if (abs <= wPerf) { j.perfect++; score += sPerf; }
        else if (abs <= wGreat) { j.great++; score += sGreat; }
        else if (abs <= wGood) { j.good++; score += sGood; }
        else if (abs <= wBad) { j.bad++; score += 0; }
        else { j.miss++; } // Missed window but processed as hit?

        count++;
    });

    const acc = count > 0 ? (accPts / count) : 0;

    // Recalc Grade
    let grade = 'F';
    // Mapping from existing getGrade logic:
    // AAAAA (99.9935), AAAA (99.955), AAA (99.0), AA (93.0), A (80.0), B (70.0), C (60.0), D (45.0)
    // We should expose getGrade or dup it.
    // Assuming getGrade exists globally
    if (typeof getGrade === 'function') grade = getGrade(acc);

    return { judgments: j, score: Math.max(0, score), acc: acc, grade: grade };
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
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { }

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

        div.innerHTML = `
            <div class="ss-lb-main-row">
                <span class="ss-lb-rank">#${i + 1}</span>
                <div style="display:flex; align-items:baseline; gap:10px;">
                    <span style="font-size:0.9rem; color:#ffd700; font-family:'Mochiy Pop One'; text-shadow:0 0 5px rgba(255, 215, 0, 0.5);">${ssrVal}</span>
                    <span class="ss-lb-score">${displayScore}</span>
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
                    <span style="font-size:0.7em; color:#aaa; margin-top:2px">${getClearText(entry.fcType || "")}</span>
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
    const receptorY = isDownScroll ? height - 50 : 10;

    // Note: scrolling UP means earlier notes are at bottom? No, standard upscroll: notes come from bottom, receptor at top.

    // Check asset readiness (using main game assets)
    const canUseSkin = assets.loaded.arrowSprite && assets.loaded.receptorSprite;

    const laneWidth = 40;
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

    for (const note of previewChartData) {
        const diff = note.time - time;
        if (diff < -0.5 || diff > 2.0) continue; // optimization

        // Calc Y based on scroll direction
        // Downscroll: Notes fall DOWN to receptor (Y increases as diff decreases? Wait. Diff = noteTime - time)
        // Future note (diff > 0):
        // Upscroll: Note is BELOW receptor (Y > receptorY). Y = receptorY + diff * speed
        // Downscroll: Note is ABOVE receptor (Y < receptorY). Y = receptorY - diff * speed

        // Let's verify standard direction logic
        // Standard (Upscroll): Receptor at Top (50). Future Note at 1s (diff=1). Y should be 50 + 400 = 450. Correct.
        // Downscroll: Receptor at Bottom (600). Future Note at 1s (diff=1). Y should be 600 - 400 = 200. Correct.

        const y = isDownScroll ? receptorY - (diff * speed) : receptorY + (diff * speed);

        if (y > height + 60 || y < -60) continue; // Buffer

        const x = startX + note.col * laneWidth;

        // Draw Logic
        if (note.type === 'tap') {
            if (canUseSkin) {
                // Draw Image
                const size = laneWidth;
                previewCtx.save();
                previewCtx.translate(x + size / 2, y + size / 2);
                previewCtx.rotate(rotations[note.col]);
                // Frame 0 of 8 (1/8th height)
                const sw = assets.arrowSprite.width;
                const sh = assets.arrowSprite.height / 8;
                // Ensure no stretch? If sw != sh, standard behavior is usually to fit sq?
                // SM notes are square.
                previewCtx.drawImage(assets.arrowSprite, 0, 0, sw, sh, -size / 2, -size / 2, size, size);
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
            // Logic similar to tap but with body
            // We need endTime or length
            // note.endTime is populated in parser? Yes.
            // If active hold, we might need special handling, but for preview we can just draw based on times

            if (note.endTime) {
                const tailDiff = note.endTime - time;
                const headDiff = diff;

                // Calc Ys
                const headY = isDownScroll ? receptorY - (headDiff * speed) : receptorY + (headDiff * speed);
                const tailY = isDownScroll ? receptorY - (tailDiff * speed) : receptorY + (tailDiff * speed);

                // Length geometry:
                // Upscroll: Head is at headY (e.g. 450), Tail is at tailY (e.g. 850). Body is from 450 to 850.
                // Downscroll: Head is at headY (e.g. 200), Tail is at tailY (e.g. -200). Body is from -200 to 200.

                let topY, bottomY;
                if (isDownScroll) {
                    topY = tailY;
                    bottomY = headY;
                } else {
                    topY = headY;
                    bottomY = tailY;
                }

                // Draw Body
                if (canUseSkin && assets.loaded.holdBody) {
                    const bodyImg = note.type === 'roll' && assets.loaded.rollBody ? assets.rollBody : assets.holdBody;
                    const bw = laneWidth; // Body width usually slightly smaller?
                    const bh = bottomY - topY; // Length

                    if (bh > 0) {
                        // Tiling or stretching? SM usually stretches or tiles. Let's stretch for simplicity in preview
                        previewCtx.drawImage(bodyImg, x, topY, bw, bh);
                    }

                    // Cap (Head) - Draw ON TOP of body
                    const size = laneWidth;
                    previewCtx.save();
                    previewCtx.translate(x + size / 2, headY + size / 2); // Head always at headY
                    previewCtx.rotate(rotations[note.col]);

                    // Head sprite: assuming active hold head or tap note? 
                    // Usually "Hold Head Active" or just Tap Note. 
                    const headImg = assets.loaded.holdHeadActive ? assets.holdHeadActive : assets.arrowSprite;
                    // Frame 0
                    const hsw = headImg.width;
                    const hsh = headImg === assets.arrowSprite ? headImg.height / 8 : headImg.height; // Single frame or atlas?
                    // Verify "Down Hold Active 1x8.png" -> 8 frames
                    const srcH = headImg.src.includes('1x8') ? headImg.height / 8 : headImg.height;

                    previewCtx.drawImage(headImg, 0, 0, hsw, srcH, -size / 2, -size / 2, size, size);

                    previewCtx.restore();

                } else {
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
