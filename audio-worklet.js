/**
 * AudioWorklet for WebSM
 * Provides sample-accurate playback position tracking
 * Runs on the audio rendering thread for minimal latency
 */

class TimingProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Playback position in samples
        this.position = 0;

        // Sample rate for time calculations
        this.sampleRate = 48000;

        // Whether we're currently playing
        this.isPlaying = false;

        // Start time reference (for calculating absolute time)
        this.startTime = 0;

        // SharedArrayBuffer for communicating with main thread (if available)
        this.sharedBuffer = null;
        this.sharedView = null;

        // Handle messages from main thread
        this.port.onmessage = (e) => {
            const { type, position, sampleRate, sharedBuffer, startTime } = e.data;

            switch (type) {
                case 'init':
                    if (sampleRate) this.sampleRate = sampleRate;
                    if (sharedBuffer) {
                        this.sharedBuffer = sharedBuffer;
                        this.sharedView = new Float64Array(sharedBuffer);
                    }
                    break;

                case 'start':
                    this.isPlaying = true;
                    this.position = position || 0;
                    this.startTime = startTime || currentTime;
                    break;

                case 'stop':
                    this.isPlaying = false;
                    break;

                case 'pause':
                    this.isPlaying = false;
                    break;

                case 'resume':
                    this.isPlaying = true;
                    break;

                case 'seek':
                    this.position = position || 0;
                    break;

                case 'reset':
                    this.position = 0;
                    this.isPlaying = false;
                    this.startTime = 0;
                    break;
            }
        };
    }

    /**
     * Main processing callback - called every 128 samples
     * This runs on the audio thread, so it has very low latency
     */
    process(inputs, outputs, parameters) {
        // We don't modify audio, just track position
        // Pass through if there's input
        if (inputs.length > 0 && inputs[0].length > 0) {
            for (let ch = 0; ch < outputs[0].length; ch++) {
                if (inputs[0][ch]) {
                    outputs[0][ch].set(inputs[0][ch]);
                }
            }
        }

        if (this.isPlaying) {
            // Update position (128 samples per process callback)
            this.position += 128;

            // Update shared buffer if available
            if (this.sharedView) {
                // Position in samples at index 0
                Atomics.store(this.sharedView, 0, this.position);
                // Current time in seconds at index 1
                const timeSeconds = this.position / this.sampleRate;
                Atomics.store(this.sharedView, 1, timeSeconds);
                // Playback state at index 2 (1 = playing, 0 = stopped)
                Atomics.store(this.sharedView, 2, 1);
            }

            // Send position update to main thread (throttled)
            // Only send every ~1024 samples to avoid message overhead
            if ((this.position & 0x3FF) === 0) {
                this.port.postMessage({
                    type: 'position',
                    position: this.position,
                    time: this.position / this.sampleRate
                });
            }
        } else {
            // Not playing - update shared buffer to indicate stopped state
            if (this.sharedView) {
                Atomics.store(this.sharedView, 2, 0);
            }
        }

        // Return true to keep processor alive
        return true;
    }

    // For static allocation (optimization)
    static get parameterDescriptors() {
        return [];
    }
}

// Register the processor
registerProcessor('timing-processor', TimingProcessor);
