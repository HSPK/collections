import { holdGainAtTime } from '../../core/audio';
import { random } from '../../core/math';
import type { TrackId } from './types';

const RELEASE_SECONDS = 0.012;

interface Layer {
  source: AudioScheduledSourceNode;
  envelope: GainNode;
  filter?: BiquadFilterNode;
  started: boolean;
}

export class SynthVoice {
  readonly track: TrackId;
  readonly startTime: number;
  private readonly layers = new Set<Layer>();
  private readonly events = new AbortController();
  private disposed = false;
  private retiring = false;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    track: TrackId,
    when: number,
    private readonly onEnd: (voice: SynthVoice) => void,
  ) {
    this.track = track;
    this.startTime = when;
  }

  addLayer(
    source: AudioScheduledSourceNode,
    peak: number,
    duration: number,
    filter?: BiquadFilterNode,
    attack = 0.003,
  ): void {
    const envelope = this.context.createGain();
    const layer: Layer = { source, envelope, filter, started: false };
    this.layers.add(layer);
    source.connect(filter ?? envelope);
    filter?.connect(envelope);
    envelope.connect(this.destination);
    envelope.gain.setValueAtTime(0, this.startTime);
    envelope.gain.linearRampToValueAtTime(peak, this.startTime + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.startTime + duration - 0.008);
    envelope.gain.linearRampToValueAtTime(0, this.startTime + duration);
    source.addEventListener('ended', () => {
      this.disconnectLayer(layer);
      if (!this.layers.size) this.dispose();
    }, { once: true, signal: this.events.signal });
    source.start(this.startTime);
    layer.started = true;
    source.stop(this.startTime + duration + 0.005);
  }

  retire(now: number, immediately = false): void {
    if (this.disposed) return;
    if (immediately || now < this.startTime) {
      this.dispose();
      return;
    }
    if (this.retiring) return;
    this.retiring = true;
    for (const layer of this.layers) {
      holdGainAtTime(layer.envelope.gain, now);
      layer.envelope.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS);
      layer.source.stop(now + RELEASE_SECONDS + 0.003);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    for (const layer of this.layers) {
      if (layer.started) layer.source.stop(this.context.currentTime);
      this.disconnectLayer(layer);
    }
    this.onEnd(this);
  }

  private disconnectLayer(layer: Layer): void {
    layer.source.disconnect();
    layer.filter?.disconnect();
    layer.envelope.disconnect();
    this.layers.delete(layer);
  }
}

export function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate), context.sampleRate);
  const channel = buffer.getChannelData(0);
  const next = random(0x706f636b);
  for (let sample = 0; sample < channel.length; sample++) channel[sample] = next() * 2 - 1;
  return buffer;
}

interface VoiceInput {
  context: AudioContext;
  voice: SynthVoice;
  when: number;
  noise: AudioBuffer;
  bassNote: number;
}

function oscillator(context: AudioContext, type: OscillatorType, frequency: number): OscillatorNode {
  const source = context.createOscillator();
  source.type = type;
  source.frequency.value = frequency;
  return source;
}

function noiseSource(context: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function filterAt(context: AudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = 0.7;
  return filter;
}

export const VOICE_FACTORIES: Record<TrackId, (input: VoiceInput) => void> = {
  kick({ context, voice, when }) {
    const source = oscillator(context, 'sine', 145);
    source.frequency.setValueAtTime(145, when);
    source.frequency.exponentialRampToValueAtTime(48, when + 0.1);
    voice.addLayer(source, 0.28, 0.3);
  },
  snare({ context, voice, when, noise }) {
    const source = oscillator(context, 'sine', 190);
    source.frequency.setValueAtTime(190, when);
    source.frequency.exponentialRampToValueAtTime(110, when + 0.1);
    voice.addLayer(source, 0.065, 0.13);
    voice.addLayer(noiseSource(context, noise), 0.13, 0.17, filterAt(context, 'bandpass', 1_700));
  },
  hat({ context, voice, noise }) {
    voice.addLayer(noiseSource(context, noise), 0.065, 0.065, filterAt(context, 'highpass', 6_200));
  },
  bass({ context, voice, bassNote }) {
    const frequency = 440 * 2 ** ((bassNote - 69) / 12);
    voice.addLayer(oscillator(context, 'triangle', frequency), 0.13, 0.25, filterAt(context, 'lowpass', 750), 0.006);
  },
  chime({ context, voice, bassNote }) {
    const frequency = 440 * 2 ** ((bassNote + 31 - 69) / 12);
    voice.addLayer(oscillator(context, 'sine', frequency), 0.047, 0.62, undefined, 0.005);
    voice.addLayer(oscillator(context, 'sine', frequency * 2.76), 0.022, 0.39, undefined, 0.004);
  },
};

export function createVoice(
  context: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  track: TrackId,
  bassNote: number,
  when: number,
  onEnd: (voice: SynthVoice) => void,
): SynthVoice {
  const voice = new SynthVoice(context, destination, track, when, onEnd);
  try {
    VOICE_FACTORIES[track]({ context, voice, noise, bassNote, when });
  } catch (error) {
    voice.dispose();
    throw error;
  }
  return voice;
}
