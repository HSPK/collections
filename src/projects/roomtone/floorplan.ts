import { LIMITS, MATERIALS } from './data';
import type { Point, Room } from './data';
import type { ReflectionPath } from './engine';

type PositionName = 'source' | 'listener';
export interface Floorplan {
  update: (room: Room, path: ReflectionPath) => void;
  destroy: () => void;
}
export function createFloorplan(
  host: HTMLElement,
  onMove: (name: PositionName, position: Point) => void,
  onFinish: () => void,
): Floorplan {
  let room: Room;
  let active: PositionName | null = null;
  let pointer: number | null = null;
  let scale = 1;
  let left = 48;
  let top = 43;
  let width = 330;
  let height = 188;
  const events = new AbortController();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('roomtone-floorplan');
  svg.setAttribute('viewBox', '0 0 420 286');
  svg.setAttribute('aria-label', 'Editable acoustic floorplan. Drag source and listener, or focus either marker and use arrow keys.');
  host.append(svg);
  const project = (p: Point) => ({ x: left + p.x * scale, y: top + height - p.y * scale });
  function update(next: Room, path: ReflectionPath): void {
    room = next;
    scale = Math.min(330 / room.width, 188 / room.depth);
    width = room.width * scale;
    height = room.depth * scale;
    left = 48 + (330 - width) / 2;
    top = 43 + (188 - height) / 2;
    const right = left + width;
    const bottom = top + height;
    const focused = document.activeElement instanceof Element ? document.activeElement.getAttribute('data-position') : null;
    const s = project(room.source);
    const l = project(room.listener);
    const projected = path.points.map(project);
    svg.innerHTML = `<defs><pattern id="roomtone-plan-grid" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse"><path d="M ${scale} 0 H 0 V ${scale}" fill="none" stroke="#42675a" stroke-opacity=".11" stroke-width="1"/></pattern></defs>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#efeee4"/>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#roomtone-plan-grid)"/>
      <path d="M${left - 4} ${top} V${bottom + 4}" stroke="${MATERIALS[room.materials.west].color}" stroke-width="8"/>
      <path d="M${right + 4} ${top - 4} V${bottom + 4}" stroke="${MATERIALS[room.materials.east].color}" stroke-width="8"/>
      <path d="M${left - 8} ${top - 4} H${right + 8}" stroke="${MATERIALS[room.materials.north].color}" stroke-width="8"/>
      <path d="M${left - 8} ${bottom + 4} H${right + 8}" stroke="${MATERIALS[room.materials.south].color}" stroke-width="8"/>
      <rect data-plan-outline x="${left}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#26483e" stroke-width="1"/>
      <path d="M${left} ${top - 24} H${right} M${left} ${top - 29} V${top - 18} M${right} ${top - 29} V${top - 18} M${left - 25} ${top} V${bottom} M${left - 30} ${top} H${left - 19} M${left - 30} ${bottom} H${left - 19}" stroke="#6c7d6e" fill="none"/>
      <text x="${left + width / 2}" y="${top - 28}" text-anchor="middle">${room.width.toFixed(1)} m</text>
      <text x="${left - 32}" y="${top + height / 2}" text-anchor="middle" transform="rotate(-90 ${left - 32} ${top + height / 2})">${room.depth.toFixed(1)} m</text>
      <text x="391" y="29">N</text>
      <polyline points="${projected.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#af5532" stroke-width="2.5"/>
      ${path.bounces.map((bounce) => { const p = project(bounce.point); return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#af5532"/>`; }).join('')}
      <g data-position="source" tabindex="0" role="button" aria-label="Move source; arrow keys move 10 centimetres, Shift moves 50 centimetres" transform="translate(${s.x},${s.y})">
        <circle r="22" fill="transparent"/><circle r="13" fill="#ac4e2c" stroke="#f6f3e8" stroke-width="3"/><text y="5" text-anchor="middle" fill="#ffffff">S</text>
      </g>
      <g data-position="listener" tabindex="0" role="button" aria-label="Move listener; arrow keys move 10 centimetres, Shift moves 50 centimetres" transform="translate(${l.x},${l.y})">
        <circle r="22" fill="transparent"/><circle r="13" fill="#244f44" stroke="#f6f3e8" stroke-width="3"/><text y="5" text-anchor="middle" fill="#ffffff">L</text>
      </g>
      <text x="48" y="271">S / source</text><text x="260" y="271">L / listener</text>`;
    svg.dataset.selectedPath = path.id;
    if (focused && !active) svg.querySelector<SVGGElement>(`[data-position="${focused}"]`)?.focus({ preventScroll: true });
  }
  function bounded(name: PositionName, x: number, y: number): void {
    onMove(name, {
      x: Math.min(room.width - LIMITS.margin, Math.max(LIMITS.margin, Math.round(x * 100) / 100)),
      y: Math.min(room.depth - LIMITS.margin, Math.max(LIMITS.margin, Math.round(y * 100) / 100)),
      z: room[name].z,
    });
  }
  function positionName(target: EventTarget | null): PositionName | null {
    const value = target instanceof Element ? target.closest('[data-position]')?.getAttribute('data-position') : null;
    return value === 'source' || value === 'listener' ? value : null;
  }
  svg.addEventListener('pointerdown', (event) => {
    const name = positionName(event.target);
    if (!name || event.button !== 0 || active !== null) return;
    event.preventDefault();
    active = name;
    pointer = event.pointerId;
    svg.setPointerCapture(event.pointerId);
    svg.querySelector<SVGGElement>(`[data-position="${name}"]`)?.focus({ preventScroll: true });
  }, { signal: events.signal });
  svg.addEventListener('pointermove', (event) => {
    if (!active || pointer !== event.pointerId) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    bounded(active, (point.x - left) / scale, (top + height - point.y) / scale);
  }, { signal: events.signal });
  const finish = (event: PointerEvent) => {
    if (!active || pointer !== event.pointerId) return;
    const name = active;
    active = null;
    if (pointer !== null && svg.hasPointerCapture(pointer)) svg.releasePointerCapture(pointer);
    pointer = null;
    svg.querySelector<SVGGElement>(`[data-position="${name}"]`)?.focus({ preventScroll: true });
    onFinish();
  };
  svg.addEventListener('pointerup', finish, { signal: events.signal });
  svg.addEventListener('pointercancel', finish, { signal: events.signal });
  svg.addEventListener('lostpointercapture', finish, { signal: events.signal });
  svg.addEventListener('keydown', (event) => {
    const name = positionName(event.target);
    if (!name || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.5 : 0.1;
    bounded(name, room[name].x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      room[name].y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0));
    onFinish();
  }, { signal: events.signal });
  return { update, destroy() { events.abort(); svg.remove(); } };
}
