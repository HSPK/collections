import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { returnToCollection } from '../helpers/navigation';
import { BANDS, LIMITS, MATERIALS, PRESETS, WALLS, cloneRoom } from '../../src/projects/roomtone/data';
import type { BandValues, Room, Wall } from '../../src/projects/roomtone/data';
import { AIR_DB_PER_METRE, SPEED_OF_SOUND, distance, estimateRoom, imageSources, pathCount, validateRoom, wallAreas } from '../../src/projects/roomtone/engine';
import { FILTER_LATENCY, FIR_LENGTH, IR_WORK_BUDGET, SAMPLE_RATE, buildImpulse, energyDecay, reflectedEnergy } from '../../src/projects/roomtone/ir';
import type { ImpulseResponse } from '../../src/projects/roomtone/ir';
import { encodeWav } from '../../src/projects/roomtone/wav';
import { MAX_OUTPUT_GAIN, synthesis } from '../../src/projects/roomtone/audio';
import type { AudioStatus, Audition, RoomtoneAudio } from '../../src/projects/roomtone/audio';

const route = './projects/roomtone/';
function uniformRoom(material: keyof typeof MATERIALS): Room {
  const room = cloneRoom(PRESETS[0].room);
  for (const wall of WALLS) room.materials[wall] = material;
  return room;
}
test('room studies are isolated, bounded, distinct and frequency-dependent', () => {
  expect(PRESETS).toHaveLength(4);
  expect(new Set(PRESETS.map((preset) => JSON.stringify(preset.room))).size).toBe(4);
  for (const preset of PRESETS) {
    expect(() => validateRoom(preset.room)).not.toThrow();
    const copy = cloneRoom(preset.room);
    copy.source.x += 0.1;
    copy.materials.west = 'glass';
    expect(copy.source.x).not.toBe(preset.room.source.x);
    expect(copy.materials).not.toBe(preset.room.materials);
  }
  for (const material of Object.values(MATERIALS)) {
    expect(material.absorption).toHaveLength(BANDS.length);
    expect(material.absorption.every((value) => value > 0 && value < 1)).toBe(true);
    expect(new Set(material.absorption).size).toBeGreaterThan(1);
  }
});

test('direct distance and delay are geometric, independent of wall materials, including coincidence', () => {
  const room = uniformRoom('stone');
  room.order = 0;
  room.source = { x: 1, y: 1, z: 1 };
  room.listener = { x: 4, y: 5, z: 1 };
  const direct = imageSources(room).paths[0];
  expect(direct.id).toBe('direct');
  expect(direct.length).toBe(5);
  expect(direct.delay).toBe(5 / SPEED_OF_SOUND);
  expect(direct.points).toEqual([room.source, room.listener]);
  expect(direct.bounces).toEqual([]);
  for (const wall of WALLS) room.materials[wall] = 'absorber';
  expect(imageSources(room).paths[0]).toEqual(direct);
  direct.amplitudes.forEach((amplitude, band) => expect(amplitude).toBeCloseTo(10 ** (-5 * AIR_DB_PER_METRE[band] / 20) / 5, 14));
  room.listener = { ...room.source };
  const coincident = imageSources(room).paths[0];
  expect(coincident.delay).toBe(0);
  expect(coincident.amplitudes).toEqual([1, 1, 1, 1, 1, 1]);
  expect(buildImpulse([coincident]).energy).toBeCloseTo(1, 7);
});

test('six first-order images hit their correct surfaces with pressure, not energy, reflection factors', () => {
  const room = cloneRoom(PRESETS[0].room);
  room.order = 1;
  const paths = imageSources(room).paths;
  expect(paths).toHaveLength(7);
  const surfaces: [string, Wall, number, number, number][] = [
    ['-1,0,0', 'west', -room.source.x, room.source.y, room.source.z],
    ['1,0,0', 'east', 2 * room.width - room.source.x, room.source.y, room.source.z],
    ['0,-1,0', 'south', room.source.x, -room.source.y, room.source.z],
    ['0,1,0', 'north', room.source.x, 2 * room.depth - room.source.y, room.source.z],
    ['0,0,-1', 'floor', room.source.x, room.source.y, -room.source.z],
    ['0,0,1', 'ceiling', room.source.x, room.source.y, 2 * room.height - room.source.z],
  ];
  for (const [id, wall, x, y, z] of surfaces) {
    const path = paths.find((item) => item.id === id)!;
    expect(path.bounces.map((bounce) => bounce.wall)).toEqual([wall]);
    const length = distance({ x, y, z }, room.listener);
    expect(path.length).toBeCloseTo(length, 12);
    expect(path.delay).toBeCloseTo(length / SPEED_OF_SOUND, 14);
    path.amplitudes.forEach((amplitude, band) => expect(amplitude).toBeCloseTo(
      Math.sqrt(1 - MATERIALS[room.materials[wall]].absorption[band]) * 10 ** (-AIR_DB_PER_METRE[band] * length / 20) / length, 14));
  }
});

test('every folded path preserves length, interior geometry and boundary interactions through order six', () => {
  const room = cloneRoom(PRESETS[0].room);
  room.order = 6;
  const result = imageSources(room);
  expect(result.paths).toHaveLength(377);
  expect(result.candidates).toBe(LIMITS.candidates);
  expect(result.work).toBeLessThanOrEqual(20_000);
  for (const path of result.paths) {
    expect(path.bounces).toHaveLength(path.order);
    const foldedLength = path.points.slice(1).reduce((sum, point, i) => sum + distance(path.points[i], point), 0);
    expect(foldedLength).toBeCloseTo(path.length, 9);
    for (const point of path.points) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-8);
      expect(point.x).toBeLessThanOrEqual(room.width + 1e-8);
      expect(point.y).toBeGreaterThanOrEqual(-1e-8);
      expect(point.y).toBeLessThanOrEqual(room.depth + 1e-8);
      expect(point.z).toBeGreaterThanOrEqual(-1e-8);
      expect(point.z).toBeLessThanOrEqual(room.height + 1e-8);
    }
    for (const bounce of path.bounces) {
      const coordinate: Record<Wall, number> = { west: bounce.point.x, east: room.width - bounce.point.x, south: bounce.point.y, north: room.depth - bounce.point.y, floor: bounce.point.z, ceiling: room.height - bounce.point.z };
      expect(coordinate[bounce.wall]).toBeCloseTo(0, 9);
    }
    expect(path.amplitudes.every((amplitude) => Number.isFinite(amplitude) && amplitude > 0 && amplitude <= 1)).toBe(true);
  }
  expect(result.paths.find((path) => path.id === '-2,0,0')!.bounces.map((bounce) => bounce.wall)).toEqual(['east', 'west']);
  expect(result.paths.find((path) => path.id === '3,0,0')!.bounces.map((bounce) => bounce.wall)).toEqual(['east', 'west', 'east']);
});

test('higher-order rays obey specular equal-angle reflection at nondegenerate bounces', () => {
  const room = cloneRoom(PRESETS[0].room);
  room.order = 5;
  for (const path of imageSources(room).paths) {
    for (let i = 0; i < path.bounces.length; i++) {
      const current = path.bounces[i];
      const before = i === 0 ? room.source : path.bounces[i - 1].point;
      const after = i === path.bounces.length - 1 ? room.listener : path.bounces[i + 1].point;
      const first = distance(before, current.point);
      const second = distance(current.point, after);
      if (first < 1e-8 || second < 1e-8) continue;
      const normal = current.wall === 'west' || current.wall === 'east' ? 'x' : current.wall === 'south' || current.wall === 'north' ? 'y' : 'z';
      for (const axis of ['x', 'y', 'z'] as const) {
        const incoming = (current.point[axis] - before[axis]) / first;
        const outgoing = (after[axis] - current.point[axis]) / second;
        expect(outgoing).toBeCloseTo(axis === normal ? -incoming : incoming, 8);
      }
    }
  }
});

test('simultaneous corner interactions keep both losses and one finite drawn vertex', () => {
  const room = uniformRoom('plaster');
  room.width = 8;
  room.depth = 8;
  room.source = { x: 4, y: 4, z: 1.2 };
  room.listener = { ...room.source };
  room.order = 2;
  const path = imageSources(room).paths.find((item) => item.id === '1,1,0')!;
  expect(path.bounces.map((bounce) => bounce.wall).sort()).toEqual(['east', 'north']);
  expect(path.bounces[0].point).toEqual(path.bounces[1].point);
  expect(path.points).toHaveLength(3);
  expect(path.length).toBeCloseTo(Math.hypot(8, 8), 12);
  expect(path.amplitudes[2]).toBeCloseTo(
    (1 - MATERIALS.plaster.absorption[2]) * 10 ** (-AIR_DB_PER_METRE[2] * path.length / 20) / path.length, 12);
  expect(buildImpulse([path]).samples.every(Number.isFinite)).toBe(true);
});

test('source/listener reciprocity and mirrored-room symmetry preserve path delays and losses', () => {
  const room = cloneRoom(PRESETS[0].room);
  room.order = 5;
  const original = imageSources(room).paths;
  const swapped = cloneRoom(room);
  swapped.source = { ...room.listener };
  swapped.listener = { ...room.source };
  const reciprocal = imageSources(swapped).paths;
  const mirrored = cloneRoom(room);
  mirrored.source.x = room.width - room.source.x;
  mirrored.listener.x = room.width - room.listener.x;
  mirrored.materials.west = room.materials.east;
  mirrored.materials.east = room.materials.west;
  const reflection = imageSources(mirrored).paths;
  for (const set of [reciprocal, reflection]) {
    expect(set).toHaveLength(original.length);
    const sort = (paths: typeof original) => [...paths].sort((a, b) => a.length - b.length);
    const sorted = sort(set);
    sort(original).forEach((path, i) => {
      expect(sorted[i].delay).toBeCloseTo(path.delay, 12);
      path.amplitudes.forEach((amplitude, band) => expect(sorted[i].amplitudes[band]).toBeCloseTo(amplitude, 11));
    });
  }
});

test('a material edit attenuates only rays that hit that wall, with meaningful band trends', () => {
  const room = uniformRoom('stone');
  const before = imageSources(room).paths;
  room.materials.west = 'absorber';
  const after = imageSources(room).paths;
  before.forEach((path, i) => {
    expect(after[i].points).toEqual(path.points);
    expect(after[i].delay).toEqual(path.delay);
    if (path.bounces.some((bounce) => bounce.wall === 'west')) {
      path.amplitudes.forEach((amplitude, band) => expect(after[i].amplitudes[band]).toBeLessThan(amplitude));
    } else expect(after[i].amplitudes).toEqual(path.amplitudes);
  });
  const hardEnergy = reflectedEnergy(before);
  const treatedEnergy = reflectedEnergy(imageSources(uniformRoom('absorber')).paths);
  hardEnergy.forEach((energy, band) => {
    const singleBounceRatio = (1 - MATERIALS.absorber.absorption[band]) / (1 - MATERIALS.stone.absorption[band]);
    expect(treatedEnergy[band]).toBeLessThan(energy * singleBounceRatio);
  });
  expect(treatedEnergy[3] / hardEnergy[3]).toBeLessThan(treatedEnergy[0] / hardEnergy[0]);
});

test('area-weighted Sabine and Eyring estimates are separate, frequency-sensitive and material-responsive', () => {
  const stone = uniformRoom('stone');
  const estimate = estimateRoom(stone);
  const areas = wallAreas(stone);
  expect(estimate.volume).toBe(stone.width * stone.depth * stone.height);
  expect(estimate.area).toBe(2 * (stone.width * stone.depth + stone.width * stone.height + stone.depth * stone.height));
  expect(Object.values(areas).reduce((sum, area) => sum + area, 0)).toBe(estimate.area);
  const treatment = estimateRoom(uniformRoom('absorber'));
  BANDS.forEach((_, band) => {
    expect(estimate.sabine[band]).toBeCloseTo(0.161 * estimate.volume / (estimate.area * MATERIALS.stone.absorption[band]), 10);
    expect(estimate.eyring[band]).toBeLessThan(estimate.sabine[band]);
    expect(treatment.eyring[band]).toBeLessThan(estimate.eyring[band]);
  });
});

test('order and geometry validation reject unsafe work before allocation', () => {
  expect(Array.from({ length: 7 }, (_, order) => pathCount(order))).toEqual([1, 7, 25, 63, 129, 231, 377]);
  for (const order of [-1, 1.2, 7, Infinity, NaN]) expect(() => imageSources({ ...PRESETS[0].room, order })).toThrow(RangeError);
  for (const width of [1, 25, Infinity, NaN]) expect(() => imageSources({ ...PRESETS[0].room, width })).toThrow(RangeError);
  expect(() => imageSources({ ...cloneRoom(PRESETS[0].room), source: { x: 0, y: 1, z: 1 } })).toThrow(RangeError);
  expect(() => imageSources(PRESETS[0].room, { maxPaths: 128 })).toThrow(/129 paths/);
  expect(() => imageSources(PRESETS[0].room, { maxWork: 50 })).toThrow(/work units/);
  expect(() => imageSources(PRESETS[0].room, { maxPaths: 10000 })).toThrow(RangeError);
  expect(IR_WORK_BUDGET).toBe(377 * 513 * 6);
});

test('the complementary IR reproduces a fractionally delayed impulse with documented latency', () => {
  const path = imageSources({ ...cloneRoom(PRESETS[0].room), order: 0 }).paths[0];
  const amplitudes: BandValues = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const ir = buildImpulse([{ ...path, amplitudes }]);
  const expectedTime = path.delay * SAMPLE_RATE + (FIR_LENGTH - 1) / 2;
  const at = Math.floor(expectedTime);
  const fraction = expectedTime - at;
  expect(ir.samples[at]).toBeCloseTo(0.5 * (1 - fraction), 6);
  expect(ir.samples[at + 1]).toBeCloseTo(0.5 * fraction, 6);
  expect(ir.energy).toBeCloseTo(0.25 * ((1 - fraction) ** 2 + fraction ** 2), 7);
  expect(ir.filterLatency).toBe(FILTER_LATENCY);
  expect(FILTER_LATENCY * SAMPLE_RATE).toBe(256);
  const otherEnergy = ir.samples.reduce((sum, value, i) => sum + (i !== at && i !== at + 1 ? value * value : 0), 0);
  expect(otherEnergy).toBeLessThan(1e-15);
});

test('IRs are deterministic and finite, and their band sum equals the actual all-band audio impulse', () => {
  for (const preset of PRESETS) {
    const paths = imageSources(preset.room).paths;
    const response = buildImpulse(paths);
    expect(response.samples).toEqual(buildImpulse(paths).samples);
    expect(response.energy).toBeGreaterThan(0);
    expect(response.samples.every(Number.isFinite)).toBe(true);
    expect(response.duration).toBeLessThan(1);
    const bands = BANDS.map((_, i) => buildImpulse(paths, i));
    let worst = 0;
    for (let i = 0; i < response.samples.length; i++) worst = Math.max(worst, Math.abs(response.samples[i] - bands.reduce((sum, ir) => sum + ir.samples[i], 0)));
    expect(worst).toBeLessThan(1e-7);
  }
  expect(() => buildImpulse([])).toThrow(RangeError);
  expect(() => buildImpulse(imageSources(PRESETS[0].room).paths, 7)).toThrow(RangeError);
  expect(() => buildImpulse([{ ...imageSources(PRESETS[0].room).paths[0], delay: Infinity }])).toThrow(RangeError);
});

test('Schroeder decay is a monotonic backward energy sum, not an invented RT60 extrapolation', () => {
  const ir = buildImpulse(imageSources(PRESETS[0].room).paths, 2);
  const decay = energyDecay(ir);
  expect(decay.totalEnergy).toBeCloseTo(ir.energy, 10);
  expect(decay.points[0].db).toBeCloseTo(0, 10);
  expect(decay.points.at(-1)!.db).toBe(-80);
  decay.points.forEach((point, i) => {
    expect(Number.isFinite(point.db)).toBe(true);
    if (i > 0) expect(point.db).toBeLessThanOrEqual(decay.points[i - 1].db + 1e-10);
    const sample = Math.round(point.time * ir.sampleRate);
    const energy = ir.samples.slice(sample).reduce((sum, value) => sum + value * value, 0);
    expect(point.db).toBeCloseTo(Math.max(-80, 10 * Math.log10(Math.max(1e-12, energy / ir.energy))), 7);
  });
  expect(decay.interval5to25).toBeGreaterThan(0);
  expect(decay.interval5to25).toBeLessThan(ir.duration);
  const empty = { ...ir, samples: new Float32Array(100), energy: 0 };
  expect(energyDecay(empty).interval5to25).toBeNull();
  const oneSample = { ...ir, samples: Float32Array.from([0, 1, 0]), energy: 1 };
  expect(energyDecay(oneSample).interval5to25).toBeNull();
});

test('IEEE float WAV is valid RIFF with fact metadata and exactly preserves finite pressure samples', () => {
  const response = buildImpulse(imageSources(PRESETS[0].room).paths);
  response.samples[1] = 1.25;
  const wav = encodeWav(response);
  const view = new DataView(wav);
  const text = (start: number, length: number) => String.fromCharCode(...new Uint8Array(wav, start, length));
  expect(text(0, 4)).toBe('RIFF');
  expect(text(8, 4)).toBe('WAVE');
  expect(text(12, 4)).toBe('fmt ');
  expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
  expect(view.getUint16(20, true)).toBe(3);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(44100);
  expect(view.getUint16(34, true)).toBe(32);
  expect(text(36, 4)).toBe('fact');
  expect(view.getUint32(44, true)).toBe(response.samples.length);
  expect(text(48, 4)).toBe('data');
  expect(view.getUint32(52, true)).toBe(response.samples.length * 4);
  response.samples.forEach((sample, i) => expect(view.getFloat32(56 + i * 4, true)).toBe(sample));
  expect(() => encodeWav({ samples: Float32Array.from([NaN]), sampleRate: SAMPLE_RATE })).toThrow(RangeError);
});

test('local one-shot synthesis is repeatable, bounded and independent of network audio', () => {
  for (const example of ['click', 'chord', 'percussion'] as const) {
    const samples = synthesis(example, SAMPLE_RATE);
    expect(samples).toEqual(synthesis(example, SAMPLE_RATE));
    expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.8)).toBe(true);
    expect(samples.some((value) => Math.abs(value) > 0.05)).toBe(true);
    expect(samples.length / SAMPLE_RATE).toBeLessThanOrEqual(1.5);
  }
  expect(MAX_OUTPUT_GAIN).toBeLessThanOrEqual(0.3);
});

interface RoomtoneAudioAudit {
  contexts: AudioContext[];
  requestedRates: (number | null)[];
  nodes: { node: AudioNode; disconnected: boolean }[];
  sources: { started: boolean; stopped: boolean; startCalls: number; stopCalls: number }[];
  convolvers: ConvolverNode[];
  closes: number;
  decodeCalls: number;
  gainCreations: number;
  failures: number;
  unstartedStops: number;
  release?: () => void;
  releaseDecode?: () => void;
}
interface AudioAuditOptions {
  blocked?: boolean;
  delayed?: boolean;
  unsupported?: boolean;
  defaultRate?: 48000 | 96000;
  actualRate?: 48000 | 96000;
  failFirst?: 'convolver' | 'gain' | 'start' | 'schedule-stop' | 'decode';
  delayedDecode?: boolean;
}
declare global {
  interface Window {
    __roomtoneAudioAudit: RoomtoneAudioAudit;
    __roomtoneAudioHarness: {
      audio: RoomtoneAudio;
      options: Audition;
      states: AudioStatus[];
      pending: Promise<void> | null;
      settled: number;
    };
    __roomtoneDraws: number;
  }
}
async function observeAudio(page: Page, options: AudioAuditOptions = {}): Promise<void> {
  await page.addInitScript((settings) => {
    const audit: RoomtoneAudioAudit = {
      contexts: [], requestedRates: [], nodes: [], sources: [], convolvers: [], closes: 0,
      decodeCalls: 0, gainCreations: 0, failures: 0, unstartedStops: 0,
    };
    window.__roomtoneAudioAudit = audit;
    if (settings.unsupported) {
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
      return;
    }
    const Native = window.AudioContext;
    function fail(stage: AudioAuditOptions['failFirst']): void {
      if (settings.failFirst === stage && audit.failures === 0) {
        audit.failures++;
        throw new DOMException(`Deliberate native ${stage} failure`, stage === 'start' ? 'InvalidStateError' : 'NotSupportedError');
      }
    }
    function track<T extends AudioNode>(node: T): T {
      const record = { node, disconnected: false };
      audit.nodes.push(record);
      const disconnect = node.disconnect.bind(node);
      node.disconnect = () => { record.disconnected = true; disconnect(); };
      return node;
    }
    class ObservedContext extends Native {
      constructor(options?: AudioContextOptions) {
        super({ ...options, sampleRate: settings.actualRate ?? options?.sampleRate ?? settings.defaultRate });
        audit.contexts.push(this);
        audit.requestedRates.push(options?.sampleRate ?? null);
      }
      override createGain(): GainNode {
        if (++audit.gainCreations === 2) fail('gain');
        return track(super.createGain());
      }
      override createDynamicsCompressor(): DynamicsCompressorNode { return track(super.createDynamicsCompressor()); }
      override createConvolver(): ConvolverNode {
        const node = track(super.createConvolver());
        audit.convolvers.push(node);
        if (settings.failFirst === 'convolver') {
          const descriptor = Object.getOwnPropertyDescriptor(ConvolverNode.prototype, 'buffer');
          if (!descriptor?.get || !descriptor.set) throw new Error('The native convolver buffer accessor is missing.');
          const { get, set } = descriptor;
          Object.defineProperty(node, 'buffer', {
            get: () => get.call(node),
            set: (buffer: AudioBuffer | null) => {
              if (audit.failures === 0) {
                audit.failures++;
                const mismatched = this.createBuffer(1, 8, this.sampleRate === 44100 ? 48000 : 44100);
                set.call(node, mismatched);
                throw new Error('The native convolver unexpectedly accepted a mismatched-rate buffer.');
              }
              set.call(node, buffer);
            },
          });
        }
        return node;
      }
      override createBufferSource(): AudioBufferSourceNode {
        const source = track(super.createBufferSource());
        const record = { started: false, stopped: false, startCalls: 0, stopCalls: 0 };
        audit.sources.push(record);
        const start = source.start.bind(source);
        const stop = source.stop.bind(source);
        source.start = (when = 0) => {
          record.startCalls++;
          fail('start');
          start(when);
          record.started = true;
        };
        source.stop = (when = 0) => {
          record.stopCalls++;
          if (!record.started) audit.unstartedStops++;
          fail('schedule-stop');
          stop(when);
          record.stopped = true;
        };
        return source;
      }
      override async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
        audit.decodeCalls++;
        fail('decode');
        const decoded = super.decodeAudioData(data);
        if (settings.delayedDecode && audit.decodeCalls === 1) {
          return decoded.then((buffer) => new Promise<AudioBuffer>((resolve) => {
            audit.releaseDecode = () => resolve(buffer);
          }));
        }
        return decoded;
      }
      override resume(): Promise<void> {
        if (settings.blocked) return Promise.reject(new DOMException('Deliberately blocked for coverage', 'NotAllowedError'));
        if (settings.delayed) return new Promise<void>((resolve, reject) => {
          audit.release = () => { void super.resume().then(resolve, reject); };
        });
        return super.resume();
      }
      override close(): Promise<void> {
        audit.closes++;
        sessionStorage.setItem('roomtone-audio-exit', JSON.stringify({
          closes: audit.closes,
          liveNodes: audit.nodes.filter((record) => !record.disconnected).length,
          started: audit.sources.filter((record) => record.started).length,
          unstopped: audit.sources.filter((record) => !record.stopped).length,
        }));
        return super.close();
      }
    }
    window.AudioContext = ObservedContext;
  }, options);
}
async function ready(page: Page): Promise<void> {
  await page.goto(route);
  await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-path-count', '129');
  await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-camera', /,/);
  await expect(page.locator('[data-project-preview]')).toBeVisible();
}
async function selectSound(page: Page, label: string, value: string): Promise<void> {
  await page.getByRole('button', { name: 'Sound', exact: true }).click();
  await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.getByRole('button', { name: 'Close Sound settings', exact: true }).click();
}
async function pane(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}
async function fitsViewport(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    body: [document.body.scrollWidth, document.body.scrollHeight],
    offset: [scrollX, scrollY],
    bodyOverflow: getComputedStyle(document.body).overflow,
    rootOverflow: getComputedStyle(document.documentElement).overflow,
  }));
  expect(size.document).toEqual([size.width, size.height]);
  expect(size.body).toEqual([size.width, size.height]);
  expect(size.offset).toEqual([0, 0]);
  expect(size.bodyOverflow).not.toMatch(/hidden|clip/);
  expect(size.rootOverflow).not.toMatch(/hidden|clip/);
  await expect(page.locator('.project-roomtone')).toHaveAttribute('data-workspace', 'true');
  await expect(page.getByRole('button', { name: 'Play once', exact: false })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeInViewport();
}
async function silent(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__roomtoneAudioAudit.contexts.every((context) => context.state === 'closed'))).toBe(true);
  expect(await page.evaluate(() => window.__roomtoneAudioAudit.nodes.every((record) => record.disconnected))).toBe(true);
  expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.every((source) => source.stopped))).toBe(true);
}
async function audioHarness(page: Page, current: ImpulseResponse, reference: ImpulseResponse | null = null): Promise<void> {
  await page.evaluate(async ({ current, reference }) => {
    const moduleURL = '/src/projects/roomtone/audio.ts';
    const module: typeof import('../../src/projects/roomtone/audio') = await import(moduleURL);
    const states: AudioStatus[] = [];
    window.__roomtoneAudioHarness = {
      audio: new module.RoomtoneAudio((status) => states.push(status)),
      options: {
        current: { ...current, samples: Float32Array.from(current.samples) },
        reference: reference ? { ...reference, samples: Float32Array.from(reference.samples) } : null,
        mode: 'current', example: 'chord', wet: 1, volume: 0.45,
      },
      states, pending: null, settled: 0,
    };
    document.querySelector('[data-action="play"]')!.addEventListener('click', (event) => {
      event.stopImmediatePropagation();
      const harness = window.__roomtoneAudioHarness;
      harness.pending = harness.audio.play(harness.options).then(() => { harness.settled++; });
    }, { capture: true });
  }, {
    current: { ...current, samples: Array.from(current.samples) },
    reference: reference ? { ...reference, samples: Array.from(reference.samples) } : null,
  });
}
function responseAt(samples: readonly number[] | Float32Array, rate: number, frequency: number): [number, number] {
  let real = 0;
  let imaginary = 0;
  for (let i = 0; i < samples.length; i++) {
    const phase = 2 * Math.PI * frequency * i / rate;
    real += samples[i] * Math.cos(phase);
    imaginary -= samples[i] * Math.sin(phase);
  }
  return [real, imaginary];
}

test.describe('Roomtone software WebGL workbench', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    // Other workspaces share this dev server; their edits must not navigate this fixture.
    await page.routeWebSocket(url => url.pathname === '/' && url.searchParams.has('token'), socket => {
      const server = socket.connectToServer();
      server.onMessage(message => {
        if (typeof message !== 'string' || !/"type"\s*:\s*"full-reload"/.test(message)) socket.send(message);
      });
    });
  });

  test('desktop geometry, real reflection inspection, camera and keyboard/drag positions', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await observeAudio(page);
    await ready(page);
    await page.screenshot({ path: info.outputPath('roomtone-desktop.png') });
    await fitsViewport(page);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
    await pane(page, 'Response');
    await page.getByLabel('Reflection path', { exact: true }).selectOption('1,0,0');
    await expect(page.locator('[data-path-route]')).toHaveText('Source → East wall → Listener');
    await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-path-vertices', '3');
    const originalDelay = await page.locator('[data-path-delay]').innerText();
    await pane(page, 'Edit room');
    await page.getByLabel('Width', { exact: true }).fill('11.2');
    await page.getByLabel('Width', { exact: true }).press('Tab');
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-volume', String(11.2 * 7.2 * 3.8));
    await expect(page.locator('[data-path-delay]')).not.toHaveText(originalDelay);
    const ratio = await page.locator('[data-plan-outline]').evaluate((element) => Number(element.getAttribute('width')) / Number(element.getAttribute('height')));
    expect(ratio).toBeCloseTo(11.2 / 7.2, 6);
    await page.getByLabel('Source height', { exact: true }).fill('1.7');
    await page.getByLabel('Source height', { exact: true }).press('Tab');
    const move = page.getByRole('button', { name: 'Move source; arrow keys move 10 centimetres, Shift moves 50 centimetres', exact: true });
    await move.focus();
    await move.press('ArrowUp');
    await expect(page.getByLabel('Source Y', { exact: true })).toHaveValue('2.1');
    const box = (await move.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    expect(Number(await page.getByLabel('Source X', { exact: true }).inputValue())).toBeGreaterThan(2.2);
    const camera = await page.locator('.roomtone-canvas').getAttribute('data-camera');
    await page.getByRole('button', { name: 'Rotate camera left', exact: true }).click();
    await expect(page.locator('.roomtone-canvas')).not.toHaveAttribute('data-camera', camera!);
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-view', 'plan');
    await page.getByRole('button', { name: '3D cutaway', exact: true }).click();
    const volume = await page.locator('.project-roomtone').getAttribute('data-volume');
    await page.getByLabel('Width', { exact: true }).fill('900');
    await page.getByLabel('Width', { exact: true }).press('Tab');
    await expect(page.locator('[data-input-feedback]')).toContainText('between 2 and 24');
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-volume', volume!);
    await page.getByLabel('Width', { exact: true }).press('Escape');
    await expect(page.getByLabel('Width', { exact: true })).toHaveValue('11.2');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByLabel('Width', { exact: true })).toHaveValue('9.6');
    await page.getByLabel('Width', { exact: true }).fill('2.339');
    await page.getByLabel('Width', { exact: true }).press('Tab');
    await move.focus();
    await move.press('ArrowRight');
    expect(Number(await page.getByLabel('Source X', { exact: true }).inputValue())).toBeLessThanOrEqual(2.339 - LIMITS.margin);
    await expect(page.locator('[data-input-feedback]')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the architectural model renders on demand rather than running a static animation loop', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.roomtone-canvas')!;
      const gl = canvas.getContext('webgl2')!;
      window.__roomtoneDraws = 0;
      const elements = gl.drawElements.bind(gl);
      const arrays = gl.drawArrays.bind(gl);
      gl.drawElements = (mode, count, type, offset) => { window.__roomtoneDraws++; elements(mode, count, type, offset); };
      gl.drawArrays = (mode, first, count) => { window.__roomtoneDraws++; arrays(mode, first, count); };
    });
    const settle = () => page.evaluate(() => new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => { if (++frames === 6) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    await settle();
    const idle = await page.evaluate(() => window.__roomtoneDraws);
    await settle();
    expect(await page.evaluate(() => window.__roomtoneDraws)).toBe(idle);
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__roomtoneDraws)).toBeGreaterThan(idle);
    await settle();
    const changed = await page.evaluate(() => window.__roomtoneDraws);
    await settle();
    expect(await page.evaluate(() => window.__roomtoneDraws)).toBe(changed);
  });

  test('WebGL failure is explicit and leaves the real floorplan and acoustic engine available', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = new Proxy(original, {
        apply(target, receiver, args) {
          if (args[0] === 'webgl' || args[0] === 'webgl2' || args[0] === 'experimental-webgl') return null;
          return Reflect.apply(target, receiver, args);
        },
      });
    });
    await page.goto(route);
    await expect(page.locator('[data-scene]')).toHaveAttribute('data-render-mode', 'unavailable');
    await expect(page.locator('.roomtone-webgl-message')).toContainText('The editable floorplan, acoustics, and audio still work');
    await page.getByLabel('Width', { exact: true }).fill('8');
    await page.getByLabel('Width', { exact: true }).press('Tab');
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-volume', String(8 * 7.2 * 3.8));
    await expect(page.locator('[data-floorplan] svg')).toBeVisible();
    await expect(page.locator('[data-path] option')).toHaveCount(129);
    expect(errors).toEqual([]);
  });

  test('surface edits, pinned comparison, frequency analysis and exact WAV export', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await observeAudio(page);
    await ready(page);
    await page.getByRole('button', { name: 'Pin reference', exact: false }).click();
    await expect(page.locator('[data-comparison-delta]')).toContainText('+0.00 dB');
    const before = Number(await page.locator('[data-rt60]').innerText());
    await pane(page, 'Surfaces');
    for (const wall of WALLS) await page.locator(`[data-material="${wall}"]`).selectOption('absorber');
    expect(Number(await page.locator('[data-rt60]').innerText())).toBeLessThan(before);
    await expect(page.locator('[data-comparison-delta]')).toContainText('Current IR energy: -');
    await expect(page.locator('[data-comparison] tbody tr').first()).toContainText('262.7');
    await pane(page, 'Response');
    await page.getByLabel('Analysis octave band').selectOption('0');
    await expect(page.locator('[data-decay-note]')).toContainText('125 Hz');
    await expect(page.locator('[data-absorption="west"]')).toHaveText('30%');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export IR', exact: false }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('roomtone-timber-order-4-44100-float.wav');
    const bytes = await readFile((await download.path())!);
    const expected = buildImpulse(imageSources(uniformRoom('absorber')).paths);
    expect(bytes.readUInt32LE(44)).toBe(expected.samples.length);
    expect(bytes.readUInt32LE(24)).toBe(44100);
    expect(bytes.readUInt16LE(20)).toBe(3);
    for (let i = 0; i < expected.samples.length; i++) expect(bytes.readFloatLE(56 + i * 4)).toBe(expected.samples[i]);
    const decoded = await page.evaluate(async (numbers) => {
      const context = new OfflineAudioContext(1, 1, 44100);
      const buffer = await context.decodeAudioData(new Uint8Array(numbers).buffer);
      return { length: buffer.length, rate: buffer.sampleRate, channels: buffer.numberOfChannels };
    }, [...bytes]);
    expect(decoded).toEqual({ length: expected.samples.length, rate: 44100, channels: 1 });
    await fitsViewport(page);
    await page.screenshot({ path: info.outputPath('roomtone-response.png') });
    await pane(page, 'Edit room');
    await page.getByLabel('Reflection order', { exact: true }).selectOption('0');
    await expect(page.locator('[data-path] option')).toHaveCount(1);
    await expect(page.locator('[data-path-route]')).toHaveText('Source → Listener');
    await pane(page, 'Compare');
    await page.getByRole('button', { name: 'Clear B', exact: true }).click();
    await expect(page.locator('[data-audition] option[value="reference"]')).toHaveJSProperty('disabled', true);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('explicit audio uses the actual non-normalized IR, stops, and closes on navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeAudio(page);
    await ready(page);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
    await selectSound(page, 'Audition sound', 'chord');
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
    const audit = await page.evaluate(() => {
      const convolver = window.__roomtoneAudioAudit.convolvers[0];
      return {
        contexts: window.__roomtoneAudioAudit.contexts.length,
        normalize: convolver.normalize,
        rate: convolver.buffer!.sampleRate,
        energy: convolver.buffer!.getChannelData(0).reduce((sum, value) => sum + value * value, 0),
      };
    });
    expect(audit.contexts).toBe(1);
    expect(audit.normalize).toBe(false);
    expect(audit.rate).toBe(SAMPLE_RATE);
    expect(audit.energy).toBeCloseTo(Number(await page.locator('.project-roomtone').getAttribute('data-ir-energy')), 10);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await silent(page);
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
    await returnToCollection(page);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('roomtone-audio-exit')!))).toEqual({
      closes: 2, liveNodes: 0, started: 2, unstopped: 0,
    });
    expect(errors).toEqual([]);
  });

  test('A/B audition uses the pinned impulse and naturally finishes without looping', async ({ page }) => {
    await observeAudio(page);
    await ready(page);
    const referenceEnergy = Number(await page.locator('.project-roomtone').getAttribute('data-ir-energy'));
    await page.getByRole('button', { name: 'Pin reference', exact: false }).click();
    await page.getByLabel('Room preset').selectOption('studio');
    await selectSound(page, 'Audition design', 'reference');
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
    const energy = await page.evaluate(() => window.__roomtoneAudioAudit.convolvers[0].buffer!.getChannelData(0).reduce((sum, value) => sum + value * value, 0));
    expect(energy).toBeCloseTo(referenceEnergy, 10);
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'off');
    await silent(page);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(1);
    await selectSound(page, 'Audition design', 'dry');
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
    const gain = await page.evaluate(() => window.__roomtoneAudioAudit.nodes.filter((record) => record.node instanceof GainNode).slice(-3).map((record) => (record.node as GainNode).gain.value));
    expect(gain[0]).toBe(1);
    expect(gain[1]).toBe(0);
    expect(gain[2]).toBeLessThanOrEqual(MAX_OUTPUT_GAIN);
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    await page.getByLabel('Wet mix', { exact: true }).press('ArrowLeft');
    await page.getByRole('button', { name: 'Close Sound settings', exact: true }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'off');
    await silent(page);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(2);
  });

  for (const rate of [48000, 96000] as const) {
    test(`native ${rate} Hz default honors the explicit IR-rate request without changing samples`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await observeAudio(page, { defaultRate: rate });
      await ready(page);
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
      await selectSound(page, 'Audition sound', 'chord');
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
      const result = await page.evaluate(() => ({
        requested: window.__roomtoneAudioAudit.requestedRates,
        actual: window.__roomtoneAudioAudit.contexts[0].sampleRate,
        bufferRate: window.__roomtoneAudioAudit.convolvers[0].buffer!.sampleRate,
        samples: [...window.__roomtoneAudioAudit.convolvers[0].buffer!.getChannelData(0)],
        normalize: window.__roomtoneAudioAudit.convolvers[0].normalize,
        decodes: window.__roomtoneAudioAudit.decodeCalls,
      }));
      expect(result.requested).toEqual([SAMPLE_RATE]);
      expect(result.actual).toBe(SAMPLE_RATE);
      expect(result.bufferRate).toBe(result.actual);
      expect(result.decodes).toBe(0);
      expect(result.normalize).toBe(false);
      expect(result.samples).toEqual([...buildImpulse(imageSources(PRESETS[0].room).paths).samples]);
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      await silent(page);
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.unstartedStops)).toBe(0);
      expect(errors).toEqual([]);
    });

    test(`native ${rate} Hz output converts real A/B impulses with shared gain and preserved timing`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await observeAudio(page, { actualRate: rate });
      await ready(page);
      await page.getByRole('button', { name: 'Pin reference', exact: false }).click();
      await page.getByLabel('Room preset').selectOption('studio');
      await selectSound(page, 'Audition sound', 'chord');
      const gains: number[] = [];
      for (const mode of ['current', 'reference'] as const) {
        await selectSound(page, 'Audition design', mode);
        await page.getByRole('button', { name: 'Play once', exact: false }).click();
        await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
        const result = await page.evaluate(() => {
          const audit = window.__roomtoneAudioAudit;
          const convolver = audit.convolvers.at(-1)!;
          return {
            rate: audit.contexts.at(-1)!.sampleRate,
            requested: audit.requestedRates.at(-1),
            bufferRate: convolver.buffer!.sampleRate,
            samples: [...convolver.buffer!.getChannelData(0)],
            normalize: convolver.normalize,
            gain: audit.nodes.flatMap(({ node }) => node instanceof GainNode ? [node.gain.value] : []).at(-1)!,
          };
        });
        const expected = buildImpulse(imageSources(PRESETS[mode === 'current' ? 1 : 0].room).paths);
        expect(result.rate).toBe(rate);
        expect(result.bufferRate).toBe(rate);
        expect(result.requested).toBe(SAMPLE_RATE);
        expect(result.normalize).toBe(false);
        expect(Math.abs(result.samples.length / rate - expected.duration)).toBeLessThanOrEqual(1 / rate);
        const peakIndex = (samples: readonly number[] | Float32Array) => {
          let peak = 0;
          for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i]) > Math.abs(samples[peak])) peak = i;
          return peak;
        };
        expect(Math.abs(peakIndex(result.samples) / rate - peakIndex(expected.samples) / SAMPLE_RATE)).toBeLessThan(2 / rate);
        for (const frequency of [125, 500, 2000, 8000, 16000]) {
          const actual = responseAt(result.samples, rate, frequency);
          const original = responseAt(expected.samples, SAMPLE_RATE, frequency);
          expect(Math.hypot(actual[0] - original[0], actual[1] - original[1]),
            `${mode} complex transfer response at ${frequency} Hz`).toBeLessThan(0.005 * Math.max(0.05, Math.hypot(...original)));
        }
        gains.push(result.gain);
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await silent(page);
      }
      expect(gains[0]).toBeGreaterThan(0);
      expect(gains[0]).toBeLessThanOrEqual(MAX_OUTPUT_GAIN);
      expect(gains[1]).toBe(gains[0]);
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.decodeCalls)).toBe(4);
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
      await returnToCollection(page);
      expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('roomtone-audio-exit')!))).toEqual({
        closes: 3, liveNodes: 0, started: 3, unstopped: 0,
      });
      expect(errors).toEqual([]);
    });

    test(`native ${rate} Hz conversion preserves impulse area, delay and unnormalized two-to-one levels`, async ({ page }) => {
      await observeAudio(page, { actualRate: rate });
      await ready(page);
      const template = buildImpulse(imageSources({ ...cloneRoom(PRESETS[0].room), order: 0 }).paths);
      const samples = new Float32Array(4410);
      samples[2205] = 2.5;
      samples[2646] = -0.25;
      const impulse = { ...template, samples, duration: samples.length / SAMPLE_RATE, energy: 6.3125, peak: 2.5 };
      const reference = { ...impulse, samples: samples.map((sample) => sample / 2), energy: impulse.energy / 4, peak: 1.25 };
      await audioHarness(page, impulse, reference);
      const levels: { area: number; peak: number; gain: number }[] = [];
      for (const mode of ['current', 'reference'] as const) {
        await page.evaluate((mode) => { window.__roomtoneAudioHarness.options.mode = mode; }, mode);
        await page.getByRole('button', { name: 'Play once', exact: false }).click();
        await page.evaluate(() => window.__roomtoneAudioHarness.pending);
        const result = await page.evaluate(() => {
          const audit = window.__roomtoneAudioAudit;
          const buffer = audit.convolvers.at(-1)!.buffer!;
          const values = buffer.getChannelData(0);
          let at = 0;
          for (let i = 1; i < values.length; i++) if (values[i] > values[at]) at = i;
          return {
            state: window.__roomtoneAudioHarness.states.at(-1)!.state,
            rate: buffer.sampleRate, time: at / buffer.sampleRate, peak: values[at],
            area: values.reduce((sum, value) => sum + value, 0),
            gain: audit.nodes.flatMap(({ node }) => node instanceof GainNode ? [node.gain.value] : []).at(-1)!,
          };
        });
        expect(result.state).toBe('playing');
        expect(result.rate).toBe(rate);
        expect(Math.abs(result.time - 0.05)).toBeLessThanOrEqual(1 / rate);
        expect(result.area).toBeCloseTo(mode === 'current' ? 2.25 : 1.125, 2);
        levels.push(result);
        await page.evaluate(() => window.__roomtoneAudioHarness.audio.stop());
        await silent(page);
      }
      expect(levels[0].area / levels[1].area).toBeCloseTo(2, 6);
      expect(levels[0].peak / levels[1].peak).toBeCloseTo(2, 6);
      expect(levels[0].gain).toBe(levels[1].gain);
      await page.evaluate(() => window.__roomtoneAudioHarness.audio.destroy());
      await silent(page);
    });
  }

  for (const failure of ['convolver', 'gain', 'start', 'schedule-stop', 'decode'] as const) {
    test(`native audio ${failure} failure cleans every partial node and supports safe stop, retry and destroy`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await observeAudio(page, { actualRate: 48000, failFirst: failure });
      await ready(page);
      await audioHarness(page, buildImpulse(imageSources(PRESETS[0].room).paths));
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await page.evaluate(() => window.__roomtoneAudioHarness.pending);
      const result = await page.evaluate(() => ({
        status: window.__roomtoneAudioHarness.states.at(-1),
        nodes: window.__roomtoneAudioAudit.nodes.length,
        sources: window.__roomtoneAudioAudit.sources,
        failures: window.__roomtoneAudioAudit.failures,
        unstartedStops: window.__roomtoneAudioAudit.unstartedStops,
      }));
      expect(result.status!.state).toBe('error');
      expect(result.status!.message).toContain('48000 Hz playback graph');
      expect(result.status!.message).toContain('export the WAV IR');
      expect(result.failures).toBe(1);
      expect(result.nodes).toBe({ convolver: 2, gain: 3, start: 6, 'schedule-stop': 6, decode: 0 }[failure]);
      expect(result.unstartedStops).toBe(0);
      if (failure === 'decode') expect(result.sources).toHaveLength(0);
      else {
        expect(result.sources).toHaveLength(1);
        expect(result.sources[0].started).toBe(failure === 'schedule-stop');
        expect(result.sources[0].stopCalls).toBe(failure === 'schedule-stop' ? 2 : 0);
      }
      await expect.poll(() => page.evaluate(() => window.__roomtoneAudioAudit.contexts[0].state)).toBe('closed');
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.nodes.every((node) => node.disconnected))).toBe(true);
      await page.evaluate(() => {
        window.__roomtoneAudioHarness.audio.stop();
        window.__roomtoneAudioHarness.audio.stop();
      });
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await page.evaluate(() => window.__roomtoneAudioHarness.pending);
      expect(await page.evaluate(() => window.__roomtoneAudioHarness.states.at(-1)!.state)).toBe('playing');
      await page.evaluate(async () => {
        const harness = window.__roomtoneAudioHarness;
        harness.audio.destroy();
        harness.audio.destroy();
        harness.audio.stop();
        await harness.audio.play(harness.options);
      });
      await expect.poll(() => page.evaluate(() => window.__roomtoneAudioAudit.contexts.every((context) => context.state === 'closed'))).toBe(true);
      expect(await page.evaluate(() => ({
        contexts: window.__roomtoneAudioAudit.contexts.length,
        closes: window.__roomtoneAudioAudit.closes,
        disconnected: window.__roomtoneAudioAudit.nodes.every((node) => node.disconnected),
        activeStarted: window.__roomtoneAudioAudit.sources.filter((source) => source.started && !source.stopped).length,
        unstartedStops: window.__roomtoneAudioAudit.unstartedStops,
      }))).toEqual({ contexts: 2, closes: 2, disconnected: true, activeStarted: 0, unstartedStops: 0 });
      expect(errors).toEqual([]);
    });
  }

  test('a native convolver assignment error is visible and leaving never stops an unstarted source', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeAudio(page, { actualRate: 96000, failFirst: 'convolver' });
    await ready(page);
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'error');
    await expect(page.locator('[data-audio-error]')).toContainText('96000 Hz playback graph (NotSupportedError)');
    await expect(page.locator('[data-audio-error]')).toContainText('Try Play again');
    await expect(page.getByRole('button', { name: 'Play once', exact: false })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__roomtoneAudioAudit.contexts[0].state)).toBe('closed');
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources)).toEqual([
      { started: false, stopped: false, startCalls: 0, stopCalls: 0 },
    ]);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.nodes.every((node) => node.disconnected))).toBe(true);
    await returnToCollection(page);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('roomtone-audio-exit')!))).toEqual({
      closes: 1, liveNodes: 0, started: 0, unstopped: 1,
    });
    expect(errors).toEqual([]);
  });

  for (const action of ['stop', 'destroy'] as const) {
    test(`native pending rate conversion cannot start a late source after ${action}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await observeAudio(page, { actualRate: 96000, delayedDecode: true });
      await ready(page);
      await audioHarness(page, buildImpulse(imageSources(PRESETS[0].room).paths));
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await expect.poll(() => page.evaluate(() => typeof window.__roomtoneAudioAudit.releaseDecode)).toBe('function');
      expect(await page.evaluate(() => window.__roomtoneAudioHarness.states.at(-1)!.state)).toBe('starting');
      await page.evaluate((action) => window.__roomtoneAudioHarness.audio[action](), action);
      await expect.poll(() => page.evaluate(() => window.__roomtoneAudioHarness.settled)).toBe(1);
      await silent(page);
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(0);
      if (action === 'stop') {
        await page.getByRole('button', { name: 'Play once', exact: false }).click();
        await page.evaluate(() => window.__roomtoneAudioHarness.pending);
        expect(await page.evaluate(() => window.__roomtoneAudioHarness.states.at(-1)!.state)).toBe('playing');
      }
      await page.evaluate(() => window.__roomtoneAudioAudit.releaseDecode!());
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(action === 'stop' ? 1 : 0);
      if (action === 'stop') expect(await page.evaluate(() => window.__roomtoneAudioHarness.states.at(-1)!.state)).toBe('playing');
      await page.evaluate(() => window.__roomtoneAudioHarness.audio.destroy());
      await silent(page);
      expect(errors).toEqual([]);
    });
  }

  test('blocked audio displays an honest visible error without live nodes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeAudio(page, { blocked: true });
    await ready(page);
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('[data-audio-error]')).toContainText('blocked or unavailable');
    await silent(page);
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('unavailable AudioContext leaves geometry and exports usable', async ({ page }) => {
    await observeAudio(page, { unsupported: true });
    await ready(page);
    await expect(page.locator('[data-audio-error]')).toContainText('Web Audio is unavailable');
    await expect(page.getByRole('button', { name: 'Play once', exact: false })).toBeDisabled();
    await page.getByLabel('Room preset').selectOption('hall');
    await expect(page.getByLabel('Width', { exact: true })).toHaveValue('18');
    await expect(page.getByRole('button', { name: 'Export IR', exact: false })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Play once', exact: false })).toBeDisabled();
    await expect(page.locator('[data-audio-error]')).toContainText('Web Audio is unavailable');
  });

  test('leaving during pending audio permission revokes the future source and all timers', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observeAudio(page, { delayed: true });
    await ready(page);
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'starting');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await silent(page);
    await page.evaluate(() => window.__roomtoneAudioAudit.release?.());
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'off');
    expect(await page.evaluate(() => window.__roomtoneAudioAudit.sources.length)).toBe(0);
    await page.getByRole('button', { name: 'Play once', exact: false }).click();
    await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'starting');
    await returnToCollection(page);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('roomtone-audio-exit')!))).toEqual({
      closes: 2, liveNodes: 0, started: 0, unstopped: 0,
    });
    expect(errors).toEqual([]);
  });

  test('fixed workspace fits desktop, phone and short landscape viewports with real bounded panes', async ({ page }, info) => {
    await observeAudio(page);
    await ready(page);
    for (const [width, height] of [[1440, 900], [1280, 720], [375, 812], [320, 640], [768, 480]]) {
      await page.setViewportSize({ width, height });
      if (width <= 760) await pane(page, 'Space');
      await fitsViewport(page);
      await expect(page.locator('.roomtone-canvas')).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`roomtone-workspace-${width}x${height}.png`) });
      const canvas = (await page.locator('.roomtone-canvas').boundingBox())!;
      expect(canvas.height).toBeGreaterThan(75);
      const camera = await page.locator('.roomtone-canvas').getAttribute('data-camera');
      await page.locator('.roomtone-canvas').focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.roomtone-canvas')).not.toHaveAttribute('data-camera', camera!);
      await pane(page, 'Edit room');
      await pane(page, 'Geometry');
      await page.getByLabel('Width', { exact: true }).fill('10');
      await page.getByLabel('Width', { exact: true }).press('Tab');
      await expect(page.locator('.project-roomtone')).toHaveAttribute('data-volume', String(10 * 7.2 * 3.8));
      await pane(page, 'Surfaces');
      await page.getByLabel('Reflection order', { exact: true }).selectOption('6');
      await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-path-count', '377');
      await fitsViewport(page);
      await pane(page, 'Response');
      await page.getByLabel('Reflection path', { exact: true }).selectOption('1,0,0');
      await expect(page.locator('[data-path-route]')).toHaveText('Source → East wall → Listener');
      const scroll = await page.locator('.roomtone-panel-listen').evaluate(element => ({
        height: element.clientHeight, content: element.scrollHeight,
        overflow: getComputedStyle(element).overflowY,
      }));
      expect(scroll.content).toBeGreaterThan(scroll.height);
      expect(scroll.overflow).toBe('auto');
      await fitsViewport(page);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(page.getByLabel('Width', { exact: true })).toHaveValue('9.6');
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
    }
  });

  test('reduced-motion resize has no implicit layout transitions or horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    expect(await page.locator('.roomtone-shell').evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none');
    for (const name of ['Space', 'Edit room', 'Response', 'Compare']) {
      await pane(page, name);
      for (const width of [1440, 320, 1440, 375, 320]) {
        await page.setViewportSize({ width, height: 780 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await fitsViewport(page);
      }
    }
  });

  for (const width of [375, 320]) {
    test(`${width}px workbench switches useful panes without overflow or exceptions`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 375 ? 812 : 640 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await observeAudio(page);
      await ready(page);
      await page.screenshot({ path: info.outputPath(`roomtone-mobile-${width}.png`) });
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
      expect(await overflow()).toBe(false);
      await fitsViewport(page);
      await pane(page, 'Edit room');
      await expect(page.getByLabel('Width', { exact: true })).toBeVisible();
      await page.getByLabel('Depth', { exact: true }).fill('8.4');
      await page.getByLabel('Depth', { exact: true }).press('Tab');
      await page.getByLabel('Listener height', { exact: true }).fill('1.4');
      await page.getByLabel('Listener height', { exact: true }).press('Tab');
      expect(await overflow()).toBe(false);
      await fitsViewport(page);
      await page.screenshot({ path: info.outputPath(`roomtone-mobile-edit-${width}.png`) });
      await pane(page, 'Response');
      await expect(page.locator('[data-ir-plot] svg')).toBeVisible();
      await page.getByLabel('Reflection path', { exact: true }).selectOption('0,0,1');
      await expect(page.locator('[data-path-route]')).toHaveText('Source → Ceiling → Listener');
      await expect(page.getByRole('button', { name: 'Play once', exact: false })).toBeVisible();
      expect(await overflow()).toBe(false);
      const fontSizes = await page.locator('.roomtone-plot text').evaluateAll((elements) => elements.map((element) => {
        const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
        return parseFloat(getComputedStyle(element).fontSize) * Math.hypot(matrix.a, matrix.b);
      }));
      expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(13.99);
      await page.screenshot({ path: info.outputPath(`roomtone-mobile-listen-${width}.png`) });
      await fitsViewport(page);
      await page.getByRole('button', { name: 'Pin reference', exact: false }).click();
      await pane(page, 'Compare');
      await expect(page.locator('[data-comparison-delta]')).toContainText('+0.00 dB');
      await pane(page, 'Edit room');
      await pane(page, 'Surfaces');
      const originalEnergy = await page.locator('.project-roomtone').getAttribute('data-ir-energy');
      await page.getByLabel('West wall material', { exact: true }).selectOption('absorber');
      await expect(page.locator('.project-roomtone')).not.toHaveAttribute('data-ir-energy', originalEnergy!);
      await pane(page, 'Compare');
      await expect(page.locator('[data-comparison-delta]')).toContainText('Current IR energy: -');
      await fitsViewport(page);
      await page.getByRole('link', { name: 'Model notes', exact: false }).click();
      await expect(page.getByRole('dialog', { name: 'Model notes', exact: true })).toBeVisible();
      await page.getByText('Equations & export details', { exact: true }).click();
      await expect(page.getByText('WAV export is unnormalized, mono 32-bit IEEE float', { exact: false })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('link', { name: 'Model notes', exact: false })).toBeFocused();
      expect(await page.evaluate(() => window.__roomtoneAudioAudit.contexts.length)).toBe(0);
      await selectSound(page, 'Audition sound', 'chord');
      await selectSound(page, 'Audition design', 'reference');
      await page.getByRole('button', { name: 'Play once', exact: false }).click();
      await expect(page.locator('.project-roomtone')).toHaveAttribute('data-audio-state', 'playing');
      await fitsViewport(page);
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      await silent(page);
      await pane(page, 'Space');
      await expect(page.locator('.roomtone-canvas')).toHaveAttribute('data-selected-path', '0,0,1');
      await fitsViewport(page);
      expect(errors).toEqual([]);
    });
  }
});
