export const TAU = Math.PI * 2;
export const EPSILON = 1e-10;

export interface Point { x: number; y: number }
export interface LinkLengths { a: number; b: number; c: number; d: number }
export interface CouplerLocation { fraction: number; offset: number }
export type AssemblyBranch = 'plus' | 'minus';
export type LinkId = keyof LinkLengths;

export interface Pose {
  A: Point;
  B: Point;
  C: Point;
  D: Point;
  P: Point;
  inputAngle: number;
  couplerAngle: number;
  outputAngle: number;
  separation: number;
  closureError: number;
}

export interface Solution {
  status: 'closed' | 'tangent' | 'unreachable' | 'coincident' | 'impossible' | 'invalid';
  reason: string;
  message: string;
  pose: Pose | null;
}

export interface Classification {
  kind: 'crank-rocker' | 'double-crank' | 'rocker-crank' | 'double-rocker'
    | 'change-point' | 'degenerate' | 'impossible' | 'invalid';
  criterion: 'grashof' | 'non-grashof' | 'equality' | 'degenerate' | 'invalid';
  title: string;
  explanation: string;
  shortest: LinkId[];
  shortLong: number | null;
  middleSum: number | null;
  inputFullTurn: boolean;
  outputFullTurn: boolean;
}

export interface AngleInterval { start: number; end: number }
export interface TraceSample { angle: number; point: Point; B: Point; C: Point }
export interface CouplerTrace {
  segments: TraceSample[][];
  intervals: AngleInterval[];
  reachableFraction: number;
}

export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const degrees = (angle: number): number => angle * 180 / Math.PI;

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('The input angle must be finite.');
  const result = angle % TAU;
  return result < 0 ? result + TAU : result === 0 ? 0 : result;
}

export function lengthIssue(lengths: LinkLengths): string | null {
  const values = [lengths.a, lengths.b, lengths.c, lengths.d];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return 'Every link length must be a finite number greater than zero.';
  }
  const scale = Math.max(...values);
  if (!Number.isFinite(scale * 16) || scale < Number.MIN_VALUE * 1e6
    || Math.min(...values) / scale < 1e-9) {
    return 'These sizes exceed numerical resolution. Keep the largest-to-smallest ratio below one billion.';
  }
  return null;
}

function normalized(lengths: LinkLengths) {
  const scale = Math.max(lengths.a, lengths.b, lengths.c, lengths.d);
  return {
    a: lengths.a / scale, b: lengths.b / scale,
    c: lengths.c / scale, d: lengths.d / scale, scale,
  };
}

export function classifyLinkage(lengths: LinkLengths): Classification {
  const issue = lengthIssue(lengths);
  const empty: Classification = {
    kind: 'invalid', criterion: 'invalid', title: 'Invalid lengths',
    explanation: issue ?? '', shortest: [], shortLong: null, middleSum: null,
    inputFullTurn: false, outputFullTurn: false,
  };
  if (issue) return empty;
  const { a, b, c, d, scale } = normalized(lengths);
  const ordered = (Object.entries({ a, b, c, d }) as [LinkId, number][])
    .sort((left, right) => left[1] - right[1]);
  const [s, p, q, l] = ordered.map((entry) => entry[1]);
  const shortest = ordered.filter((entry) => Math.abs(entry[1] - s) <= EPSILON).map((entry) => entry[0]);
  const common = {
    ...empty, shortest, shortLong: (s + l) * scale, middleSum: (p + q) * scale,
  };
  if (l > s + p + q + EPSILON) {
    return {
      ...common, kind: 'impossible', title: 'No assembly possible',
      explanation: 'The longest link exceeds the other three combined. No input angle can close this chain.',
    };
  }
  if (Math.abs(l - s - p - q) <= EPSILON) {
    return {
      ...common, kind: 'degenerate', criterion: 'degenerate', title: 'Collinear limit',
      explanation: 'The longest link equals the other three combined. Only an isolated, straightened pose closes; there is no useful motion.',
    };
  }

  const inputFullTurn = Math.abs(d - a) >= Math.abs(b - c) - EPSILON && d + a <= b + c + EPSILON;
  const outputFullTurn = Math.abs(d - c) >= Math.abs(a - b) - EPSILON && d + c <= a + b + EPSILON;
  const difference = s + l - p - q;
  if (Math.abs(difference) <= EPSILON) {
    return {
      ...common, kind: 'change-point', criterion: 'equality', title: 'Change-point linkage',
      inputFullTurn, outputFullTurn,
      explanation: `s + l equals p + q. Collinear change points join the two assemblies. ${
        inputFullTurn ? 'All input angles have a geometric closure, but singular positions do not determine a unique continuation.'
          : 'This inversion still limits the input to rocking arcs.'
      } Equality is not a guarantee of a freely turning crank.`,
    };
  }
  if (difference > 0) {
    return {
      ...common, kind: 'double-rocker', criterion: 'non-grashof', title: 'Double rocker',
      explanation: 'Non-Grashof: s + l > p + q. Both links attached to ground rock through limited arcs; neither can make a full turn.',
    };
  }
  const key = ordered[0][0];
  const families = {
    d: {
      kind: 'double-crank', title: 'Double crank',
      explanation: 'Grashof, with ground d shortest. Both ground-adjacent links can revolve fully: this is the drag-link inversion.',
    },
    a: {
      kind: 'crank-rocker', title: 'Crank–rocker',
      explanation: 'Grashof, with input a shortest. The input revolves fully; output c rocks. Fixing a neighbor of the shortest link makes this inversion.',
    },
    c: {
      kind: 'rocker-crank', title: 'Rocker–crank',
      explanation: 'Grashof, with output c shortest. The output can revolve fully, but the chosen input a only rocks. A full-turn output does not make this input a crank.',
    },
    b: {
      kind: 'double-rocker', title: 'Double rocker',
      explanation: 'Grashof, with coupler b shortest and opposite ground. Both grounded links rock. Grashof alone does not imply crank–rocker motion.',
    },
  } as const;
  return { ...common, ...families[key], criterion: 'grashof', inputFullTurn, outputFullTurn };
}

function failure(status: Solution['status'], reason: string, message: string): Solution {
  return { status, reason, message, pose: null };
}

export function solveFourBar(
  lengths: LinkLengths,
  angle: number,
  branch: AssemblyBranch = 'plus',
  coupler: CouplerLocation = { fraction: 0.5, offset: 0 },
): Solution {
  const issue = lengthIssue(lengths);
  if (issue) return failure('invalid', 'lengths', issue);
  if (!Number.isFinite(angle) || !Number.isFinite(coupler.fraction) || !Number.isFinite(coupler.offset)
    || (branch !== 'plus' && branch !== 'minus')) {
    return failure('invalid', 'parameters', 'Angle, fraction and offset must be finite; choose the + or − assembly.');
  }
  const { a, b, c, d, scale } = normalized(lengths);
  const longest = Math.max(a, b, c, d);
  if (longest > a + b + c + d - longest + EPSILON) {
    return failure('impossible', 'longest-link', 'No angle closes: the longest link is longer than the other three combined.');
  }
  const theta = normalizeAngle(angle);
  const B = { x: a * Math.cos(theta), y: a * Math.sin(theta) };
  const dx = d - B.x;
  const dy = -B.y;
  const separation = Math.hypot(dx, dy);
  const minimum = Math.abs(b - c);
  const maximum = b + c;

  if (separation <= EPSILON) {
    return Math.abs(b - c) <= EPSILON
      ? failure('coincident', 'coincident-circles', 'B and D coincide, with equal circle radii. Infinitely many C positions exist; neither assembly defines a unique pose.')
      : failure('unreachable', 'concentric-circles', 'B and D coincide, but the circle radii differ. Concentric circles do not intersect.');
  }
  if (separation > maximum + EPSILON) {
    return failure('unreachable', 'separate-circles', 'B and D are too far apart: |BD| > b + c. The two circles do not meet.');
  }
  if (separation < minimum - EPSILON) {
    return failure('unreachable', 'contained-circles', 'One closure circle lies inside the other: |BD| < |b − c|. There is no intersection.');
  }

  // Normalize before squaring, and factor the difference of squares near tangency.
  const along = (separation * separation + (b - c) * (b + c)) / (2 * separation);
  const externalTangent = Math.abs(separation - maximum) <= EPSILON;
  const internalTangent = Math.abs(separation - minimum) <= EPSILON;
  const tangent = externalTangent || internalTangent;
  const heightSquared = (b - along) * (b + along);
  if (heightSquared < -EPSILON) {
    return failure('invalid', 'precision', 'This near-singular geometry exceeds numerical resolution. Move slightly away from the dead center.');
  }
  const height = tangent ? 0 : Math.sqrt(Math.max(0, heightSquared));
  const ux = dx / separation;
  const uy = dy / separation;
  const sign = branch === 'plus' ? 1 : -1;
  const C = {
    x: B.x + along * ux - sign * height * uy,
    y: B.y + along * uy + sign * height * ux,
  };
  const offset = coupler.offset / scale;
  const P = {
    x: B.x + coupler.fraction * (C.x - B.x) - offset * (C.y - B.y) / b,
    y: B.y + coupler.fraction * (C.y - B.y) + offset * (C.x - B.x) / b,
  };
  const world = (point: Point): Point => ({ x: point.x * scale, y: point.y * scale });
  const pose: Pose = {
    A: { x: 0, y: 0 }, B: world(B), C: world(C), D: { x: lengths.d, y: 0 }, P: world(P),
    inputAngle: theta,
    couplerAngle: Math.atan2(C.y - B.y, C.x - B.x),
    outputAngle: Math.atan2(C.y, C.x - d),
    separation: separation * scale,
    closureError: Math.max(
      Math.abs(Math.hypot(B.x, B.y) - a),
      Math.abs(Math.hypot(C.x - B.x, C.y - B.y) - b),
      Math.abs(Math.hypot(C.x - d, C.y) - c),
    ) * scale,
  };
  const values = [
    ...Object.values(pose.B), ...Object.values(pose.C), ...Object.values(pose.P),
    pose.separation, pose.closureError,
  ];
  if (!values.every(Number.isFinite)) {
    return failure('invalid', 'precision', 'The requested point exceeds numerical resolution. Reduce the fraction or offset.');
  }
  return {
    status: tangent ? 'tangent' : 'closed',
    reason: tangent ? externalTangent ? 'external-tangent' : 'internal-tangent' : 'two-intersections',
    message: tangent
      ? 'Dead center: the circles touch at one C. The + and − assemblies meet here; force and continuation are not predicted.'
      : 'Two circle intersections exist. The selected signed assembly determines C and the coupler point P.',
    pose,
  };
}

export function reachableIntervals(lengths: LinkLengths): AngleInterval[] {
  if (lengthIssue(lengths)) return [];
  const { a, b, c, d } = normalized(lengths);
  const near = Math.abs(d - a);
  const far = d + a;
  const lower = Math.abs(b - c);
  const upper = b + c;
  if (lower > far + EPSILON || upper < near - EPSILON) return [];
  const atDistance = (distance: number) => Math.acos(Math.max(-1, Math.min(1,
    1 - (distance - near) * (distance + near) / (2 * a * d),
  )));
  const start = lower <= near + EPSILON ? 0 : atDistance(lower);
  const end = upper >= far - EPSILON ? Math.PI : atDistance(upper);
  if (start > end + EPSILON) return [];
  if (start === 0 && end === Math.PI) return [{ start: 0, end: TAU }];
  if (end === Math.PI) return [{ start, end: TAU - start }];
  if (start === end && start === 0) return [{ start: 0, end: 0 }];
  return [{ start, end }, { start: TAU - end, end: TAU - start }];
}

export function sampleTrace(
  lengths: LinkLengths,
  branch: AssemblyBranch,
  coupler: CouplerLocation,
  samples = 900,
): CouplerTrace {
  if (!Number.isInteger(samples) || samples < 16 || samples > 8192) {
    throw new RangeError('Trace resolution must be an integer between 16 and 8192.');
  }
  const intervals = reachableIntervals(lengths);
  const segments: TraceSample[][] = [];
  for (const interval of intervals) {
    const span = interval.end - interval.start;
    const steps = span === 0 ? 0 : Math.max(1, Math.ceil(span / TAU * samples));
    let segment: TraceSample[] = [];
    for (let index = 0; index <= steps; index++) {
      const angle = steps === 0 ? interval.start : interval.start + span * index / steps;
      const { pose } = solveFourBar(lengths, angle, branch, coupler);
      if (pose) {
        segment.push({ angle, point: pose.P, B: pose.B, C: pose.C });
      } else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    }
    if (segment.length) segments.push(segment);
  }
  return {
    segments, intervals,
    reachableFraction: intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0) / TAU,
  };
}

export function sampleWindow(
  lengths: LinkLengths, branch: AssemblyBranch, coupler: CouplerLocation,
  start: number, end: number,
): TraceSample[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > TAU) return [];
  const result: TraceSample[] = [];
  for (let index = 0; index <= 120; index++) {
    const angle = start + (end - start) * index / 120;
    const { pose } = solveFourBar(lengths, angle, branch, coupler);
    if (!pose) return [];
    result.push({ angle, point: pose.P, B: pose.B, C: pose.C });
  }
  return result;
}

export function chordDeviation(samples: readonly TraceSample[]): { deviation: number; span: number } | null {
  if (samples.length < 2) return null;
  const first = samples[0].point;
  const last = samples[samples.length - 1].point;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) return null;
  const deviation = Math.max(...samples.map(({ point }) =>
    Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / span));
  return { deviation, span };
}

/** Stop at a reachable arc's end rather than stepping across an unsampled gap. */
export function advanceInput(
  lengths: LinkLengths, angle: number, increment: number,
): { angle: number; stopped: boolean } {
  if (!Number.isFinite(angle) || !Number.isFinite(increment) || increment < 0 || increment > TAU) {
    throw new RangeError('Advance requires a finite angle and an increment from zero to one turn.');
  }
  if (increment === 0) return { angle, stopped: false };
  const intervals = reachableIntervals(lengths);
  const current = normalizeAngle(angle);
  if (!solveFourBar(lengths, current).pose) return { angle, stopped: true };
  const interval = intervals.find((item) => current >= item.start - EPSILON && current <= item.end + EPSILON);
  if (!interval) return { angle, stopped: true };
  const next = current + increment;
  if (next <= interval.end) return { angle: next, stopped: false };
  if (interval.end < TAU) return { angle: interval.end, stopped: true };
  if (solveFourBar(lengths, 0).status === 'coincident') return { angle: TAU, stopped: true };
  const first = intervals.find((item) => item.start === 0);
  if (!first) return { angle: TAU, stopped: true };
  const wrapped = next - TAU;
  return wrapped > first.end
    ? { angle: first.end, stopped: true }
    : { angle: wrapped, stopped: false };
}
