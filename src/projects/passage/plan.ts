import { escapeMarkup } from '../../core/page';
import { doorRect, floorOf, portalPath, solidsOn } from './world';
import type { Endpoint, Layout, Point, Rect } from './world';
import type { Pose, Route } from './route';
import { floorAt } from './search';

const e = escapeMarkup;
const box = (rect: Rect, attributes: string) => `<rect x="${rect.x}" y="${rect.z}" width="${rect.w}" height="${rect.d}" ${attributes}/>`;
function marker(point: Endpoint, letter: string, color: string) {
  return `<g transform="translate(${point.x} ${point.z})"><circle r=".65" fill="${color}" stroke="#fffaf0" stroke-width=".15"/><text y=".23" text-anchor="middle" font-size=".7" font-weight="700" fill="#fffaf0">${letter}</text></g>`;
}
export function planMarkup(layout: Layout, floorId: string, route: Route | null, options: { clearance?: boolean; selected?: string } = {}): string {
  const { world } = layout, floor = floorOf(world, floorId), radius = layout.profile.radius + layout.profile.margin;
  const solids = solidsOn(world, floorId);
  const content: string[] = [
    `<title>${e(floor.name)} floor plan of ${e(world.name)}</title>`,
    `<desc>North is up. All dimensions are metres. Dark shapes are occupied. Real wall openings are green when open and vermilion when closed. A is the start; B is the destination. The route respects the selected clearance.</desc>`,
    `<rect x="-1" y="-1" width="${world.width + 2}" height="${world.depth + 2}" fill="#f6f2e8"/>`,
    box({ x: 0, z: 0, w: world.width, d: world.depth }, `fill="#ece5d6" stroke="#918979" stroke-width=".06"`),
  ];
  for (const room of world.rooms.filter((room) => room.floor === floorId)) {
    content.push(box(room, `fill="${floor.color}" fill-opacity=".4"`));
  }
  if (options.clearance) for (const solid of solids) {
    content.push(box({ x: solid.x - radius, z: solid.z - radius, w: solid.w + 2 * radius, d: solid.d + 2 * radius },
      `rx="${radius}" fill="#be4d35" fill-opacity=".14" stroke="#be4d35" stroke-width=".035" stroke-dasharray=".1 .12"`));
  }
  for (const solid of solids) {
    const color = solid.kind === 'void' ? '#fcfaf4' : solid.kind === 'shaft' ? '#d9d3c4' : solid.kind === 'obstacle' ? '#9a896e' : solid.kind === 'door' ? '#bd442c' : '#464b3e';
    content.push(box(solid, `fill="${color}" ${solid.id === options.selected ? 'stroke="#bd442c" stroke-width=".18"' : ''}`));
    if (solid.kind === 'void') {
      content.push(`<path d="M${solid.x},${solid.z} l${solid.w},${solid.d} M${solid.x + solid.w},${solid.z} l${-solid.w},${solid.d}" stroke="#c1baa9" stroke-width=".05"/>`);
      content.push(`<text x="${solid.x + solid.w / 2}" y="${solid.z + solid.d / 2 + .2}" font-size=".6" text-anchor="middle" fill="#656958">OPEN TO BELOW</text>`);
    }
  }
  for (const room of world.rooms.filter((room) => room.floor === floorId)) {
    const words = room.name.split(' '), middle = Math.ceil(words.length / 2), x = room.x + room.w / 2, z = room.z + room.d / 2 + 1.3;
    content.push(`<text x="${x}" y="${z}" text-anchor="middle" font-size=".78" font-weight="600" fill="#30382e" stroke="#f6f2e8" stroke-width=".09" paint-order="stroke">${e(words.slice(0, middle).join(' '))}<tspan x="${x}" dy=".9">${e(words.slice(middle).join(' '))}</tspan></text>`);
  }
  if (floorId === 'g') content.push('<text x="13" y="10.3" text-anchor="middle" font-size=".65" fill="#fffaf0">FERN COURT</text>');
  for (const door of world.doors) {
    const wall = world.walls.find((wall) => wall.id === door.wall)!;
    if (wall.floor !== floorId) continue;
    const rect = doorRect(wall, door), centerX = rect.x + rect.w / 2, centerZ = rect.z + rect.d / 2;
    content.push(`<g><title>${e(door.name)}: ${door.width.toFixed(2)} m, ${door.open ? 'open' : 'closed'}</title>`);
    content.push(box(rect, `fill="${door.open ? '#638365' : '#bd442c'}" fill-opacity="${door.open ? '.23' : '1'}"`));
    content.push(`<path d="M${centerX - .2},${centerZ - .2} l.4,.4 m0,-.4 l-.4,.4" stroke="${door.open ? '#406445' : '#fffaf0'}" stroke-width=".07"/></g>`);
  }
  const seen = new Set<string>();
  for (const portal of world.portals.filter((portal) => portal.from === floorId || portal.to === floorId)) {
    const key = `${portal.kind}-${portal.x}-${portal.z}`;
    const path = portalPath(world, portal);
    const color = portal.open ? '#4f6351' : '#bd442c';
    if (!seen.has(key)) {
      seen.add(key);
      if (portal.kind === 'stairs') {
        for (let z = portal.z + 1; z < portal.z + portal.d; z += .35) {
          content.push(`<path d="M${portal.x + .25},${z} h${portal.w / 2 - .5} M${portal.x + portal.w / 2 + .25},${z} h${portal.w / 2 - .5}" stroke="#6e725f" stroke-width=".07"/>`);
        }
      } else content.push(box({ x: portal.x + .2, z: portal.z + .2, w: portal.w - .4, d: portal.d - .4 }, 'fill="none" stroke="#6e725f" stroke-width=".08"'));
      content.push(`<text x="${portal.x + portal.w / 2}" y="${portal.z + .65}" text-anchor="middle" font-size=".55" font-weight="700" fill="#4f6351">${portal.kind === 'stairs' ? 'STAIR N' : 'LIFT S'}</text>`);
    }
    for (const p of [path[0], path[path.length - 1]].filter((p) => Math.abs(p.y - floor.elevation) < .01)) {
      const upward = portal.from === floorId;
      content.push(`<g><title>${e(portal.name)}: ${portal.open ? 'open' : 'closed'}, ${portal.width.toFixed(2)} m clear</title><circle cx="${p.x}" cy="${p.z}" r=".18" fill="${color}"/>`);
      const labelX = portal.kind === 'lift' ? p.x - .5 : p.x, labelZ = portal.kind === 'lift' ? p.z + (upward ? .7 : -.45) : p.z + .65;
      content.push(`<text x="${labelX}" y="${labelZ}" font-size=".48" font-weight="600" text-anchor="middle" fill="${color}">${upward ? 'UP' : 'DOWN'}${portal.open ? '' : ' CLOSED'}</text></g>`);
    }
  }
  if (route) for (const segment of route.segments) {
    if (segment.distance === 0) continue;
    if (Math.abs(segment.from.y - floor.elevation) < .01 && Math.abs(segment.to.y - floor.elevation) < .01) {
      const points = `${segment.from.x},${segment.from.z} ${segment.to.x},${segment.to.z}`;
      content.push(`<polyline points="${points}" fill="none" stroke="#fffaf0" stroke-width=".38" stroke-linecap="round"/>`);
      content.push(`<polyline points="${points}" fill="none" stroke="#c64228" stroke-width=".19" stroke-linecap="round"/>`);
    }
  }
  if (layout.start.floor === floorId) content.push(marker(layout.start, 'A', '#c64228'));
  if (layout.end.floor === floorId) content.push(marker(layout.end, 'B', '#485b3c'));
  content.push(`<g data-passage-plan-pose visibility="hidden"><circle r="${radius}" fill="#f2cb65" fill-opacity=".6" stroke="#242e27" stroke-width=".09"/><path data-passage-heading d="M0,${-radius * .8} l${radius * .5},${radius * 1.2} l${-radius},0 Z" fill="#242e27"/></g>`);
  content.push('<g data-passage-cursor visibility="hidden"><circle r=".4" fill="none" stroke="#254e76" stroke-width=".1"/><path d="M-.6,0 H.6 M0,-.6 V.6" stroke="#254e76" stroke-width=".05"/></g>');
  content.push(`<path d="M.5,${world.depth + .3} v.35 h5 v-.35" fill="none" stroke="#464b3e" stroke-width=".07"/><text x="6" y="${world.depth + .8}" font-size=".5" fill="#464b3e">5 m</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${world.width + 2} ${world.depth + 2}" role="img" aria-label="${e(floor.name)} navigable floor plan" font-family="Arial, sans-serif">${content.join('')}</svg>`;
}
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Pick<Point, 'x' | 'z'> {
  const matrix = svg.getScreenCTM();
  if (!matrix) throw new Error('The floor plan has no screen transform.');
  const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: local.x, z: local.y };
}
export function updatePlanPose(host: HTMLElement, layout: Layout, floor: string, pose: Pose | null) {
  const marker = host.querySelector<SVGGElement>('[data-passage-plan-pose]');
  if (!marker) return;
  const visible = pose !== null && floorAt(layout.world, pose.point) === floor;
  marker.setAttribute('visibility', visible ? 'visible' : 'hidden');
  if (pose) {
    marker.setAttribute('transform', `translate(${pose.point.x} ${pose.point.z})`);
    const heading = marker.querySelector<SVGPathElement>('[data-passage-heading]');
    if (heading) {
      heading.setAttribute('transform', `rotate(${Math.atan2(pose.direction.x, -pose.direction.z) * 180 / Math.PI})`);
      heading.setAttribute('visibility', Math.hypot(pose.direction.x, pose.direction.z) > .01 ? 'inherit' : 'hidden');
    }
  }
}
