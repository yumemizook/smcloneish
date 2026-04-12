/**
 * InputEngine - Unified low-latency input subsystem for WebSM
 *
 * Consolidates keyboard and gamepad input behind a single timestamped
 * event queue. Uses event.timeStamp (DOMHighResTimeStamp) for sub-frame
 * input timing and polls gamepads at ~1kHz via MessageChannel.
 *
 * Public API:
 *   InputEngine.init(config)       — Start listening
 *   InputEngine.poll()             — Drain the event queue (call from game tick)
 *   InputEngine.destroy()          — Remove all listeners
 *   InputEngine.onInput = fn       — Callback: fn(event) per queued input
 *   InputEngine.setKeyMap(keys)    — Update key→column mapping
 */
(function () {
    'use strict';

    // --- Ring buffer for timestamped events ---
    const QUEUE_SIZE = 256;

    const InputEngine = {
        // --- Config ---
        keyMap: ['d', 'f', 'j', 'k'],  // key → column index
        enabled: true,

        // --- Event queue (lock-free ring buffer) ---
        _queue: new Array(QUEUE_SIZE),
        _queueHead: 0,  // next write index
        _queueTail: 0,  // next read index

        // --- Keyboard state ---
        _heldKeys: [false, false, false, false],

        // --- Gamepad ---
        _gamepadPollChannel: null,  // MessageChannel for ~1kHz polling
        _gamepadPollActive: false,
        _prevGamepadState: new Map(),
        _gamepadButtonMap: { 12: 0, 13: 1, 14: 2, 15: 3 },
        _gamepadAltMap: { 0: 0, 1: 1, 2: 2, 3: 3 },
        useAltGamepadMapping: false,
        axisDeadzone: 0.5,

        // --- Callback ---
        onInput: null,  // function({ col, type, songTime, perfTime, source })

        // --- Legacy circular buffer (kept for replay recording compat) ---
        inputBuffer: new Array(16).fill(null),
        inputBufferIndex: 0,

        // =============================================
        //  INITIALIZATION
        // =============================================

        /**
         * @param {Object} config
         * @param {string[]} config.keys - 4-element array of key names
         * @param {boolean} config.skipKeyboard — true to skip keyboard listeners
         *        (use when game.js handleInput already manages keyboard + UI state)
         */
        init: function (config) {
            if (config && config.keys) this.keyMap = config.keys;

            if (!config || !config.skipKeyboard) {
                // Keyboard listeners (capture phase for earliest access)
                this._onKeyDown = this._handleKeyboard.bind(this);
                this._onKeyUp = this._handleKeyboard.bind(this);
                window.addEventListener('keydown', this._onKeyDown, true);
                window.addEventListener('keyup', this._onKeyUp, true);
            }

            // Gamepad: use MessageChannel for ~1kHz polling
            this._startGamepadPoll();

            console.log('[InputEngine] Initialized — keys:', this.keyMap.join(','),
                config && config.skipKeyboard ? '(keyboard: external)' : '(keyboard: internal)');
        },

        /** Update the key→column mapping at runtime */
        setKeyMap: function (keys) {
            this.keyMap = keys;
        },

        // =============================================
        //  KEYBOARD
        // =============================================

        _handleKeyboard: function (e) {
            if (!this.enabled) return;

            const key = e.key.toLowerCase();
            const col = this.keyMap.indexOf(key);
            if (col === -1) return; // Not a gameplay key

            const type = e.type === 'keydown' ? 'down' : 'up';

            // Ignore repeated keydown (OS key repeat)
            if (type === 'down' && this._heldKeys[col]) return;

            this._heldKeys[col] = (type === 'down');

            this._enqueue({
                col: col,
                type: type,
                perfTime: e.timeStamp,  // DOMHighResTimeStamp (sub-ms)
                source: 'keyboard'
            });
        },

        // =============================================
        //  GAMEPAD (~1kHz POLLING)
        // =============================================

        _startGamepadPoll: function () {
            if (!('getGamepads' in navigator)) return;

            // MessageChannel trick: port.postMessage schedules a microtask
            // that fires much faster than setTimeout(0) or rAF
            this._gamepadPollChannel = new MessageChannel();
            this._gamepadPollActive = true;

            this._gamepadPollChannel.port1.onmessage = () => {
                if (!this._gamepadPollActive) return;
                this._pollGamepads();
                // Schedule next poll
                this._gamepadPollChannel.port2.postMessage(null);
            };

            // Kick off
            this._gamepadPollChannel.port2.postMessage(null);
        },

        _stopGamepadPoll: function () {
            this._gamepadPollActive = false;
            if (this._gamepadPollChannel) {
                this._gamepadPollChannel.port1.close();
                this._gamepadPollChannel.port2.close();
                this._gamepadPollChannel = null;
            }
        },

        _pollGamepads: function () {
            if (!this.enabled) return;

            const gamepads = navigator.getGamepads();
            const activeMap = this.useAltGamepadMapping
                ? this._gamepadAltMap
                : this._gamepadButtonMap;

            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (!gp) continue;

                let prev = this._prevGamepadState.get(gp.index);
                if (!prev) {
                    prev = new Array(Math.max(gp.buttons.length, 120)).fill(false);
                    this._prevGamepadState.set(gp.index, prev);
                }

                // Check mapped buttons
                for (const [btnIdx, colIdx] of Object.entries(activeMap)) {
                    const btn = gp.buttons[btnIdx];
                    const pressed = btn && (btn.pressed || btn.value > 0.5);
                    const wasPressed = prev[btnIdx];

                    if (pressed && !wasPressed) {
                        this._enqueue({
                            col: colIdx,
                            type: 'down',
                            perfTime: performance.now(),
                            source: 'gamepad'
                        });
                    } else if (!pressed && wasPressed) {
                        this._enqueue({
                            col: colIdx,
                            type: 'up',
                            perfTime: performance.now(),
                            source: 'gamepad'
                        });
                    }
                    prev[btnIdx] = pressed;
                }

                // D-pad as axes (axis 6/7 on some controllers)
                if (gp.axes.length >= 8) {
                    this._pollAxesAsButtons(gp, 6, 7, activeMap, prev);
                }
            }
        },

        _pollAxesAsButtons: function (gp, axisH, axisV, activeMap, prev) {
            const dz = this.axisDeadzone;
            const virtual = {
                100: gp.axes[axisV] < -dz,  // Up
                101: gp.axes[axisV] > dz,    // Down
                102: gp.axes[axisH] < -dz,   // Left
                103: gp.axes[axisH] > dz     // Right
            };
            const axisToCol = {
                100: activeMap[12],
                101: activeMap[13],
                102: activeMap[14],
                103: activeMap[15]
            };

            for (const [vBtn, pressed] of Object.entries(virtual)) {
                const col = axisToCol[vBtn];
                if (col === undefined) continue;
                const idx = parseInt(vBtn);
                const was = prev[idx] || false;

                if (pressed && !was) {
                    this._enqueue({ col, type: 'down', perfTime: performance.now(), source: 'gamepad' });
                } else if (!pressed && was) {
                    this._enqueue({ col, type: 'up', perfTime: performance.now(), source: 'gamepad' });
                }
                prev[idx] = pressed;
            }
        },

        // =============================================
        //  EVENT QUEUE
        // =============================================

        _enqueue: function (evt) {
            this._queue[this._queueHead] = evt;
            this._queueHead = (this._queueHead + 1) % QUEUE_SIZE;

            // If head catches tail, drop oldest
            if (this._queueHead === this._queueTail) {
                this._queueTail = (this._queueTail + 1) % QUEUE_SIZE;
            }
        },

        /**
         * Drain the event queue. Call this once per game tick.
         * For each event, calls this.onInput(evt) if set.
         * @returns {Array} Array of events drained this tick
         */
        poll: function () {
            const events = [];
            while (this._queueTail !== this._queueHead) {
                const evt = this._queue[this._queueTail];
                this._queueTail = (this._queueTail + 1) % QUEUE_SIZE;
                if (evt) {
                    events.push(evt);
                    if (this.onInput) this.onInput(evt);
                }
            }
            return events;
        },

        /**
         * Record an input event to the legacy circular buffer.
         * Called by the game layer for replay recording.
         */
        recordInput: function (col, type, gameTime, eventTimestamp) {
            this.inputBuffer[this.inputBufferIndex] = {
                col: col,
                type: type,
                gameTime: gameTime,
                timestamp: eventTimestamp
            };
            this.inputBufferIndex = (this.inputBufferIndex + 1) % this.inputBuffer.length;
        },

        // =============================================
        //  LIFECYCLE
        // =============================================

        destroy: function () {
            window.removeEventListener('keydown', this._onKeyDown, true);
            window.removeEventListener('keyup', this._onKeyUp, true);
            this._stopGamepadPoll();
            this._queueHead = 0;
            this._queueTail = 0;
            console.log('[InputEngine] Destroyed');
        }
    };

    // Expose globally
    window.InputEngine = InputEngine;
})();
