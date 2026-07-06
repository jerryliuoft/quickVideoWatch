class SilenceWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameCount = 0;
    this.peakVolume = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // Copy input to output so the user can actually hear the audio
    if (input && output) {
      for (let channel = 0; channel < input.length; ++channel) {
        if (input[channel] && output[channel]) {
          output[channel].set(input[channel]);
        }
      }
    }

    // If no input or no channel data, just continue
    if (!input || !input[0]) return true;

    const channelData = input[0];
    let sumSquares = 0.0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    
    const rms = Math.sqrt(sumSquares / channelData.length);
    
    if (rms > this.peakVolume) {
        this.peakVolume = rms;
    }

    this.frameCount++;
    
    // 128 samples per frame. At 44.1kHz, 17 frames is ~50ms.
    if (this.frameCount >= 17) {
      const db = 20 * Math.log10(this.peakVolume || 0.0001);
      
      this.port.postMessage({
        rms: this.peakVolume,
        db: db
      });
      
      this.frameCount = 0;
      this.peakVolume = 0;
    }

    return true;
  }
}

registerProcessor('silence-worklet', SilenceWorkletProcessor);
