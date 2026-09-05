import { escapeMarkup } from '../../core/page';
import { clamp } from '../../core/math';
import { MAP_HEIGHT, MAP_WIDTH, routesAtStation, validateNetwork } from './engine';
import type { Network, Route, Station } from './engine';

interface Point { x: number; y: number }

export interface MapOptions {
  selectedStation?: string;
  selectedRoute?: string;
  grid?: boolean;
  interactive?: boolean;
}

export function routeNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join('/');
}

function segmentPoints(start: Point, end: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return [start, end];
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  return [start, {
    x: end.x - Math.sign(dx) * diagonal,
    y: end.y - Math.sign(dy) * diagonal,
  }, end];
}

function routePaths(network: Network, route: Route): string[] {
  const stations = new Map(network.stations.map((station) => [station.id, station]));
  return route.stops.slice(1).map((id, index) => {
    const start = stations.get(route.stops[index])!;
    const end = stations.get(id)!;
    const key = edgeKey(start.id, end.id);
    const sharing = network.routes.filter((candidate) => candidate.stops.some((stop, stopIndex) =>
      stopIndex > 0 && edgeKey(candidate.stops[stopIndex - 1], stop) === key));
    const offset = (sharing.findIndex((candidate) => candidate.id === route.id) - (sharing.length - 1) / 2) * 10;
    let points = segmentPoints(start, end);
    if (offset !== 0) {
      // Use a canonical direction so opposite-running routes keep separate, stable lanes.
      const direction = start.id < end.id ? 1 : -1;
      const distance = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const ox = -(end.y - start.y) / distance * offset * direction;
      const oy = (end.x - start.x) / distance * offset * direction;
      points = [start, ...points.map((point) => ({ x: point.x + ox, y: point.y + oy })), end];
    }
    return points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${number(point.x)} ${number(point.y)}`).join(' ');
  });
}

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const letters = (text: string) => Array.from(characters.segment(text), (item) => item.segment);

function wrapName(name: string, maximum = 17): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && letters(`${line} ${word}`).length > maximum) {
      lines.push(line);
      line = '';
    }
    const remaining = letters(word);
    while (remaining.length > maximum) {
      if (line) { lines.push(line); line = ''; }
      lines.push(remaining.splice(0, maximum).join(''));
    }
    if (remaining.length) line = [line, remaining.join('')].filter(Boolean).join(' ');
  }
  if (line) lines.push(line);
  return lines;
}

function stationLabel(station: Station): string {
  const lines = wrapName(station.name);
  // Explicit text lengths make edge placement safe even with wide glyphs or font fallbacks.
  const widths = lines.map((line) => letters(line).reduce((sum, letter) => {
    if (/^[MW@%]$/.test(letter)) return sum + 16;
    if (/^[ilI.,'!:;|\s]$/.test(letter)) return sum + 5;
    if (/^[A-Z0-9]$/.test(letter)) return sum + 11;
    return sum + (/^[\u0020-\u024f]$/.test(letter) ? 9 : 17);
  }, 0));
  const width = Math.max(...widths);
  let x = station.x;
  let y = station.y;
  let anchor = 'middle';
  const left = station.label === 'left' || station.label.endsWith('-left');
  const right = station.label === 'right' || station.label.endsWith('-right');
  const above = station.label.startsWith('above');
  const below = station.label.startsWith('below');
  if (above) y -= (left || right ? 17 : 23) + (lines.length - 1) * 19;
  else if (below) y += left || right ? 25 : 31;
  else y += 6 - (lines.length - 1) * 9;
  if (right) {
    x = clamp(x + 22, 24, MAP_WIDTH - 24 - width);
    anchor = 'start';
  }
  if (left) {
    x = clamp(x - 22, width + 24, MAP_WIDTH - 24);
    anchor = 'end';
  }
  if (anchor === 'middle') x = clamp(x, 24 + width / 2, MAP_WIDTH - 24 - width / 2);
  y = clamp(y, 116, 594 - (lines.length - 1) * 19);
  return `<text x="${number(x)}" y="${number(y)}" text-anchor="${anchor}" font-size="17" font-weight="600" fill="#26382f" stroke="#f7f3e8" stroke-width="5" stroke-linejoin="round" paint-order="stroke" pointer-events="none">${lines.map((line, index) =>
    `<tspan x="${number(x)}" dy="${index === 0 ? 0 : 19}" textLength="${number(widths[index])}" lengthAdjust="spacingAndGlyphs">${escapeMarkup(line)}</tspan>`).join('')}</text>`;
}

export function mapContents(network: Network, options: MapOptions = {}): string {
  const routeMarkup = network.routes.map((route) => {
    const paths = routePaths(network, route);
    const selected = options.selectedRoute === route.id;
    return paths.map((path) => `
      <path d="${path}" fill="none" stroke="#f7f3e8" stroke-width="${selected ? 18 : 16}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>
      <path ${options.interactive ? `data-map-route="${route.id}" class="tw-route-path"` : ''} d="${path}" fill="none" stroke="${route.color}" stroke-width="${selected ? 11 : 9}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }).join('');
  const stationMarkup = network.stations.map((station) => {
    const routes = routesAtStation(network, station.id);
    const interchange = routes.length > 1;
    const selected = options.selectedStation === station.id;
    const membership = routes.length ? routes.map((route) => route.name).join(', ') : 'not on a route';
    const attributes = options.interactive
      ? `class="tw-station" data-station="${station.id}" data-focus-key="station:${station.id}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${escapeMarkup(`${station.name}. ${membership}. Enter to select; arrow keys to move.`)}"`
      : '';
    return `<g ${attributes}>
      <title>${escapeMarkup(`${station.name} — ${membership}`)}</title>
      ${selected ? `<circle cx="${station.x}" cy="${station.y}" r="23" fill="#f7f3e8" fill-opacity=".82" stroke="#26382f" stroke-width="1.5" stroke-dasharray="3 4" pointer-events="none"/>` : ''}
      <circle cx="${station.x}" cy="${station.y}" r="${interchange ? 11 : 7}" fill="#f7f3e8" stroke="${interchange || !routes.length ? '#26382f' : routes[0].color}" stroke-width="3" pointer-events="none"/>
      ${interchange ? `<circle cx="${station.x}" cy="${station.y}" r="3" fill="#26382f" pointer-events="none"/>` : ''}
      ${stationLabel(station)}
      ${options.interactive ? `<circle class="tw-focus-ring" cx="${station.x}" cy="${station.y}" r="26" fill="none" stroke="transparent" stroke-width="3" pointer-events="none"/><circle class="tw-station-hit" cx="${station.x}" cy="${station.y}" r="28" fill="transparent"/>` : ''}
    </g>`;
  }).join('');
  return `
    <title>${escapeMarkup(network.city)} — an imaginary transit network</title>
    <desc>Fictional city. Lines connect stations in their explicit stop order. Crossing lines only connect where they share a station.</desc>
    <defs><pattern id="transit-paper-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="0.8" cy="0.8" r=".8" fill="#829785" opacity=".33"/></pattern></defs>
    <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#f7f3e8"/>
    <g font-family="Arial, Helvetica, sans-serif">
      <text x="42" y="48" font-size="31" font-weight="700" letter-spacing="-1" fill="#26382f" ${Array.from(network.city).length > 24 ? 'textLength="680" lengthAdjust="spacingAndGlyphs"' : ''}>${escapeMarkup(network.city)}</text>
      <text x="43" y="72" font-size="13" letter-spacing="1.6" fill="#5e6b60">IMAGINARY TRANSIT AUTHORITY</text>
      <text x="958" y="43" text-anchor="end" font-size="13" letter-spacing="1.2" fill="#5e6b60">SYSTEM MAP</text>
      <text x="958" y="65" text-anchor="end" font-size="13" fill="#5e6b60">Schematic · not for navigation</text>
      <path d="M42 90 H958" stroke="#cfd1bf"/>
      ${options.grid ? '<rect x="60" y="108" width="880" height="502" fill="url(#transit-paper-grid)"/>' : ''}
      <path d="M851 108 C793 183 868 264 839 337 S851 470 919 605" fill="none" stroke="#dfe8e0" stroke-width="49" opacity=".85"/>
      <path d="M851 108 C793 183 868 264 839 337 S851 470 919 605" fill="none" stroke="#b6cec2" stroke-width="1"/>
      <text x="891" y="522" transform="rotate(66 891 522)" font-family="Georgia, serif" font-style="italic" font-size="16" fill="#55776d">The Hushwater</text>
      <text x="99" y="260" font-size="13" letter-spacing="3" fill="#858d79">THE FOUNDRIES</text>
      <text x="571" y="244" font-size="13" letter-spacing="3" fill="#858d79">HIGH GARDENS</text>
      <text x="155" y="495" font-size="13" letter-spacing="3" fill="#858d79">CINDER WARD</text>
      ${routeMarkup}
      ${stationMarkup}
      ${network.stations.length ? '' : '<text x="500" y="352" text-anchor="middle" font-size="21" fill="#5e6b60">A new city starts with one station.</text>'}
      <path d="M42 615 H958" stroke="#cfd1bf"/>
      <circle cx="51" cy="638" r="6" fill="#f7f3e8" stroke="#26382f" stroke-width="2"/>
      <text x="67" y="643" font-size="14" fill="#5e6b60">Station</text>
      <circle cx="173" cy="638" r="9" fill="#f7f3e8" stroke="#26382f" stroke-width="2"/>
      <circle cx="173" cy="638" r="2.5" fill="#26382f"/>
      <text x="191" y="643" font-size="14" fill="#5e6b60">Interchange</text>
      <text x="958" y="643" text-anchor="end" font-size="13" letter-spacing="1" fill="#5e6b60">A MAP OF NOWHERE. MADE BY YOU.</text>
    </g>`;
}

export function serializeSvg(source: Network): string {
  const network = validateNetwork(source);
  const legendRows = Math.max(1, Math.ceil(network.routes.length / 2));
  const names = network.routes.map((route) => wrapName(route.name, 22));
  const rowHeights = Array.from({ length: legendRows }, (_, index) =>
    Math.max(names[index * 2]?.length ?? 1, names[index * 2 + 1]?.length ?? 1) * 21 + 37);
  const legendHeight = 116 + rowHeights.reduce((sum, height) => sum + height, 0);
  const height = MAP_HEIGHT + legendHeight;
  const legend = network.routes.map((route, index) => {
    const x = 44 + (index % 2) * 465;
    const y = MAP_HEIGHT + 74 + rowHeights.slice(0, Math.floor(index / 2)).reduce((sum, height) => sum + height, 0);
    const lines = names[index];
    return `<g>
      <title>${escapeMarkup(route.name)}</title>
      <path d="M${x} ${y} h38" stroke="${route.color}" stroke-width="9" stroke-linecap="round"/>
      <text x="${x + 19}" y="${y + 27}" text-anchor="middle" font-size="13" font-weight="700" fill="#26382f">${routeNumber(index)}</text>
      <text x="${x + 52}" y="${y + 6}" font-size="18" font-weight="700" fill="#26382f">${lines.map((line, lineIndex) => `<tspan x="${x + 52}" dy="${lineIndex === 0 ? 0 : 21}">${escapeMarkup(line)}${lineIndex < lines.length - 1 ? ' ' : ''}</tspan>`).join('')}</text>
      <text x="${x + 52}" y="${y + 27 + (lines.length - 1) * 21}" font-size="14" fill="#5e6b60">${route.stops.length} ${route.stops.length === 1 ? 'stop' : 'stops'}${route.stops.length < 2 ? ' · not connected yet' : ''}</text>
    </g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${height}" viewBox="0 0 ${MAP_WIDTH} ${height}" role="img" aria-label="${escapeMarkup(`${network.city}: fictional transit map with route legend`)}">
  <rect width="${MAP_WIDTH}" height="${height}" fill="#f7f3e8"/>
  ${mapContents(network)}
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="44" y="${MAP_HEIGHT + 32}" font-size="13" letter-spacing="2" fill="#5e6b60">ROUTE LEGEND</text>
    ${legend || `<text x="44" y="${MAP_HEIGHT + 78}" font-size="18" fill="#26382f">No routes — an unconnected city in progress.</text>`}
    <text x="44" y="${height - 23}" font-size="13" fill="#5e6b60">Made with Transit Weaver · Original fictional geography · Connections, not real-world distances</text>
  </g>
</svg>`;
}
