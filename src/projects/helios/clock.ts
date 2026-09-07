import { validTime } from './time';

export type ClockMode = 'manual' | 'live' | 'playback';

/** Device-clock synchronization and playback anchors, independent of RAF cadence. */
export class ObservationClock {
  private source: ClockMode = 'manual';
  private anchorTime: number;
  private anchorDevice = 0;
  private rate = 1;
  private closed = false;
  constructor(time: number) { this.anchorTime = validTime(time); }
  get mode(): ClockMode { return this.source; }
  private assertOpen() { if (this.closed) throw new Error('The observation clock is closed.'); }
  sample(deviceNow: number): number {
    this.assertOpen();
    if (!Number.isFinite(deviceNow)) throw new RangeError('The device clock must return a finite UTC instant.');
    if (this.source === 'live') return validTime(deviceNow);
    if (this.source === 'playback') return validTime(this.anchorTime + (deviceNow - this.anchorDevice) * this.rate);
    return this.anchorTime;
  }
  hold(time: number): void { this.assertOpen(); this.anchorTime = validTime(time); this.source = 'manual'; }
  live(deviceNow: number): void {
    this.assertOpen(); this.anchorTime = validTime(deviceNow); this.source = 'live';
  }
  play(time: number, rate: number, deviceNow: number): void {
    this.assertOpen();
    if (![1, 30, 300, 3600, 86400, 864000].includes(rate) || !Number.isFinite(deviceNow))
      throw new RangeError('Choose a supported playback rate and a finite device-clock anchor.');
    this.anchorTime = validTime(time); this.anchorDevice = deviceNow; this.rate = rate; this.source = 'playback';
  }
  dispose(): void { this.closed = true; }
}
