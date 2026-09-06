import { rootMeanSquare } from './engine';

export type MicrophoneState = 'off' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error';
export interface MicrophoneStatus { state: MicrophoneState; message: string }

interface InputSession {
  stream: MediaStream;
  audio?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  analyser?: AnalyserNode;
  samples?: Float32Array<ArrayBuffer>;
  onEnded?: () => void;
  onAudioState?: () => void;
  stopped: boolean;
}

export class LocalMicrophone {
  private session: InputSession | undefined;
  private request = 0;
  private disposed = false;
  private current: MicrophoneStatus = { state: 'off', message: 'Microphone off. The garden already works with the wind button or Space.' };

  constructor(
    private readonly changed: (status: MicrophoneStatus) => void,
    private readonly report: (message: string) => void,
  ) {}

  get status(): MicrophoneStatus { return this.current; }

  private update(state: MicrophoneState, message: string): void {
    this.current = { state, message };
    if (!this.disposed) this.changed(this.current);
  }

  async enable(): Promise<void> {
    if (this.disposed || this.current.state === 'requesting' || this.current.state === 'live') return;
    if (document.hidden) {
      this.update('off', 'Microphone stays off while this page is hidden. Return and explicitly enable it if you want to listen.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      this.update('unavailable', 'Local microphone input is unavailable in this browser or connection. Use the wind button or Space.');
      return;
    }
    const request = ++this.request;
    this.update('requesting', 'Waiting for your browser permission. You can cancel; any later input will be discarded.');
    let session: InputSession | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      if (request !== this.request || this.disposed || document.hidden) {
        stream.getTracks().forEach((track) => track.stop());
        if (request === this.request && !this.disposed) this.disable('Microphone off because the page was hidden. Enable it again yourself.');
        return;
      }
      session = { stream, stopped: false };
      this.session = session;
      if (!stream.getAudioTracks().length) throw new DOMException('No audio track was supplied.', 'NotFoundError');
      session.audio = new AudioContext();
      session.analyser = session.audio.createAnalyser();
      session.analyser.fftSize = 2048;
      session.samples = new Float32Array(session.analyser.fftSize);
      session.source = session.audio.createMediaStreamSource(stream);
      session.source.connect(session.analyser);
      const onEnded = () => {
        if (this.session === session) this.disable('Microphone input ended. It will not restart by itself; use the wind button or explicitly enable it again.');
      };
      session.onEnded = onEnded;
      session.onAudioState = () => {
        if (this.session === session && this.current.state === 'live' && session?.audio?.state !== 'running') {
          this.disable('Audio processing stopped. The microphone is off and will not restart by itself.');
        }
      };
      stream.getTracks().forEach((track) => track.addEventListener('ended', onEnded));
      session.audio.addEventListener('statechange', session.onAudioState);
      if (session.audio.state === 'suspended') await session.audio.resume();
      if (request !== this.request || this.disposed || document.hidden) {
        this.stopSession(session);
        if (request === this.request && !this.disposed) this.disable('Microphone off because the page was hidden. Enable it again yourself.');
        return;
      }
      if (session.audio.state !== 'running') throw new DOMException('Audio input did not start.', 'NotReadableError');
      this.update('live', 'Live, locally. Stay quiet for about one second while the room level is calibrated. Nothing is recorded or sent.');
    } catch (error) {
      if (session) this.stopSession(session);
      if (request !== this.request || this.disposed) return;
      if (!(error instanceof DOMException)) throw error;
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        this.update('denied', 'Permission was not granted. Nothing is listening. Use the wind button, or change browser permission before trying again.');
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        this.update('unavailable', 'No usable microphone was found. Nothing is listening; the wind button and Space still work.');
      } else {
        this.update('error', `The browser could not start microphone input (${error.name}). All tracks are stopped. Use the wind button or explicitly try again.`);
      }
    }
  }

  readLoudness(): number {
    const session = this.session;
    if (!session || this.current.state !== 'live' || !session.analyser || !session.samples) return 0;
    session.analyser.getFloatTimeDomainData(session.samples);
    return rootMeanSquare(session.samples);
  }

  disable(message = 'Microphone off. All input tracks and local audio processing are stopped.'): void {
    this.request += 1;
    if (this.session) this.stopSession(this.session);
    this.update('off', message);
  }

  private stopSession(session: InputSession): void {
    if (session.stopped) return;
    session.stopped = true;
    if (this.session === session) this.session = undefined;
    for (const track of session.stream.getTracks()) {
      if (session.onEnded) track.removeEventListener('ended', session.onEnded);
      track.stop();
    }
    session.source?.disconnect();
    session.samples?.fill(0);
    session.samples = undefined;
    if (session.audio) {
      if (session.onAudioState) session.audio.removeEventListener('statechange', session.onAudioState);
      if (session.audio.state !== 'closed') {
        void session.audio.close().catch((error: unknown) => {
          this.report('Microphone tracks are stopped, but the browser reported an error closing its audio processor.');
          throw error;
        });
      }
    }
  }

  destroy(): void {
    this.disposed = true;
    this.request += 1;
    if (this.session) this.stopSession(this.session);
  }
}
