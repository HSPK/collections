import { query } from '../../core/page';
import { sliderCrank, valveLift } from './engine';
import type { EngineState, Geometry } from './engine';
import { strokes } from './data';

export const DRAWING_SCALE = 48;
export const AXIS_X = 270;
export const TDC_WRIST_Y = 154;
let drawingCount = 0;

export function crankCenter(geometry: Geometry) {
  return { x: AXIS_X, y: TDC_WRIST_Y + (geometry.rod + geometry.radius) * DRAWING_SCALE };
}

export function createDrawing(host: HTMLElement) {
  const id = `er-cutaway-${++drawingCount}`;
  host.innerHTML = `
    <svg class="er-scene" viewBox="0 0 540 560" role="img" tabindex="0" aria-labelledby="${id}-title ${id}-desc" aria-describedby="er-keyboard">
      <title id="${id}-title">A four-stroke engine, cut through its center</title>
      <desc id="${id}-desc" data-description></desc>
      <defs>
        <pattern id="${id}-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#32505b" stroke-width=".6"/></pattern>
        <pattern id="${id}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0V8" stroke="#82959d" stroke-opacity=".4" stroke-width="2"/></pattern>
        <linearGradient id="${id}-metal" x1="0" x2="1"><stop stop-color="#728d98"/><stop offset=".35" stop-color="#c6d3d4"/><stop offset="1" stop-color="#6e8790"/></linearGradient>
        <linearGradient id="${id}-piston" x1="0" x2="1"><stop stop-color="#859da4"/><stop offset=".25" stop-color="#e9eeea"/><stop offset=".7" stop-color="#d0dbd8"/><stop offset="1" stop-color="#718b95"/></linearGradient>
        <linearGradient id="${id}-rod" x1="0" x2="1"><stop stop-color="#f5d8a1"/><stop offset="1" stop-color="#b58b55"/></linearGradient>
        <marker id="${id}-intake" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="#8ee1ea"/></marker>
        <marker id="${id}-exhaust" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="#ffc07c"/></marker>
      </defs>
      <rect x="12" y="8" width="516" height="544" rx="12" fill="url(#${id}-grid)" opacity=".55"/>
      <g fill="none" stroke="#47707c" stroke-width="1"><path d="M28 46V24H50M490 24H512V46M28 510V532H50M490 532H512V510"/></g>
      <path data-case fill="#29424c" stroke="#799099" stroke-width="2"/>
      <path data-case-hatch fill="url(#${id}-hatch)" opacity=".55"/>
      <g data-construction fill="none" stroke="#77929a" stroke-width="1" stroke-dasharray="5 5">
        <path d="M270 36V530"/>
        <circle data-orbit cx="270" cy="365" r="48"/>
        <path d="M190 154H355M190 250H355"/>
        <path d="M394 124V220M386 124H402M386 220H402"/>
      </g>
      <g data-flywheel>
        <circle r="65" fill="#192f38" stroke="#708d99" stroke-width="3"/>
        <circle r="56" fill="none" stroke="#395966" stroke-width="8"/>
        <path d="M-35 30A46 46 0 0 0 35 30L18 8A20 20 0 0 1-18 8Z" fill="#607d88" stroke="#8da0a5"/>
        <path d="M0 0V-48" stroke="#92a8ae" stroke-width="28" stroke-linecap="round"/>
        <path d="M0 0V-48" stroke="#c0cecc" stroke-width="12" stroke-linecap="round"/>
        <path d="M-5-61H5" stroke="#ff9d73" stroke-width="4"/>
      </g>
      <g data-cylinder>
        <path d="M182 108H202V295H182ZM338 108H358V295H338Z" fill="url(#${id}-metal)" stroke="#c0d0d2"/>
        <path d="M182 108H202V295H182ZM338 108H358V295H338Z" fill="url(#${id}-hatch)"/>
        ${[126, 150, 174, 198, 222, 246, 270].map((y) => `<path d="M168 ${y}H200M340 ${y}H372" stroke="#718b93" stroke-width="7"/><path d="M168 ${y - 3}H199M341 ${y - 3}H372" stroke="#b2c3c6" stroke-width="1"/>`).join('')}
        <rect data-chamber x="203" y="116" width="134" height="100" fill="#62c9db" fill-opacity=".16"/>
        <path d="M202 111H338" stroke="#d0d7d3" stroke-width="3"/>
      </g>
      <g data-heat fill="none" stroke="#ffb782" stroke-width="2.5">
        <path d="M270 119V127M261 121 257 127M279 121 283 127M250 135H256M284 135H290"/>
      </g>
      <g data-gas-intake>
        <path d="M76 88H114M145 88H181M222 119V139" fill="none" stroke="#8ee1ea" stroke-width="2.5" marker-end="url(#${id}-intake)"/>
        <path data-intake-gas fill="none" stroke="#8ee1ea" stroke-width="2.5" marker-end="url(#${id}-intake)"/>
      </g>
      <g data-gas-exhaust>
        <path data-exhaust-gas fill="none" stroke="#ffc07c" stroke-width="2.5" marker-end="url(#${id}-exhaust)"/>
      </g>
      <line data-rod-shadow stroke="#122932" stroke-width="30" stroke-linecap="round"/>
      <line data-rod stroke="url(#${id}-rod)" stroke-width="21" stroke-linecap="round"/>
      <line data-rod-inset stroke="#8e6e46" stroke-width="7" stroke-linecap="round"/>
      <g data-piston>
        <path d="M204-30H336V30H318V13H222V30H204Z" fill="url(#${id}-piston)" stroke="#e4ece9" stroke-width="1.5"/>
        <path d="M205-22H335M205-15H335M205-8H335" stroke="#334e59" stroke-width="3"/>
        <path d="M221 11V29M319 11V29" stroke="#607d88" stroke-width="2"/>
        <path d="M209-30H331" stroke="#ffdbad" stroke-width="3"/>
      </g>
      <circle data-pin r="15" fill="#c9d5d3" stroke="#243e49" stroke-width="4"/>
      <circle data-pin-inner r="5" fill="#46616b"/>
      <circle data-wrist r="10" fill="#718f99" stroke="#ecede4" stroke-width="2"/>
      <circle data-wrist-inner r="3" fill="#243e49"/>
      <circle data-center r="17" fill="#c3d0d0" stroke="#102731" stroke-width="5"/>
      <circle data-center-inner r="6" fill="#425d68"/>
      <g data-head>
        <path d="M159 60Q159 49 173 49H367Q381 49 381 64V110H159Z" fill="url(#${id}-metal)" stroke="#becfd0" stroke-width="2"/>
        <path d="M159 60Q159 49 173 49H367Q381 49 381 64V110H159Z" fill="url(#${id}-hatch)"/>
        <path d="M67 88H209Q231 88 231 111" fill="none" stroke="#142f3a" stroke-width="25"/>
        <path d="M67 88H209Q231 88 231 111" fill="none" stroke="#5c9ca8" stroke-width="17"/>
        <path d="M309 111Q309 88 331 88H473" fill="none" stroke="#142f3a" stroke-width="25"/>
        <path d="M309 111Q309 88 331 88H473" fill="none" stroke="#9c7256" stroke-width="17"/>
        <path d="M67 78V98M473 78V98" stroke="#c5d3d4" stroke-width="4"/>
        <rect x="264" y="57" width="12" height="26" rx="3" fill="#e9e4ce" stroke="#19313c" stroke-width="2"/>
        <path d="M263 85H277V104H274V116H270V106H266V104H263Z" fill="#acbfc1" stroke="#213b47" stroke-width="1.5"/>
        <path d="M260 88H280M260 93H280" stroke="#496772" stroke-width="2"/>
      </g>
      <g data-intake-flow fill="none" stroke="#bcf2f2" stroke-width="2.5" marker-end="url(#${id}-intake)">
        <path d="M77 88H112M149 88H182M215 93 227 104"/>
      </g>
      <g data-exhaust-flow fill="none" stroke="#ffd3a0" stroke-width="2.5" marker-end="url(#${id}-exhaust)">
        <path d="M316 103 328 92M351 88H384M414 88H455"/>
      </g>
      <g data-valve="intake">
        <path d="M228 59H234V108H228Z" fill="#e1e9e5" stroke="#223e49"/>
        <path d="M215 108H247L242 115H220Z" fill="#a4d9df" stroke="#1c3540" stroke-width="1.5"/>
        <path d="M222 62H240" stroke="#17333d" stroke-width="4"/>
      </g>
      <g data-valve="exhaust">
        <path d="M306 59H312V108H306Z" fill="#e1e9e5" stroke="#223e49"/>
        <path d="M293 108H325L320 115H298Z" fill="#d9b68a" stroke="#1c3540" stroke-width="1.5"/>
        <path d="M300 62H318" stroke="#17333d" stroke-width="4"/>
      </g>
      <g data-leaders fill="none" stroke="#8198a0" stroke-width="1">
        <path data-piston-leader/>
        <path data-rod-leader/>
        <path data-crank-leader/>
      </g>
      <g class="er-part-numbers" fill="#d9e3df" font-size="20" font-family="monospace" text-anchor="middle">
        <g data-piston-label><circle r="14" fill="#243f4a" stroke="#7d989f"/><text y="7">1</text></g>
        <g data-rod-label><circle r="14" fill="#243f4a" stroke="#7d989f"/><text y="7">2</text></g>
        <g data-crank-label><circle r="14" fill="#243f4a" stroke="#7d989f"/><text y="7">3</text></g>
      </g>
    </svg>`;

  const svg = query<SVGSVGElement>(host, 'svg');
  const part = <T extends SVGElement>(selector: string) => query<T>(svg, selector);
  const rodLines = ['[data-rod-shadow]', '[data-rod]', '[data-rod-inset]'].map((selector) => part<SVGLineElement>(selector));
  const circles = {
    pin: [part<SVGCircleElement>('[data-pin]'), part<SVGCircleElement>('[data-pin-inner]')],
    wrist: [part<SVGCircleElement>('[data-wrist]'), part<SVGCircleElement>('[data-wrist-inner]')],
    center: [part<SVGCircleElement>('[data-center]'), part<SVGCircleElement>('[data-center-inner]')],
  };
  const piston = part('[data-piston]');
  const flywheel = part('[data-flywheel]');
  const chamber = part('[data-chamber]');
  const cylinderCase = part('[data-case]');
  const caseHatch = part('[data-case-hatch]');
  const orbit = part('[data-orbit]');
  const intakeValve = part('[data-valve="intake"]');
  const exhaustValve = part('[data-valve="exhaust"]');
  const intakeFlows = [part('[data-intake-flow]'), part('[data-gas-intake]')];
  const exhaustFlows = [part('[data-exhaust-flow]'), part('[data-gas-exhaust]')];
  const intakeGas = part('[data-intake-gas]');
  const exhaustGas = part('[data-exhaust-gas]');
  const heat = part('[data-heat]');
  const construction = part('[data-construction]');
  const pistonLeader = part('[data-piston-leader]');
  const rodLeader = part('[data-rod-leader]');
  const crankLeader = part('[data-crank-leader]');
  const pistonLabel = part('[data-piston-label]');
  const rodLabel = part('[data-rod-label]');
  const crankLabel = part('[data-crank-label]');
  const description = part('[data-description]');

  function draw(state: EngineState, geometry: Geometry, showConstruction: boolean, showFlow: boolean) {
    const origin = crankCenter(geometry);
    const pin = { x: origin.x + state.pose.crank.x * DRAWING_SCALE, y: origin.y - state.pose.crank.y * DRAWING_SCALE };
    const wrist = { x: AXIS_X, y: origin.y - state.pose.wrist.y * DRAWING_SCALE };
    const crown = wrist.y - 30;
    const casing = `M181 267L160 302V${origin.y + 25}Q160 ${origin.y + 84} 220 ${origin.y + 84}H320Q380 ${origin.y + 84} 380 ${origin.y + 25}V302L359 267H342L361 311V${origin.y + 22}Q361 ${origin.y + 65} 319 ${origin.y + 65}H221Q179 ${origin.y + 65} 179 ${origin.y + 22}V311L198 267Z`;
    cylinderCase.setAttribute('d', casing);
    caseHatch.setAttribute('d', casing);
    for (const line of rodLines) {
      line.setAttribute('x1', String(pin.x));
      line.setAttribute('y1', String(pin.y));
      line.setAttribute('x2', String(wrist.x));
      line.setAttribute('y2', String(wrist.y));
    }
    for (const [key, point] of [['pin', pin], ['wrist', wrist], ['center', origin]] as const) {
      for (const circle of circles[key]) {
        circle.setAttribute('cx', String(point.x));
        circle.setAttribute('cy', String(point.y));
      }
    }
    piston.setAttribute('transform', `translate(0 ${wrist.y})`);
    flywheel.setAttribute('transform', `translate(${origin.x} ${origin.y}) rotate(${state.angle % 360})`);
    orbit.setAttribute('cy', String(origin.y));
    orbit.setAttribute('r', String(geometry.radius * DRAWING_SCALE));
    chamber.setAttribute('height', String(crown - 116));
    chamber.setAttribute('fill', strokes[state.strokeIndex].color);
    chamber.setAttribute('fill-opacity', state.stroke === 'power' ? '.38' : '.18');
    intakeValve.setAttribute('transform', `translate(0 ${18 * state.intakeLift})`);
    exhaustValve.setAttribute('transform', `translate(0 ${18 * state.exhaustLift})`);
    intakeValve.dataset.lift = state.intakeLift.toFixed(6);
    exhaustValve.dataset.lift = state.exhaustLift.toFixed(6);
    for (const element of intakeFlows) element.setAttribute('opacity', showFlow && state.intakeLift > 0.02 ? '1' : '0');
    for (const element of exhaustFlows) element.setAttribute('opacity', showFlow && state.exhaustLift > 0.02 ? '1' : '0');
    intakeGas.setAttribute('d', `M244 140V${Math.max(141, crown - 10)}M294 141V${Math.max(142, crown - 10)}`);
    exhaustGas.setAttribute('d', `M285 ${Math.max(135, crown - 10)}V133L303 120`);
    heat.setAttribute('opacity', showFlow && state.stroke === 'power' && state.localAngle < 26 ? String(1 - state.localAngle / 26) : '0');
    construction.setAttribute('opacity', showConstruction ? '1' : '0');
    const rodMid = (pin.y + wrist.y) / 2;
    pistonLeader.setAttribute('d', `M205 ${wrist.y - 15}H112V${wrist.y - 23}`);
    rodLeader.setAttribute('d', `M${(pin.x + wrist.x) / 2 + 17} ${rodMid}H410V${rodMid - 8}`);
    crankLeader.setAttribute('d', `M${origin.x - 61} ${origin.y + 32}H112V${origin.y + 39}`);
    pistonLabel.setAttribute('transform', `translate(111 ${wrist.y - 37})`);
    rodLabel.setAttribute('transform', `translate(410 ${rodMid - 22})`);
    crankLabel.setAttribute('transform', `translate(111 ${origin.y + 53})`);
    svg.dataset.travel = state.pose.displacement.toFixed(6);
    description.textContent = `${strokes[state.strokeIndex].name}, ${state.angle.toFixed(1)} degrees of 720. Piston ${(state.pose.strokeFraction * 100).toFixed(1)} percent down its stroke. Intake valve ${state.intakeLift > 0 ? 'open' : 'closed'}; exhaust valve ${state.exhaustLift > 0 ? 'open' : 'closed'}. Parts: 1 piston, 2 connecting rod, 3 crank.`;
  }

  return { svg, draw };
}

export function travelPath(geometry: Geometry): string {
  return Array.from({ length: 361 }, (_, index) => {
    const angle = index * 2;
    return `${index === 0 ? 'M' : 'L'}${angle} ${(20 + sliderCrank(angle, geometry).strokeFraction * 86).toFixed(4)}`;
  }).join(' ');
}

export function valvePath(eventStart: number): string {
  return Array.from({ length: 361 }, (_, index) => {
    const angle = index * 2;
    const local = angle - eventStart;
    const lift = local >= 0 && local <= 180 ? valveLift(local) : 0;
    return `${index === 0 ? 'M' : 'L'}${angle} ${(106 - 86 * lift).toFixed(4)}`;
  }).join(' ');
}
