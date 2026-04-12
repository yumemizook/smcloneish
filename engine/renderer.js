/**
 * Renderer - Unified visual engine for WebSM
 *
 * Wraps the existing GameplayRenderer (PixiJS WebGL) and Canvas 2D
 * fallback behind a single render dispatch API. Decouples the rendering
 * call from game-loop logic so the two can tick at independent rates.
 *
 * Public API:
 *   Renderer.init(canvas)           — Set up WebGL or Canvas 2D
 *   Renderer.beginFrame()           — Prepare for a new frame
 *   Renderer.renderGameplay(data)   — Draw receptors + notes + effects
 *   Renderer.resize()               — Handle window resize
 *   Renderer.destroy()              — Clean up
 *
 * Delegates to the existing GameplayRenderer (WebGL) when available,
 * and falls back to Canvas 2D draw functions otherwise.
 */
(function () {
    'use strict';

    const Renderer = {
        // --- State ---
        canvas: null,
        ctx: null,
        webglRenderer: null,   // Reference to GameplayRenderer instance
        useWebGL: false,
        _initialized: false,

        // --- Frame timing (for requestVideoFrameCallback) ---
        _useRVFC: false,       // requestVideoFrameCallback available?
        _rafId: null,
        _renderCallback: null, // External render callback

        // =============================================
        //  INITIALIZATION
        // =============================================

        /**
         * Initialize the renderer.
         * @param {HTMLCanvasElement} canvasEl — The Canvas 2D element
         * @param {GameplayRenderer} webglRendererInstance — The PixiJS renderer
         * @returns {boolean} true if WebGL is active
         */
        init: function (canvasEl, webglRendererInstance) {
            this.canvas = canvasEl;
            this.ctx = canvasEl.getContext('2d');
            this.webglRenderer = webglRendererInstance;

            // Try to init WebGL
            if (webglRendererInstance && !webglRendererInstance.app) {
                const ok = webglRendererInstance.init(canvasEl);
                if (ok) {
                    this.useWebGL = true;
                    console.log('[Renderer] WebGL active (PixiJS)');
                } else {
                    console.log('[Renderer] Canvas 2D fallback');
                }
            } else if (webglRendererInstance && webglRendererInstance.useWebGL) {
                this.useWebGL = true;
            }

            // Check for requestVideoFrameCallback
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
                this._useRVFC = true;
            }

            this._initialized = true;
            return this.useWebGL;
        },

        // =============================================
        //  RENDER LOOP MANAGEMENT
        // =============================================

        /**
         * Start a render loop that calls `callback` each frame.
         * Uses requestVideoFrameCallback when available for tighter
         * V-Sync alignment, otherwise requestAnimationFrame.
         *
         * @param {Function} callback — called with (timestamp)
         */
        startRenderLoop: function (callback) {
            this._renderCallback = callback;
            this._scheduleFrame();
        },

        stopRenderLoop: function () {
            this._renderCallback = null;
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
        },

        _scheduleFrame: function () {
            if (!this._renderCallback) return;

            this._rafId = requestAnimationFrame((ts) => {
                if (this._renderCallback) {
                    this._renderCallback(ts);
                }
                this._scheduleFrame();
            });
        },

        // =============================================
        //  FRAME RENDERING
        // =============================================

        /**
         * Render a full gameplay frame.
         *
         * @param {Object} data
         * @param {Array}   data.visibleNotes  — Notes to draw
         * @param {number[]} data.rotations    — Per-column rotation degrees
         * @param {number}  data.currentTime   — Song time in seconds
         * @param {Object}  data.gameConfig    — { receptorY, scrollSpeed, columnWidth, arrowSize }
         * @param {Object}  data.gameState     — Game state reference
         * @param {Object}  data.userConfig    — User config reference
         * @param {Object}  data.modConfig     — Modifier config reference
         * @param {Object}  data.assets        — Asset references
         * @returns {boolean} true if rendered successfully
         */
        renderGameplay: function (data) {
            if (!this._initialized) return false;

            // Try WebGL first
            if (this.useWebGL && this.webglRenderer && this.webglRenderer.app) {
                this.webglRenderer.enable();
                return this.webglRenderer.render(
                    data.visibleNotes,
                    data.rotations,
                    data.currentTime
                );
            }

            // Canvas 2D fallback
            this.webglRenderer && this.webglRenderer.disable();
            this._renderCanvas2D(data);
            return true;
        },

        /** Canvas 2D fallback rendering (delegates to existing draw functions) */
        _renderCanvas2D: function (data) {
            if (!this.ctx || !this.canvas) return;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Receptors
            this.ctx.save();
            for (let i = 0; i < 4; i++) {
                if (typeof drawReceptor === 'function') {
                    drawReceptor(
                        i * data.gameConfig.columnWidth,
                        data.gameConfig.receptorY,
                        data.rotations[i],
                        i
                    );
                }
            }
            this.ctx.restore();

            // Notes (batched)
            if (typeof renderNotesBatched === 'function') {
                renderNotesBatched(data.visibleNotes, data.rotations, data.currentTime);
            }
        },

        // =============================================
        //  RESIZE
        // =============================================

        resize: function () {
            if (this.canvas) {
                this.canvas.height = window.innerHeight;
                this.canvas.width = this.canvas.height * 0.625;
            }
            if (this.useWebGL && this.webglRenderer) {
                this.webglRenderer.resize();
            }
        },

        // =============================================
        //  LIFECYCLE
        // =============================================

        destroy: function () {
            this.stopRenderLoop();
            if (this.webglRenderer) {
                this.webglRenderer.destroy();
            }
            this._initialized = false;
            console.log('[Renderer] Destroyed');
        }
    };

    // Expose globally
    window.Renderer = Renderer;
})();
