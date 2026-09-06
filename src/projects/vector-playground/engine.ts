export interface Vec2 {
  x: number;
  y: number;
}

/** Row-major: A(x, y) = (ax + by, cx + dy). Its columns are (a, c), (b, d). */
export interface Mat2 {
  a: number;
  b: number;
  c: number;
  d: number;
}

export const RANK_TOLERANCE = 1e-10;

export const dot = (u: Vec2, v: Vec2): number => u.x * v.x + u.y * v.y;
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const scaleVector = (v: Vec2, amount: number): Vec2 => ({ x: v.x * amount, y: v.y * amount });
export const add = (u: Vec2, v: Vec2): Vec2 => ({ x: u.x + v.x, y: u.y + v.y });
export const subtract = (u: Vec2, v: Vec2): Vec2 => ({ x: u.x - v.x, y: u.y - v.y });
export const transform = (matrix: Mat2, v: Vec2): Vec2 => ({
  x: matrix.a * v.x + matrix.b * v.y,
  y: matrix.c * v.x + matrix.d * v.y,
});
export const determinant = (matrix: Mat2): number => matrix.a * matrix.d - matrix.b * matrix.c;

export interface MatrixAnalysis {
  determinant: number;
  area: number;
  rank: 0 | 1 | 2;
  nearSingular: boolean;
  orientation: 'preserved' | 'reversed' | 'collapsed';
}

export function analyzeMatrix(matrix: Mat2): MatrixAnalysis {
  const det = determinant(matrix);
  const magnitude = Math.max(Math.abs(matrix.a), Math.abs(matrix.b), Math.abs(matrix.c), Math.abs(matrix.d));
  const normalizedDet = magnitude === 0 ? 0
    : (matrix.a / magnitude) * (matrix.d / magnitude) - (matrix.b / magnitude) * (matrix.c / magnitude);
  const rank = magnitude === 0 ? 0 : Math.abs(normalizedDet) <= RANK_TOLERANCE ? 1 : 2;
  return {
    determinant: det,
    area: Math.abs(det),
    rank,
    nearSingular: rank === 1 && det !== 0,
    orientation: rank < 2 ? 'collapsed' : det < 0 ? 'reversed' : 'preserved',
  };
}

export interface ProjectionAnalysis {
  dot: number;
  sourceLength: number;
  directionLength: number;
  projected: Vec2 | null;
  residual: Vec2 | null;
  coefficient: number | null;
  signedLength: number | null;
  cosine: number | null;
  angleDegrees: number | null;
}

export function project(source: Vec2, direction: Vec2): ProjectionAnalysis {
  const sourceLength = length(source);
  const directionLength = length(direction);
  const product = dot(source, direction);
  if (directionLength === 0) {
    return {
      dot: product, sourceLength, directionLength, projected: null, residual: null,
      coefficient: null, signedLength: null, cosine: null, angleDegrees: null,
    };
  }
  const unit = { x: direction.x / directionLength, y: direction.y / directionLength };
  const signedLength = dot(source, unit);
  const projected = scaleVector(unit, signedLength);
  const cosine = sourceLength === 0 ? null : Math.min(1, Math.max(-1, signedLength / sourceLength));
  return {
    dot: product, sourceLength, directionLength, projected,
    residual: subtract(source, projected),
    coefficient: signedLength / directionLength,
    signedLength,
    cosine,
    angleDegrees: cosine === null ? null : Math.acos(cosine) * 180 / Math.PI,
  };
}

export function projectionMatrix(direction: Vec2): Mat2 | null {
  const magnitude = length(direction);
  if (magnitude === 0) return null;
  const x = direction.x / magnitude;
  const y = direction.y / magnitude;
  return { a: x * x, b: x * y, c: x * y, d: y * y };
}

export interface EigenDirection {
  value: number;
  direction: Vec2;
}

export type EigenAnalysis =
  | { kind: 'complex'; real: number; imaginary: number; directions: [] }
  | { kind: 'all'; value: number; directions: [] }
  | { kind: 'defective'; value: number; directions: [EigenDirection] }
  | { kind: 'distinct'; directions: [EigenDirection, EigenDirection] };

function nullDirection(matrix: Mat2, value: number): Vec2 {
  const firstRow = { x: matrix.a - value, y: matrix.b };
  const secondRow = { x: matrix.c, y: matrix.d - value };
  const row = length(firstRow) >= length(secondRow) ? firstRow : secondRow;
  const magnitude = length(row);
  const vector = { x: -row.y / magnitude, y: row.x / magnitude };
  return vector.x < 0 || (vector.x === 0 && vector.y < 0) ? scaleVector(vector, -1) : vector;
}

export function eigenDirections(matrix: Mat2): EigenAnalysis {
  const magnitude = Math.max(Math.abs(matrix.a), Math.abs(matrix.b), Math.abs(matrix.c), Math.abs(matrix.d));
  if (magnitude === 0) return { kind: 'all', value: 0, directions: [] };
  const normalized = {
    a: matrix.a / magnitude, b: matrix.b / magnitude,
    c: matrix.c / magnitude, d: matrix.d / magnitude,
  };
  const halfTrace = (normalized.a + normalized.d) / 2;
  // In the UI's bounded range, original entries avoid introducing cancellation by normalization.
  const directDiscriminant = magnitude >= 1e-150 && magnitude <= 1e150;
  const working = directDiscriminant ? matrix : normalized;
  const discriminantScale = directDiscriminant ? 1 : magnitude;
  const difference = (working.a - working.d) / 2;
  const diagonalTerm = difference ** 2;
  const crossTerm = working.b * working.c;
  const discriminant = diagonalTerm + crossTerm;
  let imaginary = discriminant < 0;
  let workingRoot = Math.sqrt(Math.abs(discriminant));
  // Taking square roots before multiplying preserves products that would underflow to signed zero.
  if ((difference !== 0 && diagonalTerm === 0) ||
      (working.b !== 0 && working.c !== 0 && crossTerm === 0)) {
    const crossRoot = Math.sqrt(Math.abs(working.b)) * Math.sqrt(Math.abs(working.c));
    const opposing = (working.b < 0) !== (working.c < 0) && working.b !== 0 && working.c !== 0;
    const diagonalRoot = Math.abs(difference);
    imaginary = opposing && crossRoot > diagonalRoot;
    workingRoot = opposing
      ? Math.sqrt(Math.abs(diagonalRoot - crossRoot)) * Math.sqrt(diagonalRoot + crossRoot)
      : Math.hypot(diagonalRoot, crossRoot);
  }
  if (imaginary) {
    return { kind: 'complex', real: halfTrace * magnitude, imaginary: workingRoot * discriminantScale, directions: [] };
  }
  const centered = { a: difference, b: working.b, c: working.c, d: -difference };
  if (workingRoot === 0) {
    const value = halfTrace * magnitude;
    if (working.b === 0 && working.c === 0 && working.a === working.d) {
      return { kind: 'all', value, directions: [] };
    }
    return {
      kind: 'defective', value,
      directions: [{ value, direction: nullDirection(centered, 0) }],
    };
  }
  const root = workingRoot * (discriminantScale / magnitude);
  const first = halfTrace + (halfTrace >= 0 ? root : -root);
  // Recover the other root from their product to avoid subtracting two almost equal numbers.
  const second = determinant(normalized) / first;
  const larger = halfTrace >= 0 ? first : second;
  const smaller = halfTrace >= 0 ? second : first;
  // Solve after removing the trace so almost equal eigenvalues do not erase their directions.
  return {
    kind: 'distinct',
    directions: [
      { value: larger * magnitude, direction: nullDirection(centered, workingRoot) },
      { value: smaller * magnitude, direction: nullDirection(centered, -workingRoot) },
    ],
  };
}

export function formatNumber(value: number, digits = 3): string {
  if (value === 0 || Object.is(value, -0)) return '0';
  if (Math.abs(value) < 10 ** -digits || Math.abs(value) >= 1e5) {
    return value.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e');
  }
  return Number(value.toFixed(digits)).toString();
}

export const formatVector = (vector: Vec2): string => `(${formatNumber(vector.x)}, ${formatNumber(vector.y)})`;
