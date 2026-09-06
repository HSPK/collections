import type { Method, Objective, Point } from './engine';

export interface Surface extends Objective {
  name: string;
  subtitle: string;
  formula: string;
  derivativeX: string;
  derivativeY: string;
  note: string;
  start: Point;
  learningRate: number;
  levels: readonly number[];
  landmark: { point: Point; label: string };
}

export const SURFACES: readonly Surface[] = [
  {
    id: 'bowl',
    name: 'Anisotropic bowl',
    subtitle: 'One minimum. Two different slopes.',
    formula: 'L(x, y) = ½(x² + 4y²)',
    derivativeX: '∂L/∂x = x',
    derivativeY: '∂L/∂y = 4y',
    note: 'The y direction is four times as curved. The same learning rate can feel slow along x and jumpy along y.',
    bounds: { xMin: -3.2, xMax: 3.2, yMin: -2.4, yMax: 2.4 },
    start: { x: -2.4, y: 1.65 },
    learningRate: 0.08,
    levels: [0.1, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 10, 12, 16],
    value: ({ x, y }) => (x * x + 4 * y * y) / 2,
    gradient: ({ x, y }) => ({ x, y: 4 * y }),
    landmark: { point: { x: 0, y: 0 }, label: 'minimum · (0, 0)' },
  },
  {
    id: 'valley',
    name: 'Rosenbrock valley',
    subtitle: 'A narrow path with a difficult bend.',
    formula: 'L(x, y) = [(1 − x)² + 100(y − x²)²] / 50',
    derivativeX: '∂L/∂x = 0.04(x − 1) − 8x(y − x²)',
    derivativeY: '∂L/∂y = 4(y − x²)',
    note: 'Rosenbrock is scaled by 1/50, including its derivatives. Reaching the valley floor is easier than following it to (1, 1).',
    bounds: { xMin: -2, xMax: 2, yMin: -1, yMax: 3 },
    start: { x: -1.35, y: 1.2 },
    learningRate: 0.025,
    levels: [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 4, 8, 16, 32],
    value: ({ x, y }) => ((1 - x) ** 2 + 100 * (y - x * x) ** 2) / 50,
    gradient: ({ x, y }) => ({
      x: 0.04 * (x - 1) - 8 * x * (y - x * x),
      y: 4 * (y - x * x),
    }),
    landmark: { point: { x: 1, y: 1 }, label: 'minimum · (1, 1)' },
  },
  {
    id: 'saddle',
    name: 'Open saddle',
    subtitle: 'Downhill does not always end in a minimum.',
    formula: 'L(x, y) = ½(x² − y²)',
    derivativeX: '∂L/∂x = x',
    derivativeY: '∂L/∂y = −y',
    note: 'There is no finite minimum: loss falls without bound along y. At exactly (0, 0), all three methods are stationary.',
    bounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
    start: { x: -2, y: 0.18 },
    learningRate: 0.08,
    levels: [-4, -2, -1, -0.5, -0.15, 0, 0.15, 0.5, 1, 2, 4],
    value: ({ x, y }) => (x * x - y * y) / 2,
    gradient: ({ x, y }) => ({ x, y: -y }),
    landmark: { point: { x: 0, y: 0 }, label: 'saddle · not a minimum' },
  },
];

export interface OptimizerInfo {
  id: Method;
  name: string;
  shortName: string;
  color: string;
  dash: number[];
  rule: string;
  explanation: string;
}

export const OPTIMIZERS: readonly OptimizerInfo[] = [
  {
    id: 'gd', name: 'Gradient descent', shortName: 'Descent', color: '#d6f975', dash: [],
    rule: 'Δθₜ = −αgₜ',
    explanation: 'Only the current slope matters. The step points opposite the gradient and is scaled by α.',
  },
  {
    id: 'momentum', name: 'Momentum', shortName: 'Momentum', color: '#ff9a84', dash: [9, 5],
    rule: 'vₜ = 0.9vₜ₋₁ + gₜ; Δθₜ = −αvₜ',
    explanation: 'A heavy-ball accumulator remembers earlier gradients. It can carry the step through a turn or past a minimum.',
  },
  {
    id: 'adam', name: 'Adam', shortName: 'Adam', color: '#81d4f7', dash: [3, 4],
    rule: 'Δθₜ = −αm̂ₜ / (√v̂ₜ + 10⁻⁸)',
    explanation: 'Bias-corrected averages of gradients and squared gradients give each coordinate its own effective scale.',
  },
];

export interface Challenge {
  id: string;
  title: string;
  question: string;
  surfaceId: string;
  start: Point;
  learningRate: number;
  observation: string;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'bounce-budget',
    title: 'The bounce budget',
    question: 'Can a lower loss hide an unstable direction?',
    surfaceId: 'bowl',
    start: { x: -2.1, y: 1.25 },
    learningRate: 0.55,
    observation: 'Step four times. Descent amplifies y by −1.2 each update and leaves the map. Reset with α = 0.08 to make the same start settle.',
  },
  {
    id: 'around-the-bend',
    title: 'Around the bend',
    question: 'Why does a steep first drop turn into a crawl?',
    surfaceId: 'valley',
    start: { x: -1.35, y: 1.2 },
    learningRate: 0.025,
    observation: 'Compare the paths at 40 updates. Inspect the current gradient: crossing the narrow valley is not the same as moving along it.',
  },
  {
    id: 'false-finish',
    title: 'The false finish',
    question: 'Is a zero gradient always a solved problem?',
    surfaceId: 'saddle',
    start: { x: 0, y: 0 },
    learningRate: 0.08,
    observation: 'Step once at the origin. Then set y = 0.1 and try again. A stationary saddle is not a minimum; the perturbed loss has no finite floor.',
  },
];

export function getSurface(id: string): Surface {
  return SURFACES.find((surface) => surface.id === id) ?? SURFACES[0];
}

export function getOptimizer(method: Method): OptimizerInfo {
  return OPTIMIZERS.find((optimizer) => optimizer.id === method)!;
}
