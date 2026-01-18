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
    }
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

    // --- GAMEPLAY (Fail, Rate, Pitch) ---
    updateToggle('mod-fail', modConfig.failMode);
    document.getElementById('mod-rate-display').innerText = modConfig.rate.toFixed(2) + "x";
    updateToggle('mod-pitch', modConfig.pitchShift ? 'on' : 'off');
    updateToggle('mod-scroll-dir', modConfig.scrollDirection);

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
    // updateToggle('mod-accel', modConfig.accel.name);
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
    const step = 0.05;
    let newRate = modConfig.rate + (delta * step);
    newRate = Math.max(0.7, Math.min(3.0, newRate)); // Clamped per user request
    modConfig.rate = Math.round(newRate * 100) / 100;
    updateModifiersUI();
    if (window.onRateChange) window.onRateChange(modConfig.rate);
}
window.changeRateVal = changeRateVal;

function setModifier(cat, val, subParam) {
    // General setter
    if (cat === 'speedType') {
        modConfig.speedType = val;
        if (val === 'X') modConfig.speedValue = 2.0;
        else if (val === 'C') modConfig.speedValue = 400;
        else if (val === 'M') modConfig.speedValue = 400;
    }
    if (cat === 'fail') modConfig.failMode = val;
    if (cat === 'direction') {
        modConfig.scrollDirection = val;
        if (typeof setupCanvas === 'function') setupCanvas();
    }
    if (cat === 'pitchShift') modConfig.pitchShift = (val === 'on');

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
            ['speedType', 'speedValue', 'failMode', 'rate', 'pitchShift', 'scrollDirection', 'turn'].forEach(k => {
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

