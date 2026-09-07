import { observeSize } from '../../core/canvas';
import { clamp } from '../../core/math';
import { escapeMarkup } from '../../core/page';
import { INPUT_LIMIT, INPUT_STEP, PAVILION_LINES, PAVILION_OUTLINE } from './data';
import {
  add, analyzeMatrix, eigenDirections, formatNumber, formatVector, length, project, scaleVector, subtract, transform,
} from './engine';
import type { Mat2, Vec2 } from './engine';

export type LabMode = 'transform' | 'projection';
export type HandleId = 'basis-x' | 'basis-y' | 'vector' | 'source' | 'direction';

export interface DiagramState {
  mode: LabMode;
  matrix: Mat2;
  vector: Vec2;
  source: Vec2;
  direction: Vec2;
  showEigen: boolean;
}

const HANDLES: readonly { id: HandleId; label: string; tone: string }[] = [
  { id: 'basis-x', label: 'First basis endpoint', tone: 'teal' },
  { id: 'basis-y', label: 'Second basis endpoint', tone: 'coral' },
  { id: 'vector', label: 'Input vector endpoint', tone: 'ink' },
  { id: 'source', label: 'Source vector endpoint', tone: 'coral' },
  { id: 'direction', label: 'Projection direction endpoint', tone: 'teal' },
];

let diagramNumber = 0;

function handleHitPolygon(neighbors: readonly Vec2[]): string {
  let polygon: Vec2[] = [{ x: -22, y: -22 }, { x: 22, y: -22 }, { x: 22, y: 22 }, { x: -22, y: 22 }];
  // Split overlapping touch areas at the perpendicular bisector, not by SVG paint order.
  for (const neighbor of neighbors) {
    const distanceSquared = neighbor.x ** 2 + neighbor.y ** 2;
    if (distanceSquared === 0) continue;
    const side = (point: Vec2) => point.x * neighbor.x + point.y * neighbor.y - distanceSquared / 2;
    const clipped: Vec2[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const from = polygon[index], to = polygon[(index + 1) % polygon.length];
      const fromSide = side(from), toSide = side(to);
      if ((fromSide <= 0) !== (toSide <= 0)) {
        const fraction = fromSide / (fromSide - toSide);
        clipped.push({ x: from.x + fraction * (to.x - from.x), y: from.y + fraction * (to.y - from.y) });
      }
      if (toSide <= 0) clipped.push(to);
    }
    polygon = clipped;
  }
  return polygon.map(point => `${point.x},${point.y}`).join(' ');
}

export function createDiagram(
  host: HTMLElement,
  signal: AbortSignal,
  onMove: (id: HandleId, point: Vec2) => void,
  onCommit: (message: string) => void,
  onEdit: (id: HandleId) => void,
) {
  const prefix = `vp-diagram-${++diagramNumber}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('vp-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-describedby', `${prefix}-description`);
  svg.innerHTML = `
    <desc id="${prefix}-description"></desc>
    <defs>
      <clipPath id="${prefix}-clip"><rect width="1" height="1"></rect></clipPath>
      ${HANDLES.map(({ id }) => `<clipPath id="${prefix}-hit-${id}"><polygon></polygon></clipPath>`).join('')}
    </defs>
    <g data-vp-grid aria-hidden="true"></g>
    <g data-vp-geometry clip-path="url(#${prefix}-clip)" aria-hidden="true"></g>
    <g data-vp-handles>
      ${HANDLES.map(({ id, tone }) => `
        <g class="vp-handle vp-${tone}" data-vp-handle="${id}" tabindex="0" role="button">
          <circle class="vp-hit" r="22" clip-path="url(#${prefix}-hit-${id})"></circle>
          <circle class="vp-focus-ring" r="12"></circle>
          <circle class="vp-grip" r="5.5"></circle>
        </g>`).join('')}
    </g>`;
  host.append(svg);
  const grid = svg.querySelector<SVGGElement>('[data-vp-grid]')!;
  const geometry = svg.querySelector<SVGGElement>('[data-vp-geometry]')!;
  const clip = svg.querySelector<SVGRectElement>('clipPath rect')!;
  const description = svg.querySelector<SVGDescElement>('desc')!;
  const handles = HANDLES.map((handle) => ({
    ...handle,
    element: svg.querySelector<SVGGElement>(`[data-vp-handle="${handle.id}"]`)!,
    hit: svg.querySelector<SVGPolygonElement>(`#${prefix}-hit-${handle.id} polygon`)!,
  }));
  let width = 760;
  let height = 474;
  let unit = 60;
  let origin: Vec2 = { x: width / 2, y: height / 2 + 8 };
  let current: DiagramState | undefined;
  let disposed = false;
  let drag: { id: HandleId; pointer: number; offset: Vec2; unit: number } | undefined;

  const screen = (point: Vec2): Vec2 => ({ x: origin.x + point.x * unit, y: origin.y - point.y * unit });
  const pair = (point: Vec2): string => {
    const result = screen(point);
    return `${result.x.toFixed(3)},${result.y.toFixed(3)}`;
  };
  const line = (from: Vec2, to: Vec2, classes: string, attributes = ''): string =>
    `<path class="${classes}" d="M${pair(from)} L${pair(to)}" ${attributes}></path>`;
  const label = (point: Vec2, text: string, classes = '', xOffset = 12, yOffset = -12): string => {
    const location = screen(point);
    const x = clamp(location.x + xOffset, 38, width - 58);
    const y = clamp(location.y + yOffset, 38, height - 26);
    return `<text class="vp-graph-label ${classes}" x="${x}" y="${y}">${escapeMarkup(text)}</text>`;
  };
  const path = (points: readonly Vec2[], classes: string, close = false, attributes = ''): string =>
    `<path class="${classes}" d="M${points.map(pair).join(' L')}${close ? ' Z' : ''}" ${attributes}></path>`;

  function arrow(vector: Vec2, tone: string, name: string, offsetY = -13) {
    const end = screen(vector);
    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const distance = Math.hypot(dx, dy);
    let result = line({ x: 0, y: 0 }, vector, `vp-arrow vp-${tone}`);
    if (distance > 0.01) {
      const tip = Math.min(10, distance * 0.35);
      const halfWidth = Math.min(4.5, distance * 0.18);
      const ux = dx / distance;
      const uy = dy / distance;
      const base = { x: end.x - tip * ux, y: end.y - tip * uy };
      result += `<path class="vp-arrowhead vp-${tone}" d="M${end.x},${end.y} L${base.x - uy * halfWidth},${base.y + ux * halfWidth} L${base.x + uy * halfWidth},${base.y - ux * halfWidth} Z"></path>`;
    }
    return result + label(vector, length(vector) === 0 ? `${name} = 0` : name, `vp-${tone}`, 12, offsetY);
  }

  function getPoint(id: HandleId, state: DiagramState): Vec2 {
    if (id === 'basis-x') return { x: state.matrix.a, y: state.matrix.c };
    if (id === 'basis-y') return { x: state.matrix.b, y: state.matrix.d };
    return state[id];
  }

  function drawGrid() {
    const halfX = width / unit / 2;
    const halfY = height / unit / 2 + 1;
    const step = unit >= 32 ? 0.5 : 1;
    const labelsEvery = Math.max(1, Math.ceil(35 / unit));
    let markup = '';
    for (let x = Math.ceil(-halfX / step) * step; x <= halfX; x += step) {
      if (x === 0) continue;
      markup += line({ x, y: -halfY }, { x, y: halfY }, Number.isInteger(x) ? 'vp-grid-line' : 'vp-grid-minor');
      if (Number.isInteger(x) && x % labelsEvery === 0 && Math.abs(x * unit) < width / 2 - 22) {
        markup += `<text class="vp-tick" x="${screen({ x, y: 0 }).x}" y="${origin.y + 19}" text-anchor="middle">${x}</text>`;
      }
    }
    for (let y = Math.ceil(-halfY / step) * step; y <= halfY; y += step) {
      if (y === 0) continue;
      markup += line({ x: -halfX, y }, { x: halfX, y }, Number.isInteger(y) ? 'vp-grid-line' : 'vp-grid-minor');
      if (Number.isInteger(y) && y % labelsEvery === 0 && Math.abs(y * unit) < height / 2 - 44) {
        markup += `<text class="vp-tick" x="${origin.x - 11}" y="${screen({ x: 0, y }).y + 4}" text-anchor="end">${y}</text>`;
      }
    }
    markup += line({ x: -halfX, y: 0 }, { x: halfX, y: 0 }, 'vp-axis');
    markup += line({ x: 0, y: -halfY }, { x: 0, y: halfY }, 'vp-axis');
    markup += `<text class="vp-tick" x="${origin.x - 10}" y="${origin.y + 19}" text-anchor="end">0</text>
      <text class="vp-axis-name" x="${width - 20}" y="${origin.y - 10}">x</text>
      <text class="vp-axis-name" x="${origin.x + 10}" y="25">y</text>`;
    grid.innerHTML = markup;
  }

  function drawTransform(state: DiagramState): string {
    const matrix = state.matrix;
    const first = { x: matrix.a, y: matrix.c };
    const second = { x: matrix.b, y: matrix.d };
    const output = transform(matrix, state.vector);
    const matrixInfo = analyzeMatrix(matrix);
    let markup = '';
    for (let k = -4; k <= 4; k++) {
      markup += line(transform(matrix, { x: k, y: -4 }), transform(matrix, { x: k, y: 4 }), 'vp-transformed-grid');
      markup += line(transform(matrix, { x: -4, y: k }), transform(matrix, { x: 4, y: k }), 'vp-transformed-grid');
    }
    markup += path([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 'vp-original-square', true);
    markup += path([{ x: 0, y: 0 }, first, add(first, second), second], 'vp-unit-area', true, 'data-vp-unit-area');
    if (state.showEigen) {
      const eigen = eigenDirections(matrix);
      for (const item of eigen.directions) {
        const reach = Math.hypot(width, height) / unit;
        markup += line(scaleVector(item.direction, -reach), scaleVector(item.direction, reach), 'vp-eigen-line', 'data-vp-eigen-line');
        const labelDistance = Math.min(
          (width / 2 - 80) / Math.max(Math.abs(item.direction.x), 0.001),
          (height / 2 - 74) / Math.max(Math.abs(item.direction.y), 0.001),
        ) / unit;
        markup += label(scaleVector(item.direction, labelDistance), `λ = ${formatNumber(item.value)}`, 'vp-eigen-label', -16, -12);
      }
    }
    markup += path(PAVILION_OUTLINE, 'vp-pavilion-original', true);
    for (const detail of PAVILION_LINES) markup += path(detail, 'vp-pavilion-original');
    markup += path(PAVILION_OUTLINE.map((point) => transform(matrix, point)), 'vp-pavilion-after', true, 'data-vp-pavilion');
    for (const detail of PAVILION_LINES) {
      markup += path(detail.map((point) => transform(matrix, point)), 'vp-pavilion-detail');
    }
    markup += arrow(state.vector, 'ink vp-before-arrow', 'v', 22);
    if (matrixInfo.rank === 0) {
      markup += `<circle class="vp-collapse-point" cx="${origin.x}" cy="${origin.y}" r="7"></circle>
        <text class="vp-graph-label" text-anchor="middle" x="${origin.x}" y="${origin.y + 43}">Ae₁ = Ae₂ = Av = 0</text>`;
    } else {
      markup += arrow(output, 'gold', 'Av', -19);
      markup += arrow(first, 'teal', 'Ae₁', 25);
      markup += arrow(second, 'coral', 'Ae₂', -16);
    }
    description.textContent = `The columns of A are ${formatVector(first)} and ${formatVector(second)}. `
      + `The input v ${formatVector(state.vector)} becomes Av ${formatVector(output)}. `
      + `Determinant ${formatNumber(matrixInfo.determinant)}; rank ${matrixInfo.rank}. `
      + 'Drag a round endpoint, focus it and use arrow keys, or edit the labeled number inputs.';
    return markup;
  }

  function drawProjection(state: DiagramState): string {
    const result = project(state.source, state.direction);
    let markup = '';
    if (result.projected && result.residual) {
      const directionUnit = {
        x: state.direction.x / result.directionLength,
        y: state.direction.y / result.directionLength,
      };
      const reach = Math.hypot(width, height) / unit;
      markup += line(scaleVector(directionUnit, -reach), scaleVector(directionUnit, reach), 'vp-projection-line');
      markup += arrow(result.projected, 'gold', 'p', 23);
      markup += line(result.projected, state.source, 'vp-residual', 'data-vp-residual');
      const residualLength = length(result.residual);
      if (residualLength * unit > 12) {
        const residualUnit = scaleVector(result.residual, 1 / residualLength);
        const marker = 9 / unit;
        const along = add(result.projected, scaleVector(directionUnit, -marker));
        const away = add(result.projected, scaleVector(residualUnit, marker));
        markup += path([along, add(along, scaleVector(residualUnit, marker)), away], 'vp-right-angle');
      }
    }
    markup += arrow(state.source, 'coral', 'u', -16);
    markup += arrow(state.direction, 'teal', 'd', -16);
    description.textContent = `Source u ${formatVector(state.source)}. Direction d ${formatVector(state.direction)}. `
      + `Dot product ${formatNumber(result.dot)}. `
      + (result.projected ? `Projection p ${formatVector(result.projected)}. The dashed residual is perpendicular to d. `
        : 'Projection is undefined: zero direction does not define a line. ')
      + 'Use arrow keys on endpoints, or edit the source and direction number inputs.';
    return markup;
  }

  function render(state: DiagramState) {
    if (disposed) return;
    current = state;
    const points = state.mode === 'transform'
      ? [...PAVILION_OUTLINE, ...PAVILION_OUTLINE.map((point) => transform(state.matrix, point)),
        state.vector, transform(state.matrix, state.vector),
        { x: state.matrix.a, y: state.matrix.c }, { x: state.matrix.b, y: state.matrix.d },
        { x: state.matrix.a + state.matrix.b, y: state.matrix.c + state.matrix.d }]
      : [state.source, state.direction, project(state.source, state.direction).projected ?? { x: 0, y: 0 }];
    const extentX = Math.max(3.4, ...points.map((point) => Math.abs(point.x) + 0.55));
    const extentY = Math.max(2.8, ...points.map((point) => Math.abs(point.y) + 0.55));
    unit = drag?.unit ?? Math.min(Math.max(1, width - 64) / (2 * extentX), Math.max(1, height - 64) / (2 * extentY));
    origin = { x: width / 2, y: height / 2 + 8 };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', state.mode === 'transform' ? 'Matrix transformation diagram' : 'Dot product and projection diagram');
    svg.dataset.mode = state.mode;
    svg.dataset.unit = unit.toString();
    clip.setAttribute('width', width.toString());
    clip.setAttribute('height', height.toString());
    drawGrid();
    geometry.innerHTML = state.mode === 'transform' ? drawTransform(state) : drawProjection(state);
    const visibleHandles = handles.filter(handle => state.mode === 'transform'
      ? handle.id === 'basis-x' || handle.id === 'basis-y' || handle.id === 'vector'
      : handle.id === 'source' || handle.id === 'direction');
    for (const handle of handles) {
      const visible = visibleHandles.includes(handle);
      handle.element.style.display = visible ? '' : 'none';
      handle.element.setAttribute('tabindex', visible ? '0' : '-1');
      if (!visible) continue;
      const point = getPoint(handle.id, state);
      const location = screen(point);
      handle.hit.setAttribute('points', handleHitPolygon(visibleHandles
        .filter(other => other !== handle)
        .map(other => subtract(screen(getPoint(other.id, state)), location))));
      handle.element.setAttribute('transform', `translate(${location.x}, ${location.y})`);
      handle.element.setAttribute('aria-label', `${handle.label} ${formatVector(point)}. Arrow keys move by 0.1; Shift moves by 0.5.`);
      handle.element.dataset.x = point.x.toString();
      handle.element.dataset.y = point.y.toString();
    }
  }

  const worldPointer = (event: PointerEvent): Vec2 => {
    const bounds = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * width / bounds.width - origin.x) / unit,
      y: (origin.y - (event.clientY - bounds.top) * height / bounds.height) / unit,
    };
  };
  const findHandle = (event: Event) => {
    const target = event.target;
    return target instanceof Element
      ? handles.find((handle) => handle.element === target.closest('[data-vp-handle]'))
      : undefined;
  };
  const bounded = (point: Vec2, step: number): Vec2 => ({
    x: clamp(Number((Math.round(point.x / step) * step).toFixed(8)), -INPUT_LIMIT, INPUT_LIMIT),
    y: clamp(Number((Math.round(point.y / step) * step).toFixed(8)), -INPUT_LIMIT, INPUT_LIMIT),
  });
  svg.addEventListener('pointerdown', (event) => {
    const handle = findHandle(event);
    if (!handle || !current || event.button !== 0 || drag) return;
    event.preventDefault();
    handle.element.focus({ preventScroll: true });
    drag = {
      id: handle.id, pointer: event.pointerId, unit,
      offset: subtract(getPoint(handle.id, current), worldPointer(event)),
    };
    svg.setPointerCapture(event.pointerId);
  }, { signal });
  svg.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    onMove(drag.id, bounded(add(worldPointer(event), drag.offset), 0.05));
  }, { signal });
  const finishDrag = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const id = drag.id;
    drag = undefined;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (current) {
      render(current);
      onCommit(`${HANDLES.find((handle) => handle.id === id)!.label}: ${formatVector(getPoint(id, current))}.`);
    }
  };
  svg.addEventListener('pointerup', finishDrag, { signal });
  svg.addEventListener('pointercancel', finishDrag, { signal });
  svg.addEventListener('lostpointercapture', finishDrag, { signal });
  svg.addEventListener('keydown', (event) => {
    const handle = findHandle(event);
    if (!handle || !current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit(handle.id);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.5 : INPUT_STEP;
    const point = getPoint(handle.id, current);
    const movement = {
      x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      y: event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0,
    };
    const next = bounded(add(point, movement), 0.00000001);
    onMove(handle.id, next);
    onCommit(`${handle.label}: ${formatVector(next)}.`);
  }, { signal });

  const stopObserving = observeSize(host, (size) => {
    width = size.width;
    height = size.height;
    if (current) render(current);
  });
  return {
    render,
    destroy() {
      if (disposed) return;
      disposed = true;
      stopObserving();
      if (drag && svg.hasPointerCapture(drag.pointer)) svg.releasePointerCapture(drag.pointer);
      drag = undefined;
      svg.remove();
    },
  };
}
