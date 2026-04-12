/**
 * AudioEngine — Single low-latency audio subsystem for WebSM
 *
 * One AudioContext, one clock, two playback paths:
 *   • Vinyl  — AudioBufferSourceNode.playbackRate (pitch shifts with rate)
 *   • Stretch — HTMLAudioElement with preservesPitch (pitch stays constant)
 *
 * Clock priority:
 *   1. AudioWorklet SharedArrayBuffer (sample-accurate, ~5ms jitter)
 *   2. AudioContext.currentTime (vinyl) or HTMLAudioElement.currentTime (stretch)
 *
 * Public API:
 *   AudioEngine.init()                        — Create AudioContext + worklet
 *   AudioEngine.startPlayback(buffer, opts)   — Begin song playback
 *   AudioEngine.getCurrentTime(rate)          — Authoritative game clock (s)
 *   AudioEngine.pause() / resume() / stop()
 *   AudioEngine.seek(dt, rate)
 *   AudioEngine.getOutputLatency()
 *   AudioEngine.destroy()
 */
(function () {
    'use strict';

    const AudioEngine = {
        // --- Core state ---
        ctx: null,               // AudioContext (single instance)
        source: null,            // AudioBufferSourceNode (vinyl path)
        audioEl: null,           // HTMLAudioElement (stretch path)
        buffer: null,            // Decoded AudioBuffer

        // AudioWorklet timing (optional enhancement for vinyl path)
        worklet: null,
        sharedBuffer: null,
        sharedView: null,        // Float64Array [position, time, state, ...]
        workletReady: false,

        // Clock references
        startTime: 0,            // ctx.currentTime when song starts (vinyl)
        stretchStartMs: 0,       // Date.now() target for stretch countdown

        // State
        mode: 'vinyl',           // 'vinyl' | 'stretch'
        isPlaying: false,
        _startTimeout: null,

        COUNTDOWN_SEC: 3.0,

        // =============================================
        //  INIT
        // =============================================

        /** Create or reuse the single low-latency AudioContext. */
        init: function () {
            if (this.ctx) return this.ctx;

            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC({
                latencyHint: 'interactive',
                sampleRate: 48000
            });

            // Legacy global so existing code keeps working during migration
            window.audioCtx = this.ctx;

            this._tryInitWorklet();
            console.log('[AudioEngine] Init — sampleRate=48000, latency=interactive');
            return this.ctx;
        },

        /** Best-effort AudioWorklet for sample-accurate timing. */
        _tryInitWorklet: async function () {
            if (!this.ctx.audioWorklet || typeof SharedArrayBuffer === 'undefined') return;

            try {
                await this.ctx.audioWorklet.addModule('audio-worklet.js');

                this.sharedBuffer = new SharedArrayBuffer(8 * 8); // 8 Float64
                this.sharedView = new Float64Array(this.sharedBuffer);

                this.worklet = new AudioWorkletNode(this.ctx, 'timing-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    channelCount: 2
                });
                this.worklet.port.postMessage({
                    type: 'init',
                    sampleRate: this.ctx.sampleRate,
                    sharedBuffer: this.sharedBuffer
                });
                this.worklet.connect(this.ctx.destination);
                this.workletReady = true;

                console.log('[AudioEngine] AudioWorklet timing ready');
            } catch (e) {
                console.warn('[AudioEngine] AudioWorklet unavailable:', e.message);
                this.workletReady = false;
            }
        },

        // =============================================
        //  PLAYBACK
        // =============================================

        /**
         * @param {AudioBuffer} audioBuffer
         * @param {Object} opts
         * @param {number}  opts.rate       — playback rate (default 1)
         * @param {boolean} opts.pitchShift — true=vinyl (pitch changes), false=stretch (pitch preserved)
         * @param {string}  opts.audioUrl   — blob URL needed for stretch path
         * @param {number}  opts.countdown  — seconds before audio starts (default 3)
         */
        startPlayback: function (audioBuffer, opts) {
            opts = opts || {};
            const rate = opts.rate || 1.0;
            const vinyl = opts.pitchShift !== undefined ? opts.pitchShift : true;
            const countdown = opts.countdown !== undefined ? opts.countdown : this.COUNTDOWN_SEC;

            this.stop();
            this.buffer = audioBuffer;

            // Ensure context is running (may be suspended from previous pause)
            if (this.ctx.state === 'suspended') this.ctx.resume();

            // Reset worklet counters
            if (this.worklet) this.worklet.port.postMessage({ type: 'reset' });

            if (vinyl) {
                this._startVinyl(audioBuffer, rate, countdown);
            } else {
                this._startStretch(opts.audioUrl, audioBuffer, rate, countdown);
            }

            this.isPlaying = true;
        },

        // ---- Vinyl path ----
        _startVinyl: function (buf, rate, countdown) {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = rate;

            // Route through worklet for sample-accurate timing when available
            if (this.workletReady && this.worklet) {
                src.connect(this.worklet);
                // worklet already connected to destination in init
            } else {
                src.connect(this.ctx.destination);
            }

            const startAt = this.ctx.currentTime + countdown;
            src.start(startAt);

            this.source = src;
            this.startTime = startAt;
            this.mode = 'vinyl';

            // Legacy global
            window.audioSource = src;

            console.log(`[AudioEngine] Vinyl — rate=${rate}, start=ctx+${countdown}s`);
        },

        // ---- Stretch path ----
        _startStretch: function (audioUrl, buf, rate, countdown) {
            if (!audioUrl) {
                console.warn('[AudioEngine] No audioUrl for stretch — falling back to vinyl');
                return this._startVinyl(buf, rate, countdown);
            }

            const el = new Audio(audioUrl);
            el.playbackRate = rate;
            el.preservesPitch = true;

            const delayMs = countdown * 1000;
            this.stretchStartMs = Date.now() + delayMs;
            this.startTime = this.stretchStartMs;

            this._startTimeout = setTimeout(() => {
                el.play().catch(e => console.error('[AudioEngine] stretch play err:', e));
                this._startTimeout = null;
            }, delayMs);

            this.audioEl = el;
            this.mode = 'stretch';

            console.log(`[AudioEngine] Stretch — rate=${rate}, preservesPitch, start in ${countdown}s`);
        },

        // =============================================
        //  TRANSPORT
        // =============================================

        pause: function () {
            if (!this.isPlaying) return;

            if (this.mode === 'stretch' && this.audioEl) {
                this.audioEl.pause();
            } else if (this.ctx && this.ctx.state === 'running') {
                this.ctx.suspend();
            }

            if (this.worklet) this.worklet.port.postMessage({ type: 'pause' });
        },

        resume: function () {
            if (this.mode === 'stretch' && this.audioEl) {
                this.audioEl.play();
            } else if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            if (this.worklet) this.worklet.port.postMessage({ type: 'resume' });
        },

        stop: function () {
            if (this.source) {
                try { this.source.stop(); } catch (_) { }
                this.source = null;
                window.audioSource = null;
            }
            if (this.audioEl) {
                this.audioEl.pause();
                this.audioEl = null;
            }
            if (this._startTimeout) {
                clearTimeout(this._startTimeout);
                this._startTimeout = null;
            }
            if (this.worklet) this.worklet.port.postMessage({ type: 'reset' });

            this.isPlaying = false;
        },

        // =============================================
        //  CLOCK
        // =============================================

        /**
         * Single authoritative game clock.
         * @param {number} rate — Current playback rate
         * @returns {number} Song time in seconds
         */
        getCurrentTime: function (rate) {
            rate = rate || 1.0;

            // --- Stretch path: HTMLAudioElement is its own clock ---
            if (this.mode === 'stretch' && this.audioEl) {
                if (!this.audioEl.paused) return this.audioEl.currentTime;
                // Countdown phase
                if (Date.now() < this.stretchStartMs) {
                    return (Date.now() - this.stretchStartMs) / 1000 * rate;
                }
                return this.audioEl.currentTime || 0;
            }

            // --- Vinyl path ---
            // Priority 1: AudioWorklet SharedArrayBuffer (sample-accurate)
            if (this.workletReady && this.sharedView) {
                const workletTime = Atomics.load(this.sharedView, 1);
                const isActive = Atomics.load(this.sharedView, 2) === 1;
                if (isActive && workletTime > 0) {
                    return workletTime * rate;
                }
            }

            // Priority 2: AudioContext.currentTime
            if (this.ctx) {
                return (this.ctx.currentTime - this.startTime) * rate;
            }

            return 0;
        },

        /**
         * Map a DOMHighResTimeStamp (e.timeStamp / performance.now())
         * to song time. Re-calibrates the perf↔ctx offset on every call
         * to avoid drift, and subtracts output latency so input timing
         * matches what the player actually hears.
         *
         * @param {number} perfTimestamp — DOMHighResTimeStamp (ms)
         * @param {number} rate
         * @returns {number} song time in seconds
         */
        performanceTimeToSongTime: function (perfTimestamp, rate) {
            rate = rate || 1.0;

            // Stretch path: different clock basis
            if (this.mode === 'stretch' && this.audioEl) {
                // Best we can do: interpolate from current audioEl.currentTime
                // using the delta between perfTimestamp and now
                const elapsedSinceEvent = (performance.now() - perfTimestamp) / 1000;
                const elTime = this.audioEl.paused ? (this.audioEl.currentTime || 0) : this.audioEl.currentTime;
                return Math.max(0, elTime - elapsedSinceEvent * rate);
            }

            // Vinyl path: convert perf → ctx time → song time
            // Recalibrate offset every call (perf.now and ctx.currentTime
            // share a monotonic basis but can drift on low-power CPUs)
            if (this.ctx) {
                const nowPerf = performance.now() / 1000; // seconds
                const nowCtx  = this.ctx.currentTime;     // seconds
                const offset  = nowPerf - nowCtx;         // perf - ctx

                const ctxTimeAtEvent = perfTimestamp / 1000 - offset;

                // Subtract output latency: the player hears audio
                // outputLatency seconds AFTER ctx.currentTime advances,
                // so when they hit "on the beat" (what they hear), the
                // clock has already moved ahead. We subtract latency to
                // move their hit time backward (earlier) for correct judging.
                // +0.05s: empirical correction for remaining early-hit bias.
                const outLat = this.getOutputLatency();

                const songTime = (ctxTimeAtEvent - this.startTime - outLat + 0.050) * rate;

                // Sanity clamp: perfTimestamp → songTime should be close to
                // getCurrentTime(). If it diverges by >200ms, fall back to
                // the direct clock (protects against bogus e.timeStamp on
                // some browsers / iframes).
                const directTime = this.getCurrentTime(rate);
                if (Math.abs(songTime - directTime) > 0.2) {
                    return directTime;
                }

                return songTime;
            }

            return 0;
        },

        /** Hardware output latency in seconds. */
        getOutputLatency: function () {
            if (!this.ctx) return 0;
            return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
        },

        /**
         * Seek by delta seconds (for replay stepping).
         */
        seek: function (dt, rate) {
            rate = rate || 1.0;

            if (this.mode === 'stretch' && this.audioEl) {
                this.audioEl.currentTime = Math.max(0, this.audioEl.currentTime + dt);
            } else if (this.workletReady && this.worklet) {
                const cur = this.getCurrentTime(rate);
                this.worklet.port.postMessage({
                    type: 'seek',
                    position: Math.max(0, cur + dt) * rate
                });
            } else {
                // Vinyl: adjust start reference
                this.startTime -= (dt / rate);
            }
        },

        // =============================================
        //  LIFECYCLE
        // =============================================

        destroy: function () {
            this.stop();
            if (this.worklet) {
                this.worklet.disconnect();
                this.worklet = null;
                this.workletReady = false;
            }
            if (this.ctx) {
                this.ctx.close();
                this.ctx = null;
            }
            window.audioCtx = null;
        }
    };

    window.AudioEngine = AudioEngine;
})();
