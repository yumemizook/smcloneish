/* =========================================
   CONSTANTS & CONFIG
   ========================================= */
let userConfig = {
    keys: ['d', 'f', 'j', 'k'],
    downScroll: false,
    scrollTime: 650,
    failMode: 'on'
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

const J_MARVELOUS = 22.5;
const J_PERFECT = 45;
const J_GREAT = 90;
const J_GOOD = 135;
const J_BAD = 180;
const J_MISS_WINDOW = 180;
const J_MINE_WINDOW = 75;

const GRADE_COLORS = {
    "AAAAA": "#ffffff", "AAAA": "#66ccff", "AAA": "#eebb00", "AA": "#66cc66",
    "A": "#da5757", "B": "#5b78bb", "C": "#c97bff", "D": "#8c6239", "F": "#888888"
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
                    notes: parseNoteData(parts[5].replace(';', '').trim(), meta.bpms, meta.offset)
                });
            }
        }
    });

    return { meta, charts };
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

            if (notesRaw) {
                charts.push({
                    difficulty: difficulty,
                    meter: meter,
                    notes: parseNoteData(notesRaw.trim(), meta.bpms, meta.offset)
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

    measures.forEach((measure) => {
        const lines = measure.trim().split(/\s+/);
        const rows = lines.length;
        const beatPerLine = 4 / rows;
        const bpm = bpms[0].value;
        const secondsPerBeat = 60 / bpm;

        lines.forEach((line, rowIndex) => {
            const exactBeat = currentBeat + (rowIndex * beatPerLine);
            const time = (exactBeat * secondsPerBeat) - songOffset;

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
    const screens = ['setup-panel', 'game-hud', 'pause-menu', 'results-screen', 'settings-modal', 'settings-screen', 'loading-status'];
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

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
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

let gameConfig = { scrollSpeed: 0, receptorY: 0, columnWidth: 0, arrowSize: 0 };

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
                    // lb is sorted by score. The top one is usually the best.
                    // But let's check max grade just in case? Or just take top score's grade.
                    // Taking top score's grade is standard.
                    bestGrade = lb[0].grade;
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

    // Auto-select first difficulty
    if (song.charts && song.charts.length > 0) {
        selectDifficulty(0);
    }
}

function selectDifficulty(chartIndex) {
    selectedChartIndex = chartIndex;
    const items = document.querySelectorAll('.ss-diff-item');
    items.forEach((item, i) => {
        if (i === chartIndex) item.classList.add('active');
        else item.classList.remove('active');
    });

    const chart = songLibrary[selectedSongIndex].charts[chartIndex];
    if (chart.notes) {
        const calc = calculateDetailedDifficulty(chart.notes);
        setText('calc-nps', calc.nps.toFixed(2));
        setText('calc-peak', calc.peak.toFixed(2));
        setText('calc-overall', calc.overall.toFixed(1));
        setText('calc-stream', calc.stream.toFixed(1));
        setText('calc-jumpstream', calc.jumpstream.toFixed(1));
        setText('calc-handstream', calc.handstream.toFixed(1));
        setText('calc-chordjack', calc.chordjack.toFixed(1));
        setText('calc-technical', calc.technical.toFixed(1));
        setText('calc-stamina', calc.stamina.toFixed(1));
    } else if (chart.difficultyCalc) {
        // Use cached stats if notes aren't loaded (from storage)
        const calc = chart.difficultyCalc;
        setText('calc-nps', calc.nps.toFixed(2));
        setText('calc-peak', calc.peak.toFixed(2));
        setText('calc-overall', calc.overall.toFixed(1));
        setText('calc-stream', calc.stream.toFixed(1));
        setText('calc-jumpstream', calc.jumpstream.toFixed(1));
        setText('calc-handstream', calc.handstream.toFixed(1));
        setText('calc-chordjack', calc.chordjack.toFixed(1));
        setText('calc-technical', calc.technical.toFixed(1));
        setText('calc-stamina', calc.stamina.toFixed(1));
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

        // Sort by Accuracy for display
        lb.sort((a, b) => parseFloat(b.acc) - parseFloat(a.acc) || b.score - a.score);

        if (lb.length > 0) {
            const top = lb[0];

            // Grade & Score
            const gEl = document.getElementById('bs-grade');
            gEl.innerText = top.grade;
            gEl.style.color = GRADE_COLORS[top.grade] || '#fff';
            setText('bs-score', parseInt(top.score).toLocaleString());

            // Info Col
            // Acc Formatting: >= 99.7 used 4 decimals, else 2
            const accVal = parseFloat(top.acc);
            const accText = accVal >= 99.7 ? accVal.toFixed(4) : accVal.toFixed(2);
            setText('bs-acc', accText + "%");

            setText('bs-ssr', (top.ssr || 0).toFixed(2));
            // Use saved FC Type (Fail/Invalid support) or calculate legacy
            const calculatedFC = top.fcType || (top.judgments ? getFCType(top.judgments) : "");
            setText('bs-clear', calculatedFC);

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
            setText('bs-score', "000,000");
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
}

function calculateDetailedDifficulty(notes) {
    if (!notes || notes.length === 0) return { overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0, nps: 0, peak: 0 };

    // Rate Mod: Scale logic by rate
    // We'll use the global modConfig.rate if available
    let rate = 1.0;
    if (typeof modConfig !== 'undefined' && modConfig.rate) rate = modConfig.rate;

    // Filter out mines for all stats
    // We strictly only want 'tappable' notes: Tap, Hold Head, Roll Head.
    // Mines are excluded. Fakes/Lifts if present would also be excluded by this whitelist.
    // Hold/Roll Bodies are not separate note objects in this parser, so they are naturally excluded (only heads exist).
    const validNotes = notes.filter(n => n.type === 'tap' || n.type === 'hold' || n.type === 'roll');
    if (validNotes.length === 0) return { overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0, nps: 0, peak: 0 };

    const rows = [];
    let currentRow = { time: validNotes[0].time, notes: [] };
    for (let note of validNotes) {
        if (Math.abs(note.time - currentRow.time) < 0.002) { currentRow.notes.push(note); }
        else { rows.push(currentRow); currentRow = { time: note.time, notes: [note] }; }
    }
    rows.push(currentRow);
    if (rows.length < 2) return { nps: 0, peak: 0, overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0 };

    let maxNPS = 0;
    const streamStrains = [], jsStrains = [], hsStrains = [], cjStrains = [], techStrains = [];
    const windowPenalties = [];
    const windowSize = 1.0; let windowStart = rows[0].time; let windowIndex = 0;

    while (windowIndex < rows.length) {
        let noteCount = 0, chordCount = 0, handCount = 0, jackCount = 0;
        const colCounts = [0, 0, 0, 0];
        const buckets = new Set();
        let i = windowIndex;
        while (i < rows.length && rows[i].time < windowStart + windowSize) {
            const rowNotes = rows[i].notes;
            noteCount += rowNotes.length;
            rowNotes.forEach(n => {
                if (n.col >= 0 && n.col < 4) colCounts[n.col]++;
                buckets.add(Math.floor(n.time * 100)); // 10ms buckets
            });

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
            // Vibro: Penalty for high concentration in top 2 columns (Trills)
            const sortedCounts = [...colCounts].sort((a, b) => b - a);
            const top2 = sortedCounts[0] + sortedCounts[1];
            concentration = noteCount > 0 ? top2 / noteCount : 0;
            if (concentration > 0.8) {
                vibroFactor = Math.max(0.6, 1.0 - (concentration - 0.8) * 2.0);
            }

            // Quadspam: Quantized Density Check
            // Count effective rows using 10ms buckets
            const effectiveRows = buckets.size || 1;
            quantizedDensity = noteCount / effectiveRows;

            if (quantizedDensity > 2.5) {
                // Punishment for Hands (3.0) -> 0.5x, Quads (4.0) -> 0.4x
                quadFactor = Math.max(0.4, 1.0 - (quantizedDensity - 2.5) * 1.0);
            }

            // Roll/Speed Cap: If NPS > 30 and Density is Low (Single note stream/roll), cap it.
            if (nps > 30 && quantizedDensity < 1.6) {
                rollFactor = 30.0 / nps;
            }

            if (nps > 40) {
                console.log(`[DiffCalc] NPS: ${nps.toFixed(1)} | Den: ${quantizedDensity.toFixed(2)} | Conc: ${concentration.toFixed(2)} | Pen: ${Math.min(vibroFactor, quadFactor, rollFactor).toFixed(2)}`);
            }
        }

        // Apply penalty directly to this window's strains
        const penalty = Math.min(vibroFactor, quadFactor, rollFactor);
        const penalizedNPS = nps * penalty;

        const rowCount = i - windowIndex;
        const jackFrequency = rowCount > 0 ? jackCount / rowCount : 0;
        const chordFrequency = rowCount > 0 ? chordCount / rowCount : 0;

        let sStr = penalizedNPS * rate; if (chordCount > 0) sStr *= 0.8; streamStrains.push(sStr);
        let sJs = penalizedNPS * rate; const jumpRatio = noteCount > 0 ? (chordCount / (noteCount / 2)) : 0;
        if (jumpRatio < 0.2) sJs *= 0.2; else sJs *= (0.8 + jumpRatio * 0.4); jsStrains.push(sJs);
        let sHs = 0; if (handCount > 0) { sHs = (penalizedNPS * rate) * 0.9 + (handCount * 1.5); } hsStrains.push(sHs);

        // Reworked CJ/Tech: NPS * Rate * Frequency
        let sCj = penalizedNPS * rate * chordFrequency * jackFrequency;
        cjStrains.push(sCj);

        let sTech = penalizedNPS * rate * (0.4 + jackFrequency);
        techStrains.push(sTech);

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

    const denseThreshold = maxNPS * rate * 0.5;
    const denseStrains = streamStrains.filter(s => s > denseThreshold);
    const avgDense = denseStrains.length > 0 ? denseStrains.reduce((a, b) => a + b, 0) / denseStrains.length : 0;
    let sStamina = avgDense * (1 + Math.log10(Math.max(1, duration / 60)));

    const scale = (val) => { return 45 * (1 - Math.exp(-Math.pow(val / 25.5, 2.5))); };
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

window.onRateChange = (newRate) => {
    if (selectedChartIndex !== -1) {
        selectDifficulty(selectedChartIndex);
    }
};

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
    if (absOffset <= 5) return 100;
    else if (absOffset <= 65) return 100 * math.erf((65 - absOffset) / 22.7);
    else if (absOffset <= 180) return -275 * (absOffset - 65) / (115);
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
    const divisor = gameState.totalNotesHitOrMissed * 2;
    if (divisor > 0) acc = gameState.accumulatedAccuracyPoints / divisor;
    const displayScore = Math.round(gameState.score);
    const displayAccPercent = (acc * 100).toFixed(4);

    setText('accuracy', displayAccPercent + "%");
    setText('score', displayScore);

    const comboEl = document.getElementById('combo');
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
                        // MFC - Cyan
                        color = "#00e5ff";
                        shadow = "0 0 10px rgba(0, 229, 255, 0.8), 0 0 20px rgba(0, 229, 255, 0.5)";
                    } else if (!hasGreat) {
                        // PFC - Yellow
                        color = "#ffe600";
                        shadow = "0 0 10px rgba(255, 230, 0, 0.8), 0 0 20px rgba(255, 230, 0, 0.5)";
                    } else {
                        // FC - Lime Green
                        color = "#00ff00";
                        shadow = "0 0 10px rgba(0, 255, 0, 0.8), 0 0 20px rgba(0, 255, 0, 0.5)";
                    }
                }
            }

            comboEl.style.color = color;
            comboEl.style.textShadow = shadow;

        } else {
            comboEl.style.visibility = 'hidden';
        }
    }

    setText('life-percent', gameState.life.toFixed(1) + "%");

    const lifeEl = document.getElementById('life-bar-fill');
    if (lifeEl) lifeEl.style.height = gameState.life + "%";

    const grade = getGrade(acc * 100);
    const gEl = document.getElementById('live-grade');
    if (gEl) { gEl.innerText = grade; gEl.style.color = getGradeColor(grade); }
}

function updateJudgmentTracker() {
    setText('count-marvelous', gameState.judgments.marvelous);
    setText('count-perfect', gameState.judgments.perfect);
    setText('count-great', gameState.judgments.great);
    setText('count-good', gameState.judgments.good);
    setText('count-bad', gameState.judgments.bad);
    setText('count-miss', gameState.judgments.miss);
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

    if (!isMiss && note.type !== 'mine') {
        gameState.hitOffsets.push(offsetMs);
        gameState.recentHits.push({ offset: offsetMs, time: Date.now() });
    }

    if (note.type === 'mine') {
        // MINE HIT: Punishment but no textual judgement per request
        breaksCombo = true;
        gameState.judgments.mine++; gameState.accumulatedAccuracyPoints += -7.0;
        gameState.totalNotesHitOrMissed++; lifeChange = -16.0; note.processed = true;
    } else {
        let accPercent = isMiss ? -275 : calculateAccuracy(offsetMs);

        // Autoplay Penalty Override
        if (gameState.isAutoplay && !isMiss) {
            accPercent = -75000;
        }

        let dpPoints = 2 * (accPercent / 100);
        gameState.accumulatedAccuracyPoints += dpPoints; gameState.totalNotesHitOrMissed++;
        const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart);

        if (isMiss) {
            judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++; lifeChange = -8.0;
            if (note.type === 'hold' || note.type === 'roll') {
                note.holdState = 'missed'; // Mark as missed so we can draw the dead body
                note.processed = false; // Do not cleanup yet, let it scroll
            }
        } else {
            if (absOffset <= J_MARVELOUS) {
                judgeText = "MARVELOUS"; judgeClass = "judge-marvelous"; breaksCombo = false;
                scoreAdd = baseNoteScore; gameState.judgments.marvelous++; lifeChange = 0.8;
            }
            else if (absOffset <= J_PERFECT) {
                judgeText = "PERFECT"; judgeClass = "judge-perfect"; breaksCombo = false;
                scoreAdd = baseNoteScore - 10; gameState.judgments.perfect++; lifeChange = 0.8;
            }
            else if (absOffset <= J_GREAT) {
                judgeText = "GREAT"; judgeClass = "judge-great"; breaksCombo = false;
                scoreAdd = (baseNoteScore - 10) * 0.6; gameState.judgments.great++; lifeChange = 0.4;
            }
            else if (absOffset <= J_GOOD) {
                judgeText = "GOOD"; judgeClass = "judge-good"; breaksCombo = true;
                scoreAdd = (baseNoteScore - 10) * 0.2; gameState.judgments.good++; lifeChange = 0.0;
            }
            else if (absOffset <= J_BAD) { judgeText = "BAD"; judgeClass = "judge-bad"; breaksCombo = true; gameState.judgments.bad++; lifeChange = -4.0; }
            else {
                judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++; lifeChange = -8.0;
                if (note.type === 'hold' || note.type === 'roll') {
                    note.holdState = 'missed';
                    note.processed = false;
                }
            }
        }
        scoreAdd = Math.max(0, scoreAdd); gameState.score += scoreAdd;

        // If it was a hit (not miss), set active. IF it was a miss, we already handled it above.
        if (!isMiss && (note.type === 'hold' || note.type === 'roll')) {
            note.holdState = 'active'; note.processed = false; note.lastPressTime = audioCtx.currentTime - gameState.startTime;
        } else if (!isMiss) { note.processed = true; } // Taps/Mines processed immediately on hit

        gameState.detailedHits.push({
            time: audioCtx.currentTime - gameState.startTime,
            offset: isMiss ? null : offsetMs,
            judge: judgeText
        });
    }

    const currentAcc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2)) * 100 : 100;
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

    updateScoreDisplay(); updateJudgmentTracker();

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
}

function handleLeaderboard() {
    const key = `webSM_lb_${gameState.meta.title}_${gameState.chart.difficulty}`;
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { }

    const acc = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2) : 0;

    // Calculate extra stats
    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;

    // Determine Clear Type and SSR
    let fcType = getFCType(gameState.judgments);
    let ssr = calculateSSR(diff, acc);

    if (gameState.failed) {
        fcType = "Fail";
        ssr = 0;
    } else if ((acc * 100) < 83 || gameState.hasPausedDuringPlay) {
        fcType = "Invalid"; // Invalid Clear
    }

    const entry = {
        score: Math.round(gameState.score),
        grade: gameState.failed ? "F" : getGrade(acc * 100),
        acc: (acc * 100).toFixed(4), // Use 4 decimal points
        date: new Date().toLocaleDateString(),
        judgments: gameState.judgments,
        ssr: ssr,
        fcType: fcType
    };

    lb.push(entry);
    lb.sort((a, b) => parseFloat(b.acc) - parseFloat(a.acc) || b.score - a.score);
    lb = lb.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(lb));

    const list = document.getElementById('leaderboard-list');
    if (list) {
        list.innerHTML = '';
        lb.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'lb-entry';
            div.innerHTML = `<span class="lb-rank">#${i + 1}</span><span class="lb-score">${entry.score.toLocaleString()}</span><span class="lb-grade">${entry.grade}</span><span class="lb-acc">${entry.acc}%</span>`;
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
    const acc = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2) : 0;

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
    const total = gameState.totalNotesInChart;
    const accPct = acc * 100;

    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;

    // Determine Clear Type and SSR
    let clearType = getFCType(gameState.judgments);
    let ssr = calculateSSR(diff, acc);

    if (gameState.failed) {
        clearType = "Fail";
        ssr = 0;
    } else if (accPct < 83 || gameState.hasPausedDuringPlay) {
        clearType = "Invalid";
    }

    setText('res-clear-type', clearType);

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
        gradeEl.style.textShadow = `0 0 30px ${getGradeColor(grade)}`;
    }
    setText('res-acc', accPct >= 99.70 ? accPct.toFixed(4) + "%" : accPct.toFixed(2) + "%");
    setText('res-score', Math.round(gameState.score).toLocaleString());

    // Max DP is total notes * 2 (since max DP per note is 2)
    const maxDP = total * 2;
    const resDpEl = document.getElementById('res-dp');
    if (resDpEl) {
        resDpEl.innerHTML = `${gameState.accumulatedAccuracyPoints.toFixed(2)} <span style="font-size:0.75em; color:#888;">/ ${maxDP.toFixed(2)}</span>`;
    }

    setText('res-ssr', ssr.toFixed(2));
    setText('res-pauses', gameState.pauseCount);

    const comboPct = (gameState.maxCombo / total * 100).toFixed(2);
    setText('res-combo', gameState.maxCombo);
    setText('res-combo-pct', `(${comboPct}%)`);
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
    ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'].forEach(updateJudgeRes);

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
        // Previous (Baseline): `height*0.9 - 65`.
        // Up by 20px: `- 65 - 20`.
        gameConfig.receptorY = (canvas.height * 0.9) - 65 - 20;
    } else {
        // Upscroll: Base is 0.1.
        // Request: "move the upscroll receptors' absolute positions up by 40px"
        // Previous (Baseline): `height*0.1 + 65`.
        // Up by 40px: `+ 65 - 40`.
        gameConfig.receptorY = (canvas.height * 0.1) + 65 - 40;
    }
    let visibleDistance = userConfig.downScroll ? gameConfig.receptorY : canvas.height - gameConfig.receptorY;
    // gameConfig.scrollSpeed = visibleDistance / (userConfig.scrollTime / 1000);
    // Use new Logic
    updateScrollSpeed();
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
                alpha = dist / fadePoint;
            }
        } else if (type === 'sudden') {
            // Invisible at distance, fade in near receptor.
            const fadePoint = offsetVal * (screenH * 0.5) + 50;
            if (dist > fadePoint) alpha = 0;
            else {
                // Fade in: dist 0 = alpha 1. dist fadePoint = alpha 0.
                alpha = 1 - (dist / fadePoint);
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

            // Alpha Fading Logic (Grace Period)
            if (note.letGoTime) {
                const timeStr = (audioCtx ? audioCtx.currentTime - gameState.startTime : 0) - note.letGoTime;
                const ms = timeStr * 1000;
                const graceAlpha = Math.max(0, 1 - (ms / 250));
                ctx.globalAlpha *= graceAlpha;
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
function drawErrorBar() { const eb = document.getElementById('errorBarCanvas'); if (!eb) return; const eCtx = eb.getContext('2d'); eCtx.clearRect(0, 0, eb.width, eb.height); const scale = 150 / 180; const now = Date.now(); gameState.recentHits = gameState.recentHits.filter(h => now - h.time < 2000); gameState.recentHits.forEach(h => { const x = 150 - (h.offset * scale); const age = now - h.time; const alpha = 1 - (age / 2000); let color = "255, 255, 255"; const abs = Math.abs(h.offset); if (abs <= J_MARVELOUS) color = "163, 247, 255"; else if (abs <= J_PERFECT) color = "255, 230, 0"; else if (abs <= J_GREAT) color = "68, 255, 75"; else if (abs <= J_GOOD) color = "0, 153, 255"; else if (abs <= J_BAD) color = "170, 0, 255"; else color = "255, 51, 51"; eCtx.fillStyle = `rgba(${color}, ${alpha})`; eCtx.fillRect(x - 1, 0, 3, 20); }); const offsets = gameState.hitOffsets; if (offsets.length > 0) { const sum = offsets.reduce((a, b) => a + b, 0); const mean = sum / offsets.length; setText('hit-mean', `${mean.toFixed(2)}ms`); } }
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

        // Calculate NPS from 3s window
        // Count notes in [now - 3, now]
        // Note: NPS usually means "Notes Per Second". So count/3.
        // User said: "NPS is calculated from a 3s window".
        let count = 0;
        for (let n of gameState.notes) {
            if (n.time > now - 3 && n.time <= now) count++;
            if (n.time > now) break; // Optimization
        }

        // Average NPS over 3 seconds
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

    // Update Scroll Speed (X/M mods need dynamic update due to potential BPM changes or Rate changes if linked)
    if (typeof updateScrollSpeed === 'function') updateScrollSpeed();

    gameState.globalFrame++;

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
    const visibleNotes = [];
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
                // If lastPressTime is very old (> 500ms default for rolls? user configurable usually)
                // Note: roll inputs update note.lastPressTime in handleInput
                const limit = 0.5; // 500ms roll window
                if ((currentTime - note.lastPressTime) > limit) {
                    note.holdState = 'ng';
                    triggerHoldJudgement(note, false);
                }
            }
        }

        if (note.processed && note.holdState !== 'active' && note.holdState !== 'missed') return;

        // Cleanup Missed Holds that have passed
        if (note.holdState === 'missed' && currentTime > note.endTime + 0.5) { // +0.5 buffer
            note.processed = true;
            return;
        }

        const timeDiff = note.time - currentTime;
        if (note.type === 'mine' && !note.processed) {
            const msDiff = timeDiff * 1000;
            // Autoplay: Avoid mines? Or just ignore them. 
            // Real autoplay usually avoids mines. We'll simply not hit them.
            if (Math.abs(msDiff) <= J_MINE_WINDOW) {
                if (gameState.heldKeys[note.col] && !gameState.isAutoPlay) {
                    triggerJudgement(note, msDiff, false);
                }
            }
            if (msDiff < -J_MINE_WINDOW) { note.processed = true; return; }
        }

        // AUTO PLAY LOGIC
        if (gameState.isAutoPlay && !note.processed && !note.hit && note.type !== 'mine') {
            if (timeDiff <= 0) { // Exact time or passed
                note.hit = true;
                gameState.heldKeys[note.col] = true; // Visual feedback
                // Release key in next frames? We need a way to release.
                // Simple hack: Set a timeout or track auto-held keys?
                // For now, just setting it true might stick it.
                // Better: set it true, and have a logic to clear it.
                // Or just flash receptor.

                // Trigger Marvelous
                triggerJudgement(note, 0, false);

                // For Holds/Rolls
                if (note.type === 'hold' || note.type === 'roll') {
                    note.holdState = 'active';
                    // We need to keep key held.
                    // We can add a property `note.autoHold = true` and clear it at endTime.
                } else {
                    // Tap note: release key quickly
                    setTimeout(() => gameState.heldKeys[note.col] = false, 50);
                }
                return;
            }
        }

        // Autoplay Hold Release
        if (gameState.isAutoPlay && (note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
            gameState.heldKeys[note.col] = true; // Keep holding
            if (currentTime >= note.endTime) {
                gameState.heldKeys[note.col] = false; // Release
            }
        }

        if (timeDiff < -(J_MISS_WINDOW / 1000) && !note.hit && note.type !== 'mine' && note.holdState === 'inactive') {
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
    const prog = Math.min(100, Math.max(0, (currentTime / totalTime) * 100));
    const progEl = document.getElementById('progress-bar');
    if (progEl) progEl.style.width = prog + "%";

    // Time Strings
    const formatTime = (t) => {
        t = Math.max(0, t);
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    setText('time-elapsed', formatTime(currentTime));
    setText('time-total', formatTime(totalTime));

    requestAnimationFrame(gameLoop);
}

function startKeyBind(colIndex) {
    const btn = document.getElementById(`key-btn-${colIndex}`);
    if (!btn) return;

    btn.innerText = "Waiting...";
    btn.classList.add('waiting');

    const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = e.key.toLowerCase();
        // Prevent binding Escape
        if (e.code === 'Escape') {
            btn.innerText = userConfig.keys[colIndex].toUpperCase();
            btn.classList.remove('waiting');
            window.removeEventListener('keydown', handler, true);
            return;
        }

        userConfig.keys[colIndex] = key;
        btn.innerText = key.toUpperCase();
        btn.classList.remove('waiting');

        window.removeEventListener('keydown', handler, true);
    };

    window.addEventListener('keydown', handler, true);
}
window.startKeyBind = startKeyBind;

function openSettings() {
    setScreen('settings-modal');
    // Elements removed: scroll-speed-input, fail-mode-select, scroll-toggle

    // Update Buttons
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`key-btn-${i}`);
        if (btn) btn.innerText = userConfig.keys[i].toUpperCase();
    }
}
window.openSettings = openSettings;

function saveSettings() {
    // Keys are already updated in userConfig by the binder.
    // Speed/Fail are now handled by Modifiers menu.

    // Just persist config (mostly for keys)
    localStorage.setItem('webSM_config', JSON.stringify(userConfig));
    setScreen('setup-panel');
}
window.saveSettings = saveSettings;


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

        const acc = (gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2)) : 1) * 100;
        setText('pause-score', Math.round(gameState.score));
        setText('pause-acc', acc.toFixed(2) + "%");
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

// RATE CONTROL LOGIC
window.addEventListener('keydown', (e) => {
    // Only allow global rate control if not binding keys and not in gameplay (or allow in gameplay? User asked for keys, usually modifiers are menu only or pause).
    // Let's allow it in menu/song select. 
    // If playing, we might not want to change rate mid-song unless practicing?
    // User request: "wire - and = key to adjust rates".
    // Safest: Allow everywhere for now, or check generic "typing" state (none here).

    if (e.key === '-' || e.key === '_') {
        changeRateVal(-1);
    } else if (e.key === '=' || e.key === '+') {
        changeRateVal(1);
    }
});

// Callback from modifiers.js changeRateVal
window.onRateChange = (newRate) => {
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
                setText('calc-nps', calc.nps.toFixed(2));
                setText('calc-peak', calc.peak.toFixed(2));
                setText('calc-overall', calc.overall.toFixed(1));
                setText('calc-stream', calc.stream.toFixed(1));
                setText('calc-jumpstream', calc.jumpstream.toFixed(1));
                setText('calc-handstream', calc.handstream.toFixed(1));
                setText('calc-chordjack', calc.chordjack.toFixed(1));
                setText('calc-technical', calc.technical.toFixed(1));
                setText('calc-stamina', calc.stamina.toFixed(1));
            }
        }
    }
};

function handleInput(e) {
    if (e.code === 'Escape') {
        if (gameState.isAutoplay) {
            quitGame();
            return;
        }
        if (e.type === 'keydown') togglePause();
        return;
    }
    if (!gameState.isPlaying || gameState.isPaused) return;
    const key = e.key.toLowerCase();
    const colIndex = userConfig.keys.indexOf(key);
    if (colIndex === -1) return;

    if (e.type === 'keydown') {
        gameState.heldKeys[colIndex] = true;

        // Optimization: Find active roll to start holding
        // Since we track firstActiveNoteIndex, we can start there.
        // We need to find if there is an ACTIVE roll in this column.
        for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
            const n = gameState.activeNotes[i];
            // Optimization: If note is too far in future, stop? 
            // Active holds are usually "current" time or past (if held long).
            // But a new press on a roll that is active? 
            // Rolls become active when hit. If it's active, it's endTime > currentTime.
            // So it should be within visible range mostly.
            if (n.time > (audioCtx.currentTime - gameState.startTime) + 2.0) break; // Optimization break

            if (n.col === colIndex && n.type === 'roll' && n.holdState === 'active') {
                n.lastPressTime = audioCtx.currentTime - gameState.startTime;
                break; // Only one active hold per column possible
            }
        }
    }

    if (e.type === 'keyup') gameState.heldKeys[colIndex] = false;

    if (e.type !== 'keydown') return;

    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;

    let currentTime = 0;
    if (gameState.mode === 'stretch' && gameState.audioEl) {
        currentTime = gameState.audioEl.currentTime;
    } else {
        currentTime = (audioCtx.currentTime - gameState.startTime) * rate;
    }

    // Find Hittable Note - Optimized Search
    let hittableNote = null;
    for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
        const n = gameState.activeNotes[i];
        if (n.processed) continue;

        // Fix: Ignore already active holds. They are handled by the hold logic loop, not new hits.
        if (n.holdState === 'active') continue;

        // Time diff
        const diff = n.time - currentTime;

        // Too old to hit? (Already missed/processed logic should handle this, but double check)
        if (diff < -(J_BAD / 1000)) continue;

        // Too far in future?
        if (diff > (J_BAD / 1000)) break;

        if (n.col === colIndex && n.type !== 'mine') {
            // Found best candidate (first one in window)
            hittableNote = n;
            break;
        }
    }

    if (hittableNote) {
        hittableNote.hit = true;
        const diffMs = (hittableNote.time - currentTime) * 1000;
        triggerJudgement(hittableNote, diffMs, false);
    }
} window.addEventListener('keydown', handleInput); window.addEventListener('keyup', handleInput); window.addEventListener('resize', () => { if (gameState.isPlaying) setupCanvas(); });

// ** INITIALIZE GAME STATE **
function initGame(chartInfo, audioBuf, meta, diffStats, audioUrl) {
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
        isAutoplay: !!window.isAutoplayLaunch // Set Autoplay State
    };
    window.isAutoplayLaunch = false; // Reset flag

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
    updateScrollSpeed();

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
    document.getElementById('failed-overlay').style.display = 'none';
    updateJudgmentTracker();
    updateScoreDisplay();

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
    statusDiv.style.display = 'block';

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
            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length})`);

            let combinedMeta = null;
            let combinedCharts = [];

            // Should usually be 1 SM and 1 SSC, or just 1 of either.
            // Parse all and merge.
            for (const defFile of groupDefs) {
                const text = await defFile.text();
                let parsed = null;
                const isSSC = defFile.name.toLowerCase().endsWith('.ssc');

                if (isSSC) {
                    console.log(`[Upload] Parsing SSC: ${defFile.name}`);
                    parsed = parseSSC(text);
                } else {
                    parsed = parseSM(text);
                }

                if (parsed) {
                    // If we don't have meta yet, take it. 
                    // If we do, and this is SSC, overwrite (SSC usually preferred).
                    if (!combinedMeta || isSSC) {
                        combinedMeta = parsed.meta;
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
                s.meta.artist.toLowerCase() === combinedMeta.artist.toLowerCase()
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
            setText('loading-text', `Importing Songs (${i + 1}/${groupKeys.length})`);

            let combinedMeta = null;
            let combinedCharts = [];

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
                s.meta.artist.toLowerCase() === combinedMeta.artist.toLowerCase()
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

function updateScrollSpeed() {
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
    if (typeof modConfig !== 'undefined' && modConfig.rate) rate = modConfig.rate;

    if (type === 'C') {
        // C-Mod: Constant Speed (Pixels / Second)
        // Since rate mod speeds up time (beats/sec), we must slow down scroll (pixels/beat)
        // to maintain constant pixels/sec.
        targetSpeed = (val * scaleFactor) / rate;
    } else if (type === 'X') {
        // X-Mod: Multiplier of Current BPM
        // Should scale WITH rate (faster song = faster scroll), so NO division.
        const currentBPM = getCurrentBPM();
        targetSpeed = currentBPM * val * 2.5 * scaleFactor;
    } else if (type === 'M') {
        // M-Mod: Max Speed cap
        const mVal = val;
        const currentBPM = getCurrentBPM();
        // M-mod caps the peak speed. Similar to C-mod, we want the PEAK visible speed to be M.
        // So we also divide by rate.
        targetSpeed = ((currentBPM / (gameState.maxBPM || 150)) * mVal * scaleFactor) / rate;
    }

    gameState.scrollSpeed = targetSpeed;
}

/* =========================================
   SONG SELECT TABS & PREVIEW
   ========================================= */
let currentSongTab = 'info';
let previewCtx = null;
let previewLoopId = null;
let previewAudio = null;
let previewStartTime = 0;
let previewChartData = null;
let previewPaused = false;
let previewAssets = {};

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

    if (lb.length === 0) {
        list.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">No scores yet</div>';
        return;
    }

    lb.sort((a, b) => parseFloat(b.acc) - parseFloat(a.acc) || b.score - a.score);

    lb.forEach((entry, i) => {
        const div = document.createElement('div');
        div.className = 'lb-entry';

        // Color Code
        const gradeColor = GRADE_COLORS[entry.grade] || '#fff'; // Assuming GRADE_COLORS is defined elsewhere
        div.style.borderLeftColor = gradeColor;

        // Judge Mini-Grid
        let jHtml = "";
        if (entry.judgments) {
            const J = entry.judgments;
            // Marv, Perf, Great, Good, Bad, Miss
            const jList = [J.marvelous, J.perfect, J.great, J.good, J.bad, J.miss];
            const jColors = ["#a3f7ff", "#ffe600", "#44ff4b", "#0099ff", "#aa00ff", "#ff3333"];
            jList.forEach((val, idx) => {
                if (val > 0) jHtml += `<span style="color:${jColors[idx]}">${val}</span>`;
            });
        }

        div.innerHTML = `
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-score">${parseInt(entry.score).toLocaleString()}</span>
            <span class="lb-grade" style="color:${gradeColor}">${entry.grade}</span>
            <span class="lb-acc">${parseFloat(entry.acc).toFixed(2)}%</span>
            <div class="lb-judges">${jHtml}</div>
        `;
        list.appendChild(div);
    });
}

async function startChartPreview() {
    stopChartPreview(); // Reset
    if (selectedSongIndex === -1 || selectedChartIndex === -1) return;

    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];
    if (!song || !chart) return;

    // Load Assets Lazy
    if (!previewAssets.arrow) {
        // Fallback or specific file
        previewAssets.arrow = new Image();
        previewAssets.arrow.src = "_Down Tap Note 1x8.png";
        previewAssets.holdHead = previewAssets.arrow; // Reuse
        previewAssets.holdBody = new Image();
        previewAssets.holdBody.src = "Down Hold Body Active.png";
        // We'll use these simple ones
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
        slider.max = len + 2; // +buffer
        slider.value = 0;
    }

    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    previewCtx = canvas.getContext('2d');

    // Resize wrapper? CSS handles it.

    // Audio Logic
    if (song.audioBlob) {
        // Reuse preview start time from chart meta if available, or 0
        const previewStart = song.meta.sampleStart || 0;

        // We need a fresh audio element or source node.
        // Let's use HTML5 Audio for simplicity in preview (less syncing requirement than gameplay)
        if (previewAudio) { // Changed from currentPreviewAudio to previewAudio
            previewAudio.pause();
            previewAudio = null;
        }

        const url = URL.createObjectURL(song.audioBlob);
        previewAudio = new Audio(url);
        previewAudio.currentTime = previewStart;
        previewAudio.volume = 0.5;
        // previewAudio.loop = true; // Auto loop if not paused

        // Update slider connects to audio time, so we need to loop manually if we want custom seek logic? 
        // Standard loop works.
        try {
            await previewAudio.play();
            updatePlayBtn(true);
        } catch (e) { console.warn("Preview autoplay blocked", e); }
    } else {
        previewAudio = { currentTime: 0, pause: () => { }, play: () => { } }; // Mock
    }

    // Chart Data
    previewChartData = chart.notes;
    previewPaused = false;
    previewLoop();
}

function stopChartPreview() {
    if (previewLoopId) cancelAnimationFrame(previewLoopId);
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }
    updatePlayBtn(false);
}

function togglePreviewPlayback() {
    if (!previewAudio) return;
    if (previewAudio.paused) {
        previewAudio.play();
        previewPaused = false;
        updatePlayBtn(true);
    } else {
        previewAudio.pause();
        previewPaused = true;
        updatePlayBtn(false);
    }
}

function updatePlayBtn(playing) {
    const btn = document.getElementById('prev-play-toggle');
    if (btn) btn.innerText = playing ? "⏸" : "▶";
}

function seekPreview(val) {
    if (previewAudio) {
        previewAudio.currentTime = parseFloat(val);
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
    // Scroll speed fixed for preview? Or user config? 
    // Let's use fixed reasonable speed for preview.
    const speed = 400; // px/sec
    const receptorY = 50;
    // Note: scrolling UP means earlier notes are at bottom? No, standard upscroll: notes come from bottom, receptor at top.

    const laneWidth = 40;
    const totalWidth = laneWidth * 4;
    const startX = (width - totalWidth) / 2;

    // Render Receptors
    previewCtx.fillStyle = '#333';
    for (let i = 0; i < 4; i++) {
        previewCtx.fillRect(startX + i * laneWidth, receptorY, laneWidth - 2, laneWidth - 2);
    }

    // Rotations for standard arrows (Down source)
    // 0: Left (90), 1: Down (0), 2: Up (180), 3: Right (270)
    const rotations = [90 * Math.PI / 180, 0, 180 * Math.PI / 180, 270 * Math.PI / 180];

    const colors = ['#f55', '#55f', '#5f5', '#ff5']; // L D U R ? standard colors
    // const colColors = ['#f88', '#88f', '#8f8', '#ff8']; // Simple scheme

    // previewCtx.fillStyle = '#fff';

    for (const note of previewChartData) {
        const diff = note.time - time;
        if (diff < -0.5 || diff > 2.0) continue; // optimization

        const y = receptorY + (diff * speed);

        if (y > height + 50) continue; // +50 buffer
        if (y < -50) continue; // Already passed

        const x = startX + note.col * laneWidth;
        const noteCheck = (!previewAssets.arrow || !previewAssets.arrow.complete) ? false : true;

        // Draw Logic
        if (note.type === 'tap' || note.type === 'mine') {
            if (noteCheck && note.type === 'tap') {
                // Draw Image
                const size = laneWidth;
                previewCtx.save();
                previewCtx.translate(x + size / 2, y + size / 2);
                previewCtx.rotate(rotations[note.col]);
                // Frame 0 of 8 (1/8th height)
                const sw = previewAssets.arrow.width;
                const sh = previewAssets.arrow.height / 8;
                previewCtx.drawImage(previewAssets.arrow, 0, 0, sw, sh, -size / 2, -size / 2, size, size);
                previewCtx.restore();
            } else {
                // Fallback
                previewCtx.fillStyle = colors[note.col];
                previewCtx.fillRect(x, y, laneWidth - 2, laneWidth - 2);
            }
            if (note.type === 'mine') {
                previewCtx.fillStyle = '#f00';
                previewCtx.beginPath();
                previewCtx.arc(x + laneWidth / 2, y + laneWidth / 2, laneWidth / 3, 0, Math.PI * 2);
                previewCtx.fill();
            }
        }
        else if (note.type === 'hold' || note.type === 'roll') {
            // Body
            const tailDiff = (note.time + note.len) - time;
            const yHead = y;
            let yTail = receptorY + (tailDiff * speed);

            // Draw Body
            if (previewAssets.holdBody && previewAssets.holdBody.complete) {
                // Simple stretch
                const bodyW = laneWidth - 10;
                const bodyH = Math.max(0, yTail - yHead);
                if (bodyH > 0) {
                    previewCtx.drawImage(previewAssets.holdBody, x + 5, yHead + laneWidth / 2, bodyW, bodyH);
                }
            } else {
                previewCtx.fillStyle = (note.type === 'roll') ? '#afa' : '#aaa';
                previewCtx.fillRect(x + 5, yHead + laneWidth / 2, laneWidth - 12, Math.max(0, yTail - yHead));
            }

            // Head
            if (noteCheck) {
                const size = laneWidth;
                previewCtx.save();
                previewCtx.translate(x + size / 2, y + size / 2);
                previewCtx.rotate(rotations[note.col]);
                const sw = previewAssets.arrow.width;
                const sh = previewAssets.arrow.height / 8;
                previewCtx.drawImage(previewAssets.arrow, 0, 0, sw, sh, -size / 2, -size / 2, size, size);
                previewCtx.restore();
            } else {
                previewCtx.fillStyle = colors[note.col];
                previewCtx.fillRect(x, y, laneWidth - 2, laneWidth - 2);
            }
        }
    }

    if (!previewPaused) {
        previewLoopId = requestAnimationFrame(previewLoop);
    }
}    // console.log("Updated Speed:", type, val, "=>", targetSpeed, "BPM:", getCurrentBPM());
