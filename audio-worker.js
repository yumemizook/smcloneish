/**
 * Audio Worker for WebSM
 * Offloads audio decoding and processing to a Web Worker
 * Prevents main thread blocking during audio decode
 */

self.onmessage = async function(e) {
    const { type, audioData, sampleRate, id } = e.data;

    if (type === 'decode') {
        try {
            // Check if we can decode in worker (Web Audio API may not be available)
            const canDecodeInWorker = typeof OfflineAudioContext !== 'undefined' ||
                                     typeof AudioContext !== 'undefined';

            if (!canDecodeInWorker) {
                // Return raw data to main thread for decoding
                self.postMessage({
                    type: 'decodeInMain',
                    id: id,
                    audioData: audioData,
                    sampleRate: sampleRate,
                    message: 'Web Audio API not available in worker'
                }, [audioData]);
                return;
            }

            // Decode the audio data in the worker
            const audioBuffer = await decodeAudioData(audioData, sampleRate);

            // Transfer the decoded buffer back to main thread
            // Note: AudioBuffer can't be transferred directly, so we send the raw data
            // and the main thread will reconstruct it
            const channelDataArrays = [];
            const channelData = [];

            for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                const data = audioBuffer.getChannelData(i);
                // Create a copy that can be transferred
                const copy = new Float32Array(data);
                channelData.push(copy);
                channelDataArrays.push(copy.buffer);
            }

            self.postMessage({
                type: 'decoded',
                id: id,
                success: true,
                channels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate,
                length: audioBuffer.length,
                duration: audioBuffer.duration,
                channelData: channelData
            }, channelDataArrays);

        } catch (err) {
            self.postMessage({
                type: 'error',
                id: id,
                success: false,
                error: err.message
            });
        }
    }
};

/**
 * Custom audio decoder using Web Audio API in worker context
 * Falls back to manual decode if AudioContext not available in worker
 */
async function decodeAudioData(arrayBuffer, preferredSampleRate = 48000) {
    // Try to use OfflineAudioContext for decoding in worker
    if (typeof OfflineAudioContext !== 'undefined') {
        // First, we need to determine the audio format
        // We'll use a temporary context to decode
        const tempCtx = new OfflineAudioContext(1, 1, preferredSampleRate);

        try {
            const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
            return audioBuffer;
        } catch (e) {
            // If decoding fails, try with default sample rate
            console.warn('[AudioWorker] Decode with preferred rate failed, trying default');
        }
    }

    // Manual PCM decode for WAV files (common in rhythm games)
    // This provides faster decode for known formats
    try {
        const wavBuffer = decodeWav(arrayBuffer);
        if (wavBuffer) return wavBuffer;
    } catch (e) {
        console.warn('[AudioWorker] Manual WAV decode failed:', e);
    }

    // Last resort: try to decode with any available context
    if (typeof AudioContext !== 'undefined') {
        const ctx = new AudioContext({ sampleRate: preferredSampleRate });
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        ctx.close();
        return audioBuffer;
    }

    throw new Error('No audio decoding method available in worker');
}

/**
 * Extract channel data from AudioBuffer for transfer
 */
function extractChannelData(audioBuffer) {
    const channelData = [];
    const transferableArrays = [];

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const data = audioBuffer.getChannelData(i);
        // Create a copy that can be transferred
        const copy = new Float32Array(data);
        channelData.push(copy);
        transferableArrays.push(copy.buffer);
    }

    // Store for transfer
    audioBuffer.channelDataArrays = transferableArrays;
    return channelData;
}

/**
 * Fast WAV decoder for uncompressed audio
 * Rhythm games often use WAV/OGG - WAV can be decoded faster manually
 */
function decodeWav(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    const decoder = new TextDecoder();

    // Check RIFF header
    const riff = decoder.decode(new Uint8Array(arrayBuffer, 0, 4));
    if (riff !== 'RIFF') return null;

    // Check WAVE format
    const wave = decoder.decode(new Uint8Array(arrayBuffer, 8, 4));
    if (wave !== 'WAVE') return null;

    // Parse fmt chunk
    let offset = 12;
    while (offset < arrayBuffer.byteLength) {
        const chunkId = decoder.decode(new Uint8Array(arrayBuffer, offset, 4));
        const chunkSize = dataView.getUint32(offset + 4, true);

        if (chunkId === 'fmt ') {
            const audioFormat = dataView.getUint16(offset + 8, true);
            const numChannels = dataView.getUint16(offset + 10, true);
            const sampleRate = dataView.getUint32(offset + 12, true);
            const bitsPerSample = dataView.getUint16(offset + 22, true);

            // Only support PCM (1) and float (3) formats
            if (audioFormat !== 1 && audioFormat !== 3) return null;

            // Find data chunk
            let dataOffset = offset + 8 + chunkSize;
            while (dataOffset < arrayBuffer.byteLength) {
                const dataChunkId = decoder.decode(new Uint8Array(arrayBuffer, dataOffset, 4));
                const dataChunkSize = dataView.getUint32(dataOffset + 4, true);

                if (dataChunkId === 'data') {
                    // Extract audio data
                    const samples = dataChunkSize / (numChannels * bitsPerSample / 8);

                    // Create a mock AudioBuffer-like object
                    const channelData = [];
                    const bytesPerSample = bitsPerSample / 8;
                    const dataStart = dataOffset + 8;

                    for (let ch = 0; ch < numChannels; ch++) {
                        const channel = new Float32Array(samples);
                        for (let i = 0; i < samples; i++) {
                            const pos = dataStart + (i * numChannels + ch) * bytesPerSample;
                            if (bitsPerSample === 16) {
                                channel[i] = dataView.getInt16(pos, true) / 32768;
                            } else if (bitsPerSample === 24) {
                                const val = (dataView.getUint8(pos) |
                                            (dataView.getUint8(pos + 1) << 8) |
                                            (dataView.getInt8(pos + 2) << 16));
                                channel[i] = val / 8388608;
                            } else if (bitsPerSample === 32) {
                                if (audioFormat === 3) {
                                    // Float
                                    channel[i] = dataView.getFloat32(pos, true);
                                } else {
                                    // Int32
                                    channel[i] = dataView.getInt32(pos, true) / 2147483648;
                                }
                            } else if (bitsPerSample === 8) {
                                channel[i] = (dataView.getUint8(pos) - 128) / 128;
                            }
                        }
                        channelData.push(channel);
                    }

                    // Return mock AudioBuffer
                    return {
                        numberOfChannels: numChannels,
                        sampleRate: sampleRate,
                        length: samples,
                        duration: samples / sampleRate,
                        getChannelData: (ch) => channelData[ch],
                        channelDataArrays: channelData.map(c => c.buffer)
                    };
                }
                dataOffset += 8 + dataChunkSize;
            }
        }
        offset += 8 + chunkSize;
    }

    return null;
}
