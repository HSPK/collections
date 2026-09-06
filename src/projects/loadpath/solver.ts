import { AXES, GRAVITY, ModelError, cross, currentCase, dot, length, parseModel, subtract } from './schema';
import type { Structure, Vector3 } from './schema';

export interface MemberResult {
  id: string; length: number; extension: number; force: number; stress: number;
  strain: number; energy: number; mass: number; eulerLoad: number; eulerRatio: number;
}
export interface NodeResult { id: string; displacement: Vector3; applied: Vector3; reaction: Vector3 }
export interface Solved {
  status: 'stable'; message: string; nodes: NodeResult[]; members: MemberResult[];
  freeDofs: number; minScaledPivot: number | null; mass: number; weight: number;
  energy: number; externalWork: number; maxDisplacement: number; maxTension: number; maxCompression: number;
  maxStress: number; freeResidual: number; relativeResidual: number;
  applied: Vector3; reaction: Vector3; balance: Vector3; momentBalance: Vector3;
  warnings: string[];
}
export interface Unsolved {
  status: 'invalid' | 'unstable' | 'ill-conditioned'; message: string; freeDofs: number;
}
export type Analysis = Solved | Unsolved;
export const PIVOT_LIMIT = 1e-10;
export interface Assembly {
  stiffness: Float64Array; loads: Float64Array; free: number[]; size: number; mass: number; weight: number;
}
/** Global coordinates are Y-up. All arguments and results use metres, newtons, pascals and kilograms. */
export function assemble(input: Structure): Assembly {
  return assembleValidated(parseModel(input));
}
function assembleValidated(model: Structure): Assembly {
  const n = model.nodes.length * 3;
  const stiffness = new Float64Array(n * n);
  const loads = new Float64Array(n);
  const free: number[] = [];
  const nodeIndex = new Map(model.nodes.map((node, i) => [node.id, i]));
  const loadCase = currentCase(model);
  let mass = 0;
  for (const load of loadCase.loads) {
    const i = nodeIndex.get(load.node)!;
    for (let axis = 0; axis < 3; axis++) loads[3 * i + axis] += load.force[axis];
  }
  for (const member of model.members) {
    const a = nodeIndex.get(member.a)!;
    const b = nodeIndex.get(member.b)!;
    const delta = subtract(model.nodes[b].position, model.nodes[a].position);
    const span = length(delta);
    const section = model.sections.find((s) => s.id === member.section)!;
    const material = model.materials.find((m) => m.id === member.material)!;
    const k = material.elasticModulus * section.area / span;
    const memberMass = material.density * section.area * span;
    mass += memberMass;
    if (loadCase.selfWeight) {
      loads[a * 3 + 1] -= memberMass * GRAVITY / 2;
      loads[b * 3 + 1] -= memberMass * GRAVITY / 2;
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const term = k * (delta[i] / span) * (delta[j] / span);
      stiffness[(3 * a + i) * n + 3 * a + j] += term;
      stiffness[(3 * b + i) * n + 3 * b + j] += term;
      stiffness[(3 * a + i) * n + 3 * b + j] -= term;
      stiffness[(3 * b + i) * n + 3 * a + j] -= term;
    }
  }
  model.nodes.forEach((node, i) => node.restraints.forEach((fixed, axis) => { if (!fixed) free.push(i * 3 + axis); }));
  return { stiffness, loads, free, size: n, mass, weight: loadCase.selfWeight ? mass * GRAVITY : 0 };
}
export function analyze(input: Structure): Analysis {
  let model: Structure;
  try { model = parseModel(input); }
  catch (error) {
    if (!(error instanceof ModelError)) throw error;
    return { status: 'invalid', message: error.message, freeDofs: 0 };
  }
  const { stiffness: K, loads: F, free, size: n, mass, weight } = assembleValidated(model);
  const nf = free.length;
  const L = new Float64Array(nf * nf);
  const scale = new Float64Array(nf);
  const u = new Float64Array(n);
  let minScaledPivot = 1;
  const dofName = (dof: number) => `${model.nodes[Math.floor(dof / 3)].id} / ${AXES[dof % 3]}`;
  for (let i = 0; i < nf; i++) {
    const diagonal = K[free[i] * n + free[i]];
    if (!(diagonal > 0)) return { status: 'unstable', message: `${dofName(free[i])} has no axial stiffness. Add a non-coplanar brace or an intentional restraint. No result is available.`, freeDofs: nf };
    scale[i] = Math.sqrt(diagonal);
  }
  // Cholesky of D^-1 Kff D^-1: scaling avoids units/property magnitude dominating the pivot test.
  // These are Schur-complement pivots, NOT eigenvalues or a condition number.
  for (let i = 0; i < nf; i++) for (let j = 0; j <= i; j++) {
    let sum = K[free[i] * n + free[j]] / (scale[i] * scale[j]);
    for (let k = 0; k < j; k++) sum -= L[i * nf + k] * L[j * nf + k];
    if (i === j) {
      minScaledPivot = Math.min(minScaledPivot, sum);
      if (!Number.isFinite(sum) || sum <= PIVOT_LIMIT) {
        const status = sum > 1e-13 ? 'ill-conditioned' : 'unstable';
        return { status, freeDofs: nf, message: `${status === 'unstable' ? 'A mechanism or unrestrained rigid motion' : 'An excessively soft or near-mechanism direction'} was detected at elimination DOF ${dofName(free[i])}. Scaled pivot ${sum.toExponential(2)} is below ${PIVOT_LIMIT}. This DOF is a diagnostic, not necessarily the missing brace. No stiffness or restraints were added.` };
      }
      L[i * nf + j] = Math.sqrt(sum);
    } else L[i * nf + j] = sum / L[j * nf + j];
  }
  const y = new Float64Array(nf);
  const q = new Float64Array(nf);
  for (let i = 0; i < nf; i++) {
    let value = F[free[i]] / scale[i];
    for (let j = 0; j < i; j++) value -= L[i * nf + j] * y[j];
    y[i] = value / L[i * nf + i];
  }
  for (let i = nf - 1; i >= 0; i--) {
    let value = y[i];
    for (let j = i + 1; j < nf; j++) value -= L[j * nf + i] * q[j];
    q[i] = value / L[i * nf + i];
    u[free[i]] = q[i] / scale[i];
  }
  if (!u.every(Number.isFinite)) return { status: 'ill-conditioned', message: 'The solution is not finite. Reduce property contrasts and check bracing.', freeDofs: nf };
  const residual = new Float64Array(n);
  let normK = 0;
  for (let i = 0; i < n; i++) {
    let value = -F[i];
    let rowNorm = 0;
    for (let j = 0; j < n; j++) { value += K[i * n + j] * u[j]; rowNorm += Math.abs(K[i * n + j]); }
    residual[i] = value;
    normK = Math.max(normK, rowNorm);
  }
  const freeResidual = free.reduce((max, i) => Math.max(max, Math.abs(residual[i])), 0);
  const relativeResidual = freeResidual / Math.max(1, normK * Math.max(...u.map(Math.abs)) + Math.max(...F.map(Math.abs)));
  if (relativeResidual > 1e-9) return { status: 'ill-conditioned', message: 'The free-DOF backward residual exceeds 1e-9. Results are withheld; inspect restraints and stiffness contrasts.', freeDofs: nf };
  const applied: Vector3 = [0, 0, 0];
  const reaction: Vector3 = [0, 0, 0];
  const momentBalance: Vector3 = [0, 0, 0];
  const nodes: NodeResult[] = model.nodes.map((node, i) => {
    const local: NodeResult = { id: node.id, displacement: [u[3 * i], u[3 * i + 1], u[3 * i + 2]], applied: [F[3 * i], F[3 * i + 1], F[3 * i + 2]], reaction: [residual[3 * i], residual[3 * i + 1], residual[3 * i + 2]] };
    const balance: Vector3 = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      const r = node.restraints[axis] ? local.reaction[axis] : 0;
      applied[axis] += local.applied[axis];
      reaction[axis] += r;
      balance[axis] = local.applied[axis] + r;
    }
    const moment = cross(node.position, balance);
    for (let axis = 0; axis < 3; axis++) momentBalance[axis] += moment[axis];
    return local;
  });
  const nodeMap = new Map(model.nodes.map((node, i) => [node.id, i]));
  const members = model.members.map((member): MemberResult => {
    const a = nodeMap.get(member.a)!;
    const b = nodeMap.get(member.b)!;
    const delta = subtract(model.nodes[b].position, model.nodes[a].position);
    const span = length(delta);
    const section = model.sections.find((s) => s.id === member.section)!;
    const material = model.materials.find((m) => m.id === member.material)!;
    const extension = dot(subtract(nodes[b].displacement, nodes[a].displacement), delta) / span;
    const force = material.elasticModulus * section.area / span * extension;
    const inertia = section.area ** 2 / (4 * Math.PI); // Solid circular section, I = pi*d^4/64.
    const eulerLoad = Math.PI ** 2 * material.elasticModulus * inertia / span ** 2;
    return { id: member.id, length: span, extension, force, stress: force / section.area, strain: extension / span, energy: 0.5 * force * extension, mass: material.density * section.area * span, eulerLoad, eulerRatio: Math.max(0, -force) / eulerLoad };
  });
  const maxDisplacement = Math.max(...nodes.map((node) => length(node.displacement)));
  const characteristicSpan = Math.max(...members.map((member) => member.length), 0.01);
  const warnings: string[] = [];
  if (maxDisplacement / characteristicSpan > 0.01) warnings.push('Displacement exceeds 1% of the longest member. The small-displacement assumption may be unsuitable.');
  if (members.some((member) => Math.abs(member.strain) > 0.002)) warnings.push('Axial strain exceeds 0.2%. No yield or material nonlinearity is modeled.');
  if (members.some((member) => member.eulerRatio > 1)) warnings.push('At least one compression member exceeds its ideal pin-ended Euler load. The linear solution does not simulate buckling.');
  if (minScaledPivot < 1e-6) warnings.push('A small scaled Cholesky pivot indicates a sensitive stiffness system. This is not a condition number.');
  return {
    status: 'stable', message: 'Axial equilibrium solved. This is not a safety or code-compliance verdict.',
    nodes, members, freeDofs: nf, minScaledPivot: nf ? minScaledPivot : null, mass, weight,
    energy: members.reduce((sum, m) => sum + m.energy, 0), externalWork: u.reduce((sum, d, i) => sum + F[i] * d, 0),
    maxDisplacement, maxTension: Math.max(0, ...members.map((m) => m.force)),
    maxCompression: Math.min(0, ...members.map((m) => m.force)), maxStress: Math.max(0, ...members.map((m) => Math.abs(m.stress))),
    freeResidual, relativeResidual, applied, reaction,
    balance: [applied[0] + reaction[0], applied[1] + reaction[1], applied[2] + reaction[2]], momentBalance, warnings,
  };
}
