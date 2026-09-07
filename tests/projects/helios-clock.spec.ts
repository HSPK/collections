import { expect, test } from '@playwright/test';
import { ObservationClock } from '../../src/projects/helios/clock';
import { axisLabel, TIME_SPANS, timeAtFraction, timeFraction, timelineWindow } from '../../src/projects/helios/timeline';
import { decodeStudy, encodeStudy, initialState, StudyHistory } from '../../src/projects/helios/state';
import { MAX_TIME, MIN_TIME, parseUTC } from '../../src/projects/helios/time';
import { observationRecord } from '../../src/projects/helios/interchange';
import { observe } from '../../src/projects/helios/astronomy';
import { currentEvent } from '../../src/projects/helios/eclipse';
import { SITES } from '../../src/projects/helios/data';

const historical = parseUTC('2024-04-08T18:17:31.519Z');
const deviceNow = parseUTC('2026-09-06T12:00:00Z');

test.describe('HELIOS UTC source and timeline model', () => {
  test('manual is the default; Live follows each device sample, never elapsed frames or old anchors', () => {
    const clock = new ObservationClock(historical);
    expect(clock.mode).toBe('manual');
    expect(clock.sample(deviceNow)).toBe(historical);
    clock.live(deviceNow);
    for (const offset of [0, 250, 200000, -3000, 30 * 86400000])
      expect(clock.sample(deviceNow + offset)).toBe(deviceNow + offset);
    clock.hold(historical);
    expect(clock.sample(deviceNow + 86400000)).toBe(historical);
    expect(clock.mode).toBe('manual');
  });

  test('playback derives its time from one device anchor regardless of sampling cadence', () => {
    const dense = new ObservationClock(historical), sparse = new ObservationClock(historical);
    dense.play(historical, 300, deviceNow); sparse.play(historical, 300, deviceNow);
    for (let i = 0; i < 150; i++) dense.sample(deviceNow + i * 10);
    expect(dense.sample(deviceNow + 1500)).toBe(historical + 450000);
    expect(sparse.sample(deviceNow + 1500)).toBe(dense.sample(deviceNow + 1500));
    const at = dense.sample(deviceNow + 1500);
    dense.play(at, 30, deviceNow + 1500);
    expect(dense.sample(deviceNow + 2500)).toBe(at + 30000);
    dense.hold(at);
    expect(dense.sample(deviceNow + 999999)).toBe(at);
  });

  test('invalid clocks/rates/bounds fail without replacing the last valid source', () => {
    const clock = new ObservationClock(historical);
    expect(() => clock.live(MAX_TIME + 1)).toThrow();
    expect(clock.mode).toBe('manual'); expect(clock.sample(deviceNow)).toBe(historical);
    expect(() => clock.play(historical, NaN, deviceNow)).toThrow();
    expect(() => clock.play(historical, 2, deviceNow)).toThrow();
    expect(() => clock.sample(NaN)).toThrow();
    clock.play(MAX_TIME - 1000, 30, deviceNow);
    expect(() => clock.sample(deviceNow + 1000)).toThrow(/1900/);
    clock.hold(historical); clock.dispose();
    expect(() => clock.sample(deviceNow)).toThrow(/closed/);
    expect(() => clock.live(deviceNow)).toThrow(/closed/);
  });

  test('all five timeline spans preserve their width and remain inside 1900–2100 at both ends', () => {
    for (const span of TIME_SPANS) for (const center of [MIN_TIME, MIN_TIME + 1000, historical, MAX_TIME - 1000, MAX_TIME]) {
      const interval = timelineWindow(center, span.id);
      expect(interval.start).toBeGreaterThanOrEqual(MIN_TIME);
      expect(interval.end).toBeLessThanOrEqual(MAX_TIME);
      expect(interval.end - interval.start).toBe(span.milliseconds);
      expect(center).toBeGreaterThanOrEqual(interval.start);
      expect(center).toBeLessThanOrEqual(interval.end);
    }
    expect(() => timelineWindow(historical, 'century')).toThrow();
    expect(() => timelineWindow(Infinity, '6h')).toThrow();
  });

  test('pointer fractions and UTC instants round-trip at sub-millisecond precision before integer picking', () => {
    for (const span of TIME_SPANS) {
      const interval = timelineWindow(historical, span.id);
      for (const fraction of [0, .00001, .25, .49999, .5, .8, 1]) {
        const time = timeAtFraction(fraction, interval);
        expect(Math.abs(timeFraction(time, interval) - fraction)).toBeLessThanOrEqual(1 / span.milliseconds);
      }
      expect(timeAtFraction(-2, interval)).toBe(interval.start);
      expect(timeAtFraction(3, interval)).toBe(interval.end);
    }
    expect(() => timeAtFraction(NaN, timelineWindow(historical, '6h'))).toThrow();
    expect(() => timeAtFraction(.5, { start: historical, end: historical })).toThrow();
    expect(() => timeFraction(historical, { start: MIN_TIME - 1, end: MAX_TIME })).toThrow();
  });

  test('axis tick labels are explicit UTC and independent of browser/Node local timezone', () => {
    const previous = process.env.TZ;
    try {
      for (const zone of ['Pacific/Honolulu', 'Asia/Tokyo', 'UTC']) {
        process.env.TZ = zone;
        expect(axisLabel(historical, '6h')).toBe('18:17');
        expect(axisLabel(historical, '2d')).toBe('04-08 18:17');
        expect(axisLabel(historical, '30d')).toBe('04-08');
        expect(axisLabel(historical, '1y')).toBe('2024-04');
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });

  test('automatic clock ticks preserve a pending import owner, but explicit edits and reset revoke it', () => {
    const history = new StudyHistory(initialState()), owner = history.claim();
    for (let i = 0; i < 20; i++) history.advanceTime(deviceNow + i * 250);
    expect(history.owns(owner)).toBe(true);
    expect(history.canUndo).toBe(false);
    const imported = decodeStudy(encodeStudy({ ...initialState(), time: historical }));
    if (history.owns(owner)) history.commit(imported);
    expect(history.state).toEqual(imported);
    const next = history.claim(); history.commit({ ...history.state, site: { ...SITES[6] } });
    expect(history.owns(next)).toBe(false);
    const resetOwner = history.claim(); history.reset();
    expect(history.owns(resetOwner)).toBe(false); expect(history.state).toEqual(initialState());
    const before = history.state;
    expect(() => history.advanceTime(MAX_TIME + 1)).toThrow();
    expect(history.state).toEqual(before);
    history.dispose(); expect(() => history.advanceTime(deviceNow)).toThrow(/closed/);
  });

  test('version 1 remains an instant snapshot; saved Live metadata cannot enable a source on restore', () => {
    const state = { ...initialState(), time: historical }, snapshot = observe(historical, state.site);
    const record = observationRecord(state, snapshot, currentEvent(historical, state.site), 'live');
    const payload = JSON.parse(record);
    expect(payload.version).toBe(1);
    expect(payload.clock.capturedMode).toBe('live');
    expect(payload.clock.restoreMode).toBe('manual');
    expect(decodeStudy(record)).toEqual(state);
    payload.clock = { capturedMode: 'live', restoreMode: 'live', deviceNow: MAX_TIME * 10 };
    payload.computed = { time: 1, eclipse: { kind: 'total' } };
    const restored = decodeStudy(JSON.stringify(payload));
    const clock = new ObservationClock(restored.time);
    expect(clock.mode).toBe('manual'); expect(clock.sample(deviceNow)).toBe(historical);
    expect(restored).toEqual(state);
  });

  test('exports reject event contacts from another date or observer, not just mismatched readout times', () => {
    const state = { ...initialState(), time: historical }, snapshot = observe(historical, state.site);
    const event = currentEvent(historical, state.site)!;
    expect(() => observationRecord(state, snapshot, { ...event, day: '2024-04-09' })).toThrow(/contacts/);
    expect(() => observationRecord(state, snapshot, { ...event, site: { ...SITES[1] } })).toThrow(/contacts/);
    expect(() => observationRecord({ ...state, time: historical + 1 }, snapshot, event)).toThrow(/snapshot/);
  });
});
