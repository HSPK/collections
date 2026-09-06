import { escapeMarkup } from '../../core/markup';
import { add, clamp, lensCircles, polygonPoints, scale, segmentEnds, toWorld } from './geometry';
import { BENCH, isRefractor, KIND_NAMES } from './model';
import type { Experiment, OpticalElement, Vec } from './model';
import { materialIndex, MATERIALS, wavelengthColor } from './optics';
import type { TraceResult } from './optics';

export interface RenderOptions {
  grid: boolean;
  normals: boolean;
  reflections: boolean;
  interactive: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { grid: true, normals: false, reflections: true, interactive: true };
const f = (value: number): string => Number(value.toFixed(3)).toString();
const xy = (point: Vec): string => `${f(point.x)},${f(point.y)}`;
const line = (a: Vec, b: Vec): string => `M${xy(a)}L${xy(b)}`;

export function elementRadius(element: OpticalElement): number {
  switch (element.kind) {
    case 'prism': return element.size / Math.sqrt(3);
    case 'lens': return element.diameter / 2;
    case 'block': return Math.max(element.width, element.height) / 2;
    case 'mirror':
    case 'detector': return element.length / 2;
    case 'emitter': return 36;
  }
}

export function opticGlyph(kind: OpticalElement['kind']): string {
  const paths: Record<OpticalElement['kind'], string> = {
    emitter: '<path d="M3 8h8v8H3zM11 12h10M17 5l4-2M17 19l4 2"/>',
    prism: '<path d="m12 3 10 18H2Z"/>',
    lens: '<path d="M12 2Q24 12 12 22Q0 12 12 2Z"/>',
    block: '<path d="M6 3h12v18H6Z"/>',
    mirror: '<path d="m4 20 16-16M6 21l-3-3M10 17l-3-3M14 13l-3-3M18 9l-3-3"/>',
    detector: '<path d="M14 3v18M18 3v18M3 7h8M3 12h8M3 17h8"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
}

function elementMarkup(element: OpticalElement, selected: boolean, interactive: boolean): string {
  const transform = `translate(${f(element.x)} ${f(element.y)}) rotate(${f(element.rotation)})`;
  const stroke = selected ? '#ab692b' : '#52635f';
  let shape = '';
  let label = '';
  switch (element.kind) {
    case 'prism':
    case 'block': {
      shape = `<polygon points="${polygonPoints(element).map(xy).join(' ')}" fill="url(#lumen-glass)" stroke="${stroke}" stroke-width="1.6"/>`;
      label = `<text x="${element.x}" y="${element.y - 6}" text-anchor="middle" font-size="17" fill="#415751">${escapeMarkup(element.kind === 'prism' ? 'PRISM' : 'GLASS BLOCK')}</text>
        <text x="${element.x}" y="${element.y + 17}" text-anchor="middle" font-size="14" fill="#58685d">${escapeMarkup(MATERIALS[element.material].name)} / n ${materialIndex(element.material, 540).toFixed(3)}</text>`;
      break;
    }
    case 'lens': {
      const { radius } = lensCircles(element);
      const half = element.diameter / 2;
      shape = `<path transform="${transform}" d="M0 ${-half}A${radius} ${radius} 0 0 1 0 ${half}A${radius} ${radius} 0 0 1 0 ${-half}Z" fill="url(#lumen-glass)" stroke="${stroke}" stroke-width="1.6"/>
        <path transform="${transform}" d="M0 ${-half - 14}V${half + 14}" stroke="#8b9a8b" stroke-width="1" stroke-dasharray="5 6"/>`;
      label = `<text x="${element.x}" y="${element.y + half + 39}" font-size="16" text-anchor="middle">${escapeMarkup(element.label)}</text>`;
      break;
    }
    case 'emitter': {
      shape = `<g transform="${transform}">
        <rect x="-34" y="-21" width="43" height="42" rx="5" fill="#eee9dc" stroke="${stroke}" stroke-width="1.5"/>
        <path d="M-27 -15V15M-21 -15V15M-15 -15V15" stroke="#b4ad9c" stroke-width="1"/>
        <rect x="9" y="-12" width="14" height="24" rx="2" fill="#b98446" stroke="#8c5c2e" stroke-width="1.3"/>
        <path d="M23 -${Math.max(3, element.aperture / 2)}V${Math.max(3, element.aperture / 2)}" stroke="#e8c17e" stroke-width="3"/>
        <circle cx="-5" cy="0" r="4" fill="${element.spectrum === 'white' ? '#fff9e7' : wavelengthColor(element.wavelength)}" stroke="#80623d"/>
      </g>`;
      label = `<text x="${element.x}" y="${element.y + 57}" text-anchor="middle" font-size="16">${escapeMarkup(element.label)}</text>
        <text x="${element.x}" y="${element.y + 79}" text-anchor="middle" font-size="14" fill="#716d60">${element.spectrum === 'white' ? '420-660 nm' : `${element.wavelength} nm`} / ${element.power.toFixed(2)} mW</text>`;
      break;
    }
    case 'mirror':
      shape = `<g transform="${transform}"><rect x="${-element.length / 2}" y="0" width="${element.length}" height="10" fill="url(#lumen-hatch)" stroke="#8d8b7d" stroke-width=".7"/>
        <path d="M${-element.length / 2} 0H${element.length / 2}" stroke="${stroke}" stroke-width="3"/><path d="M${-element.length / 2} -2H${element.length / 2}" stroke="#fffdf5" stroke-width="1"/></g>`;
      label = `<text x="${element.x + 34}" y="${element.y - 36}" font-size="16">${escapeMarkup(element.label)}</text>`;
      break;
    case 'detector': {
      const [start, end] = segmentEnds(element);
      shape = `<g transform="${transform}">
        <rect x="${-element.length / 2 - 5}" y="-7" width="${element.length + 10}" height="14" rx="3" fill="#444d46" stroke="${selected ? '#ab692b' : '#303e36'}" stroke-width="${selected ? 3 : 1}"/>
        <path d="M${-element.length / 2} -5H${element.length / 2}" stroke="#d4bd87" stroke-width="2"/>
        ${Array.from({ length: Math.floor(element.length / 10) + 1 }, (_, index) => `<path d="M${f(index * 10 - element.length / 2)} -5v${index % 5 === 0 ? 8 : 4}" stroke="#eee7d1" stroke-width=".8"/>`).join('')}
      </g>`;
      label = `<text x="${Math.min(875, Math.max(start.x, end.x) + 18)}" y="${Math.max(75, Math.min(start.y, end.y) - 17)}" font-size="16">${escapeMarkup(element.label.split(' / ')[0])}</text>`;
      break;
    }
  }
  const radius = elementRadius(element);
  const selection = selected ? `<g fill="none" stroke="#ad742e" stroke-width="1.2">
    <circle cx="${element.x}" cy="${element.y}" r="4" fill="#f9f4e7"/>
    <path d="M${element.x - 11} ${element.y}h7m8 0h7M${element.x} ${element.y - 11}v7m0 8v7"/>
    ${isRefractor(element) ? `<circle cx="${element.x}" cy="${element.y}" r="${radius + 12}" stroke-dasharray="3 8" opacity=".65"/>` : ''}
  </g>` : '';
  const hitArea = element.kind === 'mirror' || element.kind === 'detector'
    ? `<path d="${line(...segmentEnds(element))}" fill="none" stroke="transparent" stroke-width="32"/>`
    : element.kind === 'lens' ? `<rect transform="${transform}" x="${-Math.max(16, element.thickness / 2)}" y="${-element.diameter / 2}" width="${Math.max(32, element.thickness)}" height="${element.diameter}" fill="transparent"/>`
      : element.kind === 'emitter' ? `<circle cx="${element.x}" cy="${element.y}" r="38" fill="transparent"/>` : '';
  const accessible = interactive ? `data-optic-id="${element.id}" tabindex="0" role="button" aria-label="${escapeMarkup(element.label)}, ${KIND_NAMES[element.kind]}. Select or use arrow keys to move." aria-pressed="${selected}"` : '';
  let handle = '';
  if (selected && interactive) {
    const handleLocal = element.kind === 'emitter' ? { x: 82, y: 0 } : { x: 0, y: -radius - 28 };
    const point = toWorld(handleLocal, element);
    const start = toWorld(scale(handleLocal, 0.82), element);
    handle = `<g data-rotate="${element.id}" tabindex="0" role="button" aria-label="Rotate ${escapeMarkup(element.label)}. Use left and right arrow keys." class="lumen-rotation-handle">
      <path d="${line(start, point)}" stroke="#ad742e" stroke-width="1.3"/><circle cx="${point.x}" cy="${point.y}" r="14" fill="transparent"/>
      <circle cx="${point.x}" cy="${point.y}" r="6" fill="#fff9e7" stroke="#ad742e" stroke-width="1.7"/>
    </g>`;
  }
  return `<g class="lumen-optic" ${accessible}>${shape}${selection}<g fill="#4a5146">${label}</g>${hitArea}</g>${handle}`;
}

export function sceneLayers(scene: Experiment, trace: TraceResult, selectedId: string | null, options: RenderOptions): string {
  const grid = options.grid ? `<rect width="1000" height="600" fill="url(#lumen-grid)"/><rect width="1000" height="600" fill="url(#lumen-major-grid)"/>` : '';
  const seenWhite = new Set<string>();
  const rays = trace.segments.map((segment) => {
    const relative = clamp(segment.powerEnd / segment.rootPower, 0, 1);
    if (!options.reflections && relative < 0.15) return '';
    const path = line(segment.start, segment.end);
    const white = segment.white && segment.leg === 'source';
    if (white && seenWhite.has(path)) return '';
    if (white) seenWhite.add(path);
    return `<path data-ray="${segment.wavelength}" d="${path}" stroke="${white ? '#a18040' : wavelengthColor(segment.wavelength)}"
      stroke-width="${white ? 2 : f(0.65 + Math.sqrt(relative) * 1.15)}" opacity="${f(0.08 + Math.sqrt(relative) * 0.82)}"${relative < 0.15 ? ' stroke-dasharray="3 5"' : ''}/>`;
  }).join('');
  const normals = options.normals ? trace.interactions.filter((hit) => hit.wavelength === 540 || !trace.emittedByWavelength.has(540)).slice(0, 100).map((hit) => {
    const a = add(hit.point, scale(hit.normal, -24));
    const b = add(hit.point, scale(hit.normal, 24));
    return `<path d="${line(a, b)}" stroke="#576d7a" stroke-dasharray="3 3" stroke-width="1"/>`;
  }).join('') : '';
  return `<defs>
    <pattern id="lumen-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d7d3c3" stroke-width=".55"/></pattern>
    <pattern id="lumen-major-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#c6c4b5" stroke-width=".7"/></pattern>
    <pattern id="lumen-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1 5 7M5 -5 11 1" stroke="#8a9185" stroke-width="1"/></pattern>
    <linearGradient id="lumen-glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dce8df" stop-opacity=".58"/><stop offset=".5" stop-color="#f5f6e8" stop-opacity=".2"/><stop offset="1" stop-color="#bbd2cb" stop-opacity=".5"/></linearGradient>
    <clipPath id="lumen-field-clip"><rect width="1000" height="600"/></clipPath>
  </defs>
  <g font-family="Arial, Helvetica, sans-serif" fill="#6d7063">
    <rect width="1000" height="600" fill="#f6f4e9"/>${grid}
    <g clip-path="url(#lumen-field-clip)">
      <path d="M0 300H1000M500 0V600" stroke="#b6b4a3" stroke-width=".8" stroke-dasharray="9 5 2 5" opacity=".55"/>
      <g fill="none" stroke-linecap="round">${rays}</g>
      ${scene.elements.map((element) => elementMarkup(element, selectedId === element.id, options.interactive)).join('')}
      ${trace.hits.map((hit) => `<circle cx="${hit.point.x}" cy="${hit.point.y}" r="2.6" fill="${wavelengthColor(hit.wavelength)}" stroke="#fcf8eb" stroke-width=".5"/>`).join('')}
      ${normals}
    </g>
    <rect width="1000" height="27" fill="#f0eee2"/>
    <rect width="27" height="600" fill="#f0eee2"/>
    <path d="M27 27H1000M27 27V600" fill="none" stroke="#d0cebf" stroke-width="1"/>
    ${Array.from({ length: 10 }, (_, index) => `<path d="M${index * 100} 21v6" stroke="#aaa997"/><text x="${index * 100 + 5}" y="18" font-size="12">${index * 100}</text>`).join('')}
    ${Array.from({ length: 5 }, (_, index) => `<path d="M21 ${(index + 1) * 100}h6" stroke="#aaa997"/><text transform="translate(17 ${(index + 1) * 100 - 5}) rotate(-90)" font-size="12">${(index + 1) * 100}</text>`).join('')}
    <text x="48" y="56" font-size="13" letter-spacing="1.4">OPTICAL FIELD / AIR n = 1</text>
    <text x="974" y="56" font-size="13" text-anchor="end">1000 &#215; 600 mm</text>
    <g transform="translate(49 555)"><path d="M0 -5V0H100V-5M50 -3V0" fill="none" stroke="#757968" stroke-width="1.2"/><text x="0" y="22" font-size="13">100 mm</text></g>
  </g>`;
}

export function exportSceneSvg(scene: Experiment, trace: TraceResult, options: RenderOptions = DEFAULT_RENDER_OPTIONS): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BENCH.width}" height="${BENCH.height}" viewBox="0 0 ${BENCH.width} ${BENCH.height}">
<title>${escapeMarkup(scene.title)} / Lumen</title>
<desc>2D geometric optics. Distances in mm, wavelength in nm, power in mW. Cauchy dispersion, unpolarized Fresnel splitting and Beer-Lambert attenuation. Not a wave or diffraction simulation.</desc>
<metadata>${escapeMarkup(JSON.stringify(scene))}</metadata>
${sceneLayers(scene, trace, null, { ...options, interactive: false })}
</svg>`;
}
