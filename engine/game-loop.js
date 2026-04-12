/**
 * GameLoop - Per-frame scheduler for WebSM
 *
 * Drives one logic tick and one render call per display frame.
 * Game logic is audio-time-driven (not fixed-step physics), so we run
 * onTick once per rAF with the real frame delta, then onRender.
 *
 * Public API:
 *   GameLoop.start(opts)          — Begin the loop
 *   GameLoop.stop()               — Stop the loop (cancelAnimationFrame)
 *   GameLoop.requestSingleFrame() — Run exactly one frame then stop (replay step)
 *   GameLoop.onTick  = fn         — fn(frameDeltaMs, timestamp) — game logic
 *   GameLoop.onRender = fn        — fn(frameDeltaMs, timestamp) — rendering + HUD
 *   GameLoop.onPauseGuard = fn    — fn() → bool — return true to skip this frame
 *
 * Stats:
 *   GameLoop.stats.fps            — frames in last second
 *   GameLoop.stats.frameTime      — last frame delta (ms)
 */
(function () {
    'use strict';

    const GameLoop = {
        // --- State ---
        _running: false,
        _rafId: null,
        _lastTimestamp: 0,
        _singleFrame: false,

        // --- Callbacks ---
        onTick: null,           // function(dtMs, timestamp)
        onRender: null,         // function(dtMs, timestamp)
        onPauseGuard: null,     // function() → bool (true = skip frame)

        // --- Stats ---
        stats: {
            fps: 0,
            frameTime: 0,
            _fpsFrames: 0,
            _lastStatTime: 0
        },

        // =============================================
        //  CONTROL
        // =============================================

        /**
         * Start the game loop.
         */
        start: function () {
            if (this._running) return;
            this._running = true;
            this._lastTimestamp = performance.now();
            this.stats._lastStatTime = this._lastTimestamp;
            this.stats._fpsFrames = 0;
            this._scheduleFrame();
            console.log('[GameLoop] Started');
        },

        stop: function () {
            this._running = false;
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
        },

        /** Run exactly one frame (for replay stepping while paused). */
        requestSingleFrame: function () {
            this._singleFrame = true;
            if (!this._running) {
                this._lastTimestamp = performance.now();
                this._scheduleFrame();
            }
        },

        // =============================================
        //  MAIN FRAME
        // =============================================

        _scheduleFrame: function () {
            this._rafId = requestAnimationFrame((ts) => this._frame(ts));
        },

        _frame: function (timestamp) {
            // --- Pause guard ---
            if (this.onPauseGuard && this.onPauseGuard()) {
                // Single-frame step override
                if (this._singleFrame) {
                    this._singleFrame = false;
                    // fall through — run this one frame
                } else {
                    if (this._running) this._scheduleFrame();
                    return;
                }
            }

            const dt = timestamp - this._lastTimestamp;
            this._lastTimestamp = timestamp;
            this.stats.frameTime = dt;

            // --- Drain InputEngine gamepad events ---
            if (window.InputEngine && window.InputEngine._gamepadPollActive) {
                window.InputEngine.poll();
            }

            // --- Logic tick (once per frame) ---
            if (this.onTick) {
                this.onTick(dt, timestamp);
            }

            // --- Render ---
            if (this.onRender) {
                this.onRender(dt, timestamp);
            }

            // --- Stats ---
            this.stats._fpsFrames++;
            if (timestamp - this.stats._lastStatTime >= 1000) {
                this.stats.fps = this.stats._fpsFrames;
                this.stats._fpsFrames = 0;
                this.stats._lastStatTime = timestamp;
            }

            // --- Next frame ---
            if (this._running) {
                this._scheduleFrame();
            }
        }
    };

    // Expose globally
    window.GameLoop = GameLoop;
})();
