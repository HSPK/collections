import { createLoop } from '../../core/loop';
import { query } from '../../core/page';
import type { ProjectContext } from '../../core/types';
import { decode, describe, encode, NODES, NODE_IDS, nodeFor, TARGET, transfer } from './data';
import type { Shape, Signal } from './data';
import type { State } from './engine';

export function glyph(shape: Shape, size = 40): string {
  const color = NODES[nodeFor(shape)].color;
  const paths = shape === 'ring'
    ? '<ellipse cx="30" cy="30" rx="19" ry="24" transform="rotate(28 30 30)"/><ellipse cx="30" cy="30" rx="12" ry="24" transform="rotate(-28 30 30)"/><path d="M12 16L48 44"/>'
    : shape === 'fork'
      ? '<path d="M30 54V28L10 8M30 28L50 8M15 44L30 29L45 44M10 8L15 28L30 40L45 28L50 8"/>'
      : '<path d="M30 5L55 45H5ZM30 55L5 15H55Z"/><path d="M30 5V55M5 15L55 45M55 15L5 45"/>';
  return `<svg viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function body(shape: Shape): string {
  // Identical paths are used by the palette, incoming signal, composer, and spatial bodies.
  return glyph(shape, 92).replace('<svg ', '<svg x="-46" y="-46" ');
}

export function fieldMarkup(): string {
  return `<svg class="chorus-field-svg" viewBox="0 0 900 460" role="img" aria-label="The contact chamber: three resonators surrounding a living signal">
    <defs>
      <radialGradient id="chorus-light"><stop stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#f4efdf" stop-opacity="0"/></radialGradient>
      <linearGradient id="chorus-spectrum"><stop stop-color="#244bce"/><stop offset=".5" stop-color="#d65e49"/><stop offset="1" stop-color="#aa761c"/></linearGradient>
      <filter id="chorus-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <ellipse cx="450" cy="250" rx="440" ry="240" fill="url(#chorus-light)"/>
    <g class="chorus-floor" fill="none" stroke="#37382d" stroke-width=".65">
      ${[50, 80, 115, 150, 190].map(r => `<ellipse cx="450" cy="355" rx="${r * 2.2}" ry="${r * .43}"/>`).join('')}
      <path d="M30 355H870M450 280V442M130 305L770 408M130 408L770 305"/>
    </g>
    <g fill="none" stroke="url(#chorus-spectrum)" class="chorus-wave-lines">
      <path data-wave="0"/><path data-wave="1"/><path data-wave="2"/>
    </g>
    <path data-transfer-glow fill="none" stroke="url(#chorus-spectrum)" stroke-width="10" filter="url(#chorus-glow)"/>
    <path data-transfer fill="none" stroke="url(#chorus-spectrum)" stroke-width="2.5" stroke-dasharray="5 8"/>
    <circle data-traveler r="5" fill="#244bce"/>
    <g data-incoming></g>
    <g data-bodies>${NODE_IDS.map(id => `<g data-body-position="${id}" transform="translate(${NODES[id].x} 334)">
      <ellipse cy="43" rx="49" ry="10" fill="${NODES[id].color}" opacity=".08"/>
      <path d="M0 -22V-122" stroke="${NODES[id].color}" stroke-width=".7" opacity=".35"/>
      <g class="chorus-body" data-body="${id}" role="button" tabindex="0" aria-label="Pick ${NODES[id].shape} glyph">${body(NODES[id].shape)}</g>
      <text y="73" text-anchor="middle" class="chorus-body-name">${NODES[id].name.toUpperCase()}</text>
      <g data-stock="${id}"></g>
    </g>`).join('')}</g>
    <text x="32" y="36" class="chorus-field-label">CHAMBER / 03</text>
    <text x="868" y="36" text-anchor="end" class="chorus-field-label" data-field-mode>AWAITING CONTACT</text>
  </svg>
  <div class="chorus-field-readout" data-field-readout aria-live="off">No incoming signal</div>
  <div class="chorus-reserve-labels" aria-label="Resonator reserves">${NODE_IDS.map(id => `<span data-reserve-label="${id}">${NODES[id].name}</span>`).join('')}</div>
  <div class="chorus-field-caption" data-field-caption>They do not have a word for stranger.</div>`;
}

export function createField(
  host: HTMLElement,
  context: Pick<ProjectContext, 'reducedMotion'>,
  onPick: (shape: Shape) => void,
  signal: AbortSignal,
) {
  const svg = query<SVGSVGElement>(host, 'svg.chorus-field-svg');
  const incoming = query<SVGGElement>(svg, '[data-incoming]');
  const route = query<SVGPathElement>(svg, '[data-transfer]');
  const glow = query<SVGPathElement>(svg, '[data-transfer-glow]');
  const traveler = query<SVGCircleElement>(svg, '[data-traveler]');
  const waves = [...svg.querySelectorAll<SVGPathElement>('[data-wave]')];
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = context.reducedMotion || media.matches;
  let paused = false;
  let current: State | undefined;
  let shown: Signal | undefined;
  let lastKey = '';
  let demonstration = false;
  let compact = svg.clientWidth < 700 || svg.clientHeight < 280;
  const xFor = (id: typeof NODE_IDS[number]) => compact ? [68, 180, 292][NODE_IDS.indexOf(id)] : NODES[id].x;
  const baseline = () => compact ? 178 : 328;

  for (const id of NODE_IDS) {
    const node = query<SVGGElement>(svg, `[data-body="${id}"]`);
    node.addEventListener('click', () => onPick(NODES[id].shape), { signal });
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onPick(NODES[id].shape); }
    }, { signal });
  }

  function draw(time: number) {
    for (let index = 0; index < waves.length; index++) {
      const points: string[] = [];
      const width = compact ? 360 : 900;
      for (let x = 15; x <= width - 15; x += 6) {
        const envelope = Math.sin((x - 15) / (width - 30) * Math.PI);
        const y = (compact ? 153 : 250) + Math.sin(x / (compact ? 24 : 57) + index * .65) * Math.cos(time * .8 + index * .28) * envelope * (compact ? 8 + index * 5 : 14 + index * 10);
        points.push(`${x},${y.toFixed(2)}`);
      }
      waves[index].setAttribute('d', `M${points.join('L')}`);
    }
    const dots = incoming.querySelectorAll<SVGCircleElement>('[data-phase-dot]');
    dots.forEach((dot, index) => {
      const phase = shown?.phase === 'ask' ? index * Math.PI : 0;
      const center = compact ? 111 : 166;
      const rhythm = time * 2.4 / (shown?.duration ?? 1);
      const y = reduced ? (shown?.phase === 'ask' && index === 1 ? center + 8 : center - 8) : center + Math.sin(rhythm + phase) * 8;
      dot.setAttribute('cy', String(y));
    });
    if (demonstration && current?.active) {
      const { source, target } = transfer(current.active);
      const a = xFor(source), b = xFor(target);
      const t = reduced ? .55 : (time * .28) % 1;
      traveler.setAttribute('cx', String(a + (b - a) * t));
      traveler.setAttribute('cy', String(baseline() - Math.sin(t * Math.PI) * (compact ? 50 : 98)));
    }
  }

  const loop = createLoop(draw, { paused: reduced });
  media.addEventListener('change', () => {
    reduced = media.matches;
    loop.setPaused(reduced || paused);
    loop.requestRender();
  }, { signal });

  function render(state: State) {
    current = state;
    const plan = state.active;
    shown = plan ? encode(plan) : undefined;
    demonstration = Boolean(plan && (plan.intent === 'demonstrate' || plan.intent === 'contrast'));
    const key = JSON.stringify([plan, state.phase, compact]);
    if (key !== lastKey) {
      lastKey = key;
      const center = compact ? 180 : 450;
      const y = compact ? 77 : 121;
      const spread = compact ? 42 : 85;
      incoming.innerHTML = shown ? `
        <text x="${center}" y="${compact ? 26 : 68}" text-anchor="middle" class="chorus-incoming-label">${plan?.intent === 'contrast' ? 'A DIFFERENT EXAMPLE' : state.phase === 'calibration' ? 'ECHO THIS SIGNAL' : 'DECODE THE REQUEST'}</text>
        ${shown.glyphs.map((shape, index) => `<g transform="translate(${center + (index ? spread : -spread)} ${y}) scale(${compact ? .64 : 1})">${body(shape)}</g>
          <circle data-phase-dot cx="${center + (index ? spread : -spread)}" cy="${compact ? 111 : 158}" r="3.5" fill="${NODES[nodeFor(shape)].color}"/>`).join('')}
        <path d="M${center - 15} ${y}h30m-7 -5l7 5l-7 5" stroke="#292e31" stroke-width="1.3" fill="none"/>
        <g fill="#292e31">${Array.from({ length: shown.duration }, (_, i) => `<rect x="${center - shown!.duration * 8 + i * 16}" y="${compact ? 128 : 193}" width="10" height="3" rx="1"/>`).join('')}</g>
        <text x="${center}" y="225" text-anchor="middle" class="chorus-signal-label" ${compact ? 'visibility="hidden"' : ''}>${shown.duration} ${shown.duration === 1 ? 'pulse' : 'pulses'} / ${shown.phase === 'offer' ? 'joined' : 'alternating'}</text>`
        : `<g class="chorus-idle-sculpture" transform="translate(${center} ${compact ? 86 : 129}) scale(${compact ? .75 : 1})">${body('knot')}<circle r="67" fill="none" stroke="#244bce" stroke-width=".6"/><ellipse rx="100" ry="26" fill="none" stroke="#d65e49" stroke-width=".7" transform="rotate(-24)"/></g>
          <text x="${center}" y="225" text-anchor="middle" class="chorus-signal-label" ${compact ? 'visibility="hidden"' : ''}>${state.phase === 'won' ? 'ONE BEACON. TWO INTELLIGENCES.' : state.phase === 'lost' ? 'THE INTERVAL IS CLOSED.' : state.phase === 'negotiation' ? 'OFFER ACCEPTED / LISTEN AGAIN' : 'A LANGUAGE WAITING TO HAPPEN.'}</text>`;
      svg.setAttribute('aria-label', shown
        ? `Incoming signal: ${shown.glyphs.join(', then ')}; ${shown.duration} pulses; ${shown.phase === 'offer' ? 'joined' : 'alternating'} phase. ${demonstration && plan ? describe(plan) : ''}`
        : 'The contact chamber: Well, Reed and Crown wait around a quiet signal.');
    }
    if (demonstration && plan) {
      const { source, target } = transfer(plan);
      const a = xFor(source), b = xFor(target);
      const d = `M${a} ${baseline()}Q${(a + b) / 2} ${compact ? 105 : 132} ${b} ${baseline()}`;
      route.setAttribute('d', d);
      glow.setAttribute('d', d);
      traveler.setAttribute('fill', NODES[source].color);
    }
    route.style.opacity = glow.style.opacity = traveler.style.opacity = demonstration ? '1' : '0';
    for (const id of NODE_IDS) {
      query(svg, `[data-body-position="${id}"]`).setAttribute('transform', `translate(${xFor(id)} ${compact ? 178 : 334}) scale(${compact ? .64 : 1})`);
      query(host, `[data-reserve-label="${id}"]`).textContent = `${NODES[id].name} ${state.stock[id]}/${TARGET}`;
      query<SVGGElement>(svg, `[data-stock="${id}"]`).innerHTML = `
        ${Array.from({ length: 8 }, (_, i) => `<rect x="${-43 + i * 11}" y="86" width="7" height="6" rx="1" fill="${i < state.stock[id] ? NODES[id].color : 'none'}" stroke="${NODES[id].color}" stroke-width=".65" opacity="${i < state.stock[id] ? 1 : .4}"/>`).join('')}
        <path d="M0 83V96" stroke="#292e31"/>
        <text y="117" text-anchor="middle" class="chorus-stock-label">${state.stock[id]} / ${TARGET}</text>`;
    }
    query(svg, '[data-field-mode]').textContent = state.phase === 'negotiation' ? 'BALANCE EACH BODY TO FOUR' : `${state.phase.toUpperCase()} / ${state.bandwidth} INTERVALS`;
    query(host, '[data-field-readout]').textContent = shown ? `${shown.glyphs.join(' then ')} / ${shown.duration} ${shown.duration === 1 ? 'pulse' : 'pulses'} / ${shown.phase === 'offer' ? 'joined' : 'alternating'}` : terminalLabel(state);
    query(host, '[data-field-caption]').textContent = demonstration && plan
      ? `${describe(plan)}. Follow the moving light.`
      : state.phase === 'negotiation' ? 'Energy is real now. Move only surplus into a deficit; at most two pulses.'
        : state.phase === 'translation' ? 'An ask becomes an offer: reverse the nouns, keep the length, join the phase.'
          : state.phase === 'won' ? 'The standing wave now belongs to both of you.'
            : state.phase === 'lost' ? 'Silence is an ending, not an erased notebook.'
              : 'They do not have a word for stranger.';
    host.dataset.phase = state.phase;
    host.dataset.incoming = shown ? JSON.stringify(shown) : '';
    loop.requestRender();
  }

  function resize() {
    compact = svg.clientWidth < 700 || svg.clientHeight < 280;
    svg.setAttribute('viewBox', compact ? '0 0 360 250' : '0 0 900 460');
    host.dataset.compact = String(compact);
    query(svg, '.chorus-floor').setAttribute('transform', compact ? 'translate(0 65) scale(.4)' : '');
    if (current) render(current);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(svg);
  resize();
  return { render, destroy() { observer.disconnect(); loop.destroy(); }, setPaused(value: boolean) { paused = value; loop.setPaused(value || reduced); } };
}

function terminalLabel(state: State): string {
  return state.phase === 'won' ? 'Beacon restored' : state.phase === 'lost' ? 'Contact ended' : 'No incoming signal';
}
export function draftReading(signal: Signal | null, state: State): string {
  if (!signal) return 'Choose two glyphs. Order matters.';
  const meaning = decode(signal);
  if (!meaning) return 'Self-addressed: choose two different bodies.';
  if (signal.glyphs.every(shape => state.lexicon[shape])) return `${describe(meaning)}.`;
  return `${signal.glyphs.join(' then ')} / ${signal.duration} pulses / ${signal.phase === 'offer' ? 'joined' : 'alternating'}.`;
}
