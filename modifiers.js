/* =========================================
   MODIFIERS STATE & LOGIC
   ========================================= */

const modConfig = {
    rate: 1.0,
    scrollSpeed: 650,
    scrollDirection: 'up', // 'up' or 'down' (mapped to screen setting)
    turn: 'none' // 'none', 'mirror', 'shuffle', 'left', 'right'
};

/* =========================================
   UI HANDLERS
   ========================================= */

function openModifiers() {
    document.getElementById('modifiers-modal').style.display = 'flex';
    updateModifiersUI();
}

function closeModifiers() {
    document.getElementById('modifiers-modal').style.display = 'none';
    saveModifiers();
}

function updateModifiersUI() {
    // Rate
    document.getElementById('mod-rate-display').innerText = modConfig.rate.toFixed(2) + "x";

    // Scroll Speed
    document.getElementById('mod-scroll-display').innerText = modConfig.scrollSpeed;

    // Direction
    updateToggle('mod-scroll-dir', modConfig.scrollDirection);

    // Turn (Random)
    updateToggle('mod-turn', modConfig.turn);
}

function updateToggle(id, val) {
    const group = document.getElementById(id);
    if (!group) return;
    const btns = group.querySelectorAll('.mod-toggle-btn');
    btns.forEach(btn => {
        if (btn.dataset.val === val) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function changeRate(delta) {
    modConfig.rate = Math.round((modConfig.rate + delta) * 100) / 100;
    if (modConfig.rate < 0.7) modConfig.rate = 0.7;
    if (modConfig.rate > 3.0) modConfig.rate = 3.0;
    updateModifiersUI();
}

function changeScroll(delta) {
    modConfig.scrollSpeed += delta;
    if (modConfig.scrollSpeed < 100) modConfig.scrollSpeed = 100;
    if (modConfig.scrollSpeed > 2000) modConfig.scrollSpeed = 2000;
    updateModifiersUI();
}

// Global hook for toggles
function setModifier(type, val) {
    if (type === 'direction') modConfig.scrollDirection = val;
    if (type === 'turn') modConfig.turn = val;
    updateModifiersUI();
}

function saveModifiers() {
    // Persist to local storage if needed, or just keep in session
    localStorage.setItem('webSM_modifiers', JSON.stringify(modConfig));
    // Sync with gameConfig if necessary (e.g. scroll settings)
    if (typeof userConfig !== 'undefined') {
        userConfig.scrollTime = modConfig.scrollSpeed;
        userConfig.downScroll = (modConfig.scrollDirection === 'down');
        saveUserConfig(); // Assume this exists in game.js or we add it
    }
}

function loadModifiers() {
    const saved = localStorage.getItem('webSM_modifiers');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(modConfig, parsed);
        } catch (e) { }
    }
    // Sync from userConfig if it was loaded first? 
    // Actually modifiers should probably override or sync bi-directionally.
    // Let's assume modifiers.js loads after game.js's config
    if (typeof userConfig !== 'undefined') {
        modConfig.scrollSpeed = userConfig.scrollTime || 650;
        modConfig.scrollDirection = userConfig.downScroll ? 'down' : 'up';
    }
}

// Initial load
// Use a timeout or wait for DOM? Called from index.html script probably.
window.addEventListener('DOMContentLoaded', loadModifiers);
