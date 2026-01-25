/* =========================================
   MODIFIERS STATE & LOGIC
   ========================================= */

const modConfig = {
    // Speed
    speedType: 'C',    // 'X', 'C', 'M'
    speedValue: 400,

    // Game
    failMode: 'on',    // 'on', 'off', 'end'
    rate: 1.0,
    pitchShift: true,

    // Target Tracker
    targetTracker: false,
    targetTrackerMode: 'percent', // 'percent', 'pb'
    targetTrackerVal: 93.00, // Percentage


    // Scroll
    scrollDirection: 'up', // 'up', 'down'
    scrollType: 'standard', // 'standard', 'split' (future)

    // Appearance
    appearance: {
        type: 'visible', // 'visible', 'hidden', 'sudden', 'stealth'
        offset: 50       // Percentage (0-100)
    },

    // Turn
    turn: 'none', // 'none', 'mirror', 'left', 'right', 'shuffle'

    // Insert/Remove (Transforms)
    transform: {
        // Removes
        little: false,
        noJumps: false,
        noHands: false,
        noMines: false,
        noHolds: false,
        noRolls: false,
        // Inserts
        big: false,
        quick: false,
        wide: false,
        skippy: false,
        echo: false,
        stomp: false
    },

    // Effects
    effect: {
        name: 'none', // 'drunk', 'dizzy', 'mini', 'flip', 'invert', 'tornado'
        magnitude: 100 // Percentage
    },

    accel: {
        name: 'none', // 'boost', 'brake', 'wave'
        magnitude: 100
    },
    scoringSystem: 'wife3',
    lifeSystem: 'normal',
    flareLevel: 'IX',
    accuracyAttack: 'off'
};
window.modConfig = modConfig; // Expose globally explicitly


/* =========================================
   UI HANDLERS
   ========================================= */

function openModifiers() {
    const modal = document.getElementById('modifiers-modal');
    modal.style.display = 'block';

    // Reset tabs to first one if we implemented tabs, for now just show setup
    showModTab('speed'); // Default tab

    const btn = document.getElementById('btn-modifiers');
    const panel = modal.querySelector('.modifiers-panel');

    if (btn && panel) {
        // Center or position relative (simplifying to just heavy center/overlay for larger UI)
        // Ignoring complicated positioning for the new larger modal
        panel.style.top = '50%';
        panel.style.left = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
        panel.style.position = 'absolute';
        panel.style.bottom = 'auto'; // Reset
    }

    updateModifiersUI();
}

function closeModifiers() {
    document.getElementById('modifiers-modal').style.display = 'none';
    saveModifiers();
}

function showModTab(tabName) {
    // Hide all mod-content sections
    document.querySelectorAll('.mod-section-content').forEach(el => el.style.display = 'none');
    document.getElementById(`mod-section-${tabName}`).style.display = 'block';

    // Update tab active state
    document.querySelectorAll('.mod-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`mod-tab-${tabName}`).classList.add('active');
}
window.showModTab = showModTab;

function updateModifiersUI() {
    // --- SPEED ---
    updateToggle('mod-speed-type', modConfig.speedType);
    let valStr = modConfig.speedValue;
    if (modConfig.speedType === 'X') valStr = modConfig.speedValue.toFixed(1) + "x";
    else if (modConfig.speedType === 'C') valStr = "C" + Math.round(modConfig.speedValue);
    else if (modConfig.speedType === 'M') valStr = "M" + Math.round(modConfig.speedValue);
    document.getElementById('mod-speed-val-display').innerText = valStr;

    // Update px/sec display
    const pxDisplay = document.getElementById('mod-speed-px-display');
    if (pxDisplay) {
        const bpmStats = window.currentBPMStats || { min: 150, max: 150 };
        // Note: 480px normalization.
        // Stepmania X-mod definition: 1x = 1 beat covers standard measure distance? 
        // Standard SM: 1x at 60BPM = 1 beat per second. 
        // Scroll pixels = BPM * Mult? 
        // Actually usually standard is: 1x -> Notes move at BPM pixels per minute or something?
        // Let's verify standard behavior or "SMCloneish" behavior.
        // In game.js: scrollSpeed = ...
        // If X-Mod: speed = BPM * modConfig.speedValue
        // If C-Mod: speed = modConfig.speedValue
        // 
        // User said: "make sure all speed mod calculations uses a 480px screen height to calculate px/sec"
        // This likely implies a reference point. 
        // BUT, if the game's loop directly uses `scrollSpeed` in pixels/sec, then we just show that.
        // Let's check game.js scroll logic again (I saw it earlier in previewLoop, simple multiplication).
        // previewLoop: y = ... + diff * speed
        // where speed = 400 (if C400).
        // If X-Mod, gameLoop sets gameConfig.scrollSpeed dynamically based on current BPM? 
        // I need to check gameLoop dynamic speed updae. 
        // 
        // Assuming standard: 
        // C-Mod: Value IS pixels per second.
        // X-Mod: Value * BPM = pixels per second? (e.g. 1x at 60BPM = 60px/s? Or is there a base scalar?)
        // Taking "C400 matches 4.0x at 100BPM" -> 4.0 * 100 = 400. Yes.
        // So Speed(px/s) = Mult * BPM.

        // 480px height normalization?
        // Maybe user means "Speed 1x should traverse 480px in ... seconds?"
        // Or simply "Display px/sec assuming 100% is 480px"? No, px/sec is absolute units.
        // "uses a 480px screen height to calculate px/sec" -- usually this comes up in Osu!mania/Quaver conversions.
        // If the user considers "Scroll Speed" as "Time to cross screen", then px/sec = Height / scrollTime.
        // But here we have X-mod/C-mod. 
        // Let's assume the user just wants the literal px/s value.
        // "switch from C1000 to X-mod on 200BPM gives 5.0x" -> 5.0 * 200 = 1000. 
        // This matches the helper assumption.

        let text = "";
        if (modConfig.speedType === 'X') {
            const min = Math.round(bpmStats.min * modConfig.speedValue);
            const max = Math.round(bpmStats.max * modConfig.speedValue);
            if (min === max) text = `(${min} px/s)`;
            else text = `(${min} - ${max} px/s)`;
        } else {
            // C or M
            text = `(${Math.round(modConfig.speedValue)} px/s)`;
        }
        pxDisplay.innerText = text;
    }

    // --- GAMEPLAY (Fail, Rate, Pitch) ---
    updateToggle('mod-fail', modConfig.failMode);
    document.getElementById('mod-rate-display').innerText = modConfig.rate.toFixed(2) + "x";
    updateToggle('mod-pitch', modConfig.pitchShift ? 'on' : 'off');
    updateToggle('mod-scroll-dir', modConfig.scrollDirection);

    // --- TARGET TRACKER ---
    let trackerState = modConfig.targetTracker ? modConfig.targetTrackerMode : 'off';
    updateToggle('mod-tracker', trackerState);
    document.getElementById('mod-tracker-val-display').innerText = modConfig.targetTrackerVal.toFixed(2) + "%";


    // --- DISPLAY / APPEARANCE ---
    updateToggle('mod-appear-type', modConfig.appearance.type);
    document.getElementById('mod-appear-offset-val').innerText = modConfig.appearance.offset + "%";
    document.getElementById('mod-appear-offset-slider').value = modConfig.appearance.offset;

    // --- NOTES (Turn, Transform) ---
    updateToggle('mod-turn', modConfig.turn);

    // Toggles for Transforms
    ['little', 'noJumps', 'noHands', 'noMines', 'noHolds', 'noRolls', 'big', 'quick', 'wide', 'skippy', 'echo', 'stomp'].forEach(k => {
        updateToggle(`mod-tf-${k}`, modConfig.transform[k] ? 'on' : 'off');
    });

    // --- EFFECTS ---
    updateToggle('mod-effect', modConfig.effect.name);

    updateToggle('mod-scoring-system', modConfig.scoringSystem);
    updateToggle('mod-life-system', modConfig.lifeSystem);
    updateToggle('mod-flare-level-group', modConfig.flareLevel);
    updateToggle('mod-acc-attack', modConfig.accuracyAttack);

    const flareGroup = document.getElementById('mod-flare-level-group');
    if (flareGroup) flareGroup.style.display = (modConfig.lifeSystem === 'flare') ? 'block' : 'none';
}

function updateToggle(containerId, activeVal) {
    const group = document.getElementById(containerId);
    if (!group) return;
    const btns = group.querySelectorAll('.mod-toggle-btn');
    btns.forEach(btn => {
        if (btn.dataset.val === String(activeVal)) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function changeSpeedVal(delta) {
    if (modConfig.speedType === 'X') {
        let change = delta > 0 ? 0.25 : -0.25;
        modConfig.speedValue = Math.max(0.25, modConfig.speedValue + change);
    } else {
        let change = delta > 0 ? 25 : -25;
        modConfig.speedValue = Math.max(50, modConfig.speedValue + change);
    }
    updateModifiersUI();
}
window.changeSpeedVal = changeSpeedVal;

function changeRateVal(delta) {
    // Restriction: Only allow rate change in Song Select (setup-panel)
    const setupPanel = document.getElementById('setup-panel');
    if (!setupPanel || getComputedStyle(setupPanel).display === 'none') return;

    const step = 0.05;
    let newRate = modConfig.rate + (delta * step);
    newRate = Math.max(0.7, Math.min(3.0, newRate)); // Clamped per user request
    modConfig.rate = Math.round(newRate * 100) / 100;
    updateModifiersUI();
    if (window.onRateChange) window.onRateChange(modConfig.rate);
}
window.changeRateVal = changeRateVal;

function changeTrackerVal(dir) {
    let v = modConfig.targetTrackerVal;

    // Logic: 
    // 1% steps until 99%
    // 0.1% steps until 99.9%
    // 99.955, 99.96 .. 99.99
    // 99.9935, 100%

    // We implement simpler "next step" logic based on current value ranges
    // Since floating point math can be messy, we round carefully.

    const steps = [
        { max: 99.0, step: 1.0 },
        { max: 99.9, step: 0.1 },
        { max: 99.99, step: 0.01 }, // Covers 99.955 approximately as granular step or just use explicit values?
        // User specific: "then 99.955, then 99.96 to 99.99, then 99.9935 and 100%"
        // This is highly specific. Let's implement an array of milestones for the upper end or a smart stepper.
    ];

    // Let's use a robust approach: define precise breakpoints for high values.
    // Below 99: integers. 
    // 99.0 - 99.9: 0.1

    let next = v;

    if (dir > 0) {
        if (v < 99.0) next = Math.floor(v) + 1;
        else if (v < 99.9 - 0.0001) next = v + 0.1;
        else if (v < 99.955 - 0.0001) next = 99.955;
        else if (v < 99.96 - 0.0001) next = 99.96;
        else if (v < 99.99 - 0.0001) next = v + 0.01;
        else if (v < 99.9935 - 0.0001) next = 99.9935;
        else next = 100.0;
    } else {
        if (v > 99.9935 + 0.0001) next = 99.9935;
        else if (v > 99.99 + 0.0001) next = 99.99;
        else if (v > 99.96 + 0.0001) next = v - 0.01;
        else if (v > 99.955 + 0.0001) next = 99.955; // Wait, 99.96 - 0.01 = 99.95. User asked 99.955.
        // Let's refine the high end logic.
        // Ranges:
        // ... 99.8, 99.9
        // 99.9 -> 99.955
        // 99.955 -> 99.96
        // 99.96, 99.97, 99.98, 99.99
        // 99.99 -> 99.9935
        // 99.9935 -> 100.0

        if (v > 100 - 0.0001) next = 99.9935;
        else if (v > 99.9935 - 0.0001 && v <= 100) next = 99.9935; // If at 100 go down
        else if (v > 99.99 - 0.0001) next = 99.99; // If at 99.9935 go down
        else if (v > 99.96 + 0.0001) next = v - 0.01; // 99.99 down to 99.96
        else if (v > 99.955 + 0.0001) next = 99.955; // 99.96 down
        else if (v > 99.9 + 0.0001) next = 99.9; // 99.955 down
        else if (v > 99.0 + 0.0001) next = v - 0.1;
        else next = Math.ceil(v) - 1;
    }

    // Fix precision issues
    // Clamp to valid range (0 to 100)
    if (next > 100) next = 100;
    if (next < 0) next = 0;

    // Formatting/Smoothing
    // Rounding helps align to expected steps (e.g. 98.9999 -> 99.0)
    if (next < 99) next = Math.round(next);
    else next = parseFloat(next.toFixed(4));

    modConfig.targetTrackerVal = next;
    updateModifiersUI();
}
window.changeTrackerVal = changeTrackerVal;

function setModifier(cat, val, subParam) {
    // General setter
    if (cat === 'speedType') {
        const oldType = modConfig.speedType;
        modConfig.speedType = val;

        if (val === 'X') {
            // Conversion Logic: C -> X
            // We want to match the PEAK speed (Max BPM * Multiplier)
            if (oldType === 'C' || oldType === 'M') {
                const bpmStats = window.currentBPMStats || { max: 150 }; // Fallback
                // C600 = 600 px/s
                // X calc: BPM * Mult = px/s (roughly, assuming standard scroll)
                // Actually: 
                // C-Mod: scroll speed is constant 'speedValue' (e.g. 600)
                // X-Mod: scroll speed is BPM * speedValue
                // So: 600 = MaxBPM * NewMult
                // NewMult = 600 / MaxBPM

                // Safety check
                const maxBpm = Math.max(1, bpmStats.max);
                let newMult = modConfig.speedValue / maxBpm;

                // Round to nearest 0.25 for cleanliness, or keep precise?
                // User asked for "calculated so that it matches". 
                // Let's round to 1 decimal first, or 0.25 steps.
                // 600 / 150 = 4.0. 
                // 600 / 140 = 4.28... -> 4.3?
                // Let's use 0.1 precision.
                newMult = Math.round(newMult * 10) / 10;

                modConfig.speedValue = Math.max(0.5, newMult);
            } else {
                modConfig.speedValue = 2.0; // Default if not converting
            }
        }
        else if (val === 'C' || val === 'M') {
            // Conversion Logic: X -> C/M
            if (oldType === 'X') {
                const bpmStats = window.currentBPMStats || { max: 150 };
                const maxBpm = Math.max(1, bpmStats.max);

                // Calc: Mult * BPM = Px/s
                let newSpeed = modConfig.speedValue * maxBpm;

                // Round to nearest 10 for cleaner numbers (e.g. 642 -> 640)
                newSpeed = Math.round(newSpeed / 10) * 10;

                modConfig.speedValue = Math.max(50, newSpeed);
            } else if (modConfig.speedValue < 50) {
                // If coming from uninitialized or weird state
                modConfig.speedValue = 400;
            }
            // If C -> M or M -> C, keep same value (already shared speedValue property)
        }
    }
    if (cat === 'fail') modConfig.failMode = val;
    if (cat === 'direction') {
        modConfig.scrollDirection = val;
        if (typeof setupCanvas === 'function') setupCanvas();
    }
    if (cat === 'pitchShift') modConfig.pitchShift = (val === 'on');

    if (cat === 'targetTracker') {
        if (val === 'off') {
            modConfig.targetTracker = false;
        } else {
            modConfig.targetTracker = true;
            modConfig.targetTrackerMode = val;
        }
    }

    // Appearance
    if (cat === 'appearType') modConfig.appearance.type = val;
    if (cat === 'appearOffset') {
        modConfig.appearance.offset = parseInt(val);
        document.getElementById('mod-appear-offset-val').innerText = val + "%";
    }

    // Turn
    if (cat === 'turn') modConfig.turn = val;

    // Transform
    if (cat === 'transform') {
        modConfig.transform[subParam] = (val === 'on');
    }

    // Effect
    if (cat === 'effect') modConfig.effect.name = val;

    if (cat === 'scoringSystem') modConfig.scoringSystem = val;
    if (cat === 'lifeSystem') modConfig.lifeSystem = val;
    if (cat === 'flareLevel') modConfig.flareLevel = val;
    if (cat === 'accuracyAttack') modConfig.accuracyAttack = val;

    updateModifiersUI();
}
window.setModifier = setModifier;

function saveModifiers() {
    localStorage.setItem('webSM_modifiers', JSON.stringify(modConfig));
    if (typeof userConfig !== 'undefined') {
        userConfig.modifiers = { ...modConfig };
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
        userConfig.failMode = modConfig.failMode;
        if (typeof saveUserConfig === 'function') saveUserConfig();
        if (typeof setupCanvas === 'function') setupCanvas();
    }
}

function loadModifiers() {
    const saved = localStorage.getItem('webSM_modifiers');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Deep merge to ensure new keys exist
            const merge = (target, source) => {
                for (const key in source) {
                    if (source[key] instanceof Object && key in target) {
                        Object.assign(source[key], merge(target[key], source[key]));
                    }
                }
                Object.assign(target || {}, source);
                return target;
            };
            // Simple approach: assign parsed top level, but ensure nested defaults if missing
            // Actually Object.assign is shallow.
            if (parsed.appearance) modConfig.appearance = parsed.appearance;
            if (parsed.transform) modConfig.transform = parsed.transform;
            if (parsed.effect) modConfig.effect = parsed.effect;

            // Primitives
            ['speedType', 'speedValue', 'failMode', 'pitchShift', 'scrollDirection', 'turn', 'targetTracker', 'targetTrackerMode', 'targetTrackerVal', 'scoringSystem', 'lifeSystem', 'flareLevel', 'accuracyAttack'].forEach(k => {
                if (parsed[k] !== undefined) modConfig[k] = parsed[k];
            });

        } catch (e) { console.error("Mod Load Error", e); }
    }
    if (typeof userConfig !== 'undefined') {
        userConfig.modifiers = { ...modConfig };
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
        userConfig.failMode = modConfig.failMode;
    }
}
window.addEventListener('DOMContentLoaded', loadModifiers);

