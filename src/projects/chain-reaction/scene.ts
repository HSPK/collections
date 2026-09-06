import { escapeMarkup, query } from '../../core/page';
import { DOMINO, LAYOUTS, LEVER, MARBLE_RADIUS, STAGES, WHEEL } from './data';
import type { MachineLayout } from './data';
import { leverPose, marblePose, stateAt } from './timeline';
import type { ReactionState } from './timeline';

let nextSceneId = 0;
const fixed = (value: number) => value.toFixed(4);
const translate = (x: number, y: number) => `translate(${fixed(x)} ${fixed(y)})`;

function toothPath(): string {
  const points: string[] = [];
  for (let tooth = 0; tooth < 24; tooth++) {
    for (const [fraction, inset] of [[0, 9], [0.18, 9], [0.28, 0], [0.72, 0], [0.82, 9]] as const) {
      const radius = WHEEL.radius - inset;
      const angle = (tooth + fraction) / 24 * Math.PI * 2;
      points.push(`${fixed(Math.cos(angle) * radius)},${fixed(Math.sin(angle) * radius)}`);
    }
  }
  return `M${points.join('L')}Z`;
}

function bolt(x: number, y: number, radius = 4): string {
  return `<g transform="translate(${x} ${y})" fill="#dae9e8" stroke="#365c60" stroke-width="1.5"><circle r="${radius}"/><path d="m-2 2 4-4"/></g>`;
}

function illustration(layout: MachineLayout, prefix: string): string {
  const { width, height, firstDominoX, railY, railStartX, railRise, wheelX, wheelY, baseY, cordY, narrow } = layout;
  const lastDominoX = firstDominoX + (DOMINO.count - 1) * DOMINO.gap;
  const leverX = lastDominoX + LEVER.pivotOffset;
  const leverY = railY - LEVER.heightAboveRail;
  const railEnd = firstDominoX - DOMINO.width / 2 - MARBLE_RADIUS;
  const railControl = (railStartX + railEnd) / 2;
  const railPath = `M${railStartX} ${railY - railRise}Q${railControl} ${railY} ${railEnd} ${railY}H${lastDominoX + 20}`;
  const pinY = wheelY + WHEEL.radius - 8;
  const plateX = narrow ? 113 : 209;
  const plateY = narrow ? 402 : 348;
  const guideY = wheelY - 111;

  return `
    <svg class="cr-scene" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc">
      <title id="${prefix}-title">The Bloom Machine: a marble, ${DOMINO.count} dominoes, a lever, a cam wheel, and a mechanical flower.</title>
      <desc id="${prefix}-desc" data-scene-description></desc>
      <defs>
        <linearGradient id="${prefix}-copper" x1="0" y1="0" x2="0.8" y2="1">
          <stop stop-color="#e0aa84"/><stop offset=".48" stop-color="#bc7858"/><stop offset="1" stop-color="#9c5e45"/>
        </linearGradient>
        <linearGradient id="${prefix}-gold" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#f1cf79"/><stop offset="1" stop-color="#d8a344"/>
        </linearGradient>
        <radialGradient id="${prefix}-marble" cx=".3" cy=".25" r=".8">
          <stop stop-color="#fff2dd"/><stop offset=".4" stop-color="#f79b7b"/><stop offset="1" stop-color="#cf614e"/>
        </radialGradient>
        <pattern id="${prefix}-dots" width="21" height="21" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" fill="#42666a" opacity=".11"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#${prefix}-dots)"/>
      <ellipse cx="${narrow ? 298 : 621}" cy="${narrow ? 404 : 226}" rx="${narrow ? 219 : 408}" ry="${narrow ? 282 : 206}" fill="#f0f6f2" opacity=".3"/>
      <path d="${narrow ? 'M30 445h44m-22-22v44M482 88h30m-15-15v30' : 'M981 371h42m-21-21v42M181 90h25m-12-12v25'}" stroke="#8fadb0" stroke-width="1"/>

      <g aria-hidden="true">
        <ellipse cx="${width / 2}" cy="${baseY + 21}" rx="${width / 2 - 36}" ry="9" fill="#75999b" opacity=".15"/>
        <rect x="37" y="${baseY}" width="${width - 74}" height="15" rx="6" fill="#b77556" stroke="#365c60" stroke-width="2"/>
        <path d="M45 ${baseY + 4}H${width - 45}" stroke="#e3b492" stroke-width="2"/>
        <path d="M69 ${baseY + 16}v7h22v-7m${width - 176} 0v7h22v-7" fill="#365c60" stroke="#365c60" stroke-width="3" stroke-linejoin="round"/>

        <path d="M${railStartX + 20} ${railY - 43}V${baseY}M${lastDominoX - 17} ${railY + 14}V${narrow ? 272 : baseY}"
          fill="none" stroke="#365c60" stroke-width="16" stroke-linecap="round"/>
        <path d="M${railStartX + 20} ${railY - 43}V${baseY - 3}M${lastDominoX - 17} ${railY + 14}V${narrow ? 272 : baseY - 3}"
          fill="none" stroke="#acc9ca" stroke-width="12" stroke-linecap="round"/>
        ${narrow ? '' : `<path d="M${railStartX + 23} ${baseY - 12} ${lastDominoX - 19} ${railY + 37}" stroke="#75999b" stroke-width="5"/>
          <path d="M${railStartX + 23} ${baseY - 12} ${lastDominoX - 19} ${railY + 37}" stroke="#deebdf" stroke-width="2"/>`}
        ${bolt(railStartX + 20, railY - 34)}
        ${bolt(railStartX + 20, baseY - 13)}
        ${bolt(lastDominoX - 17, railY + 29)}

        <path d="${railPath}v12H${railEnd}Q${railControl} ${railY + 12} ${railStartX} ${railY - railRise + 12}Z"
          fill="url(#${prefix}-copper)" stroke="#365c60" stroke-width="2" stroke-linejoin="round"/>
        <path d="${railPath}" fill="none" stroke="#edc5a2" stroke-width="2" transform="translate(0 3)"/>
        <path d="M${railStartX - 4} ${railY - railRise - 5}v21" stroke="#365c60" stroke-width="5" stroke-linecap="round"/>
        ${bolt(railEnd + 10, railY + 7, 3)}
        ${bolt(lastDominoX + 10, railY + 7, 3)}

        <g class="cr-machine-lettering" transform="translate(${plateX} ${plateY}) rotate(-6)">
          <rect x="-15" y="-28" width="${narrow ? 157 : 176}" height="128" rx="5" fill="#dbe9e6" opacity=".95"/>
          <text x="0" y="0">One thing</text>
          <text x="0" y="34">leads to</text>
          <text x="0" y="68">another.</text>
          <path d="M8 86c47 12 83 8 104-8m-13-2 13 2-7 11" fill="none" stroke="#ac735b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </g>

        <path d="M${leverX} ${railY + 17}V${baseY - 1}" stroke="#365c60" stroke-width="14" stroke-linecap="round"/>
        <path d="M${leverX} ${railY + 17}V${baseY - 1}" stroke="#acc9ca" stroke-width="10" stroke-linecap="round"/>
        ${bolt(leverX, baseY - 14)}
        <path d="M${leverX - 18} ${railY + 13}l18-38 18 38Z" fill="#acc9ca" stroke="#365c60" stroke-width="2"/>
        <rect x="${leverX - 27}" y="${railY + 10}" width="54" height="9" rx="4" fill="#365c60"/>
        <path d="M${wheelX} ${wheelY + 6}V${baseY - 3}" stroke="#365c60" stroke-width="18" stroke-linecap="round"/>
        <path d="M${wheelX} ${wheelY + 6}V${baseY - 3}" stroke="#9ebfc2" stroke-width="13" stroke-linecap="round"/>
        ${bolt(wheelX, baseY - 14)}

        <path d="M${wheelX + 96} ${baseY}V${guideY + 18}q0-15-15-15h-66" fill="none" stroke="#365c60" stroke-width="13" stroke-linejoin="round"/>
        <path d="M${wheelX + 96} ${baseY - 1}V${guideY + 18}q0-15-15-15h-66" fill="none" stroke="#acc9ca" stroke-width="9" stroke-linejoin="round"/>
        ${bolt(wheelX + 96, baseY - 14)}
        ${bolt(wheelX + 96, wheelY + 74)}

        <path data-release-cord fill="none" stroke="#365c60" stroke-width="2.5" stroke-linejoin="round"/>
        ${[leverX + LEVER.halfLength, wheelX].map((x) => `
          <circle cx="${x}" cy="${cordY}" r="10" fill="#b87556" stroke="#365c60" stroke-width="2"/>
          <circle cx="${x}" cy="${cordY}" r="6" fill="#e0ad83" stroke="#365c60" stroke-width="1"/>
          ${bolt(x, cordY, 2)}
        `).join('')}
        <path data-weight-cord fill="none" stroke="#a3694f" stroke-width="2.5"/>
        <g data-counterweight>
          <path d="M-8 0v-7q8-8 16 0v7" fill="none" stroke="#365c60" stroke-width="2"/>
          <rect x="-17" width="34" height="28" rx="5" fill="url(#${prefix}-copper)" stroke="#365c60" stroke-width="2"/>
          <path d="M-12 7h24M-12 11h24" stroke="#edc5a2" stroke-width="1.5"/>
          <circle cy="20" r="3" fill="#8a533e"/>
        </g>

        <circle cx="${wheelX + 4}" cy="${wheelY + 5}" r="${WHEEL.radius + 2}" fill="#365c60" opacity=".14"/>
        <g transform="translate(${wheelX} ${wheelY})">
          <g data-wheel>
            <path d="${toothPath()}" fill="url(#${prefix}-gold)" stroke="#365c60" stroke-width="2" stroke-linejoin="round"/>
            <circle r="58" fill="none" stroke="#bc8b3f" stroke-width="2"/>
            <circle r="54" fill="none" stroke="#f7dd99" stroke-width="1.5"/>
            ${Array.from({ length: 8 }, (_, index) => {
              const angle = index / 8 * Math.PI * 2;
              return `<circle cx="${Math.cos(angle) * 44}" cy="${Math.sin(angle) * 44}" r="9" fill="#d4e6e8" stroke="#ad803e" stroke-width="2"/>`;
            }).join('')}
            <path d="M-8-67H8" stroke="#fff0b7" stroke-width="3" stroke-linecap="round"/>
          </g>
          <g data-cam>
            <circle r="${WHEEL.camRadius}" fill="url(#${prefix}-copper)" stroke="#365c60" stroke-width="2"/>
            <circle r="${WHEEL.camRadius - 5}" fill="none" stroke="#e8b691" stroke-width="1.5"/>
            <circle r="3" fill="#8e523e"/>
          </g>
          <circle r="11" fill="#365c60"/>
          <circle r="6" fill="#dfb896" stroke="#203e43" stroke-width="2"/>
          <path d="m-3 3 6-6" stroke="#365c60" stroke-width="2"/>
        </g>

        <g data-pin transform="translate(${wheelX} ${pinY})">
          <path d="M-4 0h8v20h-8Z" fill="#365c60" stroke="#203e43" stroke-width="1.5"/>
          <circle cy="23" r="4" fill="#e2b38e" stroke="#365c60" stroke-width="1.5"/>
        </g>
        <rect x="${wheelX - 12}" y="${pinY + 12}" width="24" height="11" rx="3" fill="#afc9c7" stroke="#365c60" stroke-width="2"/>
        ${bolt(wheelX - 8, pinY + 17, 2)}
        ${bolt(wheelX + 8, pinY + 17, 2)}

        <path data-stem stroke="#365c60" stroke-width="8" stroke-linecap="round"/>
        <path data-stem-highlight stroke="#deb08b" stroke-width="4" stroke-linecap="round"/>
        <g data-follower>
          <circle r="${WHEEL.rollerRadius}" fill="#eaf2e9" stroke="#365c60" stroke-width="2.5"/>
          <circle r="2.5" fill="#b57857"/>
        </g>
        <rect x="${wheelX - 13}" y="${guideY - 13}" width="26" height="35" rx="5" fill="#a8c7c8" stroke="#365c60" stroke-width="2"/>
        <path d="M${wheelX - 4} ${guideY - 10}v29m8-29v29" stroke="#466c70" stroke-width="1.5"/>
        ${bolt(wheelX - 9, guideY + 4, 2)}
        ${bolt(wheelX + 9, guideY + 4, 2)}

        <g data-flower>
          <path d="M0 29C-30 34-34 7-34 7S-8 4 0 29M0 29C25 29 35 9 35 9S7 4 0 29" fill="#91b6ae" stroke="#365c60" stroke-width="1.5"/>
          <path d="m0 29-25-15m25 15 27-13" stroke="#d9e7d5" stroke-width="1.5"/>
          <g data-flower-linkage fill="none" stroke="#9b6149" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path data-flower-arms/>
          </g>
          ${Array.from({ length: 8 }, (_, index) => `
            <g data-petal="${index}">
              <path d="M0 5C-17-3-22-26-10-41C-4-49 4-49 10-41C22-26 17-3 0 5Z"
                fill="${index % 2 ? '#ed8b70' : '#f1a083'}" stroke="#9c5947" stroke-width="1.5"/>
              <path d="M0-4V-35" stroke="#fbd0a7" stroke-width="1.2" stroke-linecap="round"/>
            </g>
          `).join('')}
          <circle data-flower-heart r="5" fill="url(#${prefix}-gold)" stroke="#8e5941" stroke-width="1.5"/>
          <g data-flower-seeds fill="#9c6745">
            <circle cx="-4" cy="-2" r="1.4"/><circle cx="4" cy="-2" r="1.4"/><circle cy="4" r="1.4"/>
          </g>
        </g>

        <g fill="none" stroke="#789b9e" stroke-width="1.5" stroke-dasharray="3 5" stroke-linecap="round">
          ${layout.labels.map((label) => `<path d="${label.leader}"/>`).join('')}
        </g>
        ${layout.labels.map((label) => {
          const stage = STAGES.find((candidate) => candidate.id === label.id)!;
          return `<g class="cr-scene-label" data-scene-stage="${stage.id}" transform="translate(${label.x} ${label.y})">
            <circle r="${narrow ? 19 : 15}"/>
            <text class="cr-scene-number" text-anchor="middle" dy=".35em">${stage.number}</text>
            <text class="cr-scene-word" x="${narrow ? 29 : 24}" dy=".35em">${escapeMarkup(stage.label)}</text>
          </g>`;
        }).join('')}
        ${narrow ? '' : `
          <g transform="translate(965 240) rotate(8)">
            <rect x="-55" y="-39" width="110" height="78" rx="7" fill="#dee9df" stroke="#719393" stroke-width="1.5"/>
            <path d="M-44-26h88M-44 26h88" stroke="#acc3b8" stroke-width="1"/>
            <text class="cr-maker-mark" text-anchor="middle" y="-8">CR / 01</text>
            <text class="cr-maker-small" text-anchor="middle" y="14">MADE TO BLOOM</text>
            ${bolt(-46, -30, 2)}${bolt(46, 30, 2)}
          </g>
        `}
      </g>

      <g data-domino-row aria-hidden="true">
        ${Array.from({ length: DOMINO.count }, (_, index) => `
          <g data-domino="${index}">
            <rect x="${-DOMINO.width / 2}" y="${-DOMINO.height}" width="${DOMINO.width}" height="${DOMINO.height}" rx="3" fill="${index % 2 ? '#ea9177' : '#e57d67'}" stroke="#925643" stroke-width="1.5"/>
            <path d="M${-DOMINO.width / 2 + 4} ${-DOMINO.height + 6}V-8" stroke="#f7c6a5" stroke-width="2" stroke-linecap="round"/>
            <path d="M${-DOMINO.width / 2 + 2} ${-DOMINO.height / 2}H${DOMINO.width / 2 - 2}" stroke="#a85b47" stroke-width="1"/>
            <circle cy="${-DOMINO.height * 0.73}" r="1.6" fill="#9b5844"/><circle cy="${-DOMINO.height * 0.26}" r="1.6" fill="#9b5844"/>
          </g>
        `).join('')}
      </g>
      <g aria-hidden="true">
        <path data-lever-arm stroke="#365c60" stroke-width="11" stroke-linecap="round"/>
        <path data-lever-inlay stroke="#deb386" stroke-width="7" stroke-linecap="round"/>
        <g data-left-paddle>
          <rect x="${-LEVER.paddleHalfWidth}" y="${-LEVER.paddleHalfHeight}" width="${LEVER.paddleHalfWidth * 2}" height="${LEVER.paddleHalfHeight * 2}" rx="3" fill="#d5ac65" stroke="#365c60" stroke-width="1.5"/>
          <circle r="2" fill="#8b6245"/>
        </g>
        <g data-right-paddle><circle r="5" fill="#deb386" stroke="#365c60" stroke-width="2"/></g>
        ${bolt(leverX, leverY, 7)}
        <g data-marble>
          <circle r="${MARBLE_RADIUS}" fill="url(#${prefix}-marble)" stroke="#9a624f" stroke-width="1.5"/>
          <path d="M-11-10C6-15 13-2 8 12M-13-5C0-8 7 0 6 13" fill="none" stroke="#fff0d4" stroke-width="2" opacity=".8"/>
          <circle cx="-5" cy="-7" r="3" fill="#fff8e5" opacity=".9"/>
        </g>
      </g>
    </svg>`;
}

export function createMachineScene(host: HTMLElement, signal: AbortSignal) {
  const prefix = `cr-machine-${++nextSceneId}`;
  const preference = window.matchMedia('(max-width: 680px)');
  let layout: MachineLayout = preference.matches ? LAYOUTS.narrow : LAYOUTS.wide;
  let current = stateAt(0);
  let disposed = false;
  let previousTime = Number.NaN;
  let previousStage = '';
  let parts: Record<string, SVGElement>;
  let dominoes: SVGElement[];
  let petals: SVGElement[];
  let labels: SVGElement[];

  function render(state: ReactionState) {
    if (disposed) return;
    current = state;
    if (state.time === previousTime) return;
    previousTime = state.time;
    const { wheelX, wheelY, railY, firstDominoX, cordY } = layout;
    const lever = leverPose(layout, state);
    const ball = marblePose(layout, state.marble);
    parts.marble.setAttribute('transform', `${translate(ball.x, ball.y)} rotate(${fixed(ball.angle)})`);
    dominoes.forEach((element, index) => {
      element.setAttribute('transform', `${translate(firstDominoX + DOMINO.gap * index, railY)} rotate(${fixed(state.dominoes[index])})`);
    });

    const arm = `M${fixed(lever.left.x)} ${fixed(lever.left.y)}L${fixed(lever.right.x)} ${fixed(lever.right.y)}`;
    parts['lever-arm'].setAttribute('d', arm);
    parts['lever-inlay'].setAttribute('d', arm);
    parts['left-paddle'].setAttribute('transform', translate(lever.left.x, lever.left.y));
    parts['right-paddle'].setAttribute('transform', translate(lever.right.x, lever.right.y));
    const pinTop = wheelY + WHEEL.radius - 8 + state.lever.lift;
    parts.pin.setAttribute('transform', translate(wheelX, pinTop));
    const guideX = lever.pivotX + LEVER.halfLength;
    const direction = wheelX > guideX ? 1 : -1;
    parts['release-cord'].setAttribute('d', `M${fixed(lever.right.x)} ${fixed(lever.right.y)}L${guideX} ${cordY - 10}Q${guideX} ${cordY} ${guideX + direction * 10} ${cordY}H${wheelX - direction * 10}Q${wheelX} ${cordY} ${wheelX} ${cordY - 10}V${fixed(pinTop + 23)}`);

    parts.wheel.setAttribute('transform', `rotate(${fixed(state.wheel.angle)})`);
    parts.wheel.setAttribute('data-angle', fixed(state.wheel.angle));
    parts.cam.setAttribute('transform', translate(state.wheel.camX, state.wheel.camY));
    const weightY = wheelY + WHEEL.radius + 14 + state.wheel.weightDrop;
    parts.counterweight.setAttribute('transform', translate(wheelX + WHEEL.drumRadius, weightY));
    parts['weight-cord'].setAttribute('d', `M${wheelX + WHEEL.drumRadius} ${wheelY}V${fixed(weightY - 8)}`);

    const followerY = wheelY + state.wheel.followerY;
    const flowerY = followerY - WHEEL.stemLength;
    parts.follower.setAttribute('transform', translate(wheelX, followerY));
    const stem = `M${wheelX} ${fixed(flowerY + 16)}V${fixed(followerY - WHEEL.rollerRadius)}`;
    parts.stem.setAttribute('d', stem);
    parts['stem-highlight'].setAttribute('d', stem);
    parts.flower.setAttribute('transform', translate(wheelX, flowerY));
    parts.flower.setAttribute('data-open', fixed(state.flower));
    parts['flower-arms'].setAttribute('d', `M${fixed(-5 - 24 * state.flower)} -8L0 ${fixed(25 - 16 * state.flower)}L${fixed(5 + 24 * state.flower)} -8`);
    petals.forEach((petal, index) => {
      const spread = (index - 3.5) * 45;
      const angle = spread * (0.08 + state.flower * 0.92);
      const scale = 0.76 + 0.24 * state.flower;
      petal.setAttribute('transform', `rotate(${fixed(angle)}) scale(${fixed(scale)})`);
    });
    parts['flower-heart'].setAttribute('r', fixed(5 + 8 * state.flower));
    parts['flower-seeds'].setAttribute('opacity', fixed(state.flower));
    if (state.stage !== previousStage) {
      previousStage = state.stage;
      labels.forEach((label) => label.classList.toggle('is-current', label.dataset.sceneStage === state.stage));
      const stage = STAGES.find((candidate) => candidate.id === state.stage)!;
      parts['scene-description'].textContent = `Stage ${stage.number}, ${stage.label}. ${stage.explanation} This is an illustrative hand-authored timeline, not a rigid-body physics simulation.`;
    }
  }

  function build() {
    if (disposed) return;
    layout = preference.matches ? LAYOUTS.narrow : LAYOUTS.wide;
    host.dataset.layout = layout.narrow ? 'narrow' : 'wide';
    host.innerHTML = illustration(layout, prefix);
    parts = Object.fromEntries([
      'marble', 'lever-arm', 'lever-inlay', 'left-paddle', 'right-paddle', 'release-cord',
      'pin', 'wheel', 'cam', 'counterweight', 'weight-cord', 'follower', 'stem',
      'stem-highlight', 'flower', 'flower-arms', 'flower-heart', 'flower-seeds', 'scene-description',
    ].map((name) => [name, query<SVGElement>(host, `[data-${name}]`)]));
    dominoes = [...host.querySelectorAll<SVGElement>('[data-domino]')];
    petals = [...host.querySelectorAll<SVGElement>('[data-petal]')];
    labels = [...host.querySelectorAll<SVGElement>('[data-scene-stage]')];
    previousTime = Number.NaN;
    previousStage = '';
    render(current);
  }

  build();
  preference.addEventListener('change', build, { signal });
  return {
    render,
    destroy() {
      if (disposed) return;
      disposed = true;
      host.replaceChildren();
    },
  };
}
