/**
 * Gamepad API Support for WebSM
 * Provides low-latency controller input for rhythm gameplay
 */

(function() {
    'use strict';

    // Gamepad state tracking
    const GamepadManager = {
        // Connected gamepads (indexed by gamepad.index)
        gamepads: new Map(),

        // Button state tracking (to detect presses vs holds)
        prevButtonState: new Map(),

        // Configuration - maps gamepad buttons to columns (0-3)
        // Default: D-pad directions mapped to columns
        buttonMap: {
            12: 0, // D-pad Up -> Column 0 (Left)
            13: 1, // D-pad Down -> Column 1 (Down)
            14: 2, // D-pad Left -> Column 2 (Up) - or customize
            15: 3  // D-pad Right -> Column 3 (Right)
        },

        // Alternative mapping for Xbox/PlayStation controllers
        altButtonMap: {
            0: 0,  // A/Cross -> Column 0
            1: 1,  // B/Circle -> Column 1
            2: 2,  // X/Square -> Column 2
            3: 3   // Y/Triangle -> Column 3
        },

        useAltMapping: false,

        // Active flag
        enabled: true,

        // Polling reference
        pollId: null,

        // Deadzone for analog axes (if used as buttons)
        axisDeadzone: 0.5,

        // Callback function for input events
        onInput: null,

        // Initialize gamepad support
        init: function() {
            if (!('getGamepads' in navigator)) {
                console.log('[Gamepad] API not supported in this browser');
                return false;
            }

            // Listen for connection events
            window.addEventListener('gamepadconnected', (e) => {
                console.log(`[Gamepad] Connected: ${e.gamepad.id}`);
                this.gamepads.set(e.gamepad.index, e.gamepad);
                this.prevButtonState.set(e.gamepad.index, new Array(e.gamepad.buttons.length).fill(false));
                this.showNotification(`Controller Connected: ${e.gamepad.id}`);
            });

            window.addEventListener('gamepaddisconnected', (e) => {
                console.log(`[Gamepad] Disconnected: ${e.gamepad.id}`);
                this.gamepads.delete(e.gamepad.index);
                this.prevButtonState.delete(e.gamepad.index);
                this.showNotification(`Controller Disconnected`);
            });

            // Check for already-connected gamepads (some browsers don't fire events for existing)
            this.scanGamepads();

            // Start polling loop
            this.startPolling();

            console.log('[Gamepad] Manager initialized');
            return true;
        },

        // Scan for connected gamepads
        scanGamepads: function() {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp && !this.gamepads.has(gp.index)) {
                    console.log(`[Gamepad] Found existing: ${gp.id}`);
                    this.gamepads.set(gp.index, gp);
                    this.prevButtonState.set(gp.index, new Array(gp.buttons.length).fill(false));
                }
            }
        },

        // Start the polling loop (for button state detection)
        startPolling: function() {
            if (this.pollId) return;

            const poll = () => {
                if (!this.enabled) return;
                this.update();
                this.pollId = requestAnimationFrame(poll);
            };
            this.pollId = requestAnimationFrame(poll);
        },

        // Stop polling
        stopPolling: function() {
            if (this.pollId) {
                cancelAnimationFrame(this.pollId);
                this.pollId = null;
            }
        },

        // Update button states and detect presses/releases
        update: function() {
            const gamepads = navigator.getGamepads();
            const activeMap = this.useAltMapping ? this.altButtonMap : this.buttonMap;

            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (!gp) continue;

                const prevState = this.prevButtonState.get(gp.index);
                if (!prevState) continue;

                // Check mapped buttons
                for (const [buttonIndex, colIndex] of Object.entries(activeMap)) {
                    const btn = gp.buttons[buttonIndex];
                    const pressed = btn && (btn.pressed || btn.value > 0.5);
                    const wasPressed = prevState[buttonIndex];

                    // Detect press (rising edge)
                    if (pressed && !wasPressed) {
                        this.handleButtonDown(colIndex, gp.index);
                    }
                    // Detect release (falling edge)
                    else if (!pressed && wasPressed) {
                        this.handleButtonUp(colIndex, gp.index);
                    }

                    prevState[buttonIndex] = pressed;
                }

                // Check analog axes as buttons (D-pad on some controllers reports as axes)
                // Typically axis 6 and 7 are the D-pad on modern controllers
                if (gp.axes.length >= 8) {
                    this.checkAxisAsButton(gp, 6, 7, activeMap, prevState);
                }
            }
        },

        // Check analog axes as digital buttons (for D-pad reporting as axes)
        checkAxisAsButton: function(gp, axisH, axisV, activeMap, prevState) {
            // Axis values: -1 to 1, 0 is neutral
            const hVal = gp.axes[axisH]; // Horizontal: -1 = left, 1 = right
            const vVal = gp.axes[axisV]; // Vertical: -1 = up, 1 = down

            // Map axis directions to virtual buttons (using indices 100+ to avoid collision)
            const virtualButtons = {
                [100]: vVal < -this.axisDeadzone, // Up (axis index 100)
                [101]: vVal > this.axisDeadzone,  // Down (axis index 101)
                [102]: hVal < -this.axisDeadzone, // Left (axis index 102)
                [103]: hVal > this.axisDeadzone   // Right (axis index 103)
            };

            // Map to columns if configured
            const axisMap = {
                100: activeMap[12], // Up
                101: activeMap[13], // Down
                102: activeMap[14], // Left
                103: activeMap[15]  // Right
            };

            for (const [vBtn, pressed] of Object.entries(virtualButtons)) {
                const colIndex = axisMap[vBtn];
                if (colIndex === undefined) continue;

                const vIdx = parseInt(vBtn);
                const wasPressed = prevState[vIdx] || false;

                if (pressed && !wasPressed) {
                    this.handleButtonDown(colIndex, gp.index);
                } else if (!pressed && wasPressed) {
                    this.handleButtonUp(colIndex, gp.index);
                }

                prevState[vIdx] = pressed;
            }
        },

        // Handle button press
        handleButtonDown: function(colIndex, gamepadIndex) {
            if (this.onInput) {
                this.onInput('down', colIndex, gamepadIndex);
            }
        },

        // Handle button release
        handleButtonUp: function(colIndex, gamepadIndex) {
            if (this.onInput) {
                this.onInput('up', colIndex, gamepadIndex);
            }
        },

        // Set button mapping
        setButtonMap: function(map) {
            this.buttonMap = { ...this.buttonMap, ...map };
        },

        // Toggle between D-pad and face button mapping
        toggleMapping: function() {
            this.useAltMapping = !this.useAltMapping;
            const name = this.useAltMapping ? 'Face Buttons (A/B/X/Y)' : 'D-Pad';
            this.showNotification(`Controller: ${name} mode`);
            return this.useAltMapping;
        },

        // Get connected gamepad count
        getCount: function() {
            return this.gamepads.size;
        },

        // Check if any gamepad is connected
        isConnected: function() {
            return this.gamepads.size > 0;
        },

        // Show notification
        showNotification: function(msg) {
            // Create or update notification element
            let el = document.getElementById('gamepad-notification');
            if (!el) {
                el = document.createElement('div');
                el.id = 'gamepad-notification';
                el.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: rgba(0, 229, 255, 0.9);
                    color: #000;
                    padding: 10px 20px;
                    border-radius: 4px;
                    font-family: 'Mochiy Pop One', sans-serif;
                    font-size: 14px;
                    z-index: 10000;
                    transition: opacity 0.3s;
                    pointer-events: none;
                `;
                document.body.appendChild(el);
            }

            el.textContent = msg;
            el.style.opacity = '1';

            // Fade out after 3 seconds
            clearTimeout(this._notifTimeout);
            this._notifTimeout = setTimeout(() => {
                el.style.opacity = '0';
            }, 3000);
        },

        // Get diagnostic info
        getDiagnostics: function() {
            const pads = [];
            this.gamepads.forEach((gp, idx) => {
                pads.push({
                    index: idx,
                    id: gp.id,
                    mapping: gp.mapping,
                    buttons: gp.buttons.length,
                    axes: gp.axes.length
                });
            });
            return pads;
        }
    };

    // Expose to global scope
    window.GamepadManager = GamepadManager;
})();
