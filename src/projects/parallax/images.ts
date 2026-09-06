import { epipolarLine, fundamental, project } from './camera';
import { escapeMarkup } from '../../core/page';
import type { V2, V3 } from './math';
import type { Experiment, Reconstruction } from './state';
import { cameras, WORLD } from './world';

export function clipLine(line: V3): [V2, V2] | null {
  const [a, b, c] = line, candidates: V2[] = [];
  if (Math.abs(b) > 1e-18) candidates.push([0, -c / b], [960, -(960 * a + c) / b]);
  if (Math.abs(a) > 1e-18) candidates.push([-c / a, 0], [-(640 * b + c) / a, 640]);
  const valid = candidates.filter(([x, y]) => x >= -1e-6 && x <= 960 + 1e-6 && y >= -1e-6 && y <= 640 + 1e-6);
  for (const p of valid) for (const q of valid) if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1) return [p, q];
  return null;
}
const number = (value: number) => value.toFixed(3);
export function renderImageOverlay(svg: SVGSVGElement, side: 'a' | 'b', experiment: Experiment, results: Reconstruction[], estimatedF: ReturnType<typeof fundamental> | null) {
  const pair = cameras(experiment.study, experiment.calibration), camera = side === 'a' ? pair[0] : pair[1];
  const selected = experiment.observations.find((o) => o.id === experiment.selected);
  const opposite = side === 'a' ? selected?.b : selected?.a;
  const byId = new Map(results.map((r) => [r.id, r]));
  const markup: string[] = [];
  markup.push('<path class="px-image-crosshair" d="M460 320h40M480 300v40M24 24h24M24 24v24M936 24h-24M936 24v24M24 616h24M24 616v-24M936 616h-24M936 616v-24"/>');
  if (opposite) {
    const lines = [[fundamental(...pair), 'px-epipolar'], ...(estimatedF ? [[estimatedF, 'px-estimated-line']] as const : [])] as const;
    for (const [f, className] of lines) {
      const segment = clipLine(epipolarLine(f, opposite, side === 'a'));
      if (segment) markup.push(`<path class="${className}" d="M${segment[0].join(' ')}L${segment[1].join(' ')}"/>`);
    }
  }
  for (const observation of experiment.observations) {
    const pixel = observation[side];
    if (!pixel) continue;
    const result = byId.get(observation.id), isSelected = observation.id === experiment.selected;
    const label = WORLD.landmarks.find((p) => p.id === observation.id)?.label ?? observation.id;
    const status = !observation.enabled ? 'excluded' : result?.rejected ? 'rejected' : '';
    const projected = result?.point ? project(camera, result.point) : null;
    if (isSelected && projected) {
      markup.push(`<path class="px-residual-vector" d="M${pixel.join(' ')}L${projected.join(' ')}"/><path class="px-reprojection" d="M${number(projected[0] - 6)} ${number(projected[1] - 6)}h12v12h-12z"/>`);
    }
    markup.push(`<g class="px-feature ${isSelected ? 'is-selected' : ''} ${status}" data-feature="${observation.id}" role="button" tabindex="${isSelected ? '0' : '-1'}" aria-label="${observation.id}, ${escapeMarkup(label)}, view ${side.toUpperCase()}" aria-pressed="${isSelected}" transform="translate(${number(pixel[0])} ${number(pixel[1])})"><circle class="px-hit" r="14"/><circle class="px-feature-dot" r="${isSelected ? 8 : 4}"/>${isSelected ? `<path d="M-16 0h-6M16 0h6M0-16v-6M0 16v6"/><text x="18" y="-18">${observation.id}</text>` : ''}</g>`);
  }
  svg.innerHTML = markup.join('');
}
