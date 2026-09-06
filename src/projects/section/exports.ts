import { cross, planeBasis, scale, sub } from './fields';
import { LIMITS } from './model';
import type { Document, Vec3 } from './model';
import type { MeshResult } from './mesh';
import type { SliceResult } from './slice';
import { serializeDocument } from './state';

const xml = (value: string) => value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character);
const number = (value: number) => Number(value.toFixed(3)).toString();

export function sectionDrawing(document: Document, slice: SliceResult, metadata = false): string {
  const { min, max } = slice.extent;
  const factor = Math.min(420 / (max[0] - min[0]), 330 / (max[1] - min[1]));
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
  const px = (u: number) => 280 + (u - cx) * factor;
  const py = (v: number) => 235 - (v - cy) * factor;
  const frame = planeBasis(document.plane);
  const grid: string[] = [];
  const gridStep = Math.max(10, 10 * Math.ceil(Math.max(max[0] - min[0], max[1] - min[1]) / 200));
  for (let x = Math.ceil(min[0] / gridStep) * gridStep; x <= max[0]; x += gridStep) grid.push(`<path d="M${number(px(x))} 66V410" stroke="${x === 0 ? '#94a7ce' : '#d6dce4'}" stroke-width="${x === 0 ? 1.2 : 0.7}"/>`);
  for (let y = Math.ceil(min[1] / gridStep) * gridStep; y <= max[1]; y += gridStep) grid.push(`<path d="M58 ${number(py(y))}H502" stroke="${y === 0 ? '#94a7ce' : '#d6dce4'}" stroke-width="${y === 0 ? 1.2 : 0.7}"/>`);
  const closedPath = slice.contours.filter((contour) => contour.closed).map((contour) => contour.points.map((p, i) => `${i ? 'L' : 'M'}${number(px(p[0]))},${number(py(p[1]))}`).join('') + 'Z').join('');
  const openPath = slice.contours.filter((contour) => !contour.closed).map((contour) => contour.points.map((p, i) => `${i ? 'L' : 'M'}${number(px(p[0]))},${number(py(p[1]))}`).join('')).join('');
  let dimensions = '';
  if (slice.bounds) {
    const x1 = px(slice.bounds.min[0]), x2 = px(slice.bounds.max[0]);
    const y1 = py(slice.bounds.max[1]), y2 = py(slice.bounds.min[1]);
    dimensions = `<g stroke="#2453c7" fill="none" stroke-width="1"><path d="M${number(x1)} 416V443m0-9H${number(x2)}m0-18v27M${number(x1 - 4)} 438l8-8M${number(x2 - 4)} 438l8-8"/>
      <path d="M39 ${number(y1)}H52m-7 0V${number(y2)}m-6 0h13M41 ${number(y1 + 4)}l8-8M41 ${number(y2 + 4)}l8-8"/></g>
      <text x="${number((x1 + x2) / 2)}" y="458" text-anchor="middle" font-size="16" fill="#2453c7">${(slice.bounds.max[0] - slice.bounds.min[0]).toFixed(1)} mm</text>
      <text transform="translate(25 ${number((y1 + y2) / 2)}) rotate(-90)" text-anchor="middle" font-size="16" fill="#2453c7">${(slice.bounds.max[1] - slice.bounds.min[1]).toFixed(1)} mm</text>`;
  }
  const width = metadata ? `${number(560 / factor)}mm` : '560';
  const height = metadata ? `${number(480 / factor)}mm` : '480';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 480" width="${width}" height="${height}" role="img" aria-label="Section A-A: ${slice.islands} material islands, ${slice.holes} holes; approximate area ${slice.area.toFixed(1)} square millimeters">
    <title>${xml(document.title)} / Section A-A</title>
    <desc>Millimeters. Plane origin = normal * offset. Local X, Y, Z rotations; Rz Ry Rx. Offset ${document.plane.offset} mm; normal ${frame.normal.map(number).join(', ')}. Area ${slice.area.toFixed(3)} mm2 is a numerical approximation. Grid ${gridStep} mm. Drawing scale ${number(factor)} SVG units per mm${metadata ? '; physical root dimensions preserve a 1:1 section scale' : ''}.</desc>
    ${metadata ? `<metadata>${xml(serializeDocument(document))}</metadata>` : ''}
    <defs><pattern id="section-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0V7" stroke="#2453c7" stroke-width="1.2"/></pattern></defs>
    <rect width="560" height="480" fill="#f5f4ed"/>
    <g font-family="ui-monospace, monospace">
      <text x="25" y="33" fill="#2453c7" font-size="20">A</text><path d="M45 27H492" stroke="#2453c7"/><text x="507" y="33" fill="#2453c7" font-size="20">A</text>
      <g>${grid.join('')}</g>
      <path data-section-material d="${closedPath}" fill="#e6ebf4" fill-rule="evenodd"/>
      <path d="${closedPath}" fill="url(#section-hatch)" fill-rule="evenodd" stroke="#2453c7" stroke-width="2"/>
      ${openPath ? `<path d="${openPath}" fill="none" stroke="#b35424" stroke-width="2" stroke-dasharray="5 3"/>` : ''}
      ${dimensions}
      <path d="M470 387h24m-4-4 4 4-4 4M470 387v-24m-4 4 4-4 4 4" fill="none" stroke="#2453c7" stroke-width="1.5"/>
      <text x="500" y="392" font-size="15" fill="#2453c7">u</text><text x="464" y="355" font-size="15" fill="#2453c7">v</text>
      ${slice.contours.length ? '' : `<text x="280" y="214" text-anchor="middle" font-size="24" fill="#25334a">No resolved material</text><text x="280" y="242" text-anchor="middle" font-size="16" fill="#25334a">Move the cut or refine the grid.</text>`}
    </g></svg>`;
}

export function exportSTL(mesh: MeshResult): ArrayBuffer {
  if (mesh.state !== 'resolved' || !mesh.triangles) throw new Error('No resolved mesh to export.');
  if (!Number.isSafeInteger(mesh.triangles) || mesh.triangles < 0 || mesh.triangles > LIMITS.triangles
    || mesh.positions.length !== mesh.triangles * 9 || mesh.normals.length !== mesh.positions.length) {
    throw new Error('The mesh buffers do not match the bounded triangle count. Regenerate the surface before export.');
  }
  const buffer = new ArrayBuffer(84 + mesh.triangles * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer, 0, 80).set(new TextEncoder().encode('SECTION | millimeters | sampled implicit surface | not manufacturing certified'));
  view.setUint32(80, mesh.triangles, true);
  for (let i = 0; i < mesh.triangles; i++) {
    const start = i * 9;
    const a: Vec3 = [mesh.positions[start], mesh.positions[start + 1], mesh.positions[start + 2]];
    const b: Vec3 = [mesh.positions[start + 3], mesh.positions[start + 4], mesh.positions[start + 5]];
    const c: Vec3 = [mesh.positions[start + 6], mesh.positions[start + 7], mesh.positions[start + 8]];
    const face = cross(sub(b, a), sub(c, a)), length = Math.hypot(...face);
    if (!Number.isFinite(length) || length === 0) throw new Error(`Triangle ${i + 1} is non-finite or collapsed at export precision. Regenerate the surface.`);
    const normal = scale(face, 1 / length);
    const values = [...normal, ...a, ...b, ...c];
    values.forEach((value, j) => view.setFloat32(84 + i * 50 + j * 4, value, true));
  }
  return buffer;
}
