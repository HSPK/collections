import type { ImpulseResponse } from './ir';

/** IEEE float WAV retains the model's amplitudes without clipping or normalization. */
export function encodeWav(ir: Pick<ImpulseResponse, 'samples' | 'sampleRate'>): ArrayBuffer {
  if (!Number.isInteger(ir.sampleRate) || ir.sampleRate < 8000 || ir.sampleRate > 192000 ||
      !ir.samples.length || ir.samples.length > ir.sampleRate * 3) {
    throw new RangeError('WAV requires a bounded, non-empty impulse response.');
  }
  if (!ir.samples.every(Number.isFinite)) throw new RangeError('WAV samples must be finite.');
  const buffer = new ArrayBuffer(56 + ir.samples.length * 4);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ir.sampleRate, true);
  view.setUint32(28, ir.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  text(36, 'fact');
  view.setUint32(40, 4, true);
  view.setUint32(44, ir.samples.length, true);
  text(48, 'data');
  view.setUint32(52, ir.samples.length * 4, true);
  for (let i = 0; i < ir.samples.length; i++) view.setFloat32(56 + i * 4, ir.samples[i], true);
  return buffer;
}
