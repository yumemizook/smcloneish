/* =========================================
   MODIFIERS STATE & LOGIC
   ========================================= */

const modConfig = {
    speedType: 'C',    // 'X' (Multiplier), 'C' (Constant), 'M' (Max)
    speedValue: 400,   // Value based on type (e.g. 2.0 or 400)
    scrollDirection: 'up', // 'up' or 'down'
    failMode: 'on',    // 'on', 'off', 'end'
    turn: 'none',      // 'none', 'mirror', 'shuffle'
    rate: 1.0,         // Playback Rate (0.5 - 2.0)
    pitchShift: true   // True = Vinyl/Resample (Default), False = Preserve Pitch (Time Stretch)
};

/* =========================================
   UI HANDLERS
   ========================================= */

function openModifiers() {
    const modal = document.getElementById('modifiers-modal');
    modal.style.display = 'block';

    const btn = document.getElementById('btn-modifiers');
    const panel = modal.querySelector('.modifiers-panel');

    if (btn && panel) {
        const btnRect = btn.getBoundingClientRect();
        const panelWidth = 350;

        let left = btnRect.left - panelWidth - 20;
        if (left < 10) left = 10;

        panel.style.top = 'auto';
        panel.style.bottom = (window.innerHeight - btnRect.bottom) + 'px';
        panel.style.left = left + 'px';

        modal.style.background = 'transparent';
        modal.style.pointerEvents = 'none';
        panel.style.pointerEvents = 'auto';
    }

    updateModifiersUI();
}

function closeModifiers() {
    document.getElementById('modifiers-modal').style.display = 'none';
    saveModifiers();
}

function updateModifiersUI() {
    // Speed Mod Type
    updateToggle('mod-speed-type', modConfig.speedType);

    // Speed Value Display
    let valStr = modConfig.speedValue;
    if (modConfig.speedType === 'X') valStr = modConfig.speedValue.toFixed(1) + "x";
    else if (modConfig.speedType === 'C') valStr = "C" + Math.round(modConfig.speedValue);
    else if (modConfig.speedType === 'M') valStr = "M" + Math.round(modConfig.speedValue);
    document.getElementById('mod-speed-val-display').innerText = valStr;

    // Fail Mode
    updateToggle('mod-fail', modConfig.failMode);

    // Direction
    updateToggle('mod-scroll-dir', modConfig.scrollDirection);

    // Turn
    updateToggle('mod-turn', modConfig.turn);

    // Rate Display
    const rateEl = document.getElementById('mod-rate-display');
    if (rateEl) rateEl.innerText = modConfig.rate.toFixed(2) + "x";

    // Pitch Shift Toggle
    updateToggle('mod-pitch', modConfig.pitchShift ? 'on' : 'off');
}

function updateToggle(id, val) {
    const group = document.getElementById(id);
    if (!group) return;
    const btns = group.querySelectorAll('.mod-toggle-btn');
    btns.forEach(btn => {
        if (btn.dataset.val === String(val)) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function changeSpeedVal(delta) {
    if (modConfig.speedType === 'X') {
        const step = 0.5; // X-mod step
        // Assuming HTML calls changeSpeedVal(1) or changeSpeedVal(-1).
        let change = delta > 0 ? 0.25 : -0.25;
        modConfig.speedValue = Math.max(0.25, modConfig.speedValue + change);
    } else {
        // C/M Mod Step (e.g. 25 or 50)
        let change = delta > 0 ? 25 : -25;
        modConfig.speedValue = Math.max(50, modConfig.speedValue + change);
    }
    updateModifiersUI();
}

function changeRateVal(delta) {
    const step = 0.05;
    let newRate = modConfig.rate + (delta * step);
    // Range 0.7x - 3.0x
    newRate = Math.max(0.7, Math.min(3.0, newRate));
    modConfig.rate = Math.round(newRate * 100) / 100;
    updateModifiersUI();
}
window.changeRateVal = changeRateVal;

// Global hook for toggles
function setModifier(type, val) {
    if (type === 'speedType') {
        modConfig.speedType = val;
        if (val === 'X') modConfig.speedValue = 2.0;
        else if (val === 'C') modConfig.speedValue = 400;
        else if (val === 'M') modConfig.speedValue = 400;
    }
    if (type === 'fail') modConfig.failMode = val;
    if (type === 'direction') {
        modConfig.scrollDirection = val;
        if (typeof setupCanvas === 'function') setupCanvas();
    }
    if (type === 'turn') modConfig.turn = val;
    if (type === 'pitchShift') modConfig.pitchShift = (val === 'on');
    updateModifiersUI();
}

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
            Object.assign(modConfig, parsed);
            if (!modConfig.rate) modConfig.rate = 1.0;
        } catch (e) { }
    }
    if (typeof userConfig !== 'undefined') {
        userConfig.modifiers = { ...modConfig };
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
        userConfig.failMode = modConfig.failMode;
    }
}

window.addEventListener('DOMContentLoaded', loadModifiers);
