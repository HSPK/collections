import { query } from '../../core/page';
import { PHASES } from './data';
import { currentAt } from './engine';
import type { MotorFrame } from './engine';

const CENTER = 300;
const VECTOR_SCALE = 135;
const SVG_NS = 'http://www.w3.org/2000/svg';
const fixed = (value: number) => value.toFixed(4);

function point(angle: number, radius: number) {
  const radians = angle * Math.PI / 180;
  return { x: CENTER + Math.cos(radians) * radius, y: CENTER - Math.sin(radians) * radius };
}

function arc(start: number, difference: number, radius: number): string {
  const a = point(start, radius);
  const b = point(start + difference, radius);
  return `M ${fixed(a.x)} ${fixed(a.y)} A ${radius} ${radius} 0 ${Math.abs(difference) > 180 ? 1 : 0} ${difference > 0 ? 0 : 1} ${fixed(b.x)} ${fixed(b.y)}`;
}

function arrow(id: string, color: string, size = 8) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
    <path d="M 0 0 L 10 5 L 0 10 Z" fill="${color}"/>
  </marker>`;
}

export function createMotorScene(host: HTMLElement, id: string) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('mfl-motor-svg');
  svg.setAttribute('viewBox', '0 0 600 600');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${id}-motor-title ${id}-motor-desc`);
  svg.setAttribute('data-vector-scale', String(VECTOR_SCALE));

  const ticks = Array.from({ length: 72 }, (_, index) => {
    const a = point(index * 5, index % 6 === 0 ? 239 : 244);
    const b = point(index * 5, 250);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${index % 6 === 0 ? '#91a6a8' : '#40595d'}" stroke-width="${index % 6 === 0 ? 2 : 1}"/>`;
  }).join('');
  const axes = PHASES.map((phase) => {
    const a = point(phase.axis, 238);
    const b = point(phase.axis + 180, 238);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${phase.color}" stroke-opacity=".18" stroke-dasharray="3 8"/>`;
  }).join('');
  const coils = PHASES.map((phase) => [0, 1].map((opposite) => {
    const angle = phase.axis + opposite * 180;
    const pole = point(angle, 155);
    const label = point(angle, 273);
    return `<g data-mfl-coil="${phase.id}-${opposite}">
      <g transform="translate(300 300) rotate(${-angle})">
        <path d="M 174 -32 L 226 -39 L 226 39 L 174 32 Z" fill="#13262b" stroke="#587174" stroke-width="2"/>
        <rect x="180" y="-16" width="48" height="32" rx="4" fill="#3d5558" stroke="#748989"/>
        <g data-mfl-winding="${phase.id}" stroke="#d7986e" stroke-width="3" fill="#9d5b3129">
          ${Array.from({ length: 6 }, (_, turn) => `<rect x="${183 + turn * 6}" y="-30" width="5" height="60" rx="2.5"/>`).join('')}
        </g>
        <path d="M 176 -30 V 30" stroke="${phase.color}" stroke-width="5"/>
      </g>
      <text x="${pole.x}" y="${pole.y + 9}" text-anchor="middle" fill="${phase.color}" class="mfl-svg-pole" data-mfl-pole="${phase.id}-${opposite}">—</text>
      <text x="${label.x}" y="${label.y + 9}" text-anchor="middle" fill="${phase.color}" class="mfl-svg-phase">${phase.name}${opposite ? '′' : ''}</text>
    </g>`;
  }).join('')).join('');

  svg.innerHTML = `
    <title id="${id}-motor-title">Three-phase permanent-magnet motor, air-gap cross-section</title>
    <desc id="${id}-motor-desc"></desc>
    <defs>
      <radialGradient id="${id}-steel"><stop stop-color="#284247"/><stop offset=".75" stop-color="#1b3035"/><stop offset="1" stop-color="#102328"/></radialGradient>
      <linearGradient id="${id}-magnet"><stop stop-color="#b56f48"/><stop offset=".48" stop-color="#e7aa7a"/><stop offset="1" stop-color="#be744c"/></linearGradient>
      ${arrow(`${id}-field-arrow`, '#86f2dd', 17)}
      ${arrow(`${id}-torque-arrow`, '#efbc88', 12)}
      ${PHASES.map((phase) => arrow(`${id}-${phase.id}-arrow`, phase.color, 12)).join('')}
    </defs>
    <circle cx="300" cy="300" r="254" fill="none" stroke="#42595b"/>
    <circle cx="300" cy="300" r="235" fill="url(#${id}-steel)" stroke="#53696c" stroke-width="2"/>
    <circle cx="300" cy="300" r="171" fill="#0a191e" stroke="#577174" stroke-width="2"/>
    <circle cx="300" cy="300" r="143" fill="none" stroke="#294248" stroke-dasharray="2 6"/>
    ${ticks}${axes}${coils}
    <g data-mfl-flux stroke="#70d8c5" fill="none" stroke-width="2" opacity=".26">
      ${[-105, -70, -35, 0, 35, 70, 105].map((offset) => {
        const half = Math.sqrt(138 ** 2 - offset ** 2);
        return `<path d="M ${-half} ${offset} H ${half} m -9 -5 l 9 5 -9 5"/>`;
      }).join('')}
    </g>
    <path class="mfl-angle-arc" data-mfl-angle-arc fill="none" stroke="#dcb18a" stroke-width="2" stroke-dasharray="4 4"/>
    <g data-mfl-rotor>
      <rect x="-108" y="-32" width="216" height="64" rx="32" fill="#000a" transform="translate(0 7)"/>
      <path d="M 0 -29 H -78 A 29 29 0 0 0 -78 29 H 0 Z" fill="#405f65" stroke="#8fadae" stroke-width="2"/>
      <path d="M 0 -29 H 78 A 29 29 0 0 1 78 29 H 0 Z" fill="url(#${id}-magnet)" stroke="#e8bc90" stroke-width="2"/>
      <path d="M -73 -19 H 73" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
      <text x="-65" y="10" text-anchor="middle" fill="#eef3e9" class="mfl-svg-magnet" data-mfl-magnet-s>S</text>
      <text x="65" y="10" text-anchor="middle" fill="#172227" class="mfl-svg-magnet" data-mfl-magnet-n>N</text>
    </g>
    <g fill="none" stroke-width="3">
      ${PHASES.map((phase) => `<line data-mfl-vector="${phase.id}" x1="300" y1="300" x2="300" y2="300" stroke="${phase.color}" stroke-dasharray="${phase.dash}" marker-end="url(#${id}-${phase.id}-arrow)"/>`).join('')}
    </g>
    <line data-mfl-resultant-shadow x1="300" y1="300" x2="300" y2="300" stroke="#07181c" stroke-width="10"/>
    <line data-mfl-resultant x1="300" y1="300" x2="300" y2="300" stroke="#86f2dd" stroke-width="5" marker-end="url(#${id}-field-arrow)"/>
    <path data-mfl-torque-arc fill="none" stroke="#efbc88" stroke-width="3" marker-end="url(#${id}-torque-arrow)"/>
    <circle cx="300" cy="300" r="16" fill="#13272d" stroke="#aec4c2" stroke-width="2"/>
    <circle cx="300" cy="300" r="5" fill="#bacbc6"/>
  `;
  host.append(svg);
  const labelObserver = new ResizeObserver(() => {
    const bounds = svg.getBoundingClientRect();
    const size = Math.min(bounds.width, bounds.height);
    if (size <= 0) return;
    for (const label of svg.querySelectorAll<SVGTextElement>('text')) {
      label.style.fontSize = `${Math.max(label.classList.contains('mfl-svg-magnet') ? 28 : 26, 14.1 * 600 / size)}px`;
    }
  });
  labelObserver.observe(svg);

  const description = query<SVGDescElement>(svg, 'desc');
  const result = query<SVGLineElement>(svg, '[data-mfl-resultant]');
  const shadow = query<SVGLineElement>(svg, '[data-mfl-resultant-shadow]');
  const rotor = query<SVGGElement>(svg, '[data-mfl-rotor]');
  const magnetS = query<SVGTextElement>(svg, '[data-mfl-magnet-s]');
  const magnetN = query<SVGTextElement>(svg, '[data-mfl-magnet-n]');
  const flux = query<SVGGElement>(svg, '[data-mfl-flux]');
  const angleArc = query<SVGPathElement>(svg, '[data-mfl-angle-arc]');
  const torqueArc = query<SVGPathElement>(svg, '[data-mfl-torque-arc]');
  const channels = PHASES.map((phase) => ({
    vector: query<SVGLineElement>(svg, `[data-mfl-vector="${phase.id}"]`),
    positive: query<SVGTextElement>(svg, `[data-mfl-pole="${phase.id}-0"]`),
    negative: query<SVGTextElement>(svg, `[data-mfl-pole="${phase.id}-1"]`),
    windings: Array.from(svg.querySelectorAll<SVGGElement>(`[data-mfl-winding="${phase.id}"]`)),
  }));

  return {
    render(frame: MotorFrame) {
      for (const line of [result, shadow]) {
        line.setAttribute('x2', fixed(CENTER + frame.field.x * VECTOR_SCALE));
        line.setAttribute('y2', fixed(CENTER - frame.field.y * VECTOR_SCALE));
        line.setAttribute('visibility', frame.field.angle === null ? 'hidden' : 'visible');
      }
      flux.setAttribute('visibility', frame.field.angle === null ? 'hidden' : 'visible');
      flux.setAttribute('transform', `translate(300 300) rotate(${- (frame.field.angle ?? 0)})`);
      flux.setAttribute('opacity', String(frame.field.magnitude * 0.3));
      rotor.setAttribute('transform', `translate(300 300) rotate(${fixed(-frame.rotorMechanicalAngle)})`);
      magnetS.setAttribute('transform', `rotate(${fixed(frame.rotorMechanicalAngle)} -65 0)`);
      magnetN.setAttribute('transform', `rotate(${fixed(frame.rotorMechanicalAngle)} 65 0)`);
      const delta = frame.actualLoadAngle;
      angleArc.setAttribute('visibility', delta === null || Math.abs(delta) < 0.01 ? 'hidden' : 'visible');
      angleArc.setAttribute('d', arc(frame.rotorElectricalAngle, delta ?? 0, 66));
      const torqueSign = Math.sign(frame.torque);
      torqueArc.setAttribute('visibility', torqueSign === 0 ? 'hidden' : 'visible');
      torqueArc.setAttribute('d', arc(frame.rotorElectricalAngle + torqueSign * 24, torqueSign * 49, 118));
      torqueArc.setAttribute('data-sign', String(torqueSign));

      channels.forEach((channel, index) => {
        const current = frame.currents[index];
        const contribution = frame.contributions[index];
        channel.vector.setAttribute('x2', fixed(CENTER + contribution.x * VECTOR_SCALE));
        channel.vector.setAttribute('y2', fixed(CENTER - contribution.y * VECTOR_SCALE));
        channel.vector.setAttribute('visibility', current === 0 ? 'hidden' : 'visible');
        // The positive-axis stator face is S for a field pointing along that axis.
        channel.positive.textContent = current > 0 ? 'S' : current < 0 ? 'N' : '—';
        channel.negative.textContent = current > 0 ? 'N' : current < 0 ? 'S' : '—';
        channel.windings.forEach((winding) => winding.setAttribute('opacity', String(0.25 + Math.abs(current) * 0.75)));
      });
      description.textContent = `A, B, C axes: 0, 120, 240 degrees, each with opposite coil faces. Electrical command ${frame.electricalAngle.toFixed(1)} degrees. Currents ${frame.currents.map((value) => value.toFixed(3)).join(', ')}. Resultant magnitude ${frame.field.magnitude.toFixed(3)}, direction ${frame.field.angle === null ? 'undefined: zero field' : `${frame.field.angle.toFixed(1)} degrees counterclockwise from right`}. Rotor mechanical angle ${frame.rotorMechanicalAngle.toFixed(1)} degrees. Normalized torque ${frame.torque.toFixed(3)}; positive is counterclockwise.`;
    },
    destroy() { labelObserver.disconnect(); svg.remove(); },
  };
}

export function createWaveformScene(host: HTMLElement, id: string) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('mfl-wave-svg');
  svg.setAttribute('viewBox', '0 0 840 168');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${id}-wave-title ${id}-wave-desc`);
  const paths = PHASES.map((phase) => Array.from({ length: 361 }, (_, angle) =>
    `${angle === 0 ? 'M' : 'L'} ${fixed(angle / 360 * 840)} ${fixed(84 - currentAt(angle, phase.axis) * 64)}`,
  ).join(' '));
  svg.innerHTML = `
    <title id="${id}-wave-title">One electrical cycle of the three phase currents</title>
    <desc id="${id}-wave-desc">A peaks at 0 degrees, B at 120, and C at 240. Disabled channels become zero lines. Dots mark the present electrical command.</desc>
    <g stroke="#29454a" stroke-width="1" vector-effect="non-scaling-stroke">
      ${[0, 210, 420, 630, 840].map((x) => `<path d="M ${x} 0 V 168"/>`).join('')}
      ${[20, 84, 148].map((y) => `<path d="M 0 ${y} H 840" ${y === 84 ? 'stroke="#688387"' : 'stroke-dasharray="3 5"'}/>`).join('')}
    </g>
    ${PHASES.map((phase, index) => `<path data-mfl-wave="${phase.id}" d="${paths[index]}" fill="none" stroke="${phase.color}" stroke-width="2.5" stroke-dasharray="${phase.dash}" vector-effect="non-scaling-stroke"/>`).join('')}
    <line data-mfl-cursor x1="0" y1="0" x2="0" y2="168" stroke="#f2e9d5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    ${PHASES.map((phase) => `<circle data-mfl-wave-dot="${phase.id}" cx="0" cy="84" r="5" fill="${phase.color}" stroke="#0b1c21" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}
  `;
  host.append(svg);
  const cursor = query<SVGLineElement>(svg, '[data-mfl-cursor]');
  const channels = PHASES.map((phase) => ({
    path: query<SVGPathElement>(svg, `[data-mfl-wave="${phase.id}"]`),
    dot: query<SVGCircleElement>(svg, `[data-mfl-wave-dot="${phase.id}"]`),
  }));
  let previousMask = '';

  return {
    render(frame: MotorFrame) {
      const mask = frame.enabled.join(',');
      const x = fixed(frame.electricalAngle / 360 * 840);
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
      channels.forEach((channel, index) => {
        if (mask !== previousMask) {
          channel.path.setAttribute('d', frame.enabled[index] ? paths[index] : 'M 0 84 L 840 84');
          channel.path.setAttribute('data-enabled', String(frame.enabled[index]));
          channel.path.setAttribute('opacity', frame.enabled[index] ? '1' : '0.38');
          channel.path.setAttribute('stroke-dasharray', frame.enabled[index] ? PHASES[index].dash : '2 7');
        }
        channel.dot.setAttribute('cx', x);
        channel.dot.setAttribute('cy', fixed(84 - frame.currents[index] * 64));
        channel.dot.setAttribute('opacity', frame.enabled[index] ? '1' : '0.38');
      });
      previousMask = mask;
    },
    destroy() { svg.remove(); },
  };
}
