import { escapeMarkup } from '../../core/page';
import { tileById } from './data';
import type { TileId } from './data';
import { addressOf, analyzePlan, isStreet, serializePlan } from './engine';
import type { CityMetrics, CityPlan } from './engine';

type Point = readonly [number, number, number?];
interface Connections { north: boolean; east: boolean; south: boolean; west: boolean }
interface BlockColors { top: string; left: string; right: string }

const INK = '#46594a';
const PAPER = '#f4ecd8';
const GROUP_INKS = ['#85452f', '#315f74', '#596536', '#794f76', '#805f19', '#3b6c60'];
const noConnections: Connections = { north: false, east: false, south: false, west: false };

function xy(u: number, v: number, z = 0): [number, number] {
  return [(u - v) * 36, (u + v) * 20 - z];
}

function point([u, v, z = 0]: Point): string {
  return xy(u, v, z).map((value) => Number(value.toFixed(2))).join(',');
}

function polygon(points: readonly Point[], fill: string, stroke = INK, width = 0.7): string {
  return `<polygon points="${points.map(point).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

function line(from: Point, to: Point, color = INK, width = 1, extra = ''): string {
  const [x1, y1] = xy(...from);
  const [x2, y2] = xy(...to);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
}

function ground(color: string): string {
  return polygon([[0, 0], [1, 0], [1, 1], [0, 1]], color, '#c0b99d', 0.65);
}

function slab(u: number, v: number, w: number, d: number, h: number, colors: BlockColors, base = 0): string {
  const top = base + h;
  return [
    polygon([[u, v + d, base], [u + w, v + d, base], [u + w, v + d, top], [u, v + d, top]], colors.left),
    polygon([[u + w, v, base], [u + w, v + d, base], [u + w, v + d, top], [u + w, v, top]], colors.right),
    polygon([[u, v, top], [u + w, v, top], [u + w, v + d, top], [u, v + d, top]], colors.top),
  ].join('');
}

function frontWindow(u: number, v: number, z: number, w = 0.12, h = 8): string {
  return polygon([[u, v, z], [u + w, v, z], [u + w, v, z + h], [u, v, z + h]], '#466b70', '#eeddba', 1.1)
    + line([u + w / 2, v, z + 0.8], [u + w / 2, v, z + h - 0.8], '#eeddba', 0.65);
}

function sideWindow(u: number, v: number, z: number, w = 0.13, h = 8): string {
  return polygon([[u, v, z], [u, v + w, z], [u, v + w, z + h], [u, v, z + h]], '#42646a', '#e0d4b5', 1);
}

function door(u: number, v: number, w = 0.16, h = 15, color = '#426b64'): string {
  const [cx, cy] = xy(u + w * 0.8, v, h * 0.45);
  return polygon([[u, v, 0], [u + w, v, 0], [u + w, v, h], [u, v, h]], color)
    + `<circle cx="${cx}" cy="${cy}" r="0.8" fill="#ecc984"/>`;
}

function gable(u: number, v: number, w: number, d: number, h: number, rise: number, color: string): string {
  const ridge = u + w / 2;
  return [
    polygon([[u - 0.035, v - 0.035, h], [ridge, v - 0.035, h + rise], [ridge, v + d + 0.035, h + rise], [u - 0.035, v + d + 0.035, h]], '#bc7255'),
    polygon([[ridge, v - 0.035, h + rise], [u + w + 0.035, v - 0.035, h], [u + w + 0.035, v + d + 0.035, h], [ridge, v + d + 0.035, h + rise]], color),
    polygon([[u, v + d, h], [u + w, v + d, h], [ridge, v + d, h + rise]], '#efd7ae'),
    line([ridge, v - 0.035, h + rise], [ridge, v + d + 0.035, h + rise], '#754c3c', 1),
    line([u + w * 0.7, v, h + rise * 0.58], [u + w * 0.7, v + d, h + rise * 0.58], '#e8b489', 0.65),
  ].join('');
}

function tree(u: number, v: number, scale = 1, light = false): string {
  const [x, y] = xy(u, v);
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <ellipse cx="1" cy="1" rx="10" ry="4" fill="#5f7452" opacity=".2"/>
    <path d="M0 0V-22M0-11L-6-18M0-15L6-22" fill="none" stroke="#746043" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M-10-15C-19-16-18-28-10-31C-12-42 2-46 8-37C19-39 24-24 15-19C17-10 5-8 0-13C-4-10-9-10-10-15Z"
      fill="${light ? '#91a56c' : '#749368'}" stroke="#4b6a4d" stroke-width="1.1"/>
    <path d="M-9-28C-7-35 0-37 4-31M3-23C8-28 14-26 14-23" fill="none" stroke="${light ? '#b5c08a' : '#9cb47d'}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function bench(u: number, v: number): string {
  return line([u, v, 0], [u, v, 7], '#687357', 1.6)
    + line([u + 0.3, v, 0], [u + 0.3, v, 7], '#687357', 1.6)
    + polygon([[u - 0.03, v - 0.035, 5], [u + 0.33, v - 0.035, 5], [u + 0.33, v + 0.09, 5], [u - 0.03, v + 0.09, 5]], '#b79965')
    + line([u - 0.03, v - 0.035, 10], [u + 0.33, v - 0.035, 10], '#ad8b56', 2.8);
}

function littleGrass(u: number, v: number): string {
  const [x, y] = xy(u, v);
  return `<path d="M${x - 2} ${y}l-1-3m3 3v-4m1 4 2-2" fill="none" stroke="#849064" stroke-width=".75" stroke-linecap="round"/>`;
}

function water(): string {
  const ripples: Point[] = [[0.24, 0.19], [0.7, 0.26], [0.45, 0.56], [0.8, 0.8], [0.23, 0.78]];
  return ground('#9dbfc0') + ripples.map((position, index) => {
    const [x, y] = xy(...position);
    return `<path d="M${x - 5} ${y}q3 2 6 0t6 0" fill="none" stroke="${index % 2 ? '#dce5d4' : '#719ea2'}" stroke-width="1.2" stroke-linecap="round"/>`;
  }).join('');
}

function street(connections: Connections, bridge: boolean): string {
  const { north, east, south, west } = connections;
  const z = bridge ? 4 : 0.2;
  const shape: Point[] = [
    [0.28, north ? 0 : 0.28, z], [0.72, north ? 0 : 0.28, z], [0.72, 0.28, z],
    [east ? 1 : 0.72, 0.28, z], [east ? 1 : 0.72, 0.72, z], [0.72, 0.72, z],
    [0.72, south ? 1 : 0.72, z], [0.28, south ? 1 : 0.72, z], [0.28, 0.72, z],
    [west ? 0 : 0.28, 0.72, z], [west ? 0 : 0.28, 0.28, z], [0.28, 0.28, z],
  ];
  let drawing = bridge ? water() : ground('#d4cfb9');
  if (bridge) drawing += polygon(shape.map(([u, v]) => [u + 0.035, v + 0.035, 0]), '#668d8d', 'none');
  drawing += polygon(shape, bridge ? '#bda379' : '#777e73', '#555f53', 0.85);
  const center: Point = [0.5, 0.5, z + 0.2];
  const directions: [boolean, Point][] = [
    [north, [0.5, 0, z + 0.2]], [east, [1, 0.5, z + 0.2]],
    [south, [0.5, 1, z + 0.2]], [west, [0, 0.5, z + 0.2]],
  ];
  for (const [connected, end] of directions) {
    if (connected && !bridge) drawing += line(center, end, '#e9dbab', 1, 'stroke-dasharray="3 3"');
  }
  if (!north && !east && !south && !west) {
    drawing += polygon([[0.38, 0.38, z + 0.3], [0.62, 0.38, z + 0.3], [0.62, 0.62, z + 0.3], [0.38, 0.62, z + 0.3]], 'none', '#dcd5b9', 0.8);
  }
  if (bridge) {
    const across = east || west || (!north && !south);
    const along = north || south;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      if (across && (t >= 0.28 && t <= 0.72 || t < 0.28 && west || t > 0.72 && east)) {
        drawing += line([t, 0.3, z + 0.4], [t, 0.7, z + 0.4], '#876e50', 0.75);
      }
      if (along && (t >= 0.28 && t <= 0.72 || t < 0.28 && north || t > 0.72 && south)) {
        drawing += line([0.3, t, z + 0.4], [0.7, t, z + 0.4], '#876e50', 0.75);
      }
    }
    if (across && !along) {
      const start = west ? 0.06 : 0.28;
      const end = east ? 0.94 : 0.72;
      for (const side of [0.25, 0.75]) {
        drawing += line([start, side, 3], [start, side, 12], '#786549', 1.8)
          + line([end, side, 3], [end, side, 12], '#786549', 1.8)
          + line([start, side, 11], [end, side, 11], '#e0c99c', 2);
      }
    } else if (along && !across) {
      const start = north ? 0.06 : 0.28;
      const end = south ? 0.94 : 0.72;
      for (const side of [0.25, 0.75]) {
        drawing += line([side, start, 3], [side, start, 12], '#786549', 1.8)
          + line([side, end, 3], [side, end, 12], '#786549', 1.8)
          + line([side, start, 11], [side, end, 11], '#e0c99c', 2);
      }
    }
  }
  return drawing;
}

function cottage(): string {
  return ground('#c7caa6')
    + polygon([[0.32, 0.72], [0.59, 0.72], [0.66, 1], [0.28, 1]], '#d9c9a8', 'none')
    + tree(0.12, 0.19, 0.46, true)
    + slab(0.24, 0.23, 0.58, 0.56, 29, { top: '#e2c693', left: '#f0d5a5', right: '#d5b885' })
    + frontWindow(0.3, 0.79, 12, 0.14, 8)
    + door(0.57, 0.79, 0.15, 17)
    + sideWindow(0.82, 0.35, 12, 0.16, 8)
    + gable(0.24, 0.23, 0.58, 0.56, 29, 15, '#a95e46')
    + slab(0.53, 0.31, 0.09, 0.1, 13, { top: '#c88f6b', left: '#b77c5d', right: '#805b48' }, 37)
    + littleGrass(0.86, 0.9);
}

function terrace(): string {
  let drawing = ground('#d2c5a6');
  for (const [u, color] of [[0.14, '#d99f87'], [0.5, '#d9c9a1']] as const) {
    drawing += slab(u, 0.22, 0.32, 0.6, 43, { top: '#617473', left: color, right: '#b28d77' })
      + slab(u - 0.015, 0.205, 0.35, 0.63, 4, { top: '#738680', left: '#506862', right: '#52645c' }, 43)
      + door(u + 0.09, 0.82, 0.11, 15, '#576c64')
      + frontWindow(u + 0.06, 0.82, 23, 0.09, 10)
      + frontWindow(u + 0.2, 0.82, 23, 0.08, 10)
      + slab(u + 0.07, 0.29, 0.08, 0.1, 9, { top: '#dbb791', left: '#a8836d', right: '#886a54' }, 47);
  }
  return drawing + sideWindow(0.82, 0.39, 23, 0.14, 10)
    + sideWindow(0.82, 0.62, 7, 0.1, 9);
}

function bakery(): string {
  let drawing = ground('#d9c9a7')
    + slab(0.16, 0.2, 0.68, 0.61, 29, { top: '#b7b393', left: '#f0d3a2', right: '#d4b286' })
    + frontWindow(0.23, 0.81, 5, 0.25, 15)
    + door(0.61, 0.81, 0.14, 19)
    + sideWindow(0.84, 0.4, 9, 0.18, 12)
    + gable(0.16, 0.2, 0.68, 0.61, 29, 10, '#698278');
  for (let stripe = 0; stripe < 7; stripe++) {
    const left = 0.17 + stripe * 0.096;
    const color = stripe % 2 ? '#f7e8c9' : '#b96246';
    drawing += polygon([[left, 0.815, 22], [left + 0.096, 0.815, 22], [left + 0.096, 1.015, 17], [left, 1.015, 17]], color, '#876c51', 0.35)
      + polygon([[left, 1.015, 17], [left + 0.096, 1.015, 17], [left + 0.096, 1.015, 14], [left, 1.015, 14]], color, '#876c51', 0.35);
  }
  const [x, y] = xy(0.5, 0.815, 26);
  return drawing + `<g transform="translate(${x} ${y}) rotate(29)"><ellipse rx="5.5" ry="2.7" fill="#cb9650" stroke="#8f6945" stroke-width=".65"/><path d="M-2-1l1 2M1-1l1 2" stroke="#f9df9e" stroke-width="1"/></g>`;
}

function library(): string {
  let drawing = ground('#d5c9ad')
    + slab(0.14, 0.17, 0.73, 0.63, 35, { top: '#c4b893', left: '#e5d8b6', right: '#bdae8b' })
    + slab(0.12, 0.78, 0.78, 0.2, 3, { top: '#e5d6b5', left: '#b6a98d', right: '#b3a487' })
    + door(0.43, 0.805, 0.18, 24, '#3d666a')
    + sideWindow(0.87, 0.28, 12, 0.13, 15)
    + sideWindow(0.87, 0.55, 12, 0.13, 15);
  for (const u of [0.22, 0.36, 0.67, 0.81]) {
    drawing += line([u, 0.87, 4], [u, 0.87, 29], '#afa88c', 3.2)
      + line([u - 0.018, 0.87, 5], [u - 0.018, 0.87, 29], '#f5e6c7', 1.8);
  }
  drawing += gable(0.12, 0.15, 0.78, 0.7, 35, 13, '#637974')
    + polygon([[0.41, 0.852, 37], [0.51, 0.852, 35.5], [0.51, 0.852, 41], [0.41, 0.852, 42]], '#f4e7c8')
    + polygon([[0.51, 0.852, 35.5], [0.61, 0.852, 37], [0.61, 0.852, 42], [0.51, 0.852, 41]], '#f4e7c8');
  return drawing;
}

function park(): string {
  return ground('#b7c49a')
    + `<path d="M-26 23Q-10 6 1 17T26 23" fill="none" stroke="#e5d6b6" stroke-width="6"/>`
    + tree(0.22, 0.25, 0.63, true)
    + tree(0.72, 0.29, 0.78)
    + bench(0.18, 0.77)
    + tree(0.75, 0.8, 0.53, true)
    + littleGrass(0.12, 0.63);
}

function garden(): string {
  let drawing = ground('#c5c89f');
  for (const v of [0.2, 0.57]) {
    for (const u of [0.15, 0.56]) {
      drawing += slab(u, v, 0.28, 0.23, 2, { top: '#9f7955', left: '#b69568', right: '#806447' });
      for (const offset of [0.055, 0.14, 0.225]) {
        const [x, y] = xy(u + offset, v + 0.12, 3);
        drawing += `<path d="M${x} ${y}q-5-5-1-5q4-1 1 5q1-7 4-4q2 3-4 4" fill="#658752" stroke="#476849" stroke-width=".6"/>`;
      }
    }
  }
  return drawing + line([0.06, 0.05, 3], [0.92, 0.05, 3], '#9f865d', 2)
    + `<ellipse cx="-22" cy="20" rx="3" ry="2" fill="#a77252" stroke="${INK}" stroke-width=".7"/>`;
}

function square(): string {
  const [x, y] = xy(0.5, 0.5, 5);
  return ground('#ddd1b5')
    + polygon([[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]], 'none', '#b9ad92', 0.7)
    + `<ellipse cx="${x}" cy="${y + 4}" rx="12" ry="7" fill="#c0b496" stroke="#8c927b" stroke-width="1"/>
      <ellipse cx="${x}" cy="${y}" rx="12" ry="6.5" fill="#e5dbc0" stroke="#8c927b" stroke-width="1"/>
      <ellipse cx="${x}" cy="${y}" rx="8.5" ry="4" fill="#81a9ae"/>
      <path d="M${x} ${y}v-11m-1 3q-7-8-9-1m10 1q7-8 9-1" fill="none" stroke="#608f99" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="${x}" cy="${y - 10}" r="1.5" fill="#d7e5d4"/>`
    + bench(0.08, 0.63)
    + bench(0.65, 0.2);
}

export function drawTile(tile: TileId, connections: Connections = noConnections): string {
  switch (tile) {
    case 'cottage': return cottage();
    case 'terrace': return terrace();
    case 'bakery': return bakery();
    case 'library': return library();
    case 'road': return street(connections, false);
    case 'bridge': return street(connections, true);
    case 'park': return park();
    case 'garden': return garden();
    case 'square': return square();
    case 'water': return water();
    case 'empty': return ground('#e0d5b9') + littleGrass(0.26, 0.28)
      + polygon([[0.63, 0.67], [0.76, 0.7], [0.72, 0.78]], '#c9bea1', 'none');
  }
}

export function tileIcon(tile: TileId): string {
  const connections = { ...noConnections, east: true, west: true };
  return `<svg viewBox="-43 -52 86 100" width="52" height="60" aria-hidden="true" focusable="false">${drawTile(tile, connections)}</svg>`;
}

function connectionsAt(plan: CityPlan, index: number): Connections {
  const column = index % plan.width;
  const row = Math.floor(index / plan.width);
  return {
    north: row > 0 && isStreet(plan.cells[index - plan.width]),
    east: column < plan.width - 1 && isStreet(plan.cells[index + 1]),
    south: row < plan.height - 1 && isStreet(plan.cells[index + plan.width]),
    west: column > 0 && isStreet(plan.cells[index - 1]),
  };
}

function mapDrawing(plan: CityPlan, metrics: CityMetrics, interactive: boolean, showGroups: boolean): string {
  let drawing = polygon([[0, 0, -12], [plan.width, 0, -12], [plan.width, plan.height, -12], [0, plan.height, -12]], '#cfbea0', 'none')
    + slab(0, 0, plan.width, plan.height, 8, { top: '#d2c4a3', left: '#c6b18b', right: '#bca982' }, -8);
  // Painter order keeps the front row's walls in front of the row behind it.
  for (let diagonal = 0; diagonal < plan.width + plan.height - 1; diagonal++) {
    for (let row = 0; row < plan.height; row++) {
      const column = diagonal - row;
      if (column < 0 || column >= plan.width) continue;
      const index = row * plan.width + column;
      const tile = plan.cells[index];
      const [x, y] = xy(column, row);
      drawing += `<g transform="translate(${x} ${y})"${interactive ? ` data-city-cell="${index}"` : ''}>
        <title>${escapeMarkup(`${addressOf(plan, index)} · ${tileById[tile].name}`)}</title>
        ${drawTile(tile, connectionsAt(plan, index))}`;
      if (tile === 'water') {
        const shore = (neighbor: number) => !['water', 'bridge'].includes(plan.cells[neighbor]);
        if (row > 0 && shore(index - plan.width)) drawing += line([0, 0], [1, 0], '#b4b58a', 2.4);
        if (column > 0 && shore(index - 1)) drawing += line([0, 0], [0, 1], '#b4b58a', 2.4);
        if (row + 1 < plan.height && shore(index + plan.width)) drawing += line([0, 1], [1, 1], '#b4b58a', 2.4);
        if (column + 1 < plan.width && shore(index + 1)) drawing += line([1, 0], [1, 1], '#b4b58a', 2.4);
      }
      if (showGroups && isStreet(tile)) {
        const group = metrics.groupByCell[index];
        drawing += `<g pointer-events="none"><circle cx="0" cy="13" r="10" fill="${GROUP_INKS[group % GROUP_INKS.length]}" stroke="${PAPER}" stroke-width="1.4"/>
          <text x="0" y="17" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#fff9ea">${group + 1}</text></g>`;
      }
      drawing += '</g>';
    }
  }
  return drawing;
}

function selectionDrawing(plan: CityPlan, index: number): string {
  const [x, y] = xy(index % plan.width, Math.floor(index / plan.width));
  const kind = tileById[plan.cells[index]].kind;
  const pinHeight = kind === 'building' ? 68 : kind === 'green' ? 54 : 27;
  const corners: Point[] = [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  return `<g transform="translate(${x} ${y})" pointer-events="none">
    <polygon points="${corners.map(point).join(' ')}"
      fill="none" stroke="#a7462b" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <path d="M0 ${20 - pinHeight + 6}v5" stroke="#a7462b" stroke-width="2"/>
    <circle cx="0" cy="${20 - pinHeight}" r="5.5" fill="#a7462b" stroke="#fff2d8" stroke-width="2"/>
  </g>`;
}

function compass(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="#6d7d66" stroke-width="1.1">
    <circle r="17" stroke="#b8b79b" stroke-dasharray="2 4"/>
    <path d="M-12 7 12-7M7-7h5l-2 5"/>
    <text x="17" y="-12" fill="#6d7d66" stroke="none" font-family="Georgia, serif" font-size="15">N</text>
  </g>`;
}

export function renderMap(plan: CityPlan, metrics: CityMetrics, selected: number, showGroups: boolean): string {
  const width = (plan.width + plan.height) * 36 + 96;
  const height = (plan.width + plan.height) * 20 + 135;
  const originX = plan.height * 36 + 48;
  const description = `${plan.name}. An isometric drawing of ${plan.width} columns and ${plan.height} rows. ${metrics.roadCount} street tiles in ${metrics.roadGroups.length} groups. Use the labeled column and row controls to select and edit a plot.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="city-map-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="city-map-title city-map-description">
    <title id="city-map-title">${escapeMarkup(plan.name)} — neighborhood illustration</title>
    <desc id="city-map-description">${escapeMarkup(description)}</desc>
    ${compass(width - 58, 46)}
    <g transform="translate(${originX} 72)">
      ${mapDrawing(plan, metrics, true, showGroups)}
      ${selectionDrawing(plan, selected)}
    </g>
  </svg>`;
}

export function exportIllustration(plan: CityPlan): string {
  const metrics = analyzePlan(plan);
  const width = Math.max(680, (plan.width + plan.height) * 36 + 112);
  const titleLines: string[] = [];
  const lineLength = Math.max(20, Math.floor((width - 175) / 22));
  let remaining = plan.name;
  while (remaining.length > lineLength) {
    const space = remaining.lastIndexOf(' ', lineLength);
    const split = space > lineLength / 2 ? space : lineLength;
    titleLines.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  titleLines.push(remaining);
  const extraTitleHeight = (titleLines.length - 1) * 27;
  const height = Math.max(390, (plan.width + plan.height) * 20 + 195) + extraTitleHeight;
  const mapWidth = (plan.width + plan.height) * 36;
  const originX = (width - mapWidth) / 2 + plan.height * 36;
  const titleSize = titleLines.length > 1 ? 22 : 27;
  const description = `An original, locally drawn Recipe for a City illustration. ${plan.width} × ${plan.height} plots; ${metrics.roadCount} street and bridge tiles in ${metrics.roadGroups.length} road groups; ${metrics.buildingsWithFrontage} of ${metrics.buildingCount} building tiles have street frontage. A toy model, not real urban planning advice.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="city-print-title city-print-description">
  <title id="city-print-title">${escapeMarkup(plan.name)}</title>
  <desc id="city-print-description">${escapeMarkup(description)}</desc>
  <metadata>${escapeMarkup(serializePlan(plan))}</metadata>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#b5ad90" stroke-width="1"/>
  <text fill="#304c40" font-family="Georgia, serif" font-size="${titleSize}">${titleLines.map((line, index) => `<tspan x="34" y="${47 + index * 27}">${escapeMarkup(line)}</tspan>`).join('')}</text>
  <text x="35" y="${68 + extraTitleHeight}" fill="#68755e" font-family="Georgia, serif" font-size="13">RECIPE FOR A CITY · AN ORIGINAL LITTLE NEIGHBORHOOD</text>
  ${compass(width - 65, 63)}
  <g transform="translate(${originX} ${111 + extraTitleHeight})">${mapDrawing(plan, metrics, false, false)}</g>
  <line x1="34" y1="${height - 47}" x2="${width - 34}" y2="${height - 47}" stroke="#b5ad90"/>
  <text x="35" y="${height - 26}" fill="#4c6352" font-family="Georgia, serif" font-size="12">${plan.width} × ${plan.height} plots · ${metrics.roadCount} street tiles · ${metrics.roadGroups.length} road ${metrics.roadGroups.length === 1 ? 'group' : 'groups'} · A toy, not planning advice.</text>
</svg>`;
}
