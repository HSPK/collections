import { escapeMarkup } from '../../core/markup';
import { COLONIES } from './data';
import type { ColonyId } from './data';
import type { Edit, State, Tile } from './engine';

export function center(tile: Tile) {
  return { x: 450 + (tile.q + tile.r / 2) * 113, y: 302 + tile.r * 96 };
}
function hex(x: number, y: number, radius: number, seed = 0): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 - 30) * Math.PI / 180;
    const rag = seed ? Math.sin(seed * 8 + i * 5) * 1.5 : 0;
    return `${(x + Math.cos(angle) * (radius + rag)).toFixed(1)},${(y + Math.sin(angle) * (radius + rag)).toFixed(1)}`;
  }).join(' ');
}
function vein(x: number, y: number, angle: number, length: number, color: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M0 6 Q-3 ${-length / 2} 0 ${-length}" fill="none" stroke="${color}" stroke-width="1.8"/>
    ${[0.23, 0.45, 0.68, 0.85].map((t, i) => `<path d="M0 ${-length * t} Q${-12 + i * 2} ${-length * t - 10} ${-7 + i} ${-length * t - 16}
      Q1 ${-length * t - 13} 0 ${-length * t} M0 ${-length * t} Q${12 - i * 2} ${-length * t - 7} ${9 - i} ${-length * t - 13} Q-1 ${-length * t - 11} 0 ${-length * t}" fill="${color}" stroke="#e8e3b2" stroke-width=".5"/>`).join('')}</g>`;
}
function organism(owner: ColonyId, biomass: number, seed: number): string {
  const colors = COLONIES[owner];
  const scale = 0.64 + biomass * 0.13;
  let form = '';
  if (owner === 'moss') {
    form = `<ellipse cy="10" rx="35" ry="20" fill="#344e2e" opacity=".25"/>` +
      Array.from({ length: 9 }, (_, i) => vein(Math.sin(i * 3) * 13, 12 + Math.cos(i) * 7, -95 + i * 23, 30 + Math.sin(i + seed) * 12, i % 2 ? colors.color : '#7d9454')).join('') +
      `<path class="graft-vein" d="M-31 19 Q-5 -13 31 9 M-16 22 Q4 8 8 -28" fill="none" stroke="#dbdf95" stroke-width="1.3"/>`;
  } else if (owner === 'lichen') {
    form = Array.from({ length: 7 }, (_, i) => {
      const x = Math.sin(i * 2.4) * (i ? 25 : 0), y = Math.cos(i * 2.4) * (i ? 20 : 0);
      const radius = 12 + (i % 3) * 2;
      return `<g transform="translate(${x} ${y}) rotate(${i * 41})">
        <path d="M-${radius} 0 Q-${radius + 8} -13 -5 -12 Q0 -23 7 -13 Q22 -16 17 -3 Q27 10 11 12 Q7 24 -3 14 Q-21 23 -18 8 Z" fill="${i % 2 ? '#cfb24f' : colors.pale}" stroke="${colors.color}" stroke-width="1.2"/>
        <ellipse rx="9" ry="7" fill="#9f792f" stroke="#f4dfa0" stroke-width="2"/>
        ${Array.from({ length: 8 }, (_, j) => `<circle cx="${Math.cos(j * 2) * 6}" cy="${Math.sin(j * 2) * 4}" r="1.2" fill="#f5e8b7"/>`).join('')}
        <path class="graft-vein" d="M0 0 L-12 -8 M0 0 L9 -13 M0 0 L15 8 M0 0 L-6 14" stroke="#f3dda0" stroke-width=".8" fill="none"/></g>`;
    }).join('');
  } else {
    form = `<path d="M-17 25 Q0 5 18 25" stroke="#824337" stroke-width="7" fill="none"/>` +
      Array.from({ length: 7 }, (_, i) => {
        const x = (i - 3) * 10, y = -28 + Math.abs(i - 3) * 5;
        return `<path d="M0 23 Q${x * 0.8} 3 ${x} ${y} Q${x + 10} ${y - 7} ${x + 14} ${y + 4}
          Q${x + 8} 3 7 24 Z" fill="${i % 2 ? '#d98168' : colors.pale}" stroke="${colors.color}" stroke-width="1.5"/>
          <path class="graft-vein" d="M3 22 Q${x + 5} 2 ${x + 7} ${y + 1}" fill="none" stroke="#fbe0bc" stroke-width="1.2"/>
          ${[0.25, 0.48, 0.72].map(t => `<ellipse cx="${x * t + 5}" cy="${23 + (y - 23) * t}" rx="2.1" ry="3.3" fill="#b95845" opacity=".65" transform="rotate(${-x / 3} ${x * t + 5} ${23 + (y - 23) * t})"/>`).join('')}`;
      }).join('');
  }
  return `<g transform="translate(0 -8) scale(${scale})" class="graft-organism">${form}</g>`;
}

function tileMarkup(tile: Tile, selected: boolean, drafted: boolean): string {
  const { x, y } = center(tile);
  const index = Number(tile.id.slice(1));
  const soil = tile.rock ? '#a69c80' : tile.water === 0 ? '#deba8e' : '#d1cb9c';
  const top = tile.rock ? '#bdb39a' : tile.water > 3 ? '#e0dfb8' : tile.water ? '#e6d8b1' : '#eed9b5';
  const title = `${tile.label}: ${tile.rock ? 'basalt' : `${tile.owner ? COLONIES[tile.owner].name : 'open soil'}, water ${tile.water}, nutrients ${tile.nutrients}, ${tile.structure}`}`;
  const pools = tile.water ? `<path d="M-45 7 Q-23 -12 -5 2 Q21 -8 44 10 Q27 34 3 31 Q-25 37 -45 7Z"
    fill="#8bbcb0" opacity="${0.18 + tile.water * 0.025}"/><path d="M-37 12 Q-15 26 6 19 T35 16" stroke="#f3f4d7" stroke-width="1.2" opacity=".8" fill="none"/>` : '';
  const shelter = tile.structure === 'shelter' ? `<g class="graft-structure"><path d="M-43 0 Q-30 -77 24 -54 Q45 -44 45 -8 Q4 -30 -43 0Z" fill="#f7efcc" fill-opacity=".7" stroke="#7b7950" stroke-width="1.5"/>
    <path d="M-39 -4 Q-11 -53 26 -48 M-24 -16 Q-6 -56 9 -55 M-5 -24 Q-1 -46 -2 -56 M15 -23 L23 -52 M-41 0 L-42 15 M43 -9 L43 9" stroke="#9b966a" stroke-width="1" fill="none"/></g>` :
    tile.structure === 'seedbank' ? `<g transform="translate(31 14)"><path d="M-9 3 Q-14 -13 0 -17 Q14 -13 9 3 Q0 10 -9 3Z" fill="#6e543f" stroke="#f5dfaa" stroke-width="2"/><path d="M0 5 V-10 M0 -3 L-5 -7 M0 -6 L5 -11" fill="none" stroke="#f5dfaa" stroke-width="1.5"/></g>` : '';
  return `<g transform="translate(${x} ${y})" data-site="${tile.id}" class="graft-tile ${selected ? 'is-selected' : ''} ${drafted ? 'is-draft' : ''}">
    <title>${escapeMarkup(title)}</title>
    <polygon points="${hex(3, 29, 61, index)}" fill="#6f6744" opacity=".1"/>
    <polygon points="${hex(0, 21, 60, index)}" fill="#ad8d63" stroke="#887348" stroke-width="1"/>
    <polygon points="${hex(0, 12, 60, index)}" fill="${soil}" stroke="#c3ab7a" stroke-width="1"/>
    <path d="M-50 43 Q-18 61 0 71 L51 43 M-50 38 Q-18 54 0 63 L51 38" stroke="#c9ae7f" stroke-width="1" fill="none"/>
    ${Array.from({ length: tile.nutrients }, (_, i) => `<circle cx="${-37 + i * 7}" cy="${43 + (i % 3) * 3}" r="2.5" fill="#edcb63" stroke="#9c813d" stroke-width=".5"/>`).join('')}
    <polygon points="${hex(0, 0, 60, index)}" fill="${top}" stroke="#a49a6f" stroke-width="1"/>
    <polygon points="${hex(0, -2, 56, index)}" fill="none" stroke="#faf3d4" stroke-width="1.2" opacity=".8"/>
    ${tile.rock ? `<path d="M-29 17 L-19 -31 L17 -43 L37 -4 L28 22Z" fill="#aaa990" stroke="#7c7f68"/><path d="M-19 -31 L4 -6 L37 -4 M4 -6 L28 22 M4 -6 L-29 17 M4 -6 L17 -43" fill="none" stroke="#cdd0ba"/>` :
      pools + Array.from({ length: 10 }, (_, i) => `<path d="M${Math.sin(i * 17 + index) * 43} ${Math.cos(i * 11 + index) * 37} l2 1" stroke="#9a9260" stroke-width="1" opacity=".5"/>`).join('') +
      (tile.owner ? organism(tile.owner, tile.biomass, index) : `<path d="M-10 7 Q0 -3 12 6 M-3 11 L4 -7" stroke="#b9b07f" stroke-width="1" fill="none"/>`)}
    ${shelter}
    <polygon class="graft-selection" points="${hex(0, -1, 63)}" fill="none" stroke="${drafted ? '#b35b35' : '#324d39'}" stroke-width="${selected ? 3 : drafted ? 2 : 0}" ${drafted ? 'stroke-dasharray="6 4"' : ''}/>
    ${selected ? `<g transform="translate(0 69)"><rect x="-23" y="-11" width="46" height="26" rx="13" fill="#314936"/><text y="8" text-anchor="middle" font-size="19" fill="#fff6d8" font-family="sans-serif">${tile.label}</text></g>` : ''}
    <polygon points="${hex(0, -2, 61)}" fill="transparent" class="graft-hit"/>
  </g>`;
}

export function createRenderer(host: HTMLElement, signal: AbortSignal, onSelect: (id: string) => void) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('graft-biome');
  svg.setAttribute('viewBox', '105 28 690 580');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Living hex biome. Pools show moisture, gold beads show soil nutrients. Use the Site selector or focus this map and use arrow keys to pick a tile.');
  host.append(svg);
  svg.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const id = target.closest<SVGGElement>('[data-site]')?.dataset.site;
    if (id) onSelect(id);
  }, { signal });
  return {
    draw(state: State, selected: string, edits: readonly Edit[], zoom: boolean) {
      const focus = state.tiles.find(tile => tile.id === selected)!;
      const point = center(focus);
      svg.setAttribute('viewBox', zoom ? `${point.x - 132} ${point.y - 115} 264 230` : '105 28 690 580');
      const drafted = new Set(edits.flatMap(edit => [edit.tile, edit.to]));
      svg.innerHTML = `<defs>
        <radialGradient id="graft-dish"><stop stop-color="#fcf6d8"/><stop offset=".72" stop-color="#e9dfbb"/><stop offset="1" stop-color="#d1c9a0"/></radialGradient>
        <pattern id="graft-grain" width="27" height="31" patternUnits="userSpaceOnUse"><circle cx="3" cy="6" r=".7" fill="#736c42" opacity=".12"/><path d="M16 20l3 -1" stroke="#fff5d2" stroke-width="1"/></pattern>
      </defs>
      <ellipse cx="450" cy="331" rx="321" ry="270" fill="#8f805a" opacity=".07"/>
      <ellipse cx="450" cy="313" rx="319" ry="270" fill="url(#graft-dish)" stroke="#a29b71" stroke-width="1"/>
      <ellipse cx="450" cy="308" rx="310" ry="261" fill="url(#graft-grain)" stroke="#fcf4cf" stroke-width="3"/>
      <ellipse cx="450" cy="308" rx="303" ry="254" fill="none" stroke="#b5af83" stroke-width=".7"/>
      ${Array.from({ length: 60 }, (_, i) => {
        const angle = i * Math.PI / 30;
        return `<path d="M${450 + Math.cos(angle) * 313} ${308 + Math.sin(angle) * 264} l${Math.cos(angle) * (i % 5 ? 3 : 7)} ${Math.sin(angle) * (i % 5 ? 3 : 7)}" stroke="#8f9066" stroke-width=".8"/>`;
      }).join('')}
      ${state.tiles.map(tile => tileMarkup(tile, tile.id === selected, drafted.has(tile.id))).join('')}
      <g pointer-events="none">${state.links.map(link => {
        const from = center(state.tiles.find(tile => tile.id === link.from)!);
        const to = center(state.tiles.find(tile => tile.id === link.to)!);
        return `<path d="M${from.x} ${from.y + 23} Q${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + (link.kind === 'bridge' ? -52 : 33)} ${to.x} ${to.y + 23}"
          fill="none" stroke="${link.kind === 'bridge' ? '#ede5b8' : '#4d9696'}" stroke-width="${link.kind === 'bridge' ? 7 : 5}"/>
          <path class="graft-vein" d="M${from.x} ${from.y + 23} Q${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + (link.kind === 'bridge' ? -52 : 33)} ${to.x} ${to.y + 23}"
          fill="none" stroke="${link.kind === 'bridge' ? '#93794f' : '#d8ead3'}" stroke-width="1.5" stroke-dasharray="${link.kind === 'bridge' ? '3 3' : '9 4'}"/>`;
      }).join('')}</g>`;
    },
    destroy() { svg.remove(); },
  };
}
