import { escapeMarkup } from '../../core/page';
import { ModelError, currentCase } from './schema';
import type { Joint, Structure, Vector3 } from './schema';
import type { Analysis, MemberResult } from './solver';
import { matchAnalysis } from './result-lookup';

export type ColorMode = 'force' | 'stress';
export interface DrawingOptions { color: ColorMode; deformed: boolean; amplification: number }
export function displaced(node: Joint, result: Analysis, factor: number): Vector3 {
  if (result.status !== 'stable' || factor === 0) return [...node.position];
  const solvedNode = result.nodes.find((n) => n.id === node.id);
  if (!solvedNode) throw new ModelError(`Deformed geometry is missing node result ${node.id}. Recalculate the current model.`);
  const u = solvedNode.displacement;
  return [node.position[0] + u[0] * factor, node.position[1] + u[1] * factor, node.position[2] + u[2] * factor];
}
export function memberValue(member: MemberResult, mode: ColorMode): number {
  return mode === 'force' ? member.force / 1000 : member.stress / 1e6;
}
export function extrema(result: Analysis, mode: ColorMode): [number, number] {
  if (result.status !== 'stable') return [0, 0];
  const values = result.members.map((m) => memberValue(m, mode));
  return [Math.min(0, ...values), Math.max(0, ...values)];
}
export function forceColor(value: number, maximum: number): string {
  if (maximum === 0 || Math.abs(value) < maximum * 1e-8) return '#74838f';
  const neutral = [119, 137, 151];
  const target = value > 0 ? [24, 82, 205] : [204, 67, 43];
  const t = Math.sqrt(Math.min(1, Math.abs(value) / maximum));
  return `#${neutral.map((v, i) => Math.round(v + (target[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
export function forceDiagram(result: Analysis, mode: ColorMode): string {
  if (result.status !== 'stable') return '<p class="lp-empty">Force diagram unavailable. Resolve the mechanism before interpreting member forces.</p>';
  const members = [...result.members].sort((a, b) => Math.abs(memberValue(b, mode)) - Math.abs(memberValue(a, mode))).slice(0, 8);
  const max = Math.max(...members.map((m) => Math.abs(memberValue(m, mode))), 1e-12);
  return `<div class="lp-force-chart"><div class="lp-chart-label"><span>Compression</span><span>Tension</span></div>${members.map((m) => {
    const value = memberValue(m, mode);
    return `<button type="button" class="lp-force-row" data-lp-inspect-member="${m.id}" aria-label="Inspect member ${m.id}, ${value.toFixed(2)} ${mode === 'force' ? 'kilonewtons' : 'megapascals'}"><b>${m.id}</b><span class="lp-force-track"><i style="left:${value < 0 ? 50 - Math.abs(value) / max * 50 : 50}%;width:${Math.abs(value) / max * 50}%;background:${forceColor(value, max)}"></i></span><span>${value > 0 ? '+' : ''}${value.toFixed(1)}</span></button>`;
  }).join('')}</div>`;
}
/** A self-contained, actual-coordinate orthographic X/Y engineering drawing, not a decorative thumbnail. */
export function structuralSVG(model: Structure, result: Analysis, options: DrawingOptions): string {
  const matches = result.status === 'stable' ? matchAnalysis(model, result) : null;
  const factor = options.deformed && result.status === 'stable' ? options.amplification : 0;
  const points = model.nodes.flatMap((node) => [node.position, displaced(node, result, factor)]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(780 / Math.max(1, maxX - minX), 345 / Math.max(1, maxY - minY));
  const project = (p: Vector3): [number, number] => [460 + (p[0] - (minX + maxX) / 2) * scale, 300 - (p[1] - (minY + maxY) / 2) * scale];
  const [negative, positive] = extrema(result, options.color);
  const magnitude = Math.max(-negative, positive);
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
  const line = (a: Vector3, b: Vector3, color: string, dashed = false): string => {
    const [x1, y1] = project(a), [x2, y2] = project(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${dashed ? 1 : 2.5}"${dashed ? ' stroke-dasharray="5 5"' : ''}/>`;
  };
  const bars = model.members.map((bar) => {
    const a = nodeMap.get(bar.a)!, b = nodeMap.get(bar.b)!;
    const color = matches ? forceColor(memberValue(matches.members.get(bar.id), options.color), magnitude) : '#939b9f';
    return `<g data-lp-member="${escapeMarkup(bar.id)}">${factor ? line(a.position, b.position, '#a5adb3', true) : ''}${line(displaced(a, result, factor), displaced(b, result, factor), color)}</g>`;
  }).join('');
  const joints = model.nodes.map((node) => {
    const [x, y] = project(displaced(node, result, factor));
    return `<circle cx="${x}" cy="${y}" r="4" fill="#203644"/><text x="${x + 7}" y="${y - 9}" font-size="12">${escapeMarkup(node.id)}</text>${node.restraints.some(Boolean) ? `<path d="M ${x},${y + 5} l -8,14 h 16 Z" fill="none" stroke="#203644" stroke-width="2"/>` : ''}`;
  }).join('');
  const loads = currentCase(model).loads.map((load) => {
    const p = nodeMap.get(load.node)!.position;
    const [x, y] = project(p);
    const norm = Math.hypot(load.force[0], load.force[1]);
    if (norm === 0) return '';
    const dx = load.force[0] / norm * 42, dy = -load.force[1] / norm * 42;
    return `<line x1="${x - dx}" y1="${y - dy}" x2="${x}" y2="${y}" stroke="#cc432b" stroke-width="2" marker-end="url(#lp-export-arrow)"/>`;
  }).join('');
  const units = options.color === 'force' ? 'kN' : 'MPa';
  const status = result.status === 'stable' ? `${negative.toFixed(2)} ${units} compression / +${positive.toFixed(2)} ${units} tension` : `UNAVAILABLE: ${result.status}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="620" viewBox="0 0 920 620" role="img" aria-label="LOADPATH front elevation">
  <rect width="920" height="620" fill="#f5f5ef"/><defs><marker id="lp-export-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#cc432b"/></marker></defs>
  <g fill="#203644" font-family="Arial, sans-serif"><text x="42" y="44" font-size="25" font-weight="700">LOADPATH / ${escapeMarkup(model.name)}</text>
  <text x="42" y="75" font-size="16">${escapeMarkup(currentCase(model).name)} · Front elevation X/Y · Z depth collapsed</text>
  <line x1="42" y1="94" x2="878" y2="94" stroke="#c8d0d4"/>${bars}${joints}${loads}
  <text x="42" y="521" font-size="16">${escapeMarkup(status)}</text>
  <text x="42" y="549" font-size="15">${factor ? `Deformed geometry x${factor}; dashed lines are original.` : 'Original geometry. No displacement amplification.'} Straight axial members.</text>
  <text x="42" y="576" font-size="14">Point-load arrows show direction only; self-weight and out-of-plane components are in the CSV.</text>
  <text x="42" y="603" font-size="14">Fictional study / linear small-displacement truss / not for construction or structural certification.</text></g></svg>`;
}
