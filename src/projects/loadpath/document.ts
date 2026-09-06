import { LIMITS, ModelError, cloneModel, parseModel } from './schema';
import type { Structure } from './schema';
import type { Analysis } from './solver';
import { matchAnalysis } from './result-lookup';

export interface DocumentV1 { format: 'loadpath'; version: 1; units: 'SI'; model: Structure }
export function serialize(model: Structure): string {
  const document: DocumentV1 = { format: 'loadpath', version: 1, units: 'SI', model: parseModel(model) };
  const encoder = new TextEncoder();
  const pretty = JSON.stringify(document, null, 2);
  if (encoder.encode(pretty).byteLength <= LIMITS.importBytes) return pretty;
  const compact = JSON.stringify(document);
  if (encoder.encode(compact).byteLength > LIMITS.importBytes) {
    throw new ModelError('JSON export exceeds the 150,000-byte import limit even without whitespace. Reduce the model or shorten its labels before saving.');
  }
  return compact;
}
export function deserialize(source: string): Structure {
  if (new TextEncoder().encode(source).byteLength > LIMITS.importBytes) throw new ModelError('Import exceeds the 150 kB limit.');
  let data: unknown;
  try { data = JSON.parse(source); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ModelError('This is not valid JSON. Your current design is unchanged.');
  }
  if (typeof data !== 'object' || data === null || !('format' in data) || data.format !== 'loadpath'
    || !('version' in data) || data.version !== 1 || !('units' in data) || data.units !== 'SI' || !('model' in data)) {
    throw new ModelError('Use a LOADPATH version 1 document with SI units. Your current design is unchanged.');
  }
  return parseModel(data.model);
}
export interface ResetOrigin { baseline: Structure; presetId: string | null }
interface HistoryState { model: Structure; origin: ResetOrigin }
function validateOrigin(origin: ResetOrigin): ResetOrigin {
  if (origin.presetId !== null && (typeof origin.presetId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(origin.presetId))) {
    throw new ModelError('Reset origin must have a short preset identifier or null for an imported study.');
  }
  return { baseline: parseModel(origin.baseline), presetId: origin.presetId };
}
export class History {
  private past: HistoryState[] = [];
  private future: HistoryState[] = [];
  private present: HistoryState;
  constructor(model: Structure, origin: ResetOrigin = { baseline: model, presetId: null }) {
    this.present = { model: parseModel(model), origin: validateOrigin(origin) };
  }
  get model(): Structure { return cloneModel(this.present.model); }
  get origin(): ResetOrigin { return { baseline: cloneModel(this.present.origin.baseline), presetId: this.present.origin.presetId }; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  commit(next: Structure, origin?: ResetOrigin): void {
    const valid: HistoryState = { model: parseModel(next), origin: origin === undefined ? this.present.origin : validateOrigin(origin) };
    // Equal geometry can still represent a different reset origin after importing a study.
    if (JSON.stringify(valid) === JSON.stringify(this.present)) return;
    this.past.push(this.present);
    if (this.past.length > LIMITS.history) this.past.shift();
    this.present = valid;
    this.future = [];
  }
  undo(): void {
    const previous = this.past.pop();
    if (!previous) throw new ModelError('There is no earlier edit to undo.');
    this.future.push(this.present);
    this.present = previous;
  }
  redo(): void {
    const next = this.future.pop();
    if (!next) throw new ModelError('There is no later edit to redo.');
    this.past.push(this.present);
    this.present = next;
  }
}
function cell(value: string | number): string {
  const text = typeof value === 'string' && /^[=+@\-\t\r\n]/.test(value) ? `'${value}` : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
export function resultsCSV(model: Structure, result: Analysis): string {
  if (result.status !== 'stable') throw new ModelError('CSV results are unavailable until the structure has a stable solution.');
  const { members, nodes } = matchAnalysis(model, result);
  const rows: (string | number)[][] = [
    ['LOADPATH', 'version 1', model.name, model.activeCase],
    ['assumptions', 'Fictional; linear small-displacement axial truss; Y-up; solid circular sections; not construction certification'],
    ['member', 'start_node', 'end_node', 'section', 'material', 'length_m', 'extension_m', 'force_N_tension_positive', 'stress_Pa', 'strain', 'energy_J', 'mass_kg', 'Euler_pin_ended_N', 'compression_over_Euler'],
    ...members.pairs.map(([member, m]) => [m.id, member.a, member.b, member.section, member.material, m.length, m.extension, m.force, m.stress, m.strain, m.energy, m.mass, m.eulerLoad, m.eulerRatio]),
    [],
    ['node', 'x_m', 'y_m', 'z_m', 'restrained_X', 'restrained_Y', 'restrained_Z', 'ux_m', 'uy_m', 'uz_m', 'Fx_N', 'Fy_N', 'Fz_N', 'K_u_minus_F_X_N', 'K_u_minus_F_Y_N', 'K_u_minus_F_Z_N'],
    ...nodes.pairs.map(([node, n]) => [n.id, ...node.position, ...node.restraints.map(Number), ...n.displacement, ...n.applied, ...n.reaction]),
    [],
    ['mass_kg', result.mass], ['self_weight_N', result.weight], ['strain_energy_J', result.energy],
    ['F_dot_u_J', result.externalWork], ['free_residual_infinity_N', result.freeResidual],
    ['backward_relative_residual', result.relativeResidual],
    ['minimum_scaled_Cholesky_Schur_pivot_not_condition_number', result.minScaledPivot ?? 'not applicable'],
    ['force_balance_N', ...result.balance], ['moment_balance_Nm_about_origin', ...result.momentBalance],
  ];
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
