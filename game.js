/* =========================================
   CONSTANTS & CONFIG
   ========================================= */
let userConfig = {
    keys: ['d', 'f', 'j', 'k'],
    downScroll: false,
    scrollTime: 650 
};

function loadUserConfig() {
    const saved = localStorage.getItem('webSM_config');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            userConfig = { ...userConfig, ...parsed };
            console.log("Configuration loaded:", userConfig);
        } catch (e) {
            console.warn("Failed to load config", e);
        }
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

const QUANTIZATION_ROWS = {
    4: 0, 8: 1, 12: 2, 16: 3, 24: 4, 32: 5, 48: 6, 64: 7
};

/* =========================================
   UI HELPERS (Moved to Top for Safety)
   ========================================= */
function setScreen(screenName) {
    const screens = ['setup-panel', 'game-hud', 'pause-menu', 'results-screen', 'settings-modal', 'loading-status'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
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

/* =========================================
   GAME STATE & LIBRARY
   ========================================= */
let canvas, ctx;
let audioCtx, audioBuffer, audioSource;

// New Library State
let songLibrary = [];
let selectedSongIndex = -1;
let selectedChartIndex = -1;

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
    judgments: { marvelous:0, perfect:0, great:0, good:0, bad:0, miss:0, ok:0, ng:0, mine:0 },
    heldKeys: [false, false, false, false],
    hitOffsets: [],
    life: 50,
    lifeHistory: [],
    comboHistory: [],
    accuracyHistory: [],
    difficultyStats: null,
    globalFrame: 0
};

let gameConfig = { scrollSpeed: 0, receptorY: 0, columnWidth: 0, arrowSize: 0 };

// Asset Containers
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
const placeholders = [
    { meta: { title: "Loading Sync...", artist: "..." }, charts: [] }
];
placeholders.forEach(p => songLibrary.push(p));

/* =========================================
   LIBRARY & UI LOGIC
   ========================================= */

// Initial Render & Load Local Song
window.onload = async () => {
    // Hide canvas initially
    document.getElementById('gameCanvas').style.display = 'none';
    renderSongList();
    await loadLocalSong();
};

async function loadLocalSong() {
    try {
        const smRes = await fetch('./sync/sync.sm');
        if (!smRes.ok) throw new Error("sync.sm not found in ./sync/");
        const smText = await smRes.text();
        const parsedData = parseSM(smText);

        const audioRes = await fetch('./sync/_sync music.ogg');
        if (!audioRes.ok) throw new Error("_sync music.ogg not found in ./sync/");
        const audioBlob = await audioRes.blob();

        songLibrary[0] = {
            meta: parsedData.meta,
            charts: parsedData.charts,
            audioBlob: audioBlob,
            bannerBlob: null, 
            bgBlob: null,
            cdTitleBlob: null
        };

        if (selectedSongIndex === 0) {
            selectSong(0);
        }
        
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
    
    document.getElementById('library-count').innerText = `${songLibrary.length} Songs`;

    songLibrary.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = `song-item ${index === selectedSongIndex ? 'selected' : ''}`;
        item.onclick = () => selectSong(index);
        
        let squares = '';
        if (song.charts) {
            song.charts.forEach(c => {
                let cls = 'bg-edit';
                const diff = c.difficulty.toLowerCase();
                if(diff.includes('beginner')) cls='bg-beginner';
                else if(diff.includes('easy')) cls='bg-easy';
                else if(diff.includes('medium')) cls='bg-medium';
                else if(diff.includes('hard')) cls='bg-hard';
                else if(diff.includes('challenge')) cls='bg-challenge';
                squares += `<div class="diff-square ${cls}" title="${c.difficulty} ${c.meter}"></div>`;
            });
        }

        item.innerHTML = `
            <div class="song-item-info">
                <span class="song-item-title">${song.meta.title}</span>
                <span class="song-item-artist">${song.meta.artist}</span>
            </div>
            <div class="diff-squares">${squares}</div>
        `;
        list.appendChild(item);
    });
}

function selectSong(index) {
    selectedSongIndex = index;
    selectedChartIndex = -1;
    renderSongList(); 
    
    const song = songLibrary[index];
    
    document.getElementById('ss-empty-state').style.display = 'none';
    document.getElementById('ss-details-content').style.display = 'flex';

    document.getElementById('ss-title').innerText = song.meta.title;
    document.getElementById('ss-artist').innerText = song.meta.artist;
    
    const banner = document.getElementById('ss-banner');
    if(song.bannerBlob) {
        banner.src = URL.createObjectURL(song.bannerBlob);
        banner.style.display = 'block';
    } else {
        banner.src = ''; 
        banner.style.display = 'none';
    }
    
    const cd = document.getElementById('ss-cdtitle');
    if(song.cdTitleBlob) {
        cd.src = URL.createObjectURL(song.cdTitleBlob);
        cd.style.display = 'block';
    } else {
        cd.style.display = 'none';
    }

    if(song.bgBlob) {
        document.getElementById('bg-layer').style.backgroundImage = `url(${URL.createObjectURL(song.bgBlob)})`;
    }

    const diffList = document.getElementById('ss-diff-list');
    diffList.innerHTML = '';
    
    const order = ['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge', 'Edit'];
    if (song.charts) {
        song.charts.sort((a,b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));

        song.charts.forEach((chart, cIndex) => {
            const btn = document.createElement('div');
            let cls = 'bg-edit';
            const diff = chart.difficulty.toLowerCase();
            if(diff.includes('beginner')) cls='bg-beginner';
            else if(diff.includes('easy')) cls='bg-easy';
            else if(diff.includes('medium')) cls='bg-medium';
            else if(diff.includes('hard')) cls='bg-hard';
            else if(diff.includes('challenge')) cls='bg-challenge';
            
            btn.className = `ss-diff-item ${cls}`;
            btn.innerHTML = `<span>${chart.difficulty}</span> <span>${chart.meter}</span>`;
            btn.onclick = () => selectDifficulty(cIndex);
            diffList.appendChild(btn);
        });
    }

    document.getElementById('start-btn').disabled = true;
    document.getElementById('start-btn').innerText = "Select Difficulty";
    
    ['overall', 'stream', 'jumpstream', 'handstream', 'chordjack', 'technical', 'stamina', 'nps', 'peak'].forEach(k => {
        const el = document.getElementById(`calc-${k}`);
        if(el) el.innerText = "0.0";
    });
}

function selectDifficulty(chartIndex) {
    selectedChartIndex = chartIndex;
    
    const items = document.querySelectorAll('.ss-diff-item');
    items.forEach((item, i) => {
        if(i === chartIndex) item.classList.add('active');
        else item.classList.remove('active');
    });

    const chart = songLibrary[selectedSongIndex].charts[chartIndex];
    if (chart.notes) {
        const calc = calculateDetailedDifficulty(chart.notes);
        document.getElementById('calc-nps').innerText = calc.nps.toFixed(2);
        document.getElementById('calc-peak').innerText = calc.peak.toFixed(2);
        
        document.getElementById('calc-overall').innerText = calc.overall.toFixed(1);
        document.getElementById('calc-stream').innerText = calc.stream.toFixed(1);
        document.getElementById('calc-jumpstream').innerText = calc.jumpstream.toFixed(1);
        document.getElementById('calc-handstream').innerText = calc.handstream.toFixed(1);
        document.getElementById('calc-chordjack').innerText = calc.chordjack.toFixed(1);
        document.getElementById('calc-technical').innerText = calc.technical.toFixed(1);
        document.getElementById('calc-stamina').innerText = calc.stamina.toFixed(1);
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
                const prevCols = rows[i-1].notes.map(n => n.col);
                const currCols = rowNotes.map(n => n.col);
                if (currCols.some(c => prevCols.includes(c))) jackCount++;
            }
            i++;
        }
        
        const nps = noteCount / windowSize;
        if (nps > maxNPS) maxNPS = nps;

        let sStr = nps; if (chordCount > 0) sStr *= 0.8; streamStrains.push(sStr);
        let sJs = nps; const jumpRatio = noteCount > 0 ? (chordCount / (noteCount/2)) : 0; 
        if (jumpRatio < 0.2) sJs *= 0.2; else sJs *= (0.8 + jumpRatio * 0.4); jsStrains.push(sJs);
        let sHs = 0; if (handCount > 0) { sHs = nps * 0.9 + (handCount * 1.5); } hsStrains.push(sHs);
        let sCj = 0; if (chordCount > 0 && jackCount > 0) { sCj = nps * 0.8 + (jackCount * 1.5) + (chordCount * 1.0); } cjStrains.push(sCj);
        let sTech = nps * 0.4 + (jackCount * 2.5); techStrains.push(sTech);

        windowStart += 0.5;
        while(windowIndex < rows.length && rows[windowIndex].time < windowStart) windowIndex++;
    }
    
    const aggregate = (arr) => {
        if (arr.length === 0) return 0; arr.sort((a, b) => b - a);
        let weightedSum = 0, weightTotal = 0; const topCount = Math.min(arr.length, 16); 
        for(let i=0; i<topCount; i++) { const w = Math.pow(0.9, i); weightedSum += arr[i] * w; weightTotal += w; }
        if (weightTotal === 0) return 0; return weightedSum / weightTotal;
    };

    const sStream = aggregate(streamStrains); const sJS = aggregate(jsStrains); const sHS = aggregate(hsStrains);
    const sCJ = aggregate(cjStrains); const sTech = aggregate(techStrains);
    const duration = rows[rows.length-1].time - rows[0].time;
    
    const denseThreshold = maxNPS * 0.5;
    const denseStrains = streamStrains.filter(s => s > denseThreshold);
    const avgDense = denseStrains.length > 0 ? denseStrains.reduce((a,b)=>a+b,0)/denseStrains.length : 0;
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

// ** START GAME: Initializes Audio Context immediately **
async function startGameFromMenu() {
    if(selectedSongIndex === -1 || selectedChartIndex === -1) return;
    
    const song = songLibrary[selectedSongIndex];
    const chart = song.charts[selectedChartIndex];
    
    // ** FIX: Initialize AudioContext on user click to prevent suspension **
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    
    if (song.audioBlob) {
        document.getElementById('loading-status').style.display = 'flex';
        try {
            const ab = await song.audioBlob.arrayBuffer();
            const decoded = await audioCtx.decodeAudioData(ab);
            
            document.getElementById('loading-status').style.display = 'none';
            
            // Calc stats again to pass to game state
            const difficultyCalc = calculateDetailedDifficulty(chart.notes);
            initGame(chart, decoded, song.meta, difficultyCalc);
        } catch(e) {
            alert("Error decoding audio: " + e.message);
            document.getElementById('loading-status').style.display = 'none';
        }
    } else {
        alert("This song has no audio loaded.");
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
    document.getElementById('accuracy').innerText = displayAccPercent + "%";
    document.getElementById('score').innerText = displayScore;
    
    const comboEl = document.getElementById('combo');
    if (gameState.combo > 0) { comboEl.style.display = 'block'; comboEl.innerText = gameState.combo; } 
    else { comboEl.style.display = 'none'; }
    document.getElementById('life-percent').innerText = gameState.life.toFixed(1) + "%";
}

function updateJudgmentTracker() {
    document.getElementById('count-marvelous').innerText = gameState.judgments.marvelous;
    document.getElementById('count-perfect').innerText = gameState.judgments.perfect;
    document.getElementById('count-great').innerText = gameState.judgments.great;
    document.getElementById('count-good').innerText = gameState.judgments.good;
    document.getElementById('count-bad').innerText = gameState.judgments.bad;
    document.getElementById('count-miss').innerText = gameState.judgments.miss;
}

function triggerFail() {
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

    if (!isMiss && note.type !== 'mine') gameState.hitOffsets.push(offsetMs);

    if (note.type === 'mine') {
        judgeText = "MINE HIT"; judgeClass = "judge-miss"; breaksCombo = true;
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
    }

    const currentAcc = gameState.totalNotesHitOrMissed > 0 ? (gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2)) * 100 : 100;
    gameState.accuracyHistory.push({ time: (audioCtx.currentTime - gameState.startTime), acc: currentAcc, grade: getGrade(currentAcc) });
    
    if (breaksCombo) gameState.combo = 0; else if(note.type !== 'mine') gameState.combo++;
    if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
    gameState.life = Math.max(0, Math.min(100, gameState.life + lifeChange));
    gameState.lifeHistory.push(gameState.life); gameState.comboHistory.push(gameState.combo);

    const jEl = document.getElementById('judgment'); jEl.innerText = judgeText; jEl.className = judgeClass;
    jEl.style.animation = 'none'; jEl.offsetHeight; jEl.style.animation = 'pulse 0.1s'; 
    updateScoreDisplay(); updateJudgmentTracker();

    if (gameState.life <= 0) { triggerFail(); return; }

    if (gameState.totalNotesHitOrMissed >= gameState.totalNotesInChart) setTimeout(showResults, 2000);
}

function triggerHoldJudgement(note, isOK) {
    if (gameState.failed) return;
    if (isOK) { gameState.judgments.ok++; gameState.combo++; gameState.life = Math.min(100, gameState.life + 0.4); } 
    else { gameState.judgments.ng++; gameState.combo = 0; gameState.accumulatedAccuracyPoints += -4.5; gameState.totalNotesHitOrMissed++; gameState.life = Math.max(0, gameState.life - 8.0); const jEl = document.getElementById('judgment'); jEl.innerText = "N.G."; jEl.className = "judge-miss"; }
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

function drawOffsetGraph() {
    const gCanvas = document.getElementById('offsetChart');
    if (!gCanvas) return;
    const gCtx = gCanvas.getContext('2d');
    const w = gCanvas.width; const h = gCanvas.height;
    gCtx.clearRect(0, 0, w, h);
    const centerY = h / 2;
    const drawWinLine = (ms, color) => {
        const scaleY = (h / 2) / 180; const yOffset = ms * scaleY;
        gCtx.fillStyle = color; gCtx.globalAlpha = 0.1; gCtx.fillRect(0, centerY - yOffset, w, yOffset * 2); gCtx.globalAlpha = 1.0;
    };
    drawWinLine(J_BAD, '#aa00ff'); drawWinLine(J_GOOD, '#0099ff'); drawWinLine(J_GREAT, '#44ff4b');
    drawWinLine(J_PERFECT, '#ffe600'); drawWinLine(J_MARVELOUS, '#a3f7ff');
    gCtx.strokeStyle = '#fff'; gCtx.lineWidth = 1; gCtx.beginPath(); gCtx.moveTo(0, centerY); gCtx.lineTo(w, centerY); gCtx.stroke();
    const offsets = gameState.hitOffsets; const scaleY = (h / 2) / 180;
    offsets.forEach((off, i) => {
        const x = (i / offsets.length) * w; const y = centerY + (off * scaleY);
        let color = '#ff3333'; const abs = Math.abs(off);
        if (abs <= J_MARVELOUS) color = '#a3f7ff'; else if (abs <= J_PERFECT) color = '#ffe600';
        else if (abs <= J_GREAT) color = '#44ff4b'; else if (abs <= J_GOOD) color = '#0099ff'; else if (abs <= J_BAD) color = '#aa00ff';
        gCtx.fillStyle = color; gCtx.fillRect(x, y-1, 3, 3); 
    });
}

function drawLifeComboChart() {
    const cCanvas = document.getElementById('lifeComboChart');
    if (!cCanvas) return;
    const ctx = cCanvas.getContext('2d');
    const w = cCanvas.width; const h = cCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const total = gameState.totalNotesInChart;
    const comboData = gameState.comboHistory; const lifeData = gameState.lifeHistory;
    if (comboData.length === 0) return;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h - (lifeData[0] / 100 * h));
    for (let i = 0; i < lifeData.length; i++) { const x = (i / total) * w; const y = h - (lifeData[i] / 100 * h); ctx.lineTo(x, y); }
    ctx.lineTo((lifeData.length / total) * w, h); ctx.lineTo(0, h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, h - (lifeData[0] / 100 * h));
    for (let i = 0; i < lifeData.length; i++) { const x = (i / total) * w; const y = h - (lifeData[i] / 100 * h); ctx.lineTo(x, y); }
    ctx.stroke();
    const maxC = Math.max(1, gameState.maxCombo); ctx.strokeStyle = '#00e5ff';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let i = 0; i < comboData.length; i++) { const x = (i / total) * w; const y = h - (comboData[i] / maxC * h); ctx.lineTo(x, y); }
    ctx.stroke();
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

    const getGradeColor = (grade) => {
        if (!grade) return "#aa00ff";
        if (grade.includes("AAAA")) return "#ffe600"; 
        if (grade.includes("AAA")) return "#a3f7ff";
        if (grade.includes("AA")) return "#44ff4b"; 
        if (grade.includes("A")) return "#00e5ff"; 
        return "#aa00ff";
    };

    // Use song duration if available, or last hit time
    let endTime = hist[hist.length-1].time;
    if (endTime <= 0) endTime = 1;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < hist.length; i++) {
        const p1 = hist[i-1];
        const p2 = hist[i];
        
        const x1 = (p1.time / endTime) * w;
        const y1 = h - (p1.acc / 100 * h);
        const x2 = (p2.time / endTime) * w;
        const y2 = h - (p2.acc / 100 * h);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = getGradeColor(p2.grade);
        ctx.stroke();
    }
}

function handleLeaderboard() {
    const key = `webSM_lb_${gameState.meta.title}_${gameState.chartInfo.difficulty}`;
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    const acc = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2) : 0;
    lb.push({ score: Math.round(gameState.score), grade: getGrade(acc * 100), acc: (acc * 100).toFixed(2), date: new Date().toLocaleDateString() });
    lb.sort((a,b) => b.score - a.score); lb = lb.slice(0, 10);
    localStorage.setItem(key, JSON.stringify(lb));
}

function showResults() {
    gameState.isPlaying = false;
    const acc = gameState.totalNotesHitOrMissed > 0 ? gameState.accumulatedAccuracyPoints / (gameState.totalNotesHitOrMissed * 2) : 0;
    
    setScreen('results-screen');
    document.getElementById('gameCanvas').style.display = 'none';
    const bannerUrl = document.getElementById('ss-banner').src; 
    if (bannerUrl && bannerUrl !== window.location.href) { document.getElementById('res-banner').src = bannerUrl; document.getElementById('res-banner').style.display = 'block'; } 
    else { document.getElementById('res-banner').style.display = 'none'; }
    document.getElementById('res-song-title').innerText = gameState.meta.title;
    document.getElementById('res-song-artist').innerText = gameState.meta.artist;
    
    const stats = calculateDetailedStats(); const total = gameState.totalNotesInChart; const accPct = acc * 100;
    
    const diff = gameState.difficultyStats ? gameState.difficultyStats.overall : 0;
    const ssr = calculateSSR(diff, acc);
    
    document.getElementById('res-clear-type').innerText = getClearType();
    document.getElementById('res-grade').innerText = gameState.failed ? "F" : getGrade(accPct);
    
    document.getElementById('res-acc').innerText = accPct >= 99.90 ? accPct.toFixed(4) + "%" : accPct.toFixed(2) + "%";
    document.getElementById('res-score').innerText = Math.round(gameState.score).toLocaleString();
    document.getElementById('res-dp').innerText = gameState.accumulatedAccuracyPoints.toFixed(2);
    
    const ssrEl = document.getElementById('res-ssr');
    if (ssrEl) ssrEl.innerText = ssr.toFixed(2);

    const comboPct = (gameState.maxCombo / total * 100).toFixed(2);
    document.getElementById('res-combo').innerText = gameState.maxCombo;
    document.getElementById('res-combo-pct').innerText = `(${comboPct}%)`;
    document.getElementById('res-mean').innerText = stats.mean + "ms";
    document.getElementById('res-sd').innerText = stats.sd + "ms";
    document.getElementById('res-max').innerText = stats.max + "ms";
    document.getElementById('res-ma').innerText = stats.ma;
    document.getElementById('res-pa').innerText = stats.pa;
    const updateJudgeRes = (type) => {
        const count = gameState.judgments[type]; const pct = (count / total * 100).toFixed(2);
        document.getElementById(`res-count-${type}`).innerText = count; document.getElementById(`res-pct-${type}`).innerText = `${pct}%`;
    };
    ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'].forEach(updateJudgeRes);
    handleLeaderboard(); drawOffsetGraph(); drawLifeComboChart(); drawAccuracyGraph();
}

/* =========================================
   RENDERING & LOOP (Unchanged)
   ========================================= */
function setupCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.height = window.innerHeight;
    canvas.width = canvas.height * 0.625; 
    gameConfig.columnWidth = canvas.width / 4;
    gameConfig.arrowSize = gameConfig.columnWidth * 0.9; 
    if (userConfig.downScroll) {
        gameConfig.receptorY = (canvas.height * 0.9) - 65; 
    } else {
        gameConfig.receptorY = (canvas.height * 0.1) + 65; 
    }
    let visibleDistance = userConfig.downScroll ? gameConfig.receptorY : canvas.height - gameConfig.receptorY;
    gameConfig.scrollSpeed = visibleDistance / (userConfig.scrollTime / 1000);
}
function getNoteRowIndex(beat) {
    const b = Math.abs(beat); const epsilon = 0.01; const isSnap = (div) => Math.abs((b * div) - Math.round(b * div)) < epsilon;
    if (isSnap(1)) return 0; if (isSnap(2)) return 1; if (isSnap(3)) return 2; if (isSnap(4)) return 3;
    if (isSnap(6)) return 4; if (isSnap(8)) return 5; if (isSnap(12)) return 6; return 7; 
}
function drawReceptor(x, y, rotation, colIndex) {
    ctx.save();
    const halfSize = gameConfig.columnWidth / 2; ctx.translate(x + halfSize, y + halfSize); ctx.rotate(rotation * Math.PI / 180);
    const drawSize = gameConfig.arrowSize; const offset = -drawSize / 2;
    if (assets.loaded.receptorSprite) { const img = assets.receptorSprite; const sx = gameState.heldKeys[colIndex] ? img.width/2 : 0; ctx.drawImage(img, sx, 0, img.width/2, img.height, offset, offset, drawSize, drawSize); } 
    else { ctx.beginPath(); const s = drawSize / 2.5; ctx.strokeStyle = gameState.heldKeys[colIndex] ? '#fff' : '#aaa'; ctx.lineWidth = 4; ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(s/2, 0); ctx.lineTo(s/2, s); ctx.lineTo(-s/2, s); ctx.lineTo(-s/2, 0); ctx.lineTo(-s, 0); ctx.closePath(); ctx.stroke(); }
    const isHoldingActive = gameState.activeNotes.some(n => n.col === colIndex && n.holdState === 'active' && !n.processed && (n.type === 'hold' || n.type === 'roll'));
    if (isHoldingActive && assets.loaded.holdExplosion) { const expImg = assets.holdExplosion; const frame = Math.floor(Date.now() / 50) % 2; const fw = expImg.width / 2; ctx.drawImage(expImg, frame * fw, 0, fw, expImg.height, offset, offset, drawSize, drawSize); }
    ctx.restore();
}
function drawNote(note, y, rotation) {
    ctx.save();
    const halfSize = gameConfig.columnWidth / 2; const x = note.col * gameConfig.columnWidth;
    if ((note.type === 'hold' || note.type === 'roll') && note.endTime) {
        let tailY; const duration = note.endTime - note.time; let dist = duration * gameConfig.scrollSpeed;
        if (userConfig.downScroll) tailY = y - dist; else tailY = y + dist;
        let drawHeadY = y; let drawTailY = tailY;
        if (note.holdState === 'active') { drawHeadY = gameConfig.receptorY; }
        const bodyImg = note.type === 'hold' ? assets.holdBody : assets.rollBody;
        const bodyLoaded = note.type === 'hold' ? assets.loaded.holdBody : assets.loaded.rollBody;
        if (bodyLoaded) {
            ctx.save(); ctx.beginPath();
            const w = gameConfig.arrowSize; 
            const bx = x + (gameConfig.columnWidth - w)/2;
            let ry = userConfig.downScroll ? drawTailY : drawHeadY; let rh = Math.abs(drawHeadY - drawTailY);
            ctx.rect(bx, ry, w, rh); ctx.clip();
            const scale = w / bodyImg.width; const sHeight = bodyImg.height * scale; const count = Math.ceil(rh / sHeight) + 1; const scrollOffset = (Date.now() / 10) % sHeight;
            for(let k=-1; k<count; k++) { ctx.drawImage(bodyImg, bx, ry + (k*sHeight) - scrollOffset, w, sHeight); }
            ctx.restore();
        }
    }
    ctx.translate(x + halfSize, y + halfSize); ctx.rotate(rotation * Math.PI / 180);
    const drawSize = gameConfig.arrowSize; const offset = -drawSize / 2;
    if (note.type === 'mine' && assets.loaded.mineSprite) {
        const frames = 8; const frame = Math.floor(gameState.globalFrame / 10) % frames; 
        const fw = assets.mineSprite.width; const fh = assets.mineSprite.height / 8;
        ctx.drawImage(assets.mineSprite, 0, frame * fh, fw, fh, offset, offset, drawSize, drawSize);
    } else {
        let img = assets.arrowSprite; let rowIndex = getNoteRowIndex(note.beat);
        if (note.holdState === 'active' && assets.loaded.holdHeadActive) { img = assets.holdHeadActive; }
        if (assets.loaded.arrowSprite) { const sy = rowIndex * (img.height/8); ctx.drawImage(img, 0, sy, img.width, img.height/8, offset, offset, drawSize, drawSize); } 
        else { ctx.fillStyle = '#fff'; ctx.fillRect(offset, offset, drawSize, drawSize); }
    }
    ctx.restore();
}
function gameLoop() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    const currentTime = audioCtx.currentTime - gameState.startTime; gameState.globalFrame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const spriteRotations = [90, 0, 180, 270]; const vectorRotations = [270, 180, 0, 90];
    for(let i=0; i<4; i++) { let rot = assets.loaded.receptorSprite ? spriteRotations[i] : vectorRotations[i]; drawReceptor(i * gameConfig.columnWidth, gameConfig.receptorY, rot, i); }
    gameState.activeNotes.forEach(note => {
        if ((note.type === 'hold' || note.type === 'roll') && note.holdState === 'active') {
            if (currentTime >= note.endTime) { note.holdState = 'ok'; triggerHoldJudgement(note, true); return; }
            const keyHeld = gameState.heldKeys[note.col];
            if (note.type === 'hold') {
                if (!keyHeld) {
                    if (!note.letGoTime) note.letGoTime = currentTime;
                    if ((currentTime - note.letGoTime) * 1000 > 250) { note.holdState = 'ng'; triggerHoldJudgement(note, false); }
                } else { note.letGoTime = null; }
            }
            if (note.type === 'roll') { const timeSincePress = (currentTime - note.lastPressTime) * 1000; if (timeSincePress > 500) { note.holdState = 'ng'; triggerHoldJudgement(note, false); } }
        }
        if (note.processed && note.holdState !== 'active') return;
        const timeDiff = note.time - currentTime;
        if (note.type === 'mine' && !note.processed) {
            const msDiff = timeDiff * 1000;
            if (Math.abs(msDiff) <= J_MINE_WINDOW) { if (gameState.heldKeys[note.col]) { triggerJudgement(note, msDiff, false); } }
            if (msDiff < -J_MINE_WINDOW) { note.processed = true; return; }
        }
        if (timeDiff < -(J_MISS_WINDOW / 1000) && !note.hit && note.type !== 'mine' && note.holdState === 'inactive') { note.processed = true; triggerJudgement(note, J_MISS_WINDOW + 1, true); return; }
        let y; if (userConfig.downScroll) y = gameConfig.receptorY - (timeDiff * gameConfig.scrollSpeed); else y = gameConfig.receptorY + (timeDiff * gameConfig.scrollSpeed);
        if (y > -1000 && y < canvas.height + 1000) { const rowIndex = getNoteRowIndex(note.beat); let rot = assets.loaded.arrowSprite ? spriteRotations[note.col] : vectorRotations[note.col]; drawNote(note, y, rot); }
    });
    requestAnimationFrame(gameLoop);
}

function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; document.getElementById('scroll-toggle').innerText = userConfig.downScroll ? "Downscroll" : "Upscroll (Default)"; document.getElementById('scroll-speed-input').value = userConfig.scrollTime; document.getElementById('key-0').value = userConfig.keys[0]; document.getElementById('key-1').value = userConfig.keys[1]; document.getElementById('key-2').value = userConfig.keys[2]; document.getElementById('key-3').value = userConfig.keys[3]; }
window.openSettings = openSettings;
function toggleScrollDir() { userConfig.downScroll = !userConfig.downScroll; document.getElementById('scroll-toggle').innerText = userConfig.downScroll ? "Downscroll" : "Upscroll (Default)"; }
window.toggleScrollDir = toggleScrollDir;
function saveSettings() { const k0 = document.getElementById('key-0').value.toLowerCase() || 'd'; const k1 = document.getElementById('key-1').value.toLowerCase() || 'f'; const k2 = document.getElementById('key-2').value.toLowerCase() || 'j'; const k3 = document.getElementById('key-3').value.toLowerCase() || 'k'; const speed = parseInt(document.getElementById('scroll-speed-input').value); userConfig.keys = [k0, k1, k2, k3]; userConfig.scrollTime = (speed && speed > 0) ? speed : 650; localStorage.setItem('webSM_config', JSON.stringify(userConfig)); document.getElementById('settings-modal').style.display = 'none'; }
window.saveSettings = saveSettings;
function togglePause() { if (!gameState.isPlaying) return; if (gameState.isPaused) resumeGame(); else { gameState.isPaused = true; audioCtx.suspend(); gameState.pauseTime = audioCtx.currentTime; setScreen('pause-menu'); document.getElementById('game-hud').style.display = 'flex'; } }
window.togglePause = togglePause;
function resumeGame() { if (!gameState.isPaused) return; gameState.isPaused = false; audioCtx.resume(); document.getElementById('pause-menu').style.display = 'none'; requestAnimationFrame(gameLoop); }
window.resumeGame = resumeGame;
function quitGame() { if (audioSource) try { audioSource.stop(); } catch(e){} gameState.isPlaying = false; gameState.isPaused = false; setScreen('setup-panel'); document.getElementById('gameCanvas').style.display = 'none'; ctx.clearRect(0,0,canvas.width, canvas.height); }
window.quitGame = quitGame;
function handleInput(e) {
    if (e.code === 'Escape') { if (e.type === 'keydown') togglePause(); return; }
    if (!gameState.isPlaying || gameState.isPaused) return;
    const key = e.key.toLowerCase(); const colIndex = userConfig.keys.indexOf(key); if (colIndex === -1) return;
    if (e.type === 'keydown') { gameState.heldKeys[colIndex] = true; gameState.activeNotes.forEach(n => { if (n.col === colIndex && n.type === 'roll' && n.holdState === 'active') { n.lastPressTime = audioCtx.currentTime - gameState.startTime; } }); }
    if (e.type === 'keyup') gameState.heldKeys[colIndex] = false;
    if (e.type !== 'keydown') return; 
    const currentTime = audioCtx.currentTime - gameState.startTime; const hittableNote = gameState.activeNotes.find(n => n.col === colIndex && !n.processed && n.type !== 'mine' && Math.abs(n.time - currentTime) < (J_BAD / 1000));
    if (hittableNote) { hittableNote.hit = true; const diffMs = (hittableNote.time - currentTime) * 1000; triggerJudgement(hittableNote, diffMs, false); }
}
window.addEventListener('keydown', handleInput); window.addEventListener('keyup', handleInput); window.addEventListener('resize', () => { if(gameState.isPlaying) setupCanvas(); });
function initGame(chartInfo, audioBuf, meta, diffStats) {
    setScreen('game-hud');
    document.getElementById('gameCanvas').style.display = 'block';
    
    gameState.meta = meta; gameState.chartInfo = chartInfo; gameState.difficultyStats = diffStats; gameState.notes = chartInfo.notes;
    gameState.activeNotes = JSON.parse(JSON.stringify(chartInfo.notes)); gameState.totalNotesInChart = chartInfo.notes.length;
    gameState.combo = 0; gameState.maxCombo = 0; gameState.score = 0; gameState.accumulatedAccuracyPoints = 0; gameState.totalNotesHitOrMissed = 0;
    gameState.judgments = { marvelous:0, perfect:0, great:0, good:0, bad:0, miss:0, ok:0, ng:0, mine:0 };
    gameState.hitOffsets = []; gameState.life = 50; gameState.lifeHistory = []; gameState.comboHistory = []; gameState.accuracyHistory = [];
    // Reset History properly: add initial point
    gameState.accuracyHistory = [{time: 0, acc: 0, grade: 'D'}];
    
    gameState.isPaused = false; gameState.heldKeys = [false, false, false, false]; gameState.failed = false; 
    document.getElementById('failed-overlay').style.display = 'none';
    
    updateJudgmentTracker(); updateScoreDisplay(); audioBuffer = audioBuf; startEngine();
}
function startEngine() {
    setupCanvas(); audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioCtx.createBufferSource(); audioSource.buffer = audioBuffer; audioSource.connect(audioCtx.destination);
    const startTime = audioCtx.currentTime + 1.0; audioSource.start(startTime);
    gameState.startTime = startTime; gameState.isPlaying = true; requestAnimationFrame(gameLoop);
}
function parseSM(text) {
    const charts = []; const meta = {}; text = text.replace(/\/\/.*$/mg, ''); 
    const getTag = (tag) => { const match = text.match(new RegExp(`#${tag}:(.*?);`, 'i')); return match ? match[1].trim() : null; };
    meta.title = getTag('TITLE') || "Unknown"; meta.artist = getTag('ARTIST') || "Unknown"; meta.music = getTag('MUSIC');
    meta.banner = getTag('BANNER'); meta.background = getTag('BACKGROUND'); meta.cdtitle = getTag('CDTITLE');
    meta.offset = parseFloat(getTag('OFFSET')) || 0;
    const bpmMatch = text.match(/#BPMS:([\s\S]*?);/i);
    meta.bpms = bpmMatch ? bpmMatch[1].trim().split(',').map(b => { const p = b.split('='); return { beat: parseFloat(p[0]), value: parseFloat(p[1]) }; }) : [{beat:0, value:120}];
    const rawCharts = text.split(/#NOTES:/i); rawCharts.shift(); 
    rawCharts.forEach(raw => {
        const parts = raw.split(':');
        if (parts.length >= 6) {
            const type = parts[0].trim();
            if (type === 'dance-single') { charts.push({ difficulty: parts[2].trim(), meter: parts[3].trim(), notes: parseNoteData(parts[5].replace(';', '').trim(), meta.bpms, meta.offset) }); }
        }
    });
    return { meta, charts };
}
function parseNoteData(data, bpms, songOffset) {
    const measures = data.split(','); const notes = []; let currentBeat = 0; let activeHolds = [null, null, null, null]; 
    measures.forEach((measure) => {
        const lines = measure.trim().split(/\s+/); const rows = lines.length; const beatPerLine = 4 / rows; const bpm = bpms[0].value; const secondsPerBeat = 60 / bpm;
        lines.forEach((line, rowIndex) => {
            const exactBeat = currentBeat + (rowIndex * beatPerLine); const time = (exactBeat * secondsPerBeat) - songOffset;
            for (let col = 0; col < 4; col++) {
                const char = line[col];
                if (char === '1' || char === '2' || char === '4' || char === 'M') {
                    const type = char === '1' ? 'tap' : (char === '2' ? 'hold' : (char === '4' ? 'roll' : 'mine'));
                    const note = { beat: exactBeat, time: time, col: col, type: type, hit: false, processed: false, holdState: 'inactive', endTime: null };
                    notes.push(note); if (type === 'hold' || type === 'roll') { activeHolds[col] = note; }
                } 
                else if (char === '3') { if (activeHolds[col]) { activeHolds[col].endTime = time; activeHolds[col] = null; } }
            }
        });
        currentBeat += 4;
    });
    return notes.sort((a,b) => a.time - b.time);
}
const fileInput = document.getElementById('file-input'); const statusDiv = document.getElementById('loading-status');
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const smFile = files.find(f => f.name.toLowerCase().endsWith('.sm') || f.name.toLowerCase().endsWith('.ssc'));
    if (!smFile) { alert("No .sm file found."); return; }
    setScreen('loading-status'); statusDiv.style.display = 'block';
    try {
        const text = await smFile.text(); const parsedData = parseSM(text);
        const findFile = (name) => { if(!name) return null; return files.find(f => f.name.toLowerCase() === name.toLowerCase()); };
        const bannerFile = findFile(parsedData.meta.banner); const bgFile = findFile(parsedData.meta.background); const cdFile = findFile(parsedData.meta.cdtitle);
        const audioFile = findFile(parsedData.meta.music) || files.find(f => f.type.startsWith('audio'));
        if (!audioFile) throw new Error("Audio not found");
        const songObj = { meta: parsedData.meta, charts: parsedData.charts, audioBlob: audioFile, bannerBlob: bannerFile, bgBlob: bgFile, cdTitleBlob: cdFile };
        songLibrary.push(songObj); selectSong(songLibrary.length - 1); setScreen('setup-panel'); document.getElementById('loading-status').style.display = 'none';
    } catch (err) { console.error(err); alert("Error loading song: " + err.message); setScreen('setup-panel'); }
});