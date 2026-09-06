export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Objective {
  id: string;
  bounds: Bounds;
  value: (point: Point) => number;
  gradient: (point: Point) => Point;
}

export const METHODS = ['gd', 'momentum', 'adam'] as const;
export type Method = (typeof METHODS)[number];
export type RunStatus = 'active' | 'stationary' | 'out-of-view' | 'diverged' | 'limit';

export const MOMENTUM_BETA = 0.9;
export const ADAM_BETA_1 = 0.9;
export const ADAM_BETA_2 = 0.999;
export const ADAM_EPSILON = 1e-8;
export const MAX_ITERATIONS = 400;
export const MIN_LEARNING_RATE = 0.0001;
export const MAX_LEARNING_RATE = 1;
export const POSITION_LIMIT = 1e6;
export const LOSS_LIMIT = 1e12;
export const GRADIENT_LIMIT = 1e12;
export const STATIONARY_TOLERANCE = 1e-8;

export interface Settings {
  learningRate: number;
}

export interface Sample {
  t: number;
  position: Point;
  loss: number;
  gradient: Point;
  delta: Point;
}

export interface Update {
  from: Point;
  usedGradient: Point;
  delta: Point;
  firstHat: Point | null;
  secondHat: Point | null;
}

export interface OptimizerRun {
  method: Method;
  iteration: number;
  attempts: number;
  position: Point;
  loss: number;
  gradient: Point;
  velocity: Point;
  firstMoment: Point;
  secondMoment: Point;
  lastUpdate: Update | null;
  history: readonly Sample[];
  status: RunStatus;
  reason: string;
}

const zero = (): Point => ({ x: 0, y: 0 });
const finitePoint = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);
export const magnitude = (point: Point): number => Math.hypot(point.x, point.y);

export function inBounds(point: Point, bounds: Bounds): boolean {
  return finitePoint(point) &&
    point.x >= bounds.xMin && point.x <= bounds.xMax &&
    point.y >= bounds.yMin && point.y <= bounds.yMax;
}

export function validateSettings(settings: Settings): void {
  if (!Number.isFinite(settings.learningRate) ||
      settings.learningRate < MIN_LEARNING_RATE || settings.learningRate > MAX_LEARNING_RATE) {
    throw new RangeError(`Learning rate must be between ${MIN_LEARNING_RATE} and ${MAX_LEARNING_RATE}.`);
  }
}

function unsafePosition(point: Point): string | undefined {
  if (!finitePoint(point)) return 'the proposed position is not finite';
  if (Math.max(Math.abs(point.x), Math.abs(point.y)) > POSITION_LIMIT) {
    return `a proposed coordinate exceeds the numerical safety bound of ${POSITION_LIMIT}`;
  }
  return undefined;
}

function unsafeEvaluation(loss: number, gradient: Point): string | undefined {
  if (!Number.isFinite(loss) || !finitePoint(gradient)) return 'the objective or derivative is not finite';
  if (Math.abs(loss) > LOSS_LIMIT) return `absolute loss exceeds the numerical safety bound of ${LOSS_LIMIT}`;
  if (Math.max(Math.abs(gradient.x), Math.abs(gradient.y)) > GRADIENT_LIMIT) {
    return `a derivative exceeds the numerical safety bound of ${GRADIENT_LIMIT}`;
  }
  return undefined;
}

export function createRun(objective: Objective, start: Point, settings: Settings, method: Method): OptimizerRun {
  validateSettings(settings);
  if (!METHODS.includes(method)) throw new RangeError('Unknown optimizer.');
  if (!inBounds(start, objective.bounds)) throw new RangeError('The starting point must be inside the displayed bounds.');
  const position = { ...start };
  const positionProblem = unsafePosition(position);
  if (positionProblem) throw new RangeError(positionProblem);
  const loss = objective.value(position);
  const gradient = objective.gradient(position);
  const problem = unsafeEvaluation(loss, gradient);
  if (problem) throw new RangeError(problem);
  return {
    method, iteration: 0, attempts: 0, position, loss, gradient,
    velocity: zero(), firstMoment: zero(), secondMoment: zero(), lastUpdate: null,
    history: [{ t: 0, position, loss, gradient, delta: zero() }],
    status: 'active',
    reason: 'Ready at the shared starting point. No updates yet.',
  };
}

export function createComparison(objective: Objective, start: Point, settings: Settings): OptimizerRun[] {
  return METHODS.map((method) => createRun(objective, start, settings, method));
}

export function stepRun(objective: Objective, run: OptimizerRun, settings: Settings): OptimizerRun {
  validateSettings(settings);
  if (run.status !== 'active') return run;
  if (run.iteration >= MAX_ITERATIONS) {
    return { ...run, status: 'limit', reason: `Reached the ${MAX_ITERATIONS}-update limit. This is not a convergence claim.` };
  }

  const t = run.iteration + 1;
  const alpha = settings.learningRate;
  const g = run.gradient;
  let velocity = run.velocity;
  let firstMoment = run.firstMoment;
  let secondMoment = run.secondMoment;
  let firstHat: Point | null = null;
  let secondHat: Point | null = null;
  let delta: Point;

  if (run.method === 'momentum') {
    // Heavy-ball momentum uses an unnormalized gradient accumulator, not an EMA.
    velocity = {
      x: MOMENTUM_BETA * run.velocity.x + g.x,
      y: MOMENTUM_BETA * run.velocity.y + g.y,
    };
    delta = { x: -alpha * velocity.x, y: -alpha * velocity.y };
  } else if (run.method === 'adam') {
    firstMoment = {
      x: ADAM_BETA_1 * run.firstMoment.x + (1 - ADAM_BETA_1) * g.x,
      y: ADAM_BETA_1 * run.firstMoment.y + (1 - ADAM_BETA_1) * g.y,
    };
    secondMoment = {
      x: ADAM_BETA_2 * run.secondMoment.x + (1 - ADAM_BETA_2) * g.x ** 2,
      y: ADAM_BETA_2 * run.secondMoment.y + (1 - ADAM_BETA_2) * g.y ** 2,
    };
    firstHat = {
      x: firstMoment.x / (1 - ADAM_BETA_1 ** t),
      y: firstMoment.y / (1 - ADAM_BETA_1 ** t),
    };
    secondHat = {
      x: secondMoment.x / (1 - ADAM_BETA_2 ** t),
      y: secondMoment.y / (1 - ADAM_BETA_2 ** t),
    };
    delta = {
      x: -alpha * firstHat.x / (Math.sqrt(secondHat.x) + ADAM_EPSILON),
      y: -alpha * firstHat.y / (Math.sqrt(secondHat.y) + ADAM_EPSILON),
    };
  } else {
    delta = { x: -alpha * g.x, y: -alpha * g.y };
  }

  const reject = (reason: string): OptimizerRun => ({
    ...run, attempts: run.attempts + 1, status: 'diverged',
    reason: `Update ${t} rejected: ${reason}. The last finite sample is retained; nothing was clamped.`,
  });
  const moments = [velocity, firstMoment, secondMoment, delta];
  if (firstHat) moments.push(firstHat);
  if (secondHat) moments.push(secondHat);
  if (!moments.every(finitePoint)) return reject('optimizer arithmetic is not finite');

  const position = { x: run.position.x + delta.x, y: run.position.y + delta.y };
  const positionProblem = unsafePosition(position);
  if (positionProblem) return reject(positionProblem);
  const loss = objective.value(position);
  const gradient = objective.gradient(position);
  const evaluationProblem = unsafeEvaluation(loss, gradient);
  if (evaluationProblem) return reject(evaluationProblem);

  let status: RunStatus = 'active';
  let reason = 'In bounds. A lower loss is not guaranteed on the next update.';
  if (!inBounds(position, objective.bounds)) {
    status = 'out-of-view';
    reason = `Stopped outside the displayed bounds at t = ${t}. The actual endpoint and loss are retained, not clamped. Out of view does not prove mathematical divergence.`;
  } else if (magnitude(gradient) <= STATIONARY_TOLERANCE && magnitude(delta) <= STATIONARY_TOLERANCE) {
    status = 'stationary';
    reason = 'Gradient and last step are both at most 10⁻⁸. This is a stationary point, not necessarily a minimum.';
  } else if (t >= MAX_ITERATIONS) {
    status = 'limit';
    reason = `Reached the ${MAX_ITERATIONS}-update limit. This is not a convergence claim.`;
  }

  return {
    method: run.method, iteration: t, attempts: run.attempts + 1,
    position, loss, gradient, velocity, firstMoment, secondMoment,
    lastUpdate: { from: run.position, usedGradient: g, delta, firstHat, secondHat },
    history: [...run.history, { t, position, loss, gradient, delta }],
    status, reason,
  };
}

export function stepComparison(objective: Objective, runs: readonly OptimizerRun[], settings: Settings): OptimizerRun[] {
  return runs.map((run) => stepRun(objective, run, settings));
}

export function signedLog(value: number): number {
  return Math.sign(value) * Math.log1p(Math.abs(value)) / Math.LN10;
}

export function inverseSignedLog(value: number): number {
  return Math.sign(value) * Math.expm1(Math.abs(value) * Math.LN10);
}
