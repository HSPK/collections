import type { ImpulseResponse } from './ir';
import { encodeWav } from './wav';

export type SoundExample = 'click' | 'chord' | 'percussion';
export type AuditionMode = 'current' | 'reference' | 'dry';
export interface AudioStatus {
  state: 'off' | 'starting' | 'playing' | 'error' | 'unavailable';
  message: string;
}
export interface Audition {
  current: ImpulseResponse;
  reference: ImpulseResponse | null;
  mode: AuditionMode;
  example: SoundExample;
  wet: number;
  volume: number;
}
export const MAX_OUTPUT_GAIN = 0.3;
export function synthesis(example: SoundExample, sampleRate: number): Float32Array<ArrayBuffer> {
  if (!['click', 'chord', 'percussion'].includes(example) || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError('Invalid local synthesis parameters.');
  }
  const data = new Float32Array(Math.ceil(sampleRate * (example === 'chord' ? 1.45 : 0.7)));
  let seed = 7301;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    if (example === 'click') {
      data[i] = t < 0.004 ? Math.sin(Math.PI * t / 0.004) * Math.cos(2 * Math.PI * 1900 * t) * 0.7 : 0;
    } else if (example === 'chord') {
      const envelope = Math.min(1, t / 0.02) * Math.exp(-t * 3.5) * Math.min(1, (data.length - i) / (sampleRate * 0.05));
      data[i] = envelope * 0.22 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.18 * t) + Math.sin(2 * Math.PI * 329.63 * t));
    } else {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0xffffffff * 2 - 1;
      const onset = Math.min(1, t / 0.001);
      data[i] = onset * (0.42 * noise * Math.exp(-t * 45) + 0.3 * Math.sin(2 * Math.PI * 160 * t - 2 * Math.exp(-t * 30)) * Math.exp(-t * 13));
    }
  }
  return data;
}
export function impulseL1(ir: Pick<ImpulseResponse, 'samples'>): number {
  return ir.samples.reduce((sum, value) => sum + Math.abs(value), 0);
}
/** One user-initiated sound at a time. Editing, hiding and destroying revoke pending starts. */
export class RoomtoneAudio {
  readonly supported = typeof window.AudioContext === 'function';
  private context: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private source: { node: AudioBufferSourceNode; started: boolean } | null = null;
  private finishTimer = 0;
  private resumeTimer = 0;
  private cancelResume: (() => void) | null = null;
  private cancelDecode: (() => void) | null = null;
  private version = 0;
  private disposed = false;
  constructor(private readonly status: (status: AudioStatus) => void) {}

  private own<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private async impulseBuffer(context: AudioContext, ir: ImpulseResponse, version: number): Promise<AudioBuffer | null> {
    if (context.sampleRate === ir.sampleRate) {
      const buffer = context.createBuffer(1, ir.samples.length, ir.sampleRate);
      buffer.copyToChannel(ir.samples, 0);
      return buffer;
    }
    const cancelled = new Promise<null>((resolve) => { this.cancelDecode = () => resolve(null); });
    // The native WAV decoder performs band-limited conversion to the context's actual rate.
    const buffer = await Promise.race([context.decodeAudioData(encodeWav(ir)), cancelled]);
    if (!buffer || version !== this.version || this.disposed) return null;
    this.cancelDecode = null;
    if (buffer.sampleRate !== context.sampleRate) {
      throw new DOMException('The decoder did not return the active output sample rate.', 'NotSupportedError');
    }
    // A convolution kernel is a discrete sum, not a recording: preserve its transfer gain.
    const scale = ir.sampleRate / context.sampleRate;
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
    return buffer;
  }

  async play(options: Audition): Promise<void> {
    if (this.disposed) return;
    if (!this.supported) {
      this.status({ state: 'unavailable', message: 'Web Audio is unavailable in this browser. The model and WAV export still work.' });
      return;
    }
    if (!Number.isFinite(options.wet) || options.wet < 0 || options.wet > 1 ||
        !Number.isFinite(options.volume) || options.volume < 0 || options.volume > 1) throw new RangeError('Invalid audition level.');
    if (options.mode === 'reference' && !options.reference) {
      this.status({ state: 'error', message: 'Pin a reference before auditioning design B.' });
      return;
    }
    this.stop(false);
    const version = this.version;
    this.status({ state: 'starting', message: 'Opening audio for one locally synthesized example...' });
    if (version !== this.version || this.disposed) return;
    let context: AudioContext;
    try {
      context = new AudioContext({ latencyHint: 'interactive', sampleRate: options.current.sampleRate });
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      this.status({ state: 'error', message: `The audio device could not open at ${options.current.sampleRate} Hz (${error.name}). Choose another audio output or browser, or export the WAV IR.` });
      return;
    }
    this.context = context;
    try {
      const cancelled = new Promise<'cancelled'>((resolve) => { this.cancelResume = () => resolve('cancelled'); });
      const timeout = new Promise<never>((_resolve, reject) => {
        this.resumeTimer = window.setTimeout(() => reject(new DOMException('Audio permission timed out.', 'NotAllowedError')), 4000);
      });
      const result = await Promise.race([context.resume(), cancelled, timeout]);
      if (result === 'cancelled' || version !== this.version || this.disposed) return;
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = 0;
      this.cancelResume = null;
      if (context.state !== 'running') throw new DOMException('Audio is suspended.', 'NotAllowedError');
    } catch (error) {
      if (version === this.version && !this.disposed) {
        this.stop(false);
        if (error instanceof DOMException) {
          this.status({ state: 'error', message: `Audio was blocked or unavailable (${error.name}). Try Play again after allowing sound.` });
        }
      }
      if (!(error instanceof DOMException)) throw error;
      return;
    }
    try {
      const current = await this.impulseBuffer(context, options.current, version);
      if (!current || version !== this.version || this.disposed) return;
      const reference = options.reference ? await this.impulseBuffer(context, options.reference, version) : null;
      if (version !== this.version || this.disposed) return;
      const impulse = options.mode === 'reference' && reference ? reference : current;
      const source = this.own(context.createBufferSource());
      const playback = { node: source, started: false };
      this.source = playback;
      const sourceData = synthesis(options.example, context.sampleRate);
      const sourceBuffer = context.createBuffer(1, sourceData.length, context.sampleRate);
      sourceBuffer.copyToChannel(sourceData, 0);
      source.buffer = sourceBuffer;
      const convolver = this.own(context.createConvolver());
      convolver.normalize = false;
      convolver.buffer = impulse;
      const dry = this.own(context.createGain());
      const wet = this.own(context.createGain());
      const output = this.own(context.createGain());
      const limiter = this.own(context.createDynamicsCompressor());
      const wetAmount = options.mode === 'dry' ? 0 : options.wet;
      dry.gain.value = 1 - wetAmount;
      wet.gain.value = wetAmount;
      // Both actual-rate kernels set a common safety bound; neither design is normalized.
      const bound = Math.max(1, impulseL1({ samples: current.getChannelData(0) }),
        reference ? impulseL1({ samples: reference.getChannelData(0) }) : 1);
      output.gain.value = Math.min(MAX_OUTPUT_GAIN, 0.8 / bound) * options.volume;
      limiter.threshold.value = -6;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      source.connect(dry).connect(output);
      source.connect(convolver).connect(wet).connect(output);
      output.connect(limiter).connect(context.destination);
      source.start();
      playback.started = true;
      source.stop(context.currentTime + sourceBuffer.duration);
      this.finishTimer = window.setTimeout(() => {
        if (version === this.version) this.stop();
      }, (sourceBuffer.duration + impulse.duration + 0.15) * 1000);
      this.status({
        state: 'playing',
        message: `Playing once: ${options.example}, ${options.mode === 'dry' ? 'dry source' : options.mode === 'reference' ? 'B / pinned reference' : 'A / current room'}. Same gain for A and B.`,
      });
    } catch (error) {
      if (version === this.version && !this.disposed) {
        this.stop(false);
        if (error instanceof DOMException) {
          this.status({ state: 'error', message: `Audio could not prepare the ${context.sampleRate} Hz playback graph (${error.name}). Nothing is playing. Try Play again, choose another audio output, or export the WAV IR.` });
        }
      }
      if (!(error instanceof DOMException)) throw error;
    }
  }
  stop(notify = true): void {
    this.version++;
    this.cancelResume?.();
    this.cancelResume = null;
    this.cancelDecode?.();
    this.cancelDecode = null;
    window.clearTimeout(this.resumeTimer);
    window.clearTimeout(this.finishTimer);
    this.resumeTimer = 0;
    this.finishTimer = 0;
    const source = this.source;
    this.source = null;
    const nodes = this.nodes;
    this.nodes = [];
    const context = this.context;
    this.context = null;
    try {
      if (source) {
        source.node.onended = null;
        if (source.started) source.node.stop();
      }
    } finally {
      for (const node of nodes) node.disconnect();
      if (context && context.state !== 'closed') {
        void context.close().catch((error: unknown) => {
          if (!(error instanceof DOMException)) throw error;
          if (!this.disposed) this.status({ state: 'error', message: `Audio was disconnected but the device did not close (${error.name}).` });
        });
      }
    }
    if (notify && !this.disposed) this.status(this.supported
      ? { state: 'off', message: 'Sound is off. Play starts one example; nothing loops.' }
      : { state: 'unavailable', message: 'Web Audio is unavailable in this browser. The room model and WAV export still work.' });
  }
  destroy(): void {
    this.disposed = true;
    this.stop(false);
  }
}
