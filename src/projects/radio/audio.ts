import { holdGainAtTime } from '../../core/audio';
import { clamp, random } from '../../core/math';
import { stations } from './data';
import type { StationId } from './data';

export type RadioMode = 'off' | 'starting' | 'playing' | 'stopping' | 'unavailable' | 'error';

export interface RadioStatus {
  mode: RadioMode;
  message: string;
}

type AudioConstructor = new (options?: AudioContextOptions) => AudioContext;
type Source = OscillatorNode | AudioBufferSourceNode;
type SourceRecord = { node: Source; started: boolean; ended: boolean; end: number };

const MASTER_LIMIT = 0.28;
const MAX_VOICES = 16;
const TICK_MS = 180;
const LOOKAHEAD = 0.35;

function stationName(id: StationId): string {
  return stations.find((station) => station.id === id)!.name;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 3), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const next = random(0x404cafe);
  for (let index = 0; index < samples.length; index++) samples[index] = (next() * 2 - 1) * 0.72;
  return buffer;
}

class Voice {
  readonly output: GainNode;
  private readonly nodes = new Set<AudioNode>();
  private readonly sources = new Set<SourceRecord>();
  private readonly events = new AbortController();
  private disposed = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly onDispose: (voice: Voice) => void,
  ) {
    this.output = this.keep(context.createGain());
    this.output.gain.value = 0;
    this.output.connect(destination);
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  gain(value: number): GainNode {
    const node = this.keep(this.context.createGain());
    node.gain.value = value;
    return node;
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.6): BiquadFilterNode {
    const node = this.keep(this.context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  oscillator(
    frequency: number,
    type: OscillatorType,
    destination: AudioNode,
    start: number,
    end = Infinity,
  ): OscillatorNode {
    const node = this.keep(this.context.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    node.connect(destination);
    this.startSource(node, start, end);
    return node;
  }

  noise(buffer: AudioBuffer, destination: AudioNode, start: number, end = Infinity): void {
    const node = this.keep(this.context.createBufferSource());
    node.buffer = buffer;
    node.loop = !Number.isFinite(end);
    node.connect(destination);
    this.startSource(node, start, end);
  }

  private startSource(node: Source, start: number, end: number): void {
    const record: SourceRecord = { node, started: false, ended: false, end };
    this.sources.add(record);
    node.addEventListener('ended', () => {
      record.ended = true;
      if ([...this.sources].every((source) => source.ended)) this.destroy();
    }, { once: true, signal: this.events.signal });
    node.start(start);
    record.started = true;
    if (Number.isFinite(end)) node.stop(end);
  }

  stopAt(time: number): void {
    for (const source of this.sources) {
      if (!source.started || source.ended || time >= source.end) continue;
      source.node.stop(time);
      source.end = time;
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.stopAt(this.context.currentTime);
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
    this.sources.clear();
    this.onDispose(this);
  }
}

function envelope(voice: Voice, time: number, peak: number, duration: number, attack: number): number {
  const gain = voice.output.gain;
  gain.setValueAtTime(0, time);
  gain.linearRampToValueAtTime(clamp(peak, 0.001, 0.24), time + attack);
  gain.exponentialRampToValueAtTime(0.0001, time + duration - 0.04);
  gain.linearRampToValueAtTime(0, time + duration);
  return time + duration + 0.035;
}

function modulate(voice: Voice, parameter: AudioParam, rate: number, depth: number, time: number): void {
  const amount = voice.gain(depth);
  amount.connect(parameter);
  voice.oscillator(rate, 'sine', amount, time);
}

class Soundscape {
  private readonly output: GainNode;
  private readonly voices = new Set<Voice>();
  private readonly next: () => number;
  private scheduler = 0;
  private retirement = 0;
  private nextEvent = 0;
  private eventCount = 0;
  private retired = false;
  private disposed = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly id: StationId,
    private readonly onError: (error: unknown) => void,
  ) {
    this.next = random((Date.now() & 0x7fffffff) + stations.findIndex((station) => station.id === id) * 997);
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(destination);
  }

  private voice(build: (voice: Voice) => void): void {
    if (this.retired || this.disposed || this.voices.size >= MAX_VOICES) return;
    const voice = new Voice(this.context, this.output, (finished) => this.voices.delete(finished));
    this.voices.add(voice);
    build(voice);
  }

  start(): void {
    const now = this.context.currentTime;
    this.output.gain.setValueAtTime(0, now);
    this.output.gain.linearRampToValueAtTime(0.84, now + 0.9);
    switch (this.id) {
      case 'laundromat':
        this.voice((voice) => {
          voice.output.gain.value = 0.16;
          const soft = voice.filter('lowpass', 420);
          soft.connect(voice.output);
          const harmonic = voice.gain(0.2);
          harmonic.connect(soft);
          voice.oscillator(54, 'sine', soft, now);
          voice.oscillator(108.3, 'triangle', harmonic, now);
          modulate(voice, voice.output.gain, 0.115, 0.055, now);
        });
        this.voice((voice) => {
          voice.output.gain.value = 0.14;
          const pipes = voice.filter('lowpass', 280);
          pipes.connect(voice.output);
          voice.noise(this.noise, pipes, now);
          modulate(voice, voice.output.gain, 0.057, 0.065, now);
        });
        break;
      case 'library':
        this.voice((voice) => {
          voice.output.gain.value = 0.105;
          const glass = voice.filter('lowpass', 510);
          glass.connect(voice.output);
          const upper = voice.gain(0.36);
          upper.connect(glass);
          voice.oscillator(174.6, 'sine', glass, now);
          voice.oscillator(261.9, 'sine', upper, now);
          modulate(voice, voice.output.gain, 0.065, 0.038, now);
        });
        this.voice((voice) => {
          voice.output.gain.value = 0.16;
          const water = voice.filter('bandpass', 300, 0.7);
          const soft = voice.filter('lowpass', 720);
          water.connect(soft);
          soft.connect(voice.output);
          voice.noise(this.noise, water, now);
          modulate(voice, water.frequency, 0.041, 95, now);
        });
        break;
      case 'orbit':
        this.voice((voice) => {
          voice.output.gain.value = 0.048;
          const upper = voice.gain(0.24);
          upper.connect(voice.output);
          voice.oscillator(86, 'sine', voice.output, now);
          voice.oscillator(129.5, 'sine', upper, now);
          modulate(voice, voice.output.gain, 0.043, 0.014, now);
        });
        break;
      case 'orchard':
        this.voice((voice) => {
          voice.output.gain.value = 0.15;
          const low = voice.filter('highpass', 130, 0.5);
          const wind = voice.filter('lowpass', 660, 0.5);
          low.connect(wind);
          wind.connect(voice.output);
          voice.noise(this.noise, low, now);
          modulate(voice, voice.output.gain, 0.052, 0.10, now);
          modulate(voice, wind.frequency, 0.027, 220, now);
        });
        break;
      default: {
        const unknownStation: never = this.id;
        throw new Error(`No sound recipe for ${unknownStation}.`);
      }
    }
    this.nextEvent = now + 0.24;
    this.scheduler = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private tick(): void {
    if (this.disposed || this.retired || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextEvent > now + LOOKAHEAD) return;
    // A delayed timer produces one gesture, never a burst of missed events.
    const when = Math.max(this.nextEvent, now + 0.03);
    try {
      this.gesture(when);
      this.eventCount++;
      const gap: Record<StationId, number> = { laundromat: 2.5, library: 4.8, orbit: 4.4, orchard: 3.4 };
      this.nextEvent = when + gap[this.id] + this.next() * 2.6;
    } catch (error) {
      this.onError(error);
    }
  }

  private softNoise(time: number, peak: number, duration: number, frequency: number, attack: number): void {
    this.voice((voice) => {
      const end = envelope(voice, time, peak, duration, attack);
      const band = voice.filter('bandpass', frequency, 0.65);
      const soft = voice.filter('lowpass', frequency * 1.5, 0.5);
      band.connect(soft);
      soft.connect(voice.output);
      voice.noise(this.noise, band, time, end);
    });
  }

  private wood(time: number, frequency: number, peak: number): void {
    this.voice((voice) => {
      const end = envelope(voice, time, peak, 1.8, 0.035);
      const soft = voice.filter('lowpass', 1050, 0.5);
      const overtone = voice.gain(0.14);
      overtone.connect(soft);
      soft.connect(voice.output);
      voice.oscillator(frequency, 'triangle', soft, time, end);
      voice.oscillator(frequency * 2.71, 'sine', overtone, time, end);
    });
  }

  private gesture(time: number): void {
    switch (this.id) {
      case 'laundromat':
        this.voice((voice) => {
          const end = envelope(voice, time, 0.082, 0.9, 0.035);
          const frequency = 620 + this.next() * 220;
          const tone = voice.oscillator(frequency, 'sine', voice.output, time, end);
          tone.frequency.setValueAtTime(frequency, time);
          tone.frequency.exponentialRampToValueAtTime(290 + this.next() * 70, time + 0.22);
        });
        if (this.eventCount % 3 === 0) this.softNoise(time + 0.3, 0.17, 2.3, 420, 0.7);
        break;
      case 'library':
        this.voice((voice) => {
          const frequency = [261.6, 293.7, 349.2][Math.floor(this.next() * 3)];
          const end = envelope(voice, time, 0.115, 4.1, 0.85);
          const soft = voice.filter('lowpass', 670, 0.5);
          soft.connect(voice.output);
          const tone = voice.oscillator(frequency * 0.984, 'sine', soft, time, end);
          tone.frequency.setValueAtTime(frequency * 0.984, time);
          tone.frequency.linearRampToValueAtTime(frequency, time + 1.6);
          tone.frequency.linearRampToValueAtTime(frequency * 0.997, time + 4);
        });
        if (this.eventCount % 2 === 0) this.softNoise(time + 0.7, 0.10, 0.85, 700, 0.2);
        break;
      case 'orbit': {
        const count = this.next() > 0.55 ? 3 : 2;
        for (let packet = 0; packet < count; packet++) {
          this.voice((voice) => {
            const start = time + packet * 0.36;
            const end = envelope(voice, start, 0.046, 0.28, 0.07);
            const frequency = [392, 523.25, 659.25][Math.floor(this.next() * 3)];
            voice.oscillator(frequency, 'sine', voice.output, start, end);
          });
        }
        if (this.eventCount % 3 === 0) {
          this.voice((voice) => {
            const start = time + 1.2;
            const end = envelope(voice, start, 0.065, 3.2, 0.1);
            const second = voice.gain(0.18);
            const third = voice.gain(0.06);
            second.connect(voice.output);
            third.connect(voice.output);
            voice.oscillator(523.25, 'sine', voice.output, start, end);
            voice.oscillator(783.99, 'sine', second, start, end);
            voice.oscillator(1046.5, 'sine', third, start, end);
          });
        }
        break;
      }
      case 'orchard': {
        const frequency = [196, 246.94, 293.66, 329.63][Math.floor(this.next() * 4)];
        this.wood(time, frequency, 0.12);
        if (this.next() > 0.45) this.wood(time + 0.72, frequency * 0.75, 0.064);
        if (this.eventCount % 2 === 0) this.softNoise(time + 1, 0.075, 1.2, 950, 0.3);
        break;
      }
    }
  }

  retire(seconds: number): void {
    if (this.disposed || this.retired) return;
    this.retired = true;
    window.clearInterval(this.scheduler);
    this.scheduler = 0;
    const now = this.context.currentTime;
    holdGainAtTime(this.output.gain, now);
    this.output.gain.linearRampToValueAtTime(0, now + seconds);
    for (const voice of this.voices) voice.stopAt(now + seconds);
    this.retirement = window.setTimeout(() => this.destroy(), (seconds + 0.08) * 1000);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.scheduler);
    window.clearTimeout(this.retirement);
    this.scheduler = 0;
    this.retirement = 0;
    if (this.context.state !== 'closed') {
      holdGainAtTime(this.output.gain, this.context.currentTime);
      this.output.gain.setValueAtTime(0, this.context.currentTime);
    }
    for (const voice of [...this.voices]) voice.destroy();
    this.output.disconnect();
  }
}

export class RadioAudio {
  private readonly constructorType: AudioConstructor | undefined;
  private context: AudioContext | undefined;
  private contextEvents: AbortController | undefined;
  private master: GainNode | undefined;
  private limiter: DynamicsCompressorNode | undefined;
  private noise: AudioBuffer | undefined;
  private current: Soundscape | undefined;
  private retiring: Soundscape | undefined;
  private closePromise: Promise<void> | undefined;
  private stopTimer = 0;
  private resumeTimer = 0;
  private generation = 0;
  private wantsSound = false;
  private disposed = false;
  private station: StationId = stations[0].id;
  private volume = 0.45;
  private mode: RadioMode = 'off';

  constructor(private readonly onStatus: (status: RadioStatus) => void) {
    this.constructorType = window.AudioContext ??
      (window as Window & { webkitAudioContext?: AudioConstructor }).webkitAudioContext;
  }

  get supported(): boolean {
    return typeof this.constructorType === 'function';
  }

  get engaged(): boolean {
    return this.wantsSound || this.mode === 'stopping';
  }

  private publish(mode: RadioMode, message: string): void {
    this.mode = mode;
    if (!this.disposed) this.onStatus({ mode, message });
  }

  private gainValue(): number {
    return MASTER_LIMIT * Math.pow(this.volume, 1.5);
  }

  private prepareContext(): AudioContext {
    if (this.context?.state === 'closed') {
      this.contextEvents?.abort();
      this.contextEvents = undefined;
      this.disconnectOutput();
      this.context = undefined;
    }
    if (!this.context) {
      if (!this.constructorType) throw new Error('This browser does not support Web Audio.');
      this.context = new this.constructorType({ latencyHint: 'playback' });
    }
    const context = this.context;
    if (!this.contextEvents) {
      this.contextEvents = new AbortController();
      context.addEventListener('statechange', () => {
        if (this.context !== context || this.closePromise || this.disposed) return;
        if (this.mode === 'playing' && context.state !== 'running') {
          this.stop('Audio was interrupted. Press Listen when you are ready to return.', true);
        }
      }, { signal: this.contextEvents.signal });
    }
    if (!this.master || !this.limiter || !this.noise) {
      this.disconnectOutput();
      this.master = context.createGain();
      this.master.gain.value = 0;
      this.limiter = context.createDynamicsCompressor();
      this.limiter.threshold.value = -15;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 5;
      this.limiter.attack.value = 0.03;
      this.limiter.release.value = 0.35;
      this.master.connect(this.limiter);
      this.limiter.connect(context.destination);
      this.noise = makeNoise(context);
    }
    return context;
  }

  private buildStation(): void {
    const context = this.context!;
    const graph = new Soundscape(context, this.master!, this.noise!, this.station, (error) => {
      this.fail('The sound recipe could not continue', error);
    });
    // Own the graph before starting it so a partial initialization is also released.
    this.current = graph;
    graph.start();
  }

  async listen(id: StationId): Promise<void> {
    if (this.disposed || this.closePromise || this.wantsSound) return;
    if (!this.supported) {
      this.publish('unavailable', 'Web Audio is unavailable in this browser. All station stories and recipes are still open.');
      return;
    }
    this.station = id;
    this.wantsSound = true;
    const token = ++this.generation;
    this.clearTimers();
    this.destroyLayers();
    this.publish('starting', `Opening ${stationName(this.station)}… Stop can cancel this.`);
    this.resumeTimer = window.setTimeout(() => {
      if (token === this.generation) {
        this.fail('The browser did not start audio', new Error('The request timed out. Check your audio output or browser permissions.'));
      }
    }, 7000);
    try {
      const context = this.prepareContext();
      // This method is called only by the explicit Listen button, within its user gesture.
      await context.resume();
      if (token !== this.generation || this.disposed || this.context !== context) {
        if (!this.wantsSound) void this.suspendWhenQuiet(context, this.generation);
        return;
      }
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = 0;
      if (context.state !== 'running') throw new Error('The browser kept the audio device suspended. Please try Listen again.');
      holdGainAtTime(this.master!.gain, context.currentTime);
      this.master!.gain.linearRampToValueAtTime(this.gainValue(), context.currentTime + 0.22);
      this.buildStation();
      if (token === this.generation) {
        this.publish('playing', `Listening to ${stationName(this.station)}. Locally generated sound; no incoming broadcast.`);
      }
    } catch (error) {
      if (token === this.generation && !this.disposed) this.fail('Audio could not start', error);
    }
  }

  tune(id: StationId): void {
    this.station = id;
    if (this.disposed) return;
    if (this.mode === 'starting') {
      this.publish('starting', `Opening ${stationName(id)}… Stop can cancel this.`);
      return;
    }
    if (!this.wantsSound || this.mode !== 'playing') return;
    try {
      // At most one incoming graph and one outgoing graph may exist, even during rapid tuning.
      this.retiring?.destroy();
      this.retiring = this.current;
      this.current = undefined;
      this.retiring?.retire(0.65);
      this.buildStation();
      if (this.wantsSound) {
        this.publish('playing', `Listening to ${stationName(id)}. The previous room fades away.`);
      }
    } catch (error) {
      this.fail('The receiver could not retune', error);
    }
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volume = clamp(value, 0, 1);
    if (!this.wantsSound || !this.context || !this.master || this.context.state === 'closed') return;
    try {
      const now = this.context.currentTime;
      holdGainAtTime(this.master.gain, now);
      this.master.gain.setTargetAtTime(this.gainValue(), now, 0.075);
    } catch (error) {
      this.fail('The receiver could not change volume', error);
    }
  }

  stop(message = 'Sound is off. Press Listen to return to this room.', immediate = false): void {
    if (this.disposed) return;
    this.wantsSound = false;
    const token = ++this.generation;
    this.clearTimers();
    if (this.closePromise) return;
    const context = this.context;
    this.retiring?.destroy();
    this.retiring = undefined;
    if (this.current && context?.state === 'running' && !immediate) {
      this.retiring = this.current;
      this.current = undefined;
      this.retiring.retire(0.24);
      if (this.master) {
        holdGainAtTime(this.master.gain, context.currentTime);
        this.master.gain.linearRampToValueAtTime(0, context.currentTime + 0.24);
      }
      this.publish('stopping', 'Closing the room gently…');
      this.stopTimer = window.setTimeout(() => {
        this.stopTimer = 0;
        if (token !== this.generation) return;
        this.destroyLayers();
        this.publish('off', message);
        void this.suspendWhenQuiet(context, token);
      }, 320);
    } else {
      this.destroyLayers();
      this.mute();
      this.publish(this.supported ? 'off' : 'unavailable', message);
      if (context) void this.suspendWhenQuiet(context, token);
    }
  }

  private async suspendWhenQuiet(context: AudioContext, token: number): Promise<void> {
    if (this.context !== context || this.closePromise || this.wantsSound || context.state === 'closed') return;
    try {
      await context.suspend();
    } catch (error) {
      if (token === this.generation && !this.disposed && !this.closePromise) {
        this.publish('error', `Sound is disconnected, but the audio device could not suspend: ${errorDetail(error)}`);
      }
    }
  }

  private mute(): void {
    if (!this.master || !this.context || this.context.state === 'closed') return;
    holdGainAtTime(this.master.gain, this.context.currentTime);
    this.master.gain.setValueAtTime(0, this.context.currentTime);
  }

  private fail(operation: string, error: unknown): void {
    this.wantsSound = false;
    const token = ++this.generation;
    this.clearTimers();
    this.destroyLayers();
    this.mute();
    this.publish('error', `Sound is off. ${operation}: ${errorDetail(error)} The notebook remains available.`);
    if (this.context) void this.suspendWhenQuiet(this.context, token);
  }

  private clearTimers(): void {
    window.clearTimeout(this.stopTimer);
    window.clearTimeout(this.resumeTimer);
    this.stopTimer = 0;
    this.resumeTimer = 0;
  }

  private destroyLayers(): void {
    this.current?.destroy();
    this.retiring?.destroy();
    this.current = undefined;
    this.retiring = undefined;
  }

  private disconnectOutput(): void {
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.master = undefined;
    this.limiter = undefined;
    this.noise = undefined;
  }

  close(message = 'Sound is off after leaving the page. Press Listen to begin again.'): void {
    this.wantsSound = false;
    ++this.generation;
    this.clearTimers();
    this.destroyLayers();
    this.mute();
    this.disconnectOutput();
    this.contextEvents?.abort();
    this.contextEvents = undefined;
    if (this.closePromise) return;
    const context = this.context;
    if (!context || context.state === 'closed') {
      this.context = undefined;
      this.publish(this.supported ? 'off' : 'unavailable', message);
      return;
    }
    this.publish('stopping', 'Sound is disconnected. Closing the audio device…');
    const closeFailed = (error: unknown) => {
      this.closePromise = undefined;
      const detail = `Sound is disconnected, but the audio device could not close: ${errorDetail(error)}`;
      if (this.disposed) console.warn(`Radio 404: ${detail}`);
      else this.publish('error', detail);
    };
    try {
      this.closePromise = context.close();
      void this.closePromise.then(() => {
        if (this.context === context) this.context = undefined;
        this.closePromise = undefined;
        this.publish('off', message);
      }, closeFailed);
    } catch (error) {
      closeFailed(error);
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.close();
  }
}
