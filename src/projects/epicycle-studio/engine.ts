export interface Point {
  x: number;
  y: number;
}

export interface Coefficient {
  frequency: number;
  re: number;
  im: number;
  amplitude: number;
}

export interface FourierDrawing {
  samples: readonly Point[];
  dc: Coefficient;
  harmonics: readonly Coefficient[];
}

export interface Epicycle {
  center: Point;
  end: Point;
  radius: number;
  frequency: number;
}

export const SAMPLE_COUNT = 128;
export const MAX_SAMPLES = 256;
export const MAX_INPUT_POINTS = 1024;
const TAU = Math.PI * 2;

function validPoints(points: readonly Point[]): void {
  if (!points.length || points.length > MAX_INPUT_POINTS) {
    throw new RangeError(`A path needs 1 to ${MAX_INPUT_POINTS} points.`);
  }
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new RangeError('Every point must have finite coordinates.');
  }
}

export function fitPath(points: readonly Point[]): Point[] {
  validPoints(points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const span = Math.max(right - left, top - bottom);
  if (span < 0.0001) throw new RangeError('Give the path some length before tracing it.');
  const scale = 1.8 / span;
  return points.map(({ x, y }) => ({
    x: (x - (left + right) / 2) * scale,
    y: (y - (bottom + top) / 2) * scale,
  }));
}

/** Uniform arc-length samples; the closing segment is included, the endpoint is not repeated. */
export function resampleClosedPath(points: readonly Point[], count = SAMPLE_COUNT): Point[] {
  validPoints(points);
  if (!Number.isInteger(count) || count < 2 || count > MAX_SAMPLES) {
    throw new RangeError(`Use 2 to ${MAX_SAMPLES} samples.`);
  }
  const vertices = points.filter((point, index) => index === 0
    || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-9);
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (vertices.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) vertices.pop();
  if (vertices.length < 2) throw new RangeError('Draw a longer path with at least two distinct points.');

  const lengths = vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0;
  let segmentStart = 0;
  return Array.from({ length: count }, (_, index) => {
    const distance = total * index / count;
    while (segment < lengths.length - 1 && distance >= segmentStart + lengths[segment]) {
      segmentStart += lengths[segment++];
    }
    const amount = (distance - segmentStart) / lengths[segment];
    const a = vertices[segment];
    const b = vertices[(segment + 1) % vertices.length];
    return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
  });
}

/** Complex DFT: x is the real part, y the imaginary part. Even-N Nyquist uses -N/2. */
export function discreteFourier(samples: readonly Point[]): Coefficient[] {
  validPoints(samples);
  const count = samples.length;
  if (count > MAX_SAMPLES) throw new RangeError(`The transform is bounded to ${MAX_SAMPLES} samples.`);
  return Array.from({ length: count }, (_, bin) => {
    const frequency = bin < Math.ceil(count / 2) ? bin : bin - count;
    let re = 0;
    let im = 0;
    for (let index = 0; index < count; index++) {
      const angle = TAU * frequency * index / count;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      re += samples[index].x * cosine + samples[index].y * sine;
      im += samples[index].y * cosine - samples[index].x * sine;
    }
    re /= count;
    im /= count;
    return { frequency, re, im, amplitude: Math.hypot(re, im) };
  });
}

export function makeDrawing(points: readonly Point[], count = SAMPLE_COUNT): FourierDrawing {
  const samples = resampleClosedPath(fitPath(points), count);
  const [dc, ...terms] = discreteFourier(samples);
  const harmonics = terms.sort((a, b) => b.amplitude - a.amplitude || a.frequency - b.frequency);
  return { samples, dc, harmonics };
}

export function selectHarmonics(drawing: FourierDrawing, count: number): Coefficient[] {
  if (!Number.isInteger(count) || count < 0 || count > drawing.harmonics.length) {
    throw new RangeError(`Choose 0 to ${drawing.harmonics.length} rotating harmonics.`);
  }
  return [drawing.dc, ...drawing.harmonics.slice(0, count)];
}

function phaseOf(time: number): number {
  if (!Number.isFinite(time)) throw new RangeError('The cycle position must be finite.');
  return time - Math.floor(time);
}

function rotatingVector(coefficient: Coefficient, phase: number): Point {
  const angle = TAU * coefficient.frequency * phase;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: coefficient.re * cosine - coefficient.im * sine,
    y: coefficient.re * sine + coefficient.im * cosine,
  };
}

export function reconstruct(coefficients: readonly Coefficient[], time: number): Point {
  const phase = phaseOf(time);
  const point = { x: 0, y: 0 };
  for (const coefficient of coefficients) {
    const vector = rotatingVector(coefficient, phase);
    point.x += vector.x;
    point.y += vector.y;
  }
  return point;
}

export function chainAt(coefficients: readonly Coefficient[], time: number): Epicycle[] {
  const phase = phaseOf(time);
  let center = { x: 0, y: 0 };
  const circles: Epicycle[] = [];
  for (const coefficient of coefficients) {
    const vector = rotatingVector(coefficient, phase);
    const end = { x: center.x + vector.x, y: center.y + vector.y };
    if (coefficient.frequency !== 0) {
      circles.push({ center, end, radius: coefficient.amplitude, frequency: coefficient.frequency });
    }
    center = end;
  }
  return circles;
}

export function reconstructionPath(coefficients: readonly Coefficient[], divisions = 512): Point[] {
  if (!Number.isInteger(divisions) || divisions < 2 || divisions > 2048) {
    throw new RangeError('A plotted reconstruction needs 2 to 2048 segments.');
  }
  return Array.from({ length: divisions + 1 }, (_, index) => reconstruct(coefficients, index / divisions));
}

/** Parseval gives RMS error at the input samples relative to the source's RMS radius about its mean. */
export function relativeError(drawing: FourierDrawing, count: number): number {
  selectHarmonics(drawing, count);
  const energy = drawing.harmonics.reduce((sum, term) => sum + term.amplitude ** 2, 0);
  const omitted = drawing.harmonics.slice(count).reduce((sum, term) => sum + term.amplitude ** 2, 0);
  return energy === 0 ? 0 : Math.sqrt(omitted / energy) * 100;
}
