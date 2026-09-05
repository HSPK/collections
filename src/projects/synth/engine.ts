import { holdGainAtTime } from '../../core/audio';
import { clonePattern, STEP_COUNT } from './data';
import type { SynthPattern, TransportState } from './types';
import { createNoiseBuffer, createVoice, SynthVoice } from './voices';

export const SCHEDULER_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_SECONDS = 0.1;
export const MAX_ACTIVE_VOICES = 48;
export const MAX_MASTER_GAIN = 0.3;

interface ScheduledStep {
  step: number;
  time: number;
}

interface AudioSession {
  context: AudioContext;
  generation: number;
  events: AbortController;
  voices: Set<SynthVoice>;
  queue: ScheduledStep[];
  nextTime: number;
  nextStep: number;
  running: boolean;
  closeStarted: boolean;
  master?: GainNode;
  limiter?: DynamicsCompressorNode;
  noise?: AudioBuffer;
  timer?: number;
  frame?: number;
  closeTimer?: number;
}

interface EngineCallbacks {
  onState: (state: TransportState, message: string) => void;
  onStep: (step: number) => void;
  onError: (message: string) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? ` (${error.message})` : '';
}

export class SynthEngine {
  private pattern: SynthPattern;
  private session?: AudioSession;
  private readonly retiring = new Set<AudioSession>();
  private generation = 0;
  private disposed = false;
  private phase: TransportState = 'stopped';

  constructor(pattern: SynthPattern, private readonly callbacks: EngineCallbacks) {
    this.pattern = clonePattern(pattern);
  }

  get state(): TransportState {
    return this.phase;
  }

  updatePattern(pattern: SynthPattern): void {
    this.pattern = clonePattern(pattern);
    const session = this.session;
    if (!session?.running || !session.master) return;
    const now = session.context.currentTime;
    for (const voice of session.voices) {
      if (pattern.tracks.some((track) => track.id === voice.track && track.muted)) voice.retire(now);
    }
    holdGainAtTime(session.master.gain, now);
    session.master.gain.setTargetAtTime(pattern.volume / 100 * MAX_MASTER_GAIN, now, 0.015);
  }

  async start(): Promise<void> {
    if (this.disposed || this.phase === 'starting' || this.phase === 'playing') return;
    if (document.hidden) {
      this.setState('stopped', 'The page is hidden. Return here and press Play to enable audio.');
      return;
    }
    for (const session of this.retiring) this.closeSession(session);
    const generation = ++this.generation;
    this.setState('starting', 'Opening audio… Stop can cancel this.');
    const Constructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) {
      this.fail('Web Audio is unavailable in this browser. You can still edit, save, and export patterns.');
      return;
    }
    let context: AudioContext;
    try {
      context = new Constructor({ latencyHint: 'interactive' });
    } catch (error) {
      this.fail(`Audio could not open${describeError(error)}. Try Play again, or keep working silently.`);
      return;
    }
    const session: AudioSession = {
      context, generation, events: new AbortController(), voices: new Set(), queue: [],
      nextTime: 0, nextStep: 0, running: false, closeStarted: false,
    };
    this.session = session;
    context.addEventListener('statechange', () => {
      if (this.isCurrent(session) && session.running && context.state !== 'running') {
        this.stop('Audio was interrupted by the browser. Press Play when you are ready.', true);
      }
    }, { signal: session.events.signal });
    try {
      await context.resume();
    } catch (error) {
      if (this.isCurrent(session)) {
        this.fail(`Audio could not start${describeError(error)}. Press Play to retry; your pattern is safe.`);
      }
      return;
    }
    if (!this.isCurrent(session)) return;
    if (document.hidden) {
      this.stop('Playback stopped while the page was hidden. Press Play to begin again.', true);
      return;
    }
    if (context.state !== 'running') {
      this.fail('The browser did not enable audio. Check its sound permissions, then press Play again.');
      return;
    }
    try {
      session.master = context.createGain();
      session.master.gain.setValueAtTime(this.pattern.volume / 100 * MAX_MASTER_GAIN, context.currentTime);
      session.limiter = context.createDynamicsCompressor();
      session.limiter.threshold.value = -10;
      session.limiter.knee.value = 6;
      session.limiter.ratio.value = 12;
      session.limiter.attack.value = 0.003;
      session.limiter.release.value = 0.08;
      session.master.connect(session.limiter);
      session.limiter.connect(context.destination);
      session.noise = createNoiseBuffer(context);
    } catch (error) {
      this.fail(`The audio graph could not be prepared${describeError(error)}. Editing and JSON export still work.`);
      return;
    }
    session.running = true;
    session.nextTime = context.currentTime + 0.05;
    this.setState('playing', 'Playing one bar on repeat. Edit any pad, or press Stop.');
    this.schedule(session);
    if (this.isCurrent(session)) this.draw(session);
  }

  stop(message = 'Stopped. Press Play to start again from step 1.', immediately = false): void {
    this.generation++;
    const session = this.session;
    this.session = undefined;
    if (session) this.retireSession(session, immediately);
    this.callbacks.onStep(-1);
    this.setState('stopped', message);
  }

  interrupt(message: string): void {
    if (this.phase === 'starting' || this.phase === 'playing') this.stop(message, true);
    for (const session of this.retiring) this.closeSession(session);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    if (this.session) this.retireSession(this.session, true);
    this.session = undefined;
    for (const session of this.retiring) this.closeSession(session);
  }

  private setState(state: TransportState, message: string): void {
    this.phase = state;
    if (!this.disposed) this.callbacks.onState(state, message);
  }

  private isCurrent(session: AudioSession): boolean {
    return !this.disposed && this.session === session && session.generation === this.generation;
  }

  private fail(message: string): void {
    this.stop(message, true);
    this.setState('error', message);
    if (!this.disposed) this.callbacks.onError(message);
  }

  private schedule(session: AudioSession): void {
    if (!this.isCurrent(session) || !session.running) return;
    if (session.context.state !== 'running' || document.hidden) {
      this.stop('Playback was interrupted. Press Play to start again.', true);
      return;
    }
    const now = session.context.currentTime;
    const stepDuration = 60 / this.pattern.tempo / 4;
    // Skip missed ticks after a stalled main thread; never burst old notes into the present.
    if (session.nextTime < now + 0.006) {
      const missed = Math.ceil((now + 0.006 - session.nextTime) / stepDuration);
      session.nextTime += missed * stepDuration;
      session.nextStep = (session.nextStep + missed) % STEP_COUNT;
    }
    while (session.nextTime < now + SCHEDULE_AHEAD_SECONDS) {
      try {
        this.scheduleAudio(session, session.nextStep, session.nextTime);
      } catch (error) {
        this.fail(`Playback stopped because a sound could not be scheduled${describeError(error)}. Your pattern is unchanged.`);
        return;
      }
      session.queue.push({ step: session.nextStep, time: session.nextTime });
      if (session.queue.length > STEP_COUNT * 2) session.queue.shift();
      session.nextStep = (session.nextStep + 1) % STEP_COUNT;
      session.nextTime += stepDuration;
    }
    session.timer = window.setTimeout(() => this.schedule(session), SCHEDULER_INTERVAL_MS);
  }

  private scheduleAudio(session: AudioSession, step: number, when: number): void {
    for (const track of this.pattern.tracks) {
      if (track.muted || !track.steps[step]) continue;
      if (session.voices.size >= MAX_ACTIVE_VOICES) session.voices.values().next().value?.dispose();
      const voice = createVoice(
        session.context, session.master!, session.noise!, track.id, this.pattern.bassNote,
        when, (ended) => session.voices.delete(ended),
      );
      session.voices.add(voice);
    }
  }

  private draw(session: AudioSession): void {
    if (!this.isCurrent(session) || !session.running) return;
    let currentStep = -1;
    // Lookahead callbacks are early. Lamps consume the queue only when audio time reaches the event.
    while (session.queue.length && session.queue[0].time <= session.context.currentTime) {
      currentStep = session.queue.shift()!.step;
    }
    if (currentStep !== -1) this.callbacks.onStep(currentStep);
    session.frame = requestAnimationFrame(() => this.draw(session));
  }

  private retireSession(session: AudioSession, immediately: boolean): void {
    window.clearTimeout(session.timer);
    cancelAnimationFrame(session.frame ?? 0);
    session.queue.length = 0;
    session.events.abort();
    const now = session.context.currentTime;
    const immediate = immediately || !session.running || session.context.state !== 'running';
    session.running = false;
    for (const voice of session.voices) voice.retire(now, immediate);
    if (immediate) {
      this.closeSession(session);
      return;
    }
    if (session.master) {
      holdGainAtTime(session.master.gain, now);
      session.master.gain.linearRampToValueAtTime(0, now + 0.015);
    }
    this.retiring.add(session);
    session.closeTimer = window.setTimeout(() => this.closeSession(session), 35);
  }

  private closeSession(session: AudioSession): void {
    window.clearTimeout(session.timer);
    window.clearTimeout(session.closeTimer);
    cancelAnimationFrame(session.frame ?? 0);
    session.events.abort();
    session.queue.length = 0;
    for (const voice of session.voices) voice.dispose();
    session.master?.disconnect();
    session.limiter?.disconnect();
    session.noise = undefined;
    this.retiring.delete(session);
    if (session.closeStarted || session.context.state === 'closed') return;
    session.closeStarted = true;
    void session.context.close().catch((error: unknown) => {
      if (!this.disposed) {
        this.callbacks.onError(`The browser could not close an audio context${describeError(error)}. Its sound sources are stopped and disconnected.`);
      }
    });
  }
}
