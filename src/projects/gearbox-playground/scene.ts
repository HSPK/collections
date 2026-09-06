import { ADDENDUM, DEDENDUM, TAU } from './engine';
import type { GearboxFrame, Member, Solution } from './engine';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const DRAWING_RING_RADIUS = 228;

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

const number = (value: number) => (Math.abs(value) < 1e-10 ? 0 : value).toFixed(6);
const rotate = (angle: number) => `rotate(${number(-angle * 180 / Math.PI)})`;

function point(radius: number, angle: number): string {
  return `${number(radius * Math.cos(angle))} ${number(-radius * Math.sin(angle))}`;
}

/** Tooth zero points right. Internal teeth protrude inward, not outward. */
export function toothOutline(teeth: number, radius: number, module: number, internal = false): string {
  const samples = [
    [-0.5, -DEDENDUM], [-0.28, -DEDENDUM], [-0.16, ADDENDUM],
    [0.16, ADDENDUM], [0.28, -DEDENDUM], [0.5, -DEDENDUM],
  ];
  const direction = internal ? -1 : 1;
  return Array.from({ length: teeth }, (_, tooth) => samples.map(([phase, height], index) => {
    const command = tooth === 0 && index === 0 ? 'M' : 'L';
    return `${command}${point(radius + direction * height * module, (tooth + phase) * TAU / teeth)}`;
  }).join(' ')).join(' ') + ' Z';
}

export function createScene(container: HTMLElement) {
  const svg = svgElement('svg', {
    viewBox: '-290 -280 580 560',
    role: 'img',
    'aria-label': 'Planetary gear mechanism. Sun, inward-toothed ring, three meshing planets, and a carrier connecting their pins.',
    'data-gearbox-scene': '',
  });
  container.append(svg);
  let ring: SVGGElement;
  let sun: SVGGElement;
  let carrier: SVGGElement;
  let planets: SVGGElement[] = [];
  let pitchPlanets: SVGCircleElement[] = [];
  let geometry: SVGGElement;
  let solution: Solution;
  let scale = 1;
  let destroyed = false;

  function createGear(teeth: number, radius: number, module: number, className: string): SVGGElement {
    const group = svgElement('g', { class: className });
    group.append(svgElement('path', { d: toothOutline(teeth, radius, module), class: 'gb-tooth-face' }));
    group.append(svgElement('circle', { r: number(radius * 0.70), class: 'gb-face-circle' }));
    for (let i = 0; i < 3; i++) {
      group.append(svgElement('path', {
        d: `M${point(radius * 0.24, i * TAU / 3)} L${point(radius * 0.58, i * TAU / 3)}`,
        class: 'gb-face-spoke',
      }));
    }
    group.append(svgElement('circle', { cx: number(radius * 0.77), r: '4', class: 'gb-index-mark' }));
    return group;
  }

  function configure(next: Solution): void {
    if (destroyed) return;
    solution = next;
    svg.replaceChildren();
    const { gearset: set, geometry: pitch } = solution;
    scale = DRAWING_RING_RADIUS / pitch.ringRadius;
    svg.dataset.gearset = `${set.sun}/${set.planet}/${set.ring}`;
    svg.dataset.grounded = solution.grounded;
    svg.dataset.driven = solution.driven;
    svg.dataset.output = solution.output;
    svg.dataset.module = String(scale);
    svg.append(svgElement('path', { d: 'M-278 0H278 M0-270V270', class: 'gb-datum' }));
    const tickGroup = svgElement('g', { class: 'gb-ticks' });
    for (let tick = 0; tick < 60; tick++) {
      const angle = tick * TAU / 60;
      tickGroup.append(svgElement('path', {
        d: `M${point(tick % 5 === 0 ? 267 : 271, angle)} L${point(275, angle)}`,
      }));
    }
    svg.append(tickGroup);

    ring = svgElement('g', { class: 'gb-ring', 'data-member': 'ring', 'data-teeth': String(set.ring) });
    const outerRadius = 257;
    const outer = `M${outerRadius} 0 A${outerRadius} ${outerRadius} 0 1 0 -${outerRadius} 0 A${outerRadius} ${outerRadius} 0 1 0 ${outerRadius} 0 Z`;
    ring.append(svgElement('path', {
      d: `${outer} ${toothOutline(set.ring, DRAWING_RING_RADIUS, scale, true)}`,
      'fill-rule': 'evenodd', class: 'gb-tooth-face',
    }));
    ring.append(svgElement('circle', { r: '248', class: 'gb-face-circle' }));
    for (let index = 0; index < 6; index++) {
      ring.append(svgElement('circle', {
        cx: number(244 * Math.cos(index * TAU / 6)),
        cy: number(-244 * Math.sin(index * TAU / 6)),
        r: '3', class: 'gb-fastener',
      }));
    }
    ring.append(svgElement('path', { d: 'M234 0H255', class: 'gb-ring-index' }));
    svg.append(ring);

    sun = createGear(set.sun, pitch.sunRadius * scale, scale, 'gb-sun');
    sun.dataset.member = 'sun';
    sun.dataset.teeth = String(set.sun);
    svg.append(sun);
    planets = Array.from({ length: set.planets }, (_, index) => {
      const group = createGear(set.planet, pitch.planetRadius * scale, scale, 'gb-planet');
      group.dataset.planet = String(index);
      group.dataset.teeth = String(set.planet);
      svg.append(group);
      return group;
    });

    carrier = svgElement('g', { class: 'gb-carrier', 'data-member': 'carrier' });
    for (const [index, orbit] of solution.phases.orbits.entries()) {
      const end = point(pitch.orbitRadius * scale, orbit);
      carrier.append(svgElement('path', { d: `M0 0 L${end}`, class: 'gb-arm-halo' }));
      carrier.append(svgElement('path', { d: `M0 0 L${end}`, class: 'gb-arm' }));
      const pin = svgElement('g', {
        transform: `translate(${end})`, 'data-pin': String(index),
        'data-local-x': number(pitch.orbitRadius * Math.cos(orbit)),
        'data-local-y': number(pitch.orbitRadius * Math.sin(orbit)),
      });
      pin.append(svgElement('circle', { r: '10', class: 'gb-pin-outer' }));
      pin.append(svgElement('circle', { r: '3.5', class: 'gb-pin-inner' }));
      carrier.append(pin);
    }
    carrier.append(svgElement('circle', { r: '18', class: 'gb-pin-outer' }));
    carrier.append(svgElement('circle', { r: '8', class: 'gb-pin-inner' }));
    carrier.append(svgElement('path', { d: 'M-4 0H4M0-4V4', class: 'gb-hub-cross' }));
    svg.append(carrier);

    geometry = svgElement('g', { class: 'gb-pitch-geometry', 'data-pitch-geometry': '', 'aria-hidden': 'true' });
    for (const radius of [pitch.sunRadius, pitch.ringRadius]) {
      geometry.append(svgElement('circle', { r: number(radius * scale), class: 'gb-pitch-circle' }));
    }
    geometry.append(svgElement('circle', { r: number(pitch.orbitRadius * scale), class: 'gb-orbit-circle' }));
    pitchPlanets = planets.map(() => {
      const circle = svgElement('circle', { r: number(pitch.planetRadius * scale), class: 'gb-pitch-circle' });
      geometry.append(circle);
      return circle;
    });
    svg.append(geometry);

    const memberGroups: Record<Member, SVGGElement> = { sun, ring, carrier };
    for (const member of ['sun', 'ring', 'carrier'] as const) {
      memberGroups[member].dataset.role = member === next.grounded ? 'grounded' : member === next.driven ? 'driven' : 'output';
    }
    if (next.grounded === 'ring') {
      const ground = svgElement('g', { class: 'gb-ground-hatch' });
      for (const angle of [0, TAU / 3, 2 * TAU / 3]) {
        const symbol = svgElement('g', { transform: rotate(angle) });
        symbol.append(svgElement('path', { d: 'M259-15V15 M259-12L265-6 M259-4L265 2 M259 4L265 10' }));
        ground.append(symbol);
      }
      svg.append(ground);
    }
  }

  function draw(frame: GearboxFrame, showGeometry: boolean): void {
    if (destroyed) return;
    svg.dataset.time = frame.time.toFixed(6);
    const positions: [SVGGElement, number][] = [
      [sun, frame.sunAngle], [ring, frame.ringAngle], [carrier, frame.carrierAngle],
    ];
    for (const [group, angle] of positions) {
      group.setAttribute('transform', rotate(angle));
      group.dataset.angle = String(angle);
    }
    frame.planets.forEach((pose, index) => {
      const translation = `translate(${number(pose.x * scale)} ${number(-pose.y * scale)})`;
      planets[index].setAttribute('transform', `${translation} ${rotate(pose.angle)}`);
      planets[index].dataset.angle = String(pose.angle);
      planets[index].dataset.orbitAngle = String(pose.orbitAngle);
      planets[index].dataset.x = String(pose.x);
      planets[index].dataset.y = String(pose.y);
      pitchPlanets[index].setAttribute('transform', translation);
    });
    geometry.style.display = showGeometry ? '' : 'none';
    svg.dataset.pitch = String(showGeometry);
  }

  return {
    configure,
    draw,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      svg.remove();
    },
  };
}
