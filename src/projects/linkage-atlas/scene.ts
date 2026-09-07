import { degrees, lengthIssue } from './engine';
import type { CouplerLocation, CouplerTrace, LinkLengths, Point, Solution, TraceSample } from './engine';

export interface SceneModel {
  lengths: LinkLengths;
  coupler: CouplerLocation;
  trace: CouplerTrace;
  alternate: CouplerTrace | null;
  highlight: readonly TraceSample[];
  angle: number;
  solution: Solution;
  construction: boolean;
}

interface PlotView { x: number; y: number; scale: number }

function fitView(width: number, height: number, model: SceneModel): PlotView {
  if (lengthIssue(model.lengths)) return { x: width / 2, y: height / 2, scale: 1 };
  const { a, c, d } = model.lengths;
  let minX = -a;
  let maxX = Math.max(a, d);
  let minY = -a;
  let maxY = a;
  const include = (point: Point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  };
  for (const trace of [model.trace, model.alternate]) {
    for (const segment of trace?.segments ?? []) {
      for (const sample of segment) {
        include(sample.point);
        include(sample.C);
      }
    }
  }
  if (!model.trace.segments.length) {
    include({ x: d - c, y: -c });
    include({ x: d + c, y: c });
  }
  const padding = Math.min(width < 500 ? 43 : 58, width * .12, height * .2);
  const scale = Math.min((width - 2 * padding) / (maxX - minX), (height - 2 * padding) / (maxY - minY));
  return {
    x: width / 2 - (minX / 2 + maxX / 2) * scale,
    y: height / 2 + (minY / 2 + maxY / 2) * scale,
    scale,
  };
}

export function createScene(host: HTMLElement) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('la-scene');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Four-bar linkage diagram. Orange is the coupler-point path.');
  svg.innerHTML = `
    <desc data-description></desc>
    <g class="la-grid" data-grid aria-hidden="true"></g>
    <g aria-hidden="true">
      <path class="la-other-trace" data-other-trace />
      <path class="la-trace" data-trace />
      <path class="la-highlight" data-highlight />
    </g>
    <g class="la-construction" data-construction aria-hidden="true"></g>
    <g data-ground aria-hidden="true"></g>
    <g data-mechanism aria-hidden="true"></g>
    <g data-labels aria-hidden="true"></g>
    <circle class="la-angle-handle" data-angle-handle r="22" tabindex="0" role="slider"
      aria-label="Input angle handle" aria-valuemin="0" aria-valuemax="360"
      aria-describedby="linkage-drag-help" />
    <g class="la-axis-key" aria-hidden="true">
      <path d="M20 42V20m0 22h22m-22-22-3 5m3-5 3 5m19 17-5-3m5 3-5 3"/>
      <text x="46" y="46">x</text><text x="16" y="15">y</text>
    </g>`;
  host.append(svg);
  const get = <T extends SVGElement>(selector: string): T => svg.querySelector<T>(selector)!;
  const grid = get<SVGGElement>('[data-grid]');
  const trace = get<SVGPathElement>('[data-trace]');
  const alternate = get<SVGPathElement>('[data-other-trace]');
  const highlight = get<SVGPathElement>('[data-highlight]');
  const construction = get<SVGGElement>('[data-construction]');
  const ground = get<SVGGElement>('[data-ground]');
  const mechanism = get<SVGGElement>('[data-mechanism]');
  const labels = get<SVGGElement>('[data-labels]');
  const description = get<SVGDescElement>('[data-description]');
  const handle = get<SVGCircleElement>('[data-angle-handle]');
  let view: PlotView = { x: 0, y: 0, scale: 1 };
  let previousTrace: CouplerTrace | null = null;
  let previousAlternate: CouplerTrace | null = null;
  let previousHighlight: readonly TraceSample[] | null = null;
  let previousWidth = 0;
  let previousHeight = 0;
  let destroyed = false;
  const number = (value: number): string => value.toFixed(3);
  const position = (point: Point): Point => ({ x: view.x + point.x * view.scale, y: view.y - point.y * view.scale });
  const pathFor = (segments: readonly (readonly TraceSample[])[]): string => segments.map((segment) =>
    segment.map((sample, index) => {
      const point = position(sample.point);
      return `${index === 0 ? 'M' : 'L'}${number(point.x)},${number(point.y)}`;
    }).join(' ')).join(' ');
  const line = (first: Point, second: Point, attributes: string) =>
    `<line x1="${number(first.x)}" y1="${number(first.y)}" x2="${number(second.x)}" y2="${number(second.y)}" ${attributes}/>`;
  const pin = (point: Point, name: string, world?: Point) =>
    `<g data-joint="${name}" ${world ? `data-x="${world.x}" data-y="${world.y}"` : ''}
      transform="translate(${number(point.x)} ${number(point.y)})">
      <circle class="la-pin" r="6"/><circle class="la-pin-center" r="1.7"/></g>`;
  const label = (point: Point, text: string, width: number, height: number, extra = '') =>
    `<text class="la-pin-label ${extra}" x="${number(Math.max(13, Math.min(width - 22, point.x)))}"
      y="${number(Math.max(17, Math.min(height - 12, point.y)))}">${text}</text>`;

  function draw(model: SceneModel, width: number, height: number) {
    if (destroyed || width <= 0 || height <= 0) return;
    const redrawStatic = model.trace !== previousTrace || model.alternate !== previousAlternate
      || model.highlight !== previousHighlight || width !== previousWidth || height !== previousHeight;
    const validLengths = !lengthIssue(model.lengths);
    if (redrawStatic) {
      view = fitView(width, height, model);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const major: string[] = [];
      const minor: string[] = [];
      for (let x = view.x % 24; x < width; x += 24) minor.push(`M${number(x)},0V${height}`);
      for (let y = view.y % 24; y < height; y += 24) minor.push(`M0,${number(y)}H${width}`);
      if (validLengths) major.push(`M0,${number(view.y)}H${width}`, `M${number(view.x)},0V${height}`);
      grid.innerHTML = `<path d="${minor.join(' ')}"/><path class="la-grid-axis" d="${major.join(' ')}"/>`;
      trace.setAttribute('d', pathFor(model.trace.segments));
      alternate.setAttribute('d', model.alternate ? pathFor(model.alternate.segments) : '');
      highlight.setAttribute('d', pathFor([model.highlight]));
      trace.classList.toggle('la-trace-muted', model.highlight.length > 0);
      if (validLengths) {
        const A = position({ x: 0, y: 0 });
        const D = position({ x: model.lengths.d, y: 0 });
        ground.innerHTML = `
          ${line(A, D, 'class="la-ground-link" data-link="d"')}
          ${[A, D].map((point) => `<path class="la-support" d="M${number(point.x - 11)},${number(point.y + 16)}
            l11,-16 11,16z M${number(point.x - 16)},${number(point.y + 20)}h32
            m-27,0 -4,5m12,-5 -4,5m12,-5 -4,5m12,-5 -4,5"/>`).join('')}
          ${pin(A, 'A')}${pin(D, 'D')}
          ${line({ x: A.x, y: A.y + 39 }, { x: D.x, y: D.y + 39 }, 'class="la-dimension"')}
          <path class="la-dimension" d="M${number(A.x)},${number(A.y + 34)}v10M${number(D.x)},${number(D.y + 34)}v10"/>
          <text class="la-dimension-label" text-anchor="middle" x="${number((A.x + D.x) / 2)}"
            y="${number(A.y + 55)}">d = ${Number(model.lengths.d.toPrecision(4))} units</text>`;
      } else {
        ground.replaceChildren();
      }
      previousTrace = model.trace;
      previousAlternate = model.alternate;
      previousHighlight = model.highlight;
      previousWidth = width;
      previousHeight = height;
    }

    description.textContent = `${model.solution.status}. ${model.solution.message}`;
    svg.dataset.solution = model.solution.status;
    handle.style.display = validLengths ? '' : 'none';
    handle.setAttribute('aria-disabled', String(!validLengths));
    handle.setAttribute('tabindex', validLengths ? '0' : '-1');
    if (!validLengths) {
      mechanism.replaceChildren();
      labels.replaceChildren();
      construction.replaceChildren();
      return;
    }
    const { a, b, c, d } = model.lengths;
    const worldB = { x: a * Math.cos(model.angle), y: a * Math.sin(model.angle) };
    const A = position({ x: 0, y: 0 });
    const B = position(worldB);
    const D = position({ x: d, y: 0 });
    handle.setAttribute('cx', number(B.x));
    handle.setAttribute('cy', number(B.y));
    handle.setAttribute('aria-valuenow', degrees(model.angle).toFixed(1));
    handle.setAttribute('aria-valuetext', `${degrees(model.angle).toFixed(1)} degrees. ${model.solution.status}.`);
    const theta = model.angle % (2 * Math.PI);
    const arcRadius = Math.max(18, Math.min(32, a * view.scale * 0.48));
    const arcEnd = { x: A.x + Math.cos(theta) * arcRadius, y: A.y - Math.sin(theta) * arcRadius };
    const arc = theta > 0.01
      ? `<path class="la-angle-arc" d="M${number(A.x + arcRadius)},${number(A.y)} A${arcRadius},${arcRadius} 0 ${theta > Math.PI ? 1 : 0},0 ${number(arcEnd.x)},${number(arcEnd.y)}"/>`
      : '';
    const pieces = [arc, line(A, B, 'class="la-rod la-input" data-link="a"'), pin(B, 'B')];
    const annotations = [
      label({ x: A.x - 17, y: A.y - 11 }, 'A', width, height),
      label({ x: D.x + 11, y: D.y - 11 }, 'D', width, height),
      label({ x: B.x - 19, y: B.y - 12 }, 'B', width, height),
    ];
    if (model.solution.pose) {
      const pose = model.solution.pose;
      const C = position(pose.C);
      const P = position(pose.P);
      const foot = position({
        x: pose.B.x + model.coupler.fraction * (pose.C.x - pose.B.x),
        y: pose.B.y + model.coupler.fraction * (pose.C.y - pose.B.y),
      });
      pieces.unshift(
        line(D, C, 'class="la-rod la-output" data-link="c"'),
        line(B, C, 'class="la-rod la-coupler" data-link="b"'),
        line(B, P, 'class="la-point-guide"'),
        line(C, P, 'class="la-point-guide"'),
        line(foot, P, 'class="la-offset-guide"'),
      );
      pieces.push(pin(C, 'C', pose.C),
        `<circle class="la-point-halo" cx="${number(P.x)}" cy="${number(P.y)}" r="10"/>
         <circle class="la-point" data-joint="P" data-x="${pose.P.x}" data-y="${pose.P.y}"
           cx="${number(P.x)}" cy="${number(P.y)}" r="4.5"/>`);
      annotations.push(
        label({ x: C.x + 11, y: C.y - 12 }, 'C', width, height),
        label({ x: P.x + 12, y: P.y + 18 }, 'P', width, height, 'la-point-label'),
      );
    }
    mechanism.innerHTML = pieces.join('');
    labels.innerHTML = annotations.join('');
    construction.innerHTML = model.construction
      ? `<circle cx="${number(B.x)}" cy="${number(B.y)}" r="${number(b * view.scale)}"/>
         <circle cx="${number(D.x)}" cy="${number(D.y)}" r="${number(c * view.scale)}"/>
         ${line(B, D, 'class="la-centers-line"')}`
      : '';
  }

  return {
    svg,
    handle,
    draw,
    angleAt(clientX: number, clientY: number): number | null {
      if (destroyed) return null;
      const matrix = svg.getScreenCTM();
      if (!matrix) return null;
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      const dx = point.x - view.x;
      const dy = view.y - point.y;
      if (Math.hypot(dx, dy) < 3) return null;
      const angle = Math.atan2(dy, dx);
      return angle < 0 ? angle + 2 * Math.PI : angle;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      svg.remove();
    },
  };
}
