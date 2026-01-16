/* =========================================
   CONSTANTS & CONFIG
   ========================================= */
let userConfig = {
    keys: ['d', 'f', 'j', 'k'],
    downScroll: false,
    scrollTime: 650,
    failMode: 'on'
};

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
   UI HELPERS
   ========================================= */
function setScreen(screenName) {
    const screens = ['setup-panel', 'game-hud', 'pause-menu', 'results-screen', 'settings-modal', 'settings-screen', 'loading-status'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (screenName === 'setup-panel') {
        document.getElementById('setup-panel').style.display = 'block';
        return;
    }

    if (screenName) {
        const target = document.getElementById(screenName);
        if (target) target.style.display = 'flex';
    }
}

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
window.onload = async () => {
    document.getElementById('gameCanvas').style.display = 'none';
    loadLibrary();
    sortLibrary();
    renderSongList();
    await loadLocalSong();
};

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
            missingIndicator = '<span title="Files missing. Re-import song." style="color: #ffcc00; margin-right: 6px;">⚠️</span>';
        }

        const subtitle = song.meta.subtitle ? `<span style="font-size:0.8em; color:#aaa; display:block; margin-bottom:2px;">${song.meta.subtitle}</span>` : '';
        item.innerHTML = `<div class="song-item-info"><span class="song-item-title">${missingIndicator}${song.meta.title}</span>${subtitle}<span class="song-item-artist">${song.meta.artist}</span></div><div class="diff-squares">${squares}</div>`;
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

        const lb = JSON.parse(localStorage.getItem(key)) || [];
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
            setText('bs-clear', top.fcType || "");

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

    const rows = [];
    let currentRow = { time: notes[0].time, notes: [] };
    for (let note of notes) {
        if (Math.abs(note.time - currentRow.time) < 0.001) { currentRow.notes.push(note); }
        else { rows.push(currentRow); currentRow = { time: note.time, notes: [note] }; }
    }
    rows.push(currentRow);
    if (rows.length < 2) return { nps: 0, peak: 0, overall: 0, stream: 0, jumpstream: 0, handstream: 0, chordjack: 0, technical: 0, stamina: 0 };

    let maxNPS = 0;
    const streamStrains = [], jsStrains = [], hsStrains = [], cjStrains = [], techStrains = [];
    const windowSize = 0.5; let windowStart = rows[0].time; let windowIndex = 0;

    while (windowIndex < rows.length) {
        let noteCount = 0, chordCount = 0, handCount = 0, jackCount = 0;
        let i = windowIndex;
        while (i < rows.length && rows[i].time < windowStart + windowSize) {
            const rowNotes = rows[i].notes;
            noteCount += rowNotes.length;
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

        // Rate Mod: Scale NPS/Density logic if we wanted "perceived" difficulty, but usually difficulty is chart-intrinsic.
        // We'll leave difficulty calc as "native chart speed".


        let sStr = nps; if (chordCount > 0) sStr *= 0.8; streamStrains.push(sStr);
        let sJs = nps; const jumpRatio = noteCount > 0 ? (chordCount / (noteCount / 2)) : 0;
        if (jumpRatio < 0.2) sJs *= 0.2; else sJs *= (0.8 + jumpRatio * 0.4); jsStrains.push(sJs);
        let sHs = 0; if (handCount > 0) { sHs = nps * 0.9 + (handCount * 1.5); } hsStrains.push(sHs);
        let sCj = 0; if (chordCount > 0 && jackCount > 0) { sCj = nps * 0.8 + (jackCount * 1.5) + (chordCount * 1.0); } cjStrains.push(sCj);
        let sTech = nps * 0.4 + (jackCount * 2.5); techStrains.push(sTech);

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
    const duration = rows[rows.length - 1].time - rows[0].time;

    const denseThreshold = maxNPS * 0.5;
    const denseStrains = streamStrains.filter(s => s > denseThreshold);
    const avgDense = denseStrains.length > 0 ? denseStrains.reduce((a, b) => a + b, 0) / denseStrains.length : 0;
    let sStamina = avgDense * (1 + Math.log10(Math.max(1, duration / 60)));

    const scale = (val) => { return 45 * (1 - Math.exp(-val / 25)); };
    let result = {
        nps: notes.length / duration, peak: maxNPS, stream: scale(sStream), jumpstream: scale(sJS),
        handstream: scale(sHS), chordjack: scale(sCJ), technical: scale(sTech), stamina: scale(sStamina)
    };
    const skills = [result.stream, result.jumpstream, result.handstream, result.chordjack, result.technical, result.stamina];
    skills.sort((a, b) => b - a);
    let overall = (skills[0] * 1.5 + skills[1] * 0.5 + skills[2] * 0.2) / (1.5 + 0.5 + 0.2);
    result.overall = overall;
    return result;
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

            document.getElementById('loading-status').style.display = 'none';

            // Calc for stats
            const difficultyCalc = calculateDetailedDifficulty(chart.notes);
            initGame(chart, decoded, song.meta, difficultyCalc);
        } catch (e) {
            console.error("Error decoding audio: " + e.message);
            document.getElementById('loading-status').style.display = 'none';
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
        if (gameState.combo > 0) { comboEl.style.display = 'block'; comboEl.innerText = gameState.combo; }
        else { comboEl.style.display = 'none'; }
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
    audioCtx.suspend();
    document.getElementById('failed-overlay').style.display = 'block';
    setTimeout(() => {
        document.getElementById('failed-overlay').style.display = 'none';
        showResults();
    }, 2000);
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
        let dpPoints = 2 * (accPercent / 100);
        gameState.accumulatedAccuracyPoints += dpPoints; gameState.totalNotesHitOrMissed++;
        const baseNoteScore = 1000000 / Math.max(1, gameState.totalNotesInChart);

        if (isMiss) {
            judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++; lifeChange = -8.0;
        } else {
            if (absOffset <= J_MARVELOUS) { judgeText = "MARVELOUS"; judgeClass = "judge-marvelous"; scoreAdd = baseNoteScore; gameState.judgments.marvelous++; lifeChange = 0.8; }
            else if (absOffset <= J_PERFECT) { judgeText = "PERFECT"; judgeClass = "judge-perfect"; scoreAdd = baseNoteScore - 10; gameState.judgments.perfect++; lifeChange = 0.8; }
            else if (absOffset <= J_GREAT) { judgeText = "GREAT"; judgeClass = "judge-great"; scoreAdd = (baseNoteScore - 10) * 0.6; gameState.judgments.great++; lifeChange = 0.4; }
            else if (absOffset <= J_GOOD) { judgeText = "GOOD"; judgeClass = "judge-good"; breaksCombo = true; scoreAdd = (baseNoteScore - 10) * 0.2; gameState.judgments.good++; lifeChange = 0.0; }
            else if (absOffset <= J_BAD) { judgeText = "BAD"; judgeClass = "judge-bad"; breaksCombo = true; gameState.judgments.bad++; lifeChange = -4.0; }
            else { judgeText = "MISS"; judgeClass = "judge-miss"; breaksCombo = true; gameState.judgments.miss++; lifeChange = -8.0; }
        }
        scoreAdd = Math.max(0, scoreAdd); gameState.score += scoreAdd;
        if (!isMiss && (note.type === 'hold' || note.type === 'roll')) {
            note.holdState = 'active'; note.processed = false; note.lastPressTime = audioCtx.currentTime - gameState.startTime;
        } else { note.processed = true; }

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
        if (offsetMs > 0) timingClass = "late"; // Positive offset = hit late? 
        // offset = noteTime - hitTime. 
        // If note is at 1000, hit at 900 (early), offset = 100. (Positive)
        // If note is at 1000, hit at 1100 (late), offset = -100. (Negative)
        // CHECK hit logic: usually offset = note.time - inputTime.
        // Let's verify standard: Input at 900 for 1000 note -> Early.
        // If I define offset = note.time - inputTime (100).
        // If I define offset = inputTime - note.time (-100).
        // Let's assume standard SM: Early is usually negative in some engines, positive in others.
        // In my code: offset = note.time - currentTime. 
        // If note.time (10.0) > currentTime (9.9), offset is +0.1. (Early)
        // So offset > 0 is Early. offset < 0 is Late.

        if (offsetMs < 0) timingClass = "late";
        else timingClass = "early";

        if (isMiss) timingClass = "late"; // Miss is just MissFrame

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
        gameState.judgments.ok++;
        gameState.combo++;
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
    const canvas = document.getElementById('accuracyChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height;
    const hist = gameState.accuracyHistory; ctx.clearRect(0, 0, w, h);
    if (hist.length < 2) return;
    let maxAcc = 0; hist.forEach(h => { if (h.acc > maxAcc) maxAcc = h.acc; }); const topScale = Math.min(100, maxAcc + 2);
    const getGradeColor = (grade) => { return GRADE_COLORS[grade] || "#888"; }; const endTime = hist[hist.length - 1].time;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 1; i < hist.length; i++) { const p1 = hist[i - 1]; const p2 = hist[i]; const x1 = (p1.time / endTime) * w; const y1 = h - (p1.acc / topScale * h); const x2 = (p2.time / endTime) * w; const y2 = h - (p2.acc / topScale * h); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = getGradeColor(p2.grade); ctx.stroke(); }

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const time = (x / rect.width) * endTime;
        const p = findClosest(hist, 'time', time);
        if (p) showTooltip(e, `Time: ${p.time.toFixed(1)}s<br>Acc: <span>${p.acc.toFixed(2)}%</span><br>Grade: <span style="color:${GRADE_COLORS[p.grade]}">${p.grade}</span>`);
    };
    canvas.onmouseout = hideTooltip;
}

function getFCType(j) {
    if (j.miss > 0 || j.bad > 0 || j.ng > 0) return "Clear"; // Not an FC (or just Clear if passed)
    if (j.good > 0) return "FC";
    if (j.great > 0) return "GFC";
    if (j.perfect > 0) return "PFC";
    return "MFC";
}

function handleLeaderboard() {
    const key = `webSM_lb_${gameState.meta.title}_${gameState.chartInfo.difficulty}`;
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { }

    const acc = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2) : 0;

    // Calculate extra stats
    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;
    const ssr = calculateSSR(diff, acc);
    const fcType = gameState.failed ? "Failed" : getFCType(gameState.judgments);

    const entry = {
        score: Math.round(gameState.score),
        grade: gameState.failed ? "F" : getGrade(acc * 100),
        acc: (acc * 100).toFixed(2),
        date: new Date().toLocaleDateString(),
        judgments: gameState.judgments,
        ssr: ssr,
        fcType: fcType
    };

    lb.push(entry);
    lb.sort((a, b) => b.score - a.score);
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
    const ssr = calculateSSR(diff, acc);

    setText('res-clear-type', getClearType());
    setText('res-clear-type', getClearType());
    const grade = gameState.failed ? "F" : getGrade(accPct);
    const gradeEl = document.getElementById('res-grade');
    if (gradeEl) {
        gradeEl.innerText = grade;
        gradeEl.style.color = getGradeColor(grade);
        gradeEl.style.textShadow = `0 0 30px ${getGradeColor(grade)}`;
    }
    setText('res-acc', accPct >= 99.70 ? accPct.toFixed(4) + "%" : accPct.toFixed(2) + "%");
    setText('res-score', Math.round(gameState.score).toLocaleString());
    setText('res-dp', gameState.accumulatedAccuracyPoints.toFixed(2));
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
    if (audioSource) {
        try { audioSource.stop(); } catch (e) { console.warn(e); }
    }
    gameState.isPlaying = false;
    gameState.isPaused = false;
    gameState.failed = false;

    setScreen('setup-panel');
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
    gameConfig.scrollSpeed = visibleDistance / (userConfig.scrollTime / 1000);
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
function drawNote(note, y, rotation) {
    ctx.save(); const halfSize = gameConfig.columnWidth / 2; const x = note.col * gameConfig.columnWidth; if ((note.type === 'hold' || note.type === 'roll') && note.endTime) { let tailY; const duration = note.endTime - note.time; let dist = duration * gameConfig.scrollSpeed; if (userConfig.downScroll) tailY = y - dist; else tailY = y + dist; let drawHeadY = y; let drawTailY = tailY; if (note.holdState === 'active') { drawHeadY = gameConfig.receptorY; } const bodyImg = note.type === 'hold' ? assets.holdBody : assets.rollBody; const bodyLoaded = note.type === 'hold' ? assets.loaded.holdBody : assets.loaded.rollBody; if (bodyLoaded) { ctx.save(); ctx.beginPath(); const w = gameConfig.arrowSize; const bx = x + (gameConfig.columnWidth - w) / 2; let ry = userConfig.downScroll ? drawTailY : drawHeadY; let rh = Math.abs(drawHeadY - drawTailY); ctx.rect(bx, ry, w, rh); ctx.clip(); const scale = w / bodyImg.width; const sHeight = bodyImg.height * scale; const count = Math.ceil(rh / sHeight) + 1; const scrollOffset = (Date.now() / 10) % sHeight; for (let k = -1; k < count; k++) { ctx.drawImage(bodyImg, bx, ry + (k * sHeight) - scrollOffset, w, sHeight); } ctx.restore(); } } ctx.translate(x + halfSize, y + halfSize); ctx.rotate(rotation * Math.PI / 180); const drawSize = gameConfig.arrowSize; const offset = -drawSize / 2;
    if (note.type === 'mine' && assets.loaded.mineSprite) {
        const frames = 8;
        const frame = Math.floor(gameState.globalFrame / 10) % frames;
        // Fix: Horizontal Sprite Sheet (8x1)
        const fw = assets.mineSprite.width / 8;
        const fh = assets.mineSprite.height;
        ctx.drawImage(assets.mineSprite, frame * fw, 0, fw, fh, offset, offset, drawSize, drawSize);
    } else { let img = assets.arrowSprite; let rowIndex = getNoteRowIndex(note.beat); if (note.holdState === 'active' && assets.loaded.holdHeadActive) { img = assets.holdHeadActive; } if (assets.loaded.arrowSprite) { const sy = rowIndex * (img.height / 8); ctx.drawImage(img, 0, sy, img.width, img.height / 8, offset, offset, drawSize, drawSize); } else { ctx.fillStyle = '#fff'; ctx.fillRect(offset, offset, drawSize, drawSize); } } ctx.restore();
}
function drawErrorBar() { const eb = document.getElementById('errorBarCanvas'); if (!eb) return; const eCtx = eb.getContext('2d'); eCtx.clearRect(0, 0, eb.width, eb.height); const scale = 150 / 180; const now = Date.now(); gameState.recentHits = gameState.recentHits.filter(h => now - h.time < 2000); gameState.recentHits.forEach(h => { const x = 150 - (h.offset * scale); const age = now - h.time; const alpha = 1 - (age / 2000); let color = "255, 255, 255"; const abs = Math.abs(h.offset); if (abs <= J_MARVELOUS) color = "163, 247, 255"; else if (abs <= J_PERFECT) color = "255, 230, 0"; else if (abs <= J_GREAT) color = "68, 255, 75"; else if (abs <= J_GOOD) color = "0, 153, 255"; else if (abs <= J_BAD) color = "170, 0, 255"; else color = "255, 51, 51"; eCtx.fillStyle = `rgba(${color}, ${alpha})`; eCtx.fillRect(x - 1, 0, 3, 20); }); const offsets = gameState.hitOffsets; if (offsets.length > 0) { const sum = offsets.reduce((a, b) => a + b, 0); const mean = sum / offsets.length; setText('hit-mean', `${mean.toFixed(2)}ms`); } }
function drawNPSGraph() { const c = document.getElementById('npsGraph'); if (!c) return; const ctx = c.getContext('2d'); const w = c.width; const h = c.height; ctx.clearRect(0, 0, w, h); const now = audioCtx.currentTime - gameState.startTime; if (gameState.globalFrame % 10 === 0) { let count = 0; for (let n of gameState.notes) { if (n.time > now - 1 && n.time <= now) count++; if (n.time > now) break; } gameState.currentNPS = count; if (count > gameState.peakNPS) gameState.peakNPS = count; gameState.npsHistory.push({ time: now, val: count }); if (gameState.npsHistory.length > 50) gameState.npsHistory.shift(); } setText('hud-nps', gameState.currentNPS); setText('hud-peak-nps', gameState.peakNPS); ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2; ctx.beginPath(); const maxVal = Math.max(10, gameState.peakNPS); gameState.npsHistory.forEach((p, i) => { const x = (i / 50) * w; const y = h - (p.val / maxVal * h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); }
function gameLoop() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    const currentTime = audioCtx.currentTime - gameState.startTime;
    gameState.globalFrame++;
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
    visibleNotes.forEach(note => {
        if ((note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
            if (currentTime >= note.endTime) {
                note.holdState = 'ok';
                triggerHoldJudgement(note, true);
                return;
            }
            const keyHeld = gameState.heldKeys[note.col];
            if (note.type === 'hold') {
                if (!keyHeld) {
                    if (!note.letGoTime) note.letGoTime = currentTime;
                    if ((currentTime - note.letGoTime) * 1000 > 250) {
                        note.holdState = 'ng';
                        triggerHoldJudgement(note, false);
                    }
                } else { note.letGoTime = null; }
            }
            if (note.type === 'roll') {
                const timeSincePress = (currentTime - note.lastPressTime) * 1000;
                if (timeSincePress > 500) {
                    note.holdState = 'ng';
                    triggerHoldJudgement(note, false);
                }
            }
        }
        if (note.processed && note.holdState !== 'active') return;

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
        if (y > -1000 && y < canvas.height + 1000) {
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
    setText('scroll-toggle', userConfig.downScroll ? "Downscroll" : "Upscroll (Default)");
    document.getElementById('scroll-speed-input').value = userConfig.scrollTime;
    document.getElementById('fail-mode-select').value = userConfig.failMode;

    // Update buttons
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`key-btn-${i}`);
        if (btn) btn.innerText = userConfig.keys[i].toUpperCase();
    }
}
window.openSettings = openSettings;

function toggleScrollDir() {
    userConfig.downScroll = !userConfig.downScroll;
    setText('scroll-toggle', userConfig.downScroll ? "Downscroll" : "Upscroll (Default)");
}
window.toggleScrollDir = toggleScrollDir;

function saveSettings() {
    // Keys are already updated in userConfig by the binder, just need to save speed/fail mode
    const speed = parseInt(document.getElementById('scroll-speed-input').value);
    const fail = document.getElementById('fail-mode-select').value;

    userConfig.scrollTime = (speed && speed > 0) ? speed : 650;
    userConfig.failMode = fail;

    localStorage.setItem('webSM_config', JSON.stringify(userConfig));
    setScreen('setup-panel');
}
window.saveSettings = saveSettings;


function togglePause() {
    if (!gameState.isPlaying || gameState.failed) return;

    if (gameState.isPaused) {
        resumeGame();
    } else {
        gameState.isPaused = true;
        audioCtx.suspend();
        gameState.pauseCount++; // Increment pause count

        // Update Pause Menu UI
        setText('pause-song-title', gameState.meta.title);
        setText('pause-song-artist', gameState.meta.artist);

        const acc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2)) : 0;
        setText('pause-score', Math.round(gameState.score).toLocaleString());
        setText('pause-acc', (acc * 100).toFixed(2) + "%");
        setText('pause-combo', gameState.combo);
        setText('pause-count-val', gameState.pauseCount);

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

        // Show Overlay
        document.getElementById('pause-menu').style.display = 'flex';

        // SYNC: Record when we paused
        gameState.pauseStartTime = audioCtx.currentTime;
    }
}
window.togglePause = togglePause;

function resumeGame() {
    if (!gameState.isPaused) return;
    gameState.isPaused = false;
    audioCtx.resume();
    document.getElementById('pause-menu').style.display = 'none';

    // SYNC: Compensation
    // If audio was running, currentTime would increase.
    // If audio was suspended, currentTime might be frozen OR running depending on browser/implementation.
    // The safest way is to shift startTime by the duration of the pause.
    if (gameState.pauseStartTime) {
        const drift = audioCtx.currentTime - gameState.pauseStartTime;
        gameState.startTime += drift;
    }

    requestAnimationFrame(gameLoop);
}
window.resumeGame = resumeGame; function handleInput(e) {
    if (e.code === 'Escape') { if (e.type === 'keydown') togglePause(); return; }
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

    const currentTime = audioCtx.currentTime - gameState.startTime;

    // Find Hittable Note - Optimized Search
    let hittableNote = null;
    for (let i = gameState.firstActiveNoteIndex; i < gameState.activeNotes.length; i++) {
        const n = gameState.activeNotes[i];
        if (n.processed) continue;

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
function initGame(chartInfo, audioBuf, meta, diffStats) {
    gameState = {
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
        peakNPS: 0
    };

    setScreen('game-hud');
    document.getElementById('gameCanvas').style.display = 'block';
    setText('judgment', "");
    document.getElementById('combo').style.display = 'none';
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

    if (audioSource) audioSource.stop(); // Stop potential previous
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;

    // Rate Mod
    const rate = (typeof modConfig !== 'undefined' && modConfig.rate) ? modConfig.rate : 1.0;
    audioSource.playbackRate.value = rate;

    audioSource.connect(audioCtx.destination);
    const startTime = audioCtx.currentTime + 1.0; // 1s buffer
    audioSource.start(startTime);

    gameState.startTime = startTime;
    gameState.isPlaying = true;

    // Sync Config
    if (typeof modConfig !== 'undefined') {
        userConfig.scrollTime = modConfig.scrollSpeed;
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
    }

    requestAnimationFrame(gameLoop);
} function parseSM(text) {
    const charts = [];
    const meta = {};
    text = text.replace(/\/\/.*$/mg, '');
    const getTag = (tag) => {
        const match = text.match(new RegExp(`#${tag}:(.*?);`, 'i'));
        return match ? match[1].trim() : null;
    };
    meta.title = getTag('TITLE') || "Unknown";
    meta.artist = getTag('ARTIST') || "Unknown";
    meta.music = getTag('MUSIC');
    meta.banner = getTag('BANNER');
    meta.background = getTag('BACKGROUND');
    meta.cdtitle = getTag('CDTITLE');
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
                    const note = { beat: exactBeat, time: time, col: col, type: type, hit: false, processed: false, holdState: 'inactive', endTime: null };
                    notes.push(note);
                    if (type === 'hold' || type === 'roll') { activeHolds[col] = note; }
                } else if (char === '3') {
                    if (activeHolds[col]) { activeHolds[col].endTime = time; activeHolds[col] = null; }
                }
            }
        });
        currentBeat += 4;
    });
    return notes.sort((a, b) => a.time - b.time);
}

const fileInput = document.getElementById('file-input');
const zipInput = document.getElementById('zip-input');
const statusDiv = document.getElementById('loading-status');

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    // Filter for SM/SSC files
    const smFiles = files.filter(f => f.name.toLowerCase().endsWith('.sm') || f.name.toLowerCase().endsWith('.ssc'));

    if (smFiles.length === 0) { alert("No .sm or .ssc files found."); return; }

    setScreen('loading-status');
    statusDiv.style.display = 'block';

    let loadedCount = 0;
    let selectedSongIndex = -1;

    try {
        for (let i = 0; i < smFiles.length; i++) {
            const smFile = smFiles[i];
            setText('loading-text', `Importing Songs (${i + 1}/${smFiles.length})`);

            const text = await smFile.text();
            const parsedData = parseSM(text);

            // Determine root path for this song (from the SM file's path)
            // webkitRelativePath example: "Pack/SongFolder/song.sm" -> root: "Pack/SongFolder"
            const fullPath = smFile.webkitRelativePath || smFile.name;
            const pathParts = fullPath.split('/');
            pathParts.pop(); // remove filename
            const rootPath = pathParts.join('/');

            const findFileInFolder = (name, type) => {
                // type: 'banner', 'background', 'audio', etc. (for fallbacks)
                const normalize = (p) => p.replace(/\\/g, '/').toLowerCase();

                // 1. If name is provided, try specific matching
                if (name) {
                    const targetPath = normalize(rootPath ? `${rootPath}/${name}` : name);
                    const targetNameVal = name.split('/').pop().toLowerCase();
                    const targetBase = targetNameVal.substring(0, targetNameVal.lastIndexOf('.')) || targetNameVal;

                    // A. Exact Path Match
                    let found = files.find(f => normalize(f.webkitRelativePath || f.name) === targetPath);
                    if (found) return found;

                    // B. Filename Match in same folder (ignore extension mismatch)
                    // Iterate files in the root folder
                    found = files.find(f => {
                        const fPath = normalize(f.webkitRelativePath || f.name);
                        const fDir = fPath.substring(0, fPath.lastIndexOf('/'));
                        if (fDir !== normalize(rootPath)) return false;

                        const fName = fPath.split('/').pop();
                        const fBase = fName.substring(0, fName.lastIndexOf('.')) || fName;

                        // Check full filename match OR basename match
                        // Priority to full filename match but we already checked exact path.
                        // So here we check if base name matches (e.g. banner.png vs banner.bmp)
                        return fBase === targetBase;
                    });
                    if (found) return found;
                }

                // 2. Fallbacks if name not found or not provided
                if (type) {
                    const candidates = [];
                    if (type === 'banner') candidates.push('banner', 'bn', 'in');
                    if (type === 'background') candidates.push('bg', 'background', 'back');
                    if (type === 'cdtitle') candidates.push('cdtitle', 'cd');

                    const extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];

                    for (let cand of candidates) {
                        const found = files.find(f => {
                            const fPath = normalize(f.webkitRelativePath || f.name);
                            const lastSlash = fPath.lastIndexOf('/');
                            const fDir = lastSlash === -1 ? "" : fPath.substring(0, lastSlash);

                            // Loose check: ensure it is inside the rootPath
                            // Actually, normalize(rootPath) should be strict equality for folder import
                            if (fDir !== normalize(rootPath)) return false;

                            const fName = fPath.split('/').pop();
                            const fBase = fName.substring(0, fName.lastIndexOf('.')) || fName;
                            return fBase === cand;
                        });
                        if (found) return found;
                    }
                }

                console.log(`[AssetDebug] Failed to find ${type || 'file'} for ${name || 'unknown'}. Root: ${rootPath}`);
                return null;
            };

            const bannerFile = findFileInFolder(parsedData.meta.banner, 'banner');
            const bgFile = findFileInFolder(parsedData.meta.background, 'background');
            const cdFile = findFileInFolder(parsedData.meta.cdtitle, 'cdtitle');
            let audioFile = findFileInFolder(parsedData.meta.music);

            // Heuristic for audio if not found explicitly
            if (!audioFile) {
                // Look for likely audio files in the same folder
                const extensions = ['.ogg', '.mp3', '.wav'];
                audioFile = files.find(f => {
                    const fPath = f.webkitRelativePath || f.name;
                    const fDir = fPath.substring(0, fPath.lastIndexOf('/'));
                    const fName = fPath.split('/').pop().toLowerCase();
                    return normalizePath(fDir) === normalizePath(rootPath) && extensions.some(ext => fName.endsWith(ext));
                });
            }

            // Helper for normalization inside the loop
            function normalizePath(p) { return p ? p.replace(/\\/g, '/').toLowerCase() : ""; }

            if (!audioFile) {
                console.warn(`Audio not found for ${parsedData.meta.title}, skipping.`);
                continue;
            }

            const songObj = {
                meta: parsedData.meta,
                charts: parsedData.charts,
                audioBlob: audioFile,
                bannerBlob: bannerFile,
                bgBlob: bgFile,
                cdTitleBlob: cdFile
            };

            // === Duplicate Check ===
            const duplicateIndex = songLibrary.findIndex(s =>
                s.meta.title.toLowerCase() === parsedData.meta.title.toLowerCase() &&
                s.meta.artist.toLowerCase() === parsedData.meta.artist.toLowerCase()
            );

            if (duplicateIndex !== -1) {
                // Auto-replace for folder imports to avoid confirm spam, or maybe smart merge. 
                // For now, let's just replace.
                console.log(`Replacing song: ${parsedData.meta.title}`);
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
        const smFiles = [];

        // 1. Find all SM/SSC files
        zip.forEach((relativePath, zipEntry) => {
            const low = relativePath.toLowerCase();
            if ((low.endsWith('.sm') || low.endsWith('.ssc')) && !relativePath.startsWith('__MACOSX')) {
                smFiles.push(zipEntry);
            }
        });

        if (smFiles.length === 0) throw new Error("No .sm files found in zip");

        let loadedCount = 0;
        let selectedSongIndex = -1; // To preserve selection if current song is replaced

        for (let smEntry of smFiles) {
            setText('loading-text', `Importing Songs (${loadedCount + 1}/${smFiles.length})`);

            // 2. Identify Song Folder
            const pathParts = smEntry.name.split('/');
            pathParts.pop(); // remove filename
            const folderPath = pathParts.join('/'); // this is the "root" for this song in the zip

            // 3. Parse SM Data
            const text = await smEntry.async("string");
            const parsedData = parseSM(text);

            // === Duplicate Check ===
            const duplicateIndex = songLibrary.findIndex(s =>
                s.meta.title.toLowerCase() === parsedData.meta.title.toLowerCase() &&
                s.meta.artist.toLowerCase() === parsedData.meta.artist.toLowerCase()
            );

            // 4. Collect ALL files for this song
            const noteObj = {
                meta: parsedData.meta,
                charts: parsedData.charts,
                files: {}, // New container for all files
            };

            // Grab every file in the song's folder
            const songFilePromises = [];
            zip.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir || relativePath.startsWith('__MACOSX')) return;

                // Check if this file belongs to the song's folder
                let belongs = false;
                if (folderPath === "") {
                    belongs = true;
                } else if (relativePath.startsWith(folderPath + "/")) {
                    belongs = true;
                }

                if (belongs) {
                    songFilePromises.push((async () => {
                        const blob = await zipEntry.async("blob");
                        // Store with relative path from song folder
                        let localName = relativePath;
                        if (folderPath !== "") {
                            localName = relativePath.substring(folderPath.length + 1);
                        }
                        // Store with original casing for key to handle case-sensitive systems if needed,
                        // but logic generally uses case-insensitive lookup.
                        noteObj.files[localName] = blob;
                    })());
                }
            });

            await Promise.all(songFilePromises);

            // Extract standard assets for game engine
            // noteObj.files keys preserve original case if zip preserved it, but we usually want case-insensitive internal matching?
            // Actually, handleZipImport stored files with relative path. 
            // We need to find the files inside noteObj.files

            // Helper to get blob from noteObj.files robustly
            const getFileBlob = (targetName, type) => {
                const normalize = (s) => s ? s.toLowerCase() : "";

                // 1. Specific Target Logic
                if (targetName) {
                    const lowerTarget = normalize(targetName);
                    const targetBase = lowerTarget.substring(0, lowerTarget.lastIndexOf('.')) || lowerTarget;

                    // Direct lookup (Exact)
                    if (noteObj.files[lowerTarget]) return noteObj.files[lowerTarget];

                    // Basename lookup (e.g. banner.png vs banner.bmp)
                    for (let fName in noteObj.files) {
                        const fLower = normalize(fName);
                        // Check if file is in "root" (relative to cached files which are relative to song folder)
                        // noteObj.files keys are like "banner.png" or "subfolder/img.png"
                        // We assume assets are usually at the song root or specified path.

                        // If targetName has path, matching is complex. SM usually has local paths "folder/img.png".
                        // Robustness: match basename strictly?
                        if (fLower.startsWith(targetBase + ".")) return noteObj.files[fName];
                    }
                }

                // 2. Fallbacks
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

            noteObj.bannerBlob = getFileBlob(parsedData.meta.banner, 'banner');
            noteObj.bgBlob = getFileBlob(parsedData.meta.background, 'background');
            noteObj.cdTitleBlob = getFileBlob(parsedData.meta.cdtitle, 'cdtitle');

            // Audio might be implicit or explicit
            let audioBlob = getFileBlob(parsedData.meta.music);
            if (!audioBlob) {
                // Fallback: look for any valid audio extension in files
                for (let fName in noteObj.files) {
                    if (fName.toLowerCase().endsWith('.ogg') || fName.toLowerCase().endsWith('.mp3') || fName.toLowerCase().endsWith('.wav')) {
                        audioBlob = noteObj.files[fName];
                        break;
                    }
                }
            }
            noteObj.audioBlob = audioBlob;

            if (duplicateIndex !== -1) {
                console.log(`Replacing/Repairing song in library: ${parsedData.meta.title}`);
                const curSong = songLibrary[selectedSongIndex];
                if (curSong && curSong.meta.title === parsedData.meta.title && curSong.meta.artist === parsedData.meta.artist) {
                    selectedSongIndex = duplicateIndex; // Mark for re-selection
                }
                songLibrary[duplicateIndex] = noteObj;
            } else {
                songLibrary.push(noteObj);
            }

            loadedCount++;
        }

        // Refresh list
        saveLibrary();
        renderSongList();

        // If we replaced current song, re-select
        if (selectedSongIndex !== -1 && selectedSongIndex < songLibrary.length) {
            selectSong(selectedSongIndex);
        } else {
            // Only jump to last if we added new ones and weren't selecting anything? 
            // Behavior choice: just refresh list.
        }

        setScreen('setup-panel');
        document.getElementById('loading-status').style.display = 'none';

    } catch (err) {
        console.error(err);
        alert("Zip Import Failed: " + err.message);
        setScreen('setup-panel');
    }
}